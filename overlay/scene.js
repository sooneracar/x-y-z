// Background habitat. Light, haze and weather drift on several unrelated
// periods, so the picture never settles into a short visible loop.
import { TAU, hash, hsl } from './creature.js';

/** Vertical position of the ground line, as a fraction of the height. */
export const GROUND = 0.77;

const SCENES = {
  fire: { sky: [18, 70, 16], horizon: [28, 95, 46], ground: [12, 40, 16], orb: '255,190,90', weather: 'ember' },
  water: { sky: [215, 70, 18], horizon: [185, 75, 42], ground: [205, 50, 20], orb: '190,240,255', weather: 'bubble' },
  earth: { sky: [150, 35, 22], horizon: [75, 50, 55], ground: [100, 35, 20], orb: '255,240,180', weather: 'leaf' },
  air: { sky: [212, 60, 48], horizon: [195, 70, 82], ground: [210, 30, 70], orb: '255,255,255', weather: 'streak' },
  light: { sky: [42, 70, 42], horizon: [50, 100, 80], ground: [38, 55, 50], orb: '255,250,210', weather: 'mote' },
  shadow: { sky: [262, 55, 9], horizon: [285, 50, 24], ground: [265, 40, 8], orb: '200,160,255', weather: 'wisp' },
};

export function drawScene(ctx, w, h, T, key) {
  const sc = SCENES[key];
  const day = 0.5 + 0.3 * Math.sin(T / 173) + 0.2 * Math.sin(T / 311 + 1);
  const hueDrift = 6 * Math.sin(T / 229 + 2);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, hsl(sc.sky[0] + hueDrift, sc.sky[1], sc.sky[2] + 10 * day));
  sky.addColorStop(0.7, hsl(sc.horizon[0] + hueDrift, sc.horizon[1], sc.horizon[2] + 8 * day));
  sky.addColorStop(1, hsl(sc.ground[0], sc.ground[1], sc.ground[2]));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun/moon orb on a slow arc
  const oa = T / 420 + 1;
  const ox = w * (0.5 + 0.36 * Math.cos(oa));
  const oy = h * (0.36 - 0.2 * Math.sin(oa));
  const or = h * (0.09 + 0.015 * Math.sin(T / 47));
  const og = ctx.createRadialGradient(ox, oy, or * 0.2, ox, oy, or * 4);
  og.addColorStop(0, `rgba(${sc.orb},${0.75 + 0.15 * day})`);
  og.addColorStop(0.25, `rgba(${sc.orb},0.28)`);
  og.addColorStop(1, `rgba(${sc.orb},0)`);
  ctx.fillStyle = og;
  ctx.fillRect(0, 0, w, h);

  // Haze bands drifting at different speeds
  for (let i = 0; i < 4; i++) {
    const speed = 6 + i * 4.3;
    const bx = ((T * speed + hash(i + 3) * w * 2) % (w * 1.8)) - w * 0.4;
    const by = h * (0.2 + 0.13 * i + 0.02 * Math.sin(T / (31 + i * 7)));
    ctx.fillStyle = `rgba(${sc.orb},${0.05 + 0.04 * Math.sin(T / (53 + i * 11) + i) ** 2})`;
    ctx.beginPath();
    ctx.ellipse(bx, by, w * (0.22 + 0.05 * i), h * 0.035, 0, 0, TAU);
    ctx.fill();
  }

  // Two faceted ridge lines
  for (let layer = 0; layer < 2; layer++) {
    const base = h * (0.66 + layer * 0.1);
    const step = w / 12;
    const light = sc.ground[2] + (layer ? 4 : 14) + 5 * day;
    let px = -step;
    let py = base;
    for (let i = 0; i <= 14; i++) {
      const x = i * step - step;
      const y = base - h * (0.05 + 0.11 * hash(i * 1.7 + layer * 40 + sc.sky[0])) * (layer ? 0.6 : 1);
      if (i > 0) {
        const slope = (y - py) / step;
        ctx.fillStyle = hsl(sc.ground[0], sc.ground[1], light - slope * 14 + 2 * Math.sin(T / 19 + i));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x + 1, y);
        ctx.lineTo(x + 1, h);
        ctx.lineTo(px, h);
        ctx.fill();
      }
      px = x;
      py = y;
    }
  }

  // Low-poly platform under the creature
  const cx = w / 2;
  const cy = h * GROUND;
  const rx = Math.min(w * 0.2, h * 0.36);
  const ry = rx * 0.2;
  for (let i = 0; i < 10; i++) {
    const a = (i * TAU) / 10;
    const b = ((i + 1) * TAU) / 10;
    ctx.fillStyle = hsl(sc.ground[0], sc.ground[1] + 5, sc.ground[2] + 16 + 7 * Math.cos(a + 2.4) + 4 * day);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    ctx.lineTo(cx + Math.cos(b) * rx, cy + Math.sin(b) * ry);
    ctx.fill();
  }

  weather(ctx, w, h, T, sc);
}

