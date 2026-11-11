import { drawCreature, PALETTES, TAU, hsl } from './creature.js';
import { drawScene, GROUND } from './scene.js';

// Deliberately absent: camera/webcam capture, speech synthesis, and any
// random outcome. Every effect below is a fixed function of the event.

const params = new URLSearchParams(location.search);
const sceneMode = params.get('scene');
if (sceneMode === 'full' || sceneMode === 'off') document.body.classList.add(`scene-${sceneMode}`);
const MUTED = params.get('mute') === '1';
const VOLUME = Math.max(0, Math.min(1, Number(params.get('volume') ?? 1)));

const $ = (id) => document.getElementById(id);
const bg = $('bg');
const mid = $('mid');
const bctx = bg.getContext('2d');
const mctx = mid.getContext('2d');
const TIER_COLORS = ['#7fd3ff', '#7dffb0', '#c9a2ff', '#ffd24a'];
const ACCENTS = { fire: '#ff8c28', water: '#4cc4ff', earth: '#a9c96a', air: '#cfe9ff', light: '#ffe37a', shadow: '#b06bff' };
const fmt = new Intl.NumberFormat('tr-TR');

let config = null;
let state = null;
const effects = []; // { kind, tier, t0, dur }
let finale = null; // { t0, key }

// ---------- sound ----------
const SOUNDS = ['idle', 'tier1', 'tier2', 'tier3', 'tier4', 'leaderboard', 'season'];
// The phone demo page inlines the clips; everywhere else they are plain files.
const sfxUrl = (n) => window.__xyzSfx?.[n] ?? `sfx/${n}.wav`;
const audio = Object.fromEntries(SOUNDS.map((n) => [n, Object.assign(new Audio(sfxUrl(n)), { preload: 'auto' })]));
function play(name, vol = 1, delay = 0) {
  if (MUTED) return;
  setTimeout(() => {
    const a = audio[name].cloneNode();
    a.volume = Math.max(0, Math.min(1, vol * VOLUME));
    a.play().catch(() => {});
  }, delay);
}
function startIdle() {
  if (MUTED) return;
  audio.idle.loop = true;
  audio.idle.play().catch(() => {});
}
startIdle();
addEventListener('pointerdown', startIdle, { once: true }); // browsers outside OBS block autoplay until a gesture

