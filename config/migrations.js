const getMigrations = function() {
    return [
        // Settings table
        `CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY,
            key_name VARCHAR(255) UNIQUE,
            value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // Groups table
        `CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            display_style VARCHAR(50) DEFAULT 'card',
            sort_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // Add is_deletable column to groups table
        `ALTER TABLE groups ADD COLUMN is_deletable INTEGER DEFAULT 1`,

        // Add unique index to group name
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_name ON groups (name)`,

        // Insert default "Recommended" group
        `INSERT OR IGNORE INTO groups (name, description, sort_order, is_deletable) VALUES ('推荐', '编辑推荐的优质工具', -1, 0)`,

        // Tools table
        `CREATE TABLE IF NOT EXISTS tools (
            id INTEGER PRIMARY KEY,
            uuid VARCHAR(36) UNIQUE,
            name VARCHAR(255),
            description TEXT,
            html_content TEXT,
            api_endpoint VARCHAR(255),
            api_method VARCHAR(50) DEFAULT 'GET',
            api_params TEXT,
            group_id INT,
            type VARCHAR(50) DEFAULT 'html',
            sort_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id)
        )`,
        
        // Add missing columns if they don't exist
        `PRAGMA table_info(tools)`,
        `ALTER TABLE tools ADD COLUMN api_method VARCHAR(50) DEFAULT 'GET'`,
        `ALTER TABLE tools ADD COLUMN api_params TEXT`,
        `ALTER TABLE tools ADD COLUMN updated_at TIMESTAMP DEFAULT NULL`
    ];
};

const getDefaultAdmin = () => ({
    username: 'admin',
    password: '$2a$10$RJ7hQBP8D9E4XLqEwZYCxuNXcXxZUdIvLhPPmvIUxhxVwQ4q4OOPe' // admin123
});

module.exports = {
    getMigrations,
    getDefaultAdmin
};
