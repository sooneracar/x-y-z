// Turns raw connector gift messages into one event per gift or per finished combo.

/**
 * Field names differ between connector/proto versions, so read them tolerantly.
 * Returns null when the message is unusable.
 */
export function normalizeGift(d) {
  if (!d || typeof d !== 'object') return null;
  const g = d.gift || d.giftDetails || d.extendedGiftInfo || {};
  const user = d.user || {};
  const coins = Number(g.diamondCount ?? d.diamondCount ?? 0);
  if (!(coins > 0)) return null;
  const type = g.type ?? g.giftType ?? d.giftType;
  const sender = user.nickname || user.displayId || user.uniqueId || '';
  const userId = String(user.id ?? user.userId ?? user.displayId ?? user.uniqueId ?? sender ?? '');
  const common = d.common || d.event || {};
  return {
    msgId: common.msgId != null ? String(common.msgId) : d.msgId != null ? String(d.msgId) : null,
    createTime: common.createTime != null ? String(common.createTime) : '',
    giftId: String(d.giftId ?? g.id ?? ''),
    giftName: g.name || g.giftName || d.giftName || 'Hediye',
    icon: g.image?.urlList?.[0] || g.icon?.urlList?.[0] || g.image?.url_list?.[0] || '',
    coins,
    repeatCount: Math.max(1, Number(d.repeatCount) || 1),
    repeatEnd: Boolean(Number(d.repeatEnd)),
    streakable: type === 1 || g.combo === true,
    groupId: d.groupId != null ? String(d.groupId) : '',
    sender,
    userId,
  };
}

/**
 * Collapses a combo/streak into a single event.
 * Streak updates are held back; the event fires on repeat_end, or after a
 * timeout if the end message never arrives (e.g. the connection dropped
 * mid-combo). The emitted id is derived from the streak itself, so a late
 * repeat_end after a timeout flush is rejected by the engine's dedup.
 */
export class StreakAggregator {
  constructor(emit, timeoutMs = 8000) {
    this.emit = emit;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.counter = 0;
  }

  push(n) {
    if (!n) return;
    if (!n.streakable) {
      const id = n.msgId
        ? `msg:${n.msgId}`
        : n.createTime
          ? `gift:${n.userId}:${n.giftId}:${n.createTime}:${n.repeatCount}`
          : `local:${Date.now()}:${this.counter++}`;
      this.emit({ id, sender: n.sender, giftName: n.giftName, giftId: n.giftId, icon: n.icon, coins: n.coins, repeatCount: n.repeatCount });
      return;
    }
    const key = `${n.userId}:${n.giftId}:${n.groupId || n.msgId || ''}`;
    const prev = this.pending.get(key);
    if (prev) clearTimeout(prev.timer);
    const entry = { n: { ...n, repeatCount: Math.max(n.repeatCount, prev ? prev.n.repeatCount : 0) }, timer: null };
    this.pending.set(key, entry);
    if (n.repeatEnd) this.flush(key);
    else {
      entry.timer = setTimeout(() => this.flush(key), this.timeoutMs);
      entry.timer.unref?.();
    }
  }

  flush(key) {
    const entry = this.pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(key);
    const { n } = entry;
    this.emit({ id: `streak:${key}`, sender: n.sender, giftName: n.giftName, giftId: n.giftId, icon: n.icon, coins: n.coins, repeatCount: n.repeatCount });
  }

  flushAll() {
    for (const key of [...this.pending.keys()]) this.flush(key);
  }
}
