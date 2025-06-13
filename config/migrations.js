const getMigrations = (dbType = 'sqlite') => {
    const sqliteMigrations = [
        `CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_name TEXT UNIQUE NOT NULL,
            value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            is_deletable INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid VARCHAR(191) UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            html_content TEXT,
            api_endpoint TEXT,
            api_method TEXT DEFAULT 'GET',
            api_params TEXT,
            group_id INTEGER,
            type TEXT DEFAULT 'html',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE SET NULL
        )`,
        `INSERT OR IGNORE INTO groups (id, name, description, sort_order, is_deletable) VALUES (1, '未分类', '未分类的工具', 9999, 0)`
    ];

    const mysqlMigrations = [
        `CREATE TABLE IF NOT EXISTS settings (
            id INT PRIMARY KEY AUTO_INCREMENT,
            key_name VARCHAR(191) UNIQUE NOT NULL,
            value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS groups (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(191) UNIQUE NOT NULL,
            description TEXT,
            sort_order INT DEFAULT 0,
            is_deletable BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS tools (
            id INT PRIMARY KEY AUTO_INCREMENT,
            uuid VARCHAR(36) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            html_content MEDIUMTEXT,
            api_endpoint VARCHAR(255),
            api_method VARCHAR(10) DEFAULT 'GET',
            api_params JSON,
            group_id INT,
            type VARCHAR(50) DEFAULT 'html',
            sort_order INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE SET NULL
        )`,
        `INSERT IGNORE INTO groups (id, name, description, sort_order, is_deletable) VALUES (1, '未分类', '未分类的工具', 9999, 0)`
    ];

    if (dbType === 'mysql') {
        return mysqlMigrations;
    }
    return sqliteMigrations;
};

const getDefaultAdmin = () => ({
    username: 'admin',
    password: 'admin123'
});

module.exports = {
    getMigrations,
    getDefaultAdmin
};
