const { isV8Protected } = require('../../domain/rules/v8-guard');
const logger = require('../../core/logger');

function v8ProtectionMiddleware(req, res, next) {
    const candidate = req.body || {};
    const method = req.method;

    if (['DELETE', 'POST', 'PUT', 'PATCH'].includes(method)) {
        if (isV8Protected(candidate)) {
            const name = candidate.name || candidate.hostname || candidate.id || 'Ativo Protegido';
            logger.warn({ ip: req.ip, candidate }, `[HTTP V8 GUARD] Bloqueada requisição para ${req.originalUrl}`);
            return res.status(403).json({
                error: `[REGRA V8 - INFRA PROTEGIDA] ${name}: Roteadores (DrayTek), Switches (Cisco), Gateways e Circuitos WAN pertencem à infraestrutura imutável do NOC Camilo dos Santos. Operações destrutivas são permanentemente bloqueadas.`
            });
        }
    }
    next();
}

module.exports = v8ProtectionMiddleware;
