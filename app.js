const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configure multer for handling file uploads
const upload = multer({ 
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json') {
            cb(null, true);
        } else {
            cb(new Error('只支持上传 JSON 文件'), false);
        }
    }
});
require('dotenv').config();
const { getSecretKey } = require('./utils/config');
const { replaceCdnUrl } = require('./utils/cdn');

const app = express();
const port = 3000;

// Database setup
const db = new sqlite3.Database('tools.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the tools database.');
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        display_style TEXT DEFAULT 'card',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE,
        name TEXT,
        description TEXT,
        html_content TEXT,
        api_endpoint TEXT,
        group_id INTEGER,
        type TEXT DEFAULT 'html',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(group_id) REFERENCES groups(id)
    )`);

    // Insert default admin if not exists
    const defaultAdmin = {
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10)
    };

    db.get('SELECT * FROM admin WHERE username = ?', [defaultAdmin.username], (err, row) => {
        if (!row) {
            db.run('INSERT INTO admin (username, password) VALUES (?, ?)', 
                [defaultAdmin.username, defaultAdmin.password]);
        }
    });

    // Insert or update default settings if not exists
    const defaultSettings = [
        { key: 'admin_username', value: 'admin' },
        { key: 'admin_password', value: bcrypt.hashSync('admin123', 10) },
        { key: 'site_name', value: 'XTools - 在线工具箱' },
        { key: 'site_keywords', value: '在线工具,工具箱,开发者工具' },
        { key: 'site_description', value: 'XTools 是一个开发者在线工具箱，提供了多种实用的开发工具。' }
    ];

    defaultSettings.forEach(setting => {
        db.get('SELECT * FROM settings WHERE key = ?', [setting.key], (err, row) => {
            if (!row) {
                db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [setting.key, setting.value]);
                console.log(`Default setting created: ${setting.key}`);
            }
        });
    });
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: getSecretKey(),
    resave: false,
    saveUninitialized: false
}));
app.use(express.static('public'));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 添加 CDN 助手函数到所有模板
app.locals.replaceCdnUrl = replaceCdnUrl;

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.isAuthenticated) {
        // Store the original URL to redirect back after login
        req.session.returnTo = req.originalUrl;
        return res.redirect('/admin/login');
    }
    next();
};

// Login routes
app.get('/admin/login', (req, res) => {
    if (req.session.isAuthenticated) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { error: req.query.error });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;

    // Get admin password from settings
    db.get('SELECT value FROM settings WHERE key = ?', ['admin_password'], (err, row) => {
        if (err) {
            return res.redirect('/admin/login?error=' + encodeURIComponent('登录失败'));
        }

        if (!row || !bcrypt.compareSync(password, row.value) || username !== 'admin') {
            return res.redirect('/admin/login?error=' + encodeURIComponent('用户名或密码错误'));
        }

        req.session.isAuthenticated = true;
        const returnTo = req.session.returnTo || '/admin/dashboard';
        delete req.session.returnTo;
        res.redirect(returnTo);
    });
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

// Admin root redirect
app.get('/admin', (req, res) => {
    res.redirect('/admin/dashboard');
});

// Routes
// 搜索工具路由
app.get('/search', (req, res) => {
    const query = req.query.q || '';
    if (!query.trim()) {
        return res.redirect('/');
    }

    // 构建搜索条件
    const searchQuery = `
        SELECT t.*, g.name as group_name 
        FROM tools t 
        LEFT JOIN groups g ON t.group_id = g.id 
        WHERE t.name LIKE ? OR t.description LIKE ? 
        ORDER BY 
            CASE 
                WHEN t.name LIKE ? THEN 1
                WHEN t.description LIKE ? THEN 2
                ELSE 3
            END,
            g.sort_order ASC, 
            t.sort_order ASC, 
            t.id ASC`;

    const searchTerm = `%${query}%`;
    const exactSearchTerm = `%${query}`;

    db.all(searchQuery, [searchTerm, searchTerm, exactSearchTerm, exactSearchTerm], (err, tools) => {
        if (err) {
            return res.status(500).send('Database error');
        }

        // 获取站点设置
        db.all('SELECT key, value FROM settings WHERE key LIKE \'site_%\'', [], (err, settingsRows) => {
            if (err) {
                return res.status(500).send('Database error');
            }

            const settings = {};
            settingsRows.forEach(row => {
                settings[row.key] = row.value;
            });

            // 高亮搜索关键词
            tools.forEach(tool => {
                const regex = new RegExp(query, 'gi');
                tool.highlightedName = tool.name.replace(regex, match => `<span class="highlight">${match}</span>`);
                tool.highlightedDescription = tool.description.replace(regex, match => `<span class="highlight">${match}</span>`);
            });

            res.render('search', { 
                tools, 
                query,
                settings: {
                    site_name: settings.site_name || 'XTools - 在线工具箱',
                    site_keywords: settings.site_keywords || '',
                    site_description: settings.site_description || '',
                    cdn_url: settings.cdn_url || ''
                }
            });
        });
    });
});

app.get('/', (req, res) => {
    const toolsQuery = 'SELECT t.*, g.name as group_name FROM tools t LEFT JOIN groups g ON t.group_id = g.id ORDER BY g.sort_order ASC, t.sort_order ASC, t.id ASC';

    // 获取站点设置
    db.all('SELECT key, value FROM settings WHERE key LIKE \'site_%\'', [], (err, settingsRows) => {
        if (err) {
            return res.status(500).send('Database error');
        }

        const settings = {};
        settingsRows.forEach(row => {
            settings[row.key] = row.value;
        });

        // 获取分组列表
        db.all('SELECT * FROM groups ORDER BY sort_order ASC, id ASC', [], (err, groups) => {
            if (err) {
                return res.status(500).send('Database error');
            }

            // 获取工具列表
            db.all(toolsQuery, [], (err, tools) => {
                if (err) {
                    return res.status(500).send('Database error');
                }
                res.render('index', { 
                    tools, 
                    groups, 
                    settings: {
                        site_name: settings.site_name || 'XTools - 在线工具箱',
                        site_keywords: settings.site_keywords || '',
                        site_description: settings.site_description || '',
                        cdn_url: settings.cdn_url || ''
                    }
                });
            });
        });
    });
});

app.get('/tool/:uuid', (req, res) => {
    db.get('SELECT t.*, g.name as group_name FROM tools t LEFT JOIN groups g ON t.group_id = g.id WHERE t.uuid = ?', [req.params.uuid], (err, tool) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        if (!tool) {
            return res.status(404).send('Tool not found');
        }

        // 获取同分类的相似工具（不包括当前工具）
        const similarToolsQuery = `
            SELECT t.*, g.name as group_name 
            FROM tools t 
            LEFT JOIN groups g ON t.group_id = g.id 
            WHERE t.group_id = ? AND t.uuid != ? 
            ORDER BY t.sort_order ASC, t.id ASC 
            LIMIT 4`;

        db.all(similarToolsQuery, [tool.group_id, tool.uuid], (err, similarTools) => {
            if (err) {
                return res.status(500).send('Database error');
            }

            // 获取 CDN 设置
            db.get('SELECT value FROM settings WHERE key = ?', ['cdn_url'], (err, row) => {
                if (err) {
                    return res.status(500).send('Database error');
                }
                res.render('tool', { 
                    tool,
                    similarTools,
                    settings: {
                        cdn_url: row ? row.value : ''
                    }
                });
            });
        });
    });
});

// Admin routes
app.get('/admin/login', (req, res) => {
    res.render('admin/login');
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM settings WHERE key = ?', ['admin_username'], (err, usernameRow) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        
        if (!usernameRow || usernameRow.value !== username) {
            return res.render('admin/login', { error: 'Invalid credentials' });
        }

        db.get('SELECT * FROM settings WHERE key = ?', ['admin_password'], (err, passwordRow) => {
            if (err) {
                return res.status(500).send('Database error');
            }

            if (!passwordRow || !bcrypt.compareSync(password, passwordRow.value)) {
                return res.render('admin/login', { error: 'Invalid credentials' });
            }

            req.session.isAuthenticated = true;
            res.redirect('/admin/dashboard');
        });
    });
});

// Settings routes
app.get('/admin/settings', requireAuth, (req, res) => {
    // 获取所有站点设置
    db.all('SELECT key, value FROM settings WHERE key LIKE \'site_%\'', [], (err, rows) => {
        if (err) {
            return res.status(500).send('Database error');
        }

        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        res.render('admin/settings', { settings });
    });
});

// 站点设置路由
app.post('/admin/settings/site', requireAuth, (req, res) => {
    const { siteName, siteKeywords, siteDescription, cdnUrl } = req.body;
    const settings = [
        { key: 'site_name', value: siteName },
        { key: 'site_keywords', value: siteKeywords },
        { key: 'site_description', value: siteDescription },
        { key: 'cdn_url', value: cdnUrl }
    ];

    // 使用事务更新所有设置
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        try {
            settings.forEach(setting => {
                db.run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
                    [setting.value, setting.key]);
            });

            db.run('COMMIT');
            res.render('admin/settings', {
                success: '站点设置已更新',
                settings: {
                    site_name: siteName,
                    site_keywords: siteKeywords,
                    site_description: siteDescription,
                    cdn_url: cdnUrl
                }
            });
        } catch (err) {
            db.run('ROLLBACK');
            res.status(500).send('Database error');
        }
    });
});

// Export configuration
app.get('/admin/settings/export', requireAuth, (req, res) => {
    const exportData = {
        groups: [],
        tools: [],
        exportDate: new Date().toISOString()
    };

    // Get all groups
    db.all('SELECT * FROM groups', [], (err, groups) => {
        if (err) {
            console.error('Error exporting groups:', err);
            return res.status(500).send('导出失败');
        }
        exportData.groups = groups;

        // Get all tools
        db.all('SELECT * FROM tools', [], (err, tools) => {
            if (err) {
                console.error('Error exporting tools:', err);
                return res.status(500).send('导出失败');
            }
            exportData.tools = tools;

            // Set headers for file download
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=xtools-config-${new Date().toISOString().split('T')[0]}.json`);
            res.json(exportData);
        });
    });
});

