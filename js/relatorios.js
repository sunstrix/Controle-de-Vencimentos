/**
 * Controle de Vencimentos CP FANI - Lógica de Relatórios (relatorios.js)
 *
 * Responsável por:
 * - Carregar registros, produtos e baixas (apiGetTudo + apiGetProdutos + apiGetBaixas).
 * - Aplicar filtros de período, loja e categoria a TODOS os gráficos e ao ranking.
 * - Gráfico 1: barras - quantidade a vencer por mês (janela futura).
 * - Gráfico 2: barras horizontais - quantidade a vencer por loja.
 * - Gráfico 3: rosca - distribuição por categoria.
 * - Gráfico 4: barras empilhadas - perdas (quantidade baixada) por motivo e mês.
 * - Ranking: top 10 produtos com mais quantidade a vencer.
 * - Exportar Excel dos dados filtrados (abas "A Vencer", "Baixas", "Ranking").
 * - Botão Imprimir / Salvar PDF (usa o @media print do style.css).
 *
 * Regra do período (documentada):
 * - "A vencer": mês atual + N meses à frente (N = 3, 6, 12) ou todos (0).
 * - "Perdas": mês atual + N meses para trás (N = 3, 6, 12) ou todos (0).
 *
 * Segurança de renderização: NENHUM dado vindo do servidor é inserido via innerHTML.
 */

// ============================================================
// 1. SELEÇÃO DE ELEMENTOS DO DOM
// ============================================================
const elRelLoading = document.getElementById('rel-loading');
const elRelContent = document.getElementById('rel-content');
const elRelResumo = document.getElementById('rel-filtros-resumo');
const elFiltroPeriodo = document.getElementById('filtro-periodo');
const elFiltroLoja = document.getElementById('filtro-loja');
const elFiltroCategoria = document.getElementById('filtro-categoria');
const elBtnRelUpdate = document.getElementById('btn-rel-update');
const elBtnRelExport = document.getElementById('btn-rel-export');
const elBtnRelPrint = document.getElementById('btn-rel-print');
const elRelMensagem = document.getElementById('rel-mensagem');
const elRankingLista = document.getElementById('ranking-lista');
const elRankingVazio = document.getElementById('ranking-vazio');
const elAnoAtual = document.getElementById('ano-atual');
const elTituloChartMes = document.getElementById('titulo-chart-mes');
const elTituloChartPerdas = document.getElementById('titulo-chart-perdas');

// ============================================================
// 2. VARIÁVEIS GLOBAIS
// ============================================================
let registrosCache = [];
let produtosCache = {};   // codigo -> { codigo, descricao, categoria, unidade, ativo }
let baixasCache = [];
let lojasCache = [];

// Instâncias dos gráficos (para destruir antes de recriar)
const graficos = { mes: null, loja: null, categoria: null, perdas: null };

// Conjuntos filtrados atuais (usados também na exportação)
let atuaisAVencer = [];
let atuaisBaixas = [];
let atuaisRanking = [];

const SEM_CATEGORIA = '__SEM__';

// Cores da marca + status (paleta acessível para gráficos)
const PALETA = [
  '#5F6B47', '#8B956D', '#A8B5A0', '#7A8B7E', '#4A5A4E',
  '#D69E2E', '#C53030', '#4A5568', '#6F7A55', '#718096'
];

const CORES_MOTIVO = {
  vendido: '#276749',
  descartado: '#C53030',
  transferido: '#D69E2E',
  vencido: '#4A5568',
  outros: '#7A8B7E'
};

// ============================================================
// 3. INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (elAnoAtual) {
    elAnoAtual.textContent = new Date().getFullYear();
  }

  if (typeof Chart === 'undefined') {
    mostrarLoading(false);
    mostrarMensagem('Biblioteca de gráficos não carregada. Recarregue a página.', 'erro');
    return;
  }

  // Padrões de legibilidade (mobile-first)
  Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#2D3748';
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.tooltip.padding = 10;

  elFiltroPeriodo.addEventListener('change', aplicarFiltrosERender);
  elFiltroLoja.addEventListener('change', aplicarFiltrosERender);
  elFiltroCategoria.addEventListener('change', aplicarFiltrosERender);
  elBtnRelUpdate.addEventListener('click', carregarTudo);
  elBtnRelExport.addEventListener('click', exportarExcel);
  elBtnRelPrint.addEventListener('click', () => window.print());

  carregarTudo();
});

