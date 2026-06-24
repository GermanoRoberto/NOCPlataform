# NOC Platform

Dashboard de monitoramento operacional (SRE) de rede e impressoras com integração Zabbix.

## 1. Visão Geral do Sistema

O NOC Dashboard é uma solução integrada composta por:

1. **Frontend**: Dashboard em tempo real de página única (SPA), com gráficos dinâmicos, mapa de georeferenciação (Leaflet.js) e gerenciamento de thresholds/configurações.
2. **Backend**: Servidor Node.js utilizando Express, encarregado de:
   - Coletar dados via Zabbix API (ou simulador interno).
   - Gerenciar alertas via Telegram Bot em tempo real com proteção contra flapping.
   - Sincronizar dados operacionais com o Supabase.
   - Armazenar histórico no banco de dados SQLite local.
   - Suportar hot-reload de configurações de API sem reinicialização do processo.

## 2. Tecnologias Utilizadas

- **Backend**: Node.js, Express, Axios (HTTP Client), SQLite3
- **Frontend**: HTML5, Vanilla CSS (Design Responsivo e HSL customizado), Vanilla JS
- **Bibliotecas Frontend**: Leaflet.js (Mapas interativos), Chart.js (Gráficos históricos)

## 3. Funcionalidades Principais

- Monitoramento de links WAN (latência, perda de pacotes, tráfego, jitter, uso de banda)
- Monitoramento de impressoras (toner, contador de páginas, reservatório de descarte)
- Histórico de incidentes com duração e ciclo de vida
- Alertas via Telegram Bot com proteção contra flapping
- Integração com Zabbix (fallback para simulador local)
- Banco de dados SQLite para telemetria histórica
- Backup automático do banco de dados local para Supabase
- Mapa geográfico interativo dos links
- Configurações dinâmicas via interface (hot-reload)

## 4. Banco de Dados SQLite (`noc_telemetry.db`)

O banco local gerencia o histórico de telemetria, incidentes e eventos de troca de insumos. Ele é limpo automaticamente de forma parcial no startup (removendo dados de teste/simulador) e rotacionado a cada 24 horas (excluindo registros com mais de 30 dias).

### Tabelas

- **`links_history`**: Telemetria histórica de conectividade dos links
- **`printers_history`**: Dados de consumo e contadores de impressoras
- **`incidents_history`**: Duração e ciclo de vida de incidentes de indisponibilidade
- **`printer_exchanges`**: Log de trocas de suprimentos/toners detectadas

## 5. Integrações Externas

### A. API do Zabbix
- A cada 12 segundos, requisição em lote (JSON-RPC) para buscar hosts e itens específicos
- Mapeamento de telemetria: `icmpping`, `icmppingsec`, `icmppingloss`, `net.if.in`, `net.if.out`, contadores SNMP
- Recuperação de erros: ativa automaticamente o Simulador de Emergência

### B. Telegram Bot
- Alertas em tempo real de incidentes
- Comandos:
  - `/status`: Resumo de conectividade e saúde de impressoras
  - `/relatorio`: Sumário consolidado das últimas 24 horas
- Anti-Flapping:
  - Quedas: pelo menos 3 falhas consecutivas
  - Reestabelecimentos: pelo menos 2 pings bem-sucedidos

## 6. Fluxo de Configurações Dinâmicas (Hot Reload)

O servidor mescla configurações de duas fontes:
1. **`.env`**: Arquivo estático local para chaves principais e fallbacks
2. **`settings.json`**: Configurações editáveis diretamente na interface WEB

Ao salvar configurações pelo painel:
1. Frontend faz POST para `/api/config`
2. Servidor higieniza os dados e grava no `settings.json`
3. Executa `reloadConfig()` recarregando as variáveis sem derrubar o servidor

## 7. Instalação

1. Instale as dependências:
```bash
npm install
```

2. Configure as variáveis de ambiente:
```bash
# Copie o arquivo de exemplo
cp .env.example .env
# Edite o .env com suas credenciais
```

3. Inicie o servidor:
```bash
npm start
```

## 8. Configuração do .env

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (padrão: 4002) |
| `ZABBIX_URL` | URL da API do Zabbix |
| `ZABBIX_TOKEN` | Token de autenticação do Zabbix |
| `ENABLE_SIMULATION` | Habilita simulador local (true/false) |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram |
| `TELEGRAM_CHAT_ID` | ID do chat para alertas |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | Chave do Supabase |
| `SUPABASE_BUCKET` | Bucket para backups |
| `LINK_DOWN_CONFIRMATIONS` | Ciclos para confirmar queda (padrão: 3) |
| `LINK_UP_CONFIRMATIONS` | Ciclos para confirmar reestabelecimento (padrão: 2) |

## 9. Estrutura do Projeto

```
├── public/             # Arquivos front-end
│   ├── painel/         # Painel principal
│   └── inventario/     # Página de inventário
├── Zabbix/             # Tutoriais e documentos do Zabbix
├── server.js           # Servidor principal
├── package.json        # Dependências
├── settings.json       # Configurações do painel
├── .env.example        # Exemplo de variáveis de ambiente
└── README.md           # Este arquivo
```

## 10. Scripts

- `npm start`: Inicia o servidor
