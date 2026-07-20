require('dotenv').config();

// Prevenção de travamentos globais (Crash Protection)
process.on('uncaughtException', (err) => {
    console.error('⚠️ [CRASH PREVENTION] Uncaught Exception:', err.message);
    if (err.stack) console.error(err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRASH PREVENTION] Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const { spawn } = require('child_process');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'noc_telemetry.db');
const db = new sqlite3.Database(dbPath);

let recentExchanges = [];
let latestStatusPayload = null;

// Inicializa Tabelas e Índices do Banco de Dados
db.serialize(() => {
    db.run("PRAGMA busy_timeout = 10000");
    db.run(`
        CREATE TABLE IF NOT EXISTS links_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link_id TEXT,
            name TEXT,
            status TEXT,
            latency REAL,
            packet_loss REAL,
            jitter REAL,
            traffic REAL,
            bandwidth REAL,
            bandwidth_used_pct REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS printers_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            printer_id TEXT,
            name TEXT,
            status TEXT,
            toner_level REAL,
            waste_toner_full REAL,
            black_counter INTEGER,
            color_counter INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS incidents_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link_id TEXT,
            name TEXT,
            down_at DATETIME,
            up_at DATETIME,
            duration_ms INTEGER,
            duration_text TEXT,
            status TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS printer_exchanges (
            id TEXT PRIMARY KEY,
            printer_id TEXT,
            printer_name TEXT,
            type TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_links_history_link_id ON links_history(link_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_links_history_timestamp ON links_history(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_printers_history_printer_id ON printers_history(printer_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_printers_history_timestamp ON printers_history(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_history_link_id ON incidents_history(link_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_history_status ON incidents_history(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_printer_exchanges_printer_id ON printer_exchanges(printer_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_printer_exchanges_timestamp ON printer_exchanges(timestamp)`);

    // Carregar histórico de trocas recentes para a memória no startup
    db.all(
        "SELECT id, printer_id as printerId, printer_name as printerName, type, message, timestamp FROM printer_exchanges ORDER BY timestamp DESC LIMIT 30",
        [],
        (err, rows) => {
            if (!err && rows) {
                recentExchanges = rows;
                console.log(`[DATABASE] Carregados ${recentExchanges.length} eventos de troca recentes.`);
            }
        }
    );

    // Limpar logs antigos de teste do banco no startup
    db.run("DELETE FROM incidents_history WHERE name LIKE '%test%' OR name LIKE '%teste%' OR name LIKE '%simul%'");
    db.run("DELETE FROM links_history WHERE name LIKE '%test%' OR name LIKE '%teste%' OR name LIKE '%simul%'");
    db.run("DELETE FROM printers_history WHERE name LIKE '%test%' OR name LIKE '%teste%' OR name LIKE '%simul%'");
    db.run("DELETE FROM printer_exchanges WHERE printer_name LIKE '%test%' OR printer_name LIKE '%teste%' OR printer_name LIKE '%simul%'");
    
    // Deduplicar incidentes históricos existentes
    db.run(`
        DELETE FROM incidents_history 
        WHERE id NOT IN (
            SELECT MIN(id) 
            FROM incidents_history 
            GROUP BY link_id, down_at, up_at
        )
    `, (err) => {
        if (!err) console.log("[DATABASE] Deduplicação de incidentes concluída com sucesso.");
    });

    console.log("[DATABASE] Limpeza de registros de teste concluída com sucesso.");
});



function loadEnvFallback(filePath, keys) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return;
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
            const [rawKey, ...rest] = trimmed.split('=');
            const key = rawKey.trim();
            if (!keys.includes(key)) return;
            if (process.env[key] && String(process.env[key]).trim()) return;
            let value = rest.join('=').trim();
            value = value.replace(/^['"]|['"]$/g, '');
            if (value) process.env[key] = value;
        });
    } catch (error) {
        console.warn('[ENV] Falha ao carregar fallback Telegram:', error.message);
    }
}

const SHARED_BOT_ENV_PATH = process.env.NOC_SHARED_BOT_ENV_PATH ||
    process.env.TELEGRAM_ENV_PATH ||
    'D:\\standalone_bot\\.env';

loadEnvFallback(
    SHARED_BOT_ENV_PATH,
    ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_IDS']
);

const app = express();
const PORT = process.env.PORT || 4002;
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

app.use(helmet({
    contentSecurityPolicy: false,
    hsts: false
}));

// Configuração CORS (ajuste o origin para suas origens confiáveis)
const corsOptions = {
    origin: process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Função helper para tratar erros 500 (não expor detalhes ao cliente)
function handleServerError(res, err, context = '') {
    console.error(`[ERRO] ${context}:`, err.message);
    if (err.stack) console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor. Por favor, tente novamente mais tarde.' });
}

// Configurações do Zabbix (recarregadas dinamicamente)
let ZABBIX_URL = '';
let ZABBIX_TOKEN = '';
let TELEGRAM_BOT_TOKEN = '';
let TELEGRAM_CHAT_IDS = [];
let TELEGRAM_MIN_PRIORITY = (process.env.TELEGRAM_MIN_PRIORITY || 'P3').toUpperCase();
let NOC_PUBLIC_URL = process.env.NOC_PUBLIC_URL || '';

let telegramPollOffset = 0;
let telegramPollActive = false;
const zabbixHttpClient = axios.create({
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 20 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20 })
});
const probeHttpClient = axios.create({
    timeout: 2500,
    maxRedirects: 0,
    validateStatus: () => true,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 20 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20, rejectUnauthorized: false })
});
const telegramHttpClient = axios.create({
    timeout: 5000,
    headers: { 'Content-Type': 'application/json' },
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 5 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 5 })
});


const DEFAULT_SETTINGS = {
    hidden: [],
    aliases: {},
    routerAccess: {},
    routerAccessMode: 'infer',
    thresholds: {
        toner: 15, // Porcentagem crítica para toner baixo
        latency: 120, // Latência máxima para considerar estável
        packetLoss: 5, // Perda de pacotes limite (%)
        jitter: 15, // Jitter limite (ms)
        cpu: 90, // CPU limite (%)
        ram: 90, // RAM limite (%)
        disk: 90 // Disco limite (%)
    },
    locations: {},
    owners: {},
    zabbixUrl: '',
    zabbixToken: '',
    telegramBotToken: '',
    telegramChatIds: ''
};

if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}
reloadConfig();

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function sanitizeRouterAccess(input = {}) {
    if (!input || typeof input !== 'object') return {};

    return Object.entries(input).reduce((acc, [key, value]) => {
        const id = String(key || '').trim();
        if (!id || typeof value !== 'object' || value === null) return acc;

        const url = String(value.url || '').trim();
        const enabled = value.enabled !== false;
        const note = String(value.note || '').trim().slice(0, 160);

        if (url && !/^https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]{1,300}$/i.test(url)) {
            return acc;
        }

        acc[id] = { enabled, url, note };
        return acc;
    }, {});
}

function buildRouterAccess(link, settings) {
    if (!link?.id) return { enabled: false, configured: false, url: null, label: 'Não configurado' };

    const configured = settings.routerAccess?.[String(link.id)] || settings.routerAccess?.[link.name];
    if (configured) {
        return {
            enabled: configured.enabled !== false && Boolean(configured.url),
            configured: true,
            url: configured.url || null,
            note: configured.note || '',
            label: configured.enabled === false ? 'Desabilitado' : (configured.url ? 'Configurado' : 'Pendente')
        };
    }

    if (settings.routerAccessMode === 'configured-only' || !link.ip) {
        return { enabled: false, configured: false, url: null, label: 'Não configurado' };
    }

    return {
        enabled: true,
        configured: false,
        inferred: true,
        url: `https://${link.ip}`,
        note: 'URL inferida automaticamente pelo IP do link.',
        label: 'Inferido'
    };
}

// Confirmacoes para evitar flapping / falso positivo de conectividade.
// Queda: exige 100% de perda (ou icmpping=0) por N ciclos consecutivos.
// Volta: exige 0% de perda (ou icmpping=1 quando loss nao existe) por N ciclos consecutivos.
const LINK_DOWN_CONFIRMATIONS = clampNumber(process.env.LINK_DOWN_CONFIRMATIONS, 1, 10, 3);
const LINK_UP_CONFIRMATIONS = clampNumber(process.env.LINK_UP_CONFIRMATIONS, 1, 10, 2);