// ============================================================
// 4. CARREGAMENTO
// ============================================================
async function carregarTudo() {
  mostrarLoading(true);
  esconderMensagem();

  const resultados = await Promise.all([
    apiGetTudo(),
    apiGetProdutos(),
    apiGetBaixas()
  ]);

  const [tudo, produtos, baixas] = resultados;

  if (!tudo.ok || !produtos.ok || !baixas.ok) {
    const msg =
      (!tudo.ok && tudo.mensagem) ||
      (!produtos.ok && produtos.mensagem) ||
      (!baixas.ok && baixas.mensagem) ||
      CONFIG.MENSAGENS.ERRO_SERVIDOR;
    mostrarMensagem(msg + ' Clique em "Atualizar" para tentar novamente.', 'erro');
    mostrarLoading(false);
    return;
  }

  registrosCache = tudo.registros || [];
  lojasCache = tudo.lojas || [];
  baixasCache = baixas.baixas || [];

  produtosCache = {};
  (produtos.produtos || []).forEach(p => {
    if (!produtosCache.hasOwnProperty(p.codigo)) {
      produtosCache[p.codigo] = p;
    }
  });

  popularFiltroLojas();
  popularFiltroCategorias();
  aplicarFiltrosERender();
  mostrarLoading(false);
}

function popularFiltroLojas() {
  const valorAtual = elFiltroLoja.value;

  while (elFiltroLoja.firstChild) {
    elFiltroLoja.removeChild(elFiltroLoja.firstChild);
  }

  const optTodas = document.createElement('option');
  optTodas.value = '';
  optTodas.textContent = 'Todas as lojas';
  elFiltroLoja.appendChild(optTodas);

  const unicas = {};
  lojasCache.forEach(l => { unicas[l] = true; });
  registrosCache.forEach(r => { if (r.loja) unicas[r.loja] = true; });

  Object.keys(unicas).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(loja => {
    const option = document.createElement('option');
    option.value = loja;
    option.textContent = loja;
    elFiltroLoja.appendChild(option);
  });

  elFiltroLoja.value = valorAtual;
}

function popularFiltroCategorias() {
  const valorAtual = elFiltroCategoria.value;

  while (elFiltroCategoria.firstChild) {
    elFiltroCategoria.removeChild(elFiltroCategoria.firstChild);
  }

  const optTodas = document.createElement('option');
  optTodas.value = '';
  optTodas.textContent = 'Todas as categorias';
  elFiltroCategoria.appendChild(optTodas);

  const unicas = {};
  Object.keys(produtosCache).forEach(codigo => {
    const cat = (produtosCache[codigo].categoria || '').trim();
    if (cat) unicas[cat] = true;
  });

  Object.keys(unicas).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    elFiltroCategoria.appendChild(option);
  });

  // Opção para registros/produtos sem categoria
  const optSem = document.createElement('option');
  optSem.value = SEM_CATEGORIA;
  optSem.textContent = 'Sem categoria';
  elFiltroCategoria.appendChild(optSem);

  elFiltroCategoria.value = valorAtual;
}

// ============================================================
// 5. FILTRAGEM E AGREGAÇÃO
// ============================================================
function periodoSelecionado() {
  return parseInt(elFiltroPeriodo.value, 10) || 0;
}

function categoriaDe(codigo) {
  const p = produtosCache[codigo];
  return p && p.categoria ? p.categoria.trim() : '';
}

