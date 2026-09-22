const remediationService = require('../../services/remediation-service');

class RemediationController {
    async executeAction(req, res, next) {
        try {
            const { actionId, asset, params, triggeredBy } = req.body || {};
            if (!actionId || !asset) {
                return res.status(400).json({ error: 'Parâmetros actionId e asset são obrigatórios.' });
            }

            const result = await remediationService.executeAction(actionId, asset, params || {}, triggeredBy || 'HUMAN_1CLICK');
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async selfHealing(req, res, next) {
        try {
            const { actionId, asset, failureReason } = req.body || {};
            if (!actionId || !asset) {
                return res.status(400).json({ error: 'Parâmetros actionId e asset são obrigatórios.' });
            }
            const result = await remediationService.attemptSelfHealing(actionId, asset, failureReason);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getHistory(req, res, next) {
        try {
            const hostId = req.query.host_id || null;
            const limit = Number(req.query.limit) || 50;
            const history = await remediationService.getHistory(hostId, limit);
            res.json({ total: history.length, history });
        } catch (err) {
            next(err);
        }
    }

    async getAvailableActions(req, res) {
        res.json({
            actions: [
                {
                    id: 'ACTION_PING_EXTENDED',
                    label: 'Disparar Teste de Perda Contínua (ICMP 10 pkts)',
                    tipo: 'DIAGNOSTIC',
                    nivel: 1,
                    categoria: 'LINK'
                },
                {
                    id: 'ACTION_DEEP_TRACEROUTE',
                    label: 'Executar Traceroute Detalhado (MTR)',
                    tipo: 'DIAGNOSTIC',
                    nivel: 1,
                    categoria: 'LINK'
                },
                {
                    id: 'ACTION_TEST_GATEWAY',
                    label: 'Testar Resposta do Gateway da Operadora',
                    tipo: 'DIAGNOSTIC',
                    nivel: 1,
                    categoria: 'LINK'
                },
                {
                    id: 'ACTION_FORCE_SYNC_TELEMETRY',
                    label: 'Forçar Sincronização Zabbix Agent / Polling',
                    tipo: 'DIAGNOSTIC',
                    nivel: 1,
                    categoria: 'ALL'
                },
                {
                    id: 'ACTION_RESTART_SPOOLER',
                    label: 'Reiniciar Fila / Spooler de Impressão',
                    tipo: 'REMEDIATION',
                    nivel: 1,
                    categoria: 'COMPUTER'
                },
                {
                    id: 'ACTION_FLUSH_DNS',
                    label: 'Limpar Cache DNS (ipconfig /flushdns)',
                    tipo: 'REMEDIATION',
                    nivel: 1,
                    categoria: 'COMPUTER'
                }
            ]
        });
    }
}

module.exports = new RemediationController();
