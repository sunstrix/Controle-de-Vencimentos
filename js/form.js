/**
 * Controle de Vencimentos CP FANI - Lógica do Formulário (form.js)
 *
 * Responsável por:
 * - Carregar lojas e projetos do Google Apps Script (via apiRequest, com timeout e retry).
 * - Validar e filtrar a digitação do código do projeto (exatamente 5 dígitos).
 * - Realizar o "PROCV" localmente para exibir a descrição do projeto.
 * - Painel R1: mostrar itens já registrados pela loja selecionada.
 * - Detectar duplicidade (loja+código+lote+mês) e perguntar se soma ou cancela.
 * - Enviar o formulário para o backend (dois modos: enviar / salvar e adicionar outro).
 * - Lembrar a última loja usada no aparelho (localStorage, apenas essa conveniência).
 * - Fallback para navegadores sem suporte a input type="month".
 *
 * Segurança de renderização: NENHUM dado vindo do servidor é inserido via innerHTML.
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
const elLote = document.getElementById('lote'); // Opcional: existe apenas no index.html v2
const elBtnEnviar = document.getElementById('btn-enviar');
const elBtnTexto = document.getElementById('btn-texto');
const elBtnLoading = document.getElementById('btn-loading');
const elBtnOutro = document.getElementById('btn-salvar-outro');
const elBtnOutroTexto = document.getElementById('btn-salvar-outro-texto');
const elBtnOutroLoading = document.getElementById('btn-salvar-outro-loading');
const elMensagem = document.getElementById('mensagem');
const elAnoAtual = document.getElementById('ano-atual');
const elPainel = document.getElementById('painel-itens-loja');
const elPainelLista = document.getElementById('painel-lista');
const elPainelVazio = document.getElementById('painel-vazio');

// Chave de localStorage (SOMENTE para a conveniência da última loja)
const CHAVE_ULTIMA_LOJA = 'cpfani_ultima_loja';

// Variáveis em memória para cache dos dados
let projetosCache = {};
let lojasCache = [];
let painelCache = [];
let painelEntradas = []; // { item, li, spanAviso } para destaque de soma
let modoSalvarOutro = false;
let elBtnTentar = null;

// ============================================================
// 2. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Atualizar ano no rodapé
  if (elAnoAtual) {
    elAnoAtual.textContent = new Date().getFullYear();
  }

  // Fallback de input type="month" (navegadores sem suporte)
  aplicarFallbackMonth();

  // Definir mês mínimo no input (mês atual) quando nativo
  if (elMes.type === 'month') {
    elMes.setAttribute('min', mesAtualStr());
  }

  // Listeners de interação
  elLoja.addEventListener('change', () => {
    lembrarUltimaLoja(elLoja.value);
    carregarPainelLoja(elLoja.value);
  });
  elMes.addEventListener('change', atualizarDestaqueSoma);
  elMes.addEventListener('input', atualizarDestaqueSoma);
  elBtnEnviar.addEventListener('click', () => { modoSalvarOutro = false; });
  elBtnOutro.addEventListener('click', () => { modoSalvarOutro = true; });

  // Carregar dados iniciais (lojas e projetos)
  carregarDadosIniciais();
});

// ============================================================
// 3. FALLBACK DE INPUT TYPE="MONTH" (H13)
// ============================================================
function aplicarFallbackMonth() {
  const teste = document.createElement('input');
  teste.setAttribute('type', 'month');
  if (teste.type === 'month') return; // Navegador suporta nativamente

  // Substitui por texto com máscara AAAA-MM
  elMes.type = 'text';
  elMes.placeholder = 'AAAA-MM';
  elMes.setAttribute('pattern', '\\d{4}-\\d{2}');
  elMes.setAttribute('inputmode', 'numeric');
  elMes.removeAttribute('min');
  elMes.addEventListener('input', () => {
    const digitos = elMes.value.replace(/\D/g, '').slice(0, 6);
    elMes.value = digitos.length > 4
      ? digitos.slice(0, 4) + '-' + digitos.slice(4)
      : digitos;
    atualizarDestaqueSoma();
  });
}

// ============================================================
// 4. CARREGAMENTO DE DADOS (GET legado via apiRequest)
// ============================================================
async function carregarDadosIniciais() {
  mostrarEstadoCarregamento(true);
  esconderBotaoTentar();

  try {
    const data = await apiGetTudo();

    if (!data.ok) {
      throw new Error(data.mensagem || 'Erro ao carregar dados do servidor.');
    }

    // Popular cache
    projetosCache = data.projetos || {};
    lojasCache = data.lojas || [];

    // Popular select de lojas e restaurar última loja usada
    popularLojas(lojasCache);
    restaurarUltimaLoja();

    // Carregar painel da loja restaurada (se houver)
    if (elLoja.value) {
      carregarPainelLoja(elLoja.value);
    }
  } catch (error) {
    console.error('Erro no carregamento inicial:', error);
    mostrarMensagem(error.message || CONFIG.MENSAGENS.ERRO_CONEXAO, 'erro');
    mostrarBotaoTentar();
  } finally {
    mostrarEstadoCarregamento(false);
  }
}

function popularLojas(lojas) {
  // Reconstrói o select sem innerHTML
  while (elLoja.firstChild) {
    elLoja.removeChild(elLoja.firstChild);
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione a loja...';
  elLoja.appendChild(placeholder);

  lojas.forEach(loja => {
    const option = document.createElement('option');
    option.value = loja;
    option.textContent = loja;
    elLoja.appendChild(option);
  });
}

// ============================================================
// 5. ÚLTIMA LOJA NO APARELHO (localStorage - única conveniência)
// ============================================================
function lembrarUltimaLoja(loja) {
  if (!loja) return;
  try {
    localStorage.setItem(CHAVE_ULTIMA_LOJA, loja);
  } catch (e) {
    // localStorage indisponível (modo privado etc.): ignora silenciosamente
  }
}

function restaurarUltimaLoja() {
  let ultima = '';
  try {
    ultima = localStorage.getItem(CHAVE_ULTIMA_LOJA) || '';
  } catch (e) {
    return;
  }
  if (ultima && lojasCache.indexOf(ultima) !== -1) {
    elLoja.value = ultima;
  }
}

// ============================================================
// 6. LÓGICA DO CAMPO "CÓDIGO DO PROJETO" (PROCV LOCAL)
// ============================================================
elCodigo.addEventListener('input', (e) => {
  // Bloquear qualquer caractere que não seja número e limitar a 5 dígitos
  const valorLimpo = e.target.value.replace(/\D/g, '').slice(0, 5);

  // Atualizar o valor apenas se houve mudança (evita pular cursor)
  if (e.target.value !== valorLimpo) {
    e.target.value = valorLimpo;
  }

  // Buscar descrição no cache (PROCV)
  if (valorLimpo === '') {
    elDescricao.textContent = '';
    elDescricao.className = 'form-hint';
    atualizarDestaqueSoma();
    return;
  }

  if (valorLimpo.length < 5) {
    elDescricao.textContent = 'Código incompleto: digite os 5 dígitos.';
    elDescricao.className = 'form-hint';
    atualizarDestaqueSoma();
    return;
  }

  const descricao = projetosCache[valorLimpo];

  if (descricao) {
    elDescricao.textContent = 'Descrição: ' + descricao;
    elDescricao.className = 'form-hint encontrado';
  } else {
    elDescricao.textContent = '⚠️ Código não cadastrado. A descrição será gravada como "Código não cadastrado".';
    elDescricao.className = 'form-hint nao-encontrado';
  }

  atualizarDestaqueSoma();
});

// ============================================================
// 7. PAINEL R1 - ITENS JÁ REGISTRADOS DA LOJA
// ============================================================
async function carregarPainelLoja(loja) {
  if (!loja) {
    esconderPainel();
    return;
  }

  const data = await apiGetRegistrosPorLoja(loja);

  if (!data.ok) {
    // Falha no painel não bloqueia o formulário: apenas oculta
    console.warn('Falha ao carregar painel da loja:', data.mensagem);
    esconderPainel();
    return;
  }

  painelCache = data.registros || [];
  renderPainel();
}

function esconderPainel() {
  painelCache = [];
  painelEntradas = [];
  if (elPainel) elPainel.classList.add('escondido');
}

function renderPainel() {
  if (!elPainel || !elPainelLista) return;

  // Limpa a lista sem innerHTML
  while (elPainelLista.firstChild) {
    elPainelLista.removeChild(elPainelLista.firstChild);
  }
  painelEntradas = [];

  if (painelCache.length === 0) {
    elPainelVazio.textContent = 'Nenhum item registrado para esta loja no mês atual ou seguintes.';
    elPainelVazio.classList.remove('escondido');
    elPainel.classList.remove('escondido');
    return;
  }

  elPainelVazio.classList.add('escondido');

  painelCache.forEach(item => {
    const li = document.createElement('li');
    li.className = 'painel-item';

    const spanCodigo = document.createElement('span');
    spanCodigo.className = 'painel-item-codigo';
    spanCodigo.textContent = item.codigo_projeto;

    const spanDesc = document.createElement('span');
    spanDesc.textContent = item.descricao_projeto;

    const spanQtd = document.createElement('span');
    spanQtd.textContent = 'Qtd: ' + Number(item.quantidade).toLocaleString('pt-BR');

    const spanMes = document.createElement('span');
    spanMes.textContent = formatarMesBR(item.mes_vencimento);

    li.appendChild(spanCodigo);
    li.appendChild(spanDesc);
    li.appendChild(spanQtd);
    li.appendChild(spanMes);

    if (item.lote) {
      const spanLote = document.createElement('span');
      spanLote.textContent = 'Lote: ' + item.lote;
      li.appendChild(spanLote);
    }

    const spanAviso = document.createElement('span');
    spanAviso.className = 'form-hint nao-encontrado';
    spanAviso.textContent = '— este lançamento será SOMADO ao existente';
    spanAviso.style.display = 'none';
    li.appendChild(spanAviso);

    elPainelLista.appendChild(li);
    painelEntradas.push({ item: item, li: li, spanAviso: spanAviso });
  });

  elPainel.classList.remove('escondido');
  atualizarDestaqueSoma();
}

/**
 * Destaca no painel o item que será somado se o envio acontecer agora
 * (mesma loja + código + lote + mês).
 */
