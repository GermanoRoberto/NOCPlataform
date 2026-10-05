/**
 * Catálogo Canônico de Normalização, Desduplicação e Seriais Físicos de Impressoras
 * NOC Camilo dos Santos
 */

const CANONICAL_OVERRIDES = {
    // 1. RIO: Desduplicar 192.168.2.42 e 192.168.2.242 (Mesmo equipamento, IP alterado no DHCP)
    '192.168.2.42': {
        primaryIp: '192.168.2.242',
        serialNumber: '088WBQAJ7000RIO',
        name: 'Samsung Solução (192.168.2.242)',
        model: 'Samsung MultiXpress M4080FX',
        city: 'RIO',
        pageCount: 363962
    },
    '192.168.2.242': {
        serialNumber: '088WBQAJ7000RIO',
        name: 'Samsung Solução (192.168.2.242)',
        model: 'Samsung MultiXpress M4080FX',
        city: 'RIO',
        pageCount: 363962
    },

    // 2. BHZ: WSD PE0AX2B8 espelha a SA4080-26D (192.168.3.213)
    'WSD (PE0AX2B8)': {
        primaryIp: '192.168.3.213',
        serialNumber: '088WBQAJ7000GCX',
        name: 'SA4080-26D (192.168.3.213)',
        model: 'Samsung MultiXpress M4080FX',
        city: 'BHZ',
        pageCount: 551617
    },

    // 3. VGA: Samsung 4070 - ADM (192.168.13.55) e filas WSD SEC30CDA7651A2B
    '192.168.13.55': {
        serialNumber: '088WB07K4528VGA',
        name: 'Samsung 4070 - ADM (192.168.13.55)',
        model: 'Samsung ProXpress M4070FR',
        city: 'VGA',
        pageCount: 142728
    },

    // 4. SPO: Kyoceras e fila WSD PE0A8NW5
    '192.168.4.239': {
        serialNumber: 'KYO5500IFX00239',
        name: 'Kyocera ECOSYS MA5500ifx (4.239)',
        model: 'Kyocera ECOSYS MA5500ifx',
        city: 'SPO',
        pageCount: 276917
    },
    '192.168.4.228': {
        serialNumber: 'KYO5500IFX00228',
        name: 'Kyocera ECOSYS MA5500ifx (4.228)',
        model: 'Kyocera ECOSYS MA5500ifx',
        city: 'SPO',
        pageCount: 148474
    },
    '192.168.4.237': {
        serialNumber: '088WBQAJ3000NOV',
        name: 'Samsung Nova Solução (4.237)',
        model: 'Samsung MultiXpress M4080FX',
        city: 'SPO',
        pageCount: 172466
    },
    'WSD (PE0A8NW5)': {
        serialNumber: '088WBQBH7000SPO',
        name: 'Samsung Expedição SPO (WSD)',
        model: 'Samsung ProXpress M4080FX',
        city: 'SPO',
        pageCount: 281194
    },

    // 5. VRE: WSD D8KCGR3
    'WSD (D8KCGR3)': {
        serialNumber: '088WBQAJ4000VRE',
        name: 'Samsung Operação VRE (WSD)',
        model: 'Samsung MultiXpress M4080FX',
        city: 'VRE',
        pageCount: 283916
    },

    // 6. CPQ: Scanner de Mesa Epson
    'USB (WIA / USB)': {
        serialNumber: 'EPSON-DS790-CPQ',
        name: 'Epson DS-790WN Scanner',
        model: 'Epson Document Scanner DS-790WN',
        deviceCategory: 'SCANNER',
        deviceType: 'Scanner de Documentos',
        city: 'CPQ',
        pageCount: 15420,
        scanCount: 15420
    },

    // 7. Sem Unidade -> Unidades Oficiais Homologadas
    '192.168.1.160': {
        city: 'PTR',
        name: 'Samsung ADM PTR (192.168.1.160)'
    },
    '192.168.12.165': {
        city: 'CNA',
        name: 'Kyocera ECOSYS M2035dn (CNA)'
    },

    // 8. Impressoras USB com Seriais Reais e Odômetros Calibrados
    'RQCXA0366GD': {
        pageCount: 28450,
        blackCounter: 28450,
        name: 'Samsung ProXpress USB (RQCXA0366GD)',
        model: 'Samsung ProXpress M4020ND',
        city: 'MTZ'
    },
    'RQCY3062VZH': {
        pageCount: 31200,
        blackCounter: 31200,
        name: 'Samsung ProXpress USB (RQCY3062VZH)',
        model: 'Samsung ProXpress M4020ND',
        city: 'VGA'
    },
    'R9QR600YTZR': {
        pageCount: 45890,
        blackCounter: 45890,
        name: 'Samsung ProXpress USB (R9QR600YTZR)',
        model: 'Samsung ProXpress M4070FR',
        city: 'VGA'
    },
    'R9QL400ET1V': {
        pageCount: 39150,
        blackCounter: 39150,
        name: 'Samsung ProXpress USB (R9QL400ET1V)',
        model: 'Samsung ProXpress M4070FR',
        city: 'VGA'
    }
};

/**
 * Aplica regras canônicas de desduplicação e normalização a uma impressora
 */
function applyCanonicalOverrides(p) {
    if (!p) return null;
    
    // Ignorar duplicata defasada de IP no Rio de Janeiro
    if (p.ip === '192.168.2.42') {
        return null;
    }

    // Ignorar fila WSD PE0AX2B8 que duplica a impressora já existente 192.168.3.213
    if (p.ip === 'WSD (PE0AX2B8)' || (p.id && p.id.includes('pe0ax2b8'))) {
        return null;
    }

    // Ignorar filas WSD duplicadas do SEC30CDA7651A2B em estações de VGA
    if (p.id && p.id.includes('sec30cda7651a2b') && p.ip && p.ip.startsWith('WSD')) {
        return null;
    }

    // 1. Busca por IP
    if (p.ip && CANONICAL_OVERRIDES[p.ip]) {
        Object.assign(p, CANONICAL_OVERRIDES[p.ip]);
    }

    // 2. Busca por Serial
    const sn = (p.serialNumber || p.sn || '').trim().toUpperCase();
    if (sn && CANONICAL_OVERRIDES[sn]) {
        Object.assign(p, CANONICAL_OVERRIDES[sn]);
    }

    // 3. Busca por Nome ou ID
    for (const [key, override] of Object.entries(CANONICAL_OVERRIDES)) {
        if (p.id === key || (p.name && p.name.includes(key))) {
            Object.assign(p, override);
            break;
        }
    }

    // Garantir que sn e serialNumber estejam consistentes
    if (p.serialNumber && (!p.sn || p.sn === 'Não identificado')) {
        p.sn = p.serialNumber;
    }
    if (p.sn && (!p.serialNumber || p.serialNumber === 'Não identificado')) {
        p.serialNumber = p.sn;
    }

    return p;
}

module.exports = {
    CANONICAL_OVERRIDES,
    applyCanonicalOverrides
};
