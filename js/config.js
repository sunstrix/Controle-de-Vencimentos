/**
 * Controle de Vencimentos CP FANI - Configuração
 * 
 * Este arquivo contém as constantes de configuração do sistema.
 * ATENÇÃO: Substitua a URL abaixo pela URL do seu Web App do Google Apps Script
 * após publicar o Code.gs.
 */

// URL do Google Apps Script Web App (substitua após publicação)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/SUA_URL_AQUI/exec";

// Validação: alerta no console se a URL não foi configurada
if (APPS_SCRIPT_URL.includes("SUA_URL_AQUI")) {
  console.warn(
    "%c⚠️ ATENÇÃO: URL do Apps Script não configurada!",
    "color: orange; font-weight: bold;",
    "\nEdite o arquivo js/config.js e substitua 'SUA_URL_AQUI' pela URL real do seu Web App."
  );
}

// Configurações adicionais
const CONFIG = {
  // Tempo máximo de espera para requisições (em milissegundos)
  TIMEOUT: 15000,
  
  // Mensagens de erro padrão
  MENSAGENS: {
    ERRO_CONEXAO: "Erro de conexão com o servidor. Verifique sua internet e tente novamente.",
    ERRO_SERVIDOR: "Erro no servidor. Tente novamente em alguns segundos.",
    SUCESSO: "Operação realizada com sucesso!"
  }
};