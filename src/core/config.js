const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().default(4002),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
    ZABBIX_URL: z.string().url().default('http://rcsfti.ddns.net:8091/zabbix/api_jsonrpc.php'),
    ZABBIX_TOKEN: z.string().min(1).default('148077c3327165c2bb76c362a78278b9faf7ff731c9459f0288601e3cd7274fb'),
    TELEGRAM_BOT_TOKEN: z.string().optional().default('8760334503:AAH9_jLusYPlK1kRCotsS7MnyTMpYMQUS9c'),
    TELEGRAM_CHAT_IDS: z.string().optional().default('8784871565,8726300865'),
    ENABLE_SIMULATION: z.string().transform(v => v === 'true').default('false'),
    NOC_PUBLIC_URL: z.string().default('http://rcsfti.ddns.net:4002'),
    LINK_DOWN_CONFIRMATIONS: z.coerce.number().default(3),
    LINK_UP_CONFIRMATIONS: z.coerce.number().default(2),
    DB_PATH: z.string().default(path.join(__dirname, '../../data/noc_enterprise.db')),
    RETENTION_DAYS: z.coerce.number().default(90)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('Configuração inválida de variáveis de ambiente:', parsed.error.format());
    process.exit(1);
}

const config = Object.freeze({
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    isProduction: parsed.data.NODE_ENV === 'production',
    zabbix: {
        url: parsed.data.ZABBIX_URL,
        token: parsed.data.ZABBIX_TOKEN,
        timeoutMs: 5000,
        circuitBreakerThreshold: 3
    },
    telegram: {
        botToken: parsed.data.TELEGRAM_BOT_TOKEN,
        chatIds: parsed.data.TELEGRAM_CHAT_IDS
            ? parsed.data.TELEGRAM_CHAT_IDS.split(',').map(s => s.trim()).filter(Boolean)
            : []
    },
    simulation: parsed.data.ENABLE_SIMULATION,
    publicUrl: parsed.data.NOC_PUBLIC_URL,
    thresholds: {
        linkDownConfirmations: parsed.data.LINK_DOWN_CONFIRMATIONS,
        linkUpConfirmations: parsed.data.LINK_UP_CONFIRMATIONS
    },
    database: {
        path: path.resolve(parsed.data.DB_PATH)
    },
    retentionDays: parsed.data.RETENTION_DAYS
});

module.exports = config;
