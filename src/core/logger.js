const pino = require('pino');
const config = require('./config');

let destination;
try {
    const pretty = require('pino-pretty');
    destination = pretty({
        colorize: false,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname,env'
    });
} catch (e) {
    destination = undefined;
}

const logger = pino({
    level: config.isProduction ? 'info' : 'debug',
    base: { env: config.nodeEnv },
    timestamp: pino.stdTimeFunctions.isoTime
}, destination);

module.exports = logger;
