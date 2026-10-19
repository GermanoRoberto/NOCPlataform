const telemetryService = require('../../services/telemetry-service');
const zabbixClient = require('../../infrastructure/zabbix/zabbix-client');
const db = require('../../infrastructure/database/connection');
const operationalNotesRepository = require('../../repositories/operational-notes-repository');
const macroTransitService = require('../../services/macro-transit-service');

class TelemetryController {
    async getStatus(req, res) {
        if (!telemetryService.latestPayload) {
            await telemetryService.collectTelemetry();
        }
        res.set('Cache-Control', 'no-store');
        const p = telemetryService.latestPayload || {};
        
        let printers = p.printers || [];
        try {
            const { applyCanonicalOverrides } = require('../../domain/rules/printer-canonical-catalog');
            printers = printers.map(item => applyCanonicalOverrides({ ...item })).filter(Boolean);
            const seenSn = new Set();
            const deduplicated = [];
            for (const item of printers) {
                const sn = (item.serialNumber || item.sn || '').trim().toUpperCase();
                if (sn && !['N/D', 'NÃO IDENTIFICADO', 'SEM RESPOSTA (DESLIGADA)'].includes(sn)) {
                    if (seenSn.has(sn)) continue;
                    seenSn.add(sn);
                }
                deduplicated.push(item);
            }
            printers = deduplicated;
        } catch (e) {}

        const finalPayload = { ...p, printers, success: true, data: { ...p, printers } };
        res.json(finalPayload);
    }

    streamStatus(req, res) {
        if (req.socket) {
            req.socket.setTimeout(0);
            req.socket.setNoDelay(true);
            req.socket.setKeepAlive(true, 5000);
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        if (res.flushHeaders) res.flushHeaders();

        const timer = setInterval(() => {
            try {
                if (!res.writableEnded && !res.destroyed) {
                    res.write(': keepalive\n\n');
                } else {
                    clearInterval(timer);
                }
            } catch (e) {
                clearInterval(timer);
            }
        }, 10000);

        const cleanup = () => {
            clearInterval(timer);
            if (telemetryService.removeSseClient) {
                telemetryService.removeSseClient(res);
            }
        };

        res.on('close', cleanup);
        res.on('error', cleanup);
        telemetryService.addSseClient(res);
    }

    async getLinkPanelStatus(req, res) {
        if (!telemetryService.latestPayload) {
            await telemetryService.collectTelemetry();
        }
        res.set('Cache-Control', 'no-store');
        const p = telemetryService.latestPayload || {};
        const links = p.links || [];
        const notesMap = await operationalNotesRepository.getAllNotes().catch(() => ({}));

        const items = links
            .filter(link => {
                const nameLower = String(link.name || '').toLowerCase();
                return !nameLower.includes('gateway') && !nameLower.includes('draytek');
            })
            .map(link => {
                let status = link.status;
                if (status === 'online' && link.latency !== null && link.latency > 150) {
                    status = 'warning';
                }
                // Notas operacionais são notas de incidente e só devem ser exibidas em links instáveis/fora (não em links online)
                const opNote = (status !== 'online') ? (notesMap[link.name]?.note || null) : null;
                return {
                    name: link.name,
                    status: status,
                    latency: link.latency,
                    loss: link.packetLoss !== null ? link.packetLoss : (status === 'offline' ? 100 : 0),
                    traffic: link.traffic !== null ? (typeof link.traffic === 'number' ? link.traffic.toFixed(1) : link.traffic) : null,
                    uptime: link.uptime || '99.9%',
                    operationalNote: opNote,
                    subText: opNote ? `[${opNote.toUpperCase()}]` : null
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
                    totalTraffic += parseFloat(i.traffic) || 0;
                }
            }
        });

        res.json({
            items,
            macroTransit: macroTransitService.getStatus(),
            notes: notesMap,
            summary: {
                latency: latCount > 0 ? (totalLat / latCount).toFixed(0) : "0",
                traffic: totalTraffic.toFixed(1),
                uptime: totalLinks > 0 ? ((onlineCount / totalLinks) * 100).toFixed(2) : "0",
                alerts: off
            }
        });
    }

    async getOperationalNotes(req, res, next) {
        try {
            const notes = await operationalNotesRepository.getAllNotes();
            res.json({ success: true, notes });
        } catch (err) {
            next(err);
        }
    }

    async saveOperationalNote(req, res, next) {
        try {
            const { linkName, note } = req.body || {};
            if (!linkName) {
                return res.status(400).json({ success: false, error: 'linkName é obrigatório' });
            }
            const result = await operationalNotesRepository.setNote(linkName, note);
            res.json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    async getMacroTransitStatus(req, res) {
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, ...macroTransitService.getStatus() });
    }

    async getRawHosts(req, res) {
        if (!telemetryService.latestPayload) {
            await telemetryService.collectTelemetry();
        }
        res.set('Cache-Control', 'no-store');
        const p = telemetryService.latestPayload || {};
        const hosts = (p.links || [])
            .map(h => ({ name: h.name, ip: h.ip }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json(hosts);
    }

    async getHealth(req, res) {
        let dbOk = false;
        try { await db.get('SELECT 1'); dbOk = true; } catch (e) {}
        const zabbixCircuitOpen = zabbixClient.isCircuitOpen();
        res.json({
            status: dbOk && !zabbixCircuitOpen ? 'healthy' : 'degraded',
            database: dbOk ? 'connected' : 'disconnected',
            zabbix: zabbixCircuitOpen ? 'DEGRADED' : 'HEALTHY',
            uptimeSeconds: process.uptime()
        });
    }
}

module.exports = new TelemetryController();