function atualizarDestaqueSoma() {
  const codigo = elCodigo.value.replace(/\D/g, '').slice(0, 5);
  const mes = elMes.value;
  const lote = elLote ? elLote.value.trim() : '';

  painelEntradas.forEach(entrada => {
    const coincide =
      codigo.length === 5 &&
      entrada.item.codigo_projeto === codigo &&
      entrada.item.mes_vencimento === mes &&
      (entrada.item.lote || '') === lote;

    if (coincide) {
      entrada.li.classList.add('destaque-soma');
      entrada.spanAviso.style.display = 'inline';
    } else {
      entrada.li.classList.remove('destaque-soma');
      entrada.spanAviso.style.display = 'none';
    }
  });
}

// ============================================================
// 8. MODAL DE CONFIRMAÇÃO (somar ou cancelar)
// ============================================================
function confirmarSoma(item, qtdNova) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'modal';

    const titulo = document.createElement('h3');
    titulo.className = 'modal-titulo';
    titulo.textContent = 'Registro já existe: somar quantidades?';

    const texto = document.createElement('p');
    texto.textContent =
      'Já existe um registro ATIVO para esta loja, código ' + item.codigo_projeto +
      ' (' + item.descricao_projeto + '), mês ' + formatarMesBR(item.mes_vencimento) +
      (item.lote ? ', lote ' + item.lote : '') +
      ', com quantidade ' + Number(item.quantidade).toLocaleString('pt-BR') +
      '. Somando ' + Number(qtdNova).toLocaleString('pt-BR') +
      ', o total passará a ' + Number(item.quantidade + qtdNova).toLocaleString('pt-BR') +
      '. Deseja somar?';

    const acoes = document.createElement('div');
    acoes.className = 'modal-acoes';

    const btnSomar = document.createElement('button');
    btnSomar.type = 'button';
    btnSomar.className = 'btn';
    btnSomar.textContent = 'Somar';

    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'btn btn-secondary';
    btnCancelar.textContent = 'Cancelar';

    acoes.appendChild(btnSomar);
    acoes.appendChild(btnCancelar);
    modal.appendChild(titulo);
    modal.appendChild(texto);
    modal.appendChild(acoes);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function fechar(resultado) {
      document.removeEventListener('keydown', onTecla);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(resultado);
    }

    function onTecla(ev) {
      if (ev.key === 'Escape') fechar(false);
    }

    btnSomar.addEventListener('click', () => fechar(true));
    btnCancelar.addEventListener('click', () => fechar(false));
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) fechar(false);
    });
    document.addEventListener('keydown', onTecla);
    btnSomar.focus();
  });
}