function aplicarFiltrosERender() {
  const N = periodoSelecionado();
  const lojaFiltro = elFiltroLoja.value;
  const catFiltro = elFiltroCategoria.value;
  const atual = mesAtualStr();

  // Janelas de meses
  const ultimoMesFuturo = N > 0 ? addMonthsStr(atual, N - 1) : null;
  const primeiroMesPassado = N > 0 ? addMonthsStr(atual, -(N - 1)) : null;

  // --- Registros "a vencer": ATIVO, mês >= atual, dentro da janela e filtros ---
  atuaisAVencer = registrosCache.filter(reg => {
    if (reg.status === 'BAIXADO') return false;
    if (!reg.mes_vencimento || reg.mes_vencimento < atual) return false;
    if (ultimoMesFuturo && reg.mes_vencimento > ultimoMesFuturo) return false;
    if (lojaFiltro && reg.loja !== lojaFiltro) return false;
    if (catFiltro && !categoriaBate(reg.codigo_projeto, catFiltro)) return false;
    return true;
  });

  // --- Baixas (perdas): dentro da janela passada e filtros ---
  atuaisBaixas = baixasCache.filter(b => {
    const mesBaixa = (b.data || '').slice(0, 7);
    if (!mesBaixa) return false;
    if (mesBaixa > atual) return false;
    if (primeiroMesPassado && mesBaixa < primeiroMesPassado) return false;
    if (lojaFiltro && b.loja !== lojaFiltro) return false;
    if (catFiltro && !categoriaBate(b.codigo, catFiltro)) return false;
    return true;
  });

  // --- Ranking top 10 por código ---
  const porCodigo = {};
  atuaisAVencer.forEach(reg => {
    if (!porCodigo[reg.codigo_projeto]) {
      porCodigo[reg.codigo_projeto] = {
        codigo: reg.codigo_projeto,
        descricao: reg.descricao_projeto,
        quantidade: 0
      };
    }
    porCodigo[reg.codigo_projeto].quantidade += Number(reg.quantidade) || 0;
  });
  atuaisRanking = Object.keys(porCodigo)
    .map(k => porCodigo[k])
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

  atualizarResumoFiltros(N, lojaFiltro, catFiltro);
  atualizarTitulos(N);
  renderGraficoMes(N, atual, ultimoMesFuturo);
  renderGraficoLoja();
  renderGraficoCategoria();
  renderGraficoPerdas(N, atual, primeiroMesPassado);
  renderRanking();
}

function categoriaBate(codigo, catFiltro) {
  const cat = categoriaDe(codigo);
  if (catFiltro === SEM_CATEGORIA) return cat === '';
  return cat === catFiltro;
}

function atualizarResumoFiltros(N, lojaFiltro, catFiltro) {
  const rotuloPeriodo = N > 0 ? N + ' meses' : 'tudo';
  const rotuloLoja = lojaFiltro || 'todas as lojas';
  let rotuloCat = 'todas as categorias';
  if (catFiltro === SEM_CATEGORIA) rotuloCat = 'sem categoria';
  else if (catFiltro) rotuloCat = catFiltro;

  const agora = new Date();
  const geradoEm =
    String(agora.getDate()).padStart(2, '0') + '/' +
    String(agora.getMonth() + 1).padStart(2, '0') + '/' +
    agora.getFullYear() + ' ' +
    String(agora.getHours()).padStart(2, '0') + ':' +
    String(agora.getMinutes()).padStart(2, '0');

  elRelResumo.textContent =
    'Período: ' + rotuloPeriodo +
    ' | Loja: ' + rotuloLoja +
    ' | Categoria: ' + rotuloCat +
    ' | Gerado em ' + geradoEm;
}

function atualizarTitulos(N) {
  elTituloChartMes.textContent =
    'Quantidade a vencer por mês (' +
    (N > 0 ? 'próximos ' + N + ' meses' : 'todos os meses futuros') + ')';
  elTituloChartPerdas.textContent =
    'Perdas: quantidade baixada por motivo, por mês (' +
    (N > 0 ? 'últimos ' + N + ' meses' : 'todo o histórico') + ')';
}

// ============================================================
// 6. GRÁFICO 1 - A VENCER POR MÊS
// ============================================================
function renderGraficoMes(N, atual, ultimoMesFuturo) {
  let meses;
  if (N > 0) {
    meses = [];
    for (let i = 0; i < N; i++) meses.push(addMonthsStr(atual, i));
  } else {
    meses = mesesUnicosOrdenados(atuaisAVencer.map(r => r.mes_vencimento), atual, 'futuro');
  }

  const valores = meses.map(m =>
    atuaisAVencer
      .filter(r => r.mes_vencimento === m)
      .reduce((s, r) => s + (Number(r.quantidade) || 0), 0)
  );

  const config = {
    type: 'bar',
    data: {
      labels: meses.map(formatarMesBR),
      datasets: [{
        label: 'Quantidade a vencer',
        data: valores,
        backgroundColor: '#5F6B47',
        borderRadius: 4
      }]
    },
    options: opcoesBarraVerticaal()
  };

  recriarGrafico('mes', 'chart-mes', config);
}

