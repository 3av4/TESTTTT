/**
 * إعداد pm2 — تشغيل نسخة واحدة فقط (البوت يحتاج نسخة واحدة في وضع polling).
 *   pm2 start deploy/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "bitpoin",
      script: "npx",
      args: "tsx server.ts",
      cwd: __dirname + "/..",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      time: true,
      merge_logs: true,
      kill_timeout: 15000,
    },
  ],
};
