/**
 * Controle de Vencimentos CP FANI - Google Apps Script
 * 
 * Backend para formulário, dashboard, produtos, baixas e relatórios.
 * 
 * Rotas GET (via parâmetro ?action=):
 * - Sem action: retorna lojas, projetos, registros (legado, compatível)
 * - registros?loja=X: retorna registros de uma loja específica (painel R1)
 * - produtos: retorna lista completa de produtos (para produtos.html)
 * - baixas: retorna histórico de baixas
 * 
 * Rotas POST (via campo "action" no payload):
 * - Sem action ou "registrar": registra/soma lote (legado + novo)
 * - salvarProduto: cria/edita/inativa produto
 * - darBaixa: registra baixa total/parcial
 * 
 * ⚠️ ANTES DE RODAR A MIGRAÇÃO: faça uma cópia da planilha (Arquivo > Fazer cópia)
 * 
 * Para rodar a migração: Editor do Apps Script > selecione "migrarPlanilha" > Executar
 *   A migração é idempotente: formata colunas como texto, preenche IDs/status vazios,
 *   cria cabeçalhos novos (Projetos C-E, Registros G-J) e a aba "Baixas" se não existir.
 * Para listar duplicados: Editor do Apps Script > selecione "listarCodigosDuplicados" > Executar
 */

