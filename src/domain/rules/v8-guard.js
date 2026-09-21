const { InfraProtectedError } = require('../../core/errors');
const logger = require('../../core/logger');

const PROTECTED_VENDORS = ['DRAYTEK', 'CISCO', 'MIKROTIK', 'FORTINET', 'HUAWEI'];
const PROTECTED_KEYWORDS = ['GATEWAY', 'ROUTER', 'ROTEADOR', 'SWITCH', 'CORE', 'LINK', 'CIRCUITO', 'INFRAESTRUTURA', 'FIREWALL', 'WAN'];
const PROTECTED_TYPES = ['ROUTER', 'SWITCH', 'GATEWAY', 'LINK', 'INFRASTRUCTURE', 'CORE_ROUTER'];

function isV8Protected(asset) {
    if (!asset) return false;
    if (asset.isV8Protected === true || asset.isProtected === true) return true;

    const nameUpper = String(asset.name || asset.hostname || asset.printer_name || '').toUpperCase();
    const modelUpper = String(asset.model || asset.modelo || '').toUpperCase();
    const typeUpper = String(asset.type || asset.tipo || '').toUpperCase();

    for (const vendor of PROTECTED_VENDORS) {
        if (nameUpper.includes(vendor) || modelUpper.includes(vendor)) return true;
    }
    for (const kw of PROTECTED_KEYWORDS) {
        if (nameUpper.includes(kw) || typeUpper.includes(kw)) return true;
    }
    if (PROTECTED_TYPES.includes(typeUpper)) return true;

    if (Array.isArray(asset.tags)) {
        const hasInfraTag = asset.tags.some(t => {
            const tag = String(t.tag || '').toLowerCase();
            const val = String(t.value || '').toLowerCase();
            return tag === 'tipo' && ['infra', 'link', 'router', 'gateway', 'switch'].includes(val) ||
                   tag === 'infraestrutura' || tag === 'v8';
        });
        if (hasInfraTag) return true;
    }
    return false;
}

function assertV8Compliance(asset, operation = 'DELETE') {
    if (isV8Protected(asset)) {
        const identifier = asset.name || asset.hostname || asset.id || 'Ativo Desconhecido';
        logger.warn({ event: 'V8_PROTECTION_TRIGGERED', identifier, asset, operation }, `[REGRA V8] Tentativa destrutiva bloqueada em: ${identifier}`);
        throw new InfraProtectedError(
            identifier,
            `Operação '${operation}' rejeitada. Roteadores (DrayTek), Switches (Cisco), Gateways e Circuitos WAN pertencem à infraestrutura imutável do NOC Camilo dos Santos.`
        );
    }
}

module.exports = { isV8Protected, assertV8Compliance, PROTECTED_VENDORS, PROTECTED_KEYWORDS };
