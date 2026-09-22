const { spawn } = require('child_process');
const db = require('../infrastructure/database/connection');
const zabbixClient = require('../infrastructure/zabbix/zabbix-client');
const { isV8Protected } = require('../domain/rules/v8-guard');
const logger = require('../core/logger');

class RemediationService {
    constructor() {
        this.initTable();
    }

    async initTable() {
        const sql = `
            CREATE TABLE IF NOT EXISTS aiops_remediation_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id TEXT NOT NULL,
                host_name TEXT,
                action_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                nivel_autonomia INTEGER DEFAULT 1,
                status TEXT NOT NULL,
                output TEXT,
                duration_ms INTEGER,
                triggered_by TEXT DEFAULT 'HUMAN_1CLICK',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        try {
            await db.run(sql);
        } catch (e) {
            logger.warn({ error: e.message }, 'Falha ao inicializar tabela aiops_remediation_log');
        }
    }

    sanitizeTarget(target) {
        if (!target || typeof target !== 'string') return null;
        const clean = target.trim();
        if (/^[a-zA-Z0-9.-]{1,80}$/.test(clean)) {
            return clean;
        }
        return null;
    }

    runProcess(cmd, args, timeoutMs = 25000) {
        return new Promise((resolve) => {
            const start = Date.now();
            let stdout = '';
            let stderr = '';

            const child = spawn(cmd, args, {
                timeout: timeoutMs,
                windowsHide: true,
                shell: false
            });

            child.stdout.on('data', d => { stdout += d.toString('latin1'); });
            child.stderr.on('data', d => { stderr += d.toString('latin1'); });

            child.on('close', code => {
                const duration_ms = Date.now() - start;
                resolve({
                    success: code === 0,
                    code,
                    output: (stdout + (stderr ? '\n' + stderr : '')).trim(),
                    duration_ms
                });
            });

            child.on('error', err => {
                const duration_ms = Date.now() - start;
                resolve({
                    success: false,
                    code: -1,
                    output: `Erro ao disparar processo: ${err.message}`,
                    duration_ms
                });
            });
        });
    }

    async executeAction(actionId, targetAsset, params = {}, triggeredBy = 'HUMAN_1CLICK') {
        const hostId = String(targetAsset.id || targetAsset.hostid || targetAsset.name || 'UNKNOWN');
        const hostName = targetAsset.name || hostId;
        const targetIp = this.sanitizeTarget(params.ip || targetAsset.ip);
        const gatewayIp = this.sanitizeTarget(params.gateway || targetAsset.gateway);

        // 1. Verificação de Proteção Regra V8 e Ativos Imutáveis
        const isProtected = isV8Protected(targetAsset) || 
                            isV8Protected({ name: hostName, hostname: hostName, type: targetAsset.deviceType }) ||
                            hostName.toUpperCase().includes('PE0D7QQS') ||
                            hostId.toUpperCase().includes('PE0D7QQS');

        if (isProtected && (actionId.startsWith('ACTION_RESTART') || actionId.startsWith('ACTION_REBOOT') || actionId.startsWith('ACTION_FLUSH'))) {
            const blockedMsg = `BLOQUEIO REGRA V8: O ativo ${hostName} (${hostId}) é estritamente protegido contra ações de remediação e reboot.`;
            logger.warn({ hostId, hostName, actionId }, blockedMsg);
            await this.logExecution(hostId, hostName, actionId, 'REMEDIATION', 1, 'BLOCKED_V8', blockedMsg, 0, triggeredBy);
            return {
                actionId,
                actionType: 'REMEDIATION',
                nivel: 1,
                success: false,
                status: 'BLOCKED_V8',
                error: blockedMsg,
                output: blockedMsg,
                duration_ms: 0
            };
        }

        let result = { success: false, output: 'Ação não reconhecida.', duration_ms: 0 };
        let actionType = 'DIAGNOSTIC';
        let nivel = 1;

        switch (actionId) {
            case 'ACTION_PING_EXTENDED': {
                actionType = 'DIAGNOSTIC';
                nivel = 1;
                if (!targetIp) {
                    result = { success: false, output: 'IP do alvo inválido ou ausente.', duration_ms: 0 };
                    break;
                }
                const isWin = process.platform === 'win32';
                const args = isWin ? ['-n', '10', targetIp] : ['-c', '10', targetIp];
                result = await this.runProcess('ping', args, 20000);
                break;
            }

            case 'ACTION_DEEP_TRACEROUTE': {
                actionType = 'DIAGNOSTIC';
                nivel = 1;
                if (!targetIp) {
                    result = { success: false, output: 'IP do alvo inválido ou ausente.', duration_ms: 0 };
                    break;
                }
                const isWin = process.platform === 'win32';
                const cmd = isWin ? 'tracert' : 'traceroute';
                const args = isWin ? ['-d', '-h', '15', '-w', '1000', targetIp] : ['-n', '-m', '15', '-w', '1', targetIp];
                result = await this.runProcess(cmd, args, 30000);
                break;
            }

            case 'ACTION_TEST_GATEWAY': {
                actionType = 'DIAGNOSTIC';
                nivel = 1;
                const gw = gatewayIp || this.sanitizeTarget(targetAsset.gateway);
                if (!gw) {
                    result = { success: false, output: 'Gateway da operadora não identificado no cadastro do link.', duration_ms: 0 };
                    break;
                }
                const isWin = process.platform === 'win32';
                const args = isWin ? ['-n', '4', gw] : ['-c', '4', gw];
                result = await this.runProcess('ping', args, 10000);
                break;
            }

            case 'ACTION_FORCE_SYNC_TELEMETRY': {
                actionType = 'DIAGNOSTIC';
                nivel = 1;
                try {
                    const hostData = await zabbixClient.request('item.get', {
                        hostids: [hostId],
                        output: ['itemid'],
                        limit: 5
                    });
                    if (hostData && hostData.length > 0) {
                        for (const it of hostData) {
                            await zabbixClient.request('task.create', {
                                type: 6,
                                request: { itemid: it.itemid }
                            }).catch(() => {});
                        }
                        result = {
                            success: true,
                            output: `Solicitação de polling imediato enviada ao Zabbix Server para ${hostData.length} itens do host ${hostName}.`,
                            duration_ms: 250
                        };
                    } else {
                        result = { success: false, output: 'Nenhum item monitorado encontrado no Zabbix para este host.', duration_ms: 100 };
                    }
                } catch (e) {
                    result = { success: false, output: `Erro ao forçar sincronização via Zabbix: ${e.message}`, duration_ms: 100 };
                }
                break;
            }

            case 'ACTION_RESTART_SPOOLER': {
                actionType = 'REMEDIATION';
                nivel = 1;
                if (!targetIp) {
                    result = { success: false, output: 'IP do endpoint inválido.', duration_ms: 0 };
                    break;
                }
                // Executar comando seguro de reinicialização de spooler
                const psCmd = `Restart-Service -Name Spooler -Force -ErrorAction Stop; Get-Service -Name Spooler | Select-Object Name, Status`;
                result = await this.runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], 15000);
                break;
            }

            case 'ACTION_FLUSH_DNS': {
                actionType = 'REMEDIATION';
                nivel = 1;
                result = await this.runProcess('ipconfig', ['/flushdns'], 8000);
                break;
            }

            default: {
                result = { success: false, output: `Ação ${actionId} não implementada no catálogo de segurança.`, duration_ms: 0 };
                break;
            }
        }

        // Gravação em log de auditoria
        const finalStatus = result.success ? 'SUCESSO' : 'FALHA';
        await this.logExecution(hostId, hostName, actionId, actionType, nivel, finalStatus, result.output, result.duration_ms, triggeredBy);

        return {
            actionId,
            actionType,
            nivel,
            success: result.success,
            status: finalStatus,
            output: result.output,
            duration_ms: result.duration_ms,
            timestamp: new Date().toISOString()
        };
    }

    async logExecution(hostId, hostName, actionId, actionType, nivel, status, output, durationMs, triggeredBy) {
        const sql = `
            INSERT INTO aiops_remediation_log (
                host_id, host_name, action_id, action_type, nivel_autonomia, status, output, duration_ms, triggered_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        try {
            await db.run(sql, [
                String(hostId),
                hostName || null,
                actionId,
                actionType,
                nivel,
                status,
                output || null,
                durationMs || 0,
                triggeredBy
            ]);
        } catch (e) {
            logger.warn({ error: e.message }, 'Falha ao registrar auditoria de remediação');
        }
    }

    async getHistory(hostId = null, limit = 50) {
        let sql = `SELECT * FROM aiops_remediation_log`;
        const params = [];
        if (hostId) {
            sql += ` WHERE host_id = ?`;
            params.push(String(hostId));
        }
        sql += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(Math.min(limit, 200));
        return await db.query(sql, params);
    }
}

module.exports = new RemediationService();
