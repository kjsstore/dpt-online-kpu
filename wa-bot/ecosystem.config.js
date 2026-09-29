module.exports = {
  apps: [
    {
      name: "wabot",
      script: "index.js",
      cwd: "/root/BotKJS/wa-bot",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production"
      },
      out_file: "/root/.pm2/logs/wabot-out.log",
      error_file: "/root/.pm2/logs/wabot-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};