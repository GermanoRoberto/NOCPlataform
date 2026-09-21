const db = require('../../infrastructure/database/connection');

class ReportController {
    async getDevices(req, res) {
        try {
            const rows = await db.query("SELECT DISTINCT link_id, name FROM links_history ORDER BY name ASC");
            res.json(rows.map(r => ({ id: r.link_id, name: r.name })));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getSummary(req, res) {
        try {
            const { linkId, range } = req.query;
            let timeFilter = "datetime('now', '-24 hours')";
            if (range === '7d') timeFilter = "datetime('now', '-7 days')";
            if (range === '30d') timeFilter = "datetime('now', '-30 days')";

            let query = (linkId && linkId !== 'all')
                ? `SELECT COUNT(*) as total, SUM(CASE WHEN status != 'offline' THEN 1 ELSE 0 END) as online_count, AVG(latency) as avg_latency, MAX(packet_loss) as max_loss, MAX(traffic) as peak_traffic, AVG(bandwidth_used_pct) as avg_bandwidth_used FROM links_history WHERE link_id = ? AND timestamp >= ${timeFilter}`
                : `SELECT COUNT(*) as total, SUM(CASE WHEN status != 'offline' THEN 1 ELSE 0 END) as online_count, AVG(latency) as avg_latency, MAX(packet_loss) as max_loss, MAX(traffic) as peak_traffic, AVG(bandwidth_used_pct) as avg_bandwidth_used FROM links_history WHERE timestamp >= ${timeFilter}`;

            const params = (linkId && linkId !== 'all') ? [linkId] : [];
            const row = await db.get(query, params) || {};
            const total = row.total || 0;
            const onlineCount = row.online_count || 0;
            const uptime = total > 0 ? ((onlineCount / total) * 100).toFixed(2) : '100.00';

            const incidentsQuery = `SELECT datetime(down_at, 'localtime') as down_at, datetime(up_at, 'localtime') as up_at, duration_text, status, name FROM incidents_history WHERE datetime(down_at) >= ${timeFilter} ORDER BY down_at DESC`;
            const incidents = await db.query(incidentsQuery, []);

            res.json({
                uptime: Number(uptime),
                avgLatency: row.avg_latency ? Math.round(row.avg_latency) : 0,
                maxLoss: row.max_loss !== null ? Number(Number(row.max_loss).toFixed(1)) : 0,
                peakTraffic: row.peak_traffic !== null ? Number(Number(row.peak_traffic).toFixed(1)) : 0,
                avgBandwidthUsed: row.avg_bandwidth_used ? Number(Number(row.avg_bandwidth_used).toFixed(1)) : 0,
                incidents: incidents || []
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getTrend(req, res) {
        try {
            const { linkId, range, limit } = req.query;
            if (limit && linkId) {
                const query = `SELECT * FROM (SELECT latency, packet_loss, jitter, traffic, bandwidth_used_pct, datetime(timestamp, 'localtime') as timestamp FROM links_history WHERE link_id = ? ORDER BY id DESC LIMIT ?) ORDER BY timestamp ASC`;
                const rows = await db.query(query, [linkId, Number(limit)]);
                return res.json(rows.map(r => ({
                    time: r.timestamp ? r.timestamp.split(' ')[1] || r.timestamp : '',
                    latency: r.latency !== null ? Math.round(r.latency) : 0,
                    packetLoss: r.packet_loss !== null ? Number(Number(r.packet_loss).toFixed(1)) : 0,
                    traffic: r.traffic !== null ? Number(Number(r.traffic).toFixed(1)) : 0
                })));
            }

            let timeFilter = "datetime('now', '-24 hours')";
            let groupInterval = "%Y-%m-%d %H:00:00";
            if (range === '7d') timeFilter = "datetime('now', '-7 days')";
            if (range === '30d') { timeFilter = "datetime('now', '-30 days')"; groupInterval = "%Y-%m-%d 00:00:00"; }

            const query = `SELECT strftime('${groupInterval}', datetime(timestamp, 'localtime')) as group_time, AVG(latency) as latency, AVG(packet_loss) as packet_loss, SUM(traffic) as traffic, AVG(bandwidth_used_pct) as bandwidth_used_pct FROM links_history WHERE timestamp >= ${timeFilter} GROUP BY group_time ORDER BY group_time ASC`;
            const rows = await db.query(query);
            res.json(rows.map(r => ({
                time: r.group_time || '',
                latency: r.latency !== null ? Math.round(r.latency) : 0,
                packetLoss: r.packet_loss !== null ? Number(Number(r.packet_loss).toFixed(1)) : 0,
                traffic: r.traffic !== null ? Number(Number(r.traffic).toFixed(1)) : 0
            })));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new ReportController();
