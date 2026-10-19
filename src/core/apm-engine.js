/**
 * OpenTelemetry Tracing & APM Core Engine
 * Camilo dos Santos - NOC & ITAM Operations Center
 * 
 * Implementa padrão W3C TraceContext e coleta métricas de APM
 * para preparar o envio nativo ao Zabbix 8 / OTLP Collector.
 */

const { randomBytes } = require('crypto');

class ApmEngine {
    constructor() {
        this.spans = [];
        this.maxSpans = 200; // Buffer circular em memória
        this.routesLatency = new Map(); // Estatísticas agregadas de rotas
        this.appTargets = [
            { id: 'sankhya-erp', name: 'Sankhya ERP (Produção)', type: 'ERP / Core', host: 'rcsfti.ddns.net', port: 8091, protocol: 'HTTP', path: '/mge/status' },
            { id: 'zabbix-api', name: 'Zabbix API Core', type: 'Monitoring', host: 'rcsfti.ddns.net', port: 8091, protocol: 'HTTP', path: '/zabbix/api_jsonrpc.php' },
            { id: 'sqlite-db', name: 'SQLite Operational DB', type: 'Database', host: 'localhost', port: null, protocol: 'FILE/SQL', path: 'data/noc.db' },
            { id: 'pluri-bi', name: 'Pluri Analytics & BI', type: 'Analytics', host: '127.0.0.1', port: 4002, protocol: 'HTTP', path: '/api/status' }
        ];
        this.appHealthCache = [];
        this.lastHealthCheck = 0;
    }

    /**
     * Middleware Express para rastreamento de requisições (Distributed Tracing Span)
     */
    middleware() {
        return (req, res, next) => {
            const traceId = req.headers['traceparent'] 
                ? req.headers['traceparent'].split('-')[1] 
                : randomBytes(16).toString('hex');
            const spanId = randomBytes(8).toString('hex');
            const startTime = process.hrtime();
            const startEpoch = Date.now();

            req.traceContext = { traceId, spanId, startTime, startEpoch };

            // Injeta headers de rastreamento no padrão W3C para propagação
            res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);

            // Captura o término da requisição
            const recordMetrics = () => {
                res.removeListener('finish', recordMetrics);
                res.removeListener('close', recordMetrics);

                const diff = process.hrtime(startTime);
                const durationMs = parseFloat(((diff[0] * 1e3) + (diff[1] * 1e-6)).toFixed(2));
                const routePath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
                const statusCode = res.statusCode;

                const span = {
                    traceId,
                    spanId,
                    name: `${req.method} ${routePath}`,
                    method: req.method,
                    route: routePath,
                    statusCode,
                    durationMs,
                    clientIp: req.ip || req.socket.remoteAddress,
                    timestamp: new Date(startEpoch).toISOString(),
                    status: statusCode >= 500 ? 'ERROR' : (statusCode >= 400 ? 'WARN' : 'OK')
                };

                // Buffer circular de spans
                this.spans.unshift(span);
                if (this.spans.length > this.maxSpans) {
                    this.spans.pop();
                }

                // Estatísticas agregadas da rota
                const current = this.routesLatency.get(routePath) || { count: 0, totalMs: 0, minMs: 999999, maxMs: 0, errors: 0 };
                current.count++;
                current.totalMs += durationMs;
                if (durationMs < current.minMs) current.minMs = durationMs;
                if (durationMs > current.maxMs) current.maxMs = durationMs;
                if (statusCode >= 400) current.errors++;
                this.routesLatency.set(routePath, current);
            };

            res.on('finish', recordMetrics);
            res.on('close', recordMetrics);

            next();
        };
    }

    /**
     * Retorna os últimos traces / spans no formato amigável para Waterfall
     */
    getRecentSpans(limit = 50) {
        return this.spans.slice(0, limit);
    }

    /**
     * Retorna a matriz de performance das rotas (APM Route Performance)
     */
    getRouteMetrics() {
        const metrics = [];
        this.routesLatency.forEach((stats, route) => {
            metrics.push({
                route,
                requests: stats.count,
                avgDurationMs: parseFloat((stats.totalMs / stats.count).toFixed(2)),
                minMs: parseFloat(stats.minMs.toFixed(2)),
                maxMs: parseFloat(stats.maxMs.toFixed(2)),
                errorRatePct: parseFloat(((stats.errors / stats.count) * 100).toFixed(1))
            });
        });
        return metrics.sort((a, b) => b.requests - a.requests);
    }

    /**
     * Executa checagem de saúde e latência sintética nas aplicações monitoradas
     */
    async checkApplicationHealth() {
        const now = Date.now();
        if (this.appHealthCache.length > 0 && (now - this.lastHealthCheck) < 15000) {
            return this.appHealthCache;
        }

        const results = [];
        for (const target of this.appTargets) {
            const start = process.hrtime();
            let isOnline = false;
            let latencyMs = 0;
            let details = '';

            try {
                if (target.protocol === 'FILE/SQL') {
                    // Teste de consulta no banco local
                    const db = require('../infrastructure/database/connection');
                    await new Promise((resolve, reject) => {
                        db.get('SELECT 1 as ping', (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });
                    const diff = process.hrtime(start);
                    latencyMs = parseFloat(((diff[0] * 1e3) + (diff[1] * 1e-6)).toFixed(1));
                    isOnline = true;
                    details = 'Query SQLite executada com sucesso';
                } else {
                    // Teste TCP / HTTP sintetizado
                    const net = require('net');
                    await new Promise((resolve, reject) => {
                        const sock = new net.Socket();
                        sock.setTimeout(2500);
                        sock.connect(target.port, target.host, () => {
                            sock.destroy();
                            resolve(true);
                        });
                        sock.on('error', (err) => {
                            sock.destroy();
                            reject(err);
                        });
                        sock.on('timeout', () => {
                            sock.destroy();
                            reject(new Error('Timeout'));
                        });
                    });
                    const diff = process.hrtime(start);
                    latencyMs = parseFloat(((diff[0] * 1e3) + (diff[1] * 1e-6)).toFixed(1));
                    isOnline = true;
                    details = 'Conexão de aplicação respondendo';
                }
            } catch (err) {
                const diff = process.hrtime(start);
                latencyMs = parseFloat(((diff[0] * 1e3) + (diff[1] * 1e-6)).toFixed(1));
                isOnline = false;
                details = err.message || 'Falha de conexão';
            }

            results.push({
                ...target,
                status: isOnline ? (latencyMs > 300 ? 'warning' : 'online') : 'offline',
                latencyMs,
                details,
                lastChecked: new Date().toISOString()
            });
        }

        this.appHealthCache = results;
        this.lastHealthCheck = now;
        return results;
    }
}

module.exports = new ApmEngine();
