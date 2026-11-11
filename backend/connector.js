import { normalizeGift, StreakAggregator } from './gifts.js';

const BACKOFF_SECONDS = [5, 10, 20, 30, 60];

/**
 * Wraps tiktok-live-connector. Every failure path ends in a scheduled retry;
 * nothing here is allowed to throw into the server process.
 */
export class Connector {
  constructor({ username, apiKey, health, onGift, onChat, streakTimeoutMs }) {
    this.username = username;
    this.apiKey = apiKey;
    this.health = health;
    this.onChat = onChat;
    this.streaks = new StreakAggregator(onGift, streakTimeoutMs);
    this.attempt = 0;
    this.timer = null;
    this.conn = null;
    this.stopped = false;
  }

  async start() {
    if (!this.username) {
      this.health.set('disabled', 'TIKTOK_USERNAME tanımlı değil');
      return;
    }
    await this.connect();
  }

  async connect() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.health.set(this.health.everConnected ? 'disconnected' : 'connecting', 'bağlanıyor');
    let lib;
    try {
      lib = await import('tiktok-live-connector');
    } catch (err) {
      this.health.set('disconnected', `connector yüklenemedi: ${err.message}`);
      return this.retry();
    }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    try {
      this.teardown();
      const conn = new TikTokLiveConnection(this.username, this.apiKey ? { signApiKey: this.apiKey } : {});
      this.conn = conn;
      const guard = (fn) => (data) => {
        try {
          fn(data);
        } catch (err) {
          console.error('[connector] handler error:', err);
        }
      };
      conn.on(WebcastEvent.GIFT, guard((d) => this.streaks.push(normalizeGift(d))));
      conn.on(
        WebcastEvent.CHAT,
        guard((d) => {
          const text = d?.content ?? d?.comment;
          if (text) this.onChat({ sender: d.user?.nickname || d.user?.displayId || d.user?.uniqueId || '', text: String(text) });
        }),
      );
      conn.on(ControlEvent.DISCONNECTED, guard((e) => this.lost(`bağlantı koptu${e?.code ? ` (${e.code})` : ''}`, conn)));
      conn.on(WebcastEvent.STREAM_END, guard(() => this.lost('yayın sona erdi', conn)));
      conn.on(ControlEvent.ERROR, guard((e) => console.error('[connector] error:', e?.info || e?.message || e)));
      await conn.connect();
      if (this.conn !== conn) return;
      this.attempt = 0;
      this.health.set('connected', `@${this.username}`);
    } catch (err) {
      this.health.set('disconnected', shortError(err));
      this.retry();
    }
  }

  lost(reason, conn) {
    if (conn !== this.conn || this.stopped) return;
    this.streaks.flushAll();
    this.health.set('disconnected', reason);
    this.retry();
  }

  retry() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const wait = BACKOFF_SECONDS[Math.min(this.attempt, BACKOFF_SECONDS.length - 1)];
    this.attempt += 1;
    this.timer = setTimeout(() => this.connect().catch((e) => console.error('[connector]', e)), wait * 1000);
  }

  teardown() {
    const old = this.conn;
    this.conn = null;
    if (!old) return;
    try {
      old.removeAllListeners?.();
      old.on?.('error', () => {});
      Promise.resolve(old.disconnect?.()).catch(() => {});
    } catch {
      /* already gone */
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.streaks.flushAll();
    this.teardown();
  }
}

function shortError(err) {
  const msg = String(err?.message || err || 'bilinmeyen hata');
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
}
