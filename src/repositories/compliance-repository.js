const db = require('../infrastructure/database/connection');

class ComplianceRepository {
    async ensureTable() {
        await db.run(`
            CREATE TABLE IF NOT EXISTS software_compliance_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                pattern TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('ALLOWED', 'FORBIDDEN', 'REVIEW')),
                severity TEXT NOT NULL DEFAULT 'HIGH' CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'INFO')),
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.run(`
            CREATE TABLE IF NOT EXISTS uninstalled_software_tombstones (
                id TEXT PRIMARY KEY,
                host_id TEXT NOT NULL,
                software_name TEXT NOT NULL,
                uninstalled_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.run(`
            CREATE TABLE IF NOT EXISTS software_remediation_queue (
                id TEXT PRIMARY KEY,
                host_id TEXT NOT NULL,
                host_name TEXT,
                software_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
                attempts INTEGER DEFAULT 0,
                last_error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async enqueueRemediation(hostId, softwareName, hostName = '') {
        await this.ensureTable();
        const id = `${hostId}-${(softwareName || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        await db.run(`
            INSERT INTO software_remediation_queue (id, host_id, host_name, software_name, status, attempts, updated_at)
            VALUES (?, ?, ?, ?, 'PENDING', 0, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                status = 'PENDING',
                host_name = coalesce(excluded.host_name, software_remediation_queue.host_name),
                updated_at = CURRENT_TIMESTAMP
        `, [id, String(hostId), hostName, softwareName.trim()]);
    }

    async getPendingRemediations() {
        await this.ensureTable();
        return db.query(`
            SELECT id, host_id, host_name, software_name, attempts, last_error
            FROM software_remediation_queue
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
        `);
    }

    async updateRemediationStatus(id, status, errorMsg = null) {
        await this.ensureTable();
        await db.run(`
            UPDATE software_remediation_queue
            SET status = ?,
                attempts = attempts + 1,
                last_error = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [status, errorMsg, id]);
    }

    async addUninstalledSoftware(hostId, softwareName) {
        await this.ensureTable();
        const id = `${hostId}-${(softwareName || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        await db.run(`
            INSERT OR REPLACE INTO uninstalled_software_tombstones (id, host_id, software_name, uninstalled_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, [id, String(hostId), softwareName.trim()]);
    }

    async getActiveUninstalledSoftwares() {
        await this.ensureTable();
        // Manter a exclusão ativa por 3 horas após a desinstalação (superando o ciclo de 1h do Zabbix)
        return db.query(`
            SELECT host_id, software_name, uninstalled_at 
            FROM uninstalled_software_tombstones
            WHERE uninstalled_at >= datetime('now', '-3 hours')
        `);
    }

    async getAllRules() {
        await this.ensureTable();
        // FORBIDDEN tem prioridade absoluta sobre REVIEW e ALLOWED
        return db.query(`
            SELECT * FROM software_compliance_rules 
            ORDER BY 
                CASE status 
                    WHEN 'FORBIDDEN' THEN 1 
                    WHEN 'REVIEW' THEN 2 
                    WHEN 'ALLOWED' THEN 3 
                    ELSE 4 
                END ASC,
                updated_at DESC,
                name ASC
        `);
    }

    async getRuleById(id) {
        await this.ensureTable();
        return db.get(`SELECT * FROM software_compliance_rules WHERE id = ?`, [id]);
    }

    async upsertRule(rule) {
        await this.ensureTable();
        const id = rule.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const sql = `
            INSERT INTO software_compliance_rules (id, name, pattern, category, status, severity, reason, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                pattern = excluded.pattern,
                category = excluded.category,
                status = excluded.status,
                severity = excluded.severity,
                reason = excluded.reason,
                updated_at = CURRENT_TIMESTAMP
        `;
        await db.run(sql, [
            id,
            rule.name,
            rule.pattern,
            rule.category || 'Geral',
            rule.status || 'REVIEW',
            rule.severity || 'HIGH',
            rule.reason || ''
        ]);
        return this.getRuleById(id);
    }

    async deleteRule(id) {
        await this.ensureTable();
        return db.run(`DELETE FROM software_compliance_rules WHERE id = ?`, [id]);
    }
}

module.exports = new ComplianceRepository();
