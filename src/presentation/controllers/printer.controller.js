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

    async calibrateOdometer(req, res, next) {
        try {
            const { serialNumber, pageCount } = req.body;
            if (!serialNumber || !pageCount) {
                return res.status(400).json({ error: 'serialNumber e pageCount são obrigatórios.' });
            }
            const cleanSn = String(serialNumber).trim();
            const count = parseInt(pageCount, 10);

            // 1. Atualizar em memória no serviço de telemetria
            if (telemetryService.knownPrinters) {
                for (const [key, p] of telemetryService.knownPrinters.entries()) {
                    if (p.serialNumber === cleanSn || p.sn === cleanSn || key.includes(cleanSn.toUpperCase())) {
                        p.pageCount = Math.max(count, p.pageCount || 0);
                        p.blackCounter = Math.max(count, p.blackCounter || 0);
                        await printerRepository.upsertRegistry(p);
                    }
                }
            }

            res.json({ success: true, message: `Odômetro da impressora ${cleanSn} calibrado para ${count} páginas.` });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PrinterController();
