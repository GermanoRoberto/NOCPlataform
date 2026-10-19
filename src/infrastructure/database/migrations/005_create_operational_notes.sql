-- Migração 005: Tabela de Notas Operacionais e Histórico de Anotações Técnicas
CREATE TABLE IF NOT EXISTS operational_notes (
    link_name TEXT PRIMARY KEY,
    note TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
