/**
 * Controle de Vencimentos CP FANI - Lógica de Produtos (produtos.js)
 *
 * Responsável por:
 * - Carregar a lista de produtos da aba "Projetos" (apiGetProdutos).
 * - Criar, editar e inativar/reativar produtos (NUNCA excluir).
 * - Busca client-side por código ou descrição.
 * - Importação colada no formato código;descrição;categoria, com relatório.
 * - Avisar quando o código já existe (Opção C: salvar atualiza o primeiro produto).
 *
 * Regras de negócio aplicadas:
 * - Código sempre texto de 5 dígitos (zeros à esquerda preservados via padStart).
 * - Inativação mantém o produto no histórico (aba "Registros" intacta).
 * - Importação normaliza códigos colados sem zeros ("1234" vira "01234").
 *
 * Segurança de renderização: NENHUM dado vindo do servidor é inserido via innerHTML.
 */

// ============================================================
// 1. SELEÇÃO DE ELEMENTOS DO DOM
// ============================================================
const elFormProduto = document.getElementById('form-produto');
const elTituloForm = document.getElementById('titulo-form-produto');
const elProdCodigo = document.getElementById('prod-codigo');
const elProdCodigoHint = document.getElementById('prod-codigo-hint');
const elProdDescricao = document.getElementById('prod-descricao');
const elProdCategoria = document.getElementById('prod-categoria');
const elProdUnidade = document.getElementById('prod-unidade');
const elProdAtivo = document.getElementById('prod-ativo');
const elBtnSalvar = document.getElementById('btn-salvar-produto');
const elBtnSalvarTexto = document.getElementById('btn-salvar-produto-texto');
const elBtnSalvarLoading = document.getElementById('btn-salvar-produto-loading');
const elBtnCancelarEdicao = document.getElementById('btn-cancelar-edicao');
const elBusca = document.getElementById('busca-produto');
const elTabela = document.getElementById('tabela-produtos');
const elTbody = document.getElementById('produtos-body');
const elVazio = document.getElementById('produtos-vazio');
const elImportArea = document.getElementById('import-area');
const elBtnImportar = document.getElementById('btn-importar');
const elBtnImportarTexto = document.getElementById('btn-importar-texto');
const elBtnImportarLoading = document.getElementById('btn-importar-loading');
const elImportRelatorio = document.getElementById('import-relatorio');
const elMensagem = document.getElementById('mensagem-produtos');
const elAnoAtual = document.getElementById('ano-atual');

// Estado em memória
let produtosCache = [];
let codigoEmEdicao = null;

// Limite de segurança para importação colada
const LIMITE_IMPORTACAO = 500;

// ============================================================
// 2. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (elAnoAtual) {
    elAnoAtual.textContent = new Date().getFullYear();
  }

  elFormProduto.addEventListener('submit', aoSalvarProduto);
  elBtnCancelarEdicao.addEventListener('click', () => {
    sairModoEdicao();
    mostrarMensagem('Edição cancelada. Nenhum dado foi alterado.', 'aviso');
  });
  elProdCodigo.addEventListener('input', aoDigitarCodigo);
  elBusca.addEventListener('input', renderProdutos);
  elBtnImportar.addEventListener('click', importarColados);

  carregarProdutos();
});

// ============================================================
// 3. CARREGAMENTO
// ============================================================
async function carregarProdutos() {
  const data = await apiGetProdutos();

  if (!data.ok) {
    mostrarMensagem(data.mensagem || CONFIG.MENSAGENS.ERRO_SERVIDOR, 'erro');
    return;
  }

  produtosCache = data.produtos || [];
  renderProdutos();
  atualizarHintCodigo();
}

// ============================================================
// 4. BUSCA E RENDERIZAÇÃO DA TABELA (sem innerHTML)
// ============================================================
function termoBusca() {
  return (elBusca.value || '').trim().toLowerCase();
}

function produtoCombinaBusca(produto, termo) {
  if (!termo) return true;

  const codigo = produto.codigo || '';
  const descricao = (produto.descricao || '').toLowerCase();
  const categoria = (produto.categoria || '').toLowerCase();

  if (codigo.indexOf(termo) !== -1) return true;

  // Busca numérica: "1234" também encontra "01234"
  if (/^\d+$/.test(termo)) {
    const termoPad = termopadStart5(termo);
    if (codigo === termoPad) return true;
  }

  return descricao.indexOf(termo) !== -1 || categoria.indexOf(termo) !== -1;
}

function termopadStart5(t) {
  return t.padStart(5, '0');
}

