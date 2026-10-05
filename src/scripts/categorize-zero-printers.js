const http = require('http');

http.get('http://localhost:4002/api/status', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const printers = json.printers || [];
            const zeroCounter = printers.filter(p => (Number(p.pageCount) || 0) === 0 && (Number(p.blackCounter) || 0) === 0);

            console.log(`=== CLASSIFICAÇÃO DAS ${zeroCounter.length} IMPRESSORAS ZERADAS ===`);
            
            const wsdQueue = [];
            const usbVirtualOrScanner = [];
            const offlineSnmpIp = [];
            const others = [];

            zeroCounter.forEach(p => {
                const ip = p.ip || '';
                const id = p.id || '';
                const name = (p.name || '').toLowerCase();

                if (ip.startsWith('WSD') || id.includes('wsd')) {
                    wsdQueue.push(p);
                } else if (ip.startsWith('USB') || id.includes('usb') || id.startsWith('scanner')) {
                    usbVirtualOrScanner.push(p);
                } else if (ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                    offlineSnmpIp.push(p);
                } else {
                    others.push(p);
                }
            });

            console.log(`\n1. Filas de Impressão WSD mapeadas em estações de trabalho: ${wsdQueue.length}`);
            wsdQueue.forEach(p => console.log(`   - [${p.city}] ${p.name} (Porta/Host: ${p.ip})`));

            console.log(`\n2. Scanners, Drivers WIA ou Filas Locais USB/Virtuais sem odômetro: ${usbVirtualOrScanner.length}`);
            usbVirtualOrScanner.forEach(p => console.log(`   - [${p.city}] ${p.name} (Porta/Host: ${p.ip})`));

            console.log(`\n3. Impressoras de Rede com IP próprio mas sem resposta SNMP (Desligadas/Bloqueadas/Inacessíveis): ${offlineSnmpIp.length}`);
            offlineSnmpIp.forEach(p => console.log(`   - [${p.city}] ${p.name} (IP: ${p.ip} - Status: ${p.status} - SN: ${p.serialNumber})`));

            console.log(`\n4. Outras: ${others.length}`);
            others.forEach(p => console.log(`   - [${p.city}] ${p.name} (IP: ${p.ip})`));

        } catch (e) {
            console.error('Erro:', e.message);
        }
    });
});
