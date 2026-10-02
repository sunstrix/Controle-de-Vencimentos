\# Controle de Vencimentos CP FANI



Sistema web para controle de vencimento de produtos distribuídos nas 17 lojas da CP FANI. O sistema permite o registro de vencimentos via formulário e a visualização consolidada em um dashboard interativo com exportação para Excel.



\## 🛠️ Tecnologias Utilizadas



\- \*\*Front-end:\*\* HTML5, CSS3, JavaScript (Vanilla)

\- \*\*Back-end:\*\* Google Apps Script

\- \*\*Banco de Dados:\*\* Google Sheets

\- \*\*Hospedagem:\*\* Netlify

\- \*\*Exportação:\*\* SheetJS (xlsx)



\---



\## Passo a Passo de Instalação



\### 1. Configuração da Planilha Google (Banco de Dados)



1\. Acesse \[sheets.google.com](https://sheets.google.com) e crie uma nova planilha.

2\. Renomeie as abas (na parte inferior) exatamente para:

&#x20;  - `Lojas`

&#x20;  - `Projetos`

&#x20;  - `Registros`



\#### Estrutura das Abas



\*\*Aba `Lojas`\*\*

\- Linha 1 (Cabeçalho): `Nome da Loja`

\- A partir da Linha 2: Liste as 17 lojas (ex: Loja 01, Loja 02, ..., Loja 17).



\*\*Aba `Projetos`\*\*

\- Linha 1 (Cabeçalho): `Código` | `Descrição`

\- A partir da Linha 2: Cole os dados do arquivo `BD.xlsx` (código do produto na coluna A, descrição na coluna B).

&#x20; - \*Nota: O sistema faz a busca automática (PROCV) com base no código numérico.\*



\*\*Aba `Registros`\*\*

\- Linha 1 (Cabeçalho): `Data Registro` | `Loja` | `Código Projeto` | `Descrição` | `Quantidade` | `Mês Vencimento`

\- \*Deixe as linhas de baixo vazias. O sistema preencherá automaticamente via formulário.\*



\### 2. Configuração do Google Apps Script (Back-end)



1\. Na sua planilha, clique no menu \*\*Extensões\*\* > \*\*Apps Script\*\*.

2\. Apague qualquer código que estiver no editor (`Código.gs`).

3\. Copie o conteúdo do arquivo `apps-script/Code.gs` deste repositório e cole no editor.

4\. Clique no ícone de \*\*Salvar\*\* (disquete).

5\. Clique no botão azul \*\*Implantar\*\* (Deploy) > \*\*Nova implantação\*\*.

6\. Clique na engrenagem ao lado de "Selecione o tipo" e escolha \*\*App da Web\*\*.

7\. Preencha as configurações:

&#x20;  - \*\*Descrição:\*\* `API Controle de Vencimentos`

&#x20;  - \*\*Executar como:\*\* `Eu` (seu e-mail)

&#x20;  - \*\*Quem pode acessar:\*\* `Qualquer pessoa` (Essencial para o formulário funcionar sem login do Google).

8\. Clique em \*\*Implantar\*\*.

9\. O Google pedirá autorização. Conceda as permissões (se aparecer "App não verificado", clique em "Avançado" > "Acessar... (não seguro)").

10\. \*\*Copie a URL do App da Web\*\* (ela termina em `/exec`). Você usará essa URL no próximo passo.



\### 3. Configuração do Front-end



1\. Abra o arquivo `js/config.js` no seu editor de código.

2\. Substitua o valor da constante `APPS\_SCRIPT\_URL` pela URL que você copiou no passo anterior:



```javascript

const APPS\_SCRIPT\_URL = "https://script.google.com/macros/s/SUA\_URL\_AQUI/exec";

```



\### 4. Publicação no GitHub e Netlify



1\. Crie um repositório no GitHub (ex: `Controle-de-Vencimentos`).

2\. Faça o upload de todos os arquivos deste projeto para o repositório.

3\. Acesse \[netlify.com](https://netlify.com) e faça login.

4\. Clique em \*\*Add new site\*\* > \*\*Import an existing project\*\*.

5\. Escolha \*\*GitHub\*\* e autorize o acesso.

6\. Selecione o repositório `Controle-de-Vencimentos`.

7\. Nas configurações de build, deixe tudo em branco (é um site estático).

8\. Clique em \*\*Deploy site\*\*.

9\. O Netlify fornecerá uma URL (ex: `https://controle-vencimentos.netlify.app`).



\---



\## 🔒 Segurança e Limitações



\- \*\*Acesso Público:\*\* Como o sistema não possui login, qualquer pessoa com o link do dashboard pode visualizar os dados.

\- \*\*Proteção Simples (PIN Visual):\*\* Se necessário, você pode adicionar uma senha simples no `dashboard.html` para ocultar o conteúdo até que o usuário digite o código correto. Isso não é uma segurança de nível empresarial, mas evita olhares curiosos.

\- \*\*Validação:\*\* O sistema valida dados no front-end e no back-end (Apps Script) para evitar registros inválidos ou duplicados por erro de digitação.



\---



\## Como Usar o Dashboard



1\. Acesse a página `dashboard.html` (geralmente via link no rodapé do formulário ou diretamente pela URL).

2\. O dashboard carrega automaticamente os dados do mês atual e futuros.

3\. Utilize os filtros de \*\*Loja\*\* e \*\*Mês\*\* para refinar a visualização.

4\. Clique em \*\*Exportar para Excel\*\* para baixar um relatório `.xlsx` com os dados filtrados.

5\. As cores indicam a urgência:

&#x20;  - 🔴 \*\*Vermelho:\*\* Vencimento no mês atual.

&#x20;  - 🟡 \*\*Amarelo:\*\* Vencimento no próximo mês.

&#x20;  - ⚪ \*\*Neutro:\*\* Vencimentos futuros.



\---



\## 📂 Estrutura de Arquivos



```

Controle-de-Vencimentos/

├── apps-script/

│   └── Code.gs           # Lógica do backend (Google Apps Script)

├── assets/

│   └── logo-cp-fani.png  # Logo da empresa

├── css/

│   └── style.css         # Estilos globais e responsivos

├── js/

│   ├── config.js         # Configuração da URL da API

│   ├── form.js           # Lógica do formulário

│   └── dashboard.js      # Lógica do dashboard

├── index.html            # Página do formulário

├── dashboard.html        # Página do dashboard

└── README.md             # Este arquivo

```



\---



\*\*Desenvolvido para CP FANI.\*\*

