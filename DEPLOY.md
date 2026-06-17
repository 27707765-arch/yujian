# 遇见APP后端 — 云服务器部署文档（内测版）

> 适用环境：阿里云 ECS / 腾讯云 CVM / 华为云 ECS，操作系统 CentOS 7+ / Ubuntu 20.04+ / Debian 11+

---

## 目录

- [1. 服务器环境要求](#1-服务器环境要求)
- [2. 基础环境安装](#2-基础环境安装)
  - [2.1 Node.js 18+](#21-nodejs-18)
  - [2.2 MySQL 8.0](#22-mysql-80)
  - [2.3 Redis 7.0](#23-redis-70)
  - [2.4 Nginx](#24-nginx)
  - [2.5 PM2](#25-pm2)
  - [2.6 Git](#26-git)
- [3. 数据库初始化](#3-数据库初始化)
- [4. 项目部署](#4-项目部署)
- [5. 环境变量配置](#5-环境变量配置)
- [6. Nginx 配置](#6-nginx-配置)
- [7. SSL/HTTPS 配置](#7-sslhttps-配置)
- [8. PM2 进程管理](#8-pm2-进程管理)
- [9. 防火墙配置](#9-防火墙配置)
- [10. 部署验证](#10-部署验证)
- [11. 日志与监控](#11-日志与监控)
- [12. 内测注意事项](#12-内测注意事项)
- [13. 常见问题排查](#13-常见问题排查)
- [14. 更新部署](#14-更新部署)

---

## 1. 服务器环境要求

| 组件 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 2核 | 4核 |
| 内存 | 4GB | 8GB |
| 磁盘 | 40GB SSD | 80GB SSD |
| 带宽 | 3Mbps | 5Mbps+ |
| 操作系统 | CentOS 7+ / Ubuntu 20.04+ / Debian 11+ |
| Node.js | 18.x LTS |
| MySQL | 8.0+ |
| Redis | 7.0+ |
| Nginx | 1.18+ |

---

## 2. 基础环境安装

### 2.1 Node.js 18+

**Ubuntu/Debian：**

```bash
# 使用 NodeSource 官方源
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node -v   # 应输出 v18.x.x
npm -v    # 应输出 9.x.x
```

**CentOS/RHEL：**

```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证
node -v
npm -v
```

### 2.2 MySQL 8.0

**Ubuntu 20.04+：**

```bash
# 安装
sudo apt-get update
sudo apt-get install -y mysql-server

# 启动并设置开机自启
sudo systemctl start mysql
sudo systemctl enable mysql

# 安全初始化（设置root密码、移除匿名用户等）
sudo mysql_secure_installation
```

**CentOS 7+：**

```bash
# 添加 MySQL 官方 YUM 源
sudo yum install -y https://dev.mysql.com/get/mysql80-community-release-el7-3.noarch.rpm

# 安装
sudo yum install -y mysql-community-server

# 启动并设置开机自启
sudo systemctl start mysqld
sudo systemctl enable mysqld

# 获取临时root密码
sudo grep 'temporary password' /var/log/mysqld.log

# 安全初始化
sudo mysql_secure_installation
```

**创建数据库和用户：**

```bash
mysql -u root -p
```

```sql
-- 创建数据库
CREATE DATABASE IF NOT EXISTS yujian DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（请将 'your_strong_password' 替换为强密码）
CREATE USER 'yujian'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON yujian.* TO 'yujian'@'localhost';
FLUSH PRIVILEGES;

EXIT;
```

### 2.3 Redis 7.0

**Ubuntu 22.04+：**

```bash
sudo apt-get update
sudo apt-get install -y redis-server

# 设置密码（建议）
sudo sed -i 's/# requirepass foobared/requirepass your_redis_password/' /etc/redis/redis.conf

# 启动
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 验证
redis-cli ping   # 应返回 PONG
```

**CentOS 7+：**

```bash
# 安装 EPEL 和 Remi 源
sudo yum install -y epel-release
sudo yum install -y https://rpms.remirepo.net/enterprise/remi-release-7.rpm

# 安装 Redis
sudo yum --enablerepo=remi install -y redis

# 设置密码
sudo sed -i 's/# requirepass foobared/requirepass your_redis_password/' /etc/redis.conf

# 启动
sudo systemctl start redis
sudo systemctl enable redis

# 验证
redis-cli ping
```

### 2.4 Nginx

```bash
# Ubuntu/Debian
sudo apt-get install -y nginx

# CentOS
sudo yum install -y nginx

# 启动
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2.5 PM2

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 设置开机自启
pm2 startup systemd
# 执行上面命令输出的提示命令（通常需要 sudo）

# 验证
pm2 --version
```

### 2.6 Git

```bash
# Ubuntu/Debian
sudo apt-get install -y git

# CentOS
sudo yum install -y git
```

---

## 3. 数据库初始化

将项目中的 [schema.sql](schema.sql) 上传到服务器，然后执行：

```bash
# 方式一：使用上面创建的 yujian 用户
mysql -u yujian -p yujian < schema.sql

# 方式二：使用 root 用户
mysql -u root -p yujian < schema.sql
```

**验证表结构：**

```bash
mysql -u yujian -p yujian -e "SHOW TABLES;"
```

预期输出约 **20张表**：

```
users, conversations, messages, likes, matches, skips,
user_views, posts, post_comments, post_likes, reports,
vip_packages, orders, user_photos, user_blocks, tags,
user_tags, push_tokens, user_settings, gifts, gift_records,
wallets, coin_transactions, vip_privileges, daily_checkins,
user_tasks
```

---

## 4. 项目部署

### 4.1 克隆项目

```bash
# 创建应用目录
sudo mkdir -p /home/app
sudo chown $USER:$USER /home/app

# 克隆项目
cd /home/app
git clone <你的仓库地址> yujian
cd yujian
```

### 4.2 创建必要目录

```bash
mkdir -p logs uploads
chmod 755 uploads
```

### 4.3 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件（详见第 5 节）
vim .env
```

### 4.4 安装依赖并启动

```bash
# 安装依赖
npm install

# 测试运行（确认无报错后 Ctrl+C 停止）
node server.js

# 使用 PM2 正式启动（内测使用 sandbox 模式，自动开启短信+支付模拟）
pm2 start ecosystem.config.js --env sandbox
# 正式上线时改用: pm2 start ecosystem.config.js --env production

# 保存 PM2 进程列表（重启后自动恢复）
pm2 save
```

---

## 5. 环境变量配置

编辑 `.env` 文件，**生产环境必须修改以下所有带 ⚠️ 标记的配置项**：

```bash
# ==================== 服务器配置 ====================
PORT=3000
NODE_ENV=production                          # ⚠️ 必须改为 production

# ==================== 数据库配置 ====================
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=yujian                               # ⚠️ 使用专用用户，不要用 root
DB_PASSWORD=your_strong_password_here         # ⚠️ 必须修改，不能用 123456
DB_NAME=yujian

# ==================== Redis配置 ====================
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password           # ⚠️ 如果 Redis 设了密码必须填写
REDIS_DB=0

# ==================== JWT配置 ====================
JWT_SECRET=your_64_char_random_secret_key    # ⚠️ 必须修改，至少32位随机字符串
JWT_EXPIRES_IN=168h                          # Token 7天过期

# ==================== 文件上传配置 ====================
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=10485760                      # 10MB

# ==================== 短信服务（内测使用模拟模式） ====================
SMS_ACCESS_KEY=your_sms_access_key
SMS_SECRET_KEY=your_sms_secret_key

# ==================== 跨域白名单 ====================
ALLOWED_ORIGINS=https://your-domain.com,https://app.your-domain.com
# ⚠️ 设为你的前端/APP实际域名，多个用逗号分隔

# ==================== OSS配置（内测可暂不配置，使用本地存储） ====================
# OSS_REGION=oss-cn-hangzhou
# OSS_ACCESS_KEY=your_oss_access_key
# OSS_SECRET_KEY=your_oss_secret_key
# OSS_BUCKET=yujian-uploads

# ==================== 礼物分成比例 ====================
GIFT_SHARE_RATIO=0.7
```

> **⚠️ 安全提醒**：`JWT_SECRET` 和 `DB_PASSWORD` 如果使用默认值，[server.js](server.js) 会在生产环境直接拒绝启动并 `exit(1)`。使用以下命令生成随机密钥：
>
> ```bash
> # 生成64位随机JWT密钥
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 6. Nginx 配置

### 6.1 基础配置

创建配置文件：

```bash
sudo vim /etc/nginx/sites-available/yujian
# 或者 CentOS: sudo vim /etc/nginx/conf.d/yujian.conf
```

```nginx
upstream yujian_backend {
    # ⚠️ PM2 cluster 模式必须使用 ip_hash 保证 WebSocket 粘性会话
    ip_hash;
    server 127.0.0.1:3000;
    # 如果改为单实例，去掉 ip_hash 和下面注释即可
    # server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name your-domain.com;              # ⚠️ 改为你的域名或IP

    # 客户端上传文件大小限制
    client_max_body_size 20m;
    client_body_timeout 60s;

    # 日志
    access_log /var/log/nginx/yujian-access.log;
    error_log /var/log/nginx/yujian-error.log;

    # API 代理
    location / {
        proxy_pass http://yujian_backend;
        proxy_http_version 1.1;

        # WebSocket 支持（关键！）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;            # WebSocket 长连接，24小时超时

        # 常规代理头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 缓冲设置
        proxy_buffering off;
    }

    # 上传文件静态服务
    location /uploads/ {
        alias /home/app/yujian/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";

        # 禁止执行脚本
        location ~* \.(php|pl|py|jsp|asp|sh|cgi)$ {
            return 403;
        }
    }

    # 健康检查（不记录日志）
    location /health {
        proxy_pass http://yujian_backend;
        access_log off;
    }
}
```

### 6.2 启用配置

```bash
# Ubuntu/Debian
sudo ln -s /etc/nginx/sites-available/yujian /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # 移除默认站点

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

```bash
# CentOS
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. SSL/HTTPS 配置

> **内测阶段也强烈建议配置 HTTPS**，因为 iOS App Transport Security 和 Android 安全策略都要求加密连接。

### 7.1 使用 Let's Encrypt 免费证书（推荐）

```bash
# Ubuntu/Debian 安装 certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 一键获取证书并自动配置 Nginx
sudo certbot --nginx -d your-domain.com

# 设置自动续期
sudo certbot renew --dry-run   # 测试自动续期
# certbot 会自动添加 systemd timer，无需手动配置
```

### 7.2 使用阿里云/腾讯云免费SSL证书

1. 在云控制台申请免费SSL证书（有效期1年）
2. 下载 Nginx 格式证书（`.pem` 和 `.key` 文件）
3. 上传到服务器：

```bash
sudo mkdir -p /etc/nginx/ssl
# 将证书文件上传到此目录
sudo mv your_cert.pem /etc/nginx/ssl/yujian.pem
sudo mv your_cert.key /etc/nginx/ssl/yujian.key
sudo chmod 600 /etc/nginx/ssl/yujian.key
```

4. Nginx 中追加 SSL 配置（在上面的 `server` 块之上新增）：

```nginx
# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书
    ssl_certificate /etc/nginx/ssl/yujian.pem;
    ssl_certificate_key /etc/nginx/ssl/yujian.key;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # ... 其余配置同上节 server 块内容 ...
    client_max_body_size 20m;
    # ...（省略，同上）...
}
```

### 7.3 验证 SSL

```bash
# 浏览器访问 https://your-domain.com/health 确认小锁图标
# 或命令行测试
curl -I https://your-domain.com/health

# SSL 评级检查
# 访问 https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com
```

---

## 8. PM2 进程管理

### 8.1 常用命令

```bash
# 启动（内测用 sandbox，正式用 production）
pm2 start ecosystem.config.js --env sandbox

# 查看状态
pm2 status
pm2 list

# 查看日志
pm2 logs yujian-backend           # 实时日志
pm2 logs yujian-backend --lines 100  # 最近100行

# 重启
pm2 restart yujian-backend

# 停止
pm2 stop yujian-backend

# 删除
pm2 delete yujian-backend

# 监控面板
pm2 monit

# 保存进程列表（服务器重启后自动恢复）
pm2 save

# 查看启动配置
pm2 startup
```

### 8.2 WebSocket 注意事项

当前 [ecosystem.config.js](ecosystem.config.js) 使用 cluster 模式（2实例）。**WebSocket 在 cluster 模式下需要粘性会话**，有两种方案：

**方案A：改为单实例（简单，内测推荐）**

修改 `ecosystem.config.js`：

```js
instances: 1,            // 改为1
exec_mode: 'fork',       // 改为 fork
```

**方案B：保持双实例 + Nginx ip_hash（生产推荐）**

Nginx 的 `upstream` 块中已配置 `ip_hash`，同一个客户端IP始终路由到同一进程，WebSocket 可以正常工作。

### 8.3 内存与自动重启

```js
// ecosystem.config.js 当前配置
max_memory_restart: '1G',   // 内存超1GB自动重启
restart_delay: 4000,         // 重启延迟4秒
```

内测期间如果用户量小，可以将内存限制调低到 `512M` 以提前发现内存泄漏。

---

## 9. 防火墙配置

### 9.1 云服务器安全组（阿里云/腾讯云控制台操作）

在云控制台的**安全组**中开放以下端口：

| 端口 | 协议 | 来源 | 用途 |
|------|------|------|------|
| 22 | TCP | 你的IP/公司IP | SSH远程管理 |
| 80 | TCP | 0.0.0.0/0 | HTTP（Let's Encrypt验证） |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 3000 | TCP | 127.0.0.1 | 应用端口（仅本地访问，不对外开放） |

> **⚠️ 安全提醒**：**不要将 3000 端口对外开放**。外部流量必须走 Nginx（80/443）。

### 9.2 系统防火墙（iptables/firewalld）

```bash
# Ubuntu (ufw)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp     # 确保应用端口不对外开放
sudo ufw enable
sudo ufw status verbose

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

---

## 10. 部署验证

### 10.1 基础验证

```bash
# 1. 检查 PM2 进程状态
pm2 status
# 应显示 yujian-backend 状态为 online

# 2. 检查 Nginx 状态
sudo systemctl status nginx

# 3. 健康检查接口
curl http://127.0.0.1:3000/health
# 应返回: {"code":0,"message":"success","data":{"status":"ok","timestamp":"..."}}

# 4. 通过域名验证
curl https://your-domain.com/health
# 同上

# 5. 检查 WebSocket 端口
curl -I -H "Upgrade: websocket" -H "Connection: Upgrade" https://your-domain.com/
# 应返回 HTTP/1.1 101 Switching Protocols
```

### 10.2 API 接口测试

将 [test-api.js](test-api.js) 中的 `BASE` 地址改为服务器地址后运行：

```bash
# 在本地执行（或服务器上执行）
# 修改 test-api.js 第7行:
# const BASE = 'https://your-domain.com';

node test-api.js
```

预期：**23/23 接口全部通过**。

### 10.3 数据库连接测试

```bash
# 在服务器上
node -e "
const dotenv = require('dotenv');
dotenv.config();
const { testConnection } = require('./src/config/database');
testConnection().then(ok => console.log(ok ? '数据库连接正常' : '数据库连接失败'));
"
```

---

## 11. 日志与监控

### 11.1 日志位置

| 日志类型 | 路径 | 说明 |
|---------|------|------|
| 应用错误日志 | `logs/error.log` | Winston 错误级别 |
| 应用综合日志 | `logs/combined.log` | Winston 全部级别 |
| PM2 输出日志 | `logs/out.log` | 控制台 stdout |
| PM2 错误日志 | `logs/error.log` | 控制台 stderr |
| PM2 自身日志 | `logs/pm2.log` | PM2 进程日志 |
| Nginx 访问日志 | `/var/log/nginx/yujian-access.log` | HTTP 请求 |
| Nginx 错误日志 | `/var/log/nginx/yujian-error.log` | Nginx 错误 |

### 11.2 日志查看

```bash
# 实时查看所有日志
pm2 logs yujian-backend

# 查看应用错误
tail -f logs/error.log

# 查看 Nginx 访问日志（排查请求问题）
tail -f /var/log/nginx/yujian-access.log

# 统计API请求量
cat /var/log/nginx/yujian-access.log | awk '{print $7}' | sort | uniq -c | sort -rn | head -20
```

### 11.3 基础监控

```bash
# PM2 实时监控
pm2 monit

# 系统资源
htop                 # CPU/内存
df -h                # 磁盘
iptraf-ng            # 网络流量
```

### 11.4 日志轮转（防止磁盘写满）

PM2 自带日志轮转模块：

```bash
# 安装 pm2-logrotate
pm2 install pm2-logrotate

# 配置：单文件最大10MB，保留30个历史文件
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30

# 配置 Nginx 日志轮转（通常已默认配置）
# 检查: cat /etc/logrotate.d/nginx
```

---

## 12. 内测注意事项

### 12.1 当前为模拟模式的项目

| 功能 | 内测状态 | 说明 |
|------|---------|------|
| 📱 短信验证码 | 固定 `123456` | 所有手机号通用，不需要真实短信服务 |
| 💰 支付 | 模拟成功 | 支付接口直接返回成功，不扣真实资金 |
| 🔔 推送通知 | 日志模拟 | 推送内容输出到日志，不发送真实推送 |
| 🖼️ 图片存储 | 本地 `uploads/` | 注意磁盘空间，定期清理 |
| 🛡️ 图片审核 | 敏感词过滤 | 无AI鉴黄，需人工巡查 |
| 📹 视频/语音通话 | WebSocket信令 | 仅信令层，无媒体中转服务器 |

### 12.2 安全清单

- [x] `.env` 中包含 `.gitignore`，不会被提交到仓库
- [x] 数据库密码为强密码（至少16位，含大小写字母+数字+符号）
- [x] JWT_SECRET 为至少32位随机字符串
- [x] Nginx 已配置 HTTPS
- [x] 3000 端口不对外开放
- [x] MySQL 未开放远程连接（`bind-address = 127.0.0.1`）
- [x] Redis 已配置密码
- [x] Helmet 安全头已启用
- [x] 全局限流已启用（每IP 15分钟内最多100次请求）

### 12.3 每日运维

```bash
# 检查服务状态
pm2 status
sudo systemctl status nginx mysql redis

# 检查磁盘
df -h
# 特别是 uploads 目录的增长

# 检查错误日志
tail -50 logs/error.log

# 数据库备份（建议加入 crontab 每日执行）
mkdir -p /home/app/backups
mysqldump -u yujian -p yujian | gzip > /home/app/backups/yujian_$(date +%Y%m%d).sql.gz

# 保留最近7天的备份
find /home/app/backups -name "yujian_*.sql.gz" -mtime +7 -delete
```

### 12.4 内测用户管理

```bash
# 将内测用户设为管理员（可通过管理后台查看数据）
mysql -u yujian -p yujian -e "UPDATE users SET role='admin' WHERE phone='138xxxx8888';"

# 查看注册用户数
mysql -u yujian -p yujian -e "SELECT COUNT(*) AS total_users FROM users;"

# 查看今日活跃度
mysql -u yujian -p yujian -e "
SELECT
  (SELECT COUNT(*) FROM users WHERE DATE(created_at)=CURDATE()) AS new_users,
  (SELECT COUNT(*) FROM messages WHERE DATE(created_at)=CURDATE()) AS messages_today,
  (SELECT COUNT(*) FROM likes WHERE DATE(created_at)=CURDATE()) AS likes_today;
"
```

---

## 13. 常见问题排查

### Q1: PM2 显示 online 但访问 502

```bash
# 检查应用是否真的在监听
curl http://127.0.0.1:3000/health

# 检查 PM2 错误日志
pm2 logs yujian-backend --err --lines 20

# 常见原因：MySQL/Redis 连接失败、JWT_SECRET 未配置
```

### Q2: 数据库连接失败

```bash
# 确认 MySQL 正在运行
sudo systemctl status mysql

# 测试连接
mysql -u yujian -p -h 127.0.0.1 yujian -e "SELECT 1;"

# 检查 MySQL 绑定地址
sudo grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf
# 或 CentOS: sudo grep bind-address /etc/my.cnf
# 应显示: bind-address = 127.0.0.1
```

### Q3: WebSocket 连接失败

```bash
# 检查 Nginx 配置中是否有这两行（缺一不可）：
# proxy_set_header Upgrade $http_upgrade;
# proxy_set_header Connection "upgrade";

# 如果使用 PM2 cluster 模式，确认 Nginx upstream 中有 ip_hash
# 或临时改为单实例模式排查

# 查看 Nginx 错误日志
sudo tail -20 /var/log/nginx/yujian-error.log
```

### Q4: 文件上传失败

```bash
# 检查 uploads 目录权限
ls -la /home/app/yujian/uploads/
# 应确保 Node.js 进程用户有写入权限

chmod 755 /home/app/yujian/uploads

# 检查 Nginx client_max_body_size 是否足够
sudo grep client_max_body_size /etc/nginx/sites-available/yujian
```

### Q5: CORS 错误

确认 `.env` 中 `ALLOWED_ORIGINS` 包含前端实际访问域名：

```bash
grep ALLOWED_ORIGINS .env
# 应输出: ALLOWED_ORIGINS=https://your-frontend-domain.com
```

### Q6: 服务器重启后服务未自动启动

```bash
# 确认 PM2 startup 已配置
pm2 startup
# 执行输出的命令

# 确认进程列表已保存
pm2 save

# 确认 MySQL/Redis/Nginx 开机自启
sudo systemctl enable mysql redis-server nginx
```

### Q7: 内存使用过高

```bash
# 查看 PM2 内存使用
pm2 list

# 如果接近限制，降低 ecosystem.config.js 中的 max_memory_restart
# 或增加服务器内存

# 查看具体进程内存
pm2 monit
```

---

## 14. 更新部署

后续代码更新时执行：

```bash
cd /home/app/yujian

# 拉取最新代码
git pull origin main

# 安装新依赖（如有）
npm install

# 数据库迁移（如有新的 schema 变更）
# 手动执行新增的 SQL 语句

# 平滑重启（0秒停机）
pm2 reload yujian-backend

# 查看状态
pm2 status
pm2 logs yujian-backend --lines 10
```

> **注意**：如果数据库表结构有变更，需要在重启前先手动执行对应的 `ALTER TABLE` 语句。

---

## 附录：服务器一键部署脚本

将以下内容保存为 `quick-deploy.sh`，首次部署可直接执行：

```bash
#!/bin/bash
set -e

echo "========================================"
echo "  遇见APP后端 - 一键部署脚本"
echo "========================================"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查 .env 是否配置
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env 文件不存在！请先执行: cp .env.example .env 并修改配置${NC}"
    exit 1
fi

# 检查关键配置
source .env 2>/dev/null || true
if [ "$NODE_ENV" = "production" ]; then
    if [ "$JWT_SECRET" = "your_jwt_secret_key" ] || [ -z "$JWT_SECRET" ]; then
        echo -e "${RED}❌ 生产环境必须设置 JWT_SECRET，请在 .env 中配置${NC}"
        exit 1
    fi
    if [ "$DB_PASSWORD" = "123456" ] || [ -z "$DB_PASSWORD" ]; then
        echo -e "${RED}❌ 生产环境必须设置强密码 DB_PASSWORD，请在 .env 中配置${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ 环境变量检查通过${NC}"

# 创建目录
mkdir -p logs uploads

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 测试数据库连接
echo "🔌 测试数据库连接..."
node -e "
const dotenv = require('dotenv');
dotenv.config();
const { testConnection } = require('./src/config/database');
testConnection().then(ok => {
  if (ok) { console.log('✅ 数据库连接正常'); process.exit(0); }
  else { console.log('⚠️  数据库连接失败，将使用内存降级模式'); process.exit(0); }
});
"

# 启动/重启服务
echo "🚀 启动服务..."
if pm2 list | grep -q "yujian-backend"; then
    pm2 reload yujian-backend
    echo -e "${GREEN}✅ 服务已重启${NC}"
else
    pm2 start ecosystem.config.js --env sandbox
    pm2 save
    echo -e "${GREEN}✅ 服务已启动${NC}"
fi

# 健康检查
sleep 3
echo "🏥 健康检查..."
HEALTH=$(curl -s http://127.0.0.1:3000/health || echo '{"code":-1}')
if echo "$HEALTH" | grep -q '"code":0'; then
    echo -e "${GREEN}✅ 健康检查通过${NC}"
else
    echo -e "${RED}❌ 健康检查失败，请检查日志: pm2 logs yujian-backend${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}  部署完成！${NC}"
echo "  访问地址: https://your-domain.com"
echo "  健康检查: https://your-domain.com/health"
echo "  查看日志: pm2 logs yujian-backend"
echo "========================================"
```

---

> 📅 文档版本：v1.0 | 更新日期：2026-06-17 | 适用阶段：内测
