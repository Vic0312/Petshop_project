import express from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createDatabase } from './config/database.js';
import { seedDatabase } from './config/seed.js';
import { apiRoutes } from './routes/api.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const root = fileURLToPath(new URL('.', import.meta.url));

export function createApp(db, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, apiRoutes(db, options));
  app.use('/api', (req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
  app.get('/vendor/vue.js', (req, res) => res.sendFile(resolve(root, `node_modules/vue/dist/vue.esm-browser${process.env.NODE_ENV === 'production' ? '.prod' : ''}.js`)));
  app.use('/assets', express.static(resolve(root, 'assets')));
  app.use('/view', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, express.static(resolve(root, 'view'), { cacheControl: false }));
  app.get('/', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(resolve(root, 'view/index.html')); });
  app.use((error, req, res, next) => {
    if (error.status) return res.status(error.status).json({ message: error.status === 413 ? 'Os dados enviados excedem o tamanho permitido.' : error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON inválido.' });
    if (error.code === 11000) return res.status(409).json({ message: 'Este registro já existe. Atualize a página e tente novamente.' });
    if (error.code === 121) return res.status(400).json({ message: 'Os dados não seguem o formato esperado. Revise os campos.' });
    console.error(error);
    res.status(500).json({ message: 'Não foi possível concluir a operação. Tente novamente.' });
  });
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let db;
  try { db = await createDatabase(); }
  catch { console.error('Não foi possível conectar ao MongoDB. Inicie o serviço MongoDB e confira MONGODB_URI no .env.'); process.exit(1); }
  await seedDatabase(db);
  const app = createApp(db);
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '127.0.0.1', async error => {
    if (error) {
      console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso. Encerre o servidor anterior antes de iniciar o Pataí novamente.` : 'Não foi possível iniciar o servidor Pataí.');
      await db.close();
      process.exitCode = 1;
      return;
    }
    console.log(`Pataí disponível em http://localhost:${port} • MongoDB: ${db.name}`);
  });
  const shutdown = () => { server.close(async () => { await db.close(); process.exit(0); }); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
