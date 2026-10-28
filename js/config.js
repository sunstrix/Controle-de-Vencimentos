/**
 * Controle de Vencimentos CP FANI - Configuração
 * 
 * Este arquivo contém:
 * - URL do Google Apps Script Web App
 * - Constantes de timeout, retry e mensagens
 * - Helper `apiRequest()` unificado para todas as páginas
 *   (usa AbortController, retry em falha de rede, trata resposta não-JSON)
 */

// ============================================================
// URL DO WEB APP
// ============================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKATLnYSbBoc1Ndf8VoOjWrqYTCejCbwhz-sIuMxwDhawVIwlR21l5q_sb8qmT-6qiSg/exec";

// ============================================================
// CONFIGURAÇÕES GLOBAIS
// ============================================================
const CONFIG = {
  // Versão do front-end (para rastreamento em logs)
  VERSION: "2.0.0",

  // Tempo máximo de espera por requisição (ms) — usado pelo AbortController
  TIMEOUT: 15000,
  
  // A4: Tempo máximo de espera para POST (cold start do Apps Script pode demorar)
  TIMEOUT_POST: 30000,

  // Número máximo de tentativas em caso de falha de rede
  MAX_RETRIES: 2,

  // Tempo entre tentativas de retry (ms)
  RETRY_DELAY: 1000,

  // Mensagens de feedback (centralizadas para consistência PT-BR)
  MENSAGENS: {
    ERRO_CONEXAO: "Erro de conexão com o servidor. Verifique sua internet e tente novamente.",
    ERRO_TIMEOUT: "Tempo de resposta excedido. Verifique sua conexão e tente novamente.",
    ERRO_SERVIDOR: "Erro no servidor. Tente novamente em alguns segundos.",
    ERRO_PARSE: "Resposta inválida do servidor. Tente novamente.",
    ERRO_REDE: "Sem conexão com a internet.",
    SUCESSO: "Operação realizada com sucesso!",
    SERVIDOR_OCUPADO: "Servidor ocupado. Tente novamente em alguns segundos."
  },

  // Ações disponíveis no backend (usadas como parâmetro `action`)
  ACOES: {
    LEGADO: "",           // GET sem action: lojas + projetos + todos registros
    REGISTROS: "registros", // GET ?action=registros&loja=X
    PRODUTOS: "produtos",   // GET ?action=produtos
    BAIXAS: "baixas",       // GET ?action=baixas
    BASE: "base",           // GET ?action=base (P1)
    REGISTRAR: "registrar", // POST (padrão)
    SALVAR_PRODUTO: "salvarProduto",
    SALVAR_PRODUTOS_LOTE: "salvarProdutosLote", // P2
    DAR_BAIXA: "darBaixa"
  }
};

// ============================================================
// HELPERS DE CONTROLE E SEGURANÇA (A4)
// ============================================================

/**
 * Gera um UUID v4 simples para idempotência (request_id)
 */
function gerarRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================
// HELPER DE URL
// ============================================================

/**
 * Monta URL completa do Apps Script com parâmetros de query string.
 * Exemplo: buildUrl('registros', { loja: 'Loja 01' })
 *   => "https://script.../exec?action=registros&loja=Loja%2001"
 */
