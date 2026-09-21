const deviceService = require('../../services/device-service');

class DeviceController {
    async deleteHost(req, res, next) {
        try {
            const { hostid, name, type } = req.body;
            const result = await deviceService.deleteHost(hostid, { name, type });
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async deleteAsset(req, res, next) {
        try {
            const { id, name, type } = req.body;
            const result = await deviceService.deleteHost(id, { name, type });
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async updateInventory(req, res, next) {
        try {
            const { hostid, id, location, contact, deployment_status, notes } = req.body;
            const targetId = hostid || id;
            if (!targetId) {
                return res.status(400).json({ success: false, error: 'hostid ou id é obrigatório' });
            }
            const result = await deviceService.updateHostInventory(targetId, {
                location,
                contact,
                deployment_status,
                notes
            });
            res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new DeviceController();
