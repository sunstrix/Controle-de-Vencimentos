/**
 * Controle de Vencimentos CP FANI - Lógica do Dashboard (dashboard.js)
 *
 * Responsável por:
 * - Carregar registros e lojas do Google Apps Script (via apiGetTudo).
 * - Separar registros em dois grupos: mês atual/futuros e vencidos não baixados.
 * - Filtrar mês atual e futuros por loja e mês selecionados.
 * - Agrupar dados por loja com separadores visuais.
 * - Renderizar tabela com cores de status (vermelho/amarelo/neutro).
 * - Destacar "Vencidos não baixados" (meses passados, status ATIVO) em seção própria.
 * - Atualizar cartões de resumo (mês atual, próximo mês, lojas, vencidos).
 * - Modal de baixa total/parcial chamando apiDarBaixa.
 * - Exportar dados filtrados para Excel via SheetJS (xlsx 0.18.5).
 * - Tratar estados de carregamento, vazio e erro.
 *
 * Segurança de renderização: NENHUM dado vindo do servidor é inserido via innerHTML.
 */

// ============================================================
// 1. SELEÇÃO DE ELEMENTOS DO DOM
// ============================================================
const elLoadingState = document.getElementById('loading-state');
const elDashboardContent = document.getElementById('dashboard-content');
const elSummaryCurrent = document.getElementById('summary-current');
const elSummaryNext = document.getElementById('summary-next');
const elSummaryStores = document.getElementById('summary-stores');
const elSummaryVencidos = document.getElementById('summary-vencidos');
const elSecaoVencidos = document.getElementById('secao-vencidos');
const elSecaoVencidosBody = document.getElementById('secao-vencidos-body');
const elFilterStore = document.getElementById('filter-store');
const elFilterMonth = document.getElementById('filter-month');
const elBtnUpdate = document.getElementById('btn-update');
const elBtnExport = document.getElementById('btn-export');
const elTableBody = document.getElementById('table-body');
const elEmptyState = document.getElementById('empty-state');
const elDataTable = document.getElementById('data-table');
const elMensagem = document.getElementById('mensagem-dashboard');
const elAnoAtual = document.getElementById('ano-atual');

// Modal de baixa
const elModalBaixa = document.getElementById('modal-baixa');
const elModalId = document.getElementById('modal-baixa-id');
const elModalQtdDisp = document.getElementById('modal-baixa-qtd-disponivel');
const elModalQtdBaixa = document.getElementById('modal-baixa-quantidade');
const elModalMotivo = document.getElementById('modal-baixa-motivo');
const elModalResponsavel = document.getElementById('modal-baixa-responsavel');
const elBtnCancelarBaixa = document.getElementById('btn-cancelar-baixa');
const elBtnConfirmarBaixa = document.getElementById('btn-confirmar-baixa');
const elBtnConfirmarTexto = document.getElementById('btn-confirmar-baixa-texto');
const elBtnConfirmarLoading = document.getElementById('btn-confirmar-baixa-loading');
const elModalMensagem = document.getElementById('modal-baixa-mensagem');

// ============================================================
// 2. VARIÁVEIS GLOBAIS
// ============================================================
let registrosCache = [];
let lojasCache = [];
let registroEmBaixa = null;

// ============================================================
// 3. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (elAnoAtual) {
    elAnoAtual.textContent = new Date().getFullYear();
  }

  aplicarFallbackMonth();
  if (elFilterMonth.type === 'month') {
    elFilterMonth.setAttribute('min', mesAtualStr());
  }
  elFilterMonth.value = mesAtualStr();

  elFilterStore.addEventListener('change', aplicarFiltros);
  elFilterMonth.addEventListener('change', aplicarFiltros);
  elBtnUpdate.addEventListener('click', recarregarDados);
  elBtnExport.addEventListener('click', exportarExcel);

  elBtnCancelarBaixa.addEventListener('click', fecharModalBaixa);
  elBtnConfirmarBaixa.addEventListener('click', confirmarBaixa);
  if (elModalBaixa) {
    elModalBaixa.addEventListener('click', (ev) => {
      if (ev.target === elModalBaixa) fecharModalBaixa();
    });
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && elModalBaixa && !elModalBaixa.hidden) {
      fecharModalBaixa();
    }
  });

  carregarDados();
});