// ============================================================
// LIMITES DE TAMANHO DE CAMPOS (H5 - autoridade server-side)
// ============================================================
var LIMITES = {
  LOJA: 60,
  LOTE: 20,
  DESCRICAO: 120,
  CATEGORIA: 120,
  UNIDADE: 120,
  MOTIVO: 40,
  RESPONSAVEL: 80
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Remove caracteres não-dígitos e normaliza código para 5 dígitos com zeros à esquerda
 */
function normalizeCodigo(codigo) {
  if (!codigo) return '';
  var digits = String(codigo).replace(/\D/g, '');
  return digits.padStart(5, '0');
}

/**
 * Sanitiza texto contra injeção de fórmula (remove = + - @ do início)
 */
function sanitizeText(text) {
  if (!text) return '';
  var s = String(text).trim();
  // Remove prefixos perigosos que Google Sheets interpreta como fórmula
  while (s.length > 0 && /^[=+\-@]/.test(s)) {
    s = s.substring(1);
  }
  return s;
}

/**
 * Valida tamanho máximo de um campo de texto (H5).
 * Lança erro com mensagem clara se exceder o limite.
 */
function validateLength(nome, valor, max) {
  var v = String(valor || '');
  if (v.length > max) {
    throw new Error(nome + ' deve ter no máximo ' + max + ' caracteres (atual: ' + v.length + ').');
  }
}

/**
 * Formata data/hora no fuso de São Paulo
 */
function formatDateTime(date, format) {
  return Utilities.formatDate(date, 'America/Sao_Paulo', format || 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Retorna data atual formatada como AAAA-MM no fuso de São Paulo
 */
function getCurrentMonth() {
  return formatDateTime(new Date(), 'yyyy-MM');
}

/**
 * Gera próximo ID sequencial para registros (formato R000001)
 */
function generateNextId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'R000001';
  var ids = sheet.getRange(2, 7, lastRow - 1, 1).getValues(); // Coluna G
  var maxNum = 0;
  ids.forEach(function(row) {
    var id = String(row[0]).trim();
    var match = id.match(/^R(\d+)$/);
    if (match) {
      var num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return 'R' + String(maxNum + 1).padStart(6, '0');
}

/**
 * Helper para ler dados de sheet ignorando cabeçalho
 */
function getSheetData(sheet, numCols) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
}

/**
 * Preenche cabeçalhos (linha 1) SOMENTE onde a célula está vazia.
 * Idempotente: nunca sobrescreve cabeçalhos existentes.
 * @param {Sheet} sheet - aba alvo
 * @param {Object} nomes - mapa { numeroDaColuna: 'nomeDoCabecalho' }
 */
function garantirCabecalhos(sheet, nomes) {
  var linhaCabecalho = sheet.getRange(1, 1, 1, Math.max(sheet.getMaxColumns(), 10)).getValues()[0];
  for (var col in nomes) {
    if (!nomes.hasOwnProperty(col)) continue;
    var c = Number(col);
    var atual = String(linhaCabecalho[c - 1] || '').trim();
    if (atual === '') {
      sheet.getRange(1, c).setValue(nomes[col]);
    }
  }
}

/**
 * Garante que a aba "Baixas" exista com os 7 cabeçalhos e código como texto.
 * Idempotente: se a aba já existe, apenas completa cabeçalhos vazios.
 */
function garantirAbaBaixas(ss) {
  var sheet = ss.getSheetByName('Baixas');
  if (!sheet) {
    sheet = ss.insertSheet('Baixas');
  }
  garantirCabecalhos(sheet, {
    1: 'id_registro',
    2: 'data',
    3: 'loja',
    4: 'codigo',
    5: 'quantidade_baixada',
    6: 'motivo',
    7: 'responsavel'
  });
  // Código sempre como texto (preserva zeros à esquerda)
  var lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(1, 4, lastRow, 1).setNumberFormat('@');
  return sheet;
}

// ============================================================
// GET
// ============================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    
    // Rota aditiva: registros filtrados por loja (para painel R1 do formulário)
    if (action === 'registros') {
      return doGetRegistrosPorLoja(e.parameter.loja);
    }
    
    // Rota aditiva: lista completa de produtos
    if (action === 'produtos') {
      return doGetProdutos();
    }
    
    // Rota aditiva: histórico de baixas
    if (action === 'baixas') {
      return doGetBaixas();
    }
    
    // GET legado (sem action): retorna tudo para compatibilidade
    return doGetLegado();
    
  } catch (error) {
    return jsonResponse(false, 'Erro ao ler dados: ' + error.message);
  }
}

/**
 * GET legado: retorna lojas, projetos e todos os registros (compatibilidade)
 */
function doGetLegado() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLojas = ss.getSheetByName('Lojas');
  var sheetProjetos = ss.getSheetByName('Projetos');
  var sheetRegistros = ss.getSheetByName('Registros');

  // 1. Lojas (coluna A)
  var lojasRaw = getSheetData(sheetLojas, 1);
  var lojas = [];
  var lojasSet = {};
  lojasRaw.forEach(function(row) {
    var v = String(row[0] || '').trim();
    if (v && !lojasSet[v]) {
      lojasSet[v] = true;
      lojas.push(v);
    }
  });

  // 2. Projetos (colunas A-E): código, descrição, categoria, unidade, ativo
  // Opção C: primeiro encontrado para códigos duplicados
  var projetosRaw = getSheetData(sheetProjetos, 5);
  var projetos = {};
  var projetosLista = [];
  projetosRaw.forEach(function(row, idx) {
    var codigo = normalizeCodigo(row[0]);
    if (!codigo) return;
    var descricao = String(row[1] || '').trim();
    var categoria = String(row[2] || '').trim();
    var unidade = String(row[3] || '').trim();
    var ativo = String(row[4] || 'SIM').trim().toUpperCase();
    if (ativo !== 'SIM' && ativo !== 'NÃO') ativo = 'SIM';
    
    var produto = {
      codigo: codigo,
      descricao: descricao,
      categoria: categoria,
      unidade: unidade,
      ativo: ativo,
      linha: idx + 2
    };
    
    projetosLista.push(produto);
    
    // Opção C: mantém apenas o primeiro encontrado
    if (!projetos.hasOwnProperty(codigo)) {
      projetos[codigo] = descricao;
    }
  });

  // 3. Registros (colunas A-J)
  var registrosRaw = getSheetData(sheetRegistros, 10);
  var registros = [];
  registrosRaw.forEach(function(row) {
    var codigo = normalizeCodigo(row[2]);
    if (!codigo) return;
    
    var dataRegistro = row[0] ? (row[0] instanceof Date 
      ? formatDateTime(row[0], 'yyyy-MM-dd HH:mm:ss') 
      : String(row[0])) : '';
    
    var mesVencimento = row[5] ? (row[5] instanceof Date 
      ? formatDateTime(row[5], 'yyyy-MM') 
      : String(row[5])) : '';
    
    var atualizadoEm = row[9] ? (row[9] instanceof Date 
      ? formatDateTime(row[9], 'yyyy-MM-dd HH:mm:ss') 
      : String(row[9])) : '';
    
    registros.push({
      data_registro: dataRegistro,
      loja: String(row[1] || '').trim(),
      codigo_projeto: codigo,
      descricao_projeto: String(row[3] || 'Código não cadastrado').trim(),
      quantidade: Number(row[4]) || 0,
      mes_vencimento: mesVencimento,
      id: String(row[6] || '').trim(),
      lote: String(row[7] || '').trim(),
      status: String(row[8] || 'ATIVO').trim().toUpperCase(),
      atualizado_em: atualizadoEm
    });
  });

  return jsonResponse(true, {
    lojas: lojas,
    projetos: projetos,
    registros: registros
  });
}

/**
 * GET aditivo: registros filtrados por loja (painel R1 do formulário)
 */
function doGetRegistrosPorLoja(loja) {
  if (!loja || loja.trim() === '') {
    return jsonResponse(false, 'Parâmetro loja é obrigatório.');
  }
  
  loja = loja.trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRegistros = ss.getSheetByName('Registros');
  var registrosRaw = getSheetData(sheetRegistros, 10);
  var mesAtual = getCurrentMonth();
  
  var registros = [];
  registrosRaw.forEach(function(row) {
    var codigo = normalizeCodigo(row[2]);
    if (!codigo) return;
    if (String(row[1] || '').trim() !== loja) return;
    
    var mesVencimento = row[5] ? (row[5] instanceof Date 
      ? formatDateTime(row[5], 'yyyy-MM') 
      : String(row[5])) : '';
    
    if (!mesVencimento || mesVencimento < mesAtual) return;
    
    var status = String(row[8] || 'ATIVO').trim().toUpperCase();
    if (status !== 'ATIVO') return;
    
    registros.push({
      codigo_projeto: codigo,
      descricao_projeto: String(row[3] || 'Código não cadastrado').trim(),
      quantidade: Number(row[4]) || 0,
      mes_vencimento: mesVencimento,
      lote: String(row[7] || '').trim()
    });
  });
  
  // Ordena por mês e depois por código
  registros.sort(function(a, b) {
    if (a.mes_vencimento !== b.mes_vencimento) {
      return a.mes_vencimento.localeCompare(b.mes_vencimento);
    }
    return a.codigo_projeto.localeCompare(b.codigo_projeto);
  });
  
  return jsonResponse(true, { registros: registros });
}

/**
 * GET aditivo: lista completa de produtos (para produtos.html)
 */
function doGetProdutos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetProjetos = ss.getSheetByName('Projetos');
  var projetosRaw = getSheetData(sheetProjetos, 5);
  
  var produtos = [];
  projetosRaw.forEach(function(row, idx) {
    var codigo = normalizeCodigo(row[0]);
    if (!codigo) return;
    
    produtos.push({
      codigo: codigo,
      descricao: String(row[1] || '').trim(),
      categoria: String(row[2] || '').trim(),
      unidade: String(row[3] || '').trim(),
      ativo: String(row[4] || 'SIM').trim().toUpperCase(),
      linha: idx + 2
    });
  });
  
  return jsonResponse(true, { produtos: produtos });
}