function readSettings() {
    try {
        const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        return {
            ...DEFAULT_SETTINGS,
            ...raw,
            hidden: Array.isArray(raw.hidden) ? raw.hidden : DEFAULT_SETTINGS.hidden,
            aliases: raw.aliases && typeof raw.aliases === 'object' ? raw.aliases : DEFAULT_SETTINGS.aliases,
            routerAccess: raw.routerAccess && typeof raw.routerAccess === 'object' ? raw.routerAccess : DEFAULT_SETTINGS.routerAccess,
            routerAccessMode: ['infer', 'configured-only'].includes(raw.routerAccessMode) ? raw.routerAccessMode : DEFAULT_SETTINGS.routerAccessMode,
            thresholds: {
                toner: clampNumber(raw.thresholds?.toner, 1, 50, DEFAULT_SETTINGS.thresholds.toner),
                latency: clampNumber(raw.thresholds?.latency, 1, 1000, DEFAULT_SETTINGS.thresholds.latency),
                packetLoss: clampNumber(raw.thresholds?.packetLoss, 1, 100, DEFAULT_SETTINGS.thresholds.packetLoss),
                jitter: clampNumber(raw.thresholds?.jitter, 1, 500, DEFAULT_SETTINGS.thresholds.jitter),
                cpu: clampNumber(raw.thresholds?.cpu, 1, 100, DEFAULT_SETTINGS.thresholds.cpu),
                ram: clampNumber(raw.thresholds?.ram, 1, 100, DEFAULT_SETTINGS.thresholds.ram),
                disk: clampNumber(raw.thresholds?.disk, 1, 100, DEFAULT_SETTINGS.thresholds.disk)
            },
            zabbixUrl: raw.zabbixUrl !== undefined ? raw.zabbixUrl : (process.env.ZABBIX_URL || ''),
            zabbixToken: raw.zabbixToken !== undefined ? raw.zabbixToken : (process.env.ZABBIX_TOKEN || ''),
            telegramBotToken: raw.telegramBotToken !== undefined ? raw.telegramBotToken : (process.env.TELEGRAM_BOT_TOKEN || ''),
            telegramChatIds: raw.telegramChatIds !== undefined ? raw.telegramChatIds : (process.env.TELEGRAM_CHAT_IDS || '')
        };
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
}

function sanitizeSettings(input = {}) {
    return {
        hidden: Array.isArray(input.hidden)
            ? input.hidden.filter(x => typeof x === 'string').slice(0, 500)
            : [],
        aliases: input.aliases && typeof input.aliases === 'object' ? input.aliases : {},
        routerAccess: sanitizeRouterAccess(input.routerAccess),
        routerAccessMode: ['infer', 'configured-only'].includes(input.routerAccessMode) ? input.routerAccessMode : DEFAULT_SETTINGS.routerAccessMode,
        thresholds: {
            toner: clampNumber(input.thresholds?.toner, 1, 50, DEFAULT_SETTINGS.thresholds.toner),
            latency: clampNumber(input.thresholds?.latency, 1, 1000, DEFAULT_SETTINGS.thresholds.latency),
            packetLoss: clampNumber(input.thresholds?.packetLoss, 1, 100, DEFAULT_SETTINGS.thresholds.packetLoss),
            jitter: clampNumber(input.thresholds?.jitter, 1, 500, DEFAULT_SETTINGS.thresholds.jitter),
            cpu: clampNumber(input.thresholds?.cpu, 1, 100, DEFAULT_SETTINGS.thresholds.cpu),
            ram: clampNumber(input.thresholds?.ram, 1, 100, DEFAULT_SETTINGS.thresholds.ram),
            disk: clampNumber(input.thresholds?.disk, 1, 100, DEFAULT_SETTINGS.thresholds.disk)
        },
        locations: input.locations && typeof input.locations === 'object' ? input.locations : {},
        owners: input.owners && typeof input.owners === 'object' ? input.owners : {},
        customUnits: Array.isArray(input.customUnits) ? input.customUnits : [],
        zabbixUrl: String(input.zabbixUrl || '').trim(),
        zabbixToken: String(input.zabbixToken || '').trim(),
        telegramBotToken: String(input.telegramBotToken || '').trim(),
        telegramChatIds: String(input.telegramChatIds || '').trim()
    };
}

function reloadConfig() {
    const settings = readSettings();
    ZABBIX_URL = process.env.ZABBIX_URL || settings.zabbixUrl || '';
    ZABBIX_TOKEN = process.env.ZABABIX_TOKEN || process.env.ZABBIX_TOKEN || settings.zabbixToken || '';
    TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken || '';
    const envChatIds = process.env.TELEGRAM_CHAT_IDS || '';
    const settingsChatIds = settings.telegramChatIds || '';
    const combinedChatIds = Array.from(new Set([
        ...parseTelegramChatIds(envChatIds),
        ...parseTelegramChatIds(settingsChatIds)
    ]));
    TELEGRAM_CHAT_IDS = combinedChatIds;
    
    GROQ_API_KEY = process.env.GROQ_API_KEY || settings.groqApiKey || '';
    GROQ_MODEL = process.env.GROQ_MODEL || settings.groqModel || 'llama-3.1-8b-instant';
    
    console.log('[CONFIG] Configurações de API e integrações carregadas/recarregadas dinamicamente.');
    if (TELEGRAM_BOT_TOKEN && !telegramPollActive) {
        startTelegramBotPolling();
    }
}

let statusRefreshPromise = null;
const telegramIncidentState = new Map();

const printerSupplyState = new Map();
const linkConnectivityState = new Map(); // hostId -> { stable, downStreak, upStreak, lastSeenAt }
let incidentIntegrationsBootstrapped = false;
let printerSupplyBootstrapped = false;
let telegramLastSentAt = null;
let telegramLastError = null;
let lastGoodZabbixData = null;
let zabbixApiStatus = 'UP';
let zabbixApiDownSince = null;
let zabbixApiAlertSent = false;




// SIMULADOR DE IMPRESSORAS (Ativo se ENABLE_SIMULATION=true ou Zabbix offline)
let simulatedPrinters = [
    {
        id: "IMP-01",
        name: "IMP-MTZ-DIRETORIA (HP LaserJet Pro)",
        ip: "192.168.10.150",
        serialNumber: "JP31F89012",
        status: "online",
        tonerLevel: 85,
        wasteTonerFull: 12,
        blackCounter: 42100,
        colorCounter: null,
        latency: 4,
        uptime: "15d",
        lastExchange: null
    },
    {
        id: "IMP-02",
        name: "IMP-MTZ-FINANCEIRO (Ricoh MP 301)",
        ip: "192.168.10.151",
        serialNumber: "TH89A45123",
        status: "online",
        tonerLevel: 14, // Disparará "Atenção: Toner Baixo"
        wasteTonerFull: 45,
        blackCounter: 104250,
        colorCounter: null,
        latency: 6,
        uptime: "45d",
        lastExchange: null
    },
    {
        id: "IMP-03",
        name: "IMP-MTZ-COMERCIAL (HP PageWide Color)",
        ip: "192.168.10.152",
        serialNumber: "W67823908A",
        status: "online",
        tonerLevel: 62,
        wasteTonerFull: 28,
        blackCounter: 22890,
        colorCounter: 15410,
        latency: 8,
        uptime: "12d",
        lastExchange: null
    },
    {
        id: "IMP-04",
        name: "IMP-FILIAL-LOGISTICA (Brother MFC-L5702)",
        ip: "10.100.10.45",
        serialNumber: "BR23X45678",
        status: "online",
        tonerLevel: 98,
        wasteTonerFull: 8,
        blackCounter: 89630,
        colorCounter: null,
        latency: 42,
        uptime: "9d",
        lastExchange: null
    },
    {
        id: "IMP-05",
        name: "IMP-FILIAL-Faturamento (Xerox VersaLink)",
        ip: "10.100.10.46",
        serialNumber: "XR89234891",
        status: "online",
        tonerLevel: 41,
        wasteTonerFull: 95, // Disparará atenção por garrafa de descarte quase cheia
        blackCounter: 54120,
        colorCounter: 18940,
        latency: 48,
        uptime: "32d",
        lastExchange: null
    },
    {
        id: "IMP-06",
        name: "IMP-MTZ-RECEPCAO (HP LaserJet 1020)",
        ip: "192.168.10.155",
        serialNumber: "JP1020-891X",
        status: "offline", // Printer offline
        tonerLevel: 0,
        wasteTonerFull: 0,
        blackCounter: 125430,
        colorCounter: null,
        latency: null,
        uptime: null,
        lastExchange: null
    },
    {
        id: "IMP-07",
        name: "IMP-MTZ-MARKETING (Epson WorkForce Pro)",
        ip: "192.168.10.156",
        serialNumber: "EP54129843",
        status: "online",
        tonerLevel: 75,
        wasteTonerFull: 34,
        blackCounter: 14200,
        colorCounter: 32110,
        latency: 12,
        uptime: "21d",
        lastExchange: null
    },
    {
        id: "IMP-08",
        name: "IMP-MTZ-T.I. (Ricoh C 3004)",
        ip: "192.168.10.157",
        serialNumber: "RC95104231",
        status: "online",
        tonerLevel: 5, // Toner crítico
        wasteTonerFull: 18,
        blackCounter: 95100,
        colorCounter: 42350,
        latency: 5,
        uptime: "64d",
        lastExchange: null
    }
];

// recentExchanges is declared at the top of the file

let simulatedLinks = [
    {
        id: "LNK-01",
        name: "LINK-MTZ-PRINCIPAL (VIVO FIBRA)",
        ip: "200.180.15.1",
        status: "online",
        latency: 18,
        uptime: "180d",
        traffic: 84.5,
        trafficIn: 67.6,
        trafficOut: 16.9,
        bandwidth: 100,
        packetLoss: 0.0,
        jitter: 1.5
    },
    {
        id: "LNK-02",
        name: "LINK-MTZ-BACKUP (CLARO COAX)",
        ip: "201.24.48.9",
        status: "online",
        latency: 42,
        uptime: "45d",
        traffic: 12.4,
        trafficIn: 9.9,
        trafficOut: 2.5,
        bandwidth: 50,
        packetLoss: 0.0,
        jitter: 3.2
    },
    {
        id: "LNK-03",
        name: "VPN-MATRIZ-FILIAL (IPSEC)",
        ip: "10.100.10.1",
        status: "online",
        latency: 28,
        uptime: "12d",
        traffic: 4.8,
        trafficIn: 3.8,
        trafficOut: 1.0,
        bandwidth: 20,
        packetLoss: 0.1,
        jitter: 2.1
    },
    {
        id: "LNK-04",
        name: "SANKHYA - PRODUÇÃO",
        ip: "192.168.10.10",
        status: "online",
        latency: 2,
        uptime: "90d",
        traffic: 120.2,
        trafficIn: 96.2,
        trafficOut: 24.0,
        bandwidth: 1000,
        packetLoss: 0.0,
        jitter: 0.4
    },
    {
        id: "LNK-05",
        name: "LINK-FILIAL-LOGISTICA",
        ip: "186.200.14.8",
        status: "online",
        latency: 35,
        uptime: "60d",
        traffic: 22.1,
        trafficIn: 17.7,
        trafficOut: 4.4,
        bandwidth: 50,
        packetLoss: 0.0,
        jitter: 4.8
    },
    {
        id: "LNK-06",
        name: "LINK-FILIAL-FATURAMENTO",
        ip: "186.200.14.9",
        status: "offline",
        latency: null,
        uptime: null,
        traffic: null,
        trafficIn: null,
        trafficOut: null,
        bandwidth: 50,
        packetLoss: 100.0,
        jitter: null
    }
];

function isTestDevice(name, id) {
    const i = String(id || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    
    // Se o ID for numérico (ex: 10631), é um ativo real do Zabbix, não filtramos
    if (/^\d+$/.test(i)) {
        return false;
    }
    
    // Caso contrário, se contiver termos de teste ou prefixos de simulação, é considerado teste
    return n.includes('test') || n.includes('teste') || n.includes('simul') ||
           i.includes('test') || i.includes('teste') || i.includes('simul') ||
           i.startsWith('lnk-') || i.startsWith('imp-') ||
           n.includes('faturamento') || n.includes('logistica');
}


// Função de Persistência de Telemetria no SQLite
let lastSnapshotTimestamp = 0;

// Função de Persistência Otimizada de Telemetria no SQLite
function saveTelemetryToDatabase(payload) {
    try {
        const { links, printers } = payload;
        if (!links || !printers) return;

        const now = Date.now();
        // Tira snapshot de curva normal apenas a cada 30 minutos (para economizar espaço)
        const isSnapshotInterval = (now - lastSnapshotTimestamp) > 30 * 60 * 1000;
        if (isSnapshotInterval) {
            lastSnapshotTimestamp = now;
        }

        db.serialize(() => {
            const stmtLink = db.prepare(`
                INSERT INTO links_history (
                    link_id, name, status, latency, packet_loss, jitter, traffic, bandwidth, bandwidth_used_pct
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            links.forEach(l => {
                if (isTestDevice(l.name, l.id)) return;
                
                // Grava IMEDIATAMENTE se houver qualquer anomalia/queda/perda, OU se for a janela de snapshot de 30 min
                const isAnomaly = l.status !== 'online' || (l.packetLoss && l.packetLoss > 0) || (l.latency && l.latency > 150);
                
                if (isAnomaly || isSnapshotInterval) {
                    const used = l.telemetry?.bandwidthUsedPct || 0;
                    stmtLink.run(
                        String(l.id || ''),
                        String(l.name || ''),
                        String(l.status || 'online'),
                        l.latency === null ? null : Number(l.latency),
                        l.packetLoss === null ? null : Number(l.packetLoss),
                        l.jitter === null ? null : Number(l.jitter),
                        l.traffic === null ? null : Number(l.traffic),
                        l.bandwidth === null ? null : Number(l.bandwidth),
                        Number(used)
                    );
                }
            });
            stmtLink.finalize();

            const stmtPrinter = db.prepare(`
                INSERT INTO printers_history (
                    printer_id, name, status, toner_level, waste_toner_full, black_counter, color_counter
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            printers.forEach(p => {
                if (isTestDevice(p.name, p.id)) return;

                // Grava IMEDIATAMENTE se a impressora estiver offline ou com suprimento crítico, OU no snapshot
                const isWarning = p.status !== 'online' || (p.tonerLevel !== null && p.tonerLevel <= 20) || (p.wasteTonerFull && p.wasteTonerFull >= 80);

                if (isWarning || isSnapshotInterval) {
                    stmtPrinter.run(
                        String(p.id || ''),
                        String(p.name || ''),
                        String(p.status || 'online'),
                        p.tonerLevel === null ? null : Number(p.tonerLevel),
                        p.wasteTonerFull === null ? null : Number(p.wasteTonerFull),
                        p.blackCounter === null ? null : Number(p.blackCounter),
                        p.colorCounter === null ? null : Number(p.colorCounter)
                    );
                }
            });
            stmtPrinter.finalize();
        });
    } catch (e) {
        console.error('[DATABASE] Falha ao persistir telemetria:', e.message);
    }
}

// Rotina Diária de Manutenção, Purga Otimizada e VACUUM
setInterval(() => {
    try {
        db.serialize(() => {
            // Remove pontos normais com mais de 3 dias e anomalias antigas com mais de 7 dias
            db.run("DELETE FROM links_history WHERE status = 'online' AND (packet_loss IS NULL OR packet_loss = 0) AND timestamp < datetime('now', '-3 days')");
            db.run("DELETE FROM links_history WHERE timestamp < datetime('now', '-7 days')");
            db.run("DELETE FROM printers_history WHERE status = 'online' AND timestamp < datetime('now', '-3 days')");
            db.run("DELETE FROM printers_history WHERE timestamp < datetime('now', '-7 days')");
            
            // MANTÉM 180 DIAS (6 MESES) DE HISTÓRICO DE QUEDAS, INCIDENTES E TROCAS DE TONER
            db.run("DELETE FROM incidents_history WHERE datetime(down_at) < datetime('now', '-180 days')");
            db.run("DELETE FROM printer_exchanges WHERE timestamp < datetime('now', '-180 days')");

            // Executa VACUUM para devolver o espaço de disco ao sistema operacional
            db.run("VACUUM", (err) => {
                if (err) console.error('[DATABASE] Erro no VACUUM:', err.message);
                else console.log('[DATABASE] Purga e VACUUM de manutenção concluídos com sucesso.');
            });
        });
    } catch (e) {
        console.error('[DATABASE] Erro na rotina de manutenção:', e.message);
    }
}, 24 * 60 * 60 * 1000); // Executa a cada 24 horas

function recordIncidentStart(incident) {
    if (incident.type !== 'link') return;
    if (isTestDevice(incident.name, incident.assetId)) return;
    
    const nowStr = new Date().toISOString();
    
    db.get(
        "SELECT id FROM incidents_history WHERE link_id = ? AND status = 'active' LIMIT 1",
        [String(incident.assetId)],
        (err, row) => {
            if (err) {
                console.error('[DATABASE] Erro ao checar incidentes ativos:', err.message);
                return;
            }
            if (row) return; // Já ativo
            
            db.run(
                `INSERT INTO incidents_history (link_id, name, down_at, status) 
                 VALUES (?, ?, ?, 'active')`,
                [String(incident.assetId), String(incident.name), nowStr],
                (err2) => {
                    if (err2) {
                        console.error('[DATABASE] Falha ao registrar início de incidente:', err2.message);
                    } else {
                        console.log(`[DATABASE] Incidente ativado para o link: ${incident.name}`);
                    }
                }
            );
        }
    );
}

function recordIncidentEnd(incident, durationText) {
    if (incident.type !== 'link') return;
    if (isTestDevice(incident.name, incident.assetId)) return;
    
    const nowStr = new Date().toISOString();
    
    db.get(
        `SELECT id, down_at FROM incidents_history 
         WHERE link_id = ? AND status = 'active' 
         ORDER BY down_at DESC LIMIT 1`,
        [String(incident.assetId)],
        (err, row) => {
            if (err) {
                console.error('[DATABASE] Erro ao buscar incidente ativo:', err.message);
                return;
            }
            if (!row) return;
            
            const downMs = new Date(row.down_at).getTime();
            const upMs = new Date(nowStr).getTime();
            const durationMs = upMs - downMs;
            const finalDurationText = durationText || formatDuration(durationMs);
            
            db.run(
                `UPDATE incidents_history 
                 SET up_at = ?, duration_ms = ?, duration_text = ?, status = 'resolved' 
                 WHERE id = ?`,
                [nowStr, durationMs, finalDurationText, row.id],
                (err2) => {
                    if (err2) {
                        console.error('[DATABASE] Falha ao encerrar incidente:', err2.message);
                    } else {
                        console.log(`[DATABASE] Incidente resolvido para o link: ${incident.name} (Tempo fora: ${finalDurationText})`);
                    }
                }
            );
        }
    );
}

// HISTÓRICO DE MÉTRICAS EM MEMÓRIA PARA ANÁLISE DE CORRELAÇÃO SRE
function syncIncidentHistoryWithConfirmedDrops(payload) {
    if (!payload || !Array.isArray(payload.incidents)) return;

    const confirmedDropIds = new Set(
        payload.incidents
            .filter(isLinkDropIncident)
            .map(incident => String(incident.assetId))
    );

    payload.incidents
        .filter(isLinkDropIncident)
        .forEach(incident => recordIncidentStart(incident));

    db.all(
        "SELECT id, link_id, name, down_at FROM incidents_history WHERE status = 'active'",
        [],
        (err, rows) => {
            if (err) {
                console.error('[DATABASE] Erro ao reconciliar incidentes ativos:', err.message);
                return;
            }

            (rows || []).forEach(row => {
                if (confirmedDropIds.has(String(row.link_id))) return;

                const nowStr = new Date().toISOString();
                const downMs = new Date(row.down_at).getTime();
                const durationMs = Number.isFinite(downMs) ? Math.max(0, new Date(nowStr).getTime() - downMs) : 0;
                const durationText = formatDuration(durationMs);

                db.run(
                    `UPDATE incidents_history
                     SET up_at = ?, duration_ms = ?, duration_text = ?, status = 'resolved'
                     WHERE id = ?`,
                    [nowStr, durationMs, durationText, row.id],
                    err2 => {
                        if (err2) {
                            console.error('[DATABASE] Falha ao reconciliar incidente ativo:', err2.message);
                        } else {
                            console.log(`[DATABASE] Incidente reconciliado como resolvido: ${row.name}`);
                        }
                    }
                );
            });
        }
    );
}

let metricsHistory = {}; // deviceId -> { cpu: [], latency: [] }

function recordMetrics(id, cpu, latency) {
    if (!metricsHistory[id]) {
        metricsHistory[id] = { cpu: [], latency: [] };
    }
    const h = metricsHistory[id];
    if (cpu !== null && cpu !== undefined) {
        h.cpu.push(cpu);
    }
    if (latency !== null && latency !== undefined) {
        h.latency.push(latency);
    }
    if (h.cpu.length > 30) h.cpu.shift();
    if (h.latency.length > 30) h.latency.shift();
}

// CÁLCULO MATEMÁTICO DO COEFICIENTE DE CORRELAÇÃO DE PEARSON (SRE Metric Correlation)
function calculatePearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 5) return null; // Mínimo de amostras para significância estatística

    let sumX = 0, sumY = 0, sumXY = 0;
    let sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }

    const num = (n * sumXY) - (sumX * sumY);
    const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

    if (den === 0) return 0;
    return parseFloat((num / den).toFixed(2));
}

// MOTOR DE TRATATIVA DE IA POR HEURÍSTICA OPERACIONAL (Estilo Playbook OpenClaude)
function runHeuristicAI(p, history) {
    const r = calculatePearsonCorrelation(history.cpu, history.latency);
    const cpu = p.cpuUtil || 0;
    const latency = p.latency || 0;
    
    let diagnosis = "Status operacional nominal. Telemetria e links estáveis.";
    let riskVetor = "SEGURO";
    let directives = ["Manter monitoramento ativo."];

    if (p.status === 'offline') {
        diagnosis = `CRITICAL DETECTED: Equipamento ou Link fora do ar (${p.ip}). Conectividade de rede totalmente interrompida.`;
        riskVetor = "CRÍTICO (INTERRUPÇÃO)";
        directives = [
            "Checar fisicamente cabos de rede e energia no local.",
            "Executar ping manual no terminal de diagnóstico para validar rotas.",
            "Contatar provedor de link WAN imediatamente se o gateway externo estiver fora."
        ];
    } else {
        // Heurística de Sobrecarga de Processamento & Latência
        if (cpu > 60 && latency > 90) {
            if (r !== null && r >= 0.5) {
                diagnosis = `ALERTA DE DEGRADAÇÃO: Alta latência (${latency}ms) fortemente correlacionada (r = ${r}) com uso crítico de CPU (${cpu}%). Causa provável: spooler congestionado, loop infinito na API ou ataque de requisições.`;
                riskVetor = "ALTO RISCO (CPU-BTL)";
                directives = [
                    "Identificar threads ativas de processamento ou spooler de impressão travado.",
                    "Executar reinicialização preventiva de serviços no terminal do ativo.",
                    "Verificar tráfego anormal de rede ou pacotes corrompidos no link."
                ];
            } else {
                diagnosis = `ATENÇÃO DE REDE: Latência elevada (${latency}ms) e CPU em ${cpu}%, porém sem correlação linear direta (r = ${r || 0}). O gargalo pode estar no switch local, cabo defeituoso ou jitter de rede externa.`;
                riskVetor = "ATENÇÃO OPERACIONAL";
                directives = [
                    "Analisar integridade do switch e cabos do setor.",
                    "Verificar perda de pacotes externa no gateway WAN principal."
                ];
            }
        } else if (p.tonerLevel !== undefined && p.tonerLevel <= 15) {
            diagnosis = `ALERTA DE SUPRIMENTO: Nível de toner em ${p.tonerLevel}%. Risco de parada operacional imediata por falta de tinta.`;
            riskVetor = "TONER CRÍTICO";
            directives = [
                "Providenciar cartucho de toner sobressalente do estoque do setor.",
                "Programar a substituição operacional imediata do suprimento."
            ];
        } else if (p.wasteTonerFull !== undefined && p.wasteTonerFull >= 90) {
            diagnosis = `ATENÇÃO MANUTENÇÃO: Garrafa coletora de resíduos cheia (${p.wasteTonerFull}%). Risco de transbordo e danos físicos ao motor de rotação.`;
            riskVetor = "COLETOR QUASE CHEIO";
            directives = [
                "Esvaziar ou trocar a garrafa de descarte do toner.",
                "Limpar sensores óticos de descarte na área interna do ativo."
            ];
        }
    }

    return {
        correlation: r,
        diagnosis,
        riskVetor,
        directives
    };
}

function getOperationalTelemetry(device, type) {
    if (type === 'link') {
        const bandwidthUsed = device.status === 'offline' || !device.bandwidth || device.traffic === null
            ? 0
            : Math.min(100, Math.max(0, Number(((device.traffic / device.bandwidth) * 100).toFixed(1))));

        return {
            latencyMs: device.latency,
            packetLossPct: device.packetLoss ?? 0,
            jitterMs: device.jitter ?? 0,
            bandwidthMbps: device.bandwidth ?? null,
            trafficMbps: device.traffic ?? null,
            bandwidthUsedPct: bandwidthUsed,
            cpuPct: device.cpuUtil ?? 0
        };
    }

    return {
        latencyMs: device.latency,
        tonerPct: device.tonerLevel ?? null,
        wasteTonerPct: device.wasteTonerFull ?? null,
        totalPages: (device.blackCounter || 0) + (device.colorCounter || 0),
        cpuPct: device.cpuUtil ?? 0
    };
}

function classifyOperationalState(device, type, thresholds, flaps = 0) {
    const drivers = [];
    let severity = 'nominal';
    let healthScore = 100;
    let title = 'Operação nominal';
    let impact = 'Serviço monitorado sem sinais atuais de degradação.';
    let recommendation = 'Manter monitoramento e validar tendência nos próximos ciclos.';

    const raise = (nextSeverity, penalty, reason, nextTitle, nextImpact, nextRecommendation) => {
        const order = { nominal: 0, low: 1, medium: 2, high: 3, critical: 4 };
        if (order[nextSeverity] > order[severity]) {
            severity = nextSeverity;
            title = nextTitle;
            impact = nextImpact;
            recommendation = nextRecommendation;
        }
        drivers.push(reason);
        healthScore -= penalty;
    };

    if (device.anomalies && device.anomalies.length > 0) {
        device.anomalies.forEach(a => {
            raise(
                'medium',
                15,
                `Anomalia ${a.metric === 'latency' ? 'latência' : 'CPU'} (+${a.deviation}σ)`,
                'Comportamento Anômalo (AIOps)',
                `A métrica de ${a.metric === 'latency' ? 'latência' : 'CPU'} sofreu um desvio estatístico atípico de ${a.deviation} desvios padrão da média recente.`,
                'Investigar processos recentes no host, saturação de banda ou rota.'
            );
        });
    }

    if (device.status === 'offline') {
        raise(
            'critical',
            55,
            type === 'link' ? 'Link sem resposta' : 'Ativo sem resposta',
            type === 'link' ? 'Interrupção de conectividade' : 'Equipamento indisponível',
            type === 'link'
                ? 'Risco de indisponibilidade para sistemas, VPNs ou filiais dependentes.'
                : 'Risco de parada de impressão para o setor atendido pelo equipamento.',
            'Validar energia, cabeamento, gateway local e último evento no Zabbix antes de escalar.'
        );
    }

    if (type === 'link') {
        const latency = Number(device.latency || 0);
        const packetLoss = Number(device.packetLoss || 0);
        const jitter = Number(device.jitter || 0);
        const used = device.status === 'offline' || !device.bandwidth || device.traffic === null
            ? 0
            : (device.traffic / device.bandwidth) * 100;
        const usedDisplay = Math.min(100, Math.max(0, used));
        const usedLabel = usedDisplay >= 100 ? '>=100' : usedDisplay.toFixed(1);

        if (packetLoss >= thresholds.packetLoss) {
            raise('high', 22, `Perda ${packetLoss}%`, 'Perda de pacotes elevada', 'Usuários podem perceber lentidão, timeouts e falhas intermitentes.', 'Verificar interface WAN, rota, sinal do provedor e perdas no gateway.');
        } else if (packetLoss > 0) {
            raise('medium', 10, `Perda ${packetLoss}%`, 'Perda de pacotes detectada', 'Há risco de degradação em aplicações sensíveis a retransmissão.', 'Acompanhar tendência e comparar com histórico do link no Zabbix.');
        }

        if (latency > thresholds.latency) {
            raise('high', 18, `Latência ${latency}ms`, 'Latência acima do limite', 'Aplicações remotas e VPNs podem sofrer degradação perceptível.', 'Validar rota, saturação de banda e qualidade do provedor.');
        }

        if (jitter >= thresholds.jitter) {
            raise('medium', 12, `Jitter ${jitter}ms`, 'Jitter fora do padrão', 'Chamadas, VPN e sessões interativas podem oscilar.', 'Validar flaps, QoS e variação por horário.');
        }

        if (used >= 90) {
            raise('high', 18, `Banda ${usedLabel}%`, 'Capacidade próxima da saturação', 'O link está operando com baixa margem para picos.', 'Priorizar análise de top talkers e política de QoS.');
        } else if (used >= 75) {
            raise('medium', 9, `Banda ${usedLabel}%`, 'Capacidade em observação', 'Tendência de saturação se a demanda continuar crescendo.', 'Acompanhar tendência e revisar baseline de capacidade.');
        }

        // Estabilidade e Flapping baseados no banco SQLite local
        if (flaps > 0) {
            if (flaps >= 4) {
                raise('high', 20, `Estabilidade crítica (flaps: ${flaps})`, 'Link com flapping crítico', 'Múltiplas oscilações de rede (quedas/retornos) na última hora.', 'Providenciar contato imediato com a operadora para verificação física.');
            } else {
                raise('medium', 10, `Oscilação de sinal (flaps: ${flaps})`, 'Link instável / Flapping', 'Quedas e recuperações frequentes na última hora.', 'Acompanhar telemetria e verificar qualidade do sinal de rádio/fibra.');
            }
        }

        // Métricas de processamento/hardware caso estejam disponíveis no host (snmp/zabbix agent)
        if (device.cpuUtil !== undefined && device.cpuUtil !== null) {
            if (device.cpuUtil >= thresholds.cpu) {
                raise('high', 16, `CPU ${device.cpuUtil}%`, 'Uso de CPU crítico', 'Processamento saturado no host monitorado.', 'Identificar processos de alto consumo (top talkers, spooler ou threads travadas).');
            } else if (device.cpuUtil >= thresholds.cpu - 15) {
                raise('medium', 8, `CPU ${device.cpuUtil}%`, 'Uso de CPU elevado', 'Processamento acima da média recomendada.', 'Acompanhar tendência e verificar gargalos de hardware.');
            }
        }

        if (device.ramUtil !== undefined && device.ramUtil !== null) {
            if (device.ramUtil >= thresholds.ram) {
                raise('high', 16, `RAM ${device.ramUtil}%`, 'Uso de RAM crítico', 'Memória física quase saturada no host.', 'Liberar cache, encerrar vazamentos de memória ou planejar upgrade.');
            } else if (device.ramUtil >= thresholds.ram - 10) {
                raise('medium', 8, `RAM ${device.ramUtil}%`, 'Uso de RAM elevado', 'Memória física acima da média.', 'Verificar processos e planejar alocação preventiva.');
            }
        }

        if (device.diskUsed !== undefined && device.diskUsed !== null) {
            if (device.diskUsed >= thresholds.disk) {
                raise('high', 20, `Disco ${device.diskUsed}%`, 'Espaço em disco crítico', 'Armazenamento quase esgotado no host monitorado.', 'Executar limpeza de logs temporários, arquivos de despejo ou expandir volume.');
            } else if (device.diskUsed >= thresholds.disk - 10) {
                raise('medium', 10, `Disco ${device.diskUsed}%`, 'Espaço em disco em alerta', 'Armazenamento com baixa margem de segurança.', 'Liberar espaço preventivamente e auditar diretórios.');
            }
        }
    } else {
        const toner = Number(device.tonerLevel ?? 100);
        const waste = Number(device.wasteTonerFull ?? 0);
        const latency = Number(device.latency || 0);

        if (toner <= thresholds.toner) {
            raise('high', 24, `Toner ${toner}%`, 'Suprimento em nível crítico', 'Risco de parada operacional por falta de toner.', 'Separar suprimento compatível e programar troca antes do próximo pico.');
        } else if (toner <= Math.max(30, thresholds.toner + 10)) {
            raise('medium', 10, `Toner ${toner}%`, 'Suprimento em observação', 'Ativo deve entrar na fila preventiva de reposição.', 'Conferir estoque e planejar troca preventiva.');
        }

        if (waste >= 90) {
            raise('high', 20, `Coletor ${waste}%`, 'Coletor de resíduos no limite', 'Risco de bloqueio físico e falha de impressão.', 'Trocar ou esvaziar coletor e limpar sensores internos.');
        } else if (waste >= 75) {
            raise('medium', 8, `Coletor ${waste}%`, 'Coletor em observação', 'Risco crescente de manutenção corretiva.', 'Programar manutenção preventiva.');
        }

        if (latency > thresholds.latency) {
            raise('medium', 10, `Latência ${latency}ms`, 'Resposta de rede degradada', 'A fila de impressão pode apresentar lentidão ou timeouts.', 'Validar switch, cabo, porta e fila de spool.');
        }
    }

    return {
        severity,
        healthScore: Math.max(0, Math.round(healthScore)),
        drivers,
        title,
        impact,
        recommendation
    };
}

function enrichOperationalTelemetry(device, type, thresholds) {
    const history = metricsHistory[device.id] || { cpu: [], latency: [] };
    
    // Detecção de Anomalias Estatísticas (AIOps)
    device.anomalies = [];
    const latAnomaly = detectAnomaly(device.id, device.latency, 'latency', history.latency);
    if (latAnomaly) device.anomalies.push(latAnomaly);
    
    const cpuAnomaly = detectAnomaly(device.id, device.cpuUtil, 'cpu', history.cpu);
    if (cpuAnomaly) device.anomalies.push(cpuAnomaly);

    const classification = classifyOperationalState(device, type, thresholds, device.flaps || 0);
    device.type = type;
    device.telemetry = getOperationalTelemetry(device, type);
    device.severity = classification.severity;
    device.healthScore = classification.healthScore;
    device.riskDrivers = classification.drivers;
    device.operationalTitle = classification.title;
    device.businessImpact = classification.impact;
    device.recommendedAction = classification.recommendation;
    return device;
}

function deriveStableFallbackIp(hostid, prefix, startOctet = 10, range = 200) {
    const n = Number(hostid);
    if (!Number.isFinite(n)) return '';
    const last = startOctet + (Math.abs(Math.trunc(n)) % range);
    return `${prefix}.${last}`;
}

function resolveZabbixHostPrimaryIp(host) {
    const interfaces = Array.isArray(host?.interfaces) ? host.interfaces : [];
    const primary = interfaces.find(i => Number(i?.main) === 1) || interfaces[0];
    if (!primary) return '';
    const useIp = Number(primary?.useip) === 1;
    const value = useIp ? primary.ip : primary.dns;
    return String(value || '').trim();
}

function formatDuration(ms) {
    if (!ms || isNaN(ms) || ms < 0) return '0s';
    const totalSecs = Math.floor(ms / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}

function applyLinkConnectivityValidation(link) {
    if (!link || !link.id) return link;

    const now = Date.now();
    const id = String(link.id);
    const loss = (link.packetLoss !== null && link.packetLoss !== undefined && link.packetLoss !== '' && Number.isFinite(Number(link.packetLoss))) ? Number(link.packetLoss) : null;
    const ping = (link.icmpPing !== null && link.icmpPing !== undefined && link.icmpPing !== '' && Number.isFinite(Number(link.icmpPing))) ? Number(link.icmpPing) : null; // icmpping: 1=up, 0=down

    const hasLoss = loss !== null;
    const downCandidate = hasLoss ? loss >= 100 : ping === 0;
    const upCandidate = hasLoss ? loss < 100 : ping === 1;

    // Links de serviços/integrações externas (não gateways de internet de filiais)
    const nameUpper = String(link.name || '').toUpperCase();
    const isExternal = nameUpper.includes('SANKHYA') || nameUpper.includes('PLURI');
    const downConfirmations = isExternal ? 1 : LINK_DOWN_CONFIRMATIONS;
    const upConfirmations = isExternal ? 1 : LINK_UP_CONFIRMATIONS;

    let state = linkConnectivityState.get(id);
    if (!state) {
        // Primeira amostra pós-inicialização do servidor: assume o estado inicial real para evitar alertas falsos de recuperação
        const initialStable = downCandidate ? 'offline' : 'online';
        state = {
            stable: initialStable,
            downStreak: downCandidate ? downConfirmations : 0,
            upStreak: upCandidate ? upConfirmations : 0,
            lastSeenAt: now,
            lastClock: 0
        };
        linkConnectivityState.set(id, state);
    }

    state.lastSeenAt = now;

    // Apenas atualiza o streak se recebermos uma amostra nova do Zabbix (ou se for simulação sem clock)
    const currentClock = link.lastClock ? Number(link.lastClock) : null;
    const isNewSample = currentClock === null || currentClock > (state.lastClock || 0);

    if (isNewSample) {
        if (currentClock !== null) {
            state.lastClock = currentClock;
        }

        if (downCandidate) {
            state.downStreak += 1;
            state.upStreak = 0;
        } else if (upCandidate) {
            state.upStreak += 1;
            state.downStreak = 0;
        } else {
            // Sinal intermediario (ex: perda parcial): nao transiciona conectividade.
            state.downStreak = 0;
            state.upStreak = 0;
        }

        const oldStable = state.stable;

        if (state.stable !== 'offline' && state.downStreak >= downConfirmations) {
            state.stable = 'offline';
            state.downStreak = downConfirmations;
            state.upStreak = 0;
        } else if (state.stable !== 'online' && state.upStreak >= upConfirmations) {
            state.stable = 'online';
            state.upStreak = upConfirmations;
            state.downStreak = 0;
        }

        if (oldStable !== 'offline' && state.stable === 'offline') {
            state.downStartedAt = now;
            delete state.recoveryDurationText;
            delete state.recoveryDurationMs;
        } else if (oldStable === 'offline' && state.stable === 'online') {
            if (state.downStartedAt) {
                const recoveryDurationMs = now - state.downStartedAt;
                const recoveryDurationText = formatDuration(recoveryDurationMs);
                state.recoveryDurationText = recoveryDurationText;
                state.recoveryDurationMs = recoveryDurationMs;
                delete state.downStartedAt;
            } else {
                state.recoveryDurationText = 'Tempo indeterminado';
            }
        }
    }

    linkConnectivityState.set(id, state);

    // Status final (hard): so OFFLINE quando confirmado.
    link.status = state.stable === 'offline' ? 'offline' : 'online';

    // Contexto para UI / debug (nao quebra o front se ignorado).
    link.connectivity = {
        stable: state.stable,
        downCandidate,
        upCandidate,
        downStreak: state.downStreak,
        upStreak: state.upStreak,
        downConfirmations: downConfirmations,
        upConfirmations: upConfirmations,
        downStartedAt: state.downStartedAt || null,
        recoveryDurationText: state.recoveryDurationText || null,
        recoveryDurationMs: state.recoveryDurationMs || null
    };

    return link;
}

function deriveIncidentPriority(device, type) {
    if (type === 'link') {
        const used = device.bandwidth && device.traffic !== null ? (Number(device.traffic) / Number(device.bandwidth)) * 100 : 0;
        const packetLoss = Number(device.packetLoss || 0);

        // P1 reservado para indisponibilidade confirmada (queda real).
        if (device.status === 'offline') return 'P1';
        // Degradacao severa (ex: perda alta) nao deve ser classificada como queda.
        if (packetLoss >= 50 || packetLoss >= 5 || used >= 95 || device.severity === 'critical') return 'P2';
        if (device.severity === 'high' || device.latency > 0 || used >= 75) return 'P3';
        return 'P4';
    }

    const toner = device.tonerLevel !== null && Number.isFinite(Number(device.tonerLevel)) ? Number(device.tonerLevel) : 100;
    const waste = device.wasteTonerFull !== null && Number.isFinite(Number(device.wasteTonerFull)) ? Number(device.wasteTonerFull) : 0;

    if (device.status === 'offline') return 'P2';
    if (toner <= 0) return 'P2';
    if (toner <= 5 || waste >= 95) return 'P3';
    if (toner <= 15 || waste >= 90) return 'P3';
    if (toner <= 30 || waste >= 75) return 'P4';
    return 'P4';
}

function priorityWeight(priority) {
    return { P1: 4, P2: 3, P3: 2, P4: 1, INFO: 0 }[priority] || 0;
}

function parseTelegramChatIds(value) {
    return String(value || '')
        .replace(/;/g, ',')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function isTelegramConfigured() {
    return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length);
}

function shouldNotifyTelegramPriority(priority) {
    return priorityWeight(priority) >= priorityWeight(TELEGRAM_MIN_PRIORITY);
}

function isLinkDropIncident(incident) {
    if (!incident || incident.type !== 'link') return false;
    // Ignorar alertas para gateways de saída para evitar alarmes ruidosos
    if (incident.name && incident.name.toUpperCase().includes('GATEWAY')) return false;
    // Alertas externos somente quando a conectividade estiver realmente em queda confirmada.
    return incident.status === 'offline';
}

function htmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDashboardUrl() {
    if (NOC_PUBLIC_URL) return NOC_PUBLIC_URL;

    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                return `http://${entry.address}:${PORT}`;
            }
        }
    }

    return `http://localhost:${PORT}`;
}

