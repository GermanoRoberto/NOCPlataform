const zabbixClient = require('../infrastructure/zabbix/zabbix-client');
const { assertV8Compliance } = require('../domain/rules/v8-guard');
const logger = require('../core/logger');

class DeviceService {
    async deleteHost(hostid, candidate = {}) {
        const assetToCheck = {
            id: String(hostid),
            name: candidate.name || candidate.hostname,
            type: candidate.type || 'UNKNOWN'
        };

        // Regra V8: se for roteador, switch ou gateway, lança InfraProtectedError (HTTP 403)
        assertV8Compliance(assetToCheck, 'DELETE_HOST');

        logger.info({ hostid, name: assetToCheck.name }, 'Executando exclusão de host não protegido no Zabbix');
        const result = await zabbixClient.deleteHost(hostid);
        return { success: true, result };
    }

    async updateHostInventory(hostid, data = {}) {
        const realHostId = String(hostid).startsWith('agent-') ? hostid.split('-')[1] : String(hostid);
        const inventory = {};
        if (data.location !== undefined) inventory.location = String(data.location || '');
        if (data.contact !== undefined) {
            inventory.contact = String(data.contact || '');
            inventory.poc_2_name = String(data.contact || '');
        }
        if (data.deployment_status !== undefined) inventory.deployment_status = String(data.deployment_status || '');
        if (data.notes !== undefined) inventory.notes = String(data.notes || '');

        logger.info({ realHostId, inventory }, 'Persistindo metadados de inventário diretamente no Zabbix (SSoT)');
        const result = await zabbixClient.updateHostInventory(realHostId, inventory);

        const telemetryService = require('./telemetry-service');
        telemetryService.updateHostInMemory(realHostId, {
            city: data.location !== undefined ? (data.location || null) : undefined,
            owner: data.contact !== undefined ? (data.contact || null) : undefined,
            loggedUser: data.contact !== undefined ? (data.contact || null) : undefined,
            operationalStatus: data.deployment_status !== undefined ? (data.deployment_status || 'Activo') : undefined,
            notes: data.notes !== undefined ? (data.notes || '') : undefined
        });

        telemetryService.collectTelemetry().catch(() => {});

        return { success: true, result };
    }
}

module.exports = new DeviceService();