// ============================================================
// 7. GRÁFICO 2 - A VENCER POR LOJA
// ============================================================
function renderGraficoLoja() {
  const porLoja = {};
  atuaisAVencer.forEach(reg => {
    porLoja[reg.loja] = (porLoja[reg.loja] || 0) + (Number(reg.quantidade) || 0);
  });

  const lojas = Object.keys(porLoja).sort((a, b) => porLoja[b] - porLoja[a]);
  const valores = lojas.map(l => porLoja[l]);

  const config = {
    type: 'bar',
    data: {
      labels: lojas,
      datasets: [{
        label: 'Quantidade a vencer',
        data: valores,
        backgroundColor: '#8B956D',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' }
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { ticks: { autoSkip: false } }
      }
    }
  };

  recriarGrafico('loja', 'chart-loja', config);
}

// ============================================================
// 8. GRÁFICO 3 - DISTRIBUIÇÃO POR CATEGORIA
// ============================================================
function renderGraficoCategoria() {
  const porCat = {};
  atuaisAVencer.forEach(reg => {
    const cat = categoriaDe(reg.codigo_projeto) || 'Sem categoria';
    porCat[cat] = (porCat[cat] || 0) + (Number(reg.quantidade) || 0);
  });

  const cats = Object.keys(porCat).sort((a, b) => porCat[b] - porCat[a]);
  const valores = cats.map(c => porCat[c]);
  const cores = cats.map((_, i) => PALETA[i % PALETA.length]);

  const config = {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        label: 'Quantidade a vencer',
        data: valores,
        backgroundColor: cores,
        borderColor: '#FFFFFF',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
              const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
              return ctx.label + ': ' + ctx.parsed.toLocaleString('pt-BR') + ' (' + pct + '%)';
            }
          }
        }
      }
    }
  };

  recriarGrafico('categoria', 'chart-categoria', config);
}

// ============================================================
// 9. GRÁFICO 4 - PERDAS POR MOTIVO E MÊS (empilhado)
// ============================================================
function renderGraficoPerdas(N, atual, primeiroMesPassado) {
  let meses;
  if (N > 0) {
    meses = [];
    for (let i = N - 1; i >= 0; i--) meses.push(addMonthsStr(atual, -i));
  } else {
    meses = mesesUnicosOrdenados(atuaisBaixas.map(b => (b.data || '').slice(0, 7)), atual, 'passado');
  }

  // Motivos presentes (padrões primeiro)
  const motivosPadrao = ['vendido', 'descartado', 'transferido', 'vencido'];
  const motivosSet = {};
  atuaisBaixas.forEach(b => { motivosSet[(b.motivo || 'outros').toLowerCase()] = true; });
  const motivos = motivosPadrao.filter(m => motivosSet[m]);
  Object.keys(motivosSet).forEach(m => {
    if (motivos.indexOf(m) === -1) motivos.push(m);
  });

  const datasets = motivos.map(motivo => {
    const cor = CORES_MOTIVO[motivo] || CORES_MOTIVO.outros;
    return {
      label: motivo,
      backgroundColor: cor,
      borderRadius: 3,
      data: meses.map(m =>
        atuaisBaixas
          .filter(b => (b.data || '').slice(0, 7) === m && (b.motivo || 'outros').toLowerCase() === motivo)
          .reduce((s, b) => s + (Number(b.quantidade_baixada) || 0), 0)
      )
    };
  });

  const config = {
    type: 'bar',
    data: { labels: meses.map(formatarMesBR), datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' }
      },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 45, autoSkip: false } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  };

  recriarGrafico('perdas', 'chart-perdas', config);
}

// ============================================================
// 10. RANKING TOP 10
// ============================================================
function renderRanking() {
  while (elRankingLista.firstChild) {
    elRankingLista.removeChild(elRankingLista.firstChild);
  }

  if (atuaisRanking.length === 0) {
    elRankingVazio.style.display = 'block';
    return;
  }
  elRankingVazio.style.display = 'none';

  atuaisRanking.forEach(item => {
    const li = document.createElement('li');
    li.className = 'ranking-item';

    const spanNome = document.createElement('span');
    spanNome.textContent = item.codigo + ' - ' + item.descricao;

    const spanQtd = document.createElement('span');
    spanQtd.className = 'painel-item-codigo';
    spanQtd.textContent = Number(item.quantidade).toLocaleString('pt-BR');

    li.appendChild(spanNome);
    li.appendChild(spanQtd);
    elRankingLista.appendChild(li);
  });
}

