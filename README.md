# XTools - 工具箱网站

一个简单的工具箱网站，支持在线添加和管理HTML工具。

## 功能特点

- 无需用户系统，只有管理员后台
- 支持添加、编辑、删除工具
- 每个工具支持自定义HTML内容和API端点
- 响应式设计，支持移动端访问
- 使用CodeMirror作为HTML编辑器

## 技术栈

- Node.js
- Express.js
- SQLite3
- EJS模板引擎
- Bootstrap 5
- CodeMirror

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 运行应用：
```bash
npm start
```

或者使用开发模式（支持热重载）：
```bash
npm run dev
```

3. 访问网站：
- 前台页面：http://localhost:3000
- 管理后台：http://localhost:3000/admin/login

## 默认管理员账号

- 用户名：admin
- 密码：admin123

请在首次登录后修改密码。

## 添加新工具

1. 登录管理后台
2. 点击"新增工具"按钮
3. 填写工具信息：
   - 名称：工具的显示名称
   - 描述：工具的简要描述
   - HTML内容：工具的具体实现代码
   - API端点（可选）：如果工具需要后端API支持，可以在这里指定

## 目录结构

```
XTools/
├── app.js          # 应用主文件
├── tools.db        # SQLite数据库文件
├── package.json    # 项目配置文件
├── views/          # 视图模板
│   ├── index.ejs   # 首页
│   ├── tool.ejs    # 工具页面
│   └── admin/      # 管理后台视图
│       ├── login.ejs     # 登录页
│       ├── dashboard.ejs # 管理面板
│       └── tool-form.ejs # 工具编辑表单
└── README.md       # 项目说明文档
```
