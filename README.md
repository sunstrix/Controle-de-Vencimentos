# Controle de Vencimentos CP FANI

Sistema web interno da CP FANI (17 lojas) para controle de produtos próximos do vencimento.
As lojas registram lotes via formulário; a gestão acompanha em dashboard, cadastra produtos
e analisa gráficos e perdas em relatórios, com exportação para Excel e impressão em PDF.

**Páginas:** Registrar (`index.html`) · Dashboard (`dashboard.html`) · Produtos (`produtos.html`) · Relatórios (`relatorios.html`)

**Versão do sistema:** 2.0.0 (ver `js/config.js`)

---

## Stack

- **Front-end:** HTML5, CSS3 e JavaScript puro (sem build), hospedado no Netlify
- **Back-end:** Google Apps Script (Web App)
- **Banco de dados:** Google Sheets
- **Bibliotecas via CDN com versão fixa:** SheetJS `xlsx 0.18.5` e Chart.js `4.4.1`

---

## Estrutura de arquivos

```text
Controle-de-Vencimentos/
├── apps-script/
│   ├── Code.gs           # Backend completo + migração + utilitários
│   └── appsscript.json   # Manifest (fuso America/Sao_Paulo, runtime V8)
├── assets/
│   └── logo-cp-fani.png  # Logo da empresa (VOCÊ deve adicionar este arquivo)
├── css/
│   └── style.css         # Estilos globais, responsivos, AA e @media print
├── js/
│   ├── config.js         # URL do Web App + apiRequest (timeout/retry) + helpers
│   ├── form.js           # Formulário de registro (lotes)
│   ├── produtos.js       # Cadastro de produtos
│   ├── dashboard.js      # Dashboard + baixas
│   └── relatorios.js     # Gráficos e relatórios
├── index.html            # Registrar
├── dashboard.html        # Dashboard
├── produtos.html         # Produtos
├── relatorios.html       # Relatórios
├── netlify.toml          # Publish + cabeçalhos de segurança/CSP
├── .gitignore            # Bloqueia planilhas, backups e segredos no repositório
└── README.md             # Este arquivo
```

> A pasta `assets/` com `logo-cp-fani.png` **precisa ser criada e commitada por você**.
> Sem ela, o sistema funciona normalmente com o fallback de texto "CP FANI".

---

## Planilha (banco de dados)

### Aba `Lojas`

| Coluna | Cabeçalho | Conteúdo |
| --- | --- | --- |
| A | Nome da Loja | Texto (máx. 60 caracteres) |

Linhas 2 em diante: as 17 lojas (ex.: Loja 01 … Loja 17).

### Aba `Projetos` (cadastro de produtos)

| Coluna | Cabeçalho | Conteúdo |
| --- | --- | --- |
| A | Código | Texto de 5 dígitos (zeros à esquerda preservados) |
| B | Descrição | Texto (máx. 120) |
| C | categoria | Texto (máx. 120) |
| D | unidade | Texto (máx. 120) |
| E | ativo | `SIM` ou `NÃO` |

### Aba `Registros` (lotes)

| Coluna | Cabeçalho | Conteúdo |
| --- | --- | --- |
| A | Data Registro | `yyyy-MM-dd HH:mm:ss` (fuso de São Paulo) |
| B | Loja | Deve existir na aba `Lojas` |
| C | Código Projeto | Texto de 5 dígitos |
| D | Descrição | Preenchida pelo servidor a partir de `Projetos` |
| E | Quantidade | Inteiro > 0 |
| F | Mês Vencimento | `AAAA-MM` (nunca mês passado) |
| G | id | `R000001`, `R000002`… (gerado automaticamente) |
| H | Lote | Texto (máx. 20), opcional |
| I | Status | `ATIVO` ou `BAIXADO` |
| J | Atualizado em | Preenchido em somas e baixas |

### Aba `Baixas` (histórico, criada pela migração)

| Coluna | Cabeçalho | Conteúdo |
| --- | --- | --- |
| A | id_registro | ID da aba `Registros` |
| B | data | `yyyy-MM-dd HH:mm:ss` |
| C | loja | Texto |
| D | codigo | Texto de 5 dígitos |
| E | quantidade_baixada | Inteiro > 0 |
| F | motivo | vendido, descartado, transferido ou vencido |
| G | responsavel | Texto livre (máx. 80) |

### Regras de negócio implementadas

