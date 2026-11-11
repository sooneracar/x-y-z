import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Loads config/default.json, shallow-merged per section with config/local.json if present. */
export function loadConfig(dir = path.join(ROOT, 'config')) {
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'default.json'), 'utf8'));
  const localPath = path.join(dir, 'local.json');
  if (fs.existsSync(localPath)) {
    const local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    for (const [k, v] of Object.entries(local)) {
      base[k] = Array.isArray(v) || typeof v !== 'object' || v === null ? v : { ...base[k], ...v };
    }
  }
  validateConfig(base);
  return base;
}

export function validateConfig(c) {
  const fail = (m) => {
    throw new Error(`config: ${m}`);
  };
  if (!Array.isArray(c.tiers) || c.tiers.length !== 4) fail('exactly 4 tiers are required');
  c.tiers.forEach((t, i) => {
    if (!(t.minCoins >= 1)) fail(`tier ${t.id}: minCoins must be >= 1`);
    if (i < 3 && !(t.maxCoins >= t.minCoins)) fail(`tier ${t.id}: maxCoins must be >= minCoins`);
    if (i > 0 && t.minCoins !== c.tiers[i - 1].maxCoins + 1) fail(`tier ${t.id}: ranges must be contiguous`);
  });
  if (c.tiers[3].maxCoins != null) fail('last tier must be open-ended (maxCoins: null)');
  if (!Array.isArray(c.stages) || c.stages.length < 2) fail('at least 2 stages are required');
  c.stages.slice(0, -1).forEach((s) => {
    if (!(s.threshold > 0)) fail(`stage ${s.name}: threshold must be > 0`);
  });
  if (!(c.season.closeThresholdCoins > 0)) fail('season.closeThresholdCoins must be > 0');
  if (!(c.decay.pointsPerMinute >= 0)) fail('decay.pointsPerMinute must be >= 0');
}
