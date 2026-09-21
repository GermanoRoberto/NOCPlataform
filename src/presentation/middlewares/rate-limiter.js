const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de requisições excedido. Tente novamente em breve.' }
});

const destructiveLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de mutação. Bloqueado temporariamente por segurança.' }
});

module.exports = { apiLimiter, destructiveLimiter };