// ============================================================
// 9. ENVIO DO FORMULÁRIO (POST via apiRegistrarLote)
// ============================================================
elForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // --- Validações client-side ---
  const loja = elLoja.value;
  if (!loja) {
    mostrarMensagem('Selecione a loja.', 'erro');
    return;
  }

  const codigo = elCodigo.value.replace(/\D/g, '').slice(0, 5);
  if (codigo.length !== 5) {
    mostrarMensagem('O código do projeto deve ter exatamente 5 dígitos.', 'erro');
    return;
  }

  const qtd = parseInt(elQuantidade.value, 10);
  if (!Number.isInteger(qtd) || qtd <= 0) {
    mostrarMensagem('A quantidade deve ser um número inteiro maior que zero.', 'erro');
    return;
  }

  const mes = elMes.value;
  if (!mesValido(mes)) {
    mostrarMensagem('Mês de vencimento inválido. Use o formato AAAA-MM.', 'erro');
    return;
  }
  if (mes < mesAtualStr()) {
    mostrarMensagem('Não é permitido registrar vencimentos em meses passados.', 'erro');
    return;
  }

  const lote = elLote ? elLote.value.trim() : '';

  // --- Duplicidade: pergunta se soma ou cancela ---
  const itemExistente = painelCache.find(item =>
    item.codigo_projeto === codigo &&
    item.mes_vencimento === mes &&
    (item.lote || '') === lote
  );

  if (itemExistente) {
    const confirmar = await confirmarSoma(itemExistente, qtd);
    if (!confirmar) {
      mostrarMensagem('Envio cancelado. Nenhum registro foi alterado.', 'aviso');
      return;
    }
  }

  // --- Payload (descrição é resolvida no servidor; não confiamos no cliente) ---
  const payload = {
    loja: loja,
    codigo_projeto: codigo,
    quantidade: qtd,
    mes_vencimento: mes,
    lote: lote
  };

  // Bloquear botões e mostrar loading
  setarEstadoBotoes(true);
  esconderMensagem();

  try {
    const data = await apiRegistrarLote(payload);

    if (data.ok) {
      mostrarMensagem(data.mensagem || 'Registro salvo com sucesso!', 'sucesso');
      posSucesso();
      elMensagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      mostrarMensagem(data.mensagem || 'Erro desconhecido ao salvar registro.', 'erro');
    }
  } catch (error) {
    console.error('Erro ao enviar formulário:', error);
    mostrarMensagem(error.message || CONFIG.MENSAGENS.ERRO_CONEXAO, 'erro');
  } finally {
    setarEstadoBotoes(false);
  }
});

