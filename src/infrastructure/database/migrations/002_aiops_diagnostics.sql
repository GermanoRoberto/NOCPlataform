-- Tabela de diagnósticos periciais AIOps estruturados e determinísticos
CREATE TABLE IF NOT EXISTS aiops_diagnostics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'link',
    status_apurado TEXT NOT NULL,
    violacao_sla INTEGER DEFAULT 0,
    metricas_analisadas TEXT,
    evidencias_literais TEXT,
    acao_recomendada TEXT,
    payload_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_aiops_diagnostics_host_id ON aiops_diagnostics(host_id);
CREATE INDEX IF NOT EXISTS idx_aiops_diagnostics_created_at ON aiops_diagnostics(created_at DESC);
