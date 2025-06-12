const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getMigrations } = require('../config/migrations');

async function runMigrations() {
    const dbPath = path.resolve(process.env.DB_PATH || './data/xtools.db');
    console.log(`Connecting to database at ${dbPath}...`);
    
    const db = new sqlite3.Database(dbPath);
    
    // Add query method
    db.query = function(sql, params = []) {
        return new Promise((resolve, reject) => {
            const method = sql.trim().toLowerCase().startsWith('select') ? 'all' : 'run';
            this[method](sql, params, function(err, result) {
                if (err) {
                    console.error('Error executing query:', sql, params);
                    console.error(err);
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

    try {
        // Enable foreign keys
        await db.query('PRAGMA foreign_keys = ON');
        
        // Get all migrations
        const migrations = getMigrations();
        
        // Run each migration
        for (const migration of migrations) {
            console.log('Running migration:', migration.substring(0, 100) + (migration.length > 100 ? '...' : ''));
            
            // Handle ALTER TABLE ADD COLUMN specially for SQLite
            if (migration.startsWith('ALTER TABLE') && migration.includes('ADD COLUMN')) {
                const tableMatch = migration.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN/);
                const columnMatch = migration.match(/ADD COLUMN\s+(\w+)/);
                
                if (tableMatch && columnMatch) {
                    const table = tableMatch[1];
                    const column = columnMatch[1];
                    
                    // Check if column exists
                    const checkSql = `SELECT COUNT(*) as count FROM pragma_table_info('${table}') WHERE name = '${column}'`;
                    const result = await db.query(checkSql);
                    
                    if (result[0].count === 0) {
                        // Column doesn't exist, add it
                        await db.query(migration);
                        console.log(`  - Added column ${column} to ${table}`);
                    } else {
                        console.log(`  - Column ${column} already exists in ${table}, skipping`);
                    }
                    continue;
                }
            }
            
            // For all other queries, run them directly
            try {
                await db.query(migration);
            } catch (err) {
                // Ignore "duplicate column" errors
                if (!err.message.includes('duplicate column')) {
                    throw err;
                }
                console.log('  - Column already exists, continuing...');
            }
        }
        
        console.log('Migrations completed successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        db.close();
    }
}

runMigrations();
