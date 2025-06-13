# XTools - 高度可定制的在线导航工具箱

一个功能强大、高度可定制的在线导航工具箱网站，支持在线添加和管理自定义工具，并可轻松部署在不同环境中。

## ✨ 功能亮点

- **动态工具管理**: 无需重启服务，即可在后台动态添加、编辑、删除工具。
- **强大的自定义能力**:
    - **HTML 工具**: 直接嵌入 HTML、CSS 和 JavaScript 代码创建前端工具。
    - **API 工具**: 可定义后端 API 端点，用于处理复杂逻辑。
- **工具分组**: 将工具分门别类, 方便查找和管理。
- **站点个性化**: 在后台轻松修改站点名称、关键词、描述，并支持配置 CDN 加速。
- **智能推荐**: 工具页面会自动展示“相似工具”和“猜你喜欢”，提升用户体验。
- **强大的搜索功能**: 支持按名称和描述快速搜索工具，并高亮显示关键词。
- **数据迁移**: 支持通过 JSON 文件批量导入和导出工具数据，方便备份和迁移。
- **多数据库支持**: 支持 SQLite 和 MySQL，可根据需求灵活选择。
- **响应式设计**: 完美适配桌面和移动设备。

## 🛠️ 技术栈

- **后端**: Node.js, Express.js
- **数据库**: SQLite3, MySQL2
- **前端**: EJS, Bootstrap 5, CodeMirror
- **其他**: bcryptjs (密码加密), multer (文件上传), dotenv (环境配置)

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/XTools.git
cd XTools
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境

将 `.env.example` 文件复制为 `.env`：

```bash
copy .env.example .env
```

你可以在 `.env` 文件中配置数据库和其他参数。详见下方的 **部署与配置** 部分。

### 4. 启动应用

- **生产模式**:
  ```bash
  npm start
  ```
- **开发模式** (使用 `nodemon` 实现热重载):
  ```bash
  npm run dev
  ```

### 5. 访问网站

- **前台页面**: [http://localhost:3000](http://localhost:3000)
- **管理后台**: [http://localhost:3000/admin](http://localhost:3000/admin)

### 默认管理员账号

- **用户名**: `admin`
- **密码**: `admin123`

**强烈建议在首次登录后立即修改密码！**

## ⚙️ 部署与配置

项目通过 `.env` 文件进行配置。你可以根据部署环境选择使用 SQLite 或 MySQL 数据库。

### 方案一：使用 SQLite (默认)

SQLite 是一个轻量级的本地数据库，无需额外安装，适合快速部署和本地开发。

确保你的 `.env` 文件中有以下配置：

```env
# 数据库类型设置为 sqlite
DB_TYPE=sqlite

# SQLite 数据库文件路径
DB_PATH=./data/xtools.db
```

启动应用后，程序会自动在 `data` 目录下创建 `xtools.db` 文件。

### 方案二：使用 MySQL

MySQL 提供了更强大的性能和可扩展性，适合生产环境。

1.  **安装并运行 MySQL 数据库**。
2.  **创建一个新的数据库** (例如，名为 `xtools`)。
3.  在 `.env` 文件中更新配置：

```env
# 数据库类型设置为 mysql
DB_TYPE=mysql

# MySQL 连接信息
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=xtools
```

请将 `your_mysql_user` 和 `your_mysql_password` 替换为你的实际数据库用户名和密码。

## 📂 目录结构

```
XTools/
├── app.js                        # 应用主文件，包含所有路由和核心逻辑
├── config/                       # 配置文件
│   ├── database.js               # 数据库连接和查询逻辑
│   └── migrations.js             # 数据库表结构定义
├── data/                         # SQLite 数据库文件存放目录
├── node_modules/                 # Node.js 依赖
├── public/                       # 静态资源 (CSS, JS, images)
├── scripts/                      # 数据库迁移、数据导入导出等脚本
├── utils/                        # 辅助函数
├── views/                        # EJS 视图模板
├── .env                          # 环境变量配置文件 (需从 .env.example 复制)
├── .env.example                  # 环境变量示例文件
├── package.json                  # 项目依赖和脚本配置
├── xtools-config-2025-06-12.json # 演示数据文件
└── README.md                     # 就是你现在看到的文件
```

## 🗄️ 数据库初始化

项目支持通过单个命令自动完成数据库初始化（也称为“迁移”），无论是使用 MySQL 还是 SQLite。

在首次运行项目前，请确保你的 `.env` 文件已正确配置数据库连接信息（如 `DB_TYPE`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 等），然后执行以下命令：

```bash
node scripts/migrate.js
```

该脚本会自动读取配置，连接到相应数据库并创建所有必需的数据表。

### 导入演示数据（可选）

为了快速体验，你可以导入项目附带的演示数据文件 `xtools-config-2025-06-12.json`。

1.  启动应用并登录到管理后台 (`/admin`)。
2.  导航到“数据管理”页面。
3.  在“导入数据”部分，选择 `xtools-config-2025-06-12.json` 文件并上传。

这将为你预先填充一些工具和分类，方便你快速了解系统功能。