function buildUrl(action, params) {
  var url = APPS_SCRIPT_URL;
  var qs = [];
  if (action) qs.push("action=" + encodeURIComponent(action));
  if (params) {
    for (var key in params) {
      if (params.hasOwnProperty(key) && params[key] !== undefined && params[key] !== null) {
        qs.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    }
  }
  if (qs.length > 0) url += (url.indexOf("?") === -1 ? "?" : "&") + qs.join("&");
  return url;
}

// ============================================================
// HELPER DE REQUISIÇÃO (com AbortController, retry e tratamento)
// ============================================================

/**
 * Faz requisição ao Apps Script com timeout, retry e tratamento robusto.
 *
 * @param {string} [action]  - ação (CONFIG.ACOES.*) — vazio para GET legado
 * @param {Object} [body]    - payload para POST (se omitido, faz GET)
 * @param {Object} [extraParams] - parâmetros extras para query string (ex: { loja: 'X' })
 * @returns {Promise<Object>} - { ok: true, ... } ou { ok: false, mensagem: '...' }
 *
 * Comportamento:
 * - GET: usa URL com query string. Não envia corpo.
 * - POST: envia JSON.stringify(body) com action incluído no corpo.
 *          Importante: NÃO envia Content-Type: application/json
 *          (evita preflight CORS que o Apps Script não trata).
 * - Retry automático apenas em falha de rede/timeout (até MAX_RETRIES).
 *   Erros de validação retornados pelo servidor (ok:false) NÃO dão retry.
 * - Resposta não-JSON (HTML de erro do Google, quota excedida etc.)
 *   é detectada e devolvida como erro claro, não como exceção de parse.
 */
async function apiRequest(action, body, extraParams) {
  var isPost = !!body;
  var url = buildUrl(action, extraParams);
  var lastError = null;
  var attempts = isPost ? 1 : (CONFIG.MAX_RETRIES + 1); // POST não tem retry automático (idempotência manual)
  var mensagens = CONFIG.MENSAGENS;

  for (var tentativa = 1; tentativa <= attempts; tentativa++) {
    var controller = new AbortController();
    // A4: Timeout estendido para POST (cold start)
    var tempoTimeout = isPost ? CONFIG.TIMEOUT_POST : CONFIG.TIMEOUT;
    var timeoutId = setTimeout(function () { controller.abort(); }, tempoTimeout);

    try {
      var fetchOptions = {
        method: isPost ? "POST" : "GET",
        signal: controller.signal
      };

      if (isPost) {
        // Inclui action no corpo e NÃO define Content-Type para evitar preflight CORS
        var payload = Object.assign({}, body, { action: action || CONFIG.ACOES.REGISTRAR });
        fetchOptions.body = JSON.stringify(payload);
        // Nota: omitimos headers["Content-Type"] propositalmente.
        // O Apps Script recebe como text/plain e faz JSON.parse no postData.contents.
      }

      var response = await fetch(url, fetchOptions);

      // Apps Script pode retornar HTML (quota, erro 500) em vez de JSON.
      // Precisamos inspecionar o Content-Type antes de fazer response.json().
      var contentType = response.headers.get("content-type") || "";
      var texto = await response.text();
      var data;

      if (contentType.indexOf("application/json") !== -1) {
        try {
          data = JSON.parse(texto);
        } catch (parseErr) {
          data = { ok: false, mensagem: mensagens.ERRO_PARSE };
        }
      } else {
        // HTML de erro do Google (ex: quota excedida) — extrai mensagem útil se possível
        var matchMsg = texto.match(/<title>([^<]+)<\/title>/i);
        data = {
          ok: false,
          mensagem: (matchMsg && matchMsg[1]) ? matchMsg[1] : mensagens.ERRO_SERVIDOR
        };
      }

      // Garante que sempre temos a chave `ok`
      if (typeof data.ok !== "boolean") {
        data.ok = false;
        if (!data.mensagem) data.mensagem = mensagens.ERRO_SERVIDOR;
      }

      return data; // Retorno bem-sucedido (mesmo que ok:false por validação do servidor)

    } catch (err) {
      lastError = err;
      var isAbort = err.name === "AbortError" || /aborted/i.test(err.message || "");
      var isNetwork = /fetch|network|failed to fetch|offline/i.test(err.message || "");

      // Timeout
      if (isAbort) {
        lastError = new Error(mensagens.ERRO_TIMEOUT);
      }
      // Rede
      else if (isNetwork && !navigator.onLine) {
        lastError = new Error(mensagens.ERRO_REDE);
      }
      // Outro erro de rede
      else if (isNetwork) {
        lastError = new Error(mensagens.ERRO_CONEXAO);
      }
      // Erro inesperado
      else {
        lastError = new Error(err.message || mensagens.ERRO_SERVIDOR);
      }

      // Se ainda há tentativas e é erro de rede/timeout em GET, espera e tenta de novo
      if (tentativa < attempts && (isAbort || isNetwork)) {
        await new Promise(function (r) { setTimeout(r, CONFIG.RETRY_DELAY); });
        continue;
      }
      // Senão, sai do loop para devolver o erro
      break;

    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Se chegou aqui, todas as tentativas falharam
  return {
    ok: false,
    mensagem: lastError ? lastError.message : mensagens.ERRO_SERVIDOR
  };
}

// ============================================================
// HELPERS DE CONVENIÊNCIA (atalhos para chamadas comuns)
// ============================================================

/**
 * GET legado: lojas + projetos + todos os registros (dashboard/relatórios)
 */
function apiGetTudo() {
  return apiRequest();
}

/**
 * P1: GET base (lojas + produtos simplificados) — ideal para o formulário
 */
function apiGetBase() {
  return apiRequest(CONFIG.ACOES.BASE);
}

/**
 * GET registros de uma loja específica (painel R1 do formulário)
 */
function apiGetRegistrosPorLoja(loja) {
  return apiRequest(CONFIG.ACOES.REGISTROS, null, { loja: loja });
}

/**
 * GET lista de produtos (página de cadastro)
 */
function apiGetProdutos() {
  return apiRequest(CONFIG.ACOES.PRODUTOS);
}

/**
 * GET histórico de baixas
 */
function apiGetBaixas() {
  return apiRequest(CONFIG.ACOES.BAIXAS);
}

/**
 * POST registrar/somar lote
 */
function apiRegistrarLote(payload) {
  return apiRequest(CONFIG.ACOES.REGISTRAR, payload);
}

/**
 * POST salvar produto
 */
function apiSalvarProduto(payload) {
  return apiRequest(CONFIG.ACOES.SALVAR_PRODUTO, payload);
}

/**
 * P2: POST salvar produtos em lote
 */
function apiSalvarProdutosLote(payload) {
  return apiRequest(CONFIG.ACOES.SALVAR_PRODUTOS_LOTE, payload);
}

/**
 * POST dar baixa
 */
function apiDarBaixa(payload) {
  return apiRequest(CONFIG.ACOES.DAR_BAIXA, payload);
}