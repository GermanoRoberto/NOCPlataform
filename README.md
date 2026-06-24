# NOC Platform

Dashboard de monitoramento operacional (SRE) de rede, impressoras e inventário de máquinas com integração Zabbix, alertas no Telegram e inteligência artificial para diagnósticos (AIOps).

---

## 1. Visão Geral do Sistema

O NOC Dashboard é uma solução integrada de monitoramento composta por:

1. **Frontend**: Dashboard em tempo real de página única (SPA), com gráficos dinâmicos de latência, mapa de georeferenciação (Leaflet.js), controle de visualização do Centro SRE (AIOps) e gerenciamento de thresholds.
2. **Backend**: Servidor Node.js utilizando Express, encarregado de:
   - Coletar dados via API do Zabbix (JSON-RPC) a cada 12 segundos.
   - Analisar anomalias estatísticas e correlações de telemetria.
   - Gerar diagnósticos de incidentes de rede com inteligência artificial (Llama 3.1 via Groq API).
   - Enviar alertas e processar comandos dinâmicos de usuários via bot do Telegram.
   - Sincronizar logs operacionais e backups com o Supabase.
   - Armazenar histórico em banco de dados SQLite local.

---

## 2. Tecnologias Utilizadas

- **Backend**: Node.js, Express, Axios (HTTP Client), SQLite3, Dotenv, Helmet.
- **Frontend**: HTML5, Vanilla CSS (Design Responsivo com Glassmorphism), Vanilla JS, Lucide Icons.
- **Bibliotecas Frontend**: Leaflet.js (Mapas interativos), Chart.js (Gráficos históricos).

---

## 3. Funcionalidades Principais

- **Monitoramento de Links WAN**: Latência, perda de pacotes, tráfego (IN/OUT), jitter, uso de banda e status (online/offline/warning).
- **Monitoramento de Impressoras**: Nível de toner (alerta crítico a 10%), contadores de páginas impressas (preto/colorido), e reservatório de descarte de resíduos.
- **Centro SRE (AIOps)**: Painel de controle de incidentes críticos de rede com:
  - Filtro inteligente para ocultar alertas de impressoras solucionáveis localmente.
  - Mecanismo de silenciamento temporário ("Mute") de ativos persistido no navegador (`localStorage`).
- **Inventário de Máquinas**: Agrupamento por filiais (cards dinâmicos), exibição de status, sistema operacional (com arquitetura), antivírus ativo, usuário logado, fabricante, modelo e número de série.
- **Assistente Cortex AI**: Integração com IA (Groq) para responder dúvidas técnicas contextuais da rede e emitir diagnósticos automáticos em linguagem natural sobre incidentes.
- **Backups Automáticos**: Dump diário do banco SQLite local para um bucket do Supabase.

---

## 4. Segurança

O sistema já implementa as seguintes medidas de segurança básicas:

1. **Cabeçalhos de Segurança (Helmet)**: Adiciona cabeçalhos HTTP seguros para prevenir ataques comuns (Clickjacking, XSS, sniffing de tipo MIME, etc.).
2. **CORS Configurável**: Permite configurar origens confiáveis via variável de ambiente `CORS_ALLOWED_ORIGINS`.
3. **Prevenção de Injeção de Comandos**: Uso de `child_process.spawn()` com argumentos separados em vez de `exec()` para evitar injeção de comandos maliciosos.
4. **Tratamento de Erros**: Mensagens genéricas em erros 500 para não expor detalhes sensíveis da infraestrutura ao cliente.

### Autenticação e Autorização

⚠️ **IMPORTANTE**: O sistema NÃO implementa autenticação por padrão, pois o usuário pode preferir diferentes métodos (JWT, OAuth2, API Key, autenticação básica, integração com SSO, etc.).

Para garantir a segurança do seu deploy, **é altamente recomendado implementar um middleware de autenticação e autorização** em `server.js` para todas as rotas da API.

Exemplo de como adicionar uma autenticação básica (para referência):

```javascript
// Exemplo de middleware de autenticação (implementar antes das rotas)
function authMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === process.env.API_KEY) {
        next();
    } else {
        res.status(401).json({ error: 'Acesso negado: Chave de API inválida ou ausente.' });
    }
}

// Aplicar o middleware a todas as rotas API
app.use('/api', authMiddleware);
```

---

## 5. Parametrização do Zabbix (Coleta Nativa via WMI)

Para viabilizar o inventário de máquinas Windows sem a necessidade de habilitar comandos PowerShell arbitrários nos agentes locais (o que exigiria ativar `system.run` e exporia as máquinas a riscos de segurança), o sistema utiliza **consultas WMI nativas**.