/**
 * GET aditivo: histórico de baixas
 */
function doGetBaixas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetBaixas = ss.getSheetByName('Baixas');
  
  if (!sheetBaixas) {
    return jsonResponse(true, { baixas: [] });
  }
  
  var baixasRaw = getSheetData(sheetBaixas, 7);
  var baixas = [];
  
  baixasRaw.forEach(function(row) {
    var data = row[1] ? (row[1] instanceof Date 
      ? formatDateTime(row[1], 'yyyy-MM-dd HH:mm:ss') 
      : String(row[1])) : '';
    
    baixas.push({
      id_registro: String(row[0] || '').trim(),
      data: data,
      loja: String(row[2] || '').trim(),
      codigo: normalizeCodigo(row[3]),
      quantidade_baixada: Number(row[4]) || 0,
      motivo: String(row[5] || '').trim(),
      responsavel: String(row[6] || '').trim()
    });
  });
  
  return jsonResponse(true, { baixas: baixas });
}

// ============================================================
// POST
// ============================================================

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse(false, 'Servidor ocupado. Por favor, tente novamente em alguns segundos.');
  }

  try {
    var payload = JSON.parse(e.postData.contents);
    var action = (payload && payload.action) || 'registrar';
    
    if (action === 'salvarProduto') {
      return doPostSalvarProduto(payload);
    }
    
    if (action === 'darBaixa') {
      return doPostDarBaixa(payload);
    }
    
    // Action padrão: registrar/somar lote
    return doPostRegistrar(payload);
    
  } catch (error) {
    return jsonResponse(false, error.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST padrão: registra novo lote ou soma quantidade ao existente.
 * Chave de soma: loja + código + lote + mês (status ATIVO).
 */
function doPostRegistrar(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Registros');
  if (!sheet) {
    throw new Error("Aba 'Registros' não encontrada na planilha.");
  }

  // --- VALIDAÇÕES ---
  
  // 1. Código do projeto: exatamente 5 dígitos
  var codigo = normalizeCodigo(payload.codigo_projeto);
  if (!codigo || !/^\d{5}$/.test(codigo)) {
    throw new Error('O código do projeto deve ter exatamente 5 dígitos.');
  }

  // 2. Loja: obrigatória, sanitizada, dentro do limite e existente na aba "Lojas"
  var loja = sanitizeText(payload.loja);
  if (!loja) {
    throw new Error('A loja é obrigatória.');
  }
  validateLength('Loja', loja, LIMITES.LOJA);
  
  var sheetLojas = ss.getSheetByName('Lojas');
  var lojasRaw = getSheetData(sheetLojas, 1);
  var lojaExiste = false;
  lojasRaw.forEach(function(row) {
    if (String(row[0] || '').trim() === loja) lojaExiste = true;
  });
  if (!lojaExiste) {
    throw new Error('Loja não cadastrada no sistema.');
  }

  // 3. Quantidade: inteiro maior que zero
  var qtd = Number(payload.quantidade);
  if (!Number.isInteger(qtd) || qtd <= 0) {
    throw new Error('A quantidade deve ser um número inteiro maior que zero.');
  }

  // 4. Mês de vencimento: formato AAAA-MM, não pode ser passado
  var mesVencimento = payload.mes_vencimento;
  if (!mesVencimento || !/^\d{4}-\d{2}$/.test(mesVencimento)) {
    throw new Error('Mês de vencimento inválido. Use o formato AAAA-MM.');
  }
  
  var mesAtual = getCurrentMonth();
  if (mesVencimento < mesAtual) {
    throw new Error('Não é permitido registrar vencimentos em meses passados.');
  }

  // 5. Descrição: buscada no servidor (não confiada no cliente)
  var sheetProjetos = ss.getSheetByName('Projetos');
  var projetosRaw = getSheetData(sheetProjetos, 2);
  var descricao = 'Código não cadastrado';
  projetosRaw.forEach(function(row) {
    if (normalizeCodigo(row[0]) === codigo) {
      descricao = String(row[1] || '').trim();
    }
  });

  // 6. Lote (opcional, sanitizado e dentro do limite)
  var lote = sanitizeText(payload.lote || '');
  validateLength('Lote', lote, LIMITES.LOTE);

  // --- LÓGICA DE SOMA DE DUPLICADOS (chave: loja+código+lote+mês, status ATIVO) ---
  
  var registrosRaw = getSheetData(sheet, 10);
  var linhaExistente = -1;
  var qtdExistente = 0;
  
  for (var i = 0; i < registrosRaw.length; i++) {
    var row = registrosRaw[i];
    var rowCodigo = normalizeCodigo(row[2]);
    var rowLoja = String(row[1] || '').trim();
    var rowLote = String(row[7] || '').trim();
    var rowMes = row[5] ? (row[5] instanceof Date 
      ? formatDateTime(row[5], 'yyyy-MM') 
      : String(row[5])) : '';
    var rowStatus = String(row[8] || 'ATIVO').trim().toUpperCase();
    
    if (rowCodigo === codigo &&
        rowLoja === loja &&
        rowLote === lote &&
        rowMes === mesVencimento &&
        rowStatus === 'ATIVO') {
      linhaExistente = i + 2; // +2 porque getSheetData ignora cabeçalho
      qtdExistente = Number(row[4]) || 0;
      break;
    }
  }
  
  var agora = formatDateTime(new Date(), 'yyyy-MM-dd HH:mm:ss');
  
  if (linhaExistente > 0) {
    // Soma quantidade ao registro existente
    var novaQtd = qtdExistente + qtd;
    sheet.getRange(linhaExistente, 5).setValue(novaQtd); // Coluna E: quantidade
    sheet.getRange(linhaExistente, 10).setValue(agora); // Coluna J: atualizado_em
    
    return jsonResponse(true, {
      somado: true,
      mensagem: 'Quantidade somada ao registro existente. Novo total: ' + novaQtd + '.'
    });
  }
  
  // --- NOVO REGISTRO ---
  
  var novoId = generateNextId(sheet);
  
  sheet.appendRow([
    agora,           // A: data_registro
    loja,            // B: loja
    codigo,          // C: codigo_projeto
    descricao,       // D: descricao_projeto
    qtd,             // E: quantidade
    mesVencimento,   // F: mes_vencimento
    novoId,          // G: id
    lote,            // H: lote
    'ATIVO',         // I: status
    ''               // J: atualizado_em (vazio pois é novo)
  ]);

  return jsonResponse(true, {
    somado: false,
    mensagem: 'Registro salvo com sucesso!'
  });
}

/**
 * POST aditivo: cria, edita ou inativa produto
 */
function doPostSalvarProduto(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Projetos');
  if (!sheet) {
    throw new Error("Aba 'Projetos' não encontrada na planilha.");
  }

  var codigo = normalizeCodigo(payload.codigo);
  if (!codigo || !/^\d{5}$/.test(codigo)) {
    throw new Error('O código do produto deve ter exatamente 5 dígitos.');
  }

  var descricao = sanitizeText(payload.descricao || '');
  if (!descricao) {
    throw new Error('A descrição é obrigatória.');
  }
  validateLength('Descrição', descricao, LIMITES.DESCRICAO);
  
  var categoria = sanitizeText(payload.categoria || '');
  validateLength('Categoria', categoria, LIMITES.CATEGORIA);
  
  var unidade = sanitizeText(payload.unidade || '');
  validateLength('Unidade', unidade, LIMITES.UNIDADE);
  
  var ativo = String(payload.ativo || 'SIM').trim().toUpperCase();
  if (ativo !== 'SIM' && ativo !== 'NÃO') ativo = 'SIM';

  // Procura se já existe
  var projetosRaw = getSheetData(sheet, 5);
  var linhaExistente = -1;
  
  for (var i = 0; i < projetosRaw.length; i++) {
    if (normalizeCodigo(projetosRaw[i][0]) === codigo) {
      linhaExistente = i + 2;
      break;
    }
  }
  
  if (linhaExistente > 0) {
    // Atualiza produto existente
    sheet.getRange(linhaExistente, 2).setValue(descricao);
    sheet.getRange(linhaExistente, 3).setValue(categoria);
    sheet.getRange(linhaExistente, 4).setValue(unidade);
    sheet.getRange(linhaExistente, 5).setValue(ativo);
    
    return jsonResponse(true, { mensagem: 'Produto atualizado com sucesso!' });
  }
  
  // Novo produto
  sheet.appendRow([codigo, descricao, categoria, unidade, ativo]);
  
  return jsonResponse(true, { mensagem: 'Produto cadastrado com sucesso!' });
}

/**
 * POST aditivo: registra baixa total ou parcial.
 * Se a aba "Baixas" não existir, ela é criada automaticamente (defesa em profundidade).
 */
function doPostDarBaixa(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetRegistros = ss.getSheetByName('Registros');
  
  if (!sheetRegistros) {
    throw new Error("Aba 'Registros' não encontrada na planilha.");
  }
  
  // Garante a aba "Baixas" (cria com cabeçalhos se não existir)
  var sheetBaixas = garantirAbaBaixas(ss);

  var idRegistro = String(payload.id_registro || '').trim();
  if (!idRegistro) {
    throw new Error('ID do registro é obrigatório.');
  }

  var qtdBaixada = Number(payload.quantidade_baixada);
  if (!Number.isInteger(qtdBaixada) || qtdBaixada <= 0) {
    throw new Error('A quantidade baixada deve ser um inteiro maior que zero.');
  }

  var motivo = sanitizeText(payload.motivo || '');
  if (!motivo) {
    throw new Error('O motivo da baixa é obrigatório.');
  }
  validateLength('Motivo', motivo, LIMITES.MOTIVO);

  var responsavel = sanitizeText(payload.responsavel || '');
  validateLength('Responsável', responsavel, LIMITES.RESPONSAVEL);

  // Encontra o registro
  var registrosRaw = getSheetData(sheetRegistros, 10);
  var linhaRegistro = -1;
  var registro = null;
  
  for (var i = 0; i < registrosRaw.length; i++) {
    if (String(registrosRaw[i][6] || '').trim() === idRegistro) {
      linhaRegistro = i + 2;
      registro = registrosRaw[i];
      break;
    }
  }
  
  if (linhaRegistro < 0) {
    throw new Error('Registro não encontrado.');
  }
  
  var qtdAtual = Number(registro[4]) || 0;
  if (qtdBaixada > qtdAtual) {
    throw new Error('Quantidade baixada excede o disponível.');
  }
  
  // Atualiza registro (diminui quantidade ou marca como BAIXADO)
  var agora = formatDateTime(new Date(), 'yyyy-MM-dd HH:mm:ss');
  var novaQtd = qtdAtual - qtdBaixada;
  
  if (novaQtd === 0) {
    sheetRegistros.getRange(linhaRegistro, 9).setValue('BAIXADO'); // Coluna I: status
  }
  sheetRegistros.getRange(linhaRegistro, 5).setValue(novaQtd); // Coluna E: quantidade
  sheetRegistros.getRange(linhaRegistro, 10).setValue(agora); // Coluna J: atualizado_em
  
  // Registra baixa na aba "Baixas"
  sheetBaixas.appendRow([
    idRegistro,
    agora,
    String(registro[1] || '').trim(),
    normalizeCodigo(registro[2]),
    qtdBaixada,
    motivo,
    responsavel
  ]);
  
  return jsonResponse(true, { 
    mensagem: 'Baixa registrada com sucesso. Quantidade restante: ' + novaQtd + '.' 
  });
}

// ============================================================
// UTILITÁRIOS
// ============================================================

/**
 * Migração idempotente:
 * - Formata colunas de código, mês e ID como texto ('@')
 * - Preenche IDs (R000001...) e status (ATIVO) onde vazios
 * - Normaliza códigos para 5 dígitos com zeros à esquerda
 * - Cria cabeçalhos novos SOMENTE onde vazios:
 *     Projetos: C categoria, D unidade, E ativo
 *     Registros: G id, H lote, I status, J atualizado_em
 * - Cria a aba "Baixas" com 7 cabeçalhos, se não existir
 *
 * ⚠️ ANTES DE RODAR: faça uma cópia da planilha (Arquivo > Fazer cópia)
 * Pode ser rodada mais de uma vez: nada é sobrescrito ou duplicado.
 */
function migrarPlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Formata colunas como texto (evita perda de zeros à esquerda)
  var sheetProjetos = ss.getSheetByName('Projetos');
  if (sheetProjetos) {
    var lastRowP = sheetProjetos.getLastRow();
    if (lastRowP > 0) {
      sheetProjetos.getRange(1, 1, lastRowP, 1).setNumberFormat('@'); // Coluna A: código
    }
    // Cabeçalhos novos da evolução B (somente células vazias)
    garantirCabecalhos(sheetProjetos, {
      3: 'categoria',
      4: 'unidade',
      5: 'ativo'
    });
  }
  
  var sheetRegistros = ss.getSheetByName('Registros');
  if (sheetRegistros) {
    var lastRowR = sheetRegistros.getLastRow();
    if (lastRowR > 0) {
      sheetRegistros.getRange(1, 3, lastRowR, 1).setNumberFormat('@'); // Coluna C: código
      sheetRegistros.getRange(1, 6, lastRowR, 1).setNumberFormat('@'); // Coluna F: mês
      sheetRegistros.getRange(1, 7, lastRowR, 1).setNumberFormat('@'); // Coluna G: ID
    }
    // Cabeçalhos novos da evolução C (somente células vazias)
    garantirCabecalhos(sheetRegistros, {
      7: 'id',
      8: 'lote',
      9: 'status',
      10: 'atualizado_em'
    });
    
    // Preenche IDs e status vazios
    if (lastRowR > 1) {
      var data = sheetRegistros.getRange(2, 1, lastRowR - 1, 10).getValues();
      var maxId = 0;
      
      // Encontra o maior ID existente
      data.forEach(function(row) {
        var id = String(row[6] || '').trim();
        var match = id.match(/^R(\d+)$/);
        if (match) {
          var num = parseInt(match[1], 10);
          if (num > maxId) maxId = num;
        }
      });
      
      // Preenche IDs vazios e status vazios
      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var linha = i + 2;
        
        // Se ID vazio, gera próximo
        if (!row[6] || String(row[6]).trim() === '') {
          maxId++;
          var novoId = 'R' + String(maxId).padStart(6, '0');
          sheetRegistros.getRange(linha, 7).setValue(novoId);
        }
        
        // Se status vazio, marca como ATIVO
        if (!row[8] || String(row[8]).trim() === '') {
          sheetRegistros.getRange(linha, 9).setValue('ATIVO');
        }
        
        // Normaliza código (garante 5 dígitos com zeros)
        var codigo = normalizeCodigo(row[2]);
        if (codigo && codigo !== String(row[2]).trim()) {
          sheetRegistros.getRange(linha, 3).setValue(codigo);
        }
      }
    }
  }
  
  // Garante a aba "Baixas" com cabeçalhos (idempotente)
  garantirAbaBaixas(ss);
  
  Logger.log('Migração concluída com sucesso.');
  return 'Migração concluída com sucesso.';
}

