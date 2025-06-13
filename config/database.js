const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const { getMigrations } = require('./migrations');
const path = require('path');
const fs = require('fs');

let db = null;
const dbType = process.env.DB_TYPE || 'sqlite';

async function connect() {
    if (db) {
        return db;
    }

    if (dbType === 'mysql') {
        try {
            const pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
            db = pool;
            console.log('Connected to MySQL database.');
            return db;
        } catch (err) {
            console.error('Error connecting to MySQL database:', err);
            throw err;
        }
    } else {
        // Default to SQLite
        return new Promise((resolve, reject) => {
            const dbDir = path.dirname(process.env.DB_PATH || './data/xtools.db');
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            const dbPath = process.env.DB_PATH || './data/xtools.db';
            
            const database = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error('Error connecting to SQLite database:', err);
                    return reject(err);
                }
                console.log('Connected to SQLite database.');
                db = database;
                resolve(db);
            });
        });
    }
}

async function query(sql, params = []) {
    if (!db) {
        await connect();
    }

    if (dbType === 'mysql') {
        const [rows] = await db.query(sql, params);
        return rows;
    } else {
        return new Promise((resolve, reject) => {
            const method = sql.trim().toLowerCase().startsWith('select') ? 'all' : 'run';
            db[method](sql, params, function(err, result) {
                if (err) return reject(err);
                if (method === 'run') {
                    resolve({ lastID: this.lastID, changes: this.changes });
                } else {
                    resolve(result || []);
                }
            });
        });
    }
}

async function runMigrations() {
    const migrations = getMigrations(dbType);
    for (const migration of migrations) {
        await query(migration);
    }
}

async function close() {
    if (db) {
        if (dbType === 'mysql') {
            await db.end();
        } else {
            await new Promise((resolve, reject) => {
                db.close(err => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }
        db = null;
    }
}

module.exports = {
    connect,
    runMigrations,
    query,
    close,
    getDbType: () => dbType,
    get connection() {
        return db;
    }
};
