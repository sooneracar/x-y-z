import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, createInitialState, ANONYMOUS, SEASONS } from '../backend/engine.js';
import { normalizeGift, StreakAggregator } from '../backend/gifts.js';
import { loadConfig } from '../backend/config.js';

function make() {
  const clock = { t: 1_000_000 };
  const engine = new Engine(loadConfig(), createInitialState(clock.t), () => clock.t);
  return { engine, clock, s: engine.state };
}

test('tiers classify by coin range', () => {
  const { engine } = make();
  assert.deepEqual([1, 9, 10, 99, 100, 999, 1000, 50000].map((c) => engine.classify(c)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(engine.classify(0), -1);
});

test('same gift always gives the same effect', () => {
  const a = make();
  const b = make();
  for (const x of [a, b]) x.engine.processGift({ id: '1', sender: 'A', coins: 5 });
  assert.deepEqual(a.s, b.s);
  assert.equal(a.s.growth, 5);
});

test('duplicate ids are processed once', () => {
  const { engine, s } = make();
  assert.equal(engine.processGift({ id: 'x', sender: 'A', coins: 5 }).accepted, true);
  assert.equal(engine.processGift({ id: 'x', sender: 'A', coins: 5 }).accepted, false);
  assert.equal(s.leaderboard.A, 5);
  const again = new Engine(engine.config, JSON.parse(JSON.stringify(s)), () => 0);
  assert.equal(again.processGift({ id: 'x', sender: 'A', coins: 5 }).accepted, false, 'survives restart');
});

test('anonymous sender is labelled, not an error', () => {
  const { engine, s } = make();
  for (const sender of [undefined, null, '', '   ']) engine.processGift({ sender, coins: 1 });
  assert.equal(s.leaderboard[ANONYMOUS], 4);
});

test('legendary jumps a stage with an empty bar; bar overflow carries over', () => {
  const { engine, s } = make();
  const r = engine.processGift({ id: 'l', sender: 'A', coins: 1000 });
  assert.equal(s.stage, 1);
  assert.equal(s.growth, 0);
  assert.ok(r.events.some((e) => e.type === 'stage_up' && e.instant));
  engine.processGift({ id: 'c', sender: 'A', coins: 100, repeatCount: 3 }); // 360 pts vs threshold 250
  assert.equal(s.stage, 2);
  assert.equal(s.growth, 110);
});

test('decay uses real elapsed time, in one step or many', () => {
  const a = make();
  const b = make();
  for (const x of [a, b]) x.engine.processGift({ sender: 'A', coins: 10, repeatCount: 3 }); // 75
  a.clock.t += 12 * 60_000;
  a.engine.applyDecay();
  for (let i = 0; i < 48; i++) {
    b.clock.t += 15_000;
    b.engine.applyDecay();
  }
  assert.equal(a.s.growth, 75 - 10 * 4); // 2 min grace, then 4/min
  assert.ok(Math.abs(a.s.growth - b.s.growth) < 1e-9);
  a.clock.t += 24 * 3600_000;
  a.engine.applyDecay();
  assert.equal(a.s.growth, 0);
  assert.equal(a.s.stage, 0);
});

test('season closes at final form + total threshold, archives leaderboard, cycles six creatures', () => {
  const { engine, s } = make();
  for (let i = 0; i < 4; i++) engine.processGift({ sender: 'Zed', coins: 1000 });
  assert.equal(s.stage, 4);
  assert.equal(s.seasonIndex, 0, '4000 < 5000: still open');
  const r = engine.processGift({ sender: 'Ada', coins: 999, repeatCount: 2 });
  const end = r.events.find((e) => e.type === 'season_end');
  assert.equal(end.closed.creature, 'Ignara');
  assert.deepEqual(end.closed.top.map((e) => e.name), ['Zed', 'Ada']);
  assert.equal(end.next.creature, 'Aquevo');
  assert.deepEqual([s.stage, s.growth, s.seasonTotal, Object.keys(s.leaderboard).length], [0, 0, 0, 0]);
  assert.equal(s.legends.length, 1);
  for (let n = 1; n < 6; n++) for (let i = 0; i < 5; i++) engine.processGift({ sender: 'Z', coins: 1000 });
  assert.equal(s.seasonIndex, 0);
  assert.deepEqual(s.legends.map((l) => l.creature), SEASONS.map((x) => x.creature));
});

test('leaderboard event reports order changes', () => {
  const { engine } = make();
  const ev = (r) => r.events.find((e) => e.type === 'leaderboard');
  assert.equal(ev(engine.processGift({ sender: 'A', coins: 5 })).orderChanged, true);
  assert.equal(ev(engine.processGift({ sender: 'A', coins: 5 })).orderChanged, false);
  engine.processGift({ sender: 'B', coins: 5 });
  assert.equal(ev(engine.processGift({ sender: 'B', coins: 9 })).top[0].name, 'B');
});

test('streak is merged into one event; late repeat_end is deduped', () => {
  const { engine, s } = make();
  const agg = new StreakAggregator((g) => engine.processGift(g), 10_000);
  const raw = (repeatCount, repeatEnd) => ({
    common: { msgId: `m${repeatCount}${repeatEnd}` },
    giftId: '5655',
    groupId: 'g1',
    repeatCount,
    repeatEnd,
    user: { id: '42', nickname: 'Rose Fan' },
    gift: { type: 1, diamondCount: 1, name: 'Rose', combo: true },
  });
  agg.push(normalizeGift(raw(1, 0)));
  agg.push(normalizeGift(raw(2, 0)));
  agg.push(normalizeGift(raw(7, 0)));
  assert.equal(s.seasonTotal, 0, 'nothing until the streak ends');
  agg.push(normalizeGift(raw(7, 1)));
  assert.equal(s.leaderboard['Rose Fan'], 7);
  assert.equal(s.growth, 35);
  agg.push(normalizeGift(raw(7, 1)));
  assert.equal(s.leaderboard['Rose Fan'], 7);
  agg.push(normalizeGift(raw(3, 0)));
  agg.flushAll(); // timeout / disconnect path
  assert.equal(s.leaderboard['Rose Fan'], 7);
});

test('normalizeGift tolerates the older field layout and junk', () => {
  const n = normalizeGift({ giftId: 1, repeatCount: 1, repeatEnd: 1, giftDetails: { giftType: 2, diamondCount: 500, giftName: 'X' }, user: {} });
  assert.deepEqual([n.coins, n.streakable, n.sender], [500, false, '']);
  assert.equal(normalizeGift(null), null);
  assert.equal(normalizeGift({}), null);
});
