// Configuração do PM2 para rodar o backend na VPS.
// Uso: pm2 start ecosystem.config.cjs   (e depois: pm2 save)
const { resolve } = require('node:path');

module.exports = {
  apps: [
    {
      name: 'contratos',
      cwd: resolve(__dirname, 'server'),
      // Roda o TypeScript direto via tsx (sem etapa de build).
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx --no-warnings',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