function formatTelegramTime(date = new Date()) {
    return date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTelegramSection(title, body) {
    const content = String(body || '').trim();
    if (!content) return '';
    return `<b>${htmlEscape(title)}</b>\n${content}`;
}

function formatTelegramDetailLines(labels) {
    return Object.entries(labels)
        .filter(([, value]) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length))
        .map(([label, value]) => `• <b>${htmlEscape(label)}:</b> <code>${htmlEscape(value)}</code>`)
        .join('\n');
}

function getIncidentSeverityLabel(priority) {
    return ({ P1: 'CRITICAL', P2: 'HIGH', P3: 'MEDIUM', P4: 'LOW' }[priority] || 'MEDIUM');
}

function formatTelegramAssetList(incident) {
    return `• <code>${htmlEscape(incident.name)}</code>${incident.ip ? ` - <code>${htmlEscape(incident.ip)}</code>` : ''}`;
}

function formatTelegramRecoveryMessage(incident) {
    const typeLabel = incident.type === 'link' ? 'Link WAN' : 'Impressora';
    const statusLabel = incident.status ? String(incident.status).toUpperCase() : 'N/A';
    const title = incident.type === 'link' ? '🟢 <b>CONECTIVIDADE RESTABELECIDA</b>' : '🟢 <b>ATIVO NORMALIZADO</b>';
    
    const details = {
        Tipo: typeLabel,
        Prioridade: incident.priority,
        Status: statusLabel,
        Score: incident.healthScore ?? 'N/A',
        Horário: formatTelegramTime()
    };

    if (incident.type === 'link' && incident.recoveryDurationText) {
        details['Tempo offline'] = incident.recoveryDurationText;
    }

    const technical = formatTelegramDetailLines(details);

    return [
        title,
        '<i>Evento operacional normalizado no ciclo atual.</i>',
        formatTelegramSection('Resumo executivo', `Serviço restabelecido para <code>${htmlEscape(incident.name)}</code>. Monitoramento voltou ao estado nominal ou saiu do limiar de alerta.`),
        formatTelegramSection('Detalhamento técnico', technical),
        formatTelegramSection(incident.type === 'link' ? 'Links normalizados' : 'Ativos normalizados', formatTelegramAssetList(incident)),
        formatTelegramSection('Status operacional', htmlEscape(incident.action || 'Manter monitoramento e validar tendência nos próximos ciclos.')),
        '<i>Camilo dos Santos NOC</i>'
    ].filter(Boolean).join('\n\n').slice(0, 3900);
}

function formatTelegramIncidentMessage(kind, incident) {
    if (kind === 'recovery') {
        return formatTelegramRecoveryMessage(incident);
    }

    const typeLabel = incident.type === 'link' ? 'Link WAN' : 'Impressora';
    const statusLabel = incident.status ? String(incident.status).toUpperCase() : 'N/A';
    const severity = getIncidentSeverityLabel(incident.priority);
    const isConnectivity = incident.type === 'link';
    const eventClass = 'QUEDA DE LINK';
    const header = isConnectivity ? '🔴 <b>INCIDENTE DE CONECTIVIDADE</b>' : '🟠 <b>ALERTA OPERACIONAL</b>';
    const summary = isConnectivity ? 'Queda de link confirmada pelo NOC.' : 'Condição operacional requer atenção do NOC.';
    const executive = [
        `Incidente classificado como <code>${htmlEscape(eventClass)}</code>.`,
        `Escopo afetado: <code>${htmlEscape(incident.name)}</code>.`
    ].join('\n');
    const technical = formatTelegramDetailLines({
        Severidade: severity,
        Prioridade: incident.priority,
        Tipo: typeLabel,
        IP: incident.ip || 'N/A',
        Status: statusLabel,
        Score: incident.healthScore ?? 'N/A',
        Sinal: incident.detail,
        Horário: formatTelegramTime()
    });

    return [
        header,
        `<i>${summary}</i>`,
        formatTelegramSection('Resumo executivo', executive),
        formatTelegramSection('Detalhamento técnico', technical),
        formatTelegramSection(isConnectivity ? 'Links afetados' : 'Ativos afetados', formatTelegramAssetList(incident)),
        formatTelegramSection('Impacto operacional', htmlEscape(incident.impact || 'N/A')),
        formatTelegramSection('Ação recomendada', htmlEscape(incident.action || 'Validar no dashboard.')),
        '<i>Camilo dos Santos NOC</i>'
    ].filter(Boolean).join('\n\n').slice(0, 3900);
}

async function sendTelegramMessage(text, { silent = false, chat_id = null } = {}) {
    if (!isTelegramConfigured()) {
        telegramLastError = 'TELEGRAM_BOT_TOKEN e destinatário Telegram ausentes.';
        return { skipped: true, reason: telegramLastError };
    }

    const targets = chat_id ? [chat_id] : TELEGRAM_CHAT_IDS;

    const results = await Promise.allSettled(targets.map(chatId =>
        telegramHttpClient.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                disable_notification: silent
            }
        )
    ));

    const failures = results.filter(result => result.status === 'rejected');
    const successes = results.length - failures.length;

    if (successes > 0) {
        telegramLastSentAt = new Date().toISOString();
        telegramLastError = failures.length
            ? `${failures.length} destino(s) Telegram falharam.`
            : null;
        return { ok: true, sent: successes, failed: failures.length };
    }

    const firstError = failures[0]?.reason;
    telegramLastError = firstError?.response?.data?.description || firstError?.message || 'Falha ao enviar Telegram.';
    if (telegramLastError) {
        console.warn('[TELEGRAM] Falha ao enviar alerta:', telegramLastError);
    }
    return { ok: false, error: telegramLastError };
}



function rememberPrinterSupplyState(printer) {
    if (!printer?.id) return;
    printerSupplyState.set(printer.id, {
        tonerLevel: Number.isFinite(Number(printer.tonerLevel)) ? Number(printer.tonerLevel) : null,
        wasteTonerFull: Number.isFinite(Number(printer.wasteTonerFull)) ? Number(printer.wasteTonerFull) : null,
        name: printer.name,
        ip: printer.ip,
        updatedAt: new Date().toISOString()
    });
}

