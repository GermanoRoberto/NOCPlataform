const configRepository = require('../../repositories/config-repository');
const deviceService = require('../../services/device-service');

class ConfigController {
    async getConfig(req, res, next) {
        try {
            const settings = await configRepository.getSettings();
            res.json(settings);
        } catch (err) {
            next(err);
        }
    }

    async saveConfig(req, res, next) {
        try {
            if (req.body.locations && typeof req.body.locations === 'object') {
                for (const [hostid, loc] of Object.entries(req.body.locations)) {
                    await deviceService.updateHostInventory(hostid, { location: loc });
                }
            }
            if (req.body.owners && typeof req.body.owners === 'object') {
                for (const [hostid, own] of Object.entries(req.body.owners)) {
                    await deviceService.updateHostInventory(hostid, { contact: own });
                }
            }
            if (req.body.statuses && typeof req.body.statuses === 'object') {
                for (const [hostid, st] of Object.entries(req.body.statuses)) {
                    await deviceService.updateHostInventory(hostid, { deployment_status: st });
                }
            }

            const generalConfig = { ...req.body };
            delete generalConfig.locations;
            delete generalConfig.owners;
            delete generalConfig.statuses;

            const newSettings = Object.keys(generalConfig).length > 0
                ? await configRepository.saveSettings(generalConfig)
                : await configRepository.getSettings();

            res.json({ success: true, message: 'Configurações e inventário Zabbix atualizados.', data: newSettings });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ConfigController();