/**
 * Pós-sucesso: limpa campos conforme o modo e atualiza painel + memória da loja.
 */
function posSucesso() {
  const loja = elLoja.value;

  lembrarUltimaLoja(loja);

  if (modoSalvarOutro) {
    // Mantém loja e mês; limpa código, quantidade e lote
    elCodigo.value = '';
    elQuantidade.value = '';
    if (elLote) elLote.value = '';
    elDescricao.textContent = '';
    elDescricao.className = 'form-hint';
    elCodigo.focus();
  } else {
    // Limpa código, quantidade, lote e mês; mantém a loja memorizada
    elCodigo.value = '';
    elQuantidade.value = '';
    if (elLote) elLote.value = '';
    elMes.value = '';
    elDescricao.textContent = '';
    elDescricao.className = 'form-hint';
  }

  // Atualiza o painel R1 (o registro novo passa a constar)
  carregarPainelLoja(loja);
}

// ============================================================
// 10. FUNÇÕES AUXILIARES DE UI
// ============================================================
function setarEstadoBotoes(loading) {
  elBtnEnviar.disabled = loading;
  elBtnOutro.disabled = loading;

  elBtnTexto.style.display = 'inline';
  elBtnLoading.style.display = 'none';
  elBtnOutroTexto.style.display = 'inline';
  elBtnOutroLoading.style.display = 'none';

  if (loading) {
    if (modoSalvarOutro) {
      elBtnOutroTexto.style.display = 'none';
      elBtnOutroLoading.style.display = 'inline';
    } else {
      elBtnTexto.style.display = 'none';
      elBtnLoading.style.display = 'inline';
    }
  }
}

