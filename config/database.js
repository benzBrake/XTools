const sqlite3 = require('sqlite3').verbose();
const { getMigrations } = require('./migrations');

let db = null;

async function connect() {
    if (db) {
        return db;
    }

    return new Promise((resolve, reject) => {
        const dbPath = process.env.DB_PATH || './data/xtools.db';
        const database = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error connecting to the database:', err);
                reject(err);
                return;
            }

            // Add query method
            database.query = function(sql, params = []) {
                return new Promise((resolve, reject) => {
                    const method = sql.trim().toLowerCase().startsWith('select') ? 'all' : 'run';
                    this[method](sql, params, function(err, result) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        if (method === 'run') {
                            resolve({
                                lastID: this.lastID,
                                changes: this.changes
                            });
                        } else {
                            resolve(result || []);
                        }
                    });
                });
            };

            // Add close method
            const originalClose = database.close.bind(database);
            database.close = function() {
                return new Promise((resolve, reject) => {
                    originalClose((err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        db = null;
                        resolve();
                    });
                });
            };

            db = database;
            resolve(db);
        });
    });
}

async function runMigrations() {
    if (!db) {
        await connect();
    }
    const migrations = getMigrations();
    for (const migration of migrations) {
        await db.query(migration);
    }
}

async function query(sql, params = []) {
    if (!db) {
        await connect();
    }
    return db.query(sql, params);
}

module.exports = {
    connect,
    runMigrations,
    query,
    get connection() {
        return db;
    }
};