// ============================================================
// 4. FALLBACK DE INPUT TYPE="MONTH"
// ============================================================
function aplicarFallbackMonth() {
  const teste = document.createElement('input');
  teste.setAttribute('type', 'month');
  if (teste.type === 'month') return;

  elFilterMonth.type = 'text';
  elFilterMonth.placeholder = 'AAAA-MM';
  elFilterMonth.setAttribute('pattern', '\\d{4}-\\d{2}');
  elFilterMonth.setAttribute('inputmode', 'numeric');
  elFilterMonth.removeAttribute('min');
  elFilterMonth.addEventListener('input', () => {
    const digitos = elFilterMonth.value.replace(/\D/g, '').slice(0, 6);
    elFilterMonth.value = digitos.length > 4
      ? digitos.slice(0, 4) + '-' + digitos.slice(4)
      : digitos;
  });
}

// ============================================================
// 5. CARREGAMENTO DE DADOS (GET legado via apiGetTudo)
// ============================================================
async function carregarDados() {
  mostrarLoading(true);
  esconderMensagem();

  const data = await apiGetTudo();

  if (!data.ok) {
    console.error('Erro no carregamento:', data.mensagem);
    mostrarMensagem(data.mensagem || CONFIG.MENSAGENS.ERRO_CONEXAO, 'erro');
    mostrarLoading(false);
    return;
  }

  registrosCache = data.registros || [];
  lojasCache = data.lojas || [];

  popularFiltroLojas(lojasCache);
  aplicarFiltros();
  mostrarLoading(false);
}

function recarregarDados() {
  carregarDados();
}

// ============================================================
// 6. FILTRO DE LOJAS (sem innerHTML)
// ============================================================
function popularFiltroLojas(lojas) {
  while (elFilterStore.firstChild) {
    elFilterStore.removeChild(elFilterStore.firstChild);
  }

  const optTodas = document.createElement('option');
  optTodas.value = '';
  optTodas.textContent = 'Todas as lojas';
  elFilterStore.appendChild(optTodas);

  const ordenadas = [...lojas].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  ordenadas.forEach(loja => {
    const option = document.createElement('option');
    option.value = loja;
    option.textContent = loja;
    elFilterStore.appendChild(option);
  });
}

// ============================================================
// 7. SEPARAÇÃO DE REGISTROS (futuros vs vencidos)
// ============================================================
function separarRegistros(registros) {
  const atual = mesAtualStr();
  const futuros = [];
  const vencidos = [];

  registros.forEach(reg => {
    if (!reg.mes_vencimento) return;
    if (reg.status === 'BAIXADO') return;

    if (reg.mes_vencimento >= atual) {
      futuros.push(reg);
    } else {
      vencidos.push(reg);
    }
  });

  return { futuros: futuros, vencidos: vencidos };
}

// ============================================================
// 8. APLICAÇÃO DE FILTROS E RENDERIZAÇÃO
// ============================================================
function aplicarFiltros() {
  const lojaFiltro = elFilterStore.value;
  const mesFiltro = elFilterMonth.value;
  const atual = mesAtualStr();
  const proximo = mesProximoStr();

  const grupos = separarRegistros(registrosCache);

  // Filtros aplicados apenas sobre futuros (meses atuais e seguintes)
  let futurosFiltrados = grupos.futuros.slice();
  if (lojaFiltro) {
    futurosFiltrados = futurosFiltrados.filter(reg => reg.loja === lojaFiltro);
  }
  if (mesFiltro) {
    futurosFiltrados = futurosFiltrados.filter(reg => reg.mes_vencimento === mesFiltro);
  }

  futurosFiltrados.sort((a, b) => {
    if (a.loja !== b.loja) return a.loja.localeCompare(b.loja, 'pt-BR');
    return a.mes_vencimento.localeCompare(b.mes_vencimento);
  });

  // Vencidos não filtrados por mês (sempre todos), mas filtrados por loja
  let vencidosFiltrados = grupos.vencidos.slice();
  if (lojaFiltro) {
    vencidosFiltrados = vencidosFiltrados.filter(reg => reg.loja === lojaFiltro);
  }
  vencidosFiltrados.sort((a, b) => a.mes_vencimento.localeCompare(b.mes_vencimento));

  atualizarResumo(futurosFiltrados, vencidosFiltrados, atual, proximo);
  renderTabela(futurosFiltrados, atual, proximo);
  renderVencidos(vencidosFiltrados);
}

