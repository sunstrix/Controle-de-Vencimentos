/**
 * Controle de Vencimentos CP FANI - Configuração
 * 
 * Este arquivo contém as constantes de configuração do sistema.
 */

// URL do Google Apps Script Web App
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKATLnYSbBoc1Ndf8VoOjWrqYTCejCbwhz-sIuMxwDhawVIwlR21l5q_sb8qmT-6qiSg/exec";

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