const db = require('../infrastructure/database/connection');

class PrinterRepository {
    async ensureRegistryTable() {
        return db.run(`
            CREATE TABLE IF NOT EXISTS printers_registry (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                model TEXT,
                serial_number TEXT,
                ip TEXT,
                city TEXT,
                status TEXT,
                toner_level REAL,
                waste_toner_full INTEGER DEFAULT 0,
                page_count INTEGER DEFAULT 0,
                black_counter INTEGER DEFAULT 0,
                color_counter INTEGER DEFAULT 0,
                health_score INTEGER DEFAULT 90,
                last_seen_at TEXT,
                raw_payload TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async getAllFromRegistry() {
        await this.ensureRegistryTable();
        return db.query(`SELECT * FROM printers_registry ORDER BY black_counter DESC`);
    }

    async upsertRegistry(p) {
        await this.ensureRegistryTable();
        const sql = `
            INSERT INTO printers_registry (
                id, name, model, serial_number, ip, city, status, toner_level,
                waste_toner_full, page_count, black_counter, color_counter, health_score, last_seen_at, raw_payload, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                model = CASE 
                    WHEN excluded.model IS NOT NULL AND excluded.model NOT IN ('Impressora', 'Impressora Samsung', 'Impressora Corporativa', 'N/D', '--') 
                    THEN excluded.model 
                    WHEN printers_registry.model IS NOT NULL AND printers_registry.model NOT IN ('Impressora', 'Impressora Samsung', 'Impressora Corporativa', 'N/D', '--')
                    THEN printers_registry.model
                    ELSE excluded.model 
                END,
                serial_number = CASE 
                    WHEN excluded.serial_number IS NOT NULL AND excluded.serial_number NOT IN ('Não identificado', 'Sem resposta (Desligada)', 'N/D') 
                    THEN excluded.serial_number 
                    ELSE printers_registry.serial_number 
                END,
                ip = CASE WHEN excluded.ip IS NOT NULL AND excluded.ip != '--' THEN excluded.ip ELSE printers_registry.ip END,
                city = CASE WHEN excluded.city IS NOT NULL AND excluded.city != 'Sem Unidade' THEN excluded.city ELSE printers_registry.city END,
                status = excluded.status,
                toner_level = COALESCE(excluded.toner_level, printers_registry.toner_level),
                waste_toner_full = excluded.waste_toner_full,
                page_count = CASE WHEN excluded.page_count > 0 THEN excluded.page_count ELSE printers_registry.page_count END,
                black_counter = CASE WHEN excluded.black_counter > 0 THEN excluded.black_counter ELSE printers_registry.black_counter END,
                color_counter = CASE WHEN excluded.color_counter >= 0 THEN excluded.color_counter ELSE printers_registry.color_counter END,
                health_score = excluded.health_score,
                last_seen_at = excluded.last_seen_at,
                raw_payload = excluded.raw_payload,
                updated_at = CURRENT_TIMESTAMP
        `;
        return db.run(sql, [
            String(p.id),
            p.name || 'Impressora Corporativa',
            p.model || p.name || 'Impressora Corporativa',
            p.serialNumber || p.sn || null,
            p.ip || '--',
            p.city || 'Sem Unidade',
            p.status || 'online',
            p.tonerLevel !== null && p.tonerLevel !== undefined ? Number(p.tonerLevel) : null,
            p.wasteTonerFull ? Number(p.wasteTonerFull) : 0,
            p.pageCount ? Number(p.pageCount) : 0,
            p.blackCounter ? Number(p.blackCounter) : 0,
            p.colorCounter ? Number(p.colorCounter) : 0,
            p.healthScore ? Number(p.healthScore) : 90,
            p.lastSeenAt || new Date().toISOString(),
            JSON.stringify(p)
        ]);
    }

    async recordMetrics(printer) {
        const sql = `
            INSERT INTO printers_history (
                printer_id, name, serial_number, city, status, toner_level, waste_toner_full, black_counter, color_counter
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return db.run(sql, [
            String(printer.id), printer.name || 'Impressora', printer.serialNumber || null,
            printer.city || null, printer.status || 'online',
            printer.tonerLevel !== null ? Number(printer.tonerLevel) : null,
            printer.wasteTonerFull !== null ? Number(printer.wasteTonerFull) : null,
            printer.blackCounter !== null ? Number(printer.blackCounter) : null,
            printer.colorCounter !== null ? Number(printer.colorCounter) : null
        ]);
    }

    async recordExchange(exchange) {
        const sql = `
            INSERT INTO printer_exchanges (
                id, printer_id, printer_name, serial_number, type, message, operator, counter_at_swap, is_simulated, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return db.run(sql, [
            exchange.id || `exch-${Date.now()}`, String(exchange.printerId),
            exchange.printerName, exchange.serialNumber || null, exchange.type || 'TONER_SWAP',
            exchange.message || 'Troca registrada', exchange.operator || 'Operador NOC',
            exchange.counterAtSwap || 0, exchange.isSimulated ? 1 : 0, exchange.notes || null
        ]);
    }

    async getExchanges(limit = 30) {
        return db.query(`SELECT * FROM printer_exchanges ORDER BY timestamp DESC LIMIT ?`, [limit]);
    }

    async purgeOldMetrics(retentionDays = 90) {
        return db.run(`DELETE FROM printers_history WHERE datetime(timestamp) < datetime('now', '-' || ? || ' days')`, [retentionDays]);
    }
}

module.exports = new PrinterRepository();
