# Documentação Técnica Oficial: NOC Enterprise V2.0
**Rodoviário Camilo dos Santos — Command Center & Operações de TI**  
**Versão:** 2.0.0 (Replatformed & Hardened)  
**Ambiente:** Produção (`192.168.100.222:4002` / `rcsfti.ddns.net:4002`) & Desenvolvimento  

---

## 1. Visão Geral do Sistema

O **NOC Enterprise V2.0** é uma plataforma corporativa integrada de alta disponibilidade para monitoramento operacional em tempo real de infraestrutura de telecomunicações (WAN/Links), gestão de ativos computacionais (ITAM/Endpoints) e telemetria de parque de impressão.

### 1.1. Pilares Arquiteturais
* **Zero Fake Data:** Todas as métricas exibidas são estritamente reais, coletadas via Zabbix API (JSON-RPC 2.0), agentes Zabbix Agent v2 locais, consultas WMI/SNMP ou persistidas no SQLite. Não existem mocks ou valores randômicos.
* **Arquitetura Limpa e Modular:** Separação estrita em camadas (Apresentação, Serviços, Domínio, Repositórios e Infraestrutura), facilitando manutenções e isolando regras de negócio de bibliotecas externas.
* **Segurança OWASP Top 10:** Proteção contra SQL Injection (queries parametrizadas no SQLite), mitigação de XSS (escape rigoroso no frontend via `window.Sanitizer`), cabeçalhos de segurança via Helmet, rate-limiting por rota e isolamento de exceções sem vazamento de stack traces em produção.
* **Blindagem da Regra V8:** Mecanismo de segurança ativo que impede a exclusão lógica ou física de ativos e enlaces críticos essenciais para a operação da empresa.
* **AIOps Determinístico (Ollama):** Módulo de inteligência artificial local operando com modelo `noc-aiops:8b` sob regras rígidas de Ancoragem Restrita e Extração Determinística (proibição absoluta de alucinação ou dedução de fatos fora dos dados reais coletados).

---

## 2. Topologia e Arquitetura de Software

O sistema adota os princípios da Clean Architecture com injeção de dependências e responsabilidade única.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 NAVEGADOR / OPERADOR                   │
                  │   Single Page Application (HTML5 / Vanilla JS / CSS3)    │
                  └────────────────────────────┬────────────────────────────┘
                                               │ HTTP / SSE (/api/status/stream)
                                               ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                               BACKEND NODE.JS (EXPRESS)                                   │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ [CAMADA DE APRESENTAÇÃO]                                                                 │
│  ├── Middlewares: Helmet, CORS, Rate-Limiting (Global/Destrutivo), Validador Zod, V8-Guard  │
│  ├── Rotas (/api): Telemetria, Ativos, Incidentes, Impressoras, Relatórios, IA, Diagnóstico │
│  └── Controllers: telemetry, device, incident, printer, config, report, diagnostic, ai   │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ [CAMADA DE SERVIÇOS & NEGÓCIO]                                                            │
│  ├── telemetry-service.js: Polling contínuo (30s), parsing heurístico, sanitização, SSE  │
│  ├── incident-service.js: Ciclo de vida de incidentes, MTTR, anti-flapping, Telegram     │
│  └── printer-profile-resolver.js: Calibração de contadores, detecção de tecnologia/cor   │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ [CAMADA DE REPOSITÓRIOS & DOMÍNIO]                                                        │
│  ├── link-repository.js: Histórico e expurgo de circuitos WAN                             │
│  ├── printer-repository.js: Cadastro persistente de impressoras e contadores             │
│  └── v8-guard.js: Regra imutável de preservação de ativos vitais                          │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ [CAMADA DE INFRAESTRUTURA EXTERNA]                                                       │
│  ├── zabbix-client.js: Cliente JSON-RPC com Circuit Breaker e suporte a type/lastclock    │
│  ├── ollama-client.js: Motor AIOps determinístico local (porta 11434, modelo noc-aiops:8b)│
│  └── database/connection.js: SQLite3 em modo WAL, synchronous=NORMAL, timeout=10s        │
└──────────────────────────┬───────────────────────────┬────────────────────────────────────┘
                           │                           │
                           ▼                           ▼
        ┌─────────────────────────────┐   ┌─────────────────────────────┐
        │   ZABBIX SERVER (JSON-RPC)  │   │     OLLAMA ENGINE (LOCAL)   │
        │   rcsfti.ddns.net:8091      │   │     127.0.0.1:11434         │
        └─────────────────────────────┘   └─────────────────────────────┘