function renderProdutos() {
  const termo = termoBusca();

  // Limpa o tbody sem innerHTML
  while (elTbody.firstChild) {
    elTbody.removeChild(elTbody.firstChild);
  }

  const filtrados = produtosCache.filter(p => produtoCombinaBusca(p, termo));

  if (filtrados.length === 0) {
    elTabela.style.display = 'none';
    elVazio.style.display = 'block';
    elVazio.textContent = produtosCache.length === 0
      ? 'Nenhum produto cadastrado ainda.'
      : 'Nenhum produto encontrado para a busca "' + elBusca.value.trim() + '".';
    return;
  }

  elTabela.style.display = 'table';
  elVazio.style.display = 'none';

  filtrados.forEach(produto => {
    const tr = document.createElement('tr');

    const tdCodigo = document.createElement('td');
    tdCodigo.className = 'painel-item-codigo';
    tdCodigo.textContent = produto.codigo;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = produto.descricao;

    const tdCat = document.createElement('td');
    tdCat.textContent = produto.categoria || '—';

    const tdUn = document.createElement('td');
    tdUn.textContent = produto.unidade || '—';

    const tdSit = document.createElement('td');
    const badge = document.createElement('span');
    const ativo = (produto.ativo || 'SIM').toUpperCase();
    badge.className = 'badge-status ' + (ativo === 'SIM' ? 'badge-ativo' : 'badge-inativo');
    badge.textContent = ativo === 'SIM' ? 'Ativo' : 'Inativo';
    tdSit.appendChild(badge);

    const tdAcoes = document.createElement('td');
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn btn-acao';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => entrarModoEdicao(produto));

    const btnSit = document.createElement('button');
    btnSit.type = 'button';
    btnSit.className = 'btn btn-acao ' + (ativo === 'SIM' ? 'btn-danger' : 'btn-secondary');
    btnSit.textContent = ativo === 'SIM' ? 'Inativar' : 'Reativar';
    btnSit.addEventListener('click', () => alternarSituacao(produto));

    tdAcoes.appendChild(btnEditar);
    tdAcoes.appendChild(btnSit);

    tr.appendChild(tdCodigo);
    tr.appendChild(tdDesc);
    tr.appendChild(tdCat);
    tr.appendChild(tdUn);
    tr.appendChild(tdSit);
    tr.appendChild(tdAcoes);

    elTbody.appendChild(tr);
  });
}

// ============================================================
// 5. CAMPO CÓDIGO: FILTRO, HINT E AVISO DE EXISTENTE (Opção C)
// ============================================================
function aoDigitarCodigo(e) {
  const valorLimpo = e.target.value.replace(/\D/g, '').slice(0, 5);
  if (e.target.value !== valorLimpo) {
    e.target.value = valorLimpo;
  }
  atualizarHintCodigo();
}

function buscarProdutoPorCodigo(codigo) {
  return produtosCache.find(p => p.codigo === codigo) || null;
}

function atualizarHintCodigo() {
  if (codigoEmEdicao) {
    elProdCodigoHint.textContent = 'Modo edição: o código não pode ser alterado.';
    elProdCodigoHint.className = 'form-hint';
    return;
  }

  const codigo = elProdCodigo.value.replace(/\D/g, '').slice(0, 5);

  if (codigo === '') {
    elProdCodigoHint.textContent = '';
    elProdCodigoHint.className = 'form-hint';
    return;
  }

  if (codigo.length < 5) {
    elProdCodigoHint.textContent = 'Código incompleto: digite os 5 dígitos.';
    elProdCodigoHint.className = 'form-hint';
    return;
  }

  const existente = buscarProdutoPorCodigo(codigo);
  if (existente) {
    elProdCodigoHint.textContent =
      'Código já cadastrado ("' + existente.descricao + '"). Salvar irá ATUALIZAR este produto.';
    elProdCodigoHint.className = 'form-hint nao-encontrado';
  } else {
    elProdCodigoHint.textContent = 'Código livre: será criado um produto novo.';
    elProdCodigoHint.className = 'form-hint encontrado';
  }
}