// ============================================================
// 11. INFRAESTRUTURA DE GRÁFICOS
// ============================================================
function opcoesBarraVerticaal() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' }
    },
    scales: {
      x: { ticks: { maxRotation: 45, autoSkip: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };
}

function recriarGrafico(chave, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (graficos[chave]) {
    graficos[chave].destroy();
    graficos[chave] = null;
  }
  graficos[chave] = new Chart(canvas.getContext('2d'), config);
}

function mesesUnicosOrdenados(lista, atual, direcao) {
  const set = {};
  lista.forEach(m => { if (m) set[m] = true; });
  let meses = Object.keys(set).sort();
  if (meses.length === 0) meses = [atual];
  if (direcao === 'futuro') {
    if (meses.indexOf(atual) === -1) meses.unshift(atual);
    meses = meses.filter(m => m >= atual).sort();
  } else {
    meses = meses.filter(m => m <= atual).sort();
    if (meses.length === 0) meses = [atual];
  }
  return meses;
}

// ============================================================
// 12. EXPORTAÇÃO EXCEL (dados filtrados)
// ============================================================
function exportarExcel() {
  if (typeof XLSX === 'undefined') {
    mostrarMensagem('Biblioteca de exportação não carregada. Recarregue a página.', 'erro');
    return;
  }

  if (atuaisAVencer.length === 0 && atuaisBaixas.length === 0) {
    alert('Não há dados filtrados para exportar.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Aba 1: A Vencer
  if (atuaisAVencer.length > 0) {
    const linhas = atuaisAVencer
      .slice()
      .sort((a, b) => {
        if (a.loja !== b.loja) return a.loja.localeCompare(b.loja, 'pt-BR');
        return a.mes_vencimento.localeCompare(b.mes_vencimento);
      })
      .map(reg => ({
        'Loja': reg.loja,
        'Código': reg.codigo_projeto,
        'Descrição': reg.descricao_projeto,
        'Categoria': categoriaDe(reg.codigo_projeto) || 'Sem categoria',
        'Lote': reg.lote || '',
        'Quantidade': Number(reg.quantidade),
        'Mês de Vencimento': reg.mes_vencimento,
        'ID': reg.id || ''
      }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [
      { wch: 20 }, { wch: 10 }, { wch: 45 }, { wch: 18 },
      { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'A Vencer');
  }

  // Aba 2: Baixas
  if (atuaisBaixas.length > 0) {
    const linhas = atuaisBaixas.map(b => ({
      'Data': b.data,
      'Loja': b.loja,
      'Código': b.codigo,
      'Descrição': (produtosCache[b.codigo] || {}).descricao || 'Código não cadastrado',
      'Quantidade Baixada': Number(b.quantidade_baixada),
      'Motivo': b.motivo,
      'Responsável': b.responsavel || '',
      'ID Registro': b.id_registro || ''
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 45 },
      { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Baixas');
  }

  // Aba 3: Ranking
  if (atuaisRanking.length > 0) {
    const linhas = atuaisRanking.map((item, i) => ({
      'Posição': i + 1,
      'Código': item.codigo,
      'Descrição': item.descricao,
      'Quantidade a Vencer': Number(item.quantidade)
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [
      { wch: 10 }, { wch: 10 }, { wch: 50 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
  }

  const dataAtual = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, 'relatorios_cp_fani_' + dataAtual + '.xlsx');
}

// ============================================================
// 13. FUNÇÕES AUXILIARES DE UI
// ============================================================
function mostrarLoading(carregando) {
  if (carregando) {
    elRelLoading.style.display = 'flex';
    elRelContent.style.display = 'none';
  } else {
    elRelLoading.style.display = 'none';
    elRelContent.style.display = 'block';
  }
}

function mostrarMensagem(texto, tipo) {
  if (!elRelMensagem) return;
  elRelMensagem.textContent = texto;
  elRelMensagem.className = 'mensagem ' + tipo;
  elRelMensagem.style.display = 'block';
}

function esconderMensagem() {
  if (!elRelMensagem) return;
  elRelMensagem.style.display = 'none';
  elRelMensagem.className = 'mensagem';
}

// ============================================================
// 14. HELPERS DE DATA
// ============================================================
function mesAtualStr() {
  const hoje = new Date();
  return hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
}

function addMonthsStr(base, delta) {
  const y = parseInt(base.slice(0, 4), 10);
  const m = parseInt(base.slice(5, 7), 10);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function formatarMesBR(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) return mes || '';
  return mes.slice(5, 7) + '/' + mes.slice(0, 4);
}