// Pure game logic. No I/O, no randomness: the same gift always has the same effect.

export const SEASONS = [
  { key: 'fire', element: 'Ateş', creature: 'Ignara' },
  { key: 'water', element: 'Su', creature: 'Aquevo' },
  { key: 'earth', element: 'Toprak', creature: 'Terrok' },
  { key: 'air', element: 'Hava', creature: 'Zefira' },
  { key: 'light', element: 'Işık', creature: 'Luminox' },
  { key: 'shadow', element: 'Gölge', creature: 'Umbrix' },
];

export const ANONYMOUS = 'Gizli Destekçi';
const MAX_PROCESSED_IDS = 5000;

export function createInitialState(now) {
  return {
    version: 1,
    seasonIndex: 0,
    seasonNumber: 1,
    stage: 0,
    growth: 0,
    seasonTotal: 0,
    leaderboard: {},
    legends: [],
    lastEventAt: now,
    lastDecayAt: now,
    lastGift: null,
    processedIds: [],
    outages: [],
  };
}

export function cleanSender(raw) {
  const s = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 40);
  return s || ANONYMOUS;
}

export class Engine {
  constructor(config, state, now = () => Date.now()) {
    this.config = config;
    this.state = state;
    this.now = now;
    this.seen = new Set(state.processedIds);
  }

  get finalStage() {
    return this.config.stages.length - 1;
  }

  /** Tier index (0-3) for a gift's unit coin value, or -1 when it is below the first tier. */
  classify(coins) {
    const tiers = this.config.tiers;
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (coins >= t.minCoins && (t.maxCoins == null || coins <= t.maxCoins)) return i;
    }
    return -1;
  }

  top(n = 3) {
    return Object.entries(this.state.leaderboard)
      .map(([name, coins]) => ({ name, coins }))
      .sort((a, b) => b.coins - a.coins || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .slice(0, n);
  }

  /**
   * Shrinks the growth bar for the real time that passed without a gift.
   * Works from timestamps, so one call after a long downtime gives the same
   * result as many periodic ticks would have.
   */
  applyDecay() {
    const s = this.state;
    const now = this.now();
    const { graceSeconds, pointsPerMinute } = this.config.decay;
    const from = Math.max(s.lastDecayAt, s.lastEventAt + graceSeconds * 1000);
    s.lastDecayAt = Math.max(s.lastDecayAt, now);
    if (now <= from || s.stage >= this.finalStage || s.growth <= 0) return false;
    const before = s.growth;
    s.growth = Math.max(0, s.growth - ((now - from) / 60000) * pointsPerMinute);
    return s.growth !== before;
  }

  /**
   * Applies one (already combo-merged) gift.
   * @returns {{accepted: boolean, reason?: string, events: object[]}}
   */
  processGift({ id, sender, giftName, coins, repeatCount = 1, source = 'tiktok' }) {
    const s = this.state;
    if (id != null) {
      if (this.seen.has(id)) return { accepted: false, reason: 'duplicate', events: [] };
      this.seen.add(id);
      s.processedIds.push(id);
      if (s.processedIds.length > MAX_PROCESSED_IDS) {
        for (const old of s.processedIds.splice(0, s.processedIds.length - MAX_PROCESSED_IDS)) this.seen.delete(old);
      }
    }
    const unit = Math.floor(Number(coins));
    const count = Math.max(1, Math.floor(Number(repeatCount)) || 1);
    const tierIndex = Number.isFinite(unit) ? this.classify(unit) : -1;
    if (tierIndex < 0) return { accepted: false, reason: 'no-tier', events: [] };

    this.applyDecay();
    const now = this.now();
    s.lastEventAt = now;
    s.lastDecayAt = now;

    const tier = this.config.tiers[tierIndex];
    const name = cleanSender(sender);
    const totalCoins = unit * count;
    const points = tier.points * (this.config.combo.multiplyPointsByRepeatCount ? count : 1);
    const topBefore = this.top(3);
    const events = [];

    s.leaderboard[name] = (s.leaderboard[name] || 0) + totalCoins;
    s.seasonTotal += totalCoins;
    s.lastGift = { sender: name, giftName: giftName || tier.label, tier: tierIndex + 1, totalCoins, at: now };
    events.push({
      type: 'gift',
      tier: tierIndex + 1,
      tierId: tier.id,
      tierLabel: tier.label,
      sender: name,
      giftName: giftName || tier.label,
      coins: unit,
      repeatCount: count,
      totalCoins,
      points,
      source,
    });

    let closeNow = false;
    if (tier.instantEvolve) {
      if (s.stage < this.finalStage) {
        events.push({ type: 'stage_up', from: s.stage, to: s.stage + 1, instant: true });
        s.stage += 1;
        s.growth = 0;
      } else if (this.config.season.legendaryClosesAtFinalStage) {
        closeNow = true;
      }
    }
    if (points > 0 && s.stage < this.finalStage) {
      s.growth += points;
      while (s.stage < this.finalStage && s.growth >= this.config.stages[s.stage].threshold) {
        s.growth -= this.config.stages[s.stage].threshold;
        events.push({ type: 'stage_up', from: s.stage, to: s.stage + 1, instant: false });
        s.stage += 1;
      }
      if (s.stage >= this.finalStage) s.growth = 0;
    }

    const topAfter = this.top(3);
    const orderChanged = topAfter.map((e) => e.name).join('\n') !== topBefore.map((e) => e.name).join('\n');
    events.push({ type: 'leaderboard', top: topAfter, orderChanged });

    if (closeNow || (s.stage >= this.finalStage && s.seasonTotal >= this.config.season.closeThresholdCoins)) {
      events.push(this.closeSeason());
    }
    return { accepted: true, events };
  }

  closeSeason() {
    const s = this.state;
    const season = SEASONS[s.seasonIndex];
    const record = {
      seasonNumber: s.seasonNumber,
      key: season.key,
      element: season.element,
      creature: season.creature,
      closedAt: this.now(),
      totalCoins: s.seasonTotal,
      top: this.top(this.config.season.legendsTopN),
    };
    s.legends.push(record);
    s.seasonIndex = (s.seasonIndex + 1) % SEASONS.length;
    s.seasonNumber += 1;
    s.stage = 0;
    s.growth = 0;
    s.seasonTotal = 0;
    s.leaderboard = {};
    const next = SEASONS[s.seasonIndex];
    return { type: 'season_end', closed: record, next: { ...next, seasonNumber: s.seasonNumber } };
  }

  /** Snapshot sent to overlay and panel. */
  snapshot() {
    const s = this.state;
    const season = SEASONS[s.seasonIndex];
    const isFinal = s.stage >= this.finalStage;
    const threshold = isFinal ? this.config.season.closeThresholdCoins : this.config.stages[s.stage].threshold;
    const value = isFinal ? s.seasonTotal : s.growth;
    return {
      season: { ...season, index: s.seasonIndex, number: s.seasonNumber },
      stage: s.stage,
      stageName: this.config.stages[s.stage].name,
      stageCount: this.config.stages.length,
      isFinalStage: isFinal,
      growth: Math.round(value * 10) / 10,
      threshold,
      progress: Math.max(0, Math.min(1, value / threshold)),
      seasonTotal: s.seasonTotal,
      closeThreshold: this.config.season.closeThresholdCoins,
      top: this.top(3),
      lastGift: s.lastGift,
      legends: s.legends.slice(-12),
    };
  }
}
