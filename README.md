# NOC Platform

Dashboard de monitoramento de rede e impressoras com integração Zabbix.

## Funcionalidades

- Monitoramento de links WAN (latência, perda de pacotes, tráfego)
- Monitoramento de impressoras (toner, contador de páginas)
- Histórico de incidentes
- Alertas via Telegram
- Integração com Zabbix
- Simulador local para desenvolvimento
- Banco de dados SQLite para telemetria histórica
- Backup automático para Supabase

## Instalação

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

## Configuração do .env

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

## Scripts

- `npm start`: Inicia o servidor

## Estrutura

```
├── public/             # Arquivos front-end
│   ├── painel/         # Painel principal
│   └── inventario/     # Página de inventário
├── Zabbix/             # Tutoriais e documentos do Zabbix
├── server.js           # Servidor principal
├── package.json        # Dependências
└── settings.json       # Configurações do painel
```