As estações devem estar vinculadas ao template **`Template Windows Custom Extensions` (ID: 10773)** no Zabbix Server. As chaves de coleta devem ser configuradas exatamente como descrito abaixo:

### Chaves de Coleta de Hardware e Sistema Operacional (Zabbix)

| Métrica | Chave Zabbix | Tipo de Informação | Consulta WMI Executada |
| :--- | :--- | :--- | :--- |
| **Antivírus Ativo** | `wmi.get[root/SecurityCenter2,"Select displayName from AntiVirusProduct"]` | Texto | Retorna o nome do antivírus ativo na estação. |
| **Usuário Logado** | `wmi.get[root/cimv2,"Select UserName from Win32_ComputerSystem"]` | Texto | Identifica o usuário atualmente logado (o backend limpa o prefixo do domínio automaticamente). |
| **Número de Série** | `wmi.get[root/cimv2,"Select SerialNumber from Win32_BIOS"]` | Texto / Caractere | Retorna o Serial Number direto da BIOS da máquina. |
| **Fabricante (Vendor)**| `wmi.get[root/cimv2,"Select Manufacturer from Win32_ComputerSystem"]` | Texto | Ex: `Dell Inc.`, `HP`, `Lenovo`. |
| **Modelo** | `wmi.get[root/cimv2,"Select Model from Win32_ComputerSystem"]` | Texto | Modelo comercial do equipamento (Ex: `OptiPlex 3080`). |
| **Arquitetura do OS** | `wmi.get[root/cimv2,"Select OSArchitecture from Win32_OperatingSystem"]` | Texto | Retorna se o sistema é `64-bit` ou `32-bit`. |
| **Nome do Host** | `system.hostname` | Caractere | Nome da máquina de acordo com o Zabbix Agent. |
| **Sistema Operacional**| `system.uname` | Texto | Informação básica da versão do Windows. |

*Nota: O backend do NOC lê essas chaves em lote e monta o objeto do inventário (`computersData`) no startup e a cada intervalo de varredura.*

---

## 6. Inteligência Artificial e Heurísticas (AIOps)

### A. Detecção de Anomalias Estatísticas
O backend calcula o comportamento anômalo da rede baseando-se em:
1. **Desvio Padrão**: Uma anomalia é disparada se o valor atual da métrica (Ex: Latência) ultrapassar **3 desvios padrão** acima da média móvel dos últimos 5 ciclos.
2. **Correlação de Pearson**: É feito o cálculo da correlação (`r`) em tempo real entre o uso de CPU e a latência de rede nas estações de trabalho para diagnosticar se a lentidão na rede está associada a um gargalo de hardware local.

### B. Cortex AI Assistant (Groq LLM)
Utiliza a API do Groq configurada com o modelo `llama-3.1-8b-instant`.
- O NOC envia o histórico de métricas e metadados de um incidente para a IA, que retorna um diagnóstico sucinto em formato estruturado.
- Permite chat interativo na interface WEB com suporte a diagnóstico em linguagem natural.

---

## 7. Integração com Telegram Bot

O bot opera em modo de polling contínuo a partir do backend. Para evitar spam e enviar alertas apenas a quem de fato deseja recebê-los, o sistema adota as seguintes diretrizes:

1. **Inscrição Dinâmica (`/start`)**: Ao enviar `/start` para o bot, o chat ID do usuário é salvo no arquivo `settings.json` local. O bot passa a enviar alertas em lote para todos os inscritos utilizando concorrência assíncrona (`Promise.allSettled`).
2. **Sem IDs Fixos**: O bot ignora variáveis estáticas de ambiente de desenvolvedores (como `TELEGRAM_CHAT_ID` singular) no envio automatizado, garantindo privacidade e impedindo disparos indesejados.

### Comandos Operacionais do Bot

* `/start`: Registra o usuário/grupo atual para passar a receber alertas operacionais de incidentes.
* `/help`: Exibe a lista de comandos disponíveis e explicação básica.
* `/status`: Retorna o estado do servidor NOC (Uptime, conexão com Zabbix, estado da internet local e quantidade de usuários ativos).
* `/links`: Painel em texto mostrando o status de todos os links WAN monitorados (UP/DOWN, latência e perdas).
* `/incidentes`: Lista detalhada contendo apenas os incidentes operacionais críticos atualmente abertos.
* `/relatorio`: Relatório consolidado com métricas semanais de quedas de links e ranking de filiais mais afetadas.
* `/inventario` ou `/inventário`: Resumo com o total de computadores online/offline e detalhes de filiais.

