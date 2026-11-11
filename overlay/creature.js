// Original, procedurally drawn low-poly creatures. Everything is a pure
// function of time: no image assets, no Math.random.

export const TAU = Math.PI * 2;
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const hsl = (h, s, l, a = 1) => `hsla(${h},${Math.max(0, Math.min(100, s))}%,${Math.max(0, Math.min(100, l))}%,${a})`;

export const PALETTES = {
  fire: { h: 14, s: 88, l: 54, ah: 44, as: 100, al: 58, eye: '#2a0d05', glow: '255,140,40' },
  water: { h: 202, s: 78, l: 54, ah: 172, as: 80, al: 62, eye: '#06243a', glow: '80,190,255' },
  earth: { h: 96, s: 34, l: 42, ah: 30, as: 45, al: 46, eye: '#1d1a10', glow: '170,200,110' },
  air: { h: 196, s: 38, l: 80, ah: 262, as: 55, al: 82, eye: '#2b3350', glow: '210,235,255' },
  light: { h: 48, s: 96, l: 66, ah: 34, as: 100, al: 76, eye: '#4a3200', glow: '255,235,150' },
  shadow: { h: 268, s: 46, l: 27, ah: 300, as: 70, al: 52, eye: '#f2e6ff', glow: '170,90,255' },
};

const FEATURES = {
  //        crest: count, arc, len, width, sway, speed, curl     wings: count, len, width, droop
  fire: { crest: [5, 1.3, 74, 34, 0.12, 5.0, 0], wing: [4, 112, 40, -0.5], spin: 0 },
  water: { crest: [3, 0.9, 62, 46, 0.08, 1.2, 0.3], wing: [3, 92, 54, 0.2], spin: 0 },
  earth: { crest: [4, 1.5, 38, 52, 0.01, 0.5, 0], wing: [3, 62, 64, 0.5], spin: 0 },
  air: { crest: [6, 1.4, 82, 20, 0.2, 2.0, 0.5], wing: [6, 134, 26, -0.2], spin: 0 },
  light: { crest: [12, TAU, 52, 16, 0.02, 0.8, 0], wing: [5, 122, 22, -0.7], spin: 0.15 },
  shadow: { crest: [5, 1.5, 78, 26, 0.25, 0.9, 0.8], wing: [4, 124, 30, 0.9], spin: 0 },
};

const STAGE_SCALE = [1, 0.86, 1.0, 1.18, 1.36];

function tri(ctx, ax, ay, bx, by, cx, cy, color) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
}

/** Faceted ellipse: a triangle fan shaded per facet from an upper-left light. */
function blob(ctx, cx, cy, rx, ry, n, col, T, seed, wobble = 0.015) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * TAU) / n;
    const r = 0.93 + 0.14 * hash(seed + i) + wobble * Math.sin(T * 0.9 + i * 1.7 + seed);
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, a]);
  }
  const fx = cx - rx * 0.18;
  const fy = cy - ry * 0.22;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const mid = p[2] + Math.PI / n;
    const light = Math.cos(mid + 2.2);
    const shimmer = 3 * Math.sin(T * 0.6 + i * 2.3 + seed) + 2 * Math.sin(T * 0.23 + i * 0.9);
    tri(ctx, fx, fy, p[0], p[1], q[0], q[1], hsl(col.h, col.s, col.l + 15 * light + shimmer));
  }
}

/** A fan of two-tone spikes: flames, fins, rock plates, feathers, rays or tendrils. */
function spikes(ctx, cx, cy, rx, ry, a0, a1, cfg, col, T, seed) {
  const [count, , len, width, sway, speed, curl] = cfg;
  for (let k = 0; k < count; k++) {
    const u = count === 1 ? 0.5 : k / (count - 1);
    const a = a0 + (a1 - a0) * u + sway * Math.sin(T * speed + k * 1.9 + seed);
    const bx = cx + Math.cos(a) * rx;
    const by = cy + Math.sin(a) * ry;
    const L = len * (0.72 + 0.34 * hash(seed + k * 3)) * (0.9 + 0.14 * Math.sin(T * speed * 1.3 + k * 2.7));
    const ta = a + curl * Math.sin(T * speed * 0.7 + k + seed) * 0.5 + curl * 0.25;
    const tx = bx + Math.cos(ta) * L;
    const ty = by + Math.sin(ta) * L;
    const px = -Math.sin(a) * width * 0.5;
    const py = Math.cos(a) * width * 0.5;
    const ix = bx - Math.cos(a) * 8;
    const iy = by - Math.sin(a) * 8;
    tri(ctx, ix - px, iy - py, tx, ty, ix, iy, hsl(col.ah, col.as, col.al + 8));
    tri(ctx, ix, iy, tx, ty, ix + px, iy + py, hsl(col.ah, col.as, col.al - 10));
  }
}

