import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { logEvent } from './logger';
import { me } from './autentique';
import { closeBrowser } from './pdf';
import { garantirAdminInicial } from './users';
import { adminRouter } from './routes/admin';
import { contratosRouter } from './routes/contratos';
import { configRouter } from './routes/config';
import { publicRouter } from './routes/public';
// Fluxo público reconstruído sobre a tabela `contratos` (formulário do cliente).
// routes/webhook (assinaturas) será religado numa etapa posterior.

const app = express();
app.disable('x-powered-by');
// Confia no proxy da hospedagem conforme configurado (TRUST_PROXY), para que o
// rate limit use o IP real do cliente sem confiar em cabeçalhos arbitrários.
app.set('trust proxy', config.trustProxy);
app.use(cookieParser());

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ ok: true, sandbox: config.autentiqueSandbox }));

// Rotas PÚBLICAS primeiro: têm rate limit e parser de corpo com limite menor (16kb),
// montadas ANTES do parser global para que o limite reduzido prevaleça.
app.use('/api/public', publicRouter);

// Demais rotas usam JSON (limite maior)
app.use(express.json({ limit: '1mb' }));
app.use('/api/admin', adminRouter);
app.use('/api/contratos', contratosRouter);
app.use('/api/config', configRouter);

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

// Garante o administrador inicial (só cria se não houver nenhum usuário)
garantirAdminInicial();

const server = app.listen(config.port, async () => {
  console.log(`\n➡  Servidor ouvindo em http://localhost:${config.port}`);
  console.log(`   Sandbox Autentique: ${config.autentiqueSandbox ? 'LIGADO (teste, sem custo)' : 'DESLIGADO (produção)'}`);
  // Em teste/desenvolvimento (OFFLINE) NÃO executamos me() — nenhuma chamada de rede no
  // startup local. Em produção, a checagem de conexão continua valendo.
  if (config.autentiqueOffline) {
    console.log('   Autentique: modo OFFLINE — checagem de conexão (me) desativada neste ambiente.');
    logEvent('servidor_iniciado', { autentique: 'offline', sandbox: config.autentiqueSandbox });
  } else {
    try {
      const user = await me();
      console.log(`   Autentique conectado: ${user.name} <${user.email}>`);
      logEvent('servidor_iniciado', { autentique: user.email, sandbox: config.autentiqueSandbox });
    } catch (err: any) {
      console.error(`   ⚠  Falha ao conectar no Autentique: ${String(err?.message ?? err)}`);
    }
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
