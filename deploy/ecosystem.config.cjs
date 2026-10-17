module.exports = {
  apps: [
    {
      name: 'cravora-api',
      cwd: '/var/www/cravora-quote/backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
