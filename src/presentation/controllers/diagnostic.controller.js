const { spawn } = require('child_process');
const { decodeConsoleBuffer } = require('../../core/console-encoding');
const telegramClient = require('../../infrastructure/telegram/telegram-client');
const zabbixClient = require('../../infrastructure/zabbix/zabbix-client');

function runPingCommand(target, count = 4) {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const cmd = 'ping';
        const args = isWin ? ['-n', String(count), target] : ['-c', String(count), target];
        const child = spawn(cmd, args, { timeout: 8000, windowsHide: true });
        const chunks = [];
        child.stdout.on('data', d => { chunks.push(d); });
        child.stderr.on('data', d => { chunks.push(d); });
        child.on('close', code => {
            const out = decodeConsoleBuffer(chunks);
            resolve({ success: code === 0, output: out.trim(), command: `${cmd} ${args.join(' ')}` });
        });
        child.on('error', err => resolve({ success: false, output: err.message, command: `${cmd} ${args.join(' ')}` }));
    });
}

class DiagnosticController {
    async testLink(req, res) {
        const target = (req.body.ip || req.body.host || req.body.target || '127.0.0.1').trim();
        if (!/^[a-zA-Z0-9.-]{1,80}$/.test(target)) return res.status(400).json({ error: 'Alvo inválido.' });
        const result = await runPingCommand(target);
        res.json({ ...result, target });
    }

    async testTelegram(req, res) {
        try {
            await telegramClient.broadcast(`🔔 <b>TESTE NOC</b>\n\nNotificação de teste gerada em ${new Date().toLocaleString('pt-BR')}`);
            res.json({ success: true, message: 'Mensagem enviada.' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async testZabbix(req, res) {
        try {
            const version = await zabbixClient.getApiVersion();
            res.json({ success: true, version });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async testGateway(req, res) {
        const ip = req.body.ip;
        if (!ip || !/^[a-zA-Z0-9.-]{1,80}$/.test(ip)) return res.status(400).json({ error: 'IP inválido.' });
        const result = await runPingCommand(ip, 3);
        res.json({ ...result, target: ip });
    }
}

module.exports = new DiagnosticController();
