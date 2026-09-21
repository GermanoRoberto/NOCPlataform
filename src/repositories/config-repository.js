const db = require('../infrastructure/database/connection');
const logger = require('../core/logger');

class ConfigRepository {
    async getSettings() {
        const row = await db.get('SELECT value FROM operational_config WHERE key = ?', ['general_settings']);
        if (!row || !row.value) return {};
        try {
            return JSON.parse(row.value);
        } catch (e) {
            return {};
        }
    }

    async saveSettings(settings) {
        const cleanSettings = { ...settings };
        delete cleanSettings.zabbixToken;
        delete cleanSettings.telegramToken;
        delete cleanSettings.telegramBotToken;
        delete cleanSettings.auth;

        const val = JSON.stringify(cleanSettings);
        await db.run(
            `INSERT INTO operational_config (key, value, updated_at) VALUES ('general_settings', ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
            [val]
        );
        return cleanSettings;
    }
}

module.exports = new ConfigRepository();