// ============================================================
// 9. CARTÕES DE RESUMO
// ============================================================
function atualizarResumo(futuros, vencidos, atual, proximo) {
  const totalAtual = futuros
    .filter(r => r.mes_vencimento === atual)
    .reduce((sum, r) => sum + (Number(r.quantidade) || 0), 0);

  const totalProximo = futuros
    .filter(r => r.mes_vencimento === proximo)
    .reduce((sum, r) => sum + (Number(r.quantidade) || 0), 0);

  const lojasPendencias = new Set(futuros.map(r => r.loja)).size;
  const qtdVencidos = vencidos.reduce((sum, r) => sum + (Number(r.quantidade) || 0), 0);

  if (elSummaryCurrent) elSummaryCurrent.textContent = totalAtual.toLocaleString('pt-BR');
  if (elSummaryNext) elSummaryNext.textContent = totalProximo.toLocaleString('pt-BR');
  if (elSummaryStores) elSummaryStores.textContent = lojasPendencias.toLocaleString('pt-BR');
  if (elSummaryVencidos) elSummaryVencidos.textContent = qtdVencidos.toLocaleString('pt-BR');
}

// ============================================================
// 10. RENDERIZAÇÃO DA TABELA PRINCIPAL (sem innerHTML)
// ============================================================
function renderTabela(registros, atual, proximo) {
  while (elTableBody.firstChild) {
    elTableBody.removeChild(elTableBody.firstChild);
  }

  if (registros.length === 0) {
    elDataTable.style.display = 'none';
    elEmptyState.style.display = 'block';
    return;
  }

  elDataTable.style.display = 'table';
  elEmptyState.style.display = 'none';

  let lojaAtual = null;

  registros.forEach(reg => {
    // Separador de loja
    if (reg.loja !== lojaAtual) {
      lojaAtual = reg.loja;
      const trSep = document.createElement('tr');
      trSep.className = 'linha-separador-loja';
      const tdSep = document.createElement('td');
      tdSep.colSpan = 6;
      tdSep.textContent = lojaAtual;
      trSep.appendChild(tdSep);
      elTableBody.appendChild(trSep);
    }

    // Determinar classe de status e badge
    let classeStatus = 'linha-mes-neutro';
    let badgeClass = 'badge-futuro';
    let badgeText = 'Futuro';

    if (reg.mes_vencimento === atual) {
      classeStatus = 'linha-mes-atual';
      badgeClass = 'badge-atual';
      badgeText = 'Este mês';
    } else if (reg.mes_vencimento === proximo) {
      classeStatus = 'linha-mes-seguinte';
      badgeClass = 'badge-seguinte';
      badgeText = 'Próximo mês';
    }

    const tr = document.createElement('tr');
    tr.className = classeStatus;

    // Coluna Loja
    const tdLoja = document.createElement('td');
    tdLoja.textContent = reg.loja;

    // Coluna Código
    const tdCodigo = document.createElement('td');
    tdCodigo.className = 'painel-item-codigo';
    tdCodigo.textContent = reg.codigo_projeto;

    // Coluna Descrição
    const tdDesc = document.createElement('td');
    tdDesc.textContent = reg.descricao_projeto;

    // Coluna Quantidade
    const tdQtd = document.createElement('td');
    tdQtd.textContent = Number(reg.quantidade).toLocaleString('pt-BR');

    // Coluna Mês + badge
    const tdMes = document.createElement('td');
    const spanMes = document.createElement('span');
    spanMes.textContent = formatarMesBR(reg.mes_vencimento) + ' ';
    const spanBadge = document.createElement('span');
    spanBadge.className = 'badge-status ' + badgeClass;
    spanBadge.textContent = badgeText;
    tdMes.appendChild(spanMes);
    tdMes.appendChild(spanBadge);

    // Coluna Ações: botão Dar baixa
    const tdAcoes = document.createElement('td');
    const btnBaixa = document.createElement('button');
    btnBaixa.type = 'button';
    btnBaixa.className = 'btn btn-acao btn-danger';
    btnBaixa.textContent = 'Dar baixa';
    btnBaixa.addEventListener('click', () => abrirModalBaixa(reg));
    tdAcoes.appendChild(btnBaixa);

    tr.appendChild(tdLoja);
    tr.appendChild(tdCodigo);
    tr.appendChild(tdDesc);
    tr.appendChild(tdQtd);
    tr.appendChild(tdMes);
    tr.appendChild(tdAcoes);

    elTableBody.appendChild(tr);
  });
}

