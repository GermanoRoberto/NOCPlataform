const db = require('../infrastructure/database/connection');

class IncidentRepository {
    async createIncident(incident) {
        const sql = `INSERT INTO incidents_history (asset_id, asset_type, name, down_at, status, notes) VALUES (?, ?, ?, ?, ?, ?)`;
        const res = await db.run(sql, [
            String(incident.assetId), incident.assetType || 'link', incident.name,
            incident.downAt || new Date().toISOString(), 'active', incident.notes || null
        ]);
        return res.lastID;
    }

    async getActiveIncident(assetId) {
        return db.get(`SELECT * FROM incidents_history WHERE asset_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`, [String(assetId)]);
    }

    async resolveIncident(id, upAt, durationMs, durationText) {
        const sql = `UPDATE incidents_history SET status = 'resolved', up_at = ?, resolved_at = ?, duration_ms = ?, duration_text = ? WHERE id = ?`;
        return db.run(sql, [upAt, upAt, durationMs, durationText, id]);
    }

    async resolveActiveIncidentsForAsset(assetId, upAt, durationMs, durationText) {
        const sql = `UPDATE incidents_history SET status = 'resolved', up_at = ?, resolved_at = ?, duration_ms = ?, duration_text = ? WHERE asset_id = ? AND status = 'active'`;
        return db.run(sql, [upAt, upAt, durationMs, durationText, String(assetId)]);
    }

    async reconcileOrphanedActiveIncidents() {
        // Localiza incidentes 'active' com mais de 30 minutos ou data discrepante e normaliza
        const activeRows = await db.query(`SELECT * FROM incidents_history WHERE status = 'active'`);
        const now = Date.now();
        for (const inc of (activeRows || [])) {
            const downTime = inc.down_at ? new Date(inc.down_at).getTime() : now;
            // Se o incidente foi aberto há mais de 30 minutos sem resolução, fechar como resolvido
            if (now - downTime > 30 * 60 * 1000) {
                const fallbackMs = (inc.duration_ms && inc.duration_ms > 0) ? inc.duration_ms : 120000;
                const estimatedUp = new Date(downTime + fallbackMs).toISOString();
                const totalSec = Math.floor(fallbackMs / 1000);
                const text = `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
                await db.run(
                    `UPDATE incidents_history SET status = 'resolved', up_at = ?, resolved_at = ?, duration_ms = ?, duration_text = ? WHERE id = ?`,
                    [estimatedUp, estimatedUp, fallbackMs, text, inc.id]
                );
            }
        }
    }

    async getRecentIncidents(limit = 50) {
        return db.query(`SELECT * FROM incidents_history ORDER BY down_at DESC LIMIT ?`, [limit]);
    }
}

module.exports = new IncidentRepository();
