import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import { ROOT, loadConfig } from './config.js';
import { Store } from './store.js';
import { Engine, createInitialState } from './engine.js';
import { Health } from './health.js';
import { Connector } from './connector.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PANEL_TOKEN = process.env.PANEL_TOKEN || '';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, 'logs');

const config = loadConfig();
const store = new Store(path.join(DATA_DIR, 'state.json'));
const state = store.load(() => createInitialState(Date.now()));
const engine = new Engine(config, state);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const publicConfig = {
  tiers: config.tiers.map(({ id, label, minCoins, maxCoins, points, instantEvolve, showcase }) => ({
    id,
    label,
    minCoins,
    maxCoins,
    points,
    instantEvolve: Boolean(instantEvolve),
    // The gift viewers see on screen for this tier (name + icon).
    showcase: { name: showcase?.name || label, icon: showcase?.icon || '' },
  })),
  stages: config.stages.map((s) => s.name),
};

function overlayCount() {
  let n = 0;
  for (const c of wss.clients) if (c.role === 'overlay' && c.readyState === 1) n += 1;
  return n;
}

function fullState() {
  return { type: 'state', state: engine.snapshot(), connection: health.snapshot(), overlays: overlayCount() };
}

function broadcast(msg) {
  const text = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(text);
}

const health = new Health({
  state,
  logFile: path.join(LOG_DIR, 'connection.log'),
  onChange: () => {
    store.save();
    broadcast(fullState());
  },
});

function handleGift(gift) {
  const result = engine.processGift(gift);
  if (!result.accepted) return result;
  store.save();
  for (const ev of result.events) broadcast(ev);
  broadcast(fullState());
  return result;
}

// One catch-up pass on boot covers the time the process was down.
if (engine.applyDecay()) store.save();
setInterval(() => {
  if (engine.applyDecay()) {
    store.save();
    broadcast(fullState());
  }
}, config.decay.tickSeconds * 1000);

const connector = new Connector({
  username: (process.env.TIKTOK_USERNAME || '').replace(/^@/, '').trim(),
  apiKey: process.env.EULER_API_KEY || '',
  health,
  streakTimeoutMs: config.combo.streakTimeoutSeconds * 1000,
  onGift: (g) => handleGift({ ...g, source: 'tiktok' }),
  onChat: ({ sender, text }) => broadcast({ type: 'chat', sender: sender || 'Gizli Destekçi', text: text.slice(0, 200) }),
});

function tokenOk(given) {
  if (!PANEL_TOKEN) return true;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(PANEL_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireToken(req, res, next) {
  if (tokenOk(req.get('x-panel-token'))) return next();
  res.status(401).json({ ok: false, error: 'Yetkisiz: panel anahtarı gerekli.' });
}

app.use(express.json({ limit: '4kb' }));
app.get('/', (_req, res) => res.redirect('/panel/'));
app.use('/overlay', express.static(path.join(ROOT, 'overlay')));
app.use('/panel', express.static(path.join(ROOT, 'control-panel')));
app.get('/api/config', (_req, res) => res.json(publicConfig));
app.get('/api/state', (_req, res) => res.json(fullState()));
app.get('/api/legends', (_req, res) => res.json(state.legends));

// Manual fallback: goes through exactly the same path as a real gift.
app.post('/manual-trigger', requireToken, (req, res) => {
  const { tier, sender } = req.body || {};
  const index = typeof tier === 'number' ? tier - 1 : config.tiers.findIndex((t) => t.id === tier);
  const t = config.tiers[index];
  if (!t) return res.status(400).json({ ok: false, error: 'Geçersiz kademe. 1-4 veya ucuz/orta/nadir/efsanevi.' });
  const result = handleGift({
    id: `manual:${crypto.randomUUID()}`,
    sender: typeof sender === 'string' ? sender : '',
    giftName: t.showcase?.name || t.label,
    coins: t.manualCoins ?? t.minCoins,
    repeatCount: 1,
    source: 'manual',
  });
  res.json({ ok: result.accepted, state: engine.snapshot() });
});

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ ok: false, error: err.type === 'entity.parse.failed' ? 'Geçersiz JSON.' : 'Sunucu hatası.' });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  ws.role = url.searchParams.get('role') === 'overlay' ? 'overlay' : 'panel';
  if (ws.role === 'panel' && !tokenOk(url.searchParams.get('token'))) return ws.close(4401, 'unauthorized');
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('error', () => {});
  ws.send(JSON.stringify({ ...fullState(), type: 'init', config: publicConfig }));
  if (ws.role === 'overlay') {
    health.log('OVERLAY connected');
    broadcast(fullState());
    // Viewers never see this; only the panel and the log do.
    ws.on('close', () => {
      health.log('OVERLAY disconnected');
      broadcast(fullState());
    });
  }
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

// The connector must never take the backend down with it.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

function shutdown() {
  connector.stop();
  store.saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  console.log(`[X~Y~Z] backend  http://${HOST}:${PORT}`);
  console.log(`  overlay : http://${HOST}:${PORT}/overlay/`);
  console.log(`  panel   : http://${HOST}:${PORT}/panel/`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !PANEL_TOKEN) {
    console.warn('  UYARI: HOST dışa açık ama PANEL_TOKEN boş — manuel tetikleme herkese açık.');
  }
  connector.start().catch((err) => console.error('[connector] start failed:', err));
});
