/**
 * Controle de Vencimentos CP FANI - Lógica do Dashboard (dashboard.js)
 *
 * Responsável por:
 * - Carregar registros do Google Apps Script.
 * - Filtrar apenas vencimentos do mês atual e futuros.
 * - Agrupar dados por loja com contadores.
 * - Aplicar filtros por loja e mês.
 * - Renderizar tabela com cores de status (vermelho/amarelo/neutro).
 * - Atualizar cartões de resumo.
 * - Exportar dados filtrados para Excel via SheetJS.
 */

// ============================================================
// 1. SELEÇÃO DE ELEMENTOS DO DOM
// ============================================================
const elLoadingState = document.getElementById('loading-state');
const elDashboardContent = document.getElementById('dashboard-content');
const elSummaryCurrent = document.getElementById('summary-current');
const elSummaryNext = document.getElementById('summary-next');
const elSummaryStores = document.getElementById('summary-stores');
const elFilterStore = document.getElementById('filter-store');
const elFilterMonth = document.getElementById('filter-month');
const elBtnUpdate = document.getElementById('btn-update');
const elBtnExport = document.getElementById('btn-export');
const elTableBody = document.getElementById('table-body');
const elEmptyState = document.getElementById('empty-state');
const elDataTable = document.getElementById('data-table');
const elAnoAtual = document.getElementById('ano-atual');

// ============================================================
// 2. VARIÁVEIS GLOBAIS
// ============================================================
let registrosCache = [];
let lojasCache = [];

// ============================================================
// 3. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Atualizar ano no rodapé
  if (elAnoAtual) {
    elAnoAtual.textContent = new Date().getFullYear();
  }

  // Definir mês mínimo no filtro (mês atual)
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  elFilterMonth.setAttribute('min', `${ano}-${mes}`);
  elFilterMonth.value = `${ano}-${mes}`;

  // Event listeners
  elFilterStore.addEventListener('change', aplicarFiltros);
  elFilterMonth.addEventListener('change', aplicarFiltros);
  elBtnUpdate.addEventListener('click', carregarDados);
  elBtnExport.addEventListener('click', exportarExcel);

  // Carregar dados iniciais
  carregarDados();
});

// ============================================================
// 4. CARREGAMENTO DE DADOS (GET)
// ============================================================
async function carregarDados() {
  mostrarLoading(true);
  esconderDashboard();

  try {
    const response = await fetch(APPS_SCRIPT_URL);
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.mensagem || 'Erro ao carregar dados do servidor.');
    }

    registrosCache = data.registros || [];
    lojasCache = data.lojas || [];

    // Popular select de lojas
    popularFiltroLojas(lojasCache);

    // Aplicar filtros e renderizar
    aplicarFiltros();

  } catch (error) {
    console.error('Erro no carregamento:', error);
    mostrarErro('Erro ao carregar dados. Verifique sua conexão e tente novamente.');
  } finally {
    mostrarLoading(false);
  }
}

function popularFiltroLojas(lojas) {
  elFilterStore.innerHTML = '<option value="">Todas as lojas</option>';
  lojas.forEach(loja => {
    const option = document.createElement('option');
    option.value = loja;
    option.textContent = loja;
    elFilterStore.appendChild(option);
  });
}

// ============================================================
// 5. FILTRAGEM E RENDERIZAÇÃO
// ============================================================
function aplicarFiltros() {
  const lojaFiltro = elFilterStore.value;
  const mesFiltro = elFilterMonth.value;

  // Obter mês atual para comparação
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
  const mesAtualStr = `${anoAtual}-${mesAtual}`;

  // Calcular próximo mês
  const proximoMes = new Date(anoAtual, hoje.getMonth() + 1, 1);
  const anoProximo = proximoMes.getFullYear();
  const mesProximo = String(proximoMes.getMonth() + 1).padStart(2, '0');
  const mesProximoStr = `${anoProximo}-${mesProximo}`;

  // Filtrar registros: apenas mês atual e futuros
  let registrosFiltrados = registrosCache.filter(reg => {
    return reg.mes_vencimento >= mesAtualStr;
  });

  // Aplicar filtro de loja
  if (lojaFiltro) {
    registrosFiltrados = registrosFiltrados.filter(reg => reg.loja === lojaFiltro);
  }

  // Aplicar filtro de mês
  if (mesFiltro) {
    registrosFiltrados = registrosFiltrados.filter(reg => reg.mes_vencimento === mesFiltro);
  }

  // Ordenar por loja e depois por mês
  registrosFiltrados.sort((a, b) => {
    if (a.loja !== b.loja) return a.loja.localeCompare(b.loja);
    return a.mes_vencimento.localeCompare(b.mes_vencimento);
  });

  // Atualizar cartões de resumo
  atualizarResumo(registrosFiltrados, mesAtualStr, mesProximoStr);

  // Renderizar tabela
  renderizarTabela(registrosFiltrados, mesAtualStr, mesProximoStr);
}

