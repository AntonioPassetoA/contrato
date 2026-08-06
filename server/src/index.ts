import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { logEvent } from './logger';
import { me } from './autentique';
import { closeBrowser } from './pdf';
import { adminRouter } from './routes/admin';
import { publicRouter } from './routes/public';
import { webhookRouter } from './routes/webhook';

const app = express();
app.disable('x-powered-by');
app.use(cookieParser());

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ ok: true, sandbox: config.autentiqueSandbox }));

// Webhook ANTES do express.json (precisa do corpo cru para validar HMAC)
app.use('/api/webhook', webhookRouter);

// Demais rotas usam JSON
app.use(express.json({ limit: '1mb' }));
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);

// Servir o frontend buildado (web/dist), se existir
const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback (rotas /admin, /c/:token são do front)
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.type('text/plain').send('Backend no ar. Rode o frontend (web) ou faça o build dele.')
  );
}

const server = app.listen(config.port, async () => {
  console.log(`\n➡  Servidor ouvindo em http://localhost:${config.port}`);
  console.log(`   Sandbox Autentique: ${config.autentiqueSandbox ? 'LIGADO (teste, sem custo)' : 'DESLIGADO (produção)'}`);
  try {
    const user = await me();
    console.log(`   Autentique conectado: ${user.name} <${user.email}>`);
    logEvent('servidor_iniciado', { autentique: user.email, sandbox: config.autentiqueSandbox });
  } catch (err: any) {
    console.error(`   ⚠  Falha ao conectar no Autentique: ${String(err?.message ?? err)}`);
  }
});

async function shutdown() {
  console.log('\nEncerrando...');
  server.close();
  await closeBrowser().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
