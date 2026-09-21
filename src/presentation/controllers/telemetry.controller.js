const telemetryService = require('../../services/telemetry-service');
const zabbixClient = require('../../infrastructure/zabbix/zabbix-client');
const db = require('../../infrastructure/database/connection');

class TelemetryController {
    async getStatus(req, res) {
        if (!telemetryService.latestPayload) {
            await telemetryService.collectTelemetry();
        }
        res.set('Cache-Control', 'no-store');
        const p = telemetryService.latestPayload || {};
        res.json({ ...p, success: true, data: p });
    }

    streamStatus(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.flushHeaders();
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
        }, 15000);

        const cleanup = () => {
            clearInterval(timer);
            telemetryService.removeSseClient ? telemetryService.removeSseClient(res) : null;
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
                return {
                    name: link.name,
                    status: status,
                    latency: link.latency,
                    loss: link.packetLoss !== null ? link.packetLoss : (status === 'offline' ? 100 : 0),
                    traffic: link.traffic !== null ? (typeof link.traffic === 'number' ? link.traffic.toFixed(1) : link.traffic) : null,
                    uptime: link.uptime || '99.9%'
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
            summary: {
                latency: latCount > 0 ? (totalLat / latCount).toFixed(0) : "0",
                traffic: totalTraffic.toFixed(1),
                uptime: totalLinks > 0 ? ((onlineCount / totalLinks) * 100).toFixed(2) : "0",
                alerts: off
            }
        });
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