function atualizarResumo(registros, mesAtualStr, mesProximoStr) {
  const totalMesAtual = registros
    .filter(r => r.mes_vencimento === mesAtualStr)
    .reduce((sum, r) => sum + r.quantidade, 0);

  const totalProximoMes = registros
    .filter(r => r.mes_vencimento === mesProximoStr)
    .reduce((sum, r) => sum + r.quantidade, 0);

  const lojasComPendencias = new Set(
    registros.map(r => r.loja)
  ).size;

  elSummaryCurrent.textContent = totalMesAtual;
  elSummaryNext.textContent = totalProximoMes;
  elSummaryStores.textContent = lojasComPendencias;
}

function renderizarTabela(registros, mesAtualStr, mesProximoStr) {
  elTableBody.innerHTML = '';

  if (registros.length === 0) {
    elDataTable.style.display = 'none';
    elEmptyState.style.display = 'block';
    return;
  }

  elDataTable.style.display = 'table';
  elEmptyState.style.display = 'none';

  let lojaAtual = null;

  registros.forEach(reg => {
    // Adicionar linha separadora de loja
    if (reg.loja !== lojaAtual) {
      lojaAtual = reg.loja;
      const trSeparador = document.createElement('tr');
      trSeparador.className = 'linha-separador-loja';
      trSeparador.innerHTML = `<td colspan="5">${lojaAtual}</td>`;
      elTableBody.appendChild(trSeparador);
    }

    // Determinar classe de status
    let classeStatus = 'linha-mes-neutro';
    let badgeClass = 'badge-futuro';
    let badgeText = 'Futuro';

    if (reg.mes_vencimento === mesAtualStr) {
      classeStatus = 'linha-mes-atual';
      badgeClass = 'badge-atual';
      badgeText = 'Este mês';
    } else if (reg.mes_vencimento === mesProximoStr) {
      classeStatus = 'linha-mes-seguinte';
      badgeClass = 'badge-seguinte';
      badgeText = 'Próximo mês';
    }

    // Formatar mês para exibição (AAAA-MM → MM/AAAA)
    const [ano, mes] = reg.mes_vencimento.split('-');
    const mesFormatado = `${mes}/${ano}`;

    const tr = document.createElement('tr');
    tr.className = classeStatus;
    tr.innerHTML = `
      <td>${reg.loja}</td>
      <td>${reg.codigo_projeto}</td>
      <td>${reg.descricao_projeto}</td>
      <td>${reg.quantidade}</td>
      <td>
        ${mesFormatado}
        <span class="badge-status ${badgeClass}">${badgeText}</span>
      </td>
    `;
    elTableBody.appendChild(tr);
  });
}

// ============================================================
// 6. EXPORTAÇÃO EXCEL
// ============================================================
function exportarExcel() {
  if (registrosCache.length === 0) {
    alert('Não há dados para exportar.');
    return;
  }

  const lojaFiltro = elFilterStore.value;
  const mesFiltro = elFilterMonth.value;

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
  const mesAtualStr = `${anoAtual}-${mesAtual}`;

  // Filtrar registros exportáveis (mês atual e futuros)
  let dadosExport = registrosCache.filter(reg => {
    return reg.mes_vencimento >= mesAtualStr;
  });

  if (lojaFiltro) {
    dadosExport = dadosExport.filter(reg => reg.loja === lojaFiltro);
  }

  if (mesFiltro) {
    dadosExport = dadosExport.filter(reg => reg.mes_vencimento === mesFiltro);
  }

  if (dadosExport.length === 0) {
    alert('Não há dados para exportar com os filtros atuais.');
    return;
  }

  // Preparar dados para SheetJS
  const dadosFormatados = dadosExport.map(reg => ({
    'Loja': reg.loja,
    'Código do Projeto': reg.codigo_projeto,
    'Descrição': reg.descricao_projeto,
    'Quantidade': reg.quantidade,
    'Mês de Vencimento': reg.mes_vencimento
  }));

  // Criar workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(dadosFormatados);

  // Ajustar largura das colunas
  ws['!cols'] = [
    { wch: 20 }, // Loja
    { wch: 15 }, // Código
    { wch: 50 }, // Descrição
    { wch: 12 }, // Quantidade
    { wch: 15 }  // Mês
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Vencimentos');

  // Gerar nome do arquivo com data
  const dataAtual = new Date().toISOString().split('T')[0];
  const nomeArquivo = `vencimentos_${dataAtual}.xlsx`;

  // Download
  XLSX.writeFile(wb, nomeArquivo);
}

// ============================================================
// 7. FUNÇÕES AUXILIARES DE UI
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

function esconderDashboard() {
  elDashboardContent.style.display = 'none';
}

function mostrarErro(mensagem) {
  elLoadingState.style.display = 'none';
  elDashboardContent.style.display = 'block';
  
  // Criar elemento de erro temporário
  const divErro = document.createElement('div');
  divErro.className = 'mensagem erro';
  divErro.textContent = mensagem;
  divErro.style.marginBottom = '1rem';
  
  elDashboardContent.insertBefore(divErro, elDashboardContent.firstChild);
  
  // Remover após 5 segundos
  setTimeout(() => {
    divErro.remove();
  }, 5000);
}