function weather(ctx, w, h, T, sc) {
  const gust = 0.5 + 0.5 * Math.sin(T / 61 + 1.5 * Math.sin(T / 23));
  const count = Math.round(18 + 30 * gust);
  const u = h / 1080;
  for (let i = 0; i < count; i++) {
    const r1 = hash(i * 1.37);
    const r2 = hash(i * 2.91 + 5);
    const r3 = hash(i * 4.13 + 9);
    const fadeIn = Math.min(1, (count - i) / 4);
    let x;
    let y;
    switch (sc.weather) {
      case 'ember': {
        const life = (T * (0.05 + 0.06 * r2) + r1) % 1;
        x = w * r3 + 40 * u * Math.sin(T * 0.7 + i);
        y = h * (1 - life);
        ctx.fillStyle = `rgba(255,${150 + 80 * r2},60,${(1 - life) * 0.8 * fadeIn})`;
        ctx.fillRect(x, y, (3 + 4 * r1) * u, (3 + 4 * r1) * u);
        break;
      }
      case 'bubble': {
        const life = (T * (0.025 + 0.03 * r2) + r1) % 1;
        x = w * r3 + 25 * u * Math.sin(T * 0.5 + i * 2);
        y = h * (1 - life);
        ctx.strokeStyle = `rgba(200,240,255,${0.5 * fadeIn})`;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(x, y, (5 + 12 * r1) * u, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'leaf': {
        const life = (T * (0.03 + 0.03 * r2) + r1) % 1;
        x = ((w * r3 + T * 30 * u * (0.5 + r1)) % (w * 1.1)) - w * 0.05;
        y = h * life + 30 * u * Math.sin(T + i);
        const s = (7 + 6 * r1) * u;
        const rot = T * (0.5 + r2) + i;
        ctx.fillStyle = `hsla(${70 + 50 * r2},45%,${40 + 20 * r1}%,${0.7 * fadeIn})`;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(rot) * s, y + Math.sin(rot) * s);
        ctx.lineTo(x + Math.cos(rot + 2.4) * s * 0.6, y + Math.sin(rot + 2.4) * s * 0.6);
        ctx.lineTo(x + Math.cos(rot - 2.4) * s * 0.6, y + Math.sin(rot - 2.4) * s * 0.6);
        ctx.fill();
        break;
      }
      case 'streak': {
        const speed = (160 + 260 * r2) * u * (0.6 + 0.8 * gust);
        x = ((w * r3 * 1.3 + T * speed) % (w * 1.3)) - w * 0.15;
        y = h * (0.08 + 0.8 * r1) + 14 * u * Math.sin(T * 0.8 + i);
        ctx.strokeStyle = `rgba(255,255,255,${(0.18 + 0.25 * r2) * fadeIn})`;
        ctx.lineWidth = (1.5 + 2 * r1) * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (60 + 120 * r2) * u, y + 4 * u);
        ctx.stroke();
        break;
      }
      case 'mote': {
        x = w * (r3 + 0.04 * Math.sin(T * (0.11 + 0.1 * r1) + i));
        y = h * (r1 + 0.05 * Math.sin(T * (0.13 + 0.1 * r2) + i * 2));
        const tw = 0.5 + 0.5 * Math.sin(T * (0.9 + r2) + i * 3);
        ctx.fillStyle = `rgba(255,250,215,${0.75 * tw * fadeIn})`;
        ctx.beginPath();
        ctx.arc(x, y, (2 + 4 * r2) * u, 0, TAU);
        ctx.fill();
        break;
      }
      default: {
        const life = (T * (0.02 + 0.025 * r2) + r1) % 1;
        x = w * r3 + 50 * u * Math.sin(T * 0.3 + i);
        y = h * (1 - life);
        const tw = 0.5 + 0.5 * Math.sin(T * (0.6 + r1) + i * 3);
        ctx.fillStyle = i % 3 ? `rgba(150,90,230,${0.2 * (1 - life) * fadeIn})` : `rgba(235,220,255,${0.7 * tw * fadeIn})`;
        ctx.beginPath();
        ctx.arc(x, y, (i % 3 ? 14 + 22 * r1 : 2 + 2 * r1) * u, 0, TAU);
        ctx.fill();
      }
    }
  }
}
