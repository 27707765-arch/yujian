// 文件名：ecosystem.config.js
// 用途：PM2配置文件

module.exports = {
  apps: [
    {
      name: 'yujian-backend',
      script: 'server.js',
      instances: 1,            // 内测阶段单实例（WebSocket + fork 最稳定）
      exec_mode: 'fork',       // fork 模式兼容 WebSocket，无需 ip_hash
      // 扩容时改为:
      //   instances: 2,
      //   exec_mode: 'cluster',
      //   并同步修改 nginx.conf upstream 为 ip_hash + 多 server
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_sandbox: {
        NODE_ENV: 'production',
        PORT: 3000,
        SMS_SIMULATE: 'true',       // 模拟短信验证码
        SIMULATE_PAYMENT: 'true'    // 模拟支付
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      log_file: './logs/pm2.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      max_memory_restart: '512M',   // 内测阶段适当收紧以提前发现内存问题
      restart_delay: 4000,
      watch: false
    }
  ]
};