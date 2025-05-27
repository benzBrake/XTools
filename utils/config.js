const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

function generateSecretKey() {
    return crypto.randomBytes(32).toString('hex');
}

function getSecretKey() {
    let secretKey = process.env.SESSION_SECRET;
    
    if (!secretKey) {
        // 生成新的密钥
        secretKey = generateSecretKey();
        
        // 读取现有的 .env 文件内容
        let envContent = '';
        const envPath = path.join(__dirname, '..', '.env');
        
        try {
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }
        } catch (err) {
            console.error('Error reading .env file:', err);
        }
        
        // 添加或更新 SESSION_SECRET
        if (envContent.includes('SESSION_SECRET=')) {
            envContent = envContent.replace(
                /SESSION_SECRET=.*/,
                `SESSION_SECRET=${secretKey}`
            );
        } else {
            envContent += `\nSESSION_SECRET=${secretKey}`;
        }
        
        // 写入 .env 文件
        try {
            fs.writeFileSync(envPath, envContent.trim() + '\n');
            console.log('Generated new session secret and saved to .env');
        } catch (err) {
            console.error('Error writing to .env file:', err);
        }
        
        // 更新环境变量
        process.env.SESSION_SECRET = secretKey;
    }
    
    return secretKey;
}

module.exports = {
    getSecretKey
};