// Import configuration
app.post('/admin/settings/import', requireAuth, upload.single('importFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('请选择要导入的文件');
    }

    fs.readFile(req.file.path, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading import file:', err);
            return res.status(500).send('读取文件失败');
        }

        let importData;
        try {
            importData = JSON.parse(data);
        } catch (e) {
            console.error('Error parsing JSON:', e);
            return res.status(400).send('JSON 格式无效');
        }

        // Begin transaction
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            try {
                // Clear existing data
                db.run('DELETE FROM tools');
                db.run('DELETE FROM groups');

                // Import groups
                const insertGroup = db.prepare('INSERT INTO groups (id, name, description, created_at) VALUES (?, ?, ?, ?)');
                importData.groups.forEach(group => {
                    insertGroup.run([group.id, group.name, group.description, group.created_at]);
                });
                insertGroup.finalize();

                // Import tools
                const insertTool = db.prepare('INSERT INTO tools (id, uuid, name, description, html_content, api_endpoint, group_id, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                importData.tools.forEach(tool => {
                    insertTool.run([tool.id, tool.uuid, tool.name, tool.description, tool.html_content, tool.api_endpoint, tool.group_id, tool.type, tool.created_at]);
                });
                insertTool.finalize();

                db.run('COMMIT');
                res.redirect('/admin/settings?success=' + encodeURIComponent('配置导入成功'));
            } catch (error) {
                console.error('Error during import:', error);
                db.run('ROLLBACK');
                res.status(500).send('导入过程中发生错误');
            }
        });

        // Clean up uploaded file
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });
    });
});

