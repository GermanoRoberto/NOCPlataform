const { spawn } = require('child_process');
const telegramClient = require('../../infrastructure/telegram/telegram-client');
const zabbixClient = require('../../infrastructure/zabbix/zabbix-client');

function cleanPingOutput(raw) {
    if (!raw) return '';
    return raw
        .replace(/\u00A1/g, 'í')
        .replace(/\u00A3/g, 'ú')
        .replace(/\u00A0/g, 'á')
        .replace(/[\u0082\u201A]/g, 'é')
        .replace(/Estat[\uFFFD\?a-z0-9¡]*sticas/gi, 'Estatísticas')
        .replace(/n[\uFFFD\?£]*mero/gi, 'número')
        .replace(/M[\uFFFD\?¡]*nimo/gi, 'Mínimo')
        .replace(/M[\uFFFD\? ]*ximo/gi, 'Máximo')
        .replace(/M[\uFFFD\?‚\u201A]*dia/gi, 'Média')
        .replace(/Conex[\uFFFD\?]*o/gi, 'Conexão')
        .replace(/m[\uFFFD\?‚\u201A]*dia/gi, 'média');
}

function runPingCommand(target, count = 4) {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const cmd = 'ping';
        const args = isWin ? ['-n', String(count), target] : ['-c', String(count), target];
        const child = spawn(cmd, args, { timeout: 8000, windowsHide: true });
        let out = '';
        child.stdout.on('data', d => { out += d.toString('latin1'); });
        child.stderr.on('data', d => { out += d.toString('latin1'); });
        child.on('close', code => resolve({ success: code === 0, output: cleanPingOutput(out.trim()), command: `${cmd} ${args.join(' ')}` }));
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