// ============================================================
// 6. CRIAR / EDITAR
// ============================================================
function entrarModoEdicao(produto) {
  codigoEmEdicao = produto.codigo;

  elProdCodigo.value = produto.codigo;
  elProdCodigo.readOnly = true;
  elProdDescricao.value = produto.descricao || '';
  elProdCategoria.value = produto.categoria || '';
  elProdUnidade.value = produto.unidade || '';
  elProdAtivo.value = (produto.ativo || 'SIM').toUpperCase();

  elTituloForm.textContent = 'Editar Produto';
  elBtnSalvarTexto.textContent = 'Salvar Alterações';
  elBtnCancelarEdicao.classList.remove('escondido');

  atualizarHintCodigo();
  elProdDescricao.focus();
  elFormProduto.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sairModoEdicao() {
  codigoEmEdicao = null;

  elProdCodigo.readOnly = false;
  elFormProduto.reset();
  elProdCodigo.value = '';
  elProdDescricao.value = '';
  elProdCategoria.value = '';
  elProdUnidade.value = '';
  elProdAtivo.value = 'SIM';

  elTituloForm.textContent = 'Novo Produto';
  elBtnSalvarTexto.textContent = 'Salvar Produto';
  elBtnCancelarEdicao.classList.add('escondido');

  atualizarHintCodigo();
}

async function aoSalvarProduto(e) {
  e.preventDefault();

  const codigo = (codigoEmEdicao || elProdCodigo.value.replace(/\D/g, '').slice(0, 5));
  if (codigo.length !== 5) {
    mostrarMensagem('O código do produto deve ter exatamente 5 dígitos.', 'erro');
    return;
  }

  const descricao = (elProdDescricao.value || '').trim();
  if (!descricao) {
    mostrarMensagem('A descrição é obrigatória.', 'erro');
    return;
  }
  if (descricao.length > 120) {
    mostrarMensagem('A descrição deve ter no máximo 120 caracteres.', 'erro');
    return;
  }

  const categoria = (elProdCategoria.value || '').trim();
  const unidade = (elProdUnidade.value || '').trim();
  if (categoria.length > 120 || unidade.length > 120) {
    mostrarMensagem('Categoria e unidade devem ter no máximo 120 caracteres.', 'erro');
    return;
  }

  const payload = {
    codigo: codigo,
    descricao: descricao,
    categoria: categoria,
    unidade: unidade,
    ativo: (elProdAtivo.value || 'SIM').toUpperCase()
  };

  setLoadingSalvar(true);
  esconderMensagem();

  try {
    const data = await apiSalvarProduto(payload);

    if (data.ok) {
      mostrarMensagem(data.mensagem || 'Produto salvo com sucesso!', 'sucesso');
      sairModoEdicao();
      await carregarProdutos();
    } else {
      mostrarMensagem(data.mensagem || 'Erro ao salvar produto.', 'erro');
    }
  } catch (error) {
    console.error('Erro ao salvar produto:', error);
    mostrarMensagem(error.message || CONFIG.MENSAGENS.ERRO_CONEXAO, 'erro');
  } finally {
    setLoadingSalvar(false);
  }
}

// ============================================================
// 7. INATIVAR / REATIVAR (nunca excluir)
// ============================================================
async function alternarSituacao(produto) {
  const ativoAtual = (produto.ativo || 'SIM').toUpperCase();
  const novoAtivo = ativoAtual === 'SIM' ? 'NÃO' : 'SIM';

  const texto = novoAtivo === 'NÃO'
    ? 'Inativar o produto ' + produto.codigo + ' (' + produto.descricao + ')? ' +
      'Ele deixará de aparecer como ativo, mas TODO o histórico de registros é mantido.'
    : 'Reativar o produto ' + produto.codigo + ' (' + produto.descricao + ')?';

  const confirmar = await confirmarAcao(
    novoAtivo === 'NÃO' ? 'Inativar produto' : 'Reativar produto',
    texto
  );
  if (!confirmar) return;

  const data = await apiSalvarProduto({
    codigo: produto.codigo,
    descricao: produto.descricao,
    categoria: produto.categoria,
    unidade: produto.unidade,
    ativo: novoAtivo
  });

  if (data.ok) {
    mostrarMensagem(
      novoAtivo === 'NÃO'
        ? 'Produto inativado. Histórico preservado.'
        : 'Produto reativado.',
      'sucesso'
    );
    await carregarProdutos();
  } else {
    mostrarMensagem(data.mensagem || 'Erro ao alterar situação do produto.', 'erro');
  }
}

// ============================================================
// 8. MODAL DE CONFIRMAÇÃO (construído via DOM, sem innerHTML)
// ============================================================
function confirmarAcao(titulo, texto) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'modal';

    const h = document.createElement('h3');
    h.className = 'modal-titulo';
    h.textContent = titulo;

    const p = document.createElement('p');
    p.textContent = texto;

    const acoes = document.createElement('div');
    acoes.className = 'modal-acoes';

    const btnSim = document.createElement('button');
    btnSim.type = 'button';
    btnSim.className = 'btn';
    btnSim.textContent = 'Confirmar';

    const btnNao = document.createElement('button');
    btnNao.type = 'button';
    btnNao.className = 'btn btn-secondary';
    btnNao.textContent = 'Cancelar';

    acoes.appendChild(btnSim);
    acoes.appendChild(btnNao);
    modal.appendChild(h);
    modal.appendChild(p);
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

    btnSim.addEventListener('click', () => fechar(true));
    btnNao.addEventListener('click', () => fechar(false));
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) fechar(false);
    });
    document.addEventListener('keydown', onTecla);
    btnSim.focus();
  });
}

