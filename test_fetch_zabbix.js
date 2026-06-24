const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ZABBIX_URL = 'http://rcsfti.ddns.net:8091/zabbix/api_jsonrpc.php';
const ZABBIX_TOKEN = '148077c3327165c2bb76c362a78278b9faf7ff731c9459f0288601e3cd7274fb';

function resolveZabbixHostPrimaryIp(host) {
    const interfaces = Array.isArray(host?.interfaces) ? host.interfaces : [];
    const primary = interfaces.find(i => Number(i?.main) === 1) || interfaces[0];
    if (!primary) return '';
    const useIp = Number(primary?.useip) === 1;
    const value = useIp ? primary.ip : primary.dns;
    return String(value || '').trim();
}

function deriveStableFallbackIp(hostid, prefix, startOctet = 10, range = 200) {
    const n = Number(hostid);
    if (!Number.isFinite(n)) return '';
    const last = startOctet + (Math.abs(Math.trunc(n)) % range);
    return `${prefix}.${last}`;
}

async function testFetch() {
    const payload = {
        jsonrpc: "2.0",
        method: "host.get",
        params: {
            output: ["hostid", "name"],
            selectInterfaces: ["ip", "dns", "useip", "main"],
            selectItems: ["itemid", "name", "key_", "lastvalue", "lastclock", "units"],
            selectGroups: ["name"],
            selectInventory: ["os", "hardware", "serialno_a", "macaddress_a", "software", "chassis"],
            monitored_hosts: true
        },
        auth: ZABBIX_TOKEN,
        id: 2
    };

    const response = await axios.post(ZABBIX_URL, payload);
    const hosts = response.data.result || [];
    const printers = [];
    const links = [];
    const computers = [];

    hosts.forEach(h => {
        const hostLower = h.name.toLowerCase();
        const interfaceIp = resolveZabbixHostPrimaryIp(h);

        if (hostLower.includes('camera') || hostLower.includes('cftv') || hostLower.includes('zabbix server') ||
            hostLower.includes('ap_mtz')) return;

        const isComputer = (h.groups && h.groups.some(g => g.name.toLowerCase() === 'computadores')) ||
                           hostLower.startsWith('pe0') || 
                           hostLower.includes('abelardo');

        if (isComputer) {
            let compObj = {
                id: h.hostid,
                name: h.name,
                ip: interfaceIp || deriveStableFallbackIp(h.hostid, '10.100.10', 10, 200),
                status: 'online',
                icmpPing: null,
                agentAvailable: null,
                groups: (h.groups || []).map(g => g.name)
            };
            computers.push(compObj);
            return;
        }

        const isPrinter = hostLower.includes('impressora') || hostLower.includes('printer') || 
                          hostLower.includes('ricoh') || hostLower.includes('lexmark') ||
                          hostLower.includes('brother') || hostLower.includes('hp-laser');

        if (isPrinter) {
            printers.push({ id: h.hostid, name: h.name });
        } else {
            links.push({ id: h.hostid, name: h.name });
        }
    });

    console.log(`Matched links: ${links.length}`);
    links.forEach(l => {
        console.log(`- ID: ${l.id} | Name: ${l.name}`);
    });
}

testFetch().catch(err => console.error(err));