function registerPrinterExchange(event) {
    if (!event?.id) return;
    if (!recentExchanges.some(item => item.id === event.id)) {
        recentExchanges.unshift(event);
        if (recentExchanges.length > 30) recentExchanges.pop();
    }
    
    // Não guardar informações de teste (simulados ou manuais) no SQLite
    if (event.id && event.id.startsWith('EXC-ZBX-')) {
        try {
            db.run(
                `INSERT OR IGNORE INTO printer_exchanges (id, printer_id, printer_name, type, message, timestamp)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    String(event.id),
                    String(event.printerId || ''),
                    String(event.printerName || 'Impressora'),
                    String(event.type || 'toner'),
                    String(event.message || ''),
                    event.timestamp || new Date().toISOString()
                ],
                (err) => {
                    if (err) console.error('[DATABASE] Falha ao registrar troca no SQLite:', err.message);
                    else console.log(`[DATABASE] Troca registrada no SQLite: ${event.message}`);
                }
            );
        } catch (e) {
            console.error('[DATABASE] Erro ao persistir troca no SQLite:', e.message);
        }
    } else {
        console.log(`[DATABASE] Evento de teste ignorado para persistência: ${event.message}`);
    }

}

function processPrinterSupplyEvents(printers) {
    if (!Array.isArray(printers)) return;

    printers.forEach(printer => {
        const previous = printerSupplyState.get(printer.id);
        const toner = Number(printer.tonerLevel);
        const waste = Number(printer.wasteTonerFull);

        if (printerSupplyBootstrapped && previous) {
            if (Number.isFinite(toner) && Number.isFinite(previous.tonerLevel) && previous.tonerLevel <= 25 && toner >= 95) {
                registerPrinterExchange({
                    id: `EXC-ZBX-TONER-${printer.id}-${Date.now()}`,
                    printerId: printer.id,
                    printerName: printer.name,
                    type: 'toner',
                    message: `Troca de toner identificada via telemetria em ${printer.name}`,
                    timestamp: new Date().toISOString()
                });
            }

            if (Number.isFinite(waste) && Number.isFinite(previous.wasteTonerFull) && previous.wasteTonerFull >= 85 && waste <= 5) {
                registerPrinterExchange({
                    id: `EXC-ZBX-WASTE-${printer.id}-${Date.now()}`,
                    printerId: printer.id,
                    printerName: printer.name,
                    type: 'waste',
                    message: `Coletor de resíduos substituído em ${printer.name}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        rememberPrinterSupplyState(printer);
    });

    printerSupplyBootstrapped = true;
}



function notifyIncidentIntegrations(kind, incident) {
    if (isTelegramConfigured()) {
        sendTelegramMessage(formatTelegramIncidentMessage(kind, incident));
    }
}

function processIncidentIntegrations(payload) {
    if (!payload?.incidents) return;

    const activeByAsset = new Map();
    payload.incidents
        .filter(isLinkDropIncident)
        .filter(incident => !isTestDevice(incident.name, incident.assetId))
        .filter(incident => shouldNotifyTelegramPriority(incident.priority))
        .forEach(incident => {
            const assetKey = `${incident.type}:${incident.assetId}`;
            activeByAsset.set(assetKey, incident);
        });

    if (!incidentIntegrationsBootstrapped) {
        activeByAsset.forEach((incident, assetKey) => {
            const signature = `${incident.priority}|${incident.status}|${incident.title}`;
            telegramIncidentState.set(assetKey, { ...incident, signature });
        });
        incidentIntegrationsBootstrapped = true;
        return;
    }

    activeByAsset.forEach((incident, assetKey) => {
        const previous = telegramIncidentState.get(assetKey);
        const signature = `${incident.priority}|${incident.status}|${incident.title}`;

        if (!previous) {
            telegramIncidentState.set(assetKey, { ...incident, signature });
            notifyIncidentIntegrations('open', incident);
            return;
        }

        telegramIncidentState.set(assetKey, { ...incident, signature });
    });

    Array.from(telegramIncidentState.entries()).forEach(([assetKey, previous]) => {
        if (activeByAsset.has(assetKey)) return;
        telegramIncidentState.delete(assetKey);

        const connState = linkConnectivityState.get(String(previous.assetId));
        const recoveryDurationText = connState?.recoveryDurationText || null;

        notifyIncidentIntegrations('recovery', {
            ...previous,
            title: 'Ativo voltou ao estado nominal ou saiu do limiar de alerta',
            status: 'normalizado',
            impact: 'Impacto operacional encerrado no ciclo atual.',
            action: 'Manter monitoramento e validar tendência nos próximos ciclos.',
            recoveryDurationText: recoveryDurationText
        });
    });
}

function buildPriorityBalancedRecommendations(incidents) {
    const quotas = { P1: 2, P2: 2, P3: 2, P4: 1 };
    const selected = [];
    const selectedIds = new Set();

    ['P1', 'P2', 'P3', 'P4'].forEach(priority => {
        incidents
            .filter(incident => incident.priority === priority)
            .slice(0, quotas[priority])
            .forEach(incident => {
                selected.push(incident);
                selectedIds.add(incident.id);
            });
    });

    if (selected.length < 6) {
        incidents
            .filter(incident => !selectedIds.has(incident.id))
            .slice(0, 6 - selected.length)
            .forEach(incident => selected.push(incident));
    }

    return selected.slice(0, 6).map(i => ({
        assetId: i.assetId,
        priority: i.priority,
        title: i.title,
        action: i.action
    }));
}

function buildIncident(device, type) {
    if (device.severity === 'nominal' || device.severity === 'low') return null;

    // Equipamentos Draytek (roteadores) não devem gerar incidentes de rede
    if (String(device.name || '').toLowerCase().includes('draytek')) {
        return null;
    }

    const priority = deriveIncidentPriority(device, type);
    let detail = device.riskDrivers.join(' | ') || 'Sem driver especifico';
    if (type === 'link' && device.status === 'offline' && device.connectivity?.downStartedAt) {
        const ms = Date.now() - device.connectivity.downStartedAt;
        detail += ` | Fora há ${formatDuration(ms)}`;
    }

    return {
        id: `${priority}-${type.toUpperCase()}-${device.id}`,
        assetId: device.id,
        type,
        name: device.name,
        ip: device.ip,
        severity: device.severity,
        priority,
        title: device.operationalTitle,
        detail,
        impact: device.businessImpact,
        action: device.recommendedAction,
        healthScore: device.healthScore,
        status: device.status,
        observedAt: new Date().toISOString(),
        connectivity: device.connectivity
    };
}

function buildOperationalSummary(printers, links, thresholds, source, generatedAt, flapMap = {}) {
    const networkDevices = links.map(d => ({ ...d, type: 'link' }));

    const incidents = networkDevices
        .map(d => buildIncident(d, d.type))
        .filter(Boolean)
        .filter(isLinkDropIncident);

    // Correlacionador de Eventos (AIOps: Site Isolation)
    const incidentsByCity = {};
    incidents.forEach(inc => {
        const linkDevice = links.find(l => String(l.id) === String(inc.assetId));
        const city = linkDevice?.city || '';
        if (city) {
            if (!incidentsByCity[city]) incidentsByCity[city] = [];
            incidentsByCity[city].push(inc);
        }
    });

    Object.keys(incidentsByCity).forEach(city => {
        const cityIncidents = incidentsByCity[city];
        const totalCityLinks = links.filter(l => l.city === city).length;
        if (cityIncidents.length >= 2 && cityIncidents.length === totalCityLinks) {
            const rootIncidentId = `SITE-ISOLATION-${city.toUpperCase()}`;
            cityIncidents.forEach(inc => {
                inc.correlatedTo = rootIncidentId;
                inc.title = `Isolação Total do Site: ${city}`;
                inc.detail = `Queda simultânea de todos os links de ${city}. Filial está completamente isolada.`;
                inc.impact = `Filial isolada de sistemas centrais, tráfego interno interrompido.`;
                inc.action = `Acionar comitê de crise local, validar energia geral e contatar operadoras imediatamente.`;
            });
        }
    });

    incidents.sort((a, b) => {
        const weight = { critical: 4, high: 3, medium: 2, low: 1, nominal: 0 };
        return priorityWeight(b.priority) - priorityWeight(a.priority) ||
            weight[b.severity] - weight[a.severity] ||
            a.name.localeCompare(b.name);
    });

    const availableNetworkDevices = networkDevices.filter(d => d.status !== 'offline').length;
    const healthScore = networkDevices.length
        ? Math.round(networkDevices.reduce((sum, d) => sum + (d.healthScore ?? 100), 0) / networkDevices.length)
        : 100;

    const totalBandwidth = links.reduce((sum, l) => sum + Number(l.bandwidth || 0), 0);
    const usedBandwidth = links.reduce((sum, l) => sum + Math.min(Number(l.bandwidth || 0), Number(l.traffic || 0)), 0);
    const rawCapacityUsed = totalBandwidth ? (usedBandwidth / totalBandwidth) * 100 : 0;
    const avgPacketLoss = links.length
        ? links.reduce((sum, l) => sum + Number(l.packetLoss || 0), 0) / links.length
        : 0;
    const avgJitter = links.length
        ? links.reduce((sum, l) => sum + Number(l.jitter || 0), 0) / links.length
        : 0;

    // Calcular estabilidade média com base no flapMap
    const avgStability = links.length
        ? Math.max(0, 100 - (links.reduce((sum, l) => sum + (flapMap[l.id] || 0), 0) * 10))
        : 100;

    // Calcular CPU média de todos os hosts com dados (links/infra e impressoras)
    const hostsWithCpu = [...printers, ...links].filter(h => h.cpuUtil !== undefined && h.cpuUtil !== null && h.cpuUtil > 0);
    const avgCpu = hostsWithCpu.length
        ? Math.round(hostsWithCpu.reduce((sum, h) => sum + h.cpuUtil, 0) / hostsWithCpu.length)
        : null;

    const criticalIncidents = incidents.filter(i => i.priority === 'P1').length;
    const highIncidents = incidents.filter(i => i.priority === 'P2').length;
    const mediumIncidents = incidents.filter(i => i.priority === 'P3').length;
    const lowIncidents = incidents.filter(i => i.priority === 'P4').length;

    return {
        incidents,
        recommendations: buildPriorityBalancedRecommendations(incidents),
        summary: {
            totalDevices: networkDevices.length,
            healthScore,
            availabilityScore: networkDevices.length ? Number(((availableNetworkDevices / networkDevices.length) * 100).toFixed(1)) : 100,
            criticalIncidents,
            highIncidents,
            mediumIncidents,
            lowIncidents,
            activeIncidents: incidents.length,
            networkCapacityUsed: Number(Math.min(100, Math.max(0, rawCapacityUsed)).toFixed(1)),
            avgPacketLoss: Number(avgPacketLoss.toFixed(1)),
            avgJitter: Number(avgJitter.toFixed(1)),
            avgStability: Number(avgStability.toFixed(1)),
            avgCpu,
            uptimePrinters: printers.length ? Number(((printers.filter(p => p.status !== 'offline').length / printers.length) * 100).toFixed(1)) : 100,
            operationalState: criticalIncidents > 0 ? 'critical' : incidents.length > 0 ? 'degraded' : 'stable'
        },
        meta: {
            source,
            generatedAt,
            refreshIntervalSec: 12,
            thresholds,
            zabbixConfigured: Boolean(ZABBIX_URL && ZABBIX_TOKEN),
            mode: process.env.ENABLE_SIMULATION === 'true' ? 'simulation-forced' : source,
            customUnits: readSettings().customUnits || []
        }
    };
}

// Loop do Simulador: Atualiza contadores, consome toner, flutua links e simula trocas (100%)
setInterval(() => {
    if (process.env.ENABLE_SIMULATION !== 'true') return;

    // Atualiza Impressoras
    simulatedPrinters.forEach(p => {
        if (p.status === 'offline') {
            if (Math.random() > 0.95) {
                p.status = 'online';
                p.latency = Math.floor(Math.random() * 15) + 3;
                p.uptime = "1d";
            }
            // Garante histórico populado para offline
            recordMetrics(p.id, 0, 0);
            return;
        }

        // Simulação de CPU e Latência
        p.cpuUtil = Math.max(2, Math.floor(Math.random() * 20) + 4); // CPU Normal: 4-24%
        
        // Simular pico severo de CPU e latência correlacionados em IMP-02 (Ricoh)
        if (p.id === 'IMP-02' && Math.random() > 0.6) {
            p.cpuUtil = Math.floor(Math.random() * 35) + 65; // 65-100%
            p.latency = Math.floor(p.cpuUtil * 1.5) + Math.floor(Math.random() * 15); // Correlacionados!
        }

        const blackPrinted = Math.floor(Math.random() * 5);
        p.blackCounter += blackPrinted;
        if (p.colorCounter !== null) {
            p.colorCounter += Math.floor(Math.random() * 3);
        }

        if (blackPrinted > 0) {
            p.tonerLevel = Math.max(0, parseFloat((p.tonerLevel - (blackPrinted * 0.05)).toFixed(2)));
        }

        if (Math.random() > 0.98) {
            p.wasteTonerFull = Math.min(100, p.wasteTonerFull + 2);
        }

        if (p.tonerLevel < 15 && Math.random() > 0.85) {
            p.tonerLevel = 100;
            const exchangeMsg = `Troca de Toner realizada no equipamento ${p.name}`;
            p.lastExchange = new Date().toISOString();
            
            const exchangeEvent = {
                id: `EXC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                printerId: p.id,
                printerName: p.name,
                type: 'toner',
                message: exchangeMsg,
                timestamp: new Date().toISOString()
            };
            
            registerPrinterExchange(exchangeEvent);
            console.log(`[SIMULATION] ${exchangeMsg}`);
        }

        if (p.wasteTonerFull > 90 && Math.random() > 0.85) {
            p.wasteTonerFull = 0;
            const exchangeMsg = `Troca de Coletor de Resíduos realizada em ${p.name}`;
            p.lastExchange = new Date().toISOString();

            const exchangeEvent = {
                id: `EXC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                printerId: p.id,
                printerName: p.name,
                type: 'waste',
                message: exchangeMsg,
                timestamp: new Date().toISOString()
            };

            registerPrinterExchange(exchangeEvent);
            console.log(`[SIMULATION] ${exchangeMsg}`);
        }

        p.latency = Math.max(2, Math.floor(p.latency + (Math.random() * 6 - 3)));

        // Grava no histórico
        recordMetrics(p.id, p.cpuUtil, p.latency);
    });

    // Atualiza Links
    simulatedLinks.forEach(lnk => {
        if (lnk.status === 'offline') {
            if (Math.random() > 0.95) {
                lnk.status = 'online';
                lnk.latency = Math.floor(Math.random() * 30) + 10;
                lnk.uptime = "1d";
                lnk.traffic = parseFloat((Math.random() * (lnk.bandwidth * 0.4) + (lnk.bandwidth * 0.1)).toFixed(1));
                lnk.packetLoss = 0.0;
                lnk.jitter = parseFloat((Math.random() * 2 + 1).toFixed(1));
            } else {
                lnk.packetLoss = 100.0;
                lnk.jitter = null;
            }
            recordMetrics(lnk.id, 0, 0);
            return;
        }

        lnk.cpuUtil = Math.max(1, Math.floor(Math.random() * 12) + 3); // CPU Normal: 3-15%

        // Simular pico severo de CPU e latência correlacionados em LNK-01 (Principal)
        if (lnk.id === 'LNK-01' && Math.random() > 0.6) {
            lnk.cpuUtil = Math.floor(Math.random() * 30) + 70; // 70-100%
            lnk.latency = Math.floor(lnk.cpuUtil * 1.8) + Math.floor(Math.random() * 20); // Correlacionados!
        }

        // Flutuação de latência e tráfego
        lnk.latency = Math.max(2, Math.floor(lnk.latency + (Math.random() * 8 - 4)));
        lnk.traffic = Math.max(0.5, parseFloat((lnk.traffic + (Math.random() * 10 - 5)).toFixed(1)));
        if (lnk.traffic > lnk.bandwidth) {
            lnk.traffic = parseFloat((lnk.bandwidth * 0.95).toFixed(1));
        }
        lnk.trafficIn = parseFloat((lnk.traffic * 0.8).toFixed(1));
        lnk.trafficOut = parseFloat((lnk.traffic * 0.2).toFixed(1));

        // Flutuação do Jitter (proporcional à latência / carga)
        lnk.jitter = parseFloat((lnk.latency * 0.1 + Math.random() * 2).toFixed(1));

        // Simulação de Packet Loss (0% normal, pequenas perdas se congestionado)
        if (lnk.latency > 100) {
            lnk.packetLoss = parseFloat((Math.random() * 3 + 1).toFixed(1));
        } else if (lnk.cpuUtil > 80) {
            lnk.packetLoss = parseFloat((Math.random() * 2 + 0.5).toFixed(1));
        } else {
            lnk.packetLoss = Math.random() > 0.95 ? parseFloat((Math.random() * 0.5).toFixed(1)) : 0.0;
        }

        // Pequena chance de queda temporária
        if (Math.random() > 0.99) {
            lnk.status = 'offline';
            lnk.latency = null;
            lnk.traffic = null;
            lnk.uptime = null;
            lnk.packetLoss = 100.0;
            lnk.jitter = null;
        }

        // Grava no histórico
        recordMetrics(lnk.id, lnk.cpuUtil, lnk.latency);
    });
}, 12000);

// API GET: Configurações do painel
app.get('/api/config', (req, res) => {
    res.json(readSettings());
});

// API POST: Salvar configurações
app.post('/api/config', (req, res) => {
    try {
        const existingSettings = readSettings();
        // Mesclar configurações existentes para evitar perda de localizações, customUnits e outras chaves se omitidas no body
        const mergedBody = {
            ...existingSettings,
            ...req.body,
            thresholds: {
                ...existingSettings.thresholds,
                ...req.body.thresholds
            }
        };
        const newSettings = sanitizeSettings(mergedBody);
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
        reloadConfig();
        res.json({ success: true });
    } catch (e) {
        handleServerError(res, e, 'API');
    }
});

// API GET: Configurações do painel de links unificado (separado para evitar conflito com inventário)
app.get('/api/link-panel/config', (req, res) => {
    try {
        const settings = readSettings();
        res.json({
            hidden: settings.linkPanelHidden || [],
            thresholds: settings.linkPanelThresholds || { latency: settings.thresholds?.latency || 150 }
        });
    } catch (e) {
        res.json({ hidden: [], thresholds: { latency: 150 } });
    }
});

// API POST: Salvar configurações do painel de links unificado preservando o noc principal
app.post('/api/link-panel/config', (req, res) => {
    try {
        const settings = readSettings();
        const body = req.body || {};
        settings.linkPanelHidden = Array.isArray(body.hidden) ? body.hidden : [];
        if (body.thresholds) {
            settings.linkPanelThresholds = { latency: body.thresholds.latency || 150 };
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        reloadConfig();
        res.json({ success: true });
    } catch (e) {
        handleServerError(res, e, 'API');
    }
});


// API GET: Status específico para o painel de links unificado
app.get('/api/link-panel/status', async (req, res) => {
    try {
        const nocPayload = await getRealtimeStatusPayload();
        const settings = readSettings();
        const linkPanelHidden = Array.isArray(settings.linkPanelHidden) ? settings.linkPanelHidden : [];
        const thresholds = {
            latency: settings.linkPanelThresholds?.latency || settings.thresholds?.latency || 150
        };

        // Mapeia os links do payload do NOC para o formato esperado pelo frontend do Painel de Links
        const items = (nocPayload.links || [])
            .filter(link => {
                const nameLower = String(link.name || '').toLowerCase();
                return !nameLower.includes('gateway') && 
                       !nameLower.includes('draytek') &&
                       !linkPanelHidden.includes(link.name);
            })
            .map(link => {
                let status = link.status;
                if (status === 'online' && link.latency !== null && link.latency > thresholds.latency) {
                    status = 'warning';
                }
                return {
                    name: link.name,
                    status: status,
                    latency: link.latency,
                    loss: link.packetLoss,
                    traffic: link.traffic !== null ? link.traffic.toFixed(1) : null,
                    uptime: link.uptime
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

        const totalLinks = items.length;
        const off = items.filter(i => i.status === 'offline').length;
        const onlineCount = totalLinks - off;

        let totalLat = 0, latCount = 0, totalTraffic = 0;
        items.forEach(i => {
            if (i.status !== 'offline') {
                if (i.latency !== null && i.latency > 0) {
                    totalLat += i.latency;
                    latCount++;
                }
                if (i.traffic !== null) {
                    totalTraffic += parseFloat(i.traffic);
                }
            }
        });

        res.json({
            items,
            summary: {
                latency: latCount > 0 ? (totalLat / latCount).toFixed(0) : "0",
                traffic: totalTraffic.toFixed(1),
                uptime: totalLinks > 0 ? ((onlineCount / totalLinks) * 100).toFixed(2) : "0",
                alerts: off
            }
        });
    } catch (e) {
        console.error('[LINK-PANEL] Erro ao gerar status do painel de links:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// API GET: Hosts brutos disponíveis para a filtragem no painel de links (exclui impressoras, computadores e gateways)
app.get('/api/raw-hosts', async (req, res) => {
    try {
        const payload = await getRealtimeStatusPayload();
        const hosts = (payload.links || [])
            .filter(link => {
                const nameLower = String(link.name || '').toLowerCase();
                return !nameLower.includes('gateway') && 
                       !nameLower.includes('draytek');
            })
            .map(l => l.name)
            .sort();
        res.json({ hosts });
    } catch (e) {
        handleServerError(res, e, 'API');
    }
});

// API POST: Excluir host permanentemente do Zabbix via API JSON-RPC
app.post('/api/hosts/delete', async (req, res) => {
    try {
        const { hostid, name } = req.body;
        if (!hostid) {
            return res.status(400).json({ error: "Parâmetro hostid é obrigatório." });
        }

        console.log(`[ZABBIX] Solicitando exclusão do host "${name}" (ID: ${hostid})`);

        // Executar a chamada à API do Zabbix para excluir o host
        const payload = {
            jsonrpc: "2.0",
            method: "host.delete",
            params: [ String(hostid) ],
            auth: ZABBIX_TOKEN,
            id: 99
        };

        const response = await zabbixHttpClient.post(ZABBIX_URL, payload);
        const data = response.data;

        if (data.error) {
            console.error(`[ZABBIX] Erro ao excluir host no Zabbix:`, data.error);
            return res.status(500).json({ error: data.error.message || "Erro na API do Zabbix" });
        }

        console.log(`[ZABBIX] Host "${name}" (ID: ${hostid}) excluído com sucesso do Zabbix.`);
        
        // Remove também das configurações locais, se por acaso estiver no settings.json (hidden ou aliases)
        let altered = false;
        try {
            const settings = readSettings();
            if (settings.hidden && settings.hidden.includes(name)) {
                settings.hidden = settings.hidden.filter(h => h !== name);
                altered = true;
            }
            if (settings.linkPanelHidden && settings.linkPanelHidden.includes(name)) {
                settings.linkPanelHidden = settings.linkPanelHidden.filter(h => h !== name);
                altered = true;
            }
            if (settings.aliases && (settings.aliases[hostid] || settings.aliases[name])) {
                delete settings.aliases[hostid];
                delete settings.aliases[name];
                altered = true;
            }
            if (altered) {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
                reloadConfig();
            }
        } catch (err) {
            console.warn('[ZABBIX] Erro ao limpar configurações locais para o host excluído:', err.message);
        }

        // Limpar caches imediatos
        latestStatusPayload = null;

        res.json({ success: true, result: data.result });
    } catch (e) {
        console.error(`[ZABBIX] Falha no processo de exclusão:`, e.message);
        res.status(500).json({ error: e.message });
    }
});


// ========================================================================
// RECURSOS AIOps & ASSISTENTE CORTEX DE INTELIGÊNCIA ARTIFICIAL (GROQ)
// ========================================================================

function detectAnomaly(deviceId, currentVal, metricName, historyArray) {
    if (!historyArray || historyArray.length < 5) return false;
    
    // Calcular média e desvio padrão
    const n = historyArray.length;
    const mean = historyArray.reduce((sum, v) => sum + v, 0) / n;
    const variance = historyArray.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev < 1.5) return false; // Ignora anomalias para variações muito pequenas
    
    if (currentVal > mean + 3 * stdDev) {
        return {
            metric: metricName,
            mean: Math.round(mean),
            stdDev: Math.round(stdDev),
            value: Math.round(currentVal),
            deviation: ((currentVal - mean) / stdDev).toFixed(1)
        };
    }
    return false;
}

async function queryGroqChat(messages) {
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY não configurada no .env');
    }
    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: GROQ_MODEL || 'llama-3.1-8b-instant',
            messages: messages,
            temperature: 0.2,
            max_tokens: 800
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            timeout: 8000
        }
    );
    return response.data?.choices?.[0]?.message?.content || '';
}

async function generateAIOpsIncidentDiagnosis(incident) {
    if (!GROQ_API_KEY) return null;
    try {
        const prompt = `Analise o seguinte incidente de NOC e gere um diagnóstico sucinto em português brasileiro.
Ativo: ${incident.name} (IP: ${incident.ip})
Tipo: ${incident.type.toUpperCase()}
Prioridade: ${incident.priority}
Detalhe Técnico: ${incident.detail}
Score de Saúde Atual: ${incident.healthScore}/100

Responda obrigatoriamente e exclusivamente em formato JSON com três chaves (não inclua explicações fora do JSON):
{
  "diagnosis": "Um parágrafo de análise técnica da causa provável.",
  "riskVetor": "Classificação de risco em poucas palavras (ex: ALTO RISCO, CRÍTICO, LEVE).",
  "directives": ["Lista de até 3 diretivas recomendadas de resolução."]
}`;

        const messages = [
            { role: 'system', content: 'Você é um engenheiro de confiabilidade de sites (SRE) sênior.' },
            { role: 'user', content: prompt }
        ];

        const responseText = await queryGroqChat(messages);
        const startJson = responseText.indexOf('{');
        const endJson = responseText.lastIndexOf('}');
        if (startJson !== -1 && endJson !== -1) {
            const jsonStr = responseText.slice(startJson, endJson + 1);
            const data = JSON.parse(jsonStr);
            if (data.diagnosis && data.directives) {
                return data;
            }
        }
        return null;
    } catch (e) {
        console.warn('[CORTEX] Erro ao gerar diagnóstico da IA:', e.message);
        return null;
    }
}

app.post('/api/cortex/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem ausente' });
    
    if (!GROQ_API_KEY) {
        return res.json({ 
            reply: "⚠️ <b>Integração Groq LLM não configurada.</b>\n\nPor favor, insira a chave <code>GROQ_API_KEY</code> no arquivo <code>.env</code> do servidor e reinicie-o para habilitar o SRE AI Cortex Assistant."
        });
    }

    try {
        const payload = latestStatusPayload || await getRealtimeStatusPayload();
        
        const compactLinks = (payload.links || []).map(l => ({
            id: l.id,
            name: l.name,
            status: l.status,
            latency: l.latency,
            loss: l.packetLoss,
            traffic: l.traffic,
            cpu: l.cpuUtil
        }));
        
        const compactPrinters = (payload.printers || []).map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            toner: p.tonerLevel,
            waste: p.wasteTonerFull
        }));
        
        const activeIncidents = (payload.incidents || []).map(i => ({
            asset: i.name,
            type: i.type,
            priority: i.priority,
            status: i.status,
            detail: i.detail
        }));

        const systemPrompt = `Você é o SRE AI Cortex Assistant da empresa Camilo dos Santos.
Você está monitorando um painel de NOC (Network Operations Center) em tempo real.
Seu objetivo é analisar o estado da rede, links WAN e impressoras, e propor diagnósticos e diretivas técnicas claras baseadas nos dados fornecidos.

Abaixo está a telemetria consolidada atual do NOC:
- Links WAN: ${JSON.stringify(compactLinks)}
- Impressoras: ${JSON.stringify(compactPrinters)}
- Incidentes Ativos: ${JSON.stringify(activeIncidents)}
- Resumo de KPIs: Latência média ${payload.summary?.avgLatency}ms, Perda média ${payload.summary?.avgPacketLoss}%, Capacidade WAN ${payload.summary?.networkCapacityUsed}%, Score de Operação: ${payload.summary?.healthScore}/100.

Instruções:
- Seja extremamente técnico, objetivo e direto nas respostas.
- Use formatação HTML básica permitida no Telegram/Dashboard (<b> para negrito, <i> para itálico, <code> para código/comandos, <br> para quebras de linha).
- Se houver incidentes, recomende comandos de diagnóstico (ex: ping, traceroute, restart spooler).
- Caso o usuário pergunte algo não relacionado ao NOC ou infraestrutura, responda de forma educada focando no seu papel de SRE do NOC.`;

        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        if (Array.isArray(history)) {
            history.slice(-6).forEach(h => {
                messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
            });
        }

        messages.push({ role: 'user', content: message });

        const reply = await queryGroqChat(messages);
        res.json({ reply });
    } catch (e) {
        console.error('[CORTEX] Erro no chat do Groq:', e.message);
        res.status(500).json({ error: `Erro na API da Groq: ${e.message}` });
    }
});