// ============================================================
// 11. SEÇÃO DE DESTAQUE: VENCIDOS NÃO BAIXADOS
// ============================================================
function renderVencidos(vencidos) {
  while (elSecaoVencidosBody.firstChild) {
    elSecaoVencidosBody.removeChild(elSecaoVencidosBody.firstChild);
  }

  if (vencidos.length === 0) {
    elSecaoVencidos.hidden = true;
    return;
  }

  elSecaoVencidos.hidden = false;

  vencidos.forEach(reg => {
    const tr = document.createElement('tr');
    tr.className = 'linha-vencido';

    const tdLoja = document.createElement('td');
    tdLoja.textContent = reg.loja;

    const tdCodigo = document.createElement('td');
    tdCodigo.className = 'painel-item-codigo';
    tdCodigo.textContent = reg.codigo_projeto;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = reg.descricao_projeto;

    const tdQtd = document.createElement('td');
    tdQtd.textContent = Number(reg.quantidade).toLocaleString('pt-BR');

    const tdMes = document.createElement('td');
    const spanMes = document.createElement('span');
    spanMes.textContent = formatarMesBR(reg.mes_vencimento) + ' ';
    const spanBadge = document.createElement('span');
    spanBadge.className = 'badge-status badge-vencido';
    spanBadge.textContent = 'Vencido';
    tdMes.appendChild(spanMes);
    tdMes.appendChild(spanBadge);

    const tdAcoes = document.createElement('td');
    const btnBaixa = document.createElement('button');
    btnBaixa.type = 'button';
    btnBaixa.className = 'btn btn-acao btn-danger';
    btnBaixa.textContent = 'Dar baixa';
    btnBaixa.addEventListener('click', () => abrirModalBaixa(reg));
    tdAcoes.appendChild(btnBaixa);

    tr.appendChild(tdLoja);
    tr.appendChild(tdCodigo);
    tr.appendChild(tdDesc);
    tr.appendChild(tdQtd);
    tr.appendChild(tdMes);
    tr.appendChild(tdAcoes);

    elSecaoVencidosBody.appendChild(tr);
  });
}

// ============================================================
// 12. MODAL DE BAIXA
// ============================================================
function abrirModalBaixa(registro) {
  registroEmBaixa = registro;
  elModalId.value = registro.id || '';
  elModalQtdDisp.value = Number(registro.quantidade).toLocaleString('pt-BR');
  elModalQtdBaixa.value = Number(registro.quantidade);
  elModalQtdBaixa.max = Number(registro.quantidade);
  elModalMotivo.value = '';
  elModalResponsavel.value = '';
  esconderModalMensagem();
  elModalBaixa.hidden = false;
  elModalQtdBaixa.focus();
  elModalQtdBaixa.select();
}

function fecharModalBaixa() {
  elModalBaixa.hidden = true;
  registroEmBaixa = null;
  esconderModalMensagem();
}

function setarLoadingBaixa(loading) {
  elBtnConfirmarBaixa.disabled = loading;
  elBtnCancelarBaixa.disabled = loading;
  elBtnConfirmarTexto.style.display = loading ? 'none' : 'inline';
  elBtnConfirmarLoading.style.display = loading ? 'inline' : 'none';
}

function mostrarModalMensagem(texto, tipo) {
  elModalMensagem.textContent = texto;
  elModalMensagem.className = 'mensagem ' + tipo;
  elModalMensagem.style.display = 'block';
}

function esconderModalMensagem() {
  elModalMensagem.style.display = 'none';
  elModalMensagem.className = 'mensagem';
}

async function confirmarBaixa() {
  if (!registroEmBaixa) return;

  const qtdDisponivel = Number(registroEmBaixa.quantidade) || 0;
  const qtdBaixa = parseInt(elModalQtdBaixa.value, 10);

  if (!Number.isInteger(qtdBaixa) || qtdBaixa <= 0) {
    mostrarModalMensagem('Quantidade a baixar deve ser um inteiro maior que zero.', 'erro');
    return;
  }
  if (qtdBaixa > qtdDisponivel) {
    mostrarModalMensagem(
      'Quantidade a baixar (' + qtdBaixa + ') excede o disponível (' + qtdDisponivel + ').',
      'erro'
    );
    return;
  }

  const motivo = elModalMotivo.value;
  if (!motivo) {
    mostrarModalMensagem('Selecione o motivo da baixa.', 'erro');
    return;
  }

  const responsavel = (elModalResponsavel.value || '').trim();

  setarLoadingBaixa(true);
  esconderModalMensagem();

  const data = await apiDarBaixa({
    id_registro: registroEmBaixa.id,
    quantidade_baixada: qtdBaixa,
    motivo: motivo,
    responsavel: responsavel
  });

  setarLoadingBaixa(false);

  if (data.ok) {
    mostrarMensagem(data.mensagem || 'Baixa registrada com sucesso.', 'sucesso');
    fecharModalBaixa();
    recarregarDados();
  } else {
    mostrarModalMensagem(data.mensagem || 'Erro ao registrar baixa.', 'erro');
  }
}