app.post('/admin/settings/password', requireAuth, (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // 验证新密码
    if (newPassword !== confirmPassword) {
        return res.render('admin/settings', { error: '两次输入的新密码不一致' });
    }

    if (newPassword.length < 6) {
        return res.render('admin/settings', { error: '新密码长度不能小于6位' });
    }

    // 验证当前密码
    db.get('SELECT * FROM settings WHERE key = ?', ['admin_password'], (err, row) => {
        if (err) {
            return res.status(500).send('Database error');
        }

        if (!row || !bcrypt.compareSync(currentPassword, row.value)) {
            return res.render('admin/settings', { error: '当前密码错误' });
        }

        // 更新密码
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
            [hashedPassword, 'admin_password'],
            (err) => {
                if (err) {
                    return res.status(500).send('Database error');
                }
                res.render('admin/settings', { success: '密码修改成功' });
            }
        );
    });
});

// Update tool order
// Update group order
app.post('/admin/group/reorder', requireAuth, (req, res) => {
    const { groupId, newOrder } = req.body;
    
    if (!groupId || newOrder === undefined) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    db.run('UPDATE groups SET sort_order = ? WHERE id = ?', [newOrder, groupId], (err) => {
        if (err) {
            console.error('Error updating group order:', err);
            return res.status(500).json({ error: '更新排序失败' });
        }
        res.json({ success: true });
    });
});

