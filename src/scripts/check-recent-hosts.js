const client = require('../infrastructure/zabbix/zabbix-client');

async function checkRecentHosts() {
    try {
        const hosts = await client.request('host.get', {
            output: ['hostid', 'host', 'name', 'status'],
            selectInterfaces: ['ip', 'port', 'available', 'error'],
            sortfield: 'hostid',
            sortorder: 'DESC',
            limit: 10
        });

        console.log(JSON.stringify(hosts, null, 2));
    } catch (err) {
        console.error('Erro na consulta Zabbix:', err.message);
    }
}

checkRecentHosts();
