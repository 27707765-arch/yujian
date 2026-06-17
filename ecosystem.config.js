// 文件名：ecosystem.config.js
// 用途：PM2配置文件

module.exports = {
  apps: [
    {
      name: 'yujian-backend',
      script: 'server.js',
      instances: 2, // 启动2个实例
      exec_mode: 'cluster', // 集群模式
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      log_file: './logs/pm2.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      max_memory_restart: '1G', // 内存使用超过1G时重启
      restart_delay: 4000, // 重启延迟
      watch: false // 生产环境不启用watch
    }
  ]
};