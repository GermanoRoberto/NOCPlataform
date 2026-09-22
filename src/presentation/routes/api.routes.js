const express = require('express');
const { z } = require('zod');
const telemetryController = require('../controllers/telemetry.controller');
const deviceController = require('../controllers/device.controller');
const incidentController = require('../controllers/incident.controller');
const printerController = require('../controllers/printer.controller');
const configController = require('../controllers/config.controller');
const reportController = require('../controllers/report.controller');
const diagnosticController = require('../controllers/diagnostic.controller');
const aiController = require('../controllers/ai.controller');
const remediationController = require('../controllers/remediation.controller');

const v8ProtectionMiddleware = require('../middlewares/v8-protection');
const { apiLimiter, destructiveLimiter } = require('../middlewares/rate-limiter');
const { validateBody } = require('../middlewares/validate-schema');

const router = express.Router();

router.get('/ai/status', apiLimiter, (req, res) => aiController.getStatus(req, res));
router.post('/ai/diagnose', apiLimiter, (req, res) => aiController.diagnose(req, res));
router.post('/ai/validate-context', apiLimiter, (req, res) => aiController.validateContext(req, res));
router.get('/ai/diagnostics/history', apiLimiter, (req, res) => aiController.getHistory(req, res));
router.get('/ai/predictive/toner/:id', apiLimiter, (req, res) => aiController.predictToner(req, res));
router.get('/ai/predictive/bandwidth/:id', apiLimiter, (req, res) => aiController.predictBandwidth(req, res));

// AIOps Ações e Remediação (Níveis 1 a 3)
router.post('/aiops/execute-action', apiLimiter, v8ProtectionMiddleware, (req, res, next) => remediationController.executeAction(req, res, next));
router.post('/aiops/self-healing', apiLimiter, (req, res, next) => remediationController.selfHealing(req, res, next));
router.get('/aiops/remediation-history', apiLimiter, (req, res, next) => remediationController.getHistory(req, res, next));
router.get('/aiops/actions/available', apiLimiter, (req, res) => remediationController.getAvailableActions(req, res));

router.get('/status', apiLimiter, (req, res) => telemetryController.getStatus(req, res));
router.get('/status/stream', (req, res) => telemetryController.streamStatus(req, res));
router.get('/health', (req, res) => telemetryController.getHealth(req, res));
router.get('/incidents', apiLimiter, (req, res, next) => incidentController.getIncidents(req, res, next));

router.get('/reports/devices', apiLimiter, (req, res) => reportController.getDevices(req, res));
router.get('/reports/summary', apiLimiter, (req, res) => reportController.getSummary(req, res));
router.get('/reports/trend', apiLimiter, (req, res) => reportController.getTrend(req, res));

router.post('/test-link', apiLimiter, (req, res) => diagnosticController.testLink(req, res));
router.post('/diagnostics/external', apiLimiter, (req, res) => diagnosticController.testLink(req, res));
router.post('/diagnostics/network-sweep', apiLimiter, (req, res) => diagnosticController.testLink(req, res));

router.get('/printers', apiLimiter, (req, res, next) => printerController.getPrinters(req, res, next));
router.get('/printer-exchanges', apiLimiter, (req, res, next) => printerController.getExchanges(req, res, next));
router.post('/printer-exchanges', apiLimiter, (req, res, next) => printerController.recordExchange(req, res, next));

router.get('/config', apiLimiter, (req, res, next) => configController.getConfig(req, res, next));
router.post('/config', apiLimiter, (req, res, next) => configController.saveConfig(req, res, next));
router.post('/config/test-telegram', apiLimiter, (req, res) => diagnosticController.testTelegram(req, res));
router.post('/config/test-zabbix', apiLimiter, (req, res) => diagnosticController.testZabbix(req, res));
router.post('/config/test-gateway', apiLimiter, (req, res) => diagnosticController.testGateway(req, res));

// Sub-painel compatibility
router.get('/link-panel/config', apiLimiter, (req, res, next) => configController.getConfig(req, res, next));
router.post('/link-panel/config', apiLimiter, (req, res, next) => configController.saveConfig(req, res, next));
router.get('/link-panel/status', apiLimiter, (req, res) => telemetryController.getLinkPanelStatus(req, res));
router.get('/raw-hosts', apiLimiter, (req, res) => telemetryController.getRawHosts(req, res));
router.get('/link-panel/raw-hosts', apiLimiter, (req, res) => telemetryController.getRawHosts(req, res));

// Atualização de Inventário Zabbix (Single Source of Truth)
router.post('/devices/inventory', apiLimiter, (req, res, next) => deviceController.updateInventory(req, res, next));

// REGRA V8 BLINDADA
const deleteHostSchema = z.object({
    hostid: z.union([z.string(), z.number()]).transform(v => String(v)),
    name: z.string().optional()
});

router.post(
    '/hosts/delete',
    destructiveLimiter,
    validateBody(deleteHostSchema),
    v8ProtectionMiddleware,
    (req, res, next) => deviceController.deleteHost(req, res, next)
);

const deleteAssetSchema = z.object({
    id: z.string().optional(),
    name: z.string().optional()
});

router.post(
    '/assets/delete',
    destructiveLimiter,
    validateBody(deleteAssetSchema),
    v8ProtectionMiddleware,
    (req, res, next) => deviceController.deleteAsset(req, res, next)
);

module.exports = router;
