const http = require('http');

http.get('http://localhost:4002/api/status', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const printers = json.printers || [];
            console.log(`Total de impressoras no payload: ${printers.length}`);

            const withCounter = printers.filter(p => (Number(p.pageCount) || 0) > 0 || (Number(p.blackCounter) || 0) > 0);
            const zeroCounter = printers.filter(p => (Number(p.pageCount) || 0) === 0 && (Number(p.blackCounter) || 0) === 0);

            console.log(`Com contador (>0): ${withCounter.length}`);
            console.log(`Zeradas (=0): ${zeroCounter.length}\n`);

            console.log('=== AMOSTRA DE IMPRESSORAS COM CONTADOR (>0) ===');
            withCounter.slice(0, 10).forEach(p => {
                console.log(`ID: ${p.id} | Nome: "${p.name}" | IP: ${p.ip} | SN: ${p.serialNumber} | Pages: ${p.pageCount} | City: ${p.city} | Status: ${p.status}`);
            });

            console.log('\n=== AMOSTRA DE IMPRESSORAS ZERADAS (=0) ===');
            zeroCounter.slice(0, 20).forEach(p => {
                console.log(`ID: ${p.id} | Nome: "${p.name}" | IP: ${p.ip} | SN: ${p.serialNumber} | Model: ${p.model} | City: ${p.city} | Status: ${p.status}`);
            });

            // Verificar se as zeradas têm nomes parecidos ou IPs idênticos às com contador (duplicadas)
            console.log('\n=== CRUZAMENTO: VERIFICAÇÃO DE DUPLICIDADE (IP OU SERIAL OU NOME) ===');
            let potentialDuplicates = 0;
            zeroCounter.forEach(z => {
                const match = withCounter.find(w => 
                    (w.serialNumber && w.serialNumber !== 'Não identificado' && w.serialNumber === z.serialNumber) ||
                    (w.ip && w.ip !== '--' && w.ip.match(/\d+\.\d+\.\d+\.\d+/) && w.ip === z.ip) ||
                    (w.name && z.name && w.name.toLowerCase().trim() === z.name.toLowerCase().trim())
                );
                if (match) {
                    potentialDuplicates++;
                    console.log(`[DUPLICADA DETECTADA] Zerada: "${z.name}" (${z.ip || z.id}) <--> Ativa com contador: "${match.name}" (${match.ip} - ${match.pageCount} págs - SN: ${match.serialNumber})`);
                }
            });
            console.log(`\nTotal de zeradas que são duplicatas exatas de impressoras ativas: ${potentialDuplicates}`);

        } catch (e) {
            console.error('Erro ao analisar JSON:', e.message);
        }
    });
}).on('error', (e) => {
    console.error('Erro HTTP:', e.message);
});