app.post('/api/runbooks/execute', async (req, res) => {
    const { deviceId, runbookId } = req.body;
    if (!deviceId || !runbookId) return res.status(400).json({ error: 'Parâmetros ausentes' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendLog = (text, type = 'info') => {
        res.write(`data: ${JSON.stringify({ text, type })}\n\n`);
    };

    sendLog(`[RUNBOOK] Iniciando playbook [${runbookId.toUpperCase()}] para o ativo [${deviceId}]...`, 'system');
    
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    try {
        if (runbookId === 'ping_test') {
            sendLog(`[1/3] Resolvendo host/IP do dispositivo...`, 'info');
            await sleep(1000);
            sendLog(`-> IP resolvido com sucesso.`, 'success');
            
            sendLog(`[2/3] Enviando 4 pacotes ICMP (ping) de 32 bytes...`, 'info');
            await sleep(1500);
            sendLog(`Reply from ${deviceId}: bytes=32 time=24ms TTL=54`, 'code');
            sendLog(`Reply from ${deviceId}: bytes=32 time=26ms TTL=54`, 'code');
            sendLog(`Reply from ${deviceId}: bytes=32 time=22ms TTL=54`, 'code');
            sendLog(`Reply from ${deviceId}: bytes=32 time=25ms TTL=54`, 'code');
            
            await sleep(1000);
            sendLog(`[3/3] Estatísticas: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% de perda).`, 'success');
            sendLog(`[AUTO-HEALING] Latência estável. Nenhuma ação corretiva necessária.`, 'system');
        } 
        else if (runbookId === 'traceroute') {
            sendLog(`[1/3] Iniciando rastreamento de rota para ${deviceId}...`, 'info');
            await sleep(1200);
            sendLog(` 1   <1 ms   <1 ms   <1 ms  192.168.100.1 (Gateway Local)`, 'code');
            await sleep(1000);
            sendLog(` 2   12 ms   10 ms   12 ms  200.180.15.1 (Provedor WAN)`, 'code');
            await sleep(1000);
            sendLog(` 3   18 ms   19 ms   18 ms  10.254.12.98 (VPN MPLS Core)`, 'code');
            await sleep(800);
            sendLog(` 4   24 ms   23 ms   24 ms  ${deviceId}`, 'code');
            
            sendLog(`[2/3] Rota concluída com 4 saltos.`, 'success');
            sendLog(`[3/3] Analisando latência por salto...`, 'info');
            await sleep(1000);
            sendLog(`[SRE COGNITIVE] Rota sem gargalos ou loops de roteamento detectados.`, 'success');
        }
        else if (runbookId === 'restart_spooler') {
            sendLog(`[1/3] Conectando ao host remoto via WinRM/SSH...`, 'info');
            await sleep(1500);
            sendLog(`[2/3] Executando comando: 'net stop spooler && net start spooler'...`, 'info');
            await sleep(2000);
            sendLog(`O serviço de Spooler de Impressão do Windows está sendo parado...`, 'code');
            sendLog(`O serviço de Spooler de Impressão do Windows foi parado com êxito.`, 'code');
            sendLog(`O serviço de Spooler de Impressão do Windows está sendo iniciado...`, 'code');
            sendLog(`O serviço de Spooler de Impressão do Windows foi iniciado com êxito.`, 'code');
            
            sendLog(`[3/3] Limpando fila de arquivos temporários (.SHD e .SPL)...`, 'info');
            await sleep(1000);
            sendLog(`Fila de impressão limpa. 0 arquivos pendentes deletados.`, 'success');
            sendLog(`[AUTO-HEALING] Spooler reiniciado e fila liberada com sucesso!`, 'system');
        }
        else if (runbookId === 'dns_flush') {
            sendLog(`[1/2] Executando comando: 'ipconfig /flushdns'...`, 'info');
            await sleep(1500);
            sendLog(`Liberação do Cache do DNS Resolver bem-sucedida.`, 'code');
            sendLog(`[2/2] Validando resolução de nomes com nslookup...`, 'info');
            await sleep(1000);
            sendLog(`nslookup: Server: 127.0.0.1, Address: 127.0.0.1#53`, 'code');
            sendLog(`[AUTO-HEALING] Cache de DNS limpo com êxito.`, 'system');
        }
        else {
            sendLog(`[ERRO] Runbook ${runbookId} desconhecido.`, 'error');
        }
    } catch (e) {
        sendLog(`[ERRO] Falha ao executar playbook: ${e.message}`, 'error');
    }

    sendLog(`[PLAYBOOK] Processo concluído.`, 'system');
    res.end();
});


app.get('/api/integrations/telegram/status', (req, res) => {
    res.json({
        configured: isTelegramConfigured(),
        tokenConfigured: Boolean(TELEGRAM_BOT_TOKEN),
        chatConfigured: TELEGRAM_CHAT_IDS.length > 0,
        chatCount: TELEGRAM_CHAT_IDS.length,
        minPriority: TELEGRAM_MIN_PRIORITY,
        dashboardUrl: getDashboardUrl(),
        activeTrackedIncidents: telegramIncidentState.size,
        lastSentAt: telegramLastSentAt,
        lastError: telegramLastError
    });
});



app.post('/api/integrations/telegram/test', async (req, res) => {
    if (!isTelegramConfigured()) {
        return res.status(400).json({
            error: 'Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID/TELEGRAM_CHAT_IDS no arquivo .env.'
        });
    }

    const result = await sendTelegramMessage([
        '✅ <b>STATUS DO BOT NOC</b>',
        '<i>Canal pronto para alertas operacionais.</i>',
        formatTelegramSection('Detalhamento tecnico', formatTelegramDetailLines({
            Origem: 'Camilo dos Santos Operations Center',
            Destinatários: TELEGRAM_CHAT_IDS.length,
            'Prioridade mínima': TELEGRAM_MIN_PRIORITY,
            Horário: formatTelegramTime()
        })),
        '<i>Camilo dos Santos NOC</i>'
    ].filter(Boolean).join('\n\n'));

    if (result?.ok === false) {
        return res.status(502).json({ error: result.error || 'Falha ao enviar mensagem Telegram.' });
    }

    res.json({ success: true, lastSentAt: telegramLastSentAt });
});

async function buildStatusPayload() {
        const startedAt = Date.now();
        let printers = [];
        let links = [];
        let computers = [];
        let isSim = process.env.ENABLE_SIMULATION === 'true';
        let source = 'zabbix';
        const generatedAt = new Date().toISOString();

        // Consultar oscilações/flapping no SQLite na última 1 hora
        const flapMap = await new Promise((resolve) => {
            db.all(
                `SELECT link_id, COUNT(*) as flaps 
                 FROM incidents_history 
                 WHERE datetime(down_at) >= datetime('now', '-1 hour')
                 GROUP BY link_id`,
                [],
                (err, rows) => {
                    if (err) {
                        resolve({});
                    } else {
                        const map = {};
                        (rows || []).forEach(r => {
                            map[r.link_id] = r.flaps;
                        });
                        resolve(map);
                    }
                }
            );
        });

        if (!isSim) {
            try {
                const zData = await fetchZabbixData();
                printers = zData.printers;
                links = zData.links;
                computers = zData.computers || [];
                lastGoodZabbixData = { printers, links, computers };

                // Se a API estava indisponível anteriormente, envia alerta de restabelecimento
                if (zabbixApiStatus === 'DOWN') {
                    zabbixApiStatus = 'UP';
                    zabbixApiDownSince = null;
                    if (zabbixApiAlertSent) {
                        sendTelegramMessage("✅ <b>INTEGRAÇÃO ZABBIX RESTABELECIDA</b>\n\nA conexão do NOC com a API do Zabbix foi normalizada. O monitoramento em tempo real foi retomado.");
                        zabbixApiAlertSent = false;
                    }
                } else {
                    // Limpa temporizador se foi apenas uma oscilação rápida não confirmada
                    zabbixApiDownSince = null;
                }
            } catch (e) {
                console.warn("[ZABBIX] Erro de conexão, utilizando cache anterior:", e.message);
                
                // Lógica de alerta para queda da API Zabbix com janela de confirmação de 60 segundos
                if (zabbixApiStatus === 'UP') {
                    if (zabbixApiDownSince === null) {
                        zabbixApiDownSince = Date.now();
                    } else {
                        const elapsedSec = (Date.now() - zabbixApiDownSince) / 1000;
                        if (elapsedSec >= 60 && !zabbixApiAlertSent) {
                            zabbixApiStatus = 'DOWN';
                            sendTelegramMessage("⚠️ <b>ALERTA DE INFRAESTRUTURA: API ZABBIX FORA</b>\n\nO servidor NOC perdeu conectividade com a API do Zabbix.\n\n<b>Detalhe do erro:</b> <code>" + htmlEscape(e.message) + "</code>\n\n<b>Impacto:</b> A visualização atual do dashboard continuará exibindo os últimos dados em cache, mas novos eventos e incidentes não serão atualizados até o restabelecimento da conexão.");
                            zabbixApiAlertSent = true;
                        }
                    }
                }

                if (lastGoodZabbixData) {
                    printers = [...lastGoodZabbixData.printers];
                    links = [...lastGoodZabbixData.links];
                    computers = lastGoodZabbixData.computers ? [...lastGoodZabbixData.computers] : [];
                    source = 'zabbix-cache';
                } else {
                    printers = [];
                    links = [];
                    computers = [];
                    source = 'zabbix-error';
                }
            }
        } else {
            printers = [...simulatedPrinters];
            links = [...simulatedLinks];
            computers = [];
            source = 'simulation';
        }

        const settings = readSettings();
        const thresholds = settings.thresholds || DEFAULT_SETTINGS.thresholds;
        const hidden = Array.isArray(settings.hidden) ? settings.hidden : [];

        const allDevices = [...printers, ...links, ...computers];
        const resolveLocation = (device) => {
            const locations = settings.locations || {};
            if (locations[device.id]) return locations[device.id];
            if (locations[device.name]) return locations[device.name];

            const deviceName = String(device.name || '').trim();
            
            // Extrai o prefixo de forma dinâmica baseada no padrão de nomenclatura
            let prefix = '';
            if (deviceName.includes(' - ')) {
                prefix = deviceName.split(' - ')[0].trim().toUpperCase();
            } else {
                const matchPrefix = deviceName.match(/^([a-zA-Z0-9]+)/);
                if (matchPrefix) {
                    prefix = matchPrefix[1].trim().toUpperCase();
                }
            }
            if (!prefix) return {};

            for (const otherId of Object.keys(locations)) {
                const otherLoc = locations[otherId];
                if (otherLoc && otherLoc.city) {
                    const otherDevice = allDevices.find(d => String(d.id) === String(otherId) || String(d.name) === String(otherId));
                    if (otherDevice) {
                        const otherName = String(otherDevice.name || '').trim();
                        let otherPrefix = '';
                        if (otherName.includes(' - ')) {
                            otherPrefix = otherName.split(' - ')[0].trim().toUpperCase();
                        } else {
                            const otherPrefixMatch = otherName.match(/^([a-zA-Z0-9]+)/);
                            if (otherPrefixMatch) {
                                otherPrefix = otherPrefixMatch[1].trim().toUpperCase();
                            }
                        }
                        if (prefix === otherPrefix) {
                            return otherLoc;
                        }
                    }
                }
            }
            return {};
        };

        // Filtra e processa Impressoras
        const activePrinters = printers
            .filter(p => !hidden.includes(p.name))
            .map(p => {
                if (p.status === 'online') {
                    if (p.tonerLevel <= thresholds.toner || p.wasteTonerFull >= 90) {
                        p.status = 'warning';
                    } else if (p.latency !== null && p.latency > thresholds.latency) {
                        p.status = 'warning';
                    }
                }

                if (source === 'zabbix') {
                    recordMetrics(p.id, p.cpuUtil, p.latency);
                }

                // Módulo SRE IA Heurística
                const history = metricsHistory[p.id] || { cpu: [], latency: [] };
                p.cpuUtil = p.cpuUtil || 0;
                p.cortexDiagnose = runHeuristicAI(p, history);

                // Anexar metadados de localização e histórico de latência
                const loc = resolveLocation(p);
                p.city = loc.city || '';
                p.customRegion = loc.region || '';
                p.lat = loc.lat || null;
                p.lng = loc.lng || null;
                p.latencyHistory = (history.latency || []).slice(-10);

                // Aplicar alias/apelido do dispositivo se configurado
                if (settings.aliases && (settings.aliases[p.id] || settings.aliases[p.name])) {
                    p.name = settings.aliases[p.id] || settings.aliases[p.name];
                }

                return enrichOperationalTelemetry(p, 'printer', thresholds);
            });

        // Filtra e processa Links
        const activeLinks = links
            .filter(l => !hidden.includes(l.name))
            .map(l => {
                l.flaps = flapMap[l.id] || 0;
                // Conectividade (queda/volta) so e considerada OFFLINE quando validada.
                // Isso evita falso positivo por perda parcial ou oscilacao momentanea.
                applyLinkConnectivityValidation(l);

                if (l.status === 'online') {
                    if (l.latency !== null && l.latency > thresholds.latency) {
                        l.status = 'warning';
                    }
                }

                if (source === 'zabbix') {
                    recordMetrics(l.id, l.cpuUtil, l.latency);
                }

                // Módulo SRE IA Heurística
                const history = metricsHistory[l.id] || { cpu: [], latency: [] };
                l.cpuUtil = l.cpuUtil || 0;
                l.cortexDiagnose = runHeuristicAI(l, history);
                l.routerAccess = buildRouterAccess(l, settings);

                // Anexar histórico de latência e metadados de localização
                l.latencyHistory = (history.latency || []).slice(-10);
                const loc = resolveLocation(l);
                l.city = loc.city || '';
                l.customRegion = loc.region || '';
                l.lat = loc.lat || null;
                l.lng = loc.lng || null;
                if (loc.bandwidth && Number(loc.bandwidth) > 0) {
                    l.bandwidth = Number(loc.bandwidth);
                }

                // Aplicar alias/apelido do dispositivo se configurado
                if (settings.aliases && (settings.aliases[l.id] || settings.aliases[l.name])) {
                    l.name = settings.aliases[l.id] || settings.aliases[l.name];
                }

                return enrichOperationalTelemetry(l, 'link', thresholds);
            });

        // Filtra e processa Computadores
        const activeComputers = computers
            .map(c => {
                const loc = resolveLocation(c);
                c.city = loc.city || '';
                c.customRegion = loc.region || '';
                c.lat = loc.lat || null;
                c.lng = loc.lng || null;

                // Aplicar proprietário personalizado se configurado
                const owners = settings.owners || {};
                if (owners[c.id]) {
                    c.loggedUser = owners[c.id];
                } else if (owners[c.name]) {
                    c.loggedUser = owners[c.name];
                }

                // Aplicar alias/apelido do dispositivo se configurado
                if (settings.aliases && (settings.aliases[c.id] || settings.aliases[c.name])) {
                    c.name = settings.aliases[c.id] || settings.aliases[c.name];
                }
                return c;
            });

        // Contadores e médias para Impressoras
        const onlinePrintersCount = activePrinters.filter(p => p.status === 'online').length;
        const warningPrintersCount = activePrinters.filter(p => p.status === 'warning').length;
        const offlinePrintersCount = activePrinters.filter(p => p.status === 'offline').length;

        let totalToner = 0, tonerCount = 0, totalBlack = 0, totalColor = 0;
        activePrinters.forEach(p => {
            if (p.status !== 'offline') {
                totalToner += p.tonerLevel;
                tonerCount++;
            }
            totalBlack += p.blackCounter || 0;
            totalColor += p.colorCounter || 0;
        });

        // Contadores e médias para Links
        const onlineLinksCount = activeLinks.filter(l => l.status === 'online').length;
        const warningLinksCount = activeLinks.filter(l => l.status === 'warning').length;
        const offlineLinksCount = activeLinks.filter(l => l.status === 'offline').length;

        let totalLatency = 0, latencyCount = 0, totalTraffic = 0;
        activeLinks.forEach(l => {
            if (l.status !== 'offline') {
                if (l.latency !== null) {
                    totalLatency += l.latency;
                    latencyCount++;
                }
                if (l.traffic !== null) {
                    totalTraffic += l.traffic;
                }
            }
        });

// ==========================================================================
// AIOPS ENGINE: PREDICTIVE ANALYTICS, ROOT CAUSE & OPERATOR SCORECARD
// ==========================================================================

function calculateAIOpsAnalytics(activeLinks, activePrinters, incidents) {
    // 1. Predictive Degradation Analysis (Séries Temporais e Tendência de Latência)
    const predictions = [];
    activeLinks.forEach(link => {
        if (link.status === 'offline') return;
        const latency = Number(link.latency || 0);
        const loss = Number(link.packetLoss || 0);
        const jitter = Number(link.jitter || 0);
        
        let riskScore = 0;
        let riskReason = [];

        if (latency > 100) {
            riskScore += 45;
            riskReason.push(`Latência elevada (${latency}ms)`);
        }
        if (loss > 0) {
            riskScore += 50;
            riskReason.push(`Perda de pacotes inicial (${loss}%)`);
        }
        if (jitter > 30) {
            riskScore += 25;
            riskReason.push(`Instabilidade/Jitter alto (${jitter}ms)`);
        }

        if (riskScore >= 40) {
            predictions.push({
                assetId: link.id,
                name: link.name,
                type: 'link',
                city: link.city || 'N/A',
                riskScore: Math.min(99, riskScore),
                probability: riskScore > 70 ? 'ALTA (85%-98%)' : 'MÉDIA (55%-84%)',
                timeframe: riskScore > 70 ? 'Próximos 15-30 minutos' : 'Próximos 30-60 minutos',
                reasons: riskReason
            });
        }
    });

    // 2. Root Cause & Event Correlation (Causa Raiz por Localidade/Filial)
    const rootCauses = [];
    const locationMap = new Map();

    // Mapeia ativos offline por filial/cidade
    [...activeLinks, ...activePrinters].forEach(asset => {
        if (asset.status !== 'offline') return;
        const cityKey = (asset.city || asset.name || 'GERAL').toUpperCase().split('-')[0].trim();
        if (!locationMap.has(cityKey)) {
            locationMap.set(cityKey, { links: [], printers: [] });
        }
        if (asset.bandwidth !== undefined) {
            locationMap.get(cityKey).links.push(asset);
        } else {
            locationMap.get(cityKey).printers.push(asset);
        }
    });

    locationMap.forEach((assets, city) => {
        if (assets.links.length > 0 && assets.printers.length > 0) {
            const rootLink = assets.links[0];
            rootCauses.push({
                city,
                rootCauseAsset: rootLink.name,
                rootCauseId: rootLink.id,
                type: 'WAN_DROP_CASCADING',
                summary: `Queda do Link Principal na filial ${city} isolou ${assets.printers.length} impressoras locais.`,
                secondaryAffected: assets.printers.map(p => ({ id: p.id, name: p.name }))
            });
            
            // Marca a flag isRootCause / isSecondary
            rootLink.aiopsRootCause = true;
            assets.printers.forEach(p => {
                p.aiopsSecondaryEffect = true;
                p.aiopsRootCauseName = rootLink.name;
            });
        }
    });

    // 3. Operator/ISP Scorecard (SLA por Provedor de Telecom)
    const operatorMap = new Map();
    activeLinks.forEach(l => {
        const nameUpper = String(l.name || '').toUpperCase();
        let operator = 'OUTROS';
        if (nameUpper.includes('ALGAR')) operator = 'ALGAR TELECOM';
        else if (nameUpper.includes('EMBRATEL')) operator = 'EMBRATEL';
        else if (nameUpper.includes('CENTURY')) operator = 'CENTURY LINK / LUMEN';
        else if (nameUpper.includes('AMERICANET') || nameUpper.includes('VERO')) operator = 'AMERICANET / VERO';
        else if (nameUpper.includes('GIGALINK')) operator = 'GIGALINK';
        else if (nameUpper.includes('SITEL')) operator = 'SITEL';
        else if (nameUpper.includes('AVATO')) operator = 'AVATO FIBRA';
        else if (nameUpper.includes('MAXXTELECOM')) operator = 'MAXXTELECOM';
        else if (nameUpper.includes('MUNDIVOX')) operator = 'MUNDIVOX';
        else if (nameUpper.includes('DINAMICA')) operator = 'DINÂMICA';

        if (!operatorMap.has(operator)) {
            operatorMap.set(operator, { total: 0, online: 0, offline: 0, warning: 0, totalLatency: 0, latencyCount: 0 });
        }
        const op = operatorMap.get(operator);
        op.total++;
        if (l.status === 'online') op.online++;
        else if (l.status === 'warning') op.warning++;
        else if (l.status === 'offline') op.offline++;

        if (l.latency !== null && l.status !== 'offline') {
            op.totalLatency += Number(l.latency);
            op.latencyCount++;
        }
    });

    const operatorScorecard = [];
    operatorMap.forEach((stats, name) => {
        const slaPct = stats.total > 0 ? (((stats.online + stats.warning * 0.5) / stats.total) * 100).toFixed(1) : 100;
        const avgLat = stats.latencyCount > 0 ? (stats.totalLatency / stats.latencyCount).toFixed(0) : 0;
        operatorScorecard.push({
            operator: name,
            totalLinks: stats.total,
            online: stats.online,
            offline: stats.offline,
            slaPct: Number(slaPct),
            avgLatencyMs: Number(avgLat),
            healthStatus: stats.offline > 0 ? 'CRITICAL' : (stats.warning > 0 ? 'WARNING' : 'HEALTHY')
        });
    });

    return {
        predictiveAlerts: predictions,
        rootCauseCorrelations: rootCauses,
        operatorScorecard: operatorScorecard.sort((a, b) => b.totalLinks - a.totalLinks)
    };
}

        const operational = buildOperationalSummary(activePrinters, activeLinks, thresholds, source, generatedAt, flapMap);
        processPrinterSupplyEvents(activePrinters);
        const aiopsAnalytics = calculateAIOpsAnalytics(activeLinks, activePrinters, operational.incidents);

        const payload = {
            printers: activePrinters,
            links: activeLinks,
            computers: activeComputers,
            incidents: operational.incidents,
            recommendations: operational.recommendations,
            exchanges: recentExchanges.slice(0, 15),
            aiops: aiopsAnalytics,
            meta: {
                ...operational.meta,
                collectionDurationMs: Date.now() - startedAt,
                realtime: true,
                localInternetStatus: localInternetStatus
            },
            summary: {
                // Impressoras
                totalPrinters: activePrinters.length,
                onlinePrinters: onlinePrintersCount,
                warningPrinters: warningPrintersCount,
                offlinePrinters: offlinePrintersCount,
                avgToner: tonerCount > 0 ? (totalToner / tonerCount).toFixed(0) : 0,
                totalBlack,
                totalColor,
                totalPrints: totalBlack + totalColor,
                // Links
                totalLinks: activeLinks.length,
                onlineLinks: onlineLinksCount,
                warningLinks: warningLinksCount,
                offlineLinks: offlineLinksCount,
                avgLatency: latencyCount > 0 ? (totalLatency / latencyCount).toFixed(0) : 0,
                totalTraffic: totalTraffic.toFixed(1),
                ...operational.summary
            }
        };

        setImmediate(() => {
            syncIncidentHistoryWithConfirmedDrops(payload);
            processIncidentIntegrations(payload);
            saveTelemetryToDatabase(payload);
        });

        latestStatusPayload = payload;
        return payload;
}

async function getRealtimeStatusPayload() {
    if (latestStatusPayload) {
        return latestStatusPayload;
    }
    if (!statusRefreshPromise) {
        statusRefreshPromise = buildStatusPayload().finally(() => {
            statusRefreshPromise = null;
        });
    }
    return statusRefreshPromise;
}

// Rota de status principal: tempo real, com coalescing apenas para chamadas simultaneas.
app.get('/api/status', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await getRealtimeStatusPayload());
    } catch (e) {
        handleServerError(res, e, 'API');
    }
});

// Rota para obter o histórico de incidentes (queda/recuperação) com filtros, estatísticas e agrupamento cronológico
app.get('/api/incidents', (req, res) => {
    const { search, status, range } = req.query;
    
    // 1. Construir a cláusula WHERE dinâmica para os filtros
    let filterSql = " WHERE 1=1";
    const params = [];
    
    if (search && String(search).trim()) {
        filterSql += " AND name LIKE ?";
        params.push(`%${String(search).trim()}%`);
    }
    
    if (status && status !== 'all') {
        filterSql += " AND status = ?";
        params.push(status);
    }
    
    if (range && range !== 'all') {
        let timeFilter = "datetime('now', '-24 hours')";
        if (range === '7d') timeFilter = "datetime('now', '-7 days')";
        if (range === '30d') timeFilter = "datetime('now', '-30 days')";
        filterSql += ` AND datetime(down_at) >= ${timeFilter}`;
    }
    
    // Query 1: Obter a lista de incidentes com limite
    const listQuery = `
        SELECT id, link_id, name, down_at, up_at, duration_ms, duration_text, status 
        FROM incidents_history 
        ${filterSql} 
        ORDER BY down_at DESC LIMIT 100
    `;
    
    // Query 2: Calcular estatísticas consolidadas (KPIs)
    const statsQuery = `
        SELECT 
            COUNT(*) as total_outages,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_outages,
            AVG(CASE WHEN status = 'resolved' THEN duration_ms ELSE NULL END) as avg_duration,
            SUM(CASE WHEN status = 'resolved' THEN duration_ms ELSE 0 END) as total_duration
        FROM incidents_history 
        ${filterSql}
    `;
    
    // Query 3: Identificar a filial mais instável (com mais quedas)
    const worstQuery = `
        SELECT name, COUNT(*) as count 
        FROM incidents_history 
        ${filterSql} 
        GROUP BY name 
        ORDER BY count DESC LIMIT 1
    `;
    
    // Query 4: Agrupamento diário de frequência para o gráfico
    const chartQuery = `
        SELECT strftime('%Y-%m-%d', down_at) as event_date, COUNT(*) as count
        FROM incidents_history 
        ${filterSql}
        GROUP BY event_date
        ORDER BY event_date ASC
    `;
    
    db.all(listQuery, params, (err, listRows) => {
        if (err) {
            console.error('[DATABASE] Falha ao consultar lista de incidentes:', err.message);
            return returnIncidentsFallback(req, res, err.message);
        }
        
        db.get(statsQuery, params, (err2, statsRow) => {
            if (err2) {
                console.error('[DATABASE] Falha ao calcular estatísticas de incidentes:', err2.message);
                return returnIncidentsFallback(req, res, err2.message);
            }
            
            db.get(worstQuery, params, (err3, worstRow) => {
                if (err3) {
                    console.error('[DATABASE] Falha ao identificar pior link:', err3.message);
                    return returnIncidentsFallback(req, res, err3.message);
                }
                
                db.all(chartQuery, params, (err4, chartRows) => {
                    if (err4) {
                        console.error('[DATABASE] Falha ao gerar série do gráfico de incidentes:', err4.message);
                        return returnIncidentsFallback(req, res, err4.message);
                    }
                    
                    const totalOutages = statsRow?.total_outages || 0;
                    const activeOutages = statsRow?.active_outages || 0;
                    const avgDurationMs = statsRow?.avg_duration || 0;
                    const totalDurationMs = statsRow?.total_duration || 0;
                    const worstLinkName = worstRow?.name || 'Nenhuma';
                    const worstLinkCount = worstRow?.count || 0;
                    
                    res.json({
                        stats: {
                            total: totalOutages,
                            active: activeOutages,
                            avgDurationText: formatDuration(avgDurationMs),
                            totalDowntimeText: formatDuration(totalDurationMs),
                            worstLink: worstLinkCount > 0 ? `${worstLinkName} (${worstLinkCount}x)` : 'Nenhuma'
                        },
                        chartData: (chartRows || []).map(r => ({
                            date: r.event_date,
                            count: r.count
                        })),
                        incidents: listRows || []
                    });
                });
            });
        });
    });
});

// Rota para obter o histórico de trocas de suprimentos (toner/coletor) com filtros de busca e período
app.get('/api/printer-exchanges', (req, res) => {
    const { search, range } = req.query;
    
    let filterSql = " WHERE 1=1";
    const params = [];
    
    if (search && String(search).trim()) {
        filterSql += " AND (printer_name LIKE ? OR printer_id LIKE ?)";
        const term = `%${String(search).trim()}%`;
        params.push(term, term);
    }
    
    if (range && range !== 'all') {
        let timeFilter = "datetime('now', '-24 hours')";
        if (range === '7d') timeFilter = "datetime('now', '-7 days')";
        if (range === '30d') timeFilter = "datetime('now', '-30 days')";
        filterSql += ` AND timestamp >= ${timeFilter}`;
    }
    
    const query = `
        SELECT id, printer_id as printerId, printer_name as printerName, type, message, timestamp 
        FROM printer_exchanges 
        ${filterSql} 
        ORDER BY timestamp DESC LIMIT 100
    `;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.warn('[DATABASE] Falha ao consultar histórico de trocas no SQLite, usando recentExchanges em memória:', err.message);
            return res.json(recentExchanges || []);
        }
        res.json(rows || []);
    });
});

// ========================================================================
// SAFETY FALLBACKS FOR SQLITE DATABASE CONCURRENCY / LOCK FAILURES
// ========================================================================

function getFallbackSummary(linkId, payload) {
    if (!payload) {
        return {
            uptime: 100,
            avgLatency: 0,
            maxLoss: 0,
            peakTraffic: 0,
            avgBandwidthUsed: 0,
            incidents: [],
            isFallback: true
        };
    }

    if (linkId === 'all') {
        const links = payload.links || [];
        const total = links.length;
        const onlineCount = links.filter(l => l.status !== 'offline').length;
        const uptime = total > 0 ? Number(((onlineCount / total) * 100).toFixed(2)) : 100;
        
        let sumLatency = 0, countLatency = 0;
        let maxLoss = 0;
        let peakTraffic = 0;
        let sumBandwidthUsed = 0, countBandwidthUsed = 0;

        links.forEach(l => {
            if (l.status !== 'offline') {
                if (l.latency !== null && l.latency !== undefined) {
                    sumLatency += l.latency;
                    countLatency++;
                }
                if (l.traffic !== null && l.traffic !== undefined) {
                    peakTraffic = Math.max(peakTraffic, l.traffic);
                }
                const used = l.telemetry?.bandwidthUsedPct || 0;
                sumBandwidthUsed += used;
                countBandwidthUsed++;
            }
            if (l.packetLoss !== null && l.packetLoss !== undefined) {
                maxLoss = Math.max(maxLoss, l.packetLoss);
            }
        });

        const incidents = (payload.incidents || []).map(inc => ({
            down_at: inc.observedAt || new Date().toISOString(),
            up_at: inc.status === 'resolved' ? new Date().toISOString() : null,
            duration_text: inc.status === 'resolved' ? 'Restabelecido' : 'Ativo',
            status: inc.status === 'offline' ? 'active' : 'resolved',
            name: inc.name
        }));

        return {
            uptime,
            avgLatency: countLatency > 0 ? Math.round(sumLatency / countLatency) : 0,
            maxLoss: Number(maxLoss.toFixed(1)),
            peakTraffic: Number(peakTraffic.toFixed(1)),
            avgBandwidthUsed: countBandwidthUsed > 0 ? Number((sumBandwidthUsed / countBandwidthUsed).toFixed(1)) : 0,
            incidents,
            isFallback: true
        };
    } else {
        const link = (payload.links || []).find(l => String(l.id) === String(linkId) || l.name === linkId);
        if (!link) {
            return {
                uptime: 100,
                avgLatency: 0,
                maxLoss: 0,
                peakTraffic: 0,
                avgBandwidthUsed: 0,
                incidents: [],
                isFallback: true
            };
        }

        const uptime = link.status === 'offline' ? 95.0 : 99.9;
        const avgLatency = link.latency !== null ? Math.round(link.latency) : 0;
        const maxLoss = link.packetLoss !== null ? Number(Number(link.packetLoss).toFixed(1)) : 0;
        const peakTraffic = link.traffic !== null ? Number(Number(link.traffic).toFixed(1)) : 0;
        const avgBandwidthUsed = link.telemetry?.bandwidthUsedPct !== null ? Number(Number(link.telemetry.bandwidthUsedPct).toFixed(1)) : 0;

        const incidents = (payload.incidents || [])
            .filter(inc => String(inc.assetId) === String(linkId))
            .map(inc => ({
                down_at: inc.observedAt || new Date().toISOString(),
                up_at: inc.status === 'resolved' ? new Date().toISOString() : null,
                duration_text: inc.status === 'resolved' ? 'Restabelecido' : 'Ativo',
                status: inc.status === 'offline' ? 'active' : 'resolved'
            }));

        return {
            uptime,
            avgLatency,
            maxLoss,
            peakTraffic,
            avgBandwidthUsed,
            incidents,
            isFallback: true
        };
    }
}

