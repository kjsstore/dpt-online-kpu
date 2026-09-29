module.exports = {
  apps: [
    {
      name: "wabot",
      script: "wa-bot/index.js",
      cwd: "/root/BotKJS",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      env: { NODE_ENV: "production" },
      out_file: "./logs/wa-out.log",
      error_file: "./logs/wa-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    },
    {
      name: "sellapp",
      script: "bot.js",
      cwd: "/root/BotKJS",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      env: { NODE_ENV: "production" },
      out_file: "./logs/tg-out.log",
      error_file: "./logs/tg-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};