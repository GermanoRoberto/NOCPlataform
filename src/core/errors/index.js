class AppError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class InfraProtectedError extends AppError {
    constructor(deviceName, reason = 'Ativo classificado como INFRAESTRUTURA CRÍTICA (Regra V8). Deleção e mutações destrutivas são proibidas no núcleo do sistema.') {
        super(`[REGRA V8 - INFRA PROTEGIDA] ${deviceName}: ${reason}`, 403, { deviceName, rule: 'V8_IMMUTABILITY' });
    }
}

class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400, details);
    }
}

module.exports = { AppError, InfraProtectedError, ValidationError };
