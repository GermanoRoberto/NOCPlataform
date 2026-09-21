const axios = require('axios');
const config = require('../../core/config');
const logger = require('../../core/logger');

class ZabbixClient {
    constructor() {
        this.url = config.zabbix.url;
        this.token = config.zabbix.token;
        this.timeout = config.zabbix.timeoutMs;
        this.consecutiveFailures = 0;
        this.circuitOpen = false;
        this.lastFailureTime = 0;
        this.resetTimeout = 30000;
        this.requestId = 1;
    }

    isCircuitOpen() {
        if (!this.circuitOpen) return false;
        if (Date.now() - this.lastFailureTime > this.resetTimeout) {
            this.circuitOpen = false;
            return false;
        }
        return true;
    }

    recordSuccess() {
        this.consecutiveFailures = 0;
        this.circuitOpen = false;
    }

    recordFailure(err) {
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();
        if (this.consecutiveFailures >= config.zabbix.circuitBreakerThreshold) {
            this.circuitOpen = true;
            logger.error('Circuit Breaker Zabbix ABERTO: suspendendo chamadas para evitar travamento.');
        }
    }

    async request(method, params = {}) {
        if (this.isCircuitOpen()) {
            throw new Error(`Zabbix inacessível (Circuit Breaker aberto devido a ${this.consecutiveFailures} falhas consecutivas).`);
        }

        const id = this.requestId++;
        const payload = { jsonrpc: '2.0', method, params, auth: this.token, id };

        try {
            const response = await axios.post(this.url, payload, {
                timeout: this.timeout,
                headers: { 'Content-Type': 'application/json-rpc', 'User-Agent': 'NOC-Enterprise-Engine/2.0' }
            });

            const data = response.data;
            if (data.error) {
                const err = new Error(data.error.data || data.error.message || 'Erro no Zabbix RPC');
                throw err;
            }

            this.recordSuccess();
            return data.result;
        } catch (error) {
            this.recordFailure(error);
            throw error;
        }
    }

    async getHostsWithTelemetry(groupids = null) {
        const params = {
            output: ['hostid', 'name', 'status', 'active_available', 'available'],
            selectInterfaces: ['ip', 'dns', 'useip', 'main'],
            selectItems: ['itemid', 'name', 'key_', 'lastvalue', 'lastclock', 'units', 'status', 'type'],
            selectGroups: ['name'],
            selectMacros: ['macro', 'value'],
            selectInventory: 'extend',
            selectTags: ['tag', 'value'],
            selectTriggers: ['triggerid', 'description', 'priority', 'value'],
            monitored_hosts: true
        };
        if (groupids) params.groupids = groupids;
        return await this.request('host.get', params);
    }

    async deleteHost(hostid) {
        return await this.request('host.delete', [String(hostid)]);
    }

    async updateHostInventory(hostid, inventoryData) {
        return await this.request('host.update', {
            hostid: String(hostid),
            inventory: inventoryData
        });
    }

    async getApiVersion() {
        try {
            const res = await axios.post(this.url, { jsonrpc: '2.0', method: 'apiinfo.version', params: [], id: 1 }, { timeout: 3000 });
            return res.data?.result || 'Desconhecida';
        } catch (e) {
            return 'Desconhecida';
        }
    }
}

module.exports = new ZabbixClient();
