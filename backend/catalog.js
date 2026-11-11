import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * TikTok's public gift list (id -> name, coin value, icon address), cached on
 * disk so icons keep working while offline. Needs no login and no live stream.
 * Every failure is non-fatal: the overlay falls back to its built-in icons.
 */
export class GiftCatalog {
  constructor({ file, language = 'tr-TR', region = 'TR', onUpdate }) {
    this.file = file;
    this.language = language;
    this.region = region;
    this.onUpdate = onUpdate;
    this.gifts = {};
    try {
      this.gifts = JSON.parse(fs.readFileSync(file, 'utf8')).gifts || {};
    } catch {
      /* no cache yet */
    }
  }

  get(id) {
    return id != null ? this.gifts[String(id)] : undefined;
  }

  async refresh() {
    const q = new URLSearchParams({
      aid: '1988',
      app_name: 'tiktok_web',
      device_platform: 'web',
      app_language: this.language,
      browser_language: this.language,
      webcast_language: this.language,
      region: this.region,
      priority_region: this.region,
    });
    try {
      const res = await fetch(`https://webcast.tiktok.com/webcast/gift/list/?${q}`, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = (await res.json())?.data?.gifts;
      if (!Array.isArray(list) || list.length === 0) throw new Error('empty gift list');
      const gifts = {};
      for (const g of list) {
        const icon = g?.image?.url_list?.[0] || g?.icon?.url_list?.[0];
        if (g?.id == null || !icon) continue;
        gifts[String(g.id)] = { name: String(g.name || ''), coins: Number(g.diamond_count) || 0, icon };
      }
      this.gifts = gifts;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ fetchedAt: Date.now(), gifts }));
      console.log(`[catalog] ${Object.keys(gifts).length} gifts loaded`);
      this.onUpdate?.();
      return true;
    } catch (err) {
      console.warn(`[catalog] gift list not refreshed (${err.message}); using ${Object.keys(this.gifts).length} cached`);
      return false;
    }
  }
}