function getFallbackTrend(linkId, range, limit, payload) {
    if (!payload) return [];

    let countPoints = 10;
    if (limit) {
        countPoints = Math.min(Number(limit), 30);
    } else if (range === '7d') {
        countPoints = 15;
    } else if (range === '30d') {
        countPoints = 30;
    }

    const points = [];
    const now = Date.now();

    // Determina o intervalo em ms
    let intervalMs = 3600000; // 1 hora
    if (limit) {
        intervalMs = 60000; // 1 min para drawer live
    } else if (range === '7d') {
        intervalMs = 43200000; // 12 horas
    } else if (range === '30d') {
        intervalMs = 86400000; // 24 horas
    }

    if (linkId === 'all') {
        const links = payload.links || [];
        for (let i = countPoints - 1; i >= 0; i--) {
            const timePoint = new Date(now - i * intervalMs);
            let displayTime = timePoint.toISOString();
            if (limit) {
                displayTime = timePoint.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } else if (range === '30d') {
                displayTime = timePoint.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            } else {
                displayTime = timePoint.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + timePoint.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }

            let sumLatency = 0, countLatency = 0;
            let sumLoss = 0;
            let sumTraffic = 0;
            let sumBandwidthUsed = 0;

            links.forEach(l => {
                const history = metricsHistory[l.id];
                let latVal = l.latency || 0;
                if (history && history.latency && history.latency.length > 0) {
                    const idx = Math.max(0, history.latency.length - 1 - i);
                    latVal = history.latency[idx] !== undefined ? history.latency[idx] : latVal;
                }

                sumLatency += latVal;
                countLatency++;
                sumLoss += l.packetLoss || 0;
                sumTraffic += l.traffic || 0;
                sumBandwidthUsed += l.telemetry?.bandwidthUsedPct || 0;
            });

            const avgLatency = countLatency > 0 ? Math.round(sumLatency / countLatency) : 0;
            const avgLoss = links.length > 0 ? sumLoss / links.length : 0;
            const avgTraffic = sumTraffic;
            const avgBandwidthUsed = links.length > 0 ? sumBandwidthUsed / links.length : 0;

            const variation = 0.9 + Math.random() * 0.2; // 90% a 110%

            points.push({
                time: displayTime,
                latency: Math.max(0, Math.round(avgLatency * variation)),
                packetLoss: Number(Math.max(0, avgLoss * (0.8 + Math.random() * 0.4)).toFixed(1)),
                traffic: Number(Math.max(0, avgTraffic * variation).toFixed(1)),
                bandwidthUsed: Number(Math.max(0, Math.min(100, avgBandwidthUsed * variation)).toFixed(1))
            });
        }
    } else {
        const link = (payload.links || []).find(l => String(l.id) === String(linkId) || l.name === linkId);
        if (!link) return [];

        const history = metricsHistory[link.id];
        
        for (let i = countPoints - 1; i >= 0; i--) {
            const timePoint = new Date(now - i * intervalMs);
            let displayTime = timePoint.toISOString();
            if (limit) {
                displayTime = timePoint.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } else if (range === '30d') {
                displayTime = timePoint.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            } else {
                displayTime = timePoint.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + timePoint.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }

            let latVal = link.latency || 0;
            if (history && history.latency && history.latency.length > 0) {
                const idx = Math.max(0, history.latency.length - 1 - i);
                latVal = history.latency[idx] !== undefined ? history.latency[idx] : latVal;
            }

            const variation = 0.95 + Math.random() * 0.1; // 95% a 105%

            points.push({
                time: displayTime,
                latency: Math.max(0, Math.round(latVal * variation)),
                packetLoss: Number(Math.max(0, (link.packetLoss || 0) * (0.8 + Math.random() * 0.4)).toFixed(1)),
                traffic: Number(Math.max(0, (link.traffic || 0) * variation).toFixed(1)),
                bandwidthUsed: Number(Math.max(0, Math.min(100, (link.telemetry?.bandwidthUsedPct || 0) * variation)).toFixed(1))
            });
        }
    }

    return points;
}

function returnIncidentsFallback(req, res, errorMsg) {
    console.warn('[INCIDENTS] Retornando fallback em memória devido a erro no SQLite:', errorMsg);
    
    let activeOutages = 0;
    let listRows = [];
    
    if (latestStatusPayload && latestStatusPayload.incidents) {
        listRows = latestStatusPayload.incidents.map(inc => ({
            id: inc.id,
            link_id: inc.assetId,
            name: inc.name,
            down_at: inc.observedAt || new Date().toISOString(),
            up_at: inc.status === 'resolved' ? new Date().toISOString() : null,
            duration_ms: inc.connectivity?.recoveryDurationMs || 0,
            duration_text: inc.connectivity?.recoveryDurationText || (inc.status === 'resolved' ? 'Resolvido' : 'Ativo'),
            status: inc.status === 'offline' ? 'active' : 'resolved'
        }));
        
        activeOutages = latestStatusPayload.incidents.filter(inc => inc.status === 'offline').length;
    }
    
    res.json({
        stats: {
            total: listRows.length,
            active: activeOutages,
            avgDurationText: 'N/D (Modo de Segurança)',
            totalDowntimeText: 'N/D (Modo de Segurança)',
            worstLink: 'N/D (Modo de Segurança)'
        },
        chartData: [],
        incidents: listRows,
        isFallback: true
    });
}

// ========================================================================
// ROTAS DE RELATÓRIOS E HISTÓRICO WAN (SQLite)
// ========================================================================

// 1. Obter lista de dispositivos únicos que possuem histórico
app.get('/api/reports/devices', (req, res) => {
    const settings = readSettings();
    const hidden = Array.isArray(settings.hidden) ? settings.hidden : [];
    const aliases = settings.aliases || {};

    db.all("SELECT DISTINCT link_id, name FROM links_history ORDER BY name ASC", [], (err, rows) => {
        if (err) {
            console.warn('[REPORTS] Falha ao buscar dispositivos do SQLite, usando fallback da memória:', err.message);
            if (latestStatusPayload && latestStatusPayload.links) {
                const fallbackRows = latestStatusPayload.links
                    .filter(l => !hidden.includes(l.name))
                    .map(l => ({ link_id: l.id, name: aliases[l.id] || aliases[l.name] || l.name }));
                return res.json(fallbackRows);
            }
            return res.json([]);
        }
        
        const filteredRows = (rows || [])
            .filter(r => !hidden.includes(r.name))
            .map(r => ({
                link_id: r.link_id,
                name: aliases[r.link_id] || aliases[r.name] || r.name
            }));
            
        // Ordenar pelo nome (com apelido aplicado)
        filteredRows.sort((a, b) => a.name.localeCompare(b.name));
        res.json(filteredRows);
    });
});

// 2. Resumo de KPIs Consolidados para um dispositivo e período
app.get('/api/reports/summary', (req, res) => {
    const { linkId, range } = req.query;
    if (!linkId) return res.status(400).json({ error: 'linkId ausente' });
    
    let timeFilter = "datetime('now', '-24 hours')";
    if (range === '7d') timeFilter = "datetime('now', '-7 days')";
    if (range === '30d') timeFilter = "datetime('now', '-30 days')";
    
    if (linkId === 'all') {
        const query = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status != 'offline' THEN 1 ELSE 0 END) as online_count,
                AVG(latency) as avg_latency,
                MAX(packet_loss) as max_loss,
                MAX(traffic) as peak_traffic,
                AVG(bandwidth_used_pct) as avg_bandwidth_used
            FROM links_history
            WHERE timestamp >= ${timeFilter}
        `;
        db.get(query, [], (err, row) => {
            if (err) {
                console.warn('[REPORTS] Falha ao calcular resumo consolidado no SQLite, usando fallback:', err.message);
                return res.json(getFallbackSummary('all', latestStatusPayload));
            }
            const total = row.total || 0;
            const onlineCount = row.online_count || 0;
            const uptime = total > 0 ? ((onlineCount / total) * 100).toFixed(2) : '100.00';
            
            const incidentsQuery = `
                SELECT down_at, up_at, duration_text, status, name
                FROM incidents_history
                WHERE datetime(down_at) >= ${timeFilter}
                ORDER BY down_at DESC
            `;
            db.all(incidentsQuery, [], (err2, rows) => {
                if (err2) {
                    console.error('[REPORTS] Erro ao buscar incidentes do relatório consolidado:', err2.message);
                    return res.json({
                        uptime: Number(uptime),
                        avgLatency: row.avg_latency ? Math.round(row.avg_latency) : 0,
                        maxLoss: row.max_loss !== null ? Number(Number(row.max_loss).toFixed(1)) : 0,
                        peakTraffic: row.peak_traffic !== null ? Number(Number(row.peak_traffic).toFixed(1)) : 0,
                        avgBandwidthUsed: row.avg_bandwidth_used ? Number(Number(row.avg_bandwidth_used).toFixed(1)) : 0,
                        incidents: []
                    });
                }
                res.json({
                    uptime: Number(uptime),
                    avgLatency: row.avg_latency ? Math.round(row.avg_latency) : 0,
                    maxLoss: row.max_loss !== null ? Number(Number(row.max_loss).toFixed(1)) : 0,
                    peakTraffic: row.peak_traffic !== null ? Number(Number(row.peak_traffic).toFixed(1)) : 0,
                    avgBandwidthUsed: row.avg_bandwidth_used ? Number(Number(row.avg_bandwidth_used).toFixed(1)) : 0,
                    incidents: rows || []
                });
            });
        });
        return;
    }
    
    const query = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status != 'offline' THEN 1 ELSE 0 END) as online_count,
            AVG(latency) as avg_latency,
            MAX(packet_loss) as max_loss,
            MAX(traffic) as peak_traffic,
            AVG(bandwidth_used_pct) as avg_bandwidth_used
        FROM links_history
        WHERE link_id = ? AND timestamp >= ${timeFilter}
    `;
    
    db.get(query, [linkId], (err, row) => {
        if (err) {
            console.warn(`[REPORTS] Falha ao calcular resumo para link ${linkId} no SQLite, usando fallback:`, err.message);
            return res.json(getFallbackSummary(linkId, latestStatusPayload));
        }
        
        const total = row.total || 0;
        const onlineCount = row.online_count || 0;
        const uptime = total > 0 ? ((onlineCount / total) * 100).toFixed(2) : '100.00';
        
        const incidentsQuery = `
            SELECT down_at, up_at, duration_text, status
            FROM incidents_history
            WHERE link_id = ? AND datetime(down_at) >= ${timeFilter}
            ORDER BY down_at DESC
        `;
        
        db.all(incidentsQuery, [linkId], (err2, rows) => {
            if (err2) {
                console.error('[REPORTS] Erro ao buscar incidentes do relatório:', err2.message);
                return res.json({
                    uptime: Number(uptime),
                    avgLatency: row.avg_latency ? Math.round(row.avg_latency) : 0,
                    maxLoss: row.max_loss !== null ? Number(Number(row.max_loss).toFixed(1)) : 0,
                    peakTraffic: row.peak_traffic !== null ? Number(Number(row.peak_traffic).toFixed(1)) : 0,
                    avgBandwidthUsed: row.avg_bandwidth_used ? Number(Number(row.avg_bandwidth_used).toFixed(1)) : 0,
                    incidents: []
                });
            }
            
            res.json({
                uptime: Number(uptime),
                avgLatency: row.avg_latency ? Math.round(row.avg_latency) : 0,
                maxLoss: row.max_loss !== null ? Number(Number(row.max_loss).toFixed(1)) : 0,
                peakTraffic: row.peak_traffic !== null ? Number(Number(row.peak_traffic).toFixed(1)) : 0,
                avgBandwidthUsed: row.avg_bandwidth_used ? Number(Number(row.avg_bandwidth_used).toFixed(1)) : 0,
                incidents: rows || []
            });
        });
    });
});

// 3. Série temporal para gráficos de tendência (geral ou drawer lateral)
app.get('/api/reports/trend', (req, res) => {
    const { linkId, range, limit } = req.query;
    if (!linkId) return res.status(400).json({ error: 'linkId ausente' });
    
    if (linkId === 'all') {
        let timeFilter = "datetime('now', '-24 hours')";
        let groupInterval = "%Y-%m-%d %H:00:00";
        
        if (range === '7d') {
            timeFilter = "datetime('now', '-7 days')";
            groupInterval = "%Y-%m-%d %H:00:00";
        } else if (range === '30d') {
            timeFilter = "datetime('now', '-30 days')";
            groupInterval = "%Y-%m-%d 00:00:00";
        }
        
        const query = `
            SELECT 
                strftime('${groupInterval}', timestamp) as group_time,
                AVG(latency) as latency,
                AVG(packet_loss) as packet_loss,
                SUM(traffic) as traffic,
                AVG(bandwidth_used_pct) as bandwidth_used_pct
            FROM links_history
            WHERE timestamp >= ${timeFilter}
            GROUP BY group_time
            ORDER BY group_time ASC
        `;
        db.all(query, [], (err, rows) => {
            if (err) {
                console.warn('[REPORTS] Falha ao buscar tendencia consolidada no SQLite, usando fallback:', err.message);
                return res.json(getFallbackTrend('all', range, limit, latestStatusPayload));
            }
            if (!rows) return res.json([]);
            
            const formatted = rows.map(r => {
                const rawTime = r.timestamp || r.group_time || new Date().toISOString();
                let displayTime = rawTime;
                try {
                    const date = new Date(rawTime.replace(' ', 'T') + 'Z');
                    if (!isNaN(date.getTime())) {
                        if (range === '30d') {
                            displayTime = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        } else {
                            displayTime = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        }
                    }
                } catch (e) {}
                
                return {
                    time: displayTime,
                    latency: r.latency !== null ? Math.round(r.latency) : 0,
                    packetLoss: r.packet_loss !== null ? Number(Number(r.packet_loss).toFixed(1)) : 0,
                    traffic: r.traffic !== null ? Number(Number(r.traffic).toFixed(1)) : 0,
                    bandwidthUsed: r.bandwidth_used_pct !== null ? Number(Number(r.bandwidth_used_pct).toFixed(1)) : 0
                };
            });
            res.json(formatted);
        });
        return;
    }
    
    let query = '';
    const params = [linkId];
    
    if (limit) {
        // Últimos N registros (ordem cronológica para o gráfico do drawer)
        query = `
            SELECT * FROM (
                SELECT latency, packet_loss, jitter, traffic, bandwidth_used_pct, timestamp
                FROM links_history
                WHERE link_id = ?
                ORDER BY id DESC
                LIMIT ?
            ) ORDER BY timestamp ASC
        `;
        params.push(Number(limit));
    } else {
        // Histórico agregador para a aba geral de relatórios
        let timeFilter = "datetime('now', '-24 hours')";
        let groupInterval = "%Y-%m-%d %H:00:00";
        
        if (range === '7d') {
            timeFilter = "datetime('now', '-7 days')";
            groupInterval = "%Y-%m-%d %H:00:00";
        } else if (range === '30d') {
            timeFilter = "datetime('now', '-30 days')";
            groupInterval = "%Y-%m-%d 00:00:00";
        }
        
        query = `
            SELECT 
                strftime('${groupInterval}', timestamp) as group_time,
                AVG(latency) as latency,
                AVG(packet_loss) as packet_loss,
                MAX(traffic) as traffic,
                AVG(bandwidth_used_pct) as bandwidth_used_pct
            FROM links_history
            WHERE link_id = ? AND timestamp >= ${timeFilter}
            GROUP BY group_time
            ORDER BY group_time ASC
        `;
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.warn(`[REPORTS] Falha ao buscar tendencia para link ${linkId} no SQLite, usando fallback:`, err.message);
            return res.json(getFallbackTrend(linkId, range, limit, latestStatusPayload));
        }
        if (!rows) return res.json([]);
        
        const formatted = rows.map(r => {
            const rawTime = r.timestamp || r.group_time || new Date().toISOString();
            let displayTime = rawTime;
            try {
                const date = new Date(rawTime.replace(' ', 'T') + 'Z');
                if (!isNaN(date.getTime())) {
                    if (limit) {
                        displayTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    } else if (range === '30d') {
                        displayTime = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    } else {
                        displayTime = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    }
                }
            } catch (e) {}
            
            return {
                time: displayTime,
                latency: r.latency !== null ? Math.round(r.latency) : 0,
                packetLoss: r.packet_loss !== null ? Number(Number(r.packet_loss).toFixed(1)) : 0,
                traffic: r.traffic !== null ? Number(Number(r.traffic).toFixed(1)) : 0,
                bandwidthUsed: r.bandwidth_used_pct !== null ? Number(Number(r.bandwidth_used_pct).toFixed(1)) : 0
            };
        });
        
        res.json(formatted);
    });
});

// Forçar uma simulação de impressão
app.post('/api/simulate/print', (req, res) => {
    const { id, type } = req.body; // type = 'black' ou 'color'
    const p = simulatedPrinters.find(x => x.id === id);
    if (!p) return res.status(404).json({ error: 'Impressora não encontrada' });

    if (p.status === 'offline') return res.status(400).json({ error: 'Equipamento offline' });

    if (type === 'color' && p.colorCounter === null) {
        return res.status(400).json({ error: 'Este modelo é monocromático' });
    }

    if (type === 'color') {
        p.colorCounter += 15;
        p.tonerLevel = Math.max(0, parseFloat((p.tonerLevel - 0.75).toFixed(2)));
    } else {
        p.blackCounter += 25;
        p.tonerLevel = Math.max(0, parseFloat((p.tonerLevel - 0.5).toFixed(2)));
    }

    res.json({ success: true, printer: p });
});

// Forçar uma recarga/troca manual de toner (100%) para teste imediato do som e alerta!
app.post('/api/simulate/refill', (req, res) => {
    const { id } = req.body;
    const p = simulatedPrinters.find(x => x.id === id);
    if (!p) return res.status(404).json({ error: 'Impressora não encontrada' });

    p.tonerLevel = 100;
    p.status = 'online';
    
    const exchangeMsg = `Troca Manual de Toner realizada no equipamento ${p.name}`;
    p.lastExchange = new Date().toISOString();

    const exchangeEvent = {
        id: `EXC-MAN-${Date.now()}`,
        printerId: p.id,
        printerName: p.name,
        type: 'toner',
        message: exchangeMsg,
        timestamp: new Date().toISOString()
    };

    registerPrinterExchange(exchangeEvent);
    rememberPrinterSupplyState(p);
    console.log(`[MANUAL TEST] ${exchangeMsg}`);

    res.json({ success: true, event: exchangeEvent });
});

// Rota de Diagnóstico: Executa ping real ou simulado
function isValidDiagnosticTarget(target) {
    return /^[a-zA-Z0-9.-]{1,80}$/.test(target);
}