- **Código do projeto:** sempre TEXTO de exatamente 5 dígitos; zeros à esquerda são
  válidos e preservados (`01234` ≠ `1234`). Nunca é tratado como número.
- **Códigos duplicados em `Projetos`:** o sistema usa o **primeiro encontrado** (decisão
  de negócio). Rode `listarCodigosDuplicados()` no editor do Apps Script para auditar.
- **Duplicidade de lançamento:** mesma loja + código + lote + mês com status `ATIVO`
  → o formulário pergunta se **soma** ou **cancela**; o servidor soma atomicamente.
- **Baixas:** totais ou parciais; quando zera, o status vira `BAIXADO`.
  **Nenhum registro é apagado em hipótese alguma.**
- **Produtos:** inativar (`ativo = NÃO`) não apaga; o histórico permanece íntegro.

---

## Instalação do zero

### 1. Planilha

1. Crie uma planilha em sheets.google.com com as abas `Lojas`, `Projetos` e `Registros`
   (a aba `Baixas` e os cabeçalhos novos são criados pela migração).
2. Preencha `Lojas` e `Projetos` conforme as tabelas acima.

### 2. Apps Script

1. Na planilha: **Extensões > Apps Script**.
2. Cole o conteúdo de `apps-script/Code.gs` e salve.
3. Em **Configurações do projeto**, marque **Mostrar arquivo de manifestação** e cole o
   conteúdo de `apps-script/appsscript.json` (fuso `America/Sao_Paulo`, runtime `V8`).
4. **Implantar > Nova implantação > App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
5. Autorize as permissões e copie a URL terminada em `/exec`.

### 3. Front-end

1. Em `js/config.js`, substitua `APPS_SCRIPT_URL` pela URL copiada.
2. Coloque a logo em `assets/logo-cp-fani.png`.

### 4. GitHub e Netlify

1. Crie o repositório e envie os arquivos (`git add . && git commit && git push`).
   O `.gitignore` impede o commit de planilhas e backups — **nunca force a entrada deles**.
2. No Netlify: **Add new site > Import an existing project > GitHub**.
   O `netlify.toml` já define publish na raiz e os cabeçalhos de segurança.

---

## Atualizar um sistema já em produção (migração da v1)

1. **FAÇA UMA CÓPIA DA PLANILHA** (Arquivo > Fazer uma cópia). Sem exceções.
2. Substitua o `Code.gs` no editor do Apps Script pelo novo e salve.
3. Atualize o manifest (`appsscript.json`) conforme passo 2.3 acima.
4. **Implantar > Gerenciar implantações > Editar (lápis) > Versão: "Nova versão" > Implantar.**
   Isso mantém a MESMA URL `/exec`. Só use "Nova implantação" se quiser URL nova
   (nesse caso atualize `js/config.js` e reimplemente o front).
5. No editor, selecione a função `migrarPlanilha` e clique em **Executar**.
   A migração é **idempotente** (pode rodar mais de uma vez): formata colunas de código,
   mês e ID como texto; preenche `id` e `status` vazios; normaliza códigos para 5 dígitos;
   cria cabeçalhos novos apenas onde estão vazios; cria a aba `Baixas` se não existir.
   **Nenhuma linha é removida ou sobrescrita.**
6. Selecione `listarCodigosDuplicados` e execute; confira o relatório em **Execução > Logs**.
7. Publique o front-end atualizado no Netlify (push no repositório).

---

## Como usar

### Registrar (`index.html`)

Selecione a loja (o painel mostra os itens já lançados por ela), digite o código de
5 dígitos (a descrição aparece automaticamente), lote opcional, quantidade e mês.
- **Enviar Registro:** salva e limpa código/quantidade/mês (a loja fica memorizada no aparelho).
- **Salvar e adicionar outro:** salva mantendo loja e mês, pronto para o próximo código.
- Se já existir lote igual (loja+código+lote+mês), um modal pergunta **Somar** ou **Cancelar**.

### Dashboard (`dashboard.html`)

- Cartões: vencendo este mês, próximo mês, lojas com pendências e **vencidos não baixados**.
- A seção vermelha lista itens de meses passados ainda `ATIVO` — eles não somem da tela.
- Botão **Dar baixa** em cada linha (total ou parcial, com motivo e responsável).
- Filtros por loja e mês; cores: vermelho = mês atual, amarelo = próximo mês.
- **Exportar para Excel** gera `.xlsx` com os dados filtrados (inclui vencidos).