function mostrarMensagem(texto, tipo) {
  elMensagem.textContent = texto;
  elMensagem.className = 'mensagem ' + tipo;
  elMensagem.style.display = 'block';
}

function esconderMensagem() {
  elMensagem.style.display = 'none';
  elMensagem.className = 'mensagem';
}

function mostrarEstadoCarregamento(carregando) {
  if (carregando) {
    while (elLoja.firstChild) {
      elLoja.removeChild(elLoja.firstChild);
    }
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Carregando lojas...';
    elLoja.appendChild(opt);
    elLoja.disabled = true;
    elBtnEnviar.disabled = true;
    elBtnOutro.disabled = true;
  } else {
    elLoja.disabled = false;
    elBtnEnviar.disabled = false;
    elBtnOutro.disabled = false;
  }
}

/**
 * Botão "Tentar novamente" para falha de carregamento inicial (H14/UX).
 */
function mostrarBotaoTentar() {
  garantirBotaoTentar();
  elBtnTentar.style.display = 'inline-flex';
}

function esconderBotaoTentar() {
  if (elBtnTentar) elBtnTentar.style.display = 'none';
}

function garantirBotaoTentar() {
  if (elBtnTentar) return elBtnTentar;
  elBtnTentar = document.createElement('button');
  elBtnTentar.type = 'button';
  elBtnTentar.className = 'btn btn-secondary mt-md';
  elBtnTentar.textContent = 'Tentar novamente';
  elBtnTentar.style.display = 'none';
  elBtnTentar.addEventListener('click', () => {
    esconderMensagem();
    carregarDadosIniciais();
  });
  elMensagem.parentNode.insertBefore(elBtnTentar, elMensagem.nextSibling);
  return elBtnTentar;
}

// ============================================================
// 11. HELPERS DE DATA
// ============================================================
function mesAtualStr() {
  const hoje = new Date();
  return hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
}

function mesValido(m) {
  if (!/^\d{4}-\d{2}$/.test(m || '')) return false;
  const mm = parseInt(m.slice(5, 7), 10);
  return mm >= 1 && mm <= 12;
}

function formatarMesBR(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) return mes || '';
  return mes.slice(5, 7) + '/' + mes.slice(0, 4);
}