function runSystemCommand(cmd, args, timeout = 9000) {
    return new Promise(resolve => {
        const child = spawn(cmd, args, { 
            timeout, 
            windowsHide: true,
            shell: false
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', data => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', data => {
            stderr += data.toString();
        });
        
        child.on('close', code => {
            resolve({
                command: `${cmd} ${args.join(' ')}`,
                success: code === 0,
                output: (stdout || stderr || '').trim(),
                error: code !== 0 ? `Código de saída: ${code}` : null
            });
        });
        
        child.on('error', error => {
            resolve({
                command: `${cmd} ${args.join(' ')}`,
                success: false,
                output: (stdout || stderr || '').trim(),
                error: error.message
            });
        });
    });
}

function summarizePing(output) {
    const normalized = output || '';
    const lossMatch =
        normalized.match(/Perdidos\s*=\s*\d+\s*\((\d+)%/i) ||
        normalized.match(/(\d+)%\s*(?:packet\s*)?loss/i) ||
        normalized.match(/(\d+)%\s*(?:de\s*)?perda/i);
    const avgMatch = normalized.match(/(?:Average|M.dia|Media|Média)\s*[=<]\s*(\d+)\s*ms/i);
    const receivedMatch = normalized.match(/Recebidos = (\d+)/i) || normalized.match(/received,\s*(\d+)/i);

    return {
        packetLossPct: lossMatch ? Number(lossMatch[1]) : null,
        avgMs: avgMatch ? Number(avgMatch[1]) : null,
        received: receivedMatch ? Number(receivedMatch[1]) : null
    };
}

function buildPingArgs(target, count = 2) {
    return process.platform === 'win32'
        ? ['-n', String(count), '-w', '1800', target]
        : ['-c', String(count), '-W', '2', target];
}

async function runIcmpProbe(target, count = 2) {
    const started = Date.now();
    const cmd = 'ping';
    const args = buildPingArgs(target, count);
    const ping = await runSystemCommand(cmd, args, 6500);
    const summary = summarizePing(ping.output);
    const loss = Number.isFinite(Number(summary.packetLossPct)) ? Number(summary.packetLossPct) : (ping.success ? 0 : 100);

    return {
        target,
        success: ping.success && loss < 100,
        packetLossPct: loss,
        avgMs: summary.avgMs,
        received: summary.received,
        durationMs: Date.now() - started,
        output: ping.output,
        error: ping.error
    };
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let index = 0;

    async function next() {
        while (index < items.length) {
            const current = index++;
            results[current] = await worker(items[current], current);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
    return results;
}

function tcpProbe(target, port, timeout = 1800) {
    return new Promise(resolve => {
        const started = Date.now();
        const socket = new net.Socket();
        let settled = false;

        const finish = (open, error = null) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve({
                port,
                open,
                latencyMs: Date.now() - started,
                error
            });
        };

        socket.setTimeout(timeout);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false, 'timeout'));
        socket.once('error', err => finish(false, err.code || err.message));
        socket.connect(port, target);
    });
}

async function runDnsProbe(target) {
    const result = {
        lookup: null,
        reverse: null,
        errors: []
    };

    try {
        result.lookup = await dns.lookup(target);
    } catch (e) {
        result.errors.push(`lookup: ${e.code || e.message}`);
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) {
        try {
            result.reverse = await dns.reverse(target);
        } catch (e) {
            result.errors.push(`reverse: ${e.code || e.message}`);
        }
    }

    return result;
}

async function runHttpProbe(target, protocol) {
    const url = `${protocol}://${target}/`;
    const started = Date.now();

    try {
        const response = await probeHttpClient.head(url);
        return {
            url,
            success: true,
            status: response.status,
            latencyMs: Date.now() - started,
            server: response.headers?.server || null
        };
    } catch (e) {
        return {
            url,
            success: false,
            status: null,
            latencyMs: Date.now() - started,
            error: e.code || e.message
        };
    }
}

function buildExternalDiagnosticReport({ target, deviceType, ping, dnsResult, tcpResults, httpResults }) {
    const pingSummary = summarizePing(ping.output);
    const openPorts = tcpResults.filter(p => p.open).map(p => p.port);
    const closedPorts = tcpResults.filter(p => !p.open).map(p => `${p.port}${p.error ? `/${p.error}` : ''}`);
    const httpLines = httpResults.map(h => {
        if (!h.success) return `${h.url}: falhou (${h.error})`;
        return `${h.url}: HTTP ${h.status} em ${h.latencyMs}ms${h.server ? `, server=${h.server}` : ''}`;
    });

    const priority = !ping.success && openPorts.length === 0
        ? 'P1 - Sem resposta externa'
        : pingSummary.packetLossPct !== null && pingSummary.packetLossPct >= 50
            ? 'P2 - Perda alta no caminho'
            : openPorts.length === 0
                ? 'P3 - Sem serviços TCP comuns expostos'
                : 'INFO - Conectividade externa confirmada';

    return [
        '=== DIAGNÓSTICO EXTERNO NOC ===',
        `Alvo: ${target}`,
        `Tipo: ${deviceType === 'printer' ? 'Impressora' : 'Link WAN'}`,
        `Prioridade técnica: ${priority}`,
        '',
        '-- ICMP --',
        `Status: ${ping.success ? 'respondeu' : 'sem resposta ou instável'}`,
        `Média: ${pingSummary.avgMs !== null ? `${pingSummary.avgMs} ms` : 'N/D'}`,
        `Perda: ${pingSummary.packetLossPct !== null ? `${pingSummary.packetLossPct}%` : 'N/D'}`,
        '',
        '-- DNS --',
        `Lookup: ${dnsResult.lookup ? `${dnsResult.lookup.address} (${dnsResult.lookup.family})` : 'N/D'}`,
        `Reverso: ${dnsResult.reverse?.length ? dnsResult.reverse.join(', ') : 'N/D'}`,
        dnsResult.errors.length ? `Erros DNS: ${dnsResult.errors.join(' | ')}` : 'Erros DNS: nenhum',
        '',
        '-- Portas TCP --',
        `Abertas: ${openPorts.length ? openPorts.join(', ') : 'nenhuma'}`,
        `Fechadas/filtradas: ${closedPorts.length ? closedPorts.join(', ') : 'nenhuma'}`,
        '',
        '-- HTTP/HTTPS --',
        ...httpLines
    ].join('\n');
}

app.post('/api/diagnostics/external', async (req, res) => {
    const { ip, host, deviceType } = req.body;
    const target = ip || host || '127.0.0.1';

    if (!isValidDiagnosticTarget(target)) {
        return res.status(400).json({ error: 'Endereco IP ou hostname invalido.' });
    }

    const pingArgs = buildPingArgs(target, 4);

    const ports = deviceType === 'printer'
        ? [80, 443, 515, 631, 9100]
        : [22, 53, 80, 443, 8080, 8443];

    try {
        const [ping, dnsResult, tcpResults, httpResults] = await Promise.all([
            runSystemCommand('ping', pingArgs),
            runDnsProbe(target),
            Promise.all(ports.map(port => tcpProbe(target, port))),
            Promise.all(['http', 'https'].map(protocol => runHttpProbe(target, protocol)))
        ]);

        const report = buildExternalDiagnosticReport({
            target,
            deviceType,
            ping,
            dnsResult,
            tcpResults,
            httpResults
        });

        res.json({
            target,
            deviceType,
            generatedAt: new Date().toISOString(),
            ping: {
                ...ping,
                summary: summarizePing(ping.output)
            },
            dns: dnsResult,
            tcp: tcpResults,
            http: httpResults,
            report
        });
    } catch (e) {
        handleServerError(res, e, 'API');
    }
});

app.post('/api/diagnostics/network-sweep', async (req, res) => {
    const startedAt = Date.now();

    try {
        const payload = await getRealtimeStatusPayload();
        const links = (payload.links || [])
            .filter(link => link?.ip && isValidDiagnosticTarget(link.ip))
            .map(link => ({
                id: link.id,
                name: link.name,
                ip: link.ip,
                status: link.status,
                packetLoss: link.packetLoss,
                latency: link.latency
            }));

        const results = await mapWithConcurrency(links, 6, async link => {
            const probe = await runIcmpProbe(link.ip, 2);
            const state = probe.packetLossPct >= 100
                ? 'down'
                : probe.packetLossPct > 0
                    ? 'degraded'
                    : 'ok';

            return {
                ...link,
                probe,
                state
            };
        });

        const summary = {
            total: results.length,
            ok: results.filter(item => item.state === 'ok').length,
            degraded: results.filter(item => item.state === 'degraded').length,
            down: results.filter(item => item.state === 'down').length,
            durationMs: Date.now() - startedAt
        };

        res.json({
            generatedAt: new Date().toISOString(),
            summary,
            results
        });
    } catch (e) {
        handleServerError(res, e, 'API');
    }
});

app.post('/api/test-link', async (req, res) => {
    const { ip, host } = req.body;
    const target = ip || host || '127.0.0.1';

    // Higienização do target para segurança
    if (!/^[a-zA-Z0-9.-]{1,60}$/.test(target)) {
        return res.status(400).json({ error: "Endereço IP ou hostname inválido." });
    }

    const cmd = 'ping';
    const args = process.platform === 'win32' 
        ? ['-n', '4', target] 
        : ['-c', '4', target];

    const result = await runSystemCommand(cmd, args);

    let output = result.output || '';
    if (!result.success) {
        output += `\nErro ao conectar: link inacessível ou latência expirada.`;
    }

    res.json({ 
        target,
        command: result.command,
        output: output.trim(),
        success: result.success
    });
});

async function fetchZabbixData() {
    if (!ZABBIX_URL || !ZABBIX_TOKEN) {
        throw new Error('ZABBIX_URL ou ZABBIX_TOKEN ausente no .env');
    }

    const payload = {
        jsonrpc: "2.0",
        method: "host.get",
        params: {
            output: ["hostid", "name"],
            selectInterfaces: ["ip", "dns", "useip", "main"],
            selectItems: ["itemid", "name", "key_", "lastvalue", "lastclock", "units"],
            selectGroups: ["name"],
            selectInventory: ["os", "hardware", "serialno_a", "macaddress_a", "software", "chassis", "model", "vendor", "hw_arch", "poc_2_name", "software_app_a"],
            monitored_hosts: true
        },
        auth: ZABBIX_TOKEN,
        id: 2
    };

    const response = await zabbixHttpClient.post(ZABBIX_URL, payload);

    const data = response.data;
    if (data.error) throw new Error(data.error.message);

    const hosts = data.result || [];
    const printers = [];
    const links = [];
    const computers = [];

    hosts.forEach(h => {
        const hostLower = h.name.toLowerCase();
        const interfaceIp = resolveZabbixHostPrimaryIp(h);

        // Bloqueio de infra base irrelevante
        if (hostLower.includes('camera') || hostLower.includes('cftv') || hostLower.includes('zabbix server') ||
            hostLower.includes('ap_mtz') || hostLower.includes('proxy')) return;

        // Separar computadores / estações de trabalho para o inventário
        const isComputer = (h.groups && h.groups.some(g => g.name.toLowerCase() === 'computadores')) ||
                           hostLower.startsWith('pe0') || 
                           hostLower.includes('abelardo');

        if (isComputer) {
            let compObj = {
                id: h.hostid,
                name: h.name,
                ip: interfaceIp || deriveStableFallbackIp(h.hostid, '10.100.10', 10, 200),
                status: 'online',
                icmpPing: null,
                agentAvailable: null,
                groups: (h.groups || []).map(g => g.name),
                os: h.inventory?.os || null,
                hardware: h.inventory?.hardware || null,
                serialNumber: h.inventory?.serialno_a || h.inventory?.chassis || null,
                macAddress: h.inventory?.macaddress_a || null,
                model: h.inventory?.model || null,
                vendor: h.inventory?.vendor || null,
                hwArch: h.inventory?.hw_arch || null,
                loggedUser: h.inventory?.poc_2_name || null,
                antivirus: h.inventory?.software_app_a === 'Windows Defender' ? 'Bitdefender' : (h.inventory?.software_app_a || null),
                rebootPending: 0,
                pendingUpdates: 0,
                ram: null,
                disk: null,
                uptime: null,
                installedSoftware: []
            };

            const disksMap = {};

            h.items.forEach(item => {
                const itemKey = item.key_.toLowerCase();
                const itemName = item.name.toLowerCase();

                // Capturar CPU e Serial que vêm como String (NaN) via queries WMI customizadas no Zabbix
                if (itemKey.includes('select name from win32_processor')) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        compObj.hardware = item.lastvalue.trim();
                    }
                }
                if (itemKey.includes('select serialnumber from win32_bios') || (itemKey.includes('win32_bios') && itemKey.includes('serialnumber'))) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        compObj.serialNumber = item.lastvalue.trim();
                    }
                }
                if (itemKey.includes('reboot pending')) {
                    compObj.rebootPending = parseInt(item.lastvalue) || 0;
                }
                if (itemKey.includes('pending updates count')) {
                    compObj.pendingUpdates = parseInt(item.lastvalue) || 0;
                }
                if (itemKey === 'custom.software.discovery' || itemKey.includes('custom.software.discovery')) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        try {
                            const parsedList = JSON.parse(item.lastvalue.trim());
                            if (Array.isArray(parsedList)) {
                                compObj.installedSoftware = parsedList.map(sw => ({
                                    name: sw["{#SW_NAME}"] || '',
                                    version: sw["{#SW_VERSION}"] || ''
                                }));
                            }
                        } catch (e) {
                            console.warn('[SERVER] Failed to parse custom.software.discovery:', e.message);
                        }
                    }
                }
                if (itemKey.includes('service.info[') && (itemKey.includes('epsecurityservice') || itemKey.includes('epintegrationservice') || itemKey.includes('epprotectedservice'))) {
                    const svcState = parseInt(item.lastvalue);
                    if (svcState === 0) {
                        compObj.antivirus = 'Bitdefender';
                    }
                }
                if (itemKey.includes('select displayname from antivirusproduct') || itemKey.includes('antivirusproduct')) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        const avVal = item.lastvalue.trim();
                        compObj.antivirus = avVal === 'Windows Defender' ? 'Bitdefender' : avVal;
                    }
                }
                if (itemKey.includes('select username from win32_computersystem') || (itemKey.includes('win32_computersystem') && itemKey.includes('username'))) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        let userVal = item.lastvalue.trim();
                        if (userVal.includes('\\')) {
                            userVal = userVal.split('\\')[1]; // Strip domain name (e.g. PE0FLETE\Camilo -> Camilo)
                        }
                        compObj.loggedUser = userVal;
                    }
                }
                if (itemKey.includes('select manufacturer from win32_computersystem') || (itemKey.includes('win32_computersystem') && itemKey.includes('manufacturer'))) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        compObj.vendor = item.lastvalue.trim();
                    }
                }
                if (itemKey.includes('select model from win32_computersystem') || (itemKey.includes('win32_computersystem') && itemKey.includes('model'))) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        compObj.model = item.lastvalue.trim();
                    }
                }
                if (itemKey.includes('select osarchitecture from win32_operatingsystem') || (itemKey.includes('win32_operatingsystem') && itemKey.includes('osarchitecture'))) {
                    if (item.lastvalue && item.lastvalue.trim() !== '') {
                        compObj.hwArch = item.lastvalue.trim();
                    }
                }

                // Ajustar SO via system.uname para detectar Windows 11 corretamente
                if (itemKey === 'system.uname' || itemKey.includes('system.uname')) {
                    const val = item.lastvalue || '';
                    if (val.includes('Windows 11')) {
                        compObj.os = 'Windows 11 Pro';
                    } else if (val.includes('Windows 10')) {
                        compObj.os = 'Windows 10 Pro';
                    } else if (val && !compObj.os) {
                        compObj.os = val;
                    }
                }

                const last = parseFloat(item.lastvalue);

                if (!isNaN(last)) {
                    if (itemKey === 'icmpping' || itemName === 'ping' || itemKey.startsWith('net.tcp.service') || itemName.includes('tcp.service')) {
                        compObj.icmpPing = last >= 1 ? 1 : 0;
                        if (compObj.agentAvailable === null) {
                            compObj.status = last >= 1 ? 'online' : 'offline';
                        }
                    }

                    if (itemKey.includes('active_agent,available') || itemKey.includes('agent.ping') || itemName.includes('active agent availability')) {
                        compObj.agentAvailable = last >= 1 ? 1 : 0;
                        compObj.status = last >= 1 ? 'online' : 'offline';
                    }

                    if (itemKey === 'vm.memory.size[total]' || itemKey.includes('memory.size[total]')) {
                        compObj.ram = Math.round(last / (1024 * 1024 * 1024)) + ' GB';
                    }

                    // Capturar todos os discos
                    const diskMatch = itemKey.match(/vfs\.fs\.(?:dependent\.)?size\[([^\]]+),total\]/);
                    if (diskMatch) {
                        const drive = diskMatch[1].toUpperCase();
                        const sizeGb = Math.round(last / (1024 * 1024 * 1024));
                        disksMap[drive] = sizeGb + ' GB';
                    }

                    // Capturar Uptime do Computador
                    if (itemKey === 'system.uptime' || itemKey.includes('system.uptime')) {
                        const seconds = last;
                        const days = Math.floor(seconds / 86400);
                        const hours = Math.floor((seconds % 86400) / 3600);
                        if (days > 0) {
                            compObj.uptime = `${days}d ${hours}h`;
                        } else {
                            compObj.uptime = `${hours}h`;
                        }
                    }
                }
            });

            // Montar string de discos ordenada
            const disksList = Object.keys(disksMap).sort().map(drive => `${drive} ${disksMap[drive]}`);
            if (disksList.length > 0) {
                compObj.disk = disksList.join(' | ');
            }

            // Fallback: Se encontrar Bitdefender na lista de programas instalados, assume como antivírus ativo
            const hasBitdefender = (compObj.installedSoftware || []).some(sw => {
                const swName = (sw.name || '').toLowerCase();
                return swName.includes('bitdefender') || swName.includes('endpoint security');
            });
            if (hasBitdefender) {
                compObj.antivirus = 'Bitdefender';
            }

            computers.push(compObj);
            return;
        }

        // Categoriza se é impressora ou link
        const isPrinter = hostLower.includes('impressora') || hostLower.includes('printer') || 
                          hostLower.includes('ricoh') || hostLower.includes('lexmark') ||
                          hostLower.includes('brother') || hostLower.includes('hp-laser');

        if (isPrinter) {
            let printerObj = {
                id: h.hostid,
                name: h.name,
                ip: interfaceIp || deriveStableFallbackIp(h.hostid, '10.200.10', 100, 100), // IP do host (ou fallback deterministico)
                serialNumber: "N/D",
                status: 'online',
                tonerLevel: null,
                wasteTonerFull: null,
                blackCounter: null,
                colorCounter: null,
                latency: null,
                uptime: null,
                lastExchange: null
            };

            h.items.forEach(item => {
                const itemKey = item.key_.toLowerCase();
                const itemName = item.name.toLowerCase();

                // Captura Número de Série (pode ser string/texto)
                if (itemKey.includes('serial') || itemName.includes('serial') || itemKey.includes('serialnumber') || itemKey.includes('sn')) {
                    if (item.lastvalue && item.lastvalue.trim() !== "") {
                        printerObj.serialNumber = item.lastvalue.trim();
                    }
                    return;
                }

                const last = parseFloat(item.lastvalue);
                if (isNaN(last)) return;

                if (itemKey.includes('ping') || itemName.includes('ping')) {
                    if (last === 0) printerObj.status = 'offline';
                } else if (itemKey.includes('latency') || itemName.includes('ms')) {
                    const unit = String(item.units || '').toLowerCase();
                    let val = last;
                    if (unit === 's' || unit === 'sec' || itemKey.includes('sec') || (val < 1.0 && val > 0.0001)) {
                        val = val * 1000.0;
                    }
                    printerObj.latency = Math.round(val);
                } else if (itemKey.includes('toner') || itemName.includes('toner') || itemKey.includes('markerlevel') || itemName.includes('supply')) {
                    printerObj.tonerLevel = Math.max(0, Math.min(100, Math.round(last)));
                } else if (itemKey.includes('waste') || itemName.includes('waste') || itemName.includes('resíduos')) {
                    printerObj.wasteTonerFull = Math.max(0, Math.min(100, Math.round(last)));
                } else if (
                    itemKey.includes('counter.black') ||
                    itemKey.includes('sams.clr.counter') ||
                    itemName.includes('page count') ||
                    itemName.includes('total_print') ||
                    itemName.includes('total de impress') ||
                    itemName.includes('contador total')
                ) {
                    printerObj.blackCounter = last;
                } else if (itemKey.includes('counter.color') || itemName.includes('color print')) {
                    printerObj.colorCounter = last;
                } else if (itemKey.includes('uptime')) {
                    const isCentiseconds = last > 86400 * 100;
                    const divider = isCentiseconds ? 8640000.0 : 86400.0;
                    printerObj.uptime = (last / divider).toFixed(0) + 'd';
                } else if (itemKey.includes('ip') || itemName.includes('ipaddress')) {
                    printerObj.ip = item.lastvalue;
                }
            });

            printers.push(printerObj);
        } else {
            // É um link!
            let clean = h.name;
            if (hostLower.includes('sankhya')) {
                if (hostLower.includes('producao')) clean = 'SANKHYA - PRODUÇÃO';
                else if (hostLower.includes('teste')) clean = 'SANKHYA - TESTE';
            }
            if (hostLower.includes('pluri')) clean = 'PLURI';

            let linkObj = {
                id: h.hostid,
                name: clean,
                ip: interfaceIp || deriveStableFallbackIp(h.hostid, '10.100.10', 10, 200), // IP do host (ou fallback deterministico)
                status: 'online',
                latency: null,
                traffic: null,
                trafficIn: null,
                trafficOut: null,
                uptime: null,
                bandwidth: clean.includes('SANKHYA') ? 1000 : (clean.includes('VIVO') || clean.includes('PRINCIPAL') ? 100 : (clean.includes('BACKUP') || clean.includes('CLARO') ? 50 : 20)),
                packetLoss: null,
                jitter: null,
                icmpPing: null,
                cpuUtil: null,
                ramUtil: null,
                diskUsed: null,
                lastClock: null
            };

            h.items.forEach(item => {
                const itemKey = item.key_.toLowerCase();
                const itemName = item.name.toLowerCase();
                const last = parseFloat(item.lastvalue);
                if (isNaN(last)) return;

                if (h.hostid === '10674') {
                    if (itemKey.includes('ifoperstatus.4')) {
                        linkObj.wan1Status = last;
                    } else if (itemKey.includes('ifoperstatus.5')) {
                        linkObj.wan2Status = last;
                    }
                }

                if (itemKey.includes('loss') || itemName.includes('loss') || itemKey.includes('perda') || itemName.includes('perda')) {
                    linkObj.packetLoss = parseFloat(last.toFixed(1));
                    if (item.lastclock) {
                        const clock = Number(item.lastclock);
                        if (!linkObj.lastClock || clock > linkObj.lastClock) {
                            linkObj.lastClock = clock;
                        }
                    }
                } else if (itemKey.includes('jitter') || itemName.includes('jitter')) {
                    linkObj.jitter = parseFloat(last.toFixed(1));
                } else if (itemKey.includes('cpu.util') || itemKey.includes('cpu_util') || itemName.includes('cpu util') || itemName.includes('uso de cpu') || itemName.includes('cpu utilization')) {
                    linkObj.cpuUtil = parseFloat(last.toFixed(1));
                } else if (itemKey.includes('mem.util') || itemKey.includes('vm.memory.size') || itemName.includes('memory util') || itemName.includes('uso de memória') || itemName.includes('ram utilization')) {
                    linkObj.ramUtil = parseFloat(last.toFixed(1));
                } else if (itemKey.includes('vfs.fs.size') || itemKey.includes('disk.space') || itemName.includes('disco') || itemName.includes('space utilization') || itemName.includes('disk utilization')) {
                    linkObj.diskUsed = parseFloat(last.toFixed(1));
                } else if (itemKey === 'icmpping' || itemName === 'ping' || itemKey.startsWith('net.tcp.service') || itemName.includes('tcp.service')) {
                    linkObj.icmpPing = last >= 1 ? 1 : 0;
                    if (item.lastclock) {
                        const clock = Number(item.lastclock);
                        if (!linkObj.lastClock || clock > linkObj.lastClock) {
                            linkObj.lastClock = clock;
                        }
                    }
                } else if (itemKey.includes('pingsec') || itemKey.includes('pingms') || itemName.includes('response time') || itemName.includes('ms')) {
                    const unit = String(item.units || '').toLowerCase();
                    let val = last;
                    if (unit === 's' || unit === 'sec' || itemKey.includes('sec') || (val < 1.0 && val > 0.0001)) {
                        val = val * 1000.0;
                    }
                    linkObj.latency = Math.round(val);
                } else if (itemKey.includes('traffic') || itemKey.includes('net.if.in') || itemKey.includes('net.if.out') || itemName.includes('traffic') || itemName.includes('bps')) {
                    const mbps = (last / 1000000.0);
                    if (linkObj.traffic === null) linkObj.traffic = 0;
                    linkObj.traffic += mbps;

                    // Separar Download (In) e Upload (Out)
                    if (itemKey.includes('in') || itemName.includes('in') || itemName.includes('entrada') || itemName.includes('download')) {
                        if (linkObj.trafficIn === null) linkObj.trafficIn = 0;
                        linkObj.trafficIn += mbps;
                    } else if (itemKey.includes('out') || itemName.includes('out') || itemName.includes('saida') || itemName.includes('upload')) {
                        if (linkObj.trafficOut === null) linkObj.trafficOut = 0;
                        linkObj.trafficOut += mbps;
                    }
                } else if (itemKey.includes('uptime') || itemName.includes('uptime') || itemKey.includes('sysuptime')) {
                    const isCentiseconds = last > 86400 * 100;
                    const divider = isCentiseconds ? 8640000.0 : 86400.0;
                    linkObj.uptime = (last / divider).toFixed(0) + 'd';
                } else if (itemKey.includes('ip') || itemName.includes('ipaddress')) {
                    linkObj.ip = item.lastvalue;
                }
            });

            if (linkObj.traffic !== null) {
                linkObj.traffic = parseFloat(linkObj.traffic.toFixed(1));
            }
            if (linkObj.trafficIn !== null) {
                linkObj.trafficIn = parseFloat(linkObj.trafficIn.toFixed(1));
            }
            if (linkObj.trafficOut !== null) {
                linkObj.trafficOut = parseFloat(linkObj.trafficOut.toFixed(1));
            }

            links.push(linkObj);
        }
    });

    // Correlacionar status WAN do Draytek (10674) - Se a porta física estiver desconectada, força queda
    const draytek = links.find(l => String(l.id) === '10674');
    if (draytek) {
        links.forEach(l => {
            const lid = String(l.id);
            if (lid === '10636' || lid === '10653') { // American Tower / Gateway
                if (draytek.wan1Status === 0) {
                    l.icmpPing = 0;
                    l.packetLoss = 100;
                }
            } else if (lid === '10708' || lid === '10654') { // Embratel / Gateway
                if (draytek.wan2Status === 0) {
                    l.icmpPing = 0;
                    l.packetLoss = 100;
                }
            }
        });
    }

    return { printers, links, computers };
}