// ============================================================
// 13. EXPORTAÇÃO EXCEL (SheetJS)
// ============================================================
function exportarExcel() {
  if (typeof XLSX === 'undefined') {
    mostrarMensagem('Biblioteca de exportação não carregada. Recarregue a página.', 'erro');
    return;
  }

  if (registrosCache.length === 0) {
    alert('Não há dados para exportar.');
    return;
  }

  const lojaFiltro = elFilterStore.value;
  const mesFiltro = elFilterMonth.value;
  const atual = mesAtualStr();

  const grupos = separarRegistros(registrosCache);

  // Exporta tanto futuros filtrados quanto vencidos filtrados (visão completa)
  let dadosExport = [];

  // Futuros aplicados aos filtros (como na tela)
  let futurosFiltrados = grupos.futuros.slice();
  if (lojaFiltro) {
    futurosFiltrados = futurosFiltrados.filter(reg => reg.loja === lojaFiltro);
  }
  if (mesFiltro) {
    futurosFiltrados = futurosFiltrados.filter(reg => reg.mes_vencimento === mesFiltro);
  }
  dadosExport = dadosExport.concat(futurosFiltrados);

  // Vencidos sempre incluídos (filtrados apenas por loja)
  let vencidosFiltrados = grupos.vencidos.slice();
  if (lojaFiltro) {
    vencidosFiltrados = vencidosFiltrados.filter(reg => reg.loja === lojaFiltro);
  }
  dadosExport = dadosExport.concat(vencidosFiltrados);

  if (dadosExport.length === 0) {
    alert('Não há dados para exportar com os filtros atuais.');
    return;
  }

  dadosExport.sort((a, b) => {
    if (a.loja !== b.loja) return a.loja.localeCompare(b.loja, 'pt-BR');
    return a.mes_vencimento.localeCompare(b.mes_vencimento);
  });

  const dadosFormatados = dadosExport.map(reg => ({
    'Loja': reg.loja,
    'Código': reg.codigo_projeto,
    'Descrição': reg.descricao_projeto,
    'Lote': reg.lote || '',
    'Quantidade': Number(reg.quantidade),
    'Mês de Vencimento': reg.mes_vencimento,
    'Status': reg.status || 'ATIVO',
    'ID': reg.id || '',
    'Data Registro': reg.data_registro || '',
    'Atualizado em': reg.atualizado_em || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(dadosFormatados);

  ws['!cols'] = [
    { wch: 20 }, // Loja
    { wch: 10 }, // Código
    { wch: 50 }, // Descrição
    { wch: 15 }, // Lote
    { wch: 12 }, // Quantidade
    { wch: 12 }, // Mês
    { wch: 12 }, // Status
    { wch: 12 }, // ID
    { wch: 20 }, // Data Registro
    { wch: 20 }  // Atualizado em
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Vencimentos');

  const dataAtual = new Date().toISOString().split('T')[0];
  const nomeArquivo = 'vencimentos_cp_fani_' + dataAtual + '.xlsx';

  XLSX.writeFile(wb, nomeArquivo);
}

// ============================================================
// 14. FUNÇÕES AUXILIARES DE UI
// ============================================================
function mostrarLoading(carregando) {
  if (carregando) {
    elLoadingState.style.display = 'flex';
    elDashboardContent.style.display = 'none';
  } else {
    elLoadingState.style.display = 'none';
    elDashboardContent.style.display = 'block';
  }
}

function mostrarMensagem(texto, tipo) {
  if (!elMensagem) return;
  elMensagem.textContent = texto;
  elMensagem.className = 'mensagem ' + tipo;
  elMensagem.style.display = 'block';
}

function esconderMensagem() {
  if (!elMensagem) return;
  elMensagem.style.display = 'none';
  elMensagem.className = 'mensagem';
}

// ============================================================
// 15. HELPERS DE DATA
// ============================================================
function mesAtualStr() {
  const hoje = new Date();
  return hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
}

function mesProximoStr() {
  const hoje = new Date();
  const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  return prox.getFullYear() + '-' + String(prox.getMonth() + 1).padStart(2, '0');
}

function formatarMesBR(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) return mes || '';
  return mes.slice(5, 7) + '/' + mes.slice(0, 4);
}