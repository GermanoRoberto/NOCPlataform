const { AppError } = require('../../core/errors');
const logger = require('../../core/logger');

function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
        logger.warn({ statusCode: err.statusCode, message: err.message, url: req.originalUrl }, 'Erro operacional tratado');
        return res.status(err.statusCode).json({
            error: err.message,
            details: err.details
        });
    }

    logger.error({ err, url: req.originalUrl }, 'Erro não tratado no servidor');
    res.status(500).json({ error: 'Erro interno no servidor NOC' });
}

module.exports = errorHandler;
