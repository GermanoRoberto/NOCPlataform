const fs = require('fs');
const path = require('path');
const db = require('./connection');
const logger = require('../../core/logger');

async function runMigrations() {
    try {
        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        for (const file of files) {
            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf8');
            await db.exec(sql);
        }

        const existingConfig = await db.get('SELECT key FROM operational_config WHERE key = ?', ['general_settings']);
        if (!existingConfig) {
            let legacySettings = {};
            const legacyPath = 'E:/NOC/settings.json';
            if (fs.existsSync(legacyPath)) {
                try { legacySettings = JSON.parse(fs.readFileSync(legacyPath, 'utf8')); } catch (e) {}
            }

            const cleanOperationalSettings = {
                thresholds: legacySettings.thresholds || { toner: 15, latency: 100, packetLoss: 5, jitter: 15, cpu: 85, ram: 90, disk: 90 },
                regioes: legacySettings.regioes || [],
                unidades: legacySettings.unidades || [],
                circuitos: legacySettings.circuitos || [],
                gateways: legacySettings.gateways || [],
                operadores: legacySettings.operadores || [],
                mapeamentos_zabbix: legacySettings.mapeamentos_zabbix || [],
                parametros_globais: legacySettings.parametros_globais || { refresh_intervalo_seg: 10, fuso_horario: 'America/Sao_Paulo', retencao_historico_dias: 90 }
            };

            await db.run(
                'INSERT INTO operational_config (key, value) VALUES (?, ?)',
                ['general_settings', JSON.stringify(cleanOperationalSettings)]
            );
        }
        logger.info('Setup e migracoes do banco concluidos.');
    } catch (err) {
        logger.fatal({ err }, 'Erro fatal ao rodar migrações');
        throw err;
    }
}

module.exports = { runMigrations };
