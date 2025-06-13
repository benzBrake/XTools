require('dotenv').config();
const database = require('../config/database');

async function migrate() {
    const dbType = database.getDbType();
    console.log(`Starting database migration for ${dbType}...`);
    try {
        await database.connect();
        await database.runMigrations();
        console.log('Migrations completed successfully.');

        // Create default admin user
        const bcrypt = require('bcryptjs');
        const admin = require('../config/migrations').getDefaultAdmin();
        const hashedPassword = bcrypt.hashSync(admin.password, 10);

        const dbType = database.getDbType();
        let sql, params;

        if (dbType === 'mysql') {
            sql = 'INSERT IGNORE INTO settings (key_name, value) VALUES (?, ?), (?, ?)';
            params = ['admin_username', admin.username, 'admin_password', hashedPassword];
        } else {
            sql = 'INSERT OR IGNORE INTO settings (key_name, value) VALUES (?, ?), (?, ?)';
            params = ['admin_username', admin.username, 'admin_password', hashedPassword];
        }

        await database.query(sql, params);
        console.log('Default admin user created or already exists.');
    } catch (err) {
        console.error('Error running migrations:', err);
        process.exit(1);
    } finally {
        await database.close();
        console.log('Database connection closed.');
    }
}

migrate();