```

---

## 3. Estrutura de Diretórios e Arquivos

```
C:\NOC\ (ou Z:\ / E:\noc-enterprise\)
├── server.js                          # Bootstrap da aplicação, escuta 0.0.0.0:4002 e graceful shutdown
├── package.json                       # Dependências de produção e scripts
├── Iniciar NOC Enterprise.bat         # Launcher rápido para Windows
├── iniciar-noc-enterprise.ps1         # Script mestre PowerShell de subida do servidor
├── configurar-inicializacao-servidor.ps1 # Automação de inicialização no boot (Startup/Schtasks)
├── configurar-inicializacao-servidor.bat # Executável de configuração de inicialização
├── data/
│   └── noc_enterprise.db              # Banco de dados relacional SQLite
├── public/                            # Interface web estática
│   ├── index.html                     # Estrutura principal da SPA
│   ├── style.css                      # Estilos base e componentes
│   ├── theme-command-center.css       # Tema dark operacional e design system
│   ├── Auto-PrinterTelemetry.ps1      # Script PowerShell para telemetria de impressoras locais
│   ├── zabbix_noc_sync.ps1            # Script de sincronização para endpoints Zabbix
│   └── js/
│       ├── store.js                   # Gerenciamento de estado global e conexão SSE
│       ├── sanitizer.js               # Sanitização e proteção contra XSS
│       └── components/
│           ├── wan-view.js            # Visão de circuitos WAN, enlaces e SLAs
│           ├── itam-view.js           # Visão de estações de trabalho e conformidade
│           ├── printers-view.js       # Visão de parque de impressão e contadores
│           ├── incidents-view.js      # Visão de histórico de incidentes e MTTR
│           ├── reports-view.js        # Visão de relatórios executivos e auditorias
│           └── asset-drawer.js        # Painel deslizante com 6 abas detalhadas do ativo
└── src/
    ├── app.js                         # Configuração do Express, middlewares e rotas
    ├── core/
    │   ├── config.js                  # Validação estrita de variáveis de ambiente com Zod
    │   └── logger.js                  # Logger Pino com formatação limpa (pino-pretty stream)
    ├── domain/
    │   └── rules/
    │       └── v8-guard.js            # Regra V8 de proteção de ativos vitais
    ├── infrastructure/
    │   ├── database/
    │   │   ├── connection.js          # Pool de conexão SQLite (WAL mode)
    │   │   ├── migrate.js             # Executor de migrações
    │   │   └── migrations/
    │   │       └── 001_initial_schema.sql # DDL de criação de tabelas
    │   ├── ollama/
    │   │   └── ollama-client.js       # Cliente HTTP Ollama com diretrizes determinísticas
    │   └── zabbix/
    │       └── zabbix-client.js       # Cliente JSON-RPC com seleção de campos e resiliência
    ├── presentation/
    │   ├── controllers/               # Controladores de rotas
    │   ├── middlewares/               # Middlewares de segurança, rate limit e validação
    │   └── routes/
    │       └── api.routes.js          # Mapeamento formal de endpoints
    ├── repositories/                  # Acesso a dados (Link e Printer)
    └── services/                      # Motores de telemetria e incidentes
