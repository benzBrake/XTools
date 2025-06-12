require('dotenv').config();
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

const { getSecretKey } = require('./utils/config');
const { replaceCdnUrl } = require('./utils/cdn');

const app = express();
const port = 3000;

// 导入数据库配置
const db = require('./config/database');

// 初始化数据库连接
if (process.env.NODE_ENV !== 'test') {
    db.connect().catch(err => {
        console.error('Error connecting to the database:', err);
        process.exit(1);
    });
}

// Database initialization is now handled by migrations

// Insert default settings
const defaultSettings = [
    { key_name: 'admin_username', value: 'admin' },
    { key_name: 'admin_password', value: bcrypt.hashSync('admin123', 10) },
    { key_name: 'site_name', value: 'XTools - 在线工具箱' },
    { key_name: 'site_keywords', value: '在线工具,工具箱,开发者工具' },
    { key_name: 'site_description', value: 'XTools 是一个开发者在线工具箱，提供了多种实用的开发工具。' }
];

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

app.post('/admin/login', async (req, res) => {
    const { password } = req.body;

    // Get admin password from settings
    try {
        const row = await db.query('SELECT value FROM settings WHERE key_name = ?', ['admin_password']);
        if (!row || (Array.isArray(row) && row.length === 0) || !bcrypt.compareSync(password, row[0].value)) {
            return res.status(200).render('admin/login', { error: 'Invalid credentials' });
        }

        req.session.isAuthenticated = true;
        const returnTo = req.session.returnTo || '/admin/dashboard';
        delete req.session.returnTo;
        res.redirect(returnTo);
    } catch (err) {
        console.error('Login error:', err);
        return res.status(200).render('admin/login', { error: 'Login failed' });
    }
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
app.get('/search', async (req, res) => {
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

    try {
        // 获取工具列表
        const tools = await db.query(searchQuery, [searchTerm, searchTerm, exactSearchTerm, exactSearchTerm]);

        // 获取站点设置
        const settingsRows = await db.query('SELECT key_name, value FROM settings WHERE key_name LIKE \'site_%\'');

        const settings = {};
        settingsRows.forEach(row => {
            settings[row.key_name] = row.value;
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
    } catch (err) {
        console.error('Search error:', err);
        return res.status(500).send('Database error');
    }
});

// API routes
app.get('/api/settings', async (req, res) => {
    try {
        const settingsRows = await db.query('SELECT key_name, value FROM settings WHERE key_name LIKE \'site_%\'');
        res.json({
            success: true,
            settings: settingsRows
        });
    } catch (err) {
        console.error('Settings API error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/settings', requireAuth, async (req, res) => {
    try {
        const updates = Object.entries(req.body);
        for (const [key, value] of updates) {
            if (key.startsWith('site_')) {
                await db.query('UPDATE settings SET value = ? WHERE key_name = ?', [value, key]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Settings update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.all('/api/*', async (req, res, next) => {
    try {
        // 查找匹配的工具
        const tools = await db.query('SELECT * FROM tools WHERE api_endpoint = ? AND type = ?', [req.path, 'api']);
        const tool = tools[0];

        if (!tool) {
            return next(); // 如果没有找到匹配的工具，继续下一个路由
        }

        // 返回成功响应
        res.json({
            success: true,
            data: req.method === 'POST' ? req.body : {},
            tool: {
                name: tool.name,
                description: tool.description
            }
        });
    } catch (err) {
        console.error('API error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/', async (req, res) => {
    const toolsQuery = 'SELECT t.*, g.name as group_name FROM tools t LEFT JOIN groups g ON t.group_id = g.id ORDER BY g.sort_order ASC, t.sort_order ASC, t.id ASC';

    try {
        // 获取站点设置和分组
        const settingsRows = await db.query('SELECT key_name, value FROM settings WHERE key_name LIKE \'site_%\'');
        const tools = await db.query(toolsQuery);
        const groups = await db.query('SELECT * FROM groups ORDER BY sort_order ASC, id ASC');

        const settings = {};
        settingsRows.forEach(row => {
            settings[row.key_name] = row.value;
        });

        // 按组分类工具
        const groupedTools = {};
        tools.forEach(tool => {
            const groupName = tool.group_name || '未分类';
            if (!groupedTools[groupName]) {
                groupedTools[groupName] = [];
            }
            groupedTools[groupName].push(tool);
        });

        res.render('index', {
            groups,
            groupedTools,
            settings: {
                site_name: settings.site_name || 'XTools - 在线工具箱',
                site_keywords: settings.site_keywords || '',
                site_description: settings.site_description || '',
                cdn_url: settings.cdn_url || ''
            }
        });
    } catch (err) {
        console.error('Homepage error:', err);
        return res.status(500).send('Database error');
    }
});

app.get('/tool/:uuid', async (req, res) => {
    try {
        // 获取工具详情
        const tools = await db.query('SELECT t.*, g.name as group_name, t.api_endpoint, t.api_method, t.api_params FROM tools t LEFT JOIN groups g ON t.group_id = g.id WHERE t.uuid = ?', [req.params.uuid]);
        const tool = tools[0];

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

        const similarTools = await db.query(similarToolsQuery, [tool.group_id, tool.uuid]);

        // 获取站点设置
        const settingsRows = await db.query('SELECT key_name, value FROM settings WHERE key_name LIKE \'site_%\'');
        const cdnRow = await db.query('SELECT value FROM settings WHERE key_name = ?', ['cdn_url']);

        const settings = {};
        settingsRows.forEach(row => {
            settings[row.key_name] = row.value;
        });

        res.render('tool', {
            tool,
            similarTools,
            settings: {
                site_name: settings.site_name || 'XTools - 在线工具箱',
                site_keywords: settings.site_keywords || '',
                site_description: settings.site_description || '',
                cdn_url: cdnRow[0]?.value || ''
            }
        });
    } catch (err) {
        console.error('Tool detail error:', err);
        return res.status(500).send('Database error');
    }
});

// Admin routes
app.get('/admin/login', (req, res) => {
    res.render('admin/login');
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const usernameRow = await db.query('SELECT value FROM settings WHERE key_name = ?', ['admin_username']);

        if (!usernameRow || usernameRow.length === 0 || usernameRow[0].value !== username) {
            return res.render('admin/login', { error: 'Invalid credentials' });
        }

        const passwordRow = await db.query('SELECT value FROM settings WHERE key_name = ?', ['admin_password']);

        if (!passwordRow || passwordRow.length === 0 || !bcrypt.compareSync(password, passwordRow[0].value)) {
            return res.render('admin/login', { error: 'Invalid credentials' });
        }

        req.session.isAuthenticated = true;
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).send('Database error');
    }
});

// Settings routes
app.get('/admin/settings', requireAuth, async (req, res) => {
    try {
        // 获取所有站点设置
        const rows = await db.query('SELECT key_name, value FROM settings WHERE key_name LIKE \'site_%\'');

        const settings = {};
        rows.forEach(row => {
            settings[row.key_name] = row.value;
        });

        res.render('admin/settings', { settings });
    } catch (err) {
        console.error('Settings error:', err);
        return res.status(500).send('Database error');
    }
});

// 站点设置路由
app.post('/admin/settings/site', requireAuth, async (req, res) => {
    const { siteName, siteKeywords, siteDescription, cdnUrl } = req.body;
    const settings = [
        { key_name: 'site_name', value: siteName },
        { key_name: 'site_keywords', value: siteKeywords },
        { key_name: 'site_description', value: siteDescription },
        { key_name: 'cdn_url', value: cdnUrl }
    ];

    try {
        // 使用事务更新所有设置
        await db.query('BEGIN TRANSACTION');

        for (const setting of settings) {
            await db.query(
                'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key_name = ?',
                [setting.value, setting.key_name]
            );
        }

        await db.query('COMMIT');

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
        await db.query('ROLLBACK');
        console.error('Settings update error:', err);
        res.status(500).send('Database error');
    }
});

// Export configuration
app.get('/admin/settings/export', requireAuth, async (req, res) => {
    try {
        const exportData = {
            groups: [],
            tools: [],
            exportDate: new Date().toISOString()
        };

        // Get all groups
        exportData.groups = await db.query('SELECT * FROM groups');

        // Get all tools
        exportData.tools = await db.query('SELECT * FROM tools');

        // Set headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=xtools-config-${new Date().toISOString().split('T')[0]}.json`);
        res.json(exportData);
    } catch (err) {
        console.error('Error exporting data:', err);
        return res.status(500).send('导出失败');
    }
});

// Import configuration
app.post('/admin/settings/import', requireAuth, upload.single('importFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('请选择要导入的文件');
    }

    try {
        const data = await fs.promises.readFile(req.file.path, 'utf8');
        let importData;
        try {
            importData = JSON.parse(data);
        } catch (e) {
            console.error('Error parsing JSON:', e);
            return res.status(400).send('JSON 格式无效');
        }

        // Begin transaction
        await db.query('BEGIN TRANSACTION');

        try {
            // Clear existing data
            await db.query('DELETE FROM tools');
            await db.query('DELETE FROM groups');

            // Import groups
            for (const group of importData.groups) {
                await db.query(
                    'INSERT INTO groups (id, name, description, created_at) VALUES (?, ?, ?, ?)',
                    [group.id, group.name, group.description, group.created_at]
                );
            }

            // Import tools
            for (const tool of importData.tools) {
                await db.query(
                    'INSERT INTO tools (id, uuid, name, description, html_content, api_endpoint, group_id, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [tool.id, tool.uuid, tool.name, tool.description, tool.html_content, tool.api_endpoint, tool.group_id, tool.type, tool.created_at]
                );
            }

            await db.query('COMMIT');
            res.redirect('/admin/settings?success=' + encodeURIComponent('配置导入成功'));
        } catch (error) {
            console.error('Error during import:', error);
            await db.query('ROLLBACK');
            res.status(500).send('导入过程中发生错误');
        }

        // Clean up uploaded file
        await fs.promises.unlink(req.file.path);
    } catch (err) {
        console.error('Error reading import file:', err);
        return res.status(500).send('读取文件失败');
    }
});

app.post('/admin/settings/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // 验证新密码
    if (newPassword !== confirmPassword) {
        return res.render('admin/settings', { error: '两次输入的新密码不一致' });
    }

    if (newPassword.length < 6) {
        return res.render('admin/settings', { error: '新密码长度不能小于6位' });
    }

    try {
        // 验证当前密码
        const rows = await db.query('SELECT value FROM settings WHERE key_name = ?', ['admin_password']);

        if (!rows || rows.length === 0 || !bcrypt.compareSync(currentPassword, rows[0].value)) {
            return res.render('admin/settings', { error: '当前密码错误' });
        }

        // 更新密码
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await db.query('UPDATE settings SET value = ? WHERE key_name = ?', [hashedPassword, 'admin_password']);

        res.render('admin/settings', { success: '密码已更新' });
    } catch (err) {
        console.error('Password update error:', err);
        return res.status(500).send('Database error');
    }
});

// Update tool order
// Update group order
app.post('/admin/group/reorder', requireAuth, async (req, res) => {
    const { groupId, newOrder } = req.body;

    if (!groupId || newOrder === undefined) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    try {
        await db.query('UPDATE groups SET sort_order = ? WHERE id = ?', [newOrder, groupId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating group order:', err);
        return res.status(500).json({ error: '更新排序失败' });
    }
});

app.post('/admin/tool/reorder', requireAuth, async (req, res) => {
    const { toolId, newOrder } = req.body;

    if (!toolId || newOrder === undefined) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    try {
        await db.query('UPDATE tools SET sort_order = ? WHERE id = ?', [newOrder, toolId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating tool order:', err);
        return res.status(500).json({ error: '更新排序失败' });
    }
});

app.get('/admin/dashboard', requireAuth, async (req, res) => {
    try {
        const tools = await db.query('SELECT * FROM tools');
        const groups = await db.query('SELECT * FROM groups ORDER BY sort_order ASC, id ASC');
        res.render('admin/dashboard', { tools, groups });
    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).send('Database error');
    }
});

app.get('/admin/tool/new', requireAuth, async (req, res) => {
    try {
        const groups = await db.query('SELECT * FROM groups ORDER BY name');
        const rows = await db.query('SELECT value FROM settings WHERE key_name = ?', ['cdn_url']);

        res.render('admin/tool-form', {
            tool: {},
            groups,
            settings: {
                cdn_url: rows.length > 0 ? rows[0].value : ''
            }
        });
    } catch (err) {
        console.error('New tool form error:', err);
        return res.status(500).send('Database error');
    }
});

app.post('/admin/tool', requireAuth, async (req, res) => {
    const { name, description, html_content, api_endpoint, group_id, type } = req.body;
    const uuid = uuidv4();

    try {
        await db.query(`INSERT INTO tools (uuid, name, description, html_content, api_endpoint, group_id, type) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuid, name, description, html_content, api_endpoint, group_id || null, type || 'html']
        );
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Create tool error:', err);
        return res.status(500).send('Database error');
    }
});

app.get('/admin/tool/:id/edit', requireAuth, async (req, res) => {
    try {
        const tools = await db.query('SELECT * FROM tools WHERE id = ?', [req.params.id]);
        const tool = tools[0];

        if (!tool) {
            return res.status(404).send('Tool not found');
        }

        // 获取站点设置
        const settingsRows = await db.query('SELECT key_name, value FROM settings WHERE key_name LIKE \'site_%\'');
        const settings = {};
        settingsRows.forEach(row => {
            settings[row.key_name] = row.value;
        });

        const groups = await db.query('SELECT * FROM groups ORDER BY name');
        const cdnRows = await db.query('SELECT value FROM settings WHERE key_name = ?', ['cdn_url']);

        res.render('admin/tool-form', {
            tool,
            groups,
            settings: {
                cdn_url: cdnRows.length > 0 ? cdnRows[0].value : '',
                site_name: settings.site_name || 'XTools - 在线工具箱',
                site_keywords: settings.site_keywords || '',
                site_description: settings.site_description || ''
            }
        });
    } catch (err) {
        console.error('Tool detail error:', err);
        return res.status(500).send('Database error');
    }
});

app.post('/admin/tool/:id', requireAuth, async (req, res) => {
    const { name, description, html_content, api_endpoint, group_id, type } = req.body;

    try {
        await db.query(`UPDATE tools SET name = ?, description = ?, html_content = ?, 
            api_endpoint = ?, group_id = ?, type = ? WHERE id = ?`,
            [name, description, html_content, api_endpoint, group_id || null, type || 'html', req.params.id]
        );
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Update tool error:', err);
        return res.status(500).send('Database error');
    }
});

app.post('/admin/tool/:id/delete', requireAuth, async (req, res) => {
    try {
        await db.query('DELETE FROM tools WHERE id = ?', [req.params.id]);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Delete tool error:', err);
        return res.status(500).send('Database error');
    }
});

// 分组管理路由
app.get('/admin/groups', requireAuth, async (req, res) => {
    try {
        const groups = await db.query('SELECT * FROM groups ORDER BY sort_order ASC, id ASC');
        res.render('admin/groups', { groups });
    } catch (err) {
        console.error('List groups error:', err);
        return res.status(500).send('Database error');
    }
});

app.post('/admin/group', requireAuth, async (req, res) => {
    const { name, description, display_style } = req.body;

    try {
        await db.query('INSERT INTO groups (name, description, display_style) VALUES (?, ?, ?)',
            [name, description, display_style]
        );
        res.redirect('/admin/groups');
    } catch (err) {
        console.error('Create group error:', err);
        return res.status(500).send('Database error');
    }
});

app.post('/admin/group/:id', requireAuth, async (req, res) => {
    const { name, description, display_style } = req.body;

    try {
        await db.query('UPDATE groups SET name = ?, description = ?, display_style = ? WHERE id = ?',
            [name, description, display_style, req.params.id]
        );
        res.redirect('/admin/groups');
    } catch (err) {
        console.error('Update group error:', err);
        return res.status(500).send('Database error');
    }
});

app.delete('/admin/group/:id', requireAuth, async (req, res) => {
    try {
        // 先检查是否有工具在使用该分组
        const rows = await db.query('SELECT COUNT(*) as count FROM tools WHERE group_id = ?', [req.params.id]);

        if (rows[0].count > 0) {
            return res.status(400).json({ error: '该分组下还有工具，无法删除' });
        }

        // 如果没有工具使用，则删除分组
        await db.query('DELETE FROM groups WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete group error:', err);
        return res.status(500).json({ error: 'Database error' });
    }
});

if (process.env.NODE_ENV !== 'test') {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

module.exports = app;
