const { ValidationError } = require('../../core/errors');

function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return next(new ValidationError('Dados da requisição inválidos', result.error.format()));
        }
        req.body = result.data;
        next();
    };
}

module.exports = { validateBody };
