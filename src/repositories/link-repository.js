const db = require('../infrastructure/database/connection');
const logger = require('../core/logger');

class LinkRepository {
    async recordMetrics(link) {
        const sql = `
            INSERT INTO links_history (
                link_id, name, status, latency, packet_loss, jitter, traffic, bandwidth, bandwidth_used_pct
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return db.run(sql, [
            String(link.id), link.name || 'Link Desconhecido', link.status || 'online',
            link.latency !== null ? Number(link.latency) : null,
            link.packetLoss !== null ? Number(link.packetLoss) : null,
            link.jitter !== null ? Number(link.jitter) : null,
            link.traffic !== null ? Number(link.traffic) : null,
            link.bandwidth !== null ? Number(link.bandwidth) : null,
            link.bandwidthUsedPct !== null ? Number(link.bandwidthUsedPct) : null
        ]);
    }

    async getHistoryByLinkId(linkId, hours = 24) {
        const sql = `SELECT * FROM links_history WHERE link_id = ? AND datetime(timestamp) >= datetime('now', '-' || ? || ' hours') ORDER BY timestamp ASC`;
        return db.query(sql, [String(linkId), hours]);
    }

    async purgeOldMetrics(retentionDays = 90) {
        const sql = `DELETE FROM links_history WHERE datetime(timestamp) < datetime('now', '-' || ? || ' days')`;
        return db.run(sql, [retentionDays]);
    }
}

module.exports = new LinkRepository();
