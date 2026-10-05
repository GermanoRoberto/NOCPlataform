const OFFICIAL_BRANCH_CODES = [
    'MTZ', 'BHZ', 'RIO', 'SPO', 'CPQ', 'JDF', 'PPY', 'PTR', 'VGA', 'VIX',
    'FBR', 'CNA', 'BCA', 'DIV', 'IPA', 'UDI', 'CAB', 'CGO', 'ITB', 'MCE', 'TRS', 'VRE'
];

const WAN_IP_BRANCH_MAP = {
    '186.248.191.210': 'MTZ', '200.251.59.242': 'MTZ',
    '189.43.232.210': 'BHZ', '187.1.181.181': 'BHZ',
    '177.69.34.81': 'RIO', '200.142.111.122': 'RIO', '187.108.47.146': 'RIO',
    '187.72.161.201': 'SPO', '143.0.20.211': 'SPO', '189.8.89.10': 'SPO',
    '187.32.17.89': 'CPQ', '187.103.173.212': 'CPQ', '186.195.61.152': 'CPQ', '189.112.166.229': 'CPQ',
    '200.233.143.209': 'JDF', '186.248.190.34': 'JDF', '186.248.190.190': 'JDF',
    '187.32.32.169': 'PPY', '138.204.50.204': 'PPY',
    '187.16.253.80': 'PTR', '177.38.20.114': 'VGA',
    '189.84.216.206': 'VIX', '177.125.61.27': 'VIX',
    '189.84.241.2': 'FBR'
};

function toBranchCode(val) {
    if (!val || typeof val !== 'string') return null;
    const clean = val.trim();
    if (!clean || clean.toLowerCase() === 'sem unidade' || clean.toLowerCase() === 'não definida' || clean.toLowerCase() === 'nao definida') return null;
    const s = clean.toUpperCase();

    // 1. Sigla oficial direta ou em parênteses/brackets
    const acronymMatch = s.match(/\b(MTZ|BHZ|RIO|SPO|CPQ|JDF|PPY|PTR|VGA|VIX|FBR|CNA|BCA|DIV|IPA|UDI|CAB|CGO|ITB|MCE|TRS|VRE|BETIM|BTM)\b/);
    if (acronymMatch) {
        const code = acronymMatch[1];
        return (code === 'BETIM' || code === 'BTM') ? 'MTZ' : code;
    }

    // 2. Resolução por nomes das cidades/polos da Camilo dos Santos
    if (s.includes('BELO HORIZONTE')) return 'BHZ';
    if (s.includes('MATRIZ') || s.includes('HUB') || s.includes('BETIM') || s.includes('NUVEM')) return 'MTZ';
    if (s.includes('RIO DE JANEIRO')) return 'RIO';
    if (s.includes('SÃO PAULO') || s.includes('SAO PAULO')) return 'SPO';
    if (s.includes('CAMPINAS')) return 'CPQ';
    if (s.includes('JUIZ DE FORA') || s.includes('MATIAS BARBOSA')) return 'JDF';
    if (s.includes('POUSO ALEGRE')) return 'PPY';
    if (s.includes('PETRÓPOLIS') || s.includes('PETROPOLIS') || s.includes('PETROLINA')) return 'PTR';
    if (s.includes('VARGINHA')) return 'VGA';
    if (s.includes('VITÓRIA') || s.includes('VITORIA')) return 'VIX';
    if (s.includes('FRIBURGO')) return 'FBR';
    if (s.includes('COLATINA')) return 'CNA';
    if (s.includes('BARBACENA')) return 'BCA';
    if (s.includes('DIVINÓPOLIS') || s.includes('DIVINOPOLIS')) return 'DIV';
    if (s.includes('IPATINGA')) return 'IPA';
    if (s.includes('UBERLÂNDIA') || s.includes('UBERLANDIA')) return 'UDI';
    if (s.includes('CABO FRIO')) return 'CAB';
    if (s.includes('CAMPOS')) return 'CGO';
    if (s.includes('ITABORAÍ') || s.includes('ITABORAI')) return 'ITB';
    if (s.includes('MACAÉ') || s.includes('MACAE')) return 'MCE';
    if (s.includes('TRÊS RIOS') || s.includes('TRES RIOS')) return 'TRS';
    if (s.includes('VOLTA REDONDA')) return 'VRE';

    return clean.toUpperCase();
}

module.exports = {
    OFFICIAL_BRANCH_CODES,
    WAN_IP_BRANCH_MAP,
    toBranchCode
};
