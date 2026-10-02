/**
 * Controle de Vencimentos CP FANI - Google Apps Script
 * 
 * Este script atua como backend para o formulário e dashboard.
 * - doGet: Fornece dados iniciais (lojas, projetos, registros) em JSON.
 * - doPost: Recebe, valida e armazena novos registros com proteção contra concorrência.
 */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetLojas = ss.getSheetByName("Lojas");
    var sheetProjetos = ss.getSheetByName("Projetos");
    var sheetRegistros = ss.getSheetByName("Registros");

    // Helper para ler dados de forma segura (ignora cabeçalho e linhas vazias)
    function getSheetData(sheet, numCols) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      return sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    }

    // 1. Carregar Lojas (Coluna A)
    var lojasRaw = getSheetData(sheetLojas, 1);
    var lojas = lojasRaw.map(function(row) { return row[0]; }).filter(function(val) { return val !== ""; });

    // 2. Carregar Projetos (Coluna A: código, Coluna B: descrição)
    var projetosRaw = getSheetData(sheetProjetos, 2);
    var projetos = {};
    projetosRaw.forEach(function(row) {
      if (row[0] !== "") {
        projetos[String(row[0]).trim()] = row[1];
      }
    });

    // 3. Carregar Registros (6 colunas)
    var registrosRaw = getSheetData(sheetRegistros, 6);
    var registros = registrosRaw.map(function(row) {
      return {
        data_registro: row[0],
        loja: row[1],
        codigo_projeto: String(row[2]).trim(),
        descricao_projeto: row[3],
        quantidade: Number(row[4]),
        mes_vencimento: row[5]
      };
    }).filter(function(r) { return r.codigo_projeto !== ""; });

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      lojas: lojas,
      projetos: projetos,
      registros: registros
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      mensagem: "Erro ao ler dados: " + error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  // Bloqueio de concorrência para evitar race conditions em gravações simultâneas
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      mensagem: "Servidor ocupado. Por favor, tente novamente em alguns segundos."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    // O frontend envia como text/plain para evitar preflight CORS
    var payload = JSON.parse(e.postData.contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Registros");
    if (!sheet) {
      throw new Error("Aba 'Registros' não encontrada na planilha.");
    }

    // --- VALIDAÇÕES DE SEGURANÇA NO BACKEND ---
    
    // 1. Código do projeto: apenas números
    if (!payload.codigo_projeto || !/^\d+$/.test(String(payload.codigo_projeto).trim())) {
      throw new Error("O código do projeto deve conter apenas números.");
    }

    // 2. Quantidade: inteiro maior que zero
    var qtd = Number(payload.quantidade);
    if (!Number.isInteger(qtd) || qtd <= 0) {
      throw new Error("A quantidade deve ser um número inteiro maior que zero.");
    }

    // 3. Mês de vencimento: formato AAAA-MM
    if (!payload.mes_vencimento || !/^\d{4}-\d{2}$/.test(payload.mes_vencimento)) {
      throw new Error("Mês de vencimento inválido. Use o formato AAAA-MM.");
    }

    // 4. Validação de data: não permitir meses passados (defesa em profundidade)
    var hoje = new Date();
    var anoAtual = hoje.getFullYear();
    var mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
    var mesAtualStr = anoAtual + "-" + mesAtual;

    if (payload.mes_vencimento < mesAtualStr) {
      throw new Error("Não é permitido registrar vencimentos em meses passados.");
    }

    // --- GRAVAÇÃO ---
    var dataRegistro = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    var descricao = payload.descricao_projeto && payload.descricao_projeto.trim() !== "" 
                    ? payload.descricao_projeto 
                    : "Código não cadastrado";

    sheet.appendRow([
      dataRegistro,
      payload.loja,
      String(payload.codigo_projeto).trim(),
      descricao,
      qtd,
      payload.mes_vencimento
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      mensagem: "Registro salvo com sucesso!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      mensagem: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    // Libera o bloqueio em caso de sucesso ou erro
    lock.releaseLock();
  }
}