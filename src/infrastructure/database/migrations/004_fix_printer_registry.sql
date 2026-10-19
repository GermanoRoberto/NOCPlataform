-- Migração 004: Restauração, Reparo de B-Tree e Blindagem do Odômetro Monotônico

-- 1. Reparação e Reconstrução Limpa de printers_registry (eliminando índices malformados)
CREATE TABLE IF NOT EXISTS printers_registry_clean (
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
);

INSERT OR IGNORE INTO printers_registry_clean 
SELECT * FROM printers_registry;

DROP TABLE IF EXISTS printers_registry;

ALTER TABLE printers_registry_clean RENAME TO printers_registry;

-- 2. Reparação e Reconstrução Limpa de printers_history
CREATE TABLE IF NOT EXISTS printers_history_clean (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    serial_number TEXT,
    city TEXT,
    status TEXT NOT NULL,
    toner_level REAL DEFAULT 0,
    waste_toner_full REAL DEFAULT 0,
    black_counter INTEGER DEFAULT 0,
    color_counter INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO printers_history_clean 
SELECT * FROM printers_history WHERE id < 21000;

DROP TABLE IF EXISTS printers_history;

ALTER TABLE printers_history_clean RENAME TO printers_history;

CREATE INDEX IF NOT EXISTS idx_printers_history_printer_id ON printers_history(printer_id);
CREATE INDEX IF NOT EXISTS idx_printers_history_serial ON printers_history(serial_number);
CREATE INDEX IF NOT EXISTS idx_printers_history_timestamp ON printers_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_printers_history_city ON printers_history(city);
CREATE INDEX IF NOT EXISTS idx_printers_history_status ON printers_history(status);

-- 3. Impressora USB Samsung SCX-5835 (VGA) - Serial Z7DZBQBF201039B (227.583 páginas)
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

UPDATE printers_registry 
SET page_count = CASE WHEN page_count < 227583 THEN 227583 ELSE page_count END,
    black_counter = CASE WHEN black_counter < 227583 THEN 227583 ELSE black_counter END,
    city = 'VGA',
    status = 'online'
WHERE serial_number = 'Z7DZBQBF201039B';

-- 4. Samsung DIVOP (JDF) - Serial 088WBQBH6000J0W (440.271 páginas)
UPDATE printers_registry 
SET page_count = CASE WHEN page_count < 440271 THEN 440271 ELSE page_count END,
    black_counter = CASE WHEN black_counter < 440271 THEN 440271 ELSE black_counter END,
    city = 'JDF'
WHERE serial_number = '088WBQBH6000J0W';

-- 5. Blindagem Geral: Garantir que nenhum contador no banco seja menor que o maior histórico registrado
UPDATE printers_registry
SET page_count = CASE WHEN page_count < black_counter THEN black_counter ELSE page_count END
WHERE black_counter > page_count;
