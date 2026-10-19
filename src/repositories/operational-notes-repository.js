const db = require('../infrastructure/database/connection');
const logger = require('../core/logger');

class OperationalNotesRepository {
    async getAllNotes() {
        try {
            const rows = await db.query('SELECT link_name, note, updated_at FROM operational_notes');
            const map = {};
            for (const r of (rows || [])) {
                map[r.link_name] = {
                    note: r.note,
                    updatedAt: r.updated_at
                };
            }
            return map;
        } catch (err) {
            logger.error({ error: err.message }, 'Falha ao buscar notas operacionais no SQLite');
            return {};
        }
    }

    async getNote(linkName) {
        try {
            return await db.get('SELECT link_name, note, updated_at FROM operational_notes WHERE link_name = ?', [String(linkName)]);
        } catch (err) {
            logger.error({ error: err.message, linkName }, 'Falha ao buscar nota operacional');
            return null;
        }
    }

    async setNote(linkName, note) {
        try {
            const cleanName = String(linkName || '').trim();
            const cleanNote = String(note || '').trim();
            if (!cleanName) return null;

            if (!cleanNote) {
                // Se a nota estiver vazia, remove o registro
                await db.run('DELETE FROM operational_notes WHERE link_name = ?', [cleanName]);
                logger.info({ linkName: cleanName }, 'Nota operacional removida.');
                return { linkName: cleanName, note: null };
            }

            await db.run(`
                INSERT INTO operational_notes (link_name, note, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(link_name) DO UPDATE SET
                    note = excluded.note,
                    updated_at = CURRENT_TIMESTAMP
            `, [cleanName, cleanNote]);

            logger.info({ linkName: cleanName, note: cleanNote }, 'Nota operacional salva com sucesso.');
            return { linkName: cleanName, note: cleanNote };
        } catch (err) {
            logger.error({ error: err.message, linkName, note }, 'Falha ao salvar nota operacional');
            throw err;
        }
    }

    async deleteNote(linkName) {
        try {
            await db.run('DELETE FROM operational_notes WHERE link_name = ?', [String(linkName).trim()]);
            return true;
        } catch (err) {
            logger.error({ error: err.message, linkName }, 'Falha ao deletar nota operacional');
            return false;
        }
    }
}

module.exports = new OperationalNotesRepository();
