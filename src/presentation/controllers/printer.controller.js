const printerRepository = require('../../repositories/printer-repository');
const telemetryService = require('../../services/telemetry-service');

class PrinterController {
    async getPrinters(req, res, next) {
        try {
            const payload = telemetryService.latestPayload;
            res.json(payload ? payload.printers : []);
        } catch (err) {
            next(err);
        }
    }

    async recordExchange(req, res, next) {
        try {
            const exchange = req.body;
            await printerRepository.recordExchange(exchange);
            res.status(201).json({ success: true, message: 'Troca de insumo registrada com sucesso.' });
        } catch (err) {
            next(err);
        }
    }

    async getExchanges(req, res, next) {
        try {
            const rows = await printerRepository.getExchanges();
            res.json(rows);
        } catch (err) {
            next(err);
        }
    }

    async sanitizePrinters(req, res, next) {
        try {
            await printerRepository.cleanOrphanAndVirtualPrinters();
            await telemetryService.loadPersistedPrinters();
            telemetryService.collectTelemetry().catch(() => {});
            res.json({ success: true, message: 'Impressoras sanitizadas com sucesso.' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PrinterController();
