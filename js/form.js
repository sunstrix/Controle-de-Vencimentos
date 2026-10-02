/**
 * Controle de Vencimentos CP FANI - Lógica do Formulário (form.js)
 *
 * Responsável por:
 * - Carregar lojas e projetos do Google Apps Script.
 * - Validar e filtrar a digitação do código do projeto (apenas números).
 * - Realizar o "PROCV" localmente para exibir a descrição do projeto.
 * - Validar e enviar o formulário para o backend.
 */

// ============================================================
// 1. SELEÇÃO DE ELEMENTOS DO DOM
// ============================================================
const elForm = document.getElementById('form-vencimento');
const elLoja = document.getElementById('loja');
const elCodigo = document.getElementById('codigo_projeto');
const elDescricao = document.getElementById('descricao_projeto');
const elQuantidade = document.getElementById('quantidade');
const elMes = document.getElementById('mes_vencimento');
const elBtnEnviar = document.getElementById('btn-enviar');
const elBtnTexto = document.getElementById('btn-texto');
const elBtnLoading = document.getElementById('btn-loading');
const elMensagem = document.getElementById('mensagem');
const elAnoAtual = document.getElementById('ano-atual');

// Variáveis em memória para cache dos dados
let projetosCache = {};
let lojasCache = [];

// ============================================================
// 2. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Atualizar ano no rodapé
  if (elAnoAtual) {
    elAnoAtual.textContent = new Date().getFullYear();
  }

  // Definir mês mínimo no input (mês atual)
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  elMes.setAttribute('min', `${ano}-${mes}`);

  // Carregar dados iniciais (lojas e projetos)
  carregarDadosIniciais();
});

// ============================================================
// 3. CARREGAMENTO DE DADOS (GET)
// ============================================================
async function carregarDadosIniciais() {
  mostrarEstadoCarregamento(true);

  try {
    const response = await fetch(APPS_SCRIPT_URL);
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.mensagem || 'Erro ao carregar dados do servidor.');
    }

    // Popular cache
    projetosCache = data.projetos || {};
    lojasCache = data.lojas || [];

    // Popular select de lojas
    popularLojas(lojasCache);

  } catch (error) {
    console.error('Erro no carregamento inicial:', error);
    mostrarMensagem('Erro ao carregar dados. Verifique sua conexão e recarregue a página.', 'erro');
  } finally {
    mostrarEstadoCarregamento(false);
  }
}

function popularLojas(lojas) {
  elLoja.innerHTML = '<option value="">Selecione a loja...</option>';
  lojas.forEach(loja => {
    const option = document.createElement('option');
    option.value = loja;
    option.textContent = loja;
    elLoja.appendChild(option);
  });
}

// ============================================================
// 4. LÓGICA DO CAMPO "CÓDIGO DO PROJETO" (PROCV LOCAL)
// ============================================================
elCodigo.addEventListener('input', (e) => {
  // Bloquear qualquer caractere que não seja número
  const valorLimpo = e.target.value.replace(/\D/g, '');
  
  // Atualizar o valor apenas se houve mudança (evita pular cursor)
  if (e.target.value !== valorLimpo) {
    e.target.value = valorLimpo;
  }

  // Buscar descrição no cache (PROCV)
  if (valorLimpo.trim() === '') {
    elDescricao.textContent = '';
    elDescricao.className = 'form-hint';
    return;
  }

  const descricao = projetosCache[valorLimpo];

  if (descricao) {
    elDescricao.textContent = `Descrição: ${descricao}`;
    elDescricao.className = 'form-hint encontrado';
  } else {
    elDescricao.textContent = '⚠️ Código não cadastrado. A descrição será gravada como "Código não cadastrado".';
    elDescricao.className = 'form-hint nao-encontrado';
  }
});

// ============================================================
// 5. ENVIO DO FORMULÁRIO (POST)
// ============================================================
elForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Validação básica de campos obrigatórios
  if (!elForm.checkValidity()) {
    elForm.reportValidity();
    return;
  }

  // Validação adicional: código deve ter pelo menos 1 dígito
  const codigo = elCodigo.value.trim();
  if (codigo === '') {
    mostrarMensagem('O código do projeto é obrigatório.', 'erro');
    return;
  }

  // Preparar payload
  const descricaoTexto = elDescricao.classList.contains('encontrado') 
    ? projetosCache[codigo] 
    : 'Código não cadastrado';

  const payload = {
    loja: elLoja.value,
    codigo_projeto: codigo,
    descricao_projeto: descricaoTexto,
    quantidade: parseInt(elQuantidade.value, 10),
    mes_vencimento: elMes.value
  };

  // Bloquear botão e mostrar loading
  setarEstadoBotao(true);
  esconderMensagem();

  try {
    // Envio via POST com text/plain para evitar preflight CORS
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
      // Não definimos Content-Type: application/json propositalmente
    });

    const data = await response.json();

    if (data.ok) {
      mostrarMensagem(data.mensagem || 'Registro salvo com sucesso!', 'sucesso');
      elForm.reset();
      elDescricao.textContent = '';
      elDescricao.className = 'form-hint';
      
      // Rolar para o topo da mensagem em mobile
      elMensagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      throw new Error(data.mensagem || 'Erro desconhecido ao salvar registro.');
    }

  } catch (error) {
    console.error('Erro ao enviar formulário:', error);
    mostrarMensagem(error.message || CONFIG.MENSAGENS.ERRO_CONEXAO, 'erro');
  } finally {
    setarEstadoBotao(false);
  }
});

// ============================================================
// 6. FUNÇÕES AUXILIARES DE UI
// ============================================================
function setarEstadoBotao(loading) {
  elBtnEnviar.disabled = loading;
  elBtnTexto.style.display = loading ? 'none' : 'inline';
  elBtnLoading.style.display = loading ? 'inline' : 'none';
}

function mostrarMensagem(texto, tipo) {
  elMensagem.textContent = texto;
  elMensagem.className = `mensagem ${tipo}`;
  elMensagem.style.display = 'block';
}

function esconderMensagem() {
  elMensagem.style.display = 'none';
  elMensagem.className = 'mensagem';
}

function mostrarEstadoCarregamento(carregando) {
  if (carregando) {
    elLoja.innerHTML = '<option value="">Carregando lojas...</option>';
    elLoja.disabled = true;
    elBtnEnviar.disabled = true;
  } else {
    elLoja.disabled = false;
    elBtnEnviar.disabled = false;
  }
}