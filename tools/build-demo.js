// Builds demo/index.html: a single self-contained page that runs the real
// engine and the real overlay in the browser, with on-page gift buttons
// instead of TikTok. For trying the system on a phone without the backend.
//   node tools/build-demo.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

const css = read('overlay/overlay.css')
  .replace(/^\s*font-size: min\(.*$/m, '')
  .replace(/^\* \{.*$/m, '#stage, #stage * { box-sizing: border-box; margin: 0; padding: 0; }')
  .replace(/^html, body \{.*$/m, '')
  .replace(/^body \{ font-family/m, '#stage { font-family')
  .replace(/^canvas, #ui \{ position: fixed;/m, '#stage canvas, #stage #ui { position: absolute;')
  .replace(/([\d.]+)rem/g, 'calc($1 * var(--u))');

const stage = read('overlay/index.html').match(/<body>([\s\S]*?)<script/)[1].trim();
const sfx = Object.fromEntries(
  ['idle', 'tier1', 'tier2', 'tier3', 'tier4', 'leaderboard', 'season'].map((n) => [
    n,
    `data:audio/wav;base64,${fs.readFileSync(path.join(ROOT, 'overlay/sfx', `${n}.wav`)).toString('base64')}`,
  ]),
);

const glue = `
const __cfg = ${read('config/default.json')};
window.__xyzSfx = ${JSON.stringify(sfx)};
{
  const SAMPLE = ['Rose', 'Doughnut', 'Confetti', 'Galaxy'];
  const CHAT = [['Elif', 'Çok tatlı bu ya'], ['Mert', 'Evrim geçirsin!'], ['Selin', 'Hadi bir hediye daha'], ['Baran', 'Efsane olmasına az kaldı'], ['Derya', 'Selam herkese']];
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('tr-TR');
  let engine = new Engine(__cfg, createInitialState(Date.now()));
  let send = () => {};
  let seq = 0;
  let chatAt = 0;
  let count = 1;
  const pub = {
    tiers: __cfg.tiers.map((t) => ({ id: t.id, label: t.label, minCoins: t.minCoins, maxCoins: t.maxCoins, points: t.points, instantEvolve: Boolean(t.instantEvolve) })),
    stages: __cfg.stages.map((s) => s.name),
  };
  const snap = () => ({ type: 'state', state: engine.snapshot() });
  function summary() {
    const s = engine.snapshot();
    $('d-season').textContent = s.season.number + '. sezon · ' + s.season.creature + ' (' + s.season.element + ')';
    $('d-stage').textContent = s.stageName + ' · ' + (s.stage + 1) + '/' + s.stageCount;
    $('d-bar').textContent = '%' + Math.floor(s.progress * 100);
    $('d-total').textContent = fmt.format(s.seasonTotal) + ' / ' + fmt.format(s.closeThreshold);
    $('d-legends').textContent = s.legends.length ? s.legends.map((l) => l.creature).join(' → ') : 'Henüz yok';
  }
  window.__xyzDemo = (onMessage) => {
    send = onMessage;
    send({ ...snap(), type: 'init', config: pub });
    summary();
  };
  __cfg.tiers.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tier';
    b.style.setProperty('--c', 'var(--t' + (i + 1) + ')');
    const name = document.createElement('strong');
    name.textContent = t.label;
    const fx = document.createElement('span');
    fx.textContent = (t.maxCoins == null ? fmt.format(t.minCoins) + '+' : t.minCoins + '–' + t.maxCoins) + ' jeton · ' + (t.instantEvolve ? 'anında evrim' : '+' + t.points + ' büyüme');
    b.append(name, fx);
    b.addEventListener('click', () => {
      const r = engine.processGift({ id: 'demo:' + seq++, sender: $('d-sender').value, giftName: SAMPLE[i], coins: t.manualCoins, repeatCount: count, source: 'demo' });
      r.events.forEach(send);
      send(snap());
      summary();
    });
    $('d-tiers').append(b);
  });
  for (const b of document.querySelectorAll('#d-count button')) {
    b.addEventListener('click', () => {
      count = Number(b.dataset.n);
      for (const o of document.querySelectorAll('#d-count button')) o.setAttribute('aria-pressed', String(o === b));
    });
  }
  $('d-chat').addEventListener('click', () => {
    const [sender, text] = CHAT[chatAt++ % CHAT.length];
    send({ type: 'chat', sender, text });
  });
  $('d-reset').addEventListener('click', () => {
    engine = new Engine(__cfg, createInitialState(Date.now()));
    send(snap());
    summary();
  });
  setInterval(() => {
    if (engine.applyDecay()) {
      send(snap());
      summary();
    }
  }, __cfg.decay.tickSeconds * 1000);
}
`;

const page = `<title>[X~Y~Z] Test Sahnesi</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap">
<style>
/* Layout: the 16:9 stream stage on top at full width, the test desk below it in one column. */
:root {
  color-scheme: dark;
  --page: #0f1119;
  --surface: #191c28;
  --line: #2c3146;
  --text: #eceef6;
  --muted: #9aa1b8;
  --stage-ground: #23273a;
  --on-tier: #10121a;
  --display: "Space Grotesk", "Trebuchet MS", system-ui, sans-serif;
  --body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SFMono-Regular", Consolas, monospace;
}
body { background: var(--page); color: var(--text); font-family: var(--body); font-size: 15px; line-height: 1.5; }
.wrap { max-width: 980px; margin: 0 auto; padding-block: 16px 32px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 16px; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.head h1 { margin: 0; font: 700 22px/1.2 var(--mono); }
.head p { margin: 0; color: var(--muted); font-size: 13px; }
#stage { position: relative; width: 100%; max-width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 10px; background: var(--stage-ground); color: var(--ink); container-type: inline-size; --u: calc(100cqw / 120); }
.desk { display: grid; gap: 14px; }
.desk h2 { margin: 0; font: 600 12px/1.3 var(--display); letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
#d-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.tier { min-height: 76px; border: 0; border-radius: 12px; background: var(--c); color: var(--on-tier); cursor: pointer; display: grid; place-content: center; gap: 2px; padding: 10px; font-family: var(--body); text-align: center; transition: transform 0.08s; }
.tier strong { font: 700 19px/1.2 var(--display); }
.tier span { font-size: 12px; font-weight: 500; }
.tier:active { transform: scale(0.96); }
.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.row > label { color: var(--muted); font-size: 13px; }
#d-sender { flex: 1 1 200px; min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.seg button, .ghost { background: var(--surface); color: var(--text); border: 0; padding: 9px 14px; font: 500 14px var(--body); cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button[aria-pressed="true"] { background: var(--text); color: var(--page); }
.ghost { border: 1px solid var(--line); border-radius: 10px; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px 16px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
dt { color: var(--muted); font-size: 12px; }
dd { margin: 0; font: 600 16px/1.3 var(--display); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.note { margin: 0; color: var(--muted); font-size: 13px; max-width: 65ch; }
@media (prefers-reduced-motion: reduce) { .tier { transition: none; } }
${css}
</style>
<div class="wrap">
  <header class="head">
    <h1>[X~Y~Z]</h1>
    <p>Test sahnesi · TikTok'a bağlı değil</p>
  </header>
  <div id="stage">
${stage}
  </div>
  <section class="desk">
    <h2>Hediye gönder</h2>
    <div id="d-tiers"></div>
    <div class="row">
      <label for="d-sender">Gönderen</label>
      <input id="d-sender" maxlength="40" placeholder="Boş bırakılırsa: Gizli Destekçi">
    </div>
    <div class="row">
      <label id="d-count-label">Seri adedi</label>
      <div class="seg" id="d-count" role="group" aria-labelledby="d-count-label">
        <button type="button" data-n="1" aria-pressed="true">×1</button>
        <button type="button" data-n="10" aria-pressed="false">×10</button>
        <button type="button" data-n="50" aria-pressed="false">×50</button>
      </div>
      <button type="button" class="ghost" id="d-chat">Örnek yorum</button>
      <button type="button" class="ghost" id="d-reset">Baştan başlat</button>
    </div>
    <h2>Durum</h2>
    <dl>
      <div><dt>Sezon</dt><dd id="d-season">—</dd></div>
      <div><dt>Evre</dt><dd id="d-stage">—</dd></div>
      <div><dt>Büyüme barı</dt><dd id="d-bar">—</dd></div>
      <div><dt>Sezon toplamı (jeton)</dt><dd id="d-total">—</dd></div>
      <div><dt>Efsaneler Listesi</dt><dd id="d-legends">—</dd></div>
    </dl>
    <p class="note">Bu sayfa gerçek sistemin oyun mantığını ve overlay'ini tarayıcıda çalıştırır; hediyeler TikTok yerine yukarıdaki butonlardan gelir. Ses ilk dokunuştan sonra açılır. Sayfa yenilenince durum sıfırlanır. Hediye gelmezse bar 2 dakika sonra gerilemeye başlar.</p>
  </section>
</div>
<script type="module">
${strip(read('backend/engine.js'))}
${strip(read('overlay/creature.js'))}
${strip(read('overlay/scene.js'))}
${glue}
${strip(read('overlay/overlay.js'))}
</script>
`;

fs.mkdirSync(path.join(ROOT, 'demo'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'demo', 'index.html'), page);
console.log(`demo/index.html  ${(page.length / 1048576).toFixed(1)} MB`);