---

## 8. Instalação e Execução

### Pré-requisitos
- Node.js (v20 ou superior recomendado)
- Porta `4002` livre (ou configurada no `.env`)

### Passos para Instalação

1. Clone o repositório ou baixe a pasta do projeto.
2. Instale as dependências executando:
   ```bash
   npm install
   ```
3. Crie e configure o arquivo `.env` com base no `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Configure as chaves de API do Zabbix e Groq no arquivo `.env` (detalhes na seção 9).
5. **(Obrigatório) Implemente autenticação/autorização** (veja seção 4 para detalhes).

### Inicialização
- **Windows (Recomendado)**: Dê duplo clique no arquivo **`Iniciar NOC.bat`** na raiz do projeto. Ele verificará os requisitos do Node.js, instalará as dependências caso ausentes e abrirá o terminal do PowerShell executando o servidor.
- **Terminal manual**:
  ```bash
  npm start
  ```

---

## 9. Configuração do Arquivo `.env`

| Variável | Obrigatório | Descrição | Exemplo |
| :--- | :--- | :--- | :--- |
| `PORT` | Não | Porta na qual o painel do NOC ficará acessível (Default: 4002) | `4002` |
| `CORS_ALLOWED_ORIGINS` | Não | Origens confiáveis separadas por vírgula (deixe vazio para permitir todas as origens em ambiente de teste) | `http://localhost:3000,http://noc.suaempresa.com` |
| `ZABBIX_URL` | Sim | URL completa do endpoint da API JSON-RPC do Zabbix Server | `http://zabbix.suaempresa.com/api_jsonrpc.php` |
| `ZABBIX_TOKEN` | Sim | Token de API Zabbix criado para leitura de hosts/itens | `148077c3327165c...` |
| `ENABLE_SIMULATION` | Não | Caso `true`, ativa simulação de links e impressoras quando Zabbix offline | `false` |
| `NOC_SHARED_BOT_ENV_PATH`| Não | Caminho absoluto do `.env` compartilhado com o bot standalone (opcional) | `D:\standalone_bot\.env` |
| `TELEGRAM_BOT_TOKEN` | Sim | Token gerado pelo @BotFather para operação do bot do Telegram | `8760334503:AAH9_jL...` |
| `TELEGRAM_CHAT_IDS` | Não | Lista fixa opcional de chat IDs separados por vírgula | `8784871565,7208341089` |
| `TELEGRAM_MIN_PRIORITY` | Não | Prioridade mínima para disparar alertas no Telegram (P1 a P5) (Default: P3) | `P3` |
| `NOC_PUBLIC_URL` | Não | URL pública do NOC enviada nos links de incidentes no Telegram | `http://noc.suaempresa.com:4002` |
| `GROQ_API_KEY` | Não | Chave de API da plataforma Groq para diagnósticos com IA | `gsk_vO36I7...` |
| `GROQ_MODEL` | Não | Modelo do Groq LLM a ser utilizado (Default: llama-3.1-8b-instant) | `llama-3.1-8b-instant` |
| `SUPABASE_URL` | Não | URL do banco/bucket do Supabase para backups operacionais | `https://prorzxbn...` |
| `SUPABASE_KEY` | Não | Chave pública ou de serviço do Supabase | `sb_publishable_...` |
| `SUPABASE_BUCKET` | Não | Nome do bucket configurado para receber o dump do banco de dados | `noc-backups` |
| `LINK_DOWN_CONFIRMATIONS`| Não | Ciclos consecutivos de 12s com perda total antes de disparar incidentes | `3` |
| `LINK_UP_CONFIRMATIONS` | Não | Ciclos consecutivos de 12s com resposta positiva antes de normalizar | `2` |

---

## 10. Estrutura do Projeto

```
├── public/                 # Arquivos do Frontend (HTML, CSS, JS)
│   ├── painel/             # Páginas/scripts do Painel Operacional Principal
│   └── inventario/         # Páginas/scripts da Visualização de Inventário
├── Zabbix/                 # Documentações, scripts e templates de importação do Zabbix
├── server.js               # Servidor principal Node.js (Rotas, telemetria, AIOps, Telegram)
├── package.json            # Dependências e scripts npm
├── settings.json           # Configurações dinâmicas persistidas e re-carregadas pelo NOC
├── .env.example            # Arquivo base de exemplo para variáveis de ambiente
└── README.md               # Este manual de documentação
```
