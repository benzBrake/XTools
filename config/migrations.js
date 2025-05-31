const getMigrations = (type) => {
    const isMysql = type === 'mysql';
    
    return [
        // Admin table
        `CREATE TABLE IF NOT EXISTS admin (
            id ${isMysql ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY,
            username VARCHAR(255) UNIQUE,
            password VARCHAR(255)
        )${isMysql ? ' ENGINE=InnoDB' : ''}`,

        // Settings table
        `CREATE TABLE IF NOT EXISTS settings (
            id ${isMysql ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY,
            key_name VARCHAR(255) UNIQUE,
            value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ${isMysql ? 'ON UPDATE CURRENT_TIMESTAMP' : ''}
        )${isMysql ? ' ENGINE=InnoDB' : ''}`,

        // Groups table
        `CREATE TABLE IF NOT EXISTS groups (
            id ${isMysql ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            display_style VARCHAR(50) DEFAULT 'card',
            sort_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ${isMysql ? 'ON UPDATE CURRENT_TIMESTAMP' : ''}
        )${isMysql ? ' ENGINE=InnoDB' : ''}`,

        // Tools table
        `CREATE TABLE IF NOT EXISTS tools (
            id ${isMysql ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY,
            uuid VARCHAR(36) UNIQUE,
            name VARCHAR(255),
            description TEXT,
            html_content TEXT,
            api_endpoint VARCHAR(255),
            group_id INT,
            type VARCHAR(50) DEFAULT 'html',
            sort_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(group_id) REFERENCES groups(id)
            ${isMysql ? 'ON DELETE SET NULL' : ''}
        )${isMysql ? ' ENGINE=InnoDB' : ''}`
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