// ---------- UI ----------
function renderLegend() {
  const ul = $('legend-list');
  ul.replaceChildren(
    ...config.tiers.map((t, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--c', TIER_COLORS[i]);
      const range = t.maxCoins == null ? `${fmt.format(t.minCoins)}+ jeton` : `${t.minCoins}–${t.maxCoins} jeton`;
      const fx = t.instantEvolve ? 'Anında evrim!' : `+${t.points} büyüme`;
      li.append(el('span', 'gem'), el('b', '', t.label), el('span', 'range', range), el('span', 'fx', fx));
      return li;
    }),
  );
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderBoard(top) {
  const ol = $('board-list');
  if (!top.length) return ol.replaceChildren(el('li', 'empty', 'İlk destekçi sen ol!'));
  ol.replaceChildren(
    ...top.map((e, i) => {
      const li = el('li');
      li.append(el('span', 'rank', String(i + 1)), el('span', 'name', e.name), el('span', 'coins', fmt.format(e.coins)));
      return li;
    }),
  );
}

function renderState() {
  if (!state || !config) return;
  document.documentElement.style.setProperty('--accent', ACCENTS[state.season.key]);
  $('creature-name').textContent = `${state.season.creature} · ${state.season.element}`;
  $('stage-name').textContent = `${state.stageName} · Evre ${state.stage + 1}/${state.stageCount}`;
  $('bar-fill').style.width = `${(state.progress * 100).toFixed(1)}%`;
  $('growth-pct').textContent = `%${Math.floor(state.progress * 100)}`;
  $('growth-label').textContent = state.isFinalStage
    ? `Sezon finali: ${fmt.format(state.seasonTotal)} / ${fmt.format(state.closeThreshold)} jeton`
    : `Sonraki evre: ${config.stages[state.stage + 1]}`;
  $('stage-dots').replaceChildren(...config.stages.map((_, i) => el('span', i <= state.stage ? 'on' : '')));
  renderBoard(state.top);
}

// Gift notifications are queued so each one stays readable.
const toastQueue = [];
let toastBusy = false;
function toast(who, what, color) {
  toastQueue.push({ who, what, color });
  if (!toastBusy) nextToast();
}
function nextToast() {
  const item = toastQueue.shift();
  const box = $('toast');
  if (!item) {
    toastBusy = false;
    return;
  }
  toastBusy = true;
  box.style.setProperty('--c', item.color);
  box.replaceChildren(el('div', 'who', item.who), el('div', 'what', item.what));
  box.classList.add('show');
  const hold = toastQueue.length > 2 ? 1400 : 2700;
  setTimeout(() => {
    box.classList.remove('show');
    setTimeout(nextToast, 280);
  }, hold);
}

function addChat(sender, text) {
  const box = $('chat');
  const m = el('div', 'msg');
  m.append(el('b', '', sender), document.createTextNode(text));
  box.prepend(m);
  while (box.children.length > 7) box.lastChild.remove();
  setTimeout(() => {
    m.classList.add('out');
    setTimeout(() => m.remove(), 700);
  }, 14000);
}

function showFinale(ev) {
  const box = $('finale');
  const list = el('ul');
  ev.closed.top.slice(0, 3).forEach((e, i) => list.append(el('li', '', `${i + 1}. ${e.name} — ${fmt.format(e.coins)} jeton`)));
  box.replaceChildren(
    el('h1', '', 'SEZON TAMAMLANDI'),
    el('h3', '', `${ev.closed.creature} (${ev.closed.element}) Efsaneler Listesi'ne yazıldı`),
    list,
    el('div', 'next', `Yeni sezon: ${ev.next.creature} · ${ev.next.element}`),
  );
  box.classList.add('show');
  setTimeout(() => box.classList.remove('show'), 10000);
}

// ---------- events ----------
const now = () => performance.now() / 1000;
const GIFT_FX = [
  { kind: 'hop', dur: 0.7 },
  { kind: 'bounce', dur: 1.3 },
  { kind: 'pulse', dur: 1.9 },
  { kind: 'evolve', dur: 2.6 },
];

function onMessage(msg) {
  switch (msg.type) {
    case 'init':
      config = msg.config;
      state = msg.state;
      renderLegend();
      renderState();
      break;
    case 'state':
      state = msg.state;
      renderState();
      break;
    case 'gift': {
      const i = msg.tier - 1;
      effects.push({ ...GIFT_FX[i], tier: i, t0: now() });
      play(`tier${msg.tier}`);
      const count = msg.repeatCount > 1 ? ` ×${msg.repeatCount}` : '';
      toast(msg.sender, `${msg.giftName}${count} · ${msg.tierLabel}`, TIER_COLORS[i]);
      break;
    }
    case 'stage_up':
      if (!msg.instant) {
        effects.push({ kind: 'evolve', dur: 2.6, tier: 3, t0: now() });
        play('tier4', 0.6, 250);
      }
      toast('EVRİM!', `${config.stages[msg.from]} → ${config.stages[msg.to]}`, TIER_COLORS[3]);
      break;
    case 'leaderboard':
      if (msg.orderChanged) {
        play('leaderboard', 0.9, 450);
        $('board').classList.add('flash');
        setTimeout(() => $('board').classList.remove('flash'), 900);
      }
      break;
    case 'season_end':
      finale = { t0: now(), key: msg.closed.key };
      play('season', 1, 300);
      showFinale(msg);
      break;
    case 'chat':
      addChat(msg.sender, msg.text);
      break;
  }
}

// Reconnects quietly; viewers never see a connection message. The backend
// logs the drop and tells the control panel.
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?role=overlay`);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (err) {
      console.error(err);
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = () => ws.close();
}
// The demo page has no backend: it runs the engine in the browser and hands events over directly.
if (window.__xyzDemo) window.__xyzDemo(onMessage);
else connect();

// ---------- render ----------
// Canvases follow their CSS box, so the same code fills a 1920x1080 browser
// source and a small embedded stage.
const DPR = Math.min(2, window.devicePixelRatio || 1);
function resize() {
  for (const c of [bg, mid]) {
    c.width = Math.max(1, Math.round(c.clientWidth * DPR));
    c.height = Math.max(1, Math.round(c.clientHeight * DPR));
  }
}
resize();

const ease = (u) => 1 - (1 - u) ** 3;

function drawBurst(ctx, cx, cy, unit, e, u) {
  const color = TIER_COLORS[e.tier];
  const n = [8, 16, 30, 54][e.tier];
  const reach = [170, 250, 360, 520][e.tier] * unit;
  ctx.save();
  ctx.globalAlpha = 1 - u;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + e.tier; // golden angle: even, fixed spread
    const r = reach * ease(u) * (0.55 + 0.45 * ((i * 7) % 5) / 4);
    const s = (7 + (i % 3) * 3) * unit * (1 - u * 0.5);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r - 60 * unit * Math.sin(Math.PI * u);
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.7, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.7, y);
    ctx.fill();
  }
  ctx.strokeStyle = color;
  for (let k = 0; k < e.tier; k++) {
    const ru = Math.max(0, u - k * 0.14) / (1 - k * 0.14);
    if (ru <= 0) continue;
    ctx.globalAlpha = (1 - ru) * 0.8;
    ctx.lineWidth = (10 - k * 2) * unit * (1 - ru);
    ctx.beginPath();
    ctx.arc(cx, cy, reach * 0.9 * ease(ru), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function frame() {
  requestAnimationFrame(frame);
  if (!state) return;
  if (mid.width !== Math.max(1, Math.round(mid.clientWidth * DPR))) resize();
  const w = mid.width;
  const h = mid.height;
  // Wall-clock based, so reloading the source does not restart the same sequence.
  const T = Date.now() / 1000 - 1.7e9;
  const t = now();
  const unit = Math.min(w / 1920, h / 1080);

  if (!MUTED) audio.idle.volume = VOLUME * Math.max(0.02, 0.1 + 0.05 * Math.sin(T / 37) + 0.03 * Math.sin(T / 11.3));

  const finaleU = finale ? (t - finale.t0) / 4.5 : 1;
  if (finale && finaleU >= 1) finale = null;
  const key = finale ? finale.key : state.season.key;

  if (sceneMode !== 'off') drawScene(bctx, w, h, T, key);

  mctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const groundY = h * GROUND;
  let dy = 0;
  let sx = 1;
  let sy = 1;
  let rot = 0;
  let flash = 0;
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const u = (t - e.t0) / e.dur;
    if (u >= 1) {
      effects.splice(i, 1);
      continue;
    }
    if (e.kind === 'hop') {
      dy -= 46 * Math.sin(Math.PI * u);
      sy *= 1 + 0.08 * Math.sin(TAU * u);
    } else if (e.kind === 'bounce') {
      dy -= 95 * Math.abs(Math.sin(TAU * u)) * (1 - u);
      rot += 0.22 * Math.sin(2 * TAU * u) * (1 - u);
    } else if (e.kind === 'pulse') {
      const k = Math.sin(Math.PI * u);
      sx *= 1 + 0.22 * k;
      sy *= 1 + 0.22 * k;
      dy -= 60 * k;
      rot += TAU * ease(Math.min(1, u * 1.4));
      flash = Math.max(flash, 0.25 * (1 - u));
    } else {
      const k = Math.sin(Math.PI * Math.min(1, u * 1.6));
      sx *= 1 + 0.4 * k;
      sy *= 1 + 0.4 * k;
      dy -= 90 * k;
      flash = Math.max(flash, u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.5));
    }
  }

  const pal = PALETTES[key];
  const scale = unit * 1.1;
  mctx.save();
  mctx.translate(cx, groundY);
  // Ground shadow shrinks while airborne.
  mctx.fillStyle = `rgba(0,0,0,${0.28 + dy * 0.0012})`;
  mctx.beginPath();
  mctx.ellipse(0, 4 * scale, 135 * scale * (1 + dy * 0.002), 22 * scale, 0, 0, TAU);
  mctx.fill();
  if (finale) {
    // Finished creature ascends and dissolves into rays.
    const u = finaleU;
    mctx.save();
    mctx.translate(0, -260 * scale);
    mctx.rotate(T * 0.2);
    for (let i = 0; i < 14; i++) {
      mctx.rotate(TAU / 14);
      mctx.fillStyle = hsl(pal.ah, pal.as, pal.al + 15, 0.35 * Math.sin(Math.PI * u));
      mctx.beginPath();
      mctx.moveTo(0, 0);
      mctx.lineTo(-40 * scale, -900 * scale * ease(u));
      mctx.lineTo(40 * scale, -900 * scale * ease(u));
      mctx.fill();
    }
    mctx.restore();
    mctx.globalAlpha = 1 - u * u;
    mctx.translate(0, -320 * scale * ease(u));
    mctx.scale(scale * (1 + 0.2 * u), scale * (1 + 0.2 * u));
    drawCreature(mctx, key, state.stageCount - 1, T, 1);
  } else {
    mctx.translate(0, dy * scale);
    mctx.scale(scale * sx, scale * sy);
    if (rot) {
      mctx.translate(0, -120);
      mctx.rotate(rot);
      mctx.translate(0, 120);
    }
    drawCreature(mctx, key, state.stage, T, state.progress);
  }
  mctx.restore();

  for (const e of effects) drawBurst(mctx, cx, groundY - 190 * scale, unit, e, (t - e.t0) / e.dur);

  if (flash > 0) {
    const g = mctx.createRadialGradient(cx, groundY - 200 * scale, 0, cx, groundY - 200 * scale, 620 * unit);
    g.addColorStop(0, `rgba(255,255,255,${flash})`);
    g.addColorStop(0.5, `rgba(${pal.glow},${flash * 0.6})`);
    g.addColorStop(1, `rgba(${pal.glow},0)`);
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, w, h);
  }
}
requestAnimationFrame(frame);