// ============================================================
// 9. IMPORTAÇÃO COLADA (código;descrição;categoria)
// ============================================================
async function importarColados() {
  const linhas = (elImportArea.value || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '');

  if (linhas.length === 0) {
    mostrarMensagem('Cole ao menos uma linha no formato código;descrição;categoria.', 'aviso');
    return;
  }

  if (linhas.length > LIMITE_IMPORTACAO) {
    mostrarMensagem(
      'Limite de ' + LIMITE_IMPORTACAO + ' linhas por importação. Divida a lista em partes.',
      'erro'
    );
    return;
  }

  setLoadingImportar(true);
  esconderMensagem();
  elImportRelatorio.textContent = 'Processando importação...';

  const sucessos = [];
  const falhas = [];

  for (let i = 0; i < linhas.length; i++) {
    const numeroLinha = i + 1;
    const linha = linhas[i];
    const partes = linha.split(';');

    if (partes.length < 2) {
      falhas.push('Linha ' + numeroLinha + ': formato inválido (esperado código;descrição;categoria).');
      continue;
    }

    const codigoDigits = partes[0].replace(/\D/g, '');
    if (codigoDigits === '' || codigoDigits.length > 5) {
      falhas.push('Linha ' + numeroLinha + ': código inválido ("' + partes[0].trim() + '"). Use de 1 a 5 dígitos.');
      continue;
    }
    const codigo = codigoDigits.padStart(5, '0');

    const descricao = (partes[1] || '').trim();
    if (!descricao) {
      falhas.push('Linha ' + numeroLinha + ': descrição vazia.');
      continue;
    }
    if (descricao.length > 120) {
      falhas.push('Linha ' + numeroLinha + ': descrição excede 120 caracteres.');
      continue;
    }

    const categoria = (partes[2] || '').trim();
    if (categoria.length > 120) {
      falhas.push('Linha ' + numeroLinha + ': categoria excede 120 caracteres.');
      continue;
    }

    const data = await apiSalvarProduto({
      codigo: codigo,
      descricao: descricao,
      categoria: categoria,
      unidade: '',
      ativo: 'SIM'
    });

    if (data.ok) {
      sucessos.push('Linha ' + numeroLinha + ': código ' + codigo + ' (' + descricao + ') salvo.');
    } else {
      falhas.push('Linha ' + numeroLinha + ': ' + (data.mensagem || 'erro desconhecido.'));
    }
  }

  // Relatório final
  let relatorio = 'Importação concluída: ' + sucessos.length + ' de ' + linhas.length + ' linha(s) salva(s).';
  if (falhas.length > 0) {
    relatorio += '\n\nFalhas:\n' + falhas.join('\n');
  }
  elImportRelatorio.textContent = relatorio;

  if (falhas.length === 0) {
    elImportArea.value = '';
    mostrarMensagem('Todos os produtos foram importados com sucesso!', 'sucesso');
  } else {
    mostrarMensagem(
      'Importação parcial: ' + sucessos.length + ' salva(s), ' + falhas.length + ' falha(s). Veja o relatório abaixo.',
      'aviso'
    );
  }

  setLoadingImportar(false);
  await carregarProdutos();
}

// ============================================================
// 10. FUNÇÕES AUXILIARES DE UI
// ============================================================
function setLoadingSalvar(loading) {
  elBtnSalvar.disabled = loading;
  elBtnCancelarEdicao.disabled = loading;
  elBtnSalvarTexto.style.display = loading ? 'none' : 'inline';
  elBtnSalvarLoading.style.display = loading ? 'inline' : 'none';
}

function setLoadingImportar(loading) {
  elBtnImportar.disabled = loading;
  elBtnImportarTexto.style.display = loading ? 'none' : 'inline';
  elBtnImportarLoading.style.display = loading ? 'inline' : 'none';
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