### Produtos (`produtos.html`)

- Criar, editar e inativar/reativar produtos; **exclusão não existe**.
- Busca por código ou descrição; edição trava o código (ele é a chave).
- **Importar Lista:** cole `código;descrição;categoria` (uma linha por produto);
  linhas inválidas são reportadas com número da linha, sem interromper as demais.
  Códigos colados sem zeros são normalizados (`1234` vira `01234`).

### Relatórios (`relatorios.html`)

- Barras: quantidade a vencer por mês e por loja. Rosca: distribuição por categoria.
- Barras empilhadas: perdas (baixas) por motivo, por mês. Ranking: top 10 produtos.
- Filtros de período (3/6/12 meses ou tudo), loja e categoria aplicados a todos os gráficos.
- **Exportar Excel** (abas "A Vencer", "Baixas" e "Ranking") e **Imprimir / Salvar PDF**
  com layout limpo e logo no topo.

---

## Segurança e limitações (leia com atenção)

### Decisão de negócio: sistema ABERTO, sem login e sem PIN

Qualquer pessoa que conheça a URL do Web App pode **ler e gravar dados**. Isso é aceito
pela CP FANI como ferramenta interna. A URL está neste repositório público por necessidade
do front-end. Se um dia houver abuso: gere URL nova (nova implantação) e/ou torne o
repositório privado.

### O que EXISTE de proteção

- Validação 100% no servidor: código de 5 dígitos, loja existente em `Lojas`, descrição
  vinda da aba `Projetos` (nunca do cliente), sanitização contra injeção de fórmula
  (`=`, `+`, `-`, `@`), limites de tamanho por campo, mês nunca no passado
  (fuso `America/Sao_Paulo`).
- `LockService` em toda gravação; soma de duplicados atômica.
- Front-end imune a XSS dos dados: renderização apenas com `textContent`/`createElement`.
- Cabeçalhos no Netlify: CSP (scripts apenas do próprio site e das CDNs fixas),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy` e HSTS.
- `.gitignore` bloqueia planilhas, cópias e backups no repositório público.

### O que NÃO existe (por decisão)

- Login individual, perfis, trilha de auditoria por pessoa (baixas registram apenas o
  campo livre `responsavel`), rate limit real e criptografia além do HTTPS.

---

## Limites e escala (Google Sheets / Apps Script)

| Recurso | Limite prático (conta Google gratuita) |
| --- | --- |
| Células por planilha | 10 milhões |
| Tempo máximo por execução | 6 minutos |
| Tempo total de script por dia | 90 minutos |
| Chamadas URL Fetch por dia | 20.000 |
| Leituras do `doGet` | Lê TODOS os registros a cada chamada (cresce linearmente) |

**Recomendações:**

- Até cerca de **5.000–10.000 registros**, o `doGet` completo responde em poucos segundos.
- Acima disso, prefira as rotas filtradas já existentes (`?action=registros&loja=X`) e
  considere paginação server-side por mês.
- **Quando migrar de banco:** acima de ~20.000 registros, `doGet` passando de 10–15 s,
  ou estouro das cotas diárias. Nesse ponto, avalie Firestore/SQL com backend próprio.
- Cotas podem mudar; consulte a documentação oficial de cotas do Apps Script.

---

## Troubleshooting

| Sintoma | Causa provável / solução |
| --- | --- |
| Erro "Unexpected token '<'" ou página HTML de erro | Cota do Apps Script estourada ou implantação sem a nova versão. Publique **nova versão** e tente novamente. |
| Código perdeu zeros à esquerda (`1234` no lugar de `01234`) | Coluna sem formato texto. Rode `migrarPlanilha()`. |
| Filtro de mês não mostra nada | Coluna F convertida em Data pelo Sheets. Rode `migrarPlanilha()`. |
| Logo não aparece | Falta `assets/logo-cp-fani.png`. O fallback de texto assume automaticamente. |
| Navegador sem seletor de mês (Firefox antigo) | Fallback automático: campo de texto com máscara `AAAA-MM`. |
| "Servidor ocupado. Tente novamente." | Dois gravadores simultâneos (`LockService`). Aguarde alguns segundos. |
| Dashboard com dado velho | Ctrl+F5 (o Netlify serve `/js` e `/css` sem cache por segurança do rollout). |

---

**Desenvolvido para CP FANI.**