app.post('/admin/tool/reorder', requireAuth, (req, res) => {
    const { toolId, newOrder } = req.body;
    
    if (!toolId || newOrder === undefined) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    db.run('UPDATE tools SET sort_order = ? WHERE id = ?', [newOrder, toolId], (err) => {
        if (err) {
            console.error('Error updating tool order:', err);
            return res.status(500).json({ error: '更新排序失败' });
        }
        res.json({ success: true });
    });
});

app.get('/admin/dashboard', requireAuth, (req, res) => {
    db.all('SELECT * FROM tools', [], (err, tools) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        res.render('admin/dashboard', { tools });
    });
});

app.get('/admin/tool/new', requireAuth, (req, res) => {
    db.all('SELECT * FROM groups ORDER BY name', [], (err, groups) => {
        if (err) {
            return res.status(500).send('Database error');
        }

        // 获取 CDN 设置
        db.get('SELECT value FROM settings WHERE key = ?', ['cdn_url'], (err, row) => {
            if (err) {
                return res.status(500).send('Database error');
            }
            res.render('admin/tool-form', { 
                tool: {}, 
                groups,
                settings: {
                    cdn_url: row ? row.value : ''
                }
            });
        });
    });
});

app.post('/admin/tool', requireAuth, (req, res) => {
    const { name, description, html_content, api_endpoint, group_id, type } = req.body;
    const uuid = uuidv4();
    db.run(`INSERT INTO tools (uuid, name, description, html_content, api_endpoint, group_id, type) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid, name, description, html_content, api_endpoint, group_id || null, type || 'html'],
        (err) => {
            if (err) {
                return res.status(500).send('Database error');
            }
            res.redirect('/admin/dashboard');
        });
});

app.get('/admin/tool/:id/edit', requireAuth, (req, res) => {
    db.get('SELECT * FROM tools WHERE id = ?', [req.params.id], (err, tool) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        if (!tool) {
            return res.status(404).send('Tool not found');
        }
        db.all('SELECT * FROM groups ORDER BY name', [], (err, groups) => {
            if (err) {
                return res.status(500).send('Database error');
            }

            // 获取 CDN 设置
            db.get('SELECT value FROM settings WHERE key = ?', ['cdn_url'], (err, row) => {
                if (err) {
                    return res.status(500).send('Database error');
                }
                res.render('admin/tool-form', { 
                    tool, 
                    groups,
                    settings: {
                        cdn_url: row ? row.value : ''
                    }
                });
            });
        });
    });
});

app.post('/admin/tool/:id', requireAuth, (req, res) => {
    const { name, description, html_content, api_endpoint, group_id, type } = req.body;
    db.run(`UPDATE tools SET name = ?, description = ?, html_content = ?, 
            api_endpoint = ?, group_id = ?, type = ? WHERE id = ?`,
        [name, description, html_content, api_endpoint, group_id || null, type || 'html', req.params.id],
        (err) => {
            if (err) {
                return res.status(500).send('Database error');
            }
            res.redirect('/admin/dashboard');
        });
});

app.post('/admin/tool/:id/delete', requireAuth, (req, res) => {
    db.run('DELETE FROM tools WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        res.redirect('/admin/dashboard');
    });
});

// 分组管理路由
app.get('/admin/groups', requireAuth, (req, res) => {
    db.all('SELECT * FROM groups ORDER BY sort_order ASC, id ASC', [], (err, groups) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        res.render('admin/groups', { groups });
    });
});

app.post('/admin/group', requireAuth, (req, res) => {
    const { name, description, display_style } = req.body;
    db.run('INSERT INTO groups (name, description, display_style) VALUES (?, ?, ?)',
        [name, description, display_style],
        (err) => {
            if (err) {
                return res.status(500).send('Database error');
            }
            res.redirect('/admin/groups');
        }
    );
});

app.post('/admin/group/:id', requireAuth, (req, res) => {
    const { name, description, display_style } = req.body;
    db.run('UPDATE groups SET name = ?, description = ?, display_style = ? WHERE id = ?',
        [name, description, display_style, req.params.id],
        (err) => {
            if (err) {
                console.error('Error updating group:', err);
                return res.status(500).send('Database error');
            }
            res.redirect('/admin/groups');
        });
});

app.delete('/admin/group/:id', requireAuth, (req, res) => {
    // 先检查是否有工具在使用该分组
    db.get('SELECT COUNT(*) as count FROM tools WHERE group_id = ?', [req.params.id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.count > 0) {
            return res.status(400).json({ error: '该分组下还有工具，无法删除' });
        }
        // 如果没有工具使用，则删除分组
        db.run('DELETE FROM groups WHERE id = ?', [req.params.id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true });
        });
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