```

---

## 4. Banco de Dados Relacional (SQLite3)

O banco local opera no arquivo `data/noc_enterprise.db` com o modo **WAL (Write-Ahead Logging)** ativado para suportar concorrência sem bloqueio de leitura:
* `PRAGMA journal_mode = WAL;`
* `PRAGMA synchronous = NORMAL;`
* `PRAGMA busy_timeout = 10000;`

### 4.1. Esquema de Tabelas (`001_initial_schema.sql`)

1. **`operational_config`:**
   - Armazena parâmetros globais de configuração do NOC (thresholds de toner, latência, perda, jitter, janelas de SLA e integrações).
   - Chave primária: `key` (TEXT). Dados serializados em JSON no campo `value`.

2. **`link_metrics`:**
   - Registros históricos de latência, perda de pacotes, jitter e tráfego de circuitos WAN.
   - Utilizado para cálculo de tendências, disponibilidade percentual e gráficos de linha (*sparklines*).

3. **`printer_metrics`:**
   - Histórico de níveis de suprimento (toner), contadores de página mono/colorida e status operacional.

4. **`printer_registry`:**
   - Inventário persistente mestre de impressoras. Garante que contadores e dados de hardware de impressoras não sejam perdidos quando o Zabbix reinicia ou quando a impressora é desligada temporariamente.

5. **`incidents`:**
   - Registro de indisponibilidades. Campos: `id`, `link_id`, `link_name`, `started_at`, `resolved_at`, `duration_sec`, `severity`, `root_cause`, `status`.

6. **`audit_logs`:**
   - Trilhas de auditoria para ações executadas por operadores (exclusão de hosts, alterações de limites e diagnósticos manuais).

---

## 5. Módulo de Telemetria e Coleta (`telemetry-service.js`)

O motor de telemetria é o coração do sistema, operando em ciclo contínuo a cada 30 segundos (`pollInterval`):

### 5.1. Classificação e Segregação de Hosts
O método `processHosts()` recebe a lista bruta de hosts do Zabbix e os classifica estritamente por regras determinísticas:
1. **Descarte de Monitoramento Interno:** Nomes com `camera`, `cftv`, `zabbix server` ou `proxy` são descartados.
2. **Impressoras Corporativas:** Hosts com grupo `impressoras` ou nomes contendo `samsung`, `ricoh`, `lexmark`, `brother` ou `epson` são encaminhados para `extractStandalonePrinter()`. **Nunca entram na lista de links WAN**.
3. **Estações ITAM / Computadores:** Hosts com grupo `computadores`, nomes iniciados em `PE0` ou contendo `abelardo` são encaminhados para `extractComputer()`. As impressoras conectadas localmente são extraídas via `extractPrintersFromComputer()`.
4. **Serviços Críticos e Links WAN:** Hosts como `SANKHYA PRODUÇÃO`, `SANKHYA TESTE`, `PLURI` e todos os circuitos de telecomunicação são encaminhados para `extractLink()`.

### 5.2. Regra de Validação de Status Online dos Computadores
Para eliminar falsos positivos causados por métricas que o próprio servidor Zabbix recalcula internamente (como `system.swap.free` ou `vm.memory.util` de tipo 15):
* Apenas itens do agente (tipo 0 ou 7) e itens não-internos (`!item.key_.startsWith('zabbix[')`) são considerados no cálculo do `lastClock`.
* Um host é considerado **ONLINE** se:
  1. `h.status === '0'` (Host ativo no monitoramento);
  2. E (`isRecentlyActive` [dados reais recebidos nos últimos 15 minutos] **OU** `h.active_available === '1'`).
* Se a máquina parou de comunicar há mais de 15 minutos, ela recebe o status **OFFLINE**.

### 5.3. Sanitização Defensiva de Hardware
Caso o campo de processador ou hardware venha com erros de execução do PowerShell (`argumento`, `não existe`, `cannot find`) ou com o literal `unknown`, o sistema aplica o fallback determinístico utilizando o Fabricante e Modelo identificados pelo inventário do Zabbix (ex.: `Lenovo 11DU0026BP`, `Dell Latitude 3420`) ou `Processador x86_64`.

---

## 6. Módulo AIOps & Inteligência Artificial (`ollama-client.js`)

O NOC integra um motor de IA local auto-hospedado para diagnósticos sem envio de dados para nuvens públicas.

### 6.1. Especificações Técnicas
* **Endpoint:** `http://127.0.0.1:11434` (com fallback para `http://192.168.100.222:11434`).
* **Modelo:** `noc-aiops:8b` (base Llama 3 / Mistral quantizado).
* **Parâmetros de Inferência:** `temperature: 0.15` (foco em determinismo e precisão), `top_p: 0.9`, `num_predict: 650`.

### 6.2. Diretrizes de Validação Determinística Injetadas no Prompt
O prompt de sistema do Ollama contém regras estritas:
1. **Ancoragem Restrita:** Toda conclusão técnica deve ser fundamentada exclusivamente nas métricas e variáveis explicitamente enviadas no JSON da requisição. Dados não informados são tratados compulsoriamente como nulos.
2. **Extração Determinística:** Proibido deduzir ou inventar causas, portas, provedores ou multas sem evidência literal.
3. **Proibição de Emojis:** É terminantemente proibido o uso de qualquer emoji ou símbolo informal nas respostas.

