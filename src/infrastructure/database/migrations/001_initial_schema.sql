PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS links_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    latency REAL DEFAULT 0,
    packet_loss REAL DEFAULT 0,
    jitter REAL DEFAULT 0,
    traffic REAL DEFAULT 0,
    bandwidth REAL DEFAULT 0,
    bandwidth_used_pct REAL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_links_history_link_id ON links_history(link_id);
CREATE INDEX IF NOT EXISTS idx_links_history_timestamp ON links_history(timestamp);

CREATE TABLE IF NOT EXISTS printers_history (
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

CREATE INDEX IF NOT EXISTS idx_printers_history_printer_id ON printers_history(printer_id);
CREATE INDEX IF NOT EXISTS idx_printers_history_serial ON printers_history(serial_number);
CREATE INDEX IF NOT EXISTS idx_printers_history_timestamp ON printers_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_printers_history_city ON printers_history(city);
CREATE INDEX IF NOT EXISTS idx_printers_history_status ON printers_history(status);

CREATE TABLE IF NOT EXISTS incidents_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'link',
    name TEXT NOT NULL,
    down_at DATETIME NOT NULL,
    up_at DATETIME,
    duration_ms INTEGER DEFAULT 0,
    duration_text TEXT,
    status TEXT NOT NULL DEFAULT 'resolved',
    resolved_at DATETIME,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_asset_id ON incidents_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_incidents_down_at ON incidents_history(down_at);

CREATE TABLE IF NOT EXISTS printer_exchanges (
    id TEXT PRIMARY KEY,
    printer_id TEXT NOT NULL,
    printer_name TEXT NOT NULL,
    serial_number TEXT,
    type TEXT NOT NULL,
    message TEXT,
    operator TEXT DEFAULT 'NOC Automático',
    counter_at_swap INTEGER DEFAULT 0,
    is_simulated INTEGER DEFAULT 0,
    notes TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operational_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    target_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
