/**
 * NOC Enterprise - Printer Profile Resolver
 * Identificação inteligente de fabricantes, modelos, tecnologias de impressão e protocolos.
 * TOLERÂNCIA ZERO A HARDCODE: Nunca assume 'Samsung' como padrão para dispositivos de outros fabricantes.
 */

function cleanPrinterName(name = '') {
    return (name || '')
        .replace(/Solu[\uFFFD\?a-z0-9]*o/gi, 'Solução')
        .replace(/Expedi[\uFFFD\?a-z0-9]*o/gi, 'Expedição')
        .replace(/Distribui[\uFFFD\?a-z0-9]*o/gi, 'Distribuição')
        .replace(/Opera[\uFFFD\?a-z0-9]*o/gi, 'Operação')
        .replace(/\(Copiar\s+\d+\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolvePrinterProfile(rawName = '', rawModel = '', ip = '', serial = '') {
    const nameStr = cleanPrinterName(rawName);
    const modelStr = (rawModel || '').trim();
    const combined = `${nameStr} ${modelStr}`.trim();
    const upper = combined.toUpperCase();

    // Modelos genéricos inválidos que não devem ser preservados
    const isGenericModel = !modelStr || [
        'IMPRESSORA',
        'IMPRESSORA SAMSUNG',
        'IMPRESSORA CORPORATIVA',
        'N/D',
        '--',
        'UNKNOWN',
        'NULL',
        'UNDEFINED',
        'PRINTER',
        'MICROSOFT IPP CLASS DRIVER',
        'MICROSOFT PRINT TO PDF',
        'MICROSOFT XPS DOCUMENT WRITER',
        'MICROSOFT ENHANCED POINT AND PRINT COMPATIBILITY DRIVER',
        'REMOTE DESKTOP EASY PRINT'
    ].includes(modelStr.toUpperCase());

    // 0. FABRICANTE / CATEGORIA: SCANNERS DEDICADOS (EPSON, FUJITSU, CANON, KODAK, WIA)
    const isEpsonScanner = upper.includes('EPSON') && (
        upper.includes('DS-') || upper.includes('WORKFORCE DS') || upper.includes('PERFECTION') ||
        upper.includes('GT-') || upper.includes('ES-') || upper.includes('FASTFOTO') ||
        upper.includes('SCANNER') || upper.includes('SCAN') || upper.includes('V19') ||
        upper.includes('V39') || upper.includes('V600') || upper.includes('V850')
    );

    const isDedicatedScanner = isEpsonScanner ||
        upper.includes('SCANSNAP') ||
        upper.includes('FI-7160') || upper.includes('FI-8170') || upper.includes('FI-6130') || upper.includes('FI-7260') ||
        upper.includes('IMAGEFORMULA') ||
        upper.includes('SCANMATE') ||
        upper.includes('SCANJET') ||
        (upper.includes('SCANNER') && !upper.includes('SAMSUNG') && !upper.includes('MULTIFUNCIONAL') && !upper.includes('M408') && !upper.includes('X4300')) ||
        upper.startsWith('WIA-') ||
        upper.includes('DOCUMENT SCANNER');

    if (isDedicatedScanner) {
        let scManufacturer = 'Epson';
        let scModel = 'Scanner Epson WorkForce / DS';
        if (upper.includes('EPSON')) {
            scManufacturer = 'Epson';
            const m = combined.match(/Epson\s+([A-Za-z0-9\-_\s]+)/i);
            scModel = m ? `Epson ${m[1].replace(/\s*Scanner$/i, '').trim()}` : (nameStr || 'Epson Scanner');
        } else if (upper.includes('FUJITSU') || upper.includes('SCANSNAP') || upper.includes('FI-')) {
            scManufacturer = 'Fujitsu';
            const m = combined.match(/(?:ScanSnap\s+[A-Za-z0-9\-]+|fi-[0-9]+[A-Za-z]?)/i);
            scModel = m ? `Fujitsu ${m[0]}` : (nameStr || 'Fujitsu Document Scanner');
        } else if (upper.includes('CANON') || upper.includes('IMAGEFORMULA') || upper.includes('DR-')) {
            scManufacturer = 'Canon';
            const m = combined.match(/(?:imageFORMULA\s+[A-Za-z0-9\-]+|DR-[A-Za-z0-9\-]+)/i);
            scModel = m ? `Canon ${m[0]}` : (nameStr || 'Canon Scanner');
        } else if (upper.includes('KODAK')) {
            scManufacturer = 'Kodak';
            scModel = nameStr || 'Kodak Scanner';
        } else {
            scManufacturer = 'Corporativo';
            scModel = nameStr || 'Scanner de Documentos';
        }

        return {
            manufacturer: scManufacturer,
            model: scModel,
            isColor: true,
            isThermal: false,
            isScanner: true,
            deviceCategory: 'SCANNER',
            printTechnology: 'Scanner de Documentos / Mesa / ADF Corporativo',
            protocol: (ip && ip !== '--' && !ip.toUpperCase().startsWith('USB')) ? 'WSD / eSCL / IP' : 'USB / WIA',
            webUiLabel: (ip && ip !== '--') ? 'Web Admin Scanner' : 'Dispositivo Local'
        };
    }

    // 1. FABRICANTE: TÉRMICAS DE ETIQUETAS (ZEBRA, ELGIN, ARGOX, DATAMAX, BEMATECH)
    const isThermalPrinter = (
        upper.includes('ZEBRA') ||
        upper.includes('ZDESIGNER') ||
        upper.includes('ETIQUETA') ||
        upper.includes('S4M') ||
        upper.includes('ZD220') ||
        upper.includes('ZD230') ||
        upper.includes('ZD420') ||
        upper.includes('ZD620') ||
        upper.includes('GC420') ||
        upper.includes('GK420') ||
        upper.includes('ZT230') ||
        upper.includes('ZT410') ||
        upper.includes('ZT411') ||
        upper.includes('TLP2844') ||
        upper.includes('ELGIN') ||
        upper.includes('L42') ||
        upper.includes('ARGOX') ||
        upper.includes('OS-214') ||
        upper.includes('DATAMAX') ||
        upper.includes('BEMATECH') ||
        upper.includes('MP-4200') ||
        (upper.includes('EPSON') && (upper.includes('TM-T') || upper.includes('TM-U'))) ||
        upper.includes('THERMAL') ||
        upper.includes('TÉRMICA') ||
        upper.includes('TERMICA')
    );

    if (isThermalPrinter) {
        let thermalManufacturer = 'Zebra';
        let thermalModel = 'Zebra Desktop (Térmica de Etiquetas)';
        if (upper.includes('ELGIN')) {
            thermalManufacturer = 'Elgin';
            thermalModel = upper.includes('L42PRO') ? 'Elgin L42 Pro' : 'Elgin L42';
        } else if (upper.includes('ARGOX')) {
            thermalManufacturer = 'Argox';
            thermalModel = 'Argox OS-214';
        } else if (upper.includes('BEMATECH')) {
            thermalManufacturer = 'Bematech';
            thermalModel = 'Bematech MP-4200 TH';
        } else if (upper.includes('DATAMAX')) {
            thermalManufacturer = 'Datamax';
            thermalModel = 'Datamax-O\'Neil';
        } else if (upper.includes('EPSON')) {
            thermalManufacturer = 'Epson';
            thermalModel = 'Epson TM-T20 / Bobina';
        } else {
            if (upper.includes('S4M')) thermalModel = 'Zebra Stripe S4M (ZPL)';
            else if (upper.includes('ZD220')) thermalModel = 'Zebra ZD220';
            else if (upper.includes('ZD230')) thermalModel = 'Zebra ZD230';
            else if (upper.includes('ZD420')) thermalModel = 'Zebra ZD420';
            else if (upper.includes('ZD620')) thermalModel = 'Zebra ZD620';
            else if (upper.includes('ZT230')) thermalModel = 'Zebra ZT230';
            else if (upper.includes('ZT410')) thermalModel = 'Zebra ZT410';
            else if (upper.includes('ZT411')) thermalModel = 'Zebra ZT411';
            else if (upper.includes('GC420')) thermalModel = 'Zebra GC420t';
            else if (upper.includes('GK420')) thermalModel = 'Zebra GK420t';
            else if (upper.includes('TLP2844')) thermalModel = 'Zebra TLP2844';
            else if (upper.includes('ETIQUETA')) thermalModel = 'Zebra Desktop (Térmica de Etiquetas)';
            else {
                const zebraMatch = combined.match(/(?:ZDesigner\s+|Zebra\s+)?([A-Za-z0-9\-]+(?:dpi)?(?:\s+ZPL|\s+EPL)?)/i);
                thermalModel = zebraMatch ? `Zebra ${zebraMatch[1].trim()}` : 'Zebra Desktop (Térmica)';
            }
        }

        return {
            manufacturer: thermalManufacturer,
            model: thermalModel,
            isColor: false,
            isThermal: true,
            isScanner: false,
            deviceCategory: 'LABEL_PRINTER',
            printTechnology: 'Impressora Térmica de Etiquetas (ZPL / EPL)',
            protocol: (ip && ip !== '--' && !ip.toUpperCase().startsWith('USB')) ? 'RAW JetDirect / IP' : 'USB / Spooler',
            webUiLabel: (ip && ip !== '--') ? 'Zebra Web View' : 'Dispositivo Local'
        };
    }

    // 2. FABRICANTE: BROTHER
    if (upper.includes('BROTHER')) {
        let brotherModel = 'Brother';
        // Ex: "Brother DCP-L1652W Printer", "Brother HL-1212W", "Brother MFC-8890DW"
        const modelMatch = combined.match(/Brother\s+([A-Za-z0-9\-]+)/i);
        if (modelMatch) {
            brotherModel = `Brother ${modelMatch[1].toUpperCase()}`;
        } else if (!isGenericModel && !modelStr.toUpperCase().includes('SAMSUNG')) {
            brotherModel = modelStr.replace(/\s*Printer$/i, '').trim();
        } else if (nameStr) {
            brotherModel = nameStr.replace(/\s*Printer$/i, '').trim();
        }

        const isDcpOrMfc = upper.includes('DCP') || upper.includes('MFC');
        return {
            manufacturer: 'Brother',
            model: brotherModel,
            isColor: upper.includes('COLOR'),
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER',
            printTechnology: isDcpOrMfc 
                ? 'Multifuncional Laser Monocromática / Wi-Fi' 
                : 'Impressora Laser Monocromática / Wi-Fi',
            protocol: 'RAW (Porta 9100) / SNMP v2c / HTTP',
            webUiLabel: 'Brother Web Management'
        };
    }

    // 3. FABRICANTE: HP (HEWLETT-PACKARD)
    if (upper.includes('HEWLETT-PACKARD') || upper.includes('HP LASERJET') || upper.includes('HP DESKJET') || upper.includes('HP OFFICEJET') || (upper.includes('HP ') && !upper.includes('PHP'))) {
        let hpModel = combined.replace(/\s*Printer$/i, '').trim();
        const hpMatch = combined.match(/HP\s+([A-Za-z0-9\-\s]+)/i);
        if (hpMatch) hpModel = `HP ${hpMatch[1].trim()}`;
        const isColor = upper.includes('COLOR');

        return {
            manufacturer: 'HP',
            model: hpModel,
            isColor,
            printTechnology: isColor ? 'Multifuncional Laser Colorida Corporativa' : 'Laser Monocromática Corporativa',
            protocol: 'RAW JetDirect / SNMP',
            webUiLabel: 'HP Embedded Web Server',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 4. FABRICANTE: LEXMARK
    if (upper.includes('LEXMARK')) {
        let lxModel = combined.replace(/\s*Printer$/i, '').trim();
        const isColor = upper.includes('COLOR');
        return {
            manufacturer: 'Lexmark',
            model: lxModel,
            isColor,
            printTechnology: isColor ? 'Multifuncional Laser Colorida Corporativa' : 'Laser Monocromática Corporativa',
            protocol: 'RAW JetDirect / SNMP',
            webUiLabel: 'Lexmark Web Config',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 5. FABRICANTE: EPSON
    if (upper.includes('EPSON')) {
        return {
            manufacturer: 'Epson',
            model: combined.replace(/\s*Printer$/i, '').trim(),
            isColor: upper.includes('COLOR') || upper.includes('L3') || upper.includes('L4'),
            printTechnology: 'Tanque de Tinta / Jato de Tinta',
            protocol: 'RAW / SNMP',
            webUiLabel: 'EpsonNet Config',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 6. FABRICANTE: KYOCERA
    if (
        upper.includes('KYOCERA') ||
        upper.includes('ECOSYS') ||
        upper.includes('TASKALFA') ||
        upper.includes('MA5500') ||
        upper.includes('MA4500') ||
        upper.includes('FS-') ||
        upper.includes('M2040') ||
        upper.includes('M2540') ||
        upper.includes('P3155')
    ) {
        let kyoModel = 'Kyocera ECOSYS';
        if (upper.includes('MA5500')) {
            kyoModel = 'Kyocera ECOSYS MA5500ifx';
        } else if (upper.includes('MA4500')) {
            kyoModel = 'Kyocera ECOSYS MA4500ix';
        } else if (upper.includes('TASKALFA')) {
            const m = combined.match(/TASKalfa\s+([A-Za-z0-9\-]+)/i);
            kyoModel = m ? `Kyocera TASKalfa ${m[1].toUpperCase()}` : 'Kyocera TASKalfa';
        } else if (upper.includes('ECOSYS')) {
            const m = combined.match(/ECOSYS\s+([A-Za-z0-9\-]+)/i);
            kyoModel = m ? `Kyocera ECOSYS ${m[1].toUpperCase()}` : 'Kyocera ECOSYS';
        } else if (upper.includes('FS-')) {
            const m = combined.match(/FS-([A-Za-z0-9]+)/i);
            kyoModel = m ? `Kyocera FS-${m[1].toUpperCase()}` : 'Kyocera FS-Series';
        } else {
            const m = combined.match(/Kyocera\s+([A-Za-z0-9\-]+)/i);
            kyoModel = m ? `Kyocera ${m[1].toUpperCase()}` : 'Kyocera Corporativa';
        }

        const isColor = upper.includes('COLOR') || upper.includes('CI') || upper.includes('CDW') || upper.includes('MA4000CI') || upper.includes('MA3500CI');
        return {
            manufacturer: 'Kyocera',
            model: kyoModel,
            isColor,
            printTechnology: isColor 
                ? 'Multifuncional Laser Colorida Corporativa (Kyocera)' 
                : 'Multifuncional Laser Monocromática Corporativa de Alta Velocidade (Kyocera)',
            protocol: 'KPDL / PRESCRIBE / RAW (Porta 9100) / SNMP v2c',
            webUiLabel: 'Kyocera Command Center RX',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 7. FABRICANTE: SAMSUNG COLORIDA (A3 MultiXpress & A4 ProXpress Colorida)
    const isColorSamsung = (
        upper.includes('X4300') ||
        upper.includes('X4250') ||
        upper.includes('X4220') ||
        serial === '07NXBJLJ10002GD' ||
        ip === '192.168.0.205'
    );
    if (isColorSamsung) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung MultiXpress X4300 Series',
            isColor: true,
            printTechnology: 'Multifuncional Laser Colorida Corporativa (A3)',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    const isC268Color = upper.includes('C268') || upper.includes('C262') || upper.includes('C2680');
    if (isC268Color) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung ProXpress C268x Series',
            isColor: true,
            printTechnology: 'Multifuncional Laser Colorida Corporativa (A4)',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    if (upper.includes('C4060') || upper.includes('C4010')) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung ProXpress C4060FX',
            isColor: true,
            printTechnology: 'Multifuncional Laser Colorida Corporativa',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 8. FABRICANTE: SAMSUNG MONO MULTIFUNCIONAL / IMPRESSORA
    if (upper.includes('ML-4550') || upper.includes('ML4550') || upper.includes('ML-455') || upper.includes('ML 4550')) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung ML-4550 Series',
            isColor: false,
            printTechnology: 'Impressora Laser Monocromática Corporativa de Alto Rendimento',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    const isM408 = upper.includes('M408') || upper.includes('M4080') || upper.includes('4080') || (serial && (serial.startsWith('088WB') || serial.startsWith('088ZB')));
    if (isM408) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung MultiXpress M4080FX',
            isColor: false,
            printTechnology: 'Multifuncional Laser Monocromática Corporativa',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    if (upper.includes('SCX-5835') || upper.includes('SCX-5935') || upper.includes('SCX-5835_5935X')) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung SCX-5835FN Series',
            isColor: false,
            printTechnology: 'Multifuncional Laser Monocromática Corporativa',
            protocol: 'RAW JetDirect / USB',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    if (upper.includes('M407') || upper.includes('M4070')) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung ProXpress M4070FR',
            isColor: false,
            printTechnology: 'Multifuncional Laser Monocromática Corporativa',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    if (upper.includes('M402') || upper.includes('M4020')) {
        return {
            manufacturer: 'Samsung',
            model: 'Samsung ProXpress M4020ND',
            isColor: false,
            printTechnology: 'Impressora Laser Monocromática Corporativa',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    if (upper.includes('SAMSUNG') || /^SEC[0-9A-F]{10,14}/i.test(nameStr) || /^SEC[0-9A-F]{10,14}/i.test(modelStr)) {
        const sectorWords = ['OPERAÇÃO', 'OPERACAO', 'OPERA', 'ADM', 'ADMINISTRATIVO', 'EXPEDIÇÃO', 'EXPEDICAO', 'COLETA', 'ENTREGA', 'SETOR', 'FATURAMENTO', 'FINANCEIRO', 'DIRETORIA', 'RH', 'PORTARIA', 'ALMOXARIFADO'];
        const match = combined.match(/Samsung\s+([A-Za-z0-9\-]+(?:\s+Series)?)/i);
        const matchedWord = match ? match[1].toUpperCase().replace(/\s+SERIES$/i, '').trim() : '';
        const isValidModelMatch = match && !sectorWords.includes(matchedWord);

        return {
            manufacturer: 'Samsung',
            model: isValidModelMatch ? match[0] : (!isGenericModel ? modelStr : 'Samsung MultiXpress / ProXpress'),
            isColor: upper.includes('COLOR') || upper.includes('CLP') || upper.includes('CLX'),
            printTechnology: 'Laser Monocromática Corporativa',
            protocol: 'SNMP v2c (Porta 161) / RAW JetDirect (Porta 9100)',
            webUiLabel: 'SyncThru Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 8. DISPOSITIVO CORPORATIVO NÃO-SAMSUNG COM MODELO ESPECÍFICO
    if (!isGenericModel) {
        return {
            manufacturer: 'Corporativo',
            model: modelStr,
            isColor: upper.includes('COLOR'),
            printTechnology: upper.includes('COLOR') ? 'Laser Colorida Corporativa' : 'Laser Monocromática Corporativa',
            protocol: 'RAW / SNMP',
            webUiLabel: 'Interface Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 9. EXTRAÇÃO LIMPA A PARTIR DO NOME (sem IP e sem 'Printer')
    let cleanFallback = nameStr
        .replace(/\s*\(\d{1,3}(?:\.\d{1,3}){3}\)/g, '')
        .replace(/\s*Printer$/i, '')
        .trim();

    if (cleanFallback && cleanFallback.toLowerCase() !== 'impressora' && !cleanFallback.toLowerCase().includes('samsung')) {
        return {
            manufacturer: 'Corporativo',
            model: cleanFallback,
            isColor: upper.includes('COLOR'),
            printTechnology: 'Impressora Corporativa',
            protocol: 'RAW / SNMP',
            webUiLabel: 'Interface Web',
            isThermal: false,
            isScanner: false,
            deviceCategory: 'PRINTER'
        };
    }

    // 10. FALLBACK GENÉRICO SEGURO (NUNCA ASSUME SAMSUNG)
    return {
        manufacturer: 'Corporativo',
        model: 'Impressora Corporativa',
        isColor: false,
        printTechnology: 'Impressora Corporativa',
        protocol: 'RAW / SNMP',
        webUiLabel: 'Interface Web',
        isThermal: false,
        isScanner: false,
        deviceCategory: 'PRINTER'
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        cleanPrinterName,
        resolvePrinterProfile
    };
}
