const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('../../core/config');
const logger = require('../../core/logger');

const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Auto-Reparo: Se existir noc_enterprise_fixed.db, aplicar substituicao imediata ou fallback
const fixedPath = path.join(dbDir, 'noc_enterprise_fixed.db');
let activeDbPath = config.database.path;

if (fs.existsSync(fixedPath)) {
    try {
        const corruptBak = path.join(dbDir, `noc_enterprise_corrompido_${Date.now()}.db`);
        if (fs.existsSync(activeDbPath)) {
            fs.renameSync(activeDbPath, corruptBak);
            const wal = `${activeDbPath}-wal`;
            const shm = `${activeDbPath}-shm`;
            if (fs.existsSync(wal)) try { fs.unlinkSync(wal); } catch (e) {}
            if (fs.existsSync(shm)) try { fs.unlinkSync(shm); } catch (e) {}
            fs.renameSync(fixedPath, activeDbPath);
            logger.info('Base SQLite substituida com sucesso pelo banco integro (noc_enterprise_fixed.db).');
        } else {
            fs.renameSync(fixedPath, activeDbPath);
        }
    } catch (swapErr) {
        logger.warn({ swapErr: swapErr.message }, 'Arquivo noc_enterprise.db ocupado. Ativando noc_enterprise_fixed.db como primario.');
        activeDbPath = fixedPath;
    }
}

const db = new sqlite3.Database(activeDbPath, (err) => {
    if (err) {
        logger.fatal({ err }, 'Falha ao conectar no banco SQLite');
        process.exit(1);
    }
    logger.info({ path: activeDbPath }, 'Conexao SQLite estabelecida.');
});

db.serialize(() => {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA busy_timeout = 15000;");
    db.run("PRAGMA temp_store = MEMORY;");
    // Trunca arquivo WAL inflado no startup
    db.run("PRAGMA wal_checkpoint(TRUNCATE);", (err) => {
        if (err) logger.warn({ err: err.message }, 'Aviso ao truncar WAL no startup do banco');
        else logger.info('WAL checkpoint executado com sucesso.');
    });
});

// Checkpoint periódico de WAL a cada 5 minutos para impedir inchaço excessivo
setInterval(() => {
    db.run("PRAGMA wal_checkpoint(PASSIVE);", (err) => {
        if (err) logger.warn({ err: err.message }, 'Aviso em wal_checkpoint periódico');
    });
}, 5 * 60 * 1000).unref();

const database = {
    raw: db,
    query(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    },
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    },
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    },
    exec(sql) {
        return new Promise((resolve, reject) => {
            db.exec(sql, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    },
    close() {
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
};

module.exports = database;