/** Irregular blink schedule: windows of 3.7 s, blink offset derived from the window index. */
function eyeOpen(T) {
  const k = Math.floor(T / 3.7);
  const local = T - k * 3.7;
  const at = 0.3 + hash(k * 7.3) * 2.9;
  const d = Math.abs(local - at);
  const d2 = hash(k * 3.1) > 0.78 ? Math.abs(local - at - 0.32) : 9;
  const m = Math.min(d, d2);
  return m < 0.09 ? Math.max(0.08, m / 0.09) : 1;
}

function eyes(ctx, cx, cy, gap, size, col, T, key) {
  const open = eyeOpen(T);
  const lx = Math.sin(T * 0.31) * 0.5 + Math.sin(T * 0.113 + 2) * 0.5;
  const ly = Math.sin(T * 0.19 + 1) * 0.4;
  for (const side of [-1, 1]) {
    const ex = cx + side * gap;
    ctx.save();
    ctx.translate(ex, cy);
    ctx.scale(1, open);
    if (key === 'shadow') {
      ctx.shadowColor = `rgba(${col.glow},0.9)`;
      ctx.shadowBlur = size;
    }
    ctx.fillStyle = key === 'shadow' ? col.eye : '#fff';
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 1.15, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = key === 'shadow' ? '#3a1466' : col.eye;
    ctx.beginPath();
    ctx.ellipse(lx * size * 0.35, ly * size * 0.35, size * 0.55, size * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(lx * size * 0.35 - size * 0.2, ly * size * 0.35 - size * 0.25, size * 0.18, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function egg(ctx, col, T, progress) {
  const wob = 0.035 * Math.sin(T * 1.3) + 0.02 * Math.sin(T * 0.47) + progress * 0.06 * Math.sin(T * 7.1);
  ctx.save();
  ctx.translate(0, -112);
  ctx.rotate(wob);
  const glow = 0.25 + 0.2 * Math.sin(T * 0.8) + 0.3 * progress;
  const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 190);
  g.addColorStop(0, `rgba(${col.glow},${glow})`);
  g.addColorStop(1, `rgba(${col.glow},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, 400, 400);
  blob(ctx, 0, 0, 86, 112, 11, { h: col.h, s: col.s - 30, l: Math.min(84, col.l + 24) }, T, 5, 0.004);
  for (let i = 0; i < 4; i++) {
    const a = 0.8 + i * 1.55;
    blob(ctx, Math.cos(a) * 44, Math.sin(a) * 62, 15 + 5 * hash(i), 13 + 4 * hash(i + 9), 5, { h: col.ah, s: col.as, l: col.al }, T, 20 + i, 0);
  }
  // Crack grows from the top as the bar fills.
  const segs = Math.floor(progress * 9);
  if (segs > 0) {
    ctx.strokeStyle = 'rgba(30,20,20,0.75)';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, -108);
    for (let i = 1; i <= segs; i++) ctx.lineTo((i % 2 ? 1 : -1) * (10 + 9 * hash(i * 2.2)), -108 + i * 15);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws the creature with its feet at the origin.
 * @param key element key, stage 0..4, T seconds, progress 0..1 of the current bar
 */
export function drawCreature(ctx, key, stage, T, progress) {
  const col = PALETTES[key];
  const f = FEATURES[key];
  const breath = 0.022 * Math.sin(T * 1.53) + 0.012 * Math.sin(T * 0.94 + 1) + 0.008 * Math.sin(T * 0.556 + 2);
  const sway = 0.02 * Math.sin(T * 0.41) + 0.012 * Math.sin(T * 0.173 + 0.5);
  const sc = STAGE_SCALE[stage];
  ctx.save();
  ctx.scale(sc, sc);
  if (stage === 0) {
    egg(ctx, col, T, progress);
    ctx.restore();
    return;
  }
  ctx.rotate(sway);
  ctx.scale(1 - breath * 0.6, 1 + breath);

  const hasHead = stage >= 2;
  const bodyRx = hasHead ? 112 : 98;
  const bodyRy = hasHead ? 104 : 88;
  const bodyY = -bodyRy - 14;
  const headY = hasHead ? bodyY - bodyRy - 34 : bodyY - 6;
  const headRx = hasHead ? 84 : bodyRx;
  const headRy = hasHead ? 72 : bodyRy;

  if (stage >= 4) {
    const pulse = 0.35 + 0.15 * Math.sin(T * 0.7) + 0.1 * Math.sin(T * 0.29 + 1);
    const g = ctx.createRadialGradient(0, bodyY - 40, 40, 0, bodyY - 40, 330);
    g.addColorStop(0, `rgba(${col.glow},${pulse})`);
    g.addColorStop(1, `rgba(${col.glow},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-340, bodyY - 380, 680, 680);
  }
  if (stage >= 3) {
    const [wc, wl, ww, droop] = f.wing;
    const flap = 0.16 * Math.sin(T * 1.1) + 0.07 * Math.sin(T * 0.37 + 1);
    const cfg = [wc, 0, wl * (stage >= 4 ? 1.25 : 1), ww, 0.05, 1.1, key === 'shadow' ? 0.7 : 0.15];
    spikes(ctx, -bodyRx * 0.55, bodyY - 20, 30, 40, Math.PI + 0.75 - droop + flap, Math.PI - 0.55 - droop + flap, cfg, col, T, 40);
    spikes(ctx, bodyRx * 0.55, bodyY - 20, 30, 40, -0.75 + droop - flap, 0.55 + droop - flap, cfg, col, T, 60);
  }
  if (stage >= 2) {
    // Tail: a chain of shrinking facets that wags on two unrelated periods.
    let tx = bodyRx * 0.7;
    let ty = bodyY + bodyRy * 0.55;
    for (let i = 0; i < 5; i++) {
      const a = -0.2 + i * 0.28 * Math.sin(T * 1.7 + 0.6 * Math.sin(T * 0.31)) - i * 0.12;
      const r = 30 - i * 5;
      blob(ctx, tx, ty, r, r * 0.8, 6, { h: i === 4 ? col.ah : col.h, s: i === 4 ? col.as : col.s, l: (i === 4 ? col.al : col.l) - 6 }, T, 80 + i, 0);
      tx += Math.cos(a) * r * 1.35;
      ty += Math.sin(a) * r * 1.35;
    }
  }
  // Feet
  for (const side of [-1, 1]) blob(ctx, side * bodyRx * 0.48, -12, 34, 18, 6, { h: col.h, s: col.s, l: col.l - 12 }, T, 90 + side, 0);
  blob(ctx, 0, bodyY, bodyRx, bodyRy, 12, col, T, 1);
  blob(ctx, 0, bodyY + bodyRy * 0.28, bodyRx * 0.56, bodyRy * 0.5, 8, { h: col.ah, s: col.as - 20, l: Math.min(90, col.al + 16) }, T, 30, 0.01);
  if (hasHead) {
    // Arms
    for (const side of [-1, 1]) {
      const lift = 0.2 * Math.sin(T * 0.83 + side) + 0.1 * Math.sin(T * 0.29);
      blob(ctx, side * (bodyRx * 0.92), bodyY - 8 - lift * 30, 26, 36, 6, { h: col.h, s: col.s, l: col.l - 8 }, T, 95 + side, 0);
    }
    blob(ctx, 0, headY, headRx, headRy, 11, { h: col.h, s: col.s, l: col.l + 3 }, T, 2);
  }
  // Crest / halo
  const [, arc] = f.crest;
  const cfg = f.crest.slice();
  cfg[2] *= stage === 1 ? 0.6 : stage >= 4 ? 1.3 : 1;
  cfg[3] *= stage === 1 ? 0.7 : 1;
  const rot = f.spin * T;
  if (arc >= TAU) spikes(ctx, 0, headY, headRx * 1.02, headRy * 1.02, rot, rot + TAU * (11 / 12), cfg, col, T, 10);
  else spikes(ctx, 0, headY, headRx * 0.9, headRy * 0.92, -Math.PI / 2 - arc / 2, -Math.PI / 2 + arc / 2, cfg, col, T, 10);
  if (stage >= 3) {
    // Horns
    for (const side of [-1, 1]) {
      const hx = side * headRx * 0.62;
      const hy = headY - headRy * 0.66;
      tri(ctx, hx - 14, hy + 6, hx + side * 26, hy - 62, hx + 14, hy + 6, hsl(col.ah, col.as - 30, col.al + 18));
    }
  }
  const eyeSize = stage === 1 ? 17 : 15;
  eyes(ctx, 0, headY + (hasHead ? 2 : -12), headRx * 0.4, eyeSize, col, T, key);
  // Mouth: a small faceted smile
  const my = headY + (hasHead ? 30 : 22);
  tri(ctx, -13, my, 0, my + 9 + 3 * Math.sin(T * 0.5), 13, my, key === 'shadow' ? col.eye : 'rgba(40,15,15,0.7)');
  if (stage >= 4) {
    // Orbiting shards
    for (let i = 0; i < 6; i++) {
      const a = T * 0.5 + (i * TAU) / 6;
      const ox = Math.cos(a) * 215;
      const oy = bodyY - 50 + Math.sin(a) * 62 + 8 * Math.sin(T * 1.3 + i);
      const s = 12 + 4 * Math.sin(T * 2 + i);
      tri(ctx, ox, oy - s, ox + s * 0.7, oy + s * 0.6, ox - s * 0.7, oy + s * 0.6, hsl(col.ah, col.as, col.al + 14, Math.sin(a) > 0 ? 1 : 0.55));
    }
  }
  ctx.restore();
}
