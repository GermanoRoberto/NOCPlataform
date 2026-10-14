const incidentRepository = require('../../repositories/incident-repository');

function extractDetails(name) {
    const clean = (name || '').trim();
    const nameUpper = clean.toUpperCase();
    const branchCodes = ['CPQ', 'JDF', 'MTZ', 'PPY', 'PTR', 'RIO', 'SPO', 'VGA', 'VIX', 'BHZ', 'FBR', 'BETIM', 'CNA', 'BCA', 'DIV', 'IPA', 'UDI', 'CAB', 'CGO', 'ITB', 'MCE', 'TRS', 'VRE'];

    let isp = '';
    if (nameUpper.includes('ALGAR')) isp = 'ALGAR TELECOM';
    else if (nameUpper.includes('EMBRATEL')) isp = 'EMBRATEL';
    else if (nameUpper.includes('AMERICAN TOWER')) isp = 'AMERICAN TOWER';
    else if (nameUpper.includes('AMERICANET') || nameUpper.includes('VERO')) isp = 'AMERICANET / VERO';
    else if (nameUpper.includes('CENTURY') || nameUpper.includes('LUMEN')) isp = 'CENTURY LINK / LUMEN';
    else if (nameUpper.includes('ALTA REDE')) isp = 'ALTA REDE';
    else if (nameUpper.includes('TURBONET')) isp = 'TURBONET';
    else if (nameUpper.includes('NWT')) isp = 'NWT TELECOM';
    else if (nameUpper.includes('GIGALINK')) isp = 'GIGALINK';
    else if (nameUpper.includes('SITEL')) isp = 'SITEL';
    else if (nameUpper.includes('AVATO')) isp = 'AVATO FIBRA';
    else if (nameUpper.includes('MAXXTELECOM')) isp = 'MAXXTELECOM';
    else if (nameUpper.includes('MUNDIVOX')) isp = 'MUNDIVOX';
    else if (nameUpper.includes('DINAMICA')) isp = 'DINÂMICA';
    else if (nameUpper.includes('DRAYTEK') || nameUpper.includes('VIGOR') || nameUpper.includes('GATEWAY')) isp = 'DRAYTEK (GATEWAY LOCAL)';
    else {
        const parts = clean.split('-').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            const firstUpper = parts[0].toUpperCase();
            if (branchCodes.some(b => firstUpper.includes(b))) {
                isp = parts.slice(1).join(' - ').toUpperCase();
            } else {
                isp = parts[0].toUpperCase();
            }
        } else {
            isp = clean.toUpperCase();
        }
    }

    let branchCode = 'MTZ';
    for (const b of branchCodes) {
        if (nameUpper.includes(b)) {
            branchCode = b;
            break;
        }
    }

    let city = branchCode === 'BETIM' ? 'MTZ' : branchCode;
    return { isp, city, branchCode };
}

class IncidentController {
    async getIncidents(req, res, next) {
        try {
            const limit = Math.min(100, parseInt(req.query.limit) || 50);
            const incidents = await incidentRepository.getRecentIncidents(limit);

            const enriched = incidents.map(inc => {
                const { isp, city, branchCode } = extractDetails(inc.name);
                const ms = inc.duration_ms || 0;
                let severity = 'BLIP';
                let severityLabel = 'Micro-oscilação (< 1 min)';
                let slaImpact = false;

                if (inc.status === 'active') {
                    severity = 'CRITICAL';
                    severityLabel = '🚨 Queda Ativa em Andamento';
                    slaImpact = true;
                } else if (ms >= 300000) {
                    severity = 'CRITICAL';
                    severityLabel = 'Queda Crítica (> 5 min)';
                    slaImpact = true;
                } else if (ms >= 60000) {
                    severity = 'WARNING';
                    severityLabel = 'Instabilidade de Rota (1-5 min)';
                    slaImpact = true;
                }

                return {
                    ...inc,
                    isp,
                    city,
                    branchCode,
                    severity,
                    severityLabel,
                    slaImpact
                };
            });

            res.json(enriched);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new IncidentController();