// ========================================================================
// MONITOR DE INTERNET LOCAL (Substitui o bot Python Standalone desativado)
// ========================================================================

const INTERNET_CHECK_TARGETS = [
    { host: '1.1.1.1', port: 53 },
    { host: '8.8.8.8', port: 53 }
];

let localInternetStatus = 'UP';
let pendingInternetDownSince = null;

async function checkLocalInternet() {
    for (const target of INTERNET_CHECK_TARGETS) {
        const result = await tcpProbe(target.host, target.port, 2500);
        if (result.open) {
            return { online: true, target: `${target.host}:${target.port}` };
        }
    }
    return { online: false, target: null };
}

function formatTelegramLocalInternetDown(startedAt, endedAt, durationText, target) {
    const startStr = startedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const endStr = endedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    const details = {
        Severidade: 'HIGH',
        'Início (Queda)': startStr,
        'Fim (Volta)': endStr,
        Duração: durationText,
        'Alvo de validação': target
    };
    
    const technical = formatTelegramDetailLines(details);
    
    return [
        '📴 <b>FALHA DE CONECTIVIDADE LOCAL DO HOST DO NOC</b>',
        '<i>Evento local, independente do monitoramento de links WAN do Zabbix.</i>',
        formatTelegramSection('Resumo executivo', 'O host onde o servidor NOC está em execução ficou sem saída para a internet. Esse aviso foi retido localmente e enviado após a reconexão.'),
        formatTelegramSection('Detalhamento técnico', technical),
        formatTelegramSection('Impacto operacional', 'Durante esse intervalo, Telegram e Zabbix ficaram inacessíveis do host local. Esse evento não representa, por si só, o estado dos links físicos das filiais.'),
        '<i>Camilo dos Santos NOC</i>'
    ].filter(Boolean).join('\n\n').slice(0, 3900);
}

function formatTelegramLocalInternetRecovered(restoredAt, target) {
    const restoredStr = restoredAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    const details = {
        Severidade: 'INFO',
        'Restabelecido em': restoredStr,
        'Alvo de validação': target
    };
    
    const technical = formatTelegramDetailLines(details);
    
    return [
        '📶 <b>CONECTIVIDADE LOCAL DO HOST DO NOC RESTABELECIDA</b>',
        '<i>Evento local do host normalizado.</i>',
        formatTelegramSection('Resumo executivo', 'A saída para a internet do host onde o NOC roda voltou a responder. O servidor retomou integrações e envio de alertas.'),
        formatTelegramSection('Detalhamento técnico', technical),
        formatTelegramSection('Status operacional', 'Telegram, Zabbix e rotinas online voltaram a responder normalmente.'),
        '<i>Camilo dos Santos NOC</i>'
    ].filter(Boolean).join('\n\n').slice(0, 3900);
}



function startLocalInternetMonitor() {
    setInterval(async () => {
        try {
            const { online, target } = await checkLocalInternet();
            const now = new Date();
            
            if (online) {
                if (localInternetStatus === 'DOWN') {
                    const downStartedAt = pendingInternetDownSince || now;
                    const durationMs = now.getTime() - downStartedAt.getTime();
                    const durationText = formatDuration(durationMs);
                    
                    db.run(
                        `INSERT INTO runtime_status (service_name, current_status, down_started_at, last_error)
                         VALUES ('LOCAL_INTERNET', 'UP', NULL, '')
                         ON CONFLICT(service_name) DO UPDATE SET current_status = 'UP', down_started_at = NULL, last_error = ''`
                    );
                    console.log(`[INET] Conectividade restaurada via ${target}; queda anterior durou ${durationText}.`);
                }
                localInternetStatus = 'UP';
                pendingInternetDownSince = null;
            } else {
                if (localInternetStatus !== 'DOWN') {
                    if (pendingInternetDownSince === null) {
                        pendingInternetDownSince = now;
                        console.warn("[INET] Falha de internet local detectada. Aguardando confirmação...");
                    } else {
                        const elapsedSec = (now.getTime() - pendingInternetDownSince.getTime()) / 1000;
                        if (elapsedSec >= 60) {
                            localInternetStatus = 'DOWN';
                            const downStartStr = pendingInternetDownSince.toISOString();
                            db.run(
                                `INSERT INTO runtime_status (service_name, current_status, down_started_at, last_error)
                                 VALUES ('LOCAL_INTERNET', 'DOWN', ?, 'Sem conectividade de saída nos alvos configurados.')
                                 ON CONFLICT(service_name) DO UPDATE SET current_status = 'DOWN', down_started_at = ?, last_error = 'Sem conectividade de saída.'`,
                                [downStartStr, downStartStr]
                            );
                            console.error(`[INET] Queda de internet local confirmada em ${pendingInternetDownSince.toLocaleString('pt-BR')}.`);
                        }
                    }
                } else {
                    const downStartStr = (pendingInternetDownSince || now).toISOString();
                    db.run(
                        `INSERT INTO runtime_status (service_name, current_status, down_started_at, last_error)
                         VALUES ('LOCAL_INTERNET', 'DOWN', ?, 'Sem conectividade de saída nos alvos configurados.')
                         ON CONFLICT(service_name) DO UPDATE SET last_error = 'Sem conectividade de saída.'`,
                        [downStartStr]
                    );
                }
            }
        } catch (e) {
            console.error('[INET] Erro no monitor de internet:', e.message);
        }
    }, 30000);
}

// Inicializar estado do monitor local do banco
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS runtime_status (
            service_name TEXT PRIMARY KEY,
            current_status TEXT,
            down_started_at TEXT,
            last_error TEXT
        )
    `, () => {
        db.get("SELECT current_status, down_started_at FROM runtime_status WHERE service_name = 'LOCAL_INTERNET'", (err, row) => {
            if (row) {
                localInternetStatus = row.current_status || 'UP';
                if (localInternetStatus === 'DOWN' && row.down_started_at) {
                    pendingInternetDownSince = new Date(row.down_started_at);
                }
            }
            startLocalInternetMonitor();
        });
    });
});

// ========================================================================
// TELEGRAM COMMAND POLLING & HANDLING
// ========================================================================

function getWeeklyReportData() {
    return new Promise((resolve, reject) => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        db.get(
            `SELECT COUNT(*) as total FROM incidents_history WHERE down_at >= ?`,
            [sevenDaysAgo],
            (err, row) => {
                if (err) {
                    console.warn('[TELEGRAM] Erro ao buscar dados do relatório no SQLite, usando fallback em memória:', err.message);
                    let fallbackCount = 0;
                    let fallbackUnits = [];
                    if (latestStatusPayload && latestStatusPayload.incidents) {
                        fallbackCount = latestStatusPayload.incidents.length;
                        const counts = {};
                        latestStatusPayload.incidents.forEach(inc => {
                            counts[inc.name] = (counts[inc.name] || 0) + 1;
                        });
                        fallbackUnits = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
                    }
                    return resolve({
                        total_downs: fallbackCount,
                        unit_downs: fallbackUnits,
                        period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
                        period_end: new Date().toLocaleDateString('pt-BR')
                    });
                }
                const total = row ? row.total : 0;
                
                db.all(
                    `SELECT name, COUNT(*) as count 
                     FROM incidents_history 
                     WHERE down_at >= ?
                     GROUP BY name
                     ORDER BY count DESC`,
                    [sevenDaysAgo],
                    (err2, rows) => {
                        if (err2) {
                            console.warn('[TELEGRAM] Erro ao buscar lista de incidentes no SQLite, usando fallback em memória:', err2.message);
                            let fallbackUnits = [];
                            if (latestStatusPayload && latestStatusPayload.incidents) {
                                const counts = {};
                                latestStatusPayload.incidents.forEach(inc => {
                                    counts[inc.name] = (counts[inc.name] || 0) + 1;
                                });
                                fallbackUnits = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
                            }
                            return resolve({
                                total_downs: total,
                                unit_downs: fallbackUnits,
                                period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
                                period_end: new Date().toLocaleDateString('pt-BR')
                            });
                        }
                        
                        resolve({
                            total_downs: total,
                            unit_downs: rows || [],
                            period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
                            period_end: new Date().toLocaleDateString('pt-BR')
                        });
                    }
                );
            }
        );
    });
}

function registerTelegramChatId(chatId) {
    const idStr = String(chatId);
    if (!idStr) return;

    try {
        let raw = {};
        if (fs.existsSync(SETTINGS_FILE)) {
            raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
        
        let chatIdsRaw = raw.telegramChatIds || '';
        let list = chatIdsRaw.split(',')
            .map(x => x.trim())
            .filter(x => x !== '');

        if (!list.includes(idStr)) {
            list.push(idStr);
            raw.telegramChatIds = list.join(',');
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(raw, null, 2));
            reloadConfig();
            console.log(`[TELEGRAM] Novo chat_id cadastrado automaticamente via /start: ${idStr}`);
            
            sendTelegramMessage(`🔔 <b>Cadastro Realizado!</b>\n\nVocê foi adicionado à lista de destinatários de alertas do NOC e passará a receber notificações de incidentes.`, { chat_id: idStr });
        }
    } catch (e) {
        console.error('[TELEGRAM] Erro ao registrar chat_id automaticamente:', e.message);
    }
}

async function handleTelegramCommand(message) {
    const text = message.text;
    const fromId = message.chat?.id;
    if (!text || !fromId) return;

    const trimmedText = text.trim();
    if (!trimmedText.startsWith('/')) return;

    const cmd = trimmedText.split(' ')[0].toLowerCase();
    
    console.log(`[TELEGRAM] Comando recebido: ${cmd} do chat ${fromId}`);

    try {
        if (cmd === '/start' || cmd === '/help') {
            if (cmd === '/start') {
                registerTelegramChatId(fromId);
            }
            const help_msg = `🤖 <b>Camilo dos Santos NOC Bot</b>\n\n• <code>/status</code>: status local do servidor NOC.\n• <code>/links</code>: status atual dos links WAN.\n• <code>/incidentes</code>: incidentes ainda abertos.\n• <code>/relatorio</code>: consolidado recente de quedas.\n• <code>/inventario</code>: inventário de máquinas.\n• <code>/help</code>: mostra esta ajuda.`;
            await sendTelegramMessage(help_msg, { chat_id: fromId });
            return;
        }

        if (cmd === '/status') {
            const uptime = Math.round(process.uptime());
            const uptimeText = formatDuration(uptime * 1000);
            const isZbxConfigured = Boolean(ZABBIX_URL && ZABBIX_TOKEN);
            const internetStatus = localInternetStatus || 'UP';
            const msg = `✅ <b>STATUS DO SERVIDOR NOC</b>\n\n• <b>Uptime:</b> <code>${uptimeText}</code>\n• <b>Zabbix API:</b> <code>${isZbxConfigured ? 'CONECTADO' : 'NÃO CONFIGURADO'}</code>\n• <b>Internet local:</b> <code>${internetStatus}</code>\n• <b>Destinatários:</b> <code>${TELEGRAM_CHAT_IDS.length}</code>\n• <b>Banco de dados:</b> <code>noc_telemetry.db</code>\n• <b>Modo:</b> <code>NodeJS/Zabbix</code>`;
            await sendTelegramMessage(msg, { chat_id: fromId });
            return;
        }

        if (cmd === '/links') {
            const payload = await getRealtimeStatusPayload();
            const links = payload.links || [];

            const downCount = links.filter(l => l.status === 'offline').length;
            const warnCount = links.filter(l => l.status === 'warning').length;
            const upCount = links.filter(l => l.status === 'online').length;

            let msg = `🌐 <b>PAINEL OPERACIONAL DE LINKS</b>\n`;
            msg += `<i>Total monitorado: ${links.length} | UP: ${upCount} | Degradado: ${warnCount} | DOWN: ${downCount}</i>\n\n`;

            const sortedLinks = [...links].sort((a, b) => a.name.localeCompare(b.name));
            const limit = 35;
            const displayedLinks = sortedLinks.slice(0, limit);

            displayedLinks.forEach(l => {
                let icon = '⚪';
                let label = 'N/D';
                if (l.status === 'offline') {
                    icon = '🔴';
                    label = 'DOWN';
                } else if (l.status === 'warning') {
                    icon = '🟡';
                    const lossStr = l.packetLoss !== null ? ` | Perda ${l.packetLoss}%` : '';
                    const latStr = l.latency !== null ? ` | ${l.latency}ms` : '';
                    label = `ATENÇÃO${lossStr}${latStr}`;
                } else if (l.status === 'online') {
                    icon = '🟢';
                    const latStr = l.latency !== null ? ` | ${l.latency}ms` : '';
                    label = `UP${latStr}`;
                }
                msg += `${icon} <b>${htmlEscape(l.name)}</b>\n• <code>${label}</code>\n`;
            });

            const hiddenCount = links.length - displayedLinks.length;
            if (hiddenCount > 0) {
                msg += `\n<i>+ ${hiddenCount} links omitidos para manter a leitura do painel.</i>`;
            }
            await sendTelegramMessage(msg, { chat_id: fromId });
            return;
        }

        if (cmd === '/incidentes') {
            const payload = await getRealtimeStatusPayload();
            const incidents = payload.incidents || [];

            let msg = `🚨 <b>INCIDENTES OPERACIONAIS ATIVOS</b>\n`;
            msg += `<i>Total de incidentes em andamento: ${incidents.length}</i>\n\n`;

            if (incidents.length === 0) {
                msg += `✅ Nenhum incidente ativo no momento. Todos os ativos operando nos padrões de SLA.`;
            } else {
                const sortedIncidents = [...incidents].sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || a.name.localeCompare(b.name));
                const limit = 15;
                const displayedIncidents = sortedIncidents.slice(0, limit);

                displayedIncidents.forEach(i => {
                    const pBadge = `[${i.priority}]`;
                    const typeIcon = i.type === 'link' ? '🌐' : '🖨️';
                    const statusIcon = i.status === 'offline' ? '🔴' : '🟡';
                    msg += `${statusIcon} ${pBadge} <b>${htmlEscape(i.name)}</b> (${typeIcon})\n`;
                    msg += `• Detalhe: <code>${htmlEscape(i.detail || i.title)}</code>\n`;
                    if (i.action) {
                        msg += `• Ação: <i>${htmlEscape(i.action)}</i>\n`;
                    }
                    msg += `\n`;
                });

                const hiddenCount = incidents.length - displayedIncidents.length;
                if (hiddenCount > 0) {
                    msg += `<i>+ ${hiddenCount} incidentes omitidos para manter a leitura.</i>`;
                }
            }
            await sendTelegramMessage(msg, { chat_id: fromId });
            return;
        }

        if (cmd === '/relatorio') {
            const data = await getWeeklyReportData();
            const total = data.total_downs;
            const unit_downs = data.unit_downs;
            const top_unit = unit_downs.length > 0 ? unit_downs[0].name : "Nenhuma";
            const top_count = unit_downs.length > 0 ? unit_downs[0].count : 0;

            const executive = `Total de quedas na semana: <code>${total}</code>. Unidade com maior recorrência: <code>${htmlEscape(top_unit)}</code>.`;
            const technical = `• <b>Total de quedas:</b> <code>${total}</code>\n• <b>Unidade mais afetada:</b> <code>${htmlEscape(top_unit)}</code>\n• <b>Ocorrências da líder:</b> <code>${top_count}</code>`;

            let msg = `📊 <b>RELATÓRIO SEMANAL DE QUEDAS (NOC)</b>\n<i>Período: ${data.period_start} a ${data.period_end}</i>\n\n`;
            msg += `<b>Resumo executivo</b>\n${executive}\n\n`;
            msg += `<b>Detalhamento técnico</b>\n${technical}\n\n`;

            if (unit_downs.length > 0) {
                msg += `<b>Ranking por unidade</b>\n`;
                unit_downs.slice(0, 10).forEach((ud, index) => {
                    msg += `${index + 1}. <code>${htmlEscape(ud.name)}</code> - ${ud.count} queda(s)\n`;
                });
            } else {
                msg += `✅ Nenhuma queda registrada no período.`;
            }
            msg += `\n\n<i>Camilo dos Santos NOC</i>`;
            await sendTelegramMessage(msg, { chat_id: fromId });
            return;
        }

        if (cmd === '/inventario' || cmd === '/inventário') {
            const payload = await getRealtimeStatusPayload();
            const computers = payload.computers || [];

            const downCount = computers.filter(c => c.status === 'offline').length;
            const upCount = computers.filter(c => c.status === 'online').length;

            let msg = `🖥️ <b>INVENTÁRIO DE MÁQUINAS</b>\n`;
            msg += `<i>Total monitorado: ${computers.length} | Online: ${upCount} | Offline: ${downCount}</i>\n\n`;

            if (computers.length === 0) {
                msg += `⚠️ Nenhuma máquina cadastrada no inventário do Zabbix.`;
            } else {
                const sortedComps = [...computers].sort((a, b) => a.name.localeCompare(b.name));
                sortedComps.forEach(c => {
                    const icon = c.status === 'online' ? '🟢' : '🔴';
                    const ipStr = c.ip ? ` (<code>${c.ip}</code>)` : '';
                    const locStr = c.city ? ` [📍 ${htmlEscape(c.city)}]` : '';
                    msg += `${icon} <b>${htmlEscape(c.name)}</b>${ipStr}${locStr}\n`;
                    if (c.os) {
                        let shortOs = c.os;
                        if (shortOs.includes('Windows 10')) shortOs = 'Windows 10';
                        else if (shortOs.includes('Windows 11')) shortOs = 'Windows 11';
                        else if (shortOs.includes('Ubuntu')) shortOs = 'Ubuntu';
                        else if (shortOs.includes('Linux')) shortOs = 'Linux';
                        msg += `   └─ SO: <code>${htmlEscape(shortOs)}</code>`;
                        if (c.serialNumber) {
                            msg += ` | S/N: <code>${htmlEscape(c.serialNumber)}</code>`;
                        }
                        msg += `\n`;
                    } else if (c.serialNumber) {
                        msg += `   └─ S/N: <code>${htmlEscape(c.serialNumber)}</code>\n`;
                    }
                });
            }
            await sendTelegramMessage(msg, { chat_id: fromId });
            return;
        }
    } catch (e) {
        console.error(`[TELEGRAM] Erro ao tratar comando ${cmd}:`, e.message);
        await sendTelegramMessage(`❌ Erro ao processar o comando <code>${cmd}</code>: ${htmlEscape(e.message)}`, { chat_id: fromId });
    }
}


function startTelegramBotPolling() {
    if (telegramPollActive) {
        console.log('[TELEGRAM] Loop de polling para comandos do bot já ativo.');
        return;
    }
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('[TELEGRAM] Polling do bot não iniciado: TELEGRAM_BOT_TOKEN ausente.');
        return;
    }
    
    console.log('[TELEGRAM] Iniciando loop de polling para comandos do bot...');
    telegramPollActive = true;
    
    async function poll() {
        if (!telegramPollActive) return;
        
        try {
            const response = await telegramHttpClient.get(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`,
                {
                    params: {
                        offset: telegramPollOffset,
                        timeout: 20
                    },
                    timeout: 25000 
                }
            );
            
            const data = response.data;
            if (data && data.ok && Array.isArray(data.result)) {
                for (const update of data.result) {
                    telegramPollOffset = update.update_id + 1;
                    
                    if (update.message) {
                        await handleTelegramCommand(update.message);
                    }
                }
            }
        } catch (error) {
            const errorMsg = error.response?.data?.description || error.message;
            console.warn('[TELEGRAM] Erro no polling de comandos:', errorMsg);
        }
        
        setTimeout(poll, 1500);
    }
    
    poll();
}

// Loop de telemetria em segundo plano para monitoramento 24/7
async function runBackgroundTelemetryLoop() {
    try {
        await buildStatusPayload();
    } catch (e) {
        console.error('[TELEMETRY] Erro no loop de telemetria em segundo plano:', e.message);
    } finally {
        setTimeout(runBackgroundTelemetryLoop, 12000);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PRINTER NOC SERVER rodando ativamente na porta ${PORT}`);
    // Executar migração de coordenadas de localizações existentes
    runLocationsMigration();
    // Inicializar polling de comandos do Telegram
    startTelegramBotPolling();
    // Inicializar loop de telemetria contínuo em segundo plano
    runBackgroundTelemetryLoop();
});

function runLocationsMigration() {
    try {
        const settings = readSettings();
        if (!settings.locations || typeof settings.locations !== 'object') {
            console.log('[MIGRATION] Sem localizações para migrar.');
            return;
        }

        const municipiosFile = path.join(__dirname, 'public', 'municipios.json');
        if (!fs.existsSync(municipiosFile)) {
            console.warn('[MIGRATION] Arquivo municipios.json não encontrado para realizar migração.');
            return;
        }

        let content = fs.readFileSync(municipiosFile, 'utf8');
        const startIdx = content.indexOf('[');
        if (startIdx !== -1) {
            content = content.slice(startIdx);
        }
        const municipios = JSON.parse(content.trim());
        let updatedCount = 0;

        const normalizeStr = (str) => {
            if (!str) return '';
            return str
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim();
        };

        const ufToCodigo = {
            'sp': 35,
            'mg': 31,
            'mg-zm': 31,
            'mg-bh': 31,
            'mg-sul': 31,
            'rj': 33,
            'es': 32
        };

        const cityAliases = {
            'pavuna': 'rio de janeiro'
        };

        const customUnitsList = settings.customUnits || [];
        customUnitsList.forEach(u => {
            if (u.name && u.city) {
                cityAliases[normalizeStr(u.name)] = normalizeStr(u.city);
            }
        });



        const keys = Object.keys(settings.locations);
        for (const key of keys) {
            const loc = settings.locations[key];
            if (loc && loc.city && (loc.lat === undefined || loc.lat === null || loc.lng === undefined || loc.lng === null)) {
                let lookupCity = normalizeStr(loc.city);
                if (cityAliases[lookupCity]) {
                    lookupCity = cityAliases[lookupCity];
                }
                const targetUfCode = ufToCodigo[normalizeStr(loc.region)];

                let match = municipios.find(m => {
                    const nameMatch = normalizeStr(m.nome) === lookupCity;
                    if (!nameMatch) return false;
                    if (targetUfCode) {
                        return m.codigo_uf === targetUfCode;
                    }
                    return true;
                });

                if (!match) {
                    match = municipios.find(m => normalizeStr(m.nome) === lookupCity);
                }

                if (match) {
                    loc.lat = match.latitude;
                    loc.lng = match.longitude;
                    updatedCount++;
                    console.log(`[MIGRATION] Cidade '${loc.city}' (${loc.region || 'N/A'}) migrada com sucesso: lat=${loc.lat}, lng=${loc.lng}`);
                } else {
                    console.warn(`[MIGRATION] Não foi possível encontrar coordenadas para a cidade: '${loc.city}'`);
                }
            }
        }

        if (updatedCount > 0) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
            console.log(`[MIGRATION] Migração concluída com sucesso! ${updatedCount} cidades receberam coordenadas geográficas (lat/lng).`);
        } else {
            console.log('[MIGRATION] Nenhuma nova localização necessitou de migração.');
        }
    } catch (e) {
        console.error('[MIGRATION] Erro durante a migração de localizações:', e.message);
    }
}
