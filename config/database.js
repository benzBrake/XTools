const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const { getMigrations, getDefaultAdmin } = require('./migrations');

class Database {
    constructor() {
        this.type = process.env.DB_TYPE || 'sqlite';
        this.connection = null;
    }

    async runMigrations() {
        const migrations = getMigrations(this.type);
        for (const migration of migrations) {
            await this.query(migration);
        }

        // Check if admin exists
        const admins = await this.query('SELECT * FROM admin LIMIT 1');
        if (!admins || (Array.isArray(admins) && admins.length === 0)) {
            const defaultAdmin = getDefaultAdmin();
            await this.query('INSERT INTO admin (username, password) VALUES (?, ?)', 
                [defaultAdmin.username, defaultAdmin.password]);
        }
    }

    async connect() {
        if (this.type === 'mysql') {
            try {
                this.connection = await mysql.createConnection({
                    host: process.env.DB_HOST || 'localhost',
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: process.env.DB_NAME,
                    port: parseInt(process.env.DB_PORT || '3306')
                });
                console.log('Connected to MySQL database');
                await this.runMigrations();
            } catch (err) {
                console.error('Error connecting to MySQL:', err);
                throw err;
            }
        } else {
            // SQLite
            const dbPath = process.env.DB_PATH || 'tools.db';
            return new Promise((resolve, reject) => {
                this.connection = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        console.error('Error connecting to SQLite:', err);
                        reject(err);
                    } else {
                        console.log('Connected to SQLite database');
                        this.runMigrations()
                            .then(() => resolve())
                            .catch(reject);
                    }
                });
            });
        }
    }

    async query(sql, params = []) {
        if (this.type === 'mysql') {
            try {
                const [rows] = await this.connection.execute(sql, params);
                return rows;
            } catch (err) {
                console.error('MySQL query error:', err);
                throw err;
            }
        } else {
            // SQLite
            return new Promise((resolve, reject) => {
                const isSelect = sql.trim().toLowerCase().startsWith('select');
                const method = isSelect ? 'all' : 'run';
                
                this.connection[method](sql, params, function(err, result) {
                    if (err) {
                        console.error('SQLite query error:', err);
                        reject(err);
                    } else {
                        if (!isSelect && this.lastID) {
                            result = { ...result, insertId: this.lastID };
                        }
                        resolve(result);
                    }
                });
            });
        }
    }

    async close() {
        if (this.type === 'mysql') {
            try {
                await this.connection.end();
                console.log('MySQL connection closed');
            } catch (err) {
                console.error('Error closing MySQL connection:', err);
                throw err;
            }
        } else {
            // SQLite
            return new Promise((resolve, reject) => {
                this.connection.close((err) => {
                    if (err) {
                        console.error('Error closing SQLite connection:', err);
                        reject(err);
                    } else {
                        console.log('SQLite connection closed');
                        resolve();
                    }
                });
            });
        }
    }
}

module.exports = new Database();