---

## 7. Módulo de Proteção Regra V8 (`v8-guard.js`)

A Regra V8 protege a integridade operacional do Rodoviário Camilo dos Santos, impedindo a exclusão acidental ou maliciosa de ativos estratégicos.

### 7.1. Ativos Protegidos
* **Circuitos Críticos de Telecom:** Enlaces de polos principais (Matriz, São Paulo, Rio de Janeiro, Belo Horizonte, Campinas, Juiz de Fora).
* **Serviços Centrais:** `SANKHYA PRODUÇÃO`, `SANKHYA TESTE`, `PLURI`.
* **Gateways de Borda:** Roteadores centrais DrayTek.

### 7.2. Mecanismo de Bloqueio
Ao receber uma requisição em `/api/hosts/delete` ou `/api/assets/delete`:
* O middleware `v8ProtectionMiddleware` intercepta o `hostid` ou `name`.
* Consulta a função `isV8Protected(asset)`.
* Se o ativo constar na lista de proteção, a requisição é rejeitada imediatamente com HTTP 403 Forbidden e mensagem de violação da Regra V8 registrada no log de auditoria.

---

## 8. Interface com o Usuário (Frontend SPA)

Desenvolvida em Vanilla JavaScript moderno, HTML5 e CSS3 puro, sem dependências pesadas de frameworks (React/Vue/Angular), garantindo inicialização instantânea e baixo consumo de memória.

### 8.1. Componentes Principais
* **`store.js`:** Gerenciador reativo de estado. Estabelece conexão Server-Sent Events (SSE) com `/api/status/stream` e notifica os componentes visuais sobre novas telemetrias.
* **`wan-view.js`:** Renderização de cards e tabelas de circuitos WAN, cálculo de SLAs, latências médias e perda de pacotes.
* **`itam-view.js`:** Gestão de ativos de TI (computadores), agrupamento por filial/unidade operacional, exibição de antivírus ativo e hardware limpo.
* **`printers-view.js`:** Quadro de odômetros de impressão (total de páginas, impressões preto e branco, coloridas) e barras de progresso do nível de toner.
* **`asset-drawer.js`:** Gaveta lateral deslizante aberta ao clicar em qualquer dispositivo. Apresenta 6 abas horizontais:
  1. *Visão Geral:* Dados cadastrais, IP, status e fabricante.
  2. *Telemetria:* Gráficos em tempo real de latência/CPU/RAM.
  3. *Hardware / Especificações:* Placa-mãe, serial, núcleos e discos.
  4. *Rede & Conectividade:* Interfaces, gateway e rotas.
  5. *Diagnóstico:* Ferramentas integradas de Ping e MTR.
  6. *Análise AIOps:* Laudo pericial gerado pelo Ollama.

---

## 9. Procedimentos Operacionais e de Manutenção

### 9.1. Inicialização do Servidor de Produção
Para iniciar o servidor no ambiente de produção (`192.168.100.222`):
1. Execute o arquivo **`Iniciar NOC Enterprise.bat`** (ou `iniciar-noc-enterprise.ps1`).
2. O script verifica se a porta 4002 já está aberta. Caso contrário, inicia o Node.js com bind em `0.0.0.0:4002`.

### 9.2. Configuração de Inicialização Automática no Boot do Servidor
Para garantir que tanto o Ollama (com ícone no System Tray) quanto o NOC iniciem sozinhos a cada reinicialização do servidor:
1. Abra o arquivo **`configurar-inicializacao-servidor.bat`** como Administrador no servidor.
2. O script registra o `ollama app.exe` no Registro (`Run`) e na pasta de inicialização, além de criar as Tarefas Agendadas no Windows.

### 9.3. Garantia de Paridade entre Ambientes
O projeto é mantido com 100% de paridade SHA256 em três locais:
- `C:\NOC\` (Diretório local)
- `Z:\` (Compartilhamento de rede do servidor de produção `\\192.168.100.222\NOC`)
- `E:\noc-enterprise\` (Volume de backup e réplica)
Qualquer alteração em código deve ser replicada entre os três volumes para preservar a integridade do ambiente.
