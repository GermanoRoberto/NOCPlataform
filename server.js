const path = require('path');
const app = require('./src/app');
const config = require('./src/core/config');
const logger = require('./src/core/logger');
const { runMigrations } = require('./src/infrastructure/database/migrate');
const telemetryService = require('./src/services/telemetry-service');
const ollamaClient = require('./src/infrastructure/ollama/ollama-client');
const db = require('./src/infrastructure/database/connection');

async function bootstrap() {
    try {
        logger.info('====================================================');
        logger.info('   NOC COMMAND CENTER - CAMILO DOS SANTOS (V2.0)    ');
        logger.info('   ARQUITETURA LIMPA, SEGURANCA OWASP & REGRA V8    ');
        logger.info('====================================================');

        await runMigrations();
        await ollamaClient.ensureService().catch(() => {});
        telemetryService.start();

        const server = app.listen(config.port, '0.0.0.0', () => {
            logger.info({ port: config.port, url: `http://localhost:${config.port}` }, 'Servidor NOC Enterprise pronto para conexoes.');
        });

        server.on('error', (err) => {
            logger.fatal({ err: err.message }, 'Falha ao iniciar escuta na porta HTTP');
            process.exit(1);
        });

        const shutdown = async (sig) => {
            logger.info({ signal: sig }, 'Iniciando graceful shutdown...');
            telemetryService.stop();
            server.close(async () => {
                await db.close();
                logger.info('Processo encerrado com segurança.');
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        const logFile = path.join(__dirname, 'data/process_exit.log');

        process.on('unhandledRejection', (reason) => {
            logger.error({ err: reason && reason.message ? reason.message : reason }, 'Unhandled Rejection no processo NOC (recuperado)');
            try { require('fs').appendFileSync(logFile, `[${new Date().toISOString()}] unhandledRejection: ${reason && reason.stack ? reason.stack : reason}\n`); } catch(e){}
        });

        process.on('uncaughtException', (err) => {
            logger.error({ err: err.message, stack: err.stack }, 'Uncaught Exception no processo NOC (recuperado)');
            try { require('fs').appendFileSync(logFile, `[${new Date().toISOString()}] uncaughtException: ${err.stack}\n`); } catch(e){}
        });

        process.on('exit', (code) => {
            try { require('fs').appendFileSync(logFile, `[${new Date().toISOString()}] Process exit with code: ${code}\n`); } catch(e){}
        });

        process.on('beforeExit', (code) => {
            try { require('fs').appendFileSync(logFile, `[${new Date().toISOString()}] Process beforeExit with code: ${code}\n`); } catch(e){}
        });

    } catch (err) {
        logger.fatal({ err }, 'Falha crítica no bootstrap do servidor NOC');
        process.exit(1);
    }
}

bootstrap();
