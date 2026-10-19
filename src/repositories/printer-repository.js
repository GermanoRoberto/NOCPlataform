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
        const { toBranchCode } = require('../domain/rules/branch-resolver');
        const rows = await db.query(`SELECT * FROM printers_registry ORDER BY black_counter DESC`);
        return rows.map(r => ({
            ...r,
            city: toBranchCode(r.city) || 'Sem Unidade'
        }));
    }

    async upsertRegistry(p) {
        await this.ensureRegistryTable();
        const { toBranchCode } = require('../domain/rules/branch-resolver');
        const cleanCity = toBranchCode(p.city) || 'Sem Unidade';
        if (p.city) p.city = cleanCity;
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
                page_count = CASE 
                    WHEN excluded.page_count > printers_registry.page_count THEN excluded.page_count 
                    ELSE printers_registry.page_count 
                END,
                black_counter = CASE 
                    WHEN excluded.black_counter > printers_registry.black_counter THEN excluded.black_counter 
                    ELSE printers_registry.black_counter 
                END,
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
            cleanCity,
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

    async cleanOrphanAndVirtualPrinters() {
        await this.ensureRegistryTable();
        
        // 1. Purgar drivers virtuais, drivers de spooler e filas PnP
        await db.run(`
            DELETE FROM printers_registry 
            WHERE lower(name) LIKE '%microsoft ipp%'
               OR lower(name) LIKE '%generic / text%'
               OR lower(name) LIKE '%generic text%'
               OR lower(name) LIKE '%universal scan driver%'
               OR lower(name) LIKE '%scan driver%'
               OR lower(name) LIKE '%twain%'
               OR lower(name) LIKE '%universal print driver%'
               OR lower(name) LIKE '%class driver%'
               OR lower(name) LIKE '%bi-di class driver%'
               OR lower(name) LIKE '%pcl6 class driver%'
               OR lower(model) LIKE '%microsoft ipp%'
               OR lower(model) LIKE '%generic / text%'
               OR lower(model) LIKE '%universal scan driver%'
               OR lower(model) LIKE '%universal print driver%'
               OR lower(model) LIKE '%class driver%'
               OR lower(model) LIKE '%bi-di class driver%'
               OR lower(model) LIKE '%pcl6 class driver%'
               OR serial_number IN ('RQCY3062VZH', 'R9QR600YTZR', 'R9QL400ET1V', 'RQCXA0366GD')
        `);

        // 2. Purgar falsos scanners gerados pela interface WIA da Samsung de rede
        await db.run(`
            DELETE FROM printers_registry
            WHERE id LIKE 'scanner-usb-%-sec%'
               OR (lower(name) LIKE 'sec%' AND lower(raw_payload) LIKE '%"devicecategory":"scanner"%' AND (page_count = 0 OR page_count IS NULL))
        `);

        // 3. Purgar filas de etiquetas desligadas/desconectadas com 0 paginas
        await db.run(`
            DELETE FROM printers_registry
            WHERE (id LIKE '%-etiquetas%' OR id LIKE '%-zdesigner%')
               AND (page_count = 0 OR page_count IS NULL)
               AND (ip = '--' OR ip LIKE 'USB (LPT%' OR status = 'offline' OR serial_number = 'Sem resposta (Desligada)')
        `);

        // 4. Purgar filas WSD duplicadas e duplicatas errôneas de rede
        await db.run(`
            DELETE FROM printers_registry
            WHERE id LIKE 'printer-wsd-%-sec30cda7651a2b'
               OR id LIKE 'printer-wsd-%-sec8425191b5e58'
               OR id LIKE 'scanner-usb-%-sec30cda7651a2b'
               OR id = 'printer-ip-192-168-2-42'
               OR (id = 'printer-sn-088WBQBH70000AD' AND city = 'VRE')
        `);

        // 5. Corrigir nomes e modelos das Kyoceras em SPO
        await db.run(`
            UPDATE printers_registry 
            SET name = 'Kyocera MA5500ifx (192.168.4.239)', 
                model = 'Kyocera ECOSYS MA5500ifx',
                serial_number = 'Não identificado'
            WHERE id = 'printer-ip-192-168-4-239'
        `);

        await db.run(`
            UPDATE printers_registry 
            SET name = 'Kyocera MA5500ifx (192.168.4.228)', 
                model = 'Kyocera ECOSYS MA5500ifx',
                serial_number = 'Não identificado'
            WHERE id = 'printer-ip-192-168-4-228'
        `);

        // 6. Limpar seriais com sufixos artificiais ou contaminados
        await db.run(`
            UPDATE printers_registry 
            SET serial_number = 'Não identificado'
            WHERE serial_number IN (
                '088WBQAJ4000VRE', 
                '088WBQBH7000SPO', 
                '088WB07K4528VGA', 
                '088WBQAJ7000RIO', 
                '088WBQAJ3000NOV',
                'KYO5500IFX00239',
                'KYO5500IFX00228',
                'EPSON-DS790-CPQ'
            )
        `);

        // 7. Corrigir Brother DCP-L1632W LAN
        await db.run(`
            UPDATE printers_registry
            SET model = 'Brother DCP-L1632W',
                name = 'Brother DCP-L1632W LAN',
                serial_number = 'Não identificado'
            WHERE id LIKE '%brother-dcp-l1632w%'
        `);

        // 8. Corrigir modelo de Samsung Tec Seg Trabalho
        await db.run(`
            UPDATE printers_registry
            SET model = 'Samsung MultiXpress M4080FX',
                name = 'Samsung Tec Seg Trabalho (192.168.4.237)'
            WHERE id = 'printer-ip-192-168-4-237'
        `);

        // 9. Purgar seriais espúrios gerados por ruído SNMP (ex: lSamsung, bSamsung, 6Brother)
        await db.run(`
            DELETE FROM printers_registry
            WHERE lower(serial_number) LIKE '%samsung%'
               OR lower(serial_number) LIKE '%brother%'
               OR lower(serial_number) LIKE '%kyocera%'
               OR lower(id) LIKE '%samsung%'
               OR lower(id) LIKE '%brother%'
        `);

        // 9.1 Purgar impressoras de rede físicas inativas ou desconectadas com 0 páginas
        await db.run(`
            DELETE FROM printers_registry
            WHERE (page_count = 0 OR page_count IS NULL)
              AND ip IS NOT NULL
              AND ip != '--'
              AND ip NOT LIKE 'USB%'
        `);

        // 9.1b Purgar IP fantasma 192.168.2.42 duplicado com 192.168.2.242
        await db.run(`DELETE FROM printers_registry WHERE ip = '192.168.2.42' OR id = 'printer-ip-192-168-2-42'`);

        // 9.2 Normalizar filiais das impressoras de rede baseado estritamente na sub-rede física da empresa
        await db.run(`UPDATE printers_registry SET city = 'JDF' WHERE ip LIKE '192.168.0.%'`);
        await db.run(`UPDATE printers_registry SET city = 'MTZ' WHERE ip LIKE '192.168.100.%' OR ip LIKE '192.168.101.%'`);
        await db.run(`UPDATE printers_registry SET city = 'PTR' WHERE ip LIKE '192.168.1.%'`);
        await db.run(`UPDATE printers_registry SET city = 'RIO' WHERE ip LIKE '192.168.2.%'`);
        await db.run(`UPDATE printers_registry SET city = 'BHZ' WHERE ip LIKE '192.168.3.%' OR ip LIKE '192.168.18.%'`);
        await db.run(`UPDATE printers_registry SET city = 'SPO' WHERE ip LIKE '192.168.4.%'`);
        await db.run(`UPDATE printers_registry SET city = 'CPQ' WHERE ip LIKE '192.168.5.%'`);
        await db.run(`UPDATE printers_registry SET city = 'VRE' WHERE ip LIKE '192.168.6.%' OR ip LIKE '192.168.12.%'`);
        await db.run(`UPDATE printers_registry SET city = 'PPY' WHERE ip LIKE '192.168.8.%'`);
        await db.run(`UPDATE printers_registry SET city = 'VIX' WHERE ip LIKE '192.168.9.%'`);
        await db.run(`UPDATE printers_registry SET city = 'UDI' WHERE ip LIKE '192.168.13.%' OR ip LIKE '192.168.14.%'`);

        // 9.3 Purgar filas fantasmas sem serial e com odômetro zerado
        await db.run(`
            DELETE FROM printers_registry
            WHERE (serial_number IS NULL OR lower(trim(serial_number)) IN ('não identificado', 'nao identificado', 'sem resposta (desligada)', 'n/d', ''))
              AND (page_count = 0 OR page_count IS NULL)
              AND (black_counter = 0 OR black_counter IS NULL)
              AND NOT (lower(name) LIKE '%ds-790%' OR lower(model) LIKE '%ds-790%' OR lower(raw_payload) LIKE '%"devicecategory":"scanner"%')
        `);

        // 10. Deduplicar registros com o mesmo número de série real (mantendo o registro canônico com maior odômetro)
        const rows = await db.query(`
            SELECT id, serial_number, page_count, black_counter 
            FROM printers_registry 
            WHERE serial_number IS NOT NULL 
              AND lower(trim(serial_number)) NOT IN ('não identificado', 'nao identificado', 'sem resposta (desligada)', 'n/d', '')
        `);

        const bySn = new Map();
        for (const r of rows) {
            const sn = r.serial_number.trim().toUpperCase();
            if (!bySn.has(sn)) {
                bySn.set(sn, [r]);
            } else {
                bySn.get(sn).push(r);
            }
        }

        for (const [sn, list] of bySn.entries()) {
            if (list.length > 1) {
                list.sort((a, b) => {
                    const aCount = Math.max(a.page_count || 0, a.black_counter || 0);
                    const bCount = Math.max(b.page_count || 0, b.black_counter || 0);
                    if (bCount !== aCount) return bCount - aCount;
                    const aIsCanon = String(a.id).startsWith('printer-sn-') ? 1 : 0;
                    const bIsCanon = String(b.id).startsWith('printer-sn-') ? 1 : 0;
                    return bIsCanon - aIsCanon;
                });
                const duplicates = list.slice(1);
                for (const d of duplicates) {
                    await db.run(`DELETE FROM printers_registry WHERE id = ?`, [d.id]);
                }
            }
        }

        // 11. Corrigir impressoras com 'Sem Unidade' e associar seriais identificados
        await db.run(`
            UPDATE printers_registry
            SET city = 'PTR'
            WHERE (city IS NULL OR city = 'Sem Unidade' OR trim(city) = '')
              AND (ip LIKE '192.168.1.%' OR name LIKE '%PTR%')
        `);

        await db.run(`
            UPDATE printers_registry
            SET serial_number = '088WBQBH70002EA',
                model = 'Samsung MultiXpress M4080FX'
            WHERE id = 'printer-ip-192-168-4-229'
              AND (serial_number IS NULL OR serial_number = 'Não identificado')
        `);

        // 12. Blindagem e Restauração de Odômetros Físicos Legítimos (Regra Monotônica Absoluta)
        // SCX-5835 (VGA) - Serial Z7DZBQBF201039B (227.583 páginas)
        await db.run(`
            INSERT INTO printers_registry (
                id, name, model, serial_number, ip, city, status, toner_level, waste_toner_full, page_count, black_counter, color_counter, health_score, last_seen_at
            ) VALUES (
                'printer-sn-Z7DZBQBF201039B', 'Samsung SCX-5835_5935X Series (USB007)', 'Samsung SCX-5835FN Series', 'Z7DZBQBF201039B', 'USB (USB007)', 'VGA', 'online', NULL, 0, 227583, 227583, 0, 90, CURRENT_TIMESTAMP
            )
            ON CONFLICT(id) DO UPDATE SET
                page_count = CASE WHEN printers_registry.page_count < 227583 THEN 227583 ELSE printers_registry.page_count END,
                black_counter = CASE WHEN printers_registry.black_counter < 227583 THEN 227583 ELSE printers_registry.black_counter END,
                city = 'VGA',
                status = 'online';
        `);

        await db.run(`
            UPDATE printers_registry 
            SET page_count = CASE WHEN page_count < 227583 THEN 227583 ELSE page_count END,
                black_counter = CASE WHEN black_counter < 227583 THEN 227583 ELSE black_counter END,
                city = 'VGA',
                status = 'online'
            WHERE serial_number = 'Z7DZBQBF201039B';
        `);

        // Samsung DIVOP (JDF) - Serial 088WBQBH6000J0W (440.271 páginas)
        await db.run(`
            UPDATE printers_registry 
            SET page_count = CASE WHEN page_count < 440271 THEN 440271 ELSE page_count END,
                black_counter = CASE WHEN black_counter < 440271 THEN 440271 ELSE black_counter END,
                city = 'JDF'
            WHERE serial_number = '088WBQBH6000J0W';
        `);
    }
}

module.exports = new PrinterRepository();
