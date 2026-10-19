const complianceService = require('../../services/compliance-service');
const complianceRepository = require('../../repositories/compliance-repository');
const telemetryService = require('../../services/telemetry-service');
const logger = require('../../core/logger');

class ComplianceController {
    async getOverview(req, res, next) {
        try {
            const computers = (telemetryService.latestPayload && telemetryService.latestPayload.computers) || [];
            const report = await complianceService.analyzeCompliance(computers);
            return res.status(200).json(report);
        } catch (err) {
            logger.error({ err: err.message }, 'Falha ao gerar relatório de compliance de software');
            return next(err);
        }
    }

    async getRules(req, res, next) {
        try {
            const rules = await complianceRepository.getAllRules();
            return res.status(200).json({ rules });
        } catch (err) {
            logger.error({ err: err.message }, 'Falha ao buscar regras de compliance');
            return next(err);
        }
    }

    async saveRule(req, res, next) {
        try {
            const { id, name, pattern, category, status, severity, reason } = req.body;
            if (!name || !pattern || !status) {
                return res.status(400).json({ error: 'Nome, pattern e status são obrigatórios.' });
            }
            const saved = await complianceRepository.upsertRule({
                id,
                name,
                pattern,
                category: category || 'Geral',
                status,
                severity: severity || (status === 'FORBIDDEN' ? 'HIGH' : 'INFO'),
                reason: reason || ''
            });
            return res.status(200).json({ success: true, rule: saved });
        } catch (err) {
            logger.error({ err: err.message }, 'Falha ao salvar regra de compliance');
            return next(err);
        }
    }

    async deleteRule(req, res, next) {
        try {
            const { id } = req.params;
            if (!id) return res.status(400).json({ error: 'ID da regra não fornecido.' });
            await complianceRepository.deleteRule(id);
            return res.status(200).json({ success: true, message: 'Regra excluída com sucesso.' });
        } catch (err) {
            logger.error({ err: err.message }, 'Falha ao excluir regra de compliance');
            return next(err);
        }
    }

    async quickClassify(req, res, next) {
        try {
            const { softwareName, status, reason } = req.body;
            if (!softwareName || !status) {
                return res.status(400).json({ error: 'Nome do software e status (ALLOWED/FORBIDDEN) são obrigatórios.' });
            }
            const rule = await complianceService.quickClassify(softwareName, status, reason);
            return res.status(200).json({ success: true, rule });
        } catch (err) {
            logger.error({ err: err.message }, 'Falha na classificação rápida de compliance');
            return next(err);
        }
    }

    async analyzeSoftwareWithAi(req, res, next) {
        try {
            const { softwareName } = req.body;
            if (!softwareName) {
                return res.status(400).json({ error: 'Nome do software é obrigatório para consulta de inteligência.' });
            }
            const intel = await complianceService.querySoftwareIntel(softwareName);
            return res.status(200).json({ success: true, intel });
        } catch (err) {
            logger.error({ err: err.message }, 'Falha ao analisar software com IA');
            return next(err);
        }
    }

    async uninstallRemoteSoftware(req, res, next) {
        try {
            const { hostId, softwareName, allHosts, targetHostIds } = req.body;
            if (!softwareName) {
                return res.status(400).json({ error: 'softwareName é obrigatório.' });
            }

            // Se for solicitado para desinstalar de todas as estações ou múltiplos hosts
            if (allHosts || (Array.isArray(targetHostIds) && targetHostIds.length > 0)) {
                const result = await complianceService.uninstallSoftwareFromAllHosts(softwareName, targetHostIds);
                return res.status(200).json(result);
            }

            if (!hostId) {
                return res.status(400).json({ error: 'hostId ou allHosts: true é obrigatório.' });
            }

            const result = await complianceService.uninstallSoftwareRemotely(hostId, softwareName);
            return res.status(200).json(result);
        } catch (err) {
            logger.error({ err: err.message, hostId: req.body?.hostId, softwareName: req.body?.softwareName }, 'Falha na desinstalação remota de software');
            return next(err);
        }
    }

    async getQueue(req, res, next) {
        try {
            const queue = await complianceRepository.getPendingRemediations();
            return res.status(200).json({ success: true, queue });
        } catch (err) {
            return next(err);
        }
    }

    async enqueueAutoRemediation(req, res, next) {
        try {
            const { hostId, softwareName, hostName } = req.body;
            if (!hostId || !softwareName) {
                return res.status(400).json({ error: 'hostId e softwareName são obrigatórios' });
            }
            await complianceRepository.enqueueRemediation(hostId, softwareName, hostName || '');
            return res.status(200).json({ success: true, message: 'Enfileirado com sucesso.' });
        } catch (err) {
            return next(err);
        }
    }
}

module.exports = new ComplianceController();