/**
 * Lista códigos duplicados na aba "Projetos"
 */
function listarCodigosDuplicados() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Projetos');
  
  if (!sheet) {
    Logger.log("Aba 'Projetos' não encontrada.");
    return "Aba 'Projetos' não encontrada.";
  }
  
  var projetosRaw = getSheetData(sheet, 2);
  var codigosVistos = {};
  var duplicados = [];
  
  projetosRaw.forEach(function(row, idx) {
    var codigo = normalizeCodigo(row[0]);
    if (!codigo) return;
    
    var linha = idx + 2;
    var descricao = String(row[1] || '').trim();
    
    if (codigosVistos[codigo]) {
      duplicados.push({
        codigo: codigo,
        linha1: codigosVistos[codigo].linha,
        descricao1: codigosVistos[codigo].descricao,
        linha2: linha,
        descricao2: descricao
      });
    } else {
      codigosVistos[codigo] = { linha: linha, descricao: descricao };
    }
  });
  
  if (duplicados.length === 0) {
    Logger.log('Nenhum código duplicado encontrado.');
    return 'Nenhum código duplicado encontrado.';
  }
  
  Logger.log('Códigos duplicados encontrados:');
  duplicados.forEach(function(d) {
    Logger.log('Código ' + d.codigo + ':');
    Logger.log('  Linha ' + d.linha1 + ': ' + d.descricao1);
    Logger.log('  Linha ' + d.linha2 + ': ' + d.descricao2);
  });
  
  return 'Encontrados ' + duplicados.length + ' códigos duplicados. Veja o log (Ctrl+Enter).';
}

// ============================================================
// HELPER DE RESPOSTA JSON
// ============================================================

function jsonResponse(ok, data) {
  var response = { ok: ok };
  if (typeof data === 'string') {
    response.mensagem = data;
  } else if (typeof data === 'object') {
    for (var key in data) {
      response[key] = data[key];
    }
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}