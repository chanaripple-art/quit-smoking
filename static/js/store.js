/* ==========================================================================
   store.js — state, persistence, derived statistics
   Single source of truth. Everything is kept in localStorage under one key
   so export/import is a straight JSON round-trip.
   ========================================================================== */

import { MS, dayKey, addDays, startOfDay, uid, sum, avg, clamp } from './util.js';
import { ACHIEVEMENTS } from './content.js';

const STORAGE_KEY = 'quit-smoking::state::v1';
const SCHEMA_VERSION = 1;

/* ---------- default state ---------- */

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    profile: {
      quitAt: new Date().toISOString(),
      cigsPerDay: 20,
      cigsPerPack: 20,
      pricePerPack: 25,
      goal: { name: '', amount: 0 },
      notifications: false,
      riskReminder: true,
      onboarded: false,
      createdAt: new Date().toISOString(),
    },
    relapses: [],   // { id, ts, count, triggers[], moods[], note }
    cravings: [],   // { id, ts, intensity, triggers[], moods[], resisted, methods[], note, durationSec }
    diaries: {},    // dayKey -> { smoked, mood, symptoms[], note, weight }
    unlocked: {},   // achievementId -> ISO timestamp
    installedAt: new Date().toISOString(),
  };
}

/* ---------- persistence ---------- */

let state = defaultState();
const listeners = new Set();

function revive(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    version: SCHEMA_VERSION,
    profile: { ...base.profile, ...(raw.profile || {}), goal: { ...base.profile.goal, ...((raw.profile || {}).goal || {}) } },
    relapses: Array.isArray(raw.relapses) ? raw.relapses : [],
    cravings: Array.isArray(raw.cravings) ? raw.cravings : [],
    diaries: raw.diaries && typeof raw.diaries === 'object' ? raw.diaries : {},
    unlocked: raw.unlocked && typeof raw.unlocked === 'object' ? raw.unlocked : {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? revive(JSON.parse(raw)) : defaultState();
  } catch (err) {
    console.warn('[store] failed to load, starting fresh:', err);
    state = defaultState();
  }
  return state;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[store] persist failed (storage full or blocked):', err);
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mutate via a callback, then persist + notify. */
export function update(mutator) {
  const result = mutator(state);
  persist();
  const stats = computeStats();
  const fresh = syncAchievements(stats);
  if (fresh.length) persist();
  listeners.forEach((fn) => fn(state, { fresh, stats }));
  return result;
}

export function replaceState(next) {
  state = revive(next);
  persist();
  const stats = computeStats();
  syncAchievements(stats);
  persist();
  listeners.forEach((fn) => fn(state, { fresh: [], stats }));
}

/* ---------- profile ---------- */

export function saveProfile(patch) {
  return update((s) => {
    s.profile = { ...s.profile, ...patch, goal: { ...s.profile.goal, ...(patch.goal || {}) } };
  });
}

/* ---------- record helpers ---------- */

export function addRelapse(entry) {
  return update((s) => {
    s.relapses.unshift({
      id: uid('rl'),
      ts: entry.ts || new Date().toISOString(),
      count: clamp(Number(entry.count) || 1, 1, 200),
      triggers: entry.triggers || [],
      moods: entry.moods || [],
      note: (entry.note || '').trim(),
    });
  });
}

export function addCraving(entry) {
  return update((s) => {
    s.cravings.unshift({
      id: uid('cv'),
      ts: entry.ts || new Date().toISOString(),
      intensity: clamp(Number(entry.intensity) || 5, 1, 10),
      triggers: entry.triggers || [],
      moods: entry.moods || [],
      resisted: entry.resisted !== false,
      methods: entry.methods || [],
      note: (entry.note || '').trim(),
      durationSec: Math.max(0, Number(entry.durationSec) || 0),
    });
  });
}

export function saveDiary(day, patch) {
  return update((s) => {
    const existing = s.diaries[day] || {};
    const next = { ...existing, ...patch };
    // drop empty entries so streaks stay honest
    const hasContent =
      next.note || next.mood || (next.symptoms && next.symptoms.length) || Number(next.smoked) > 0;
    if (hasContent) s.diaries[day] = next;
    else delete s.diaries[day];
  });
}

export function removeRecord(kind, id) {
  return update((s) => {
    if (kind === 'relapse') s.relapses = s.relapses.filter((r) => r.id !== id);
    if (kind === 'craving') s.cravings = s.cravings.filter((c) => c.id !== id);
    if (kind === 'diary') delete s.diaries[id];
  });
}

export function clearAll() {
  state = defaultState();
  persist();
  listeners.forEach((fn) => fn(state, { fresh: [], stats: computeStats() }));
}

/* ---------- derived statistics ---------- */

export function computeStats(now = Date.now()) {
  const p = state.profile;
  const quitMs = new Date(p.quitAt).getTime();
  const elapsedMs = Math.max(0, now - quitMs);
  const days = elapsedMs / MS.d;

  const perCig = p.cigsPerPack > 0 ? p.pricePerPack / p.cigsPerPack : 0;
  const relapsesAfterQuit = state.relapses.filter((r) => new Date(r.ts).getTime() >= quitMs);

  const smokedSinceQuit = sum(relapsesAfterQuit, (r) => r.count);
  const baselineCigs = Math.floor(days * p.cigsPerDay);
  const avoidedCigs = Math.max(0, baselineCigs - smokedSinceQuit);
  const savedMoney = avoidedCigs * perCig;

  const cravingsResisted = state.cravings.filter((c) => c.resisted).length;
  const cravingsLost = state.cravings.length - cravingsResisted;

  const lastRelapse = state.relapses
    .map((r) => new Date(r.ts).getTime())
    .sort((a, b) => b - a)[0];
  const cleanSince = Math.max(quitMs, lastRelapse || quitMs);
  const cleanStreak = Math.max(0, (now - cleanSince) / MS.d);

  const diaryKeys = Object.keys(state.diaries);

  /* consecutive days with at least one record, ending today or yesterday */
  const activeDays = new Set(diaryKeys);
  state.relapses.forEach((r) => activeDays.add(dayKey(r.ts)));
  state.cravings.forEach((c) => activeDays.add(dayKey(c.ts)));
  let logStreak = 0;
  const today = startOfDay(new Date(now));
  let cursor = activeDays.has(dayKey(today)) ? today : addDays(today, -1);
  while (activeDays.has(dayKey(cursor))) {
    logStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const diaryCount = diaryKeys.filter((k) => {
    const d = state.diaries[k];
    return d && (d.note || d.mood);
  }).length;

  return {
    now,
    elapsedMs,
    days,
    fullDays: Math.floor(days),
    perCig,
    cigsPerDay: p.cigsPerDay,
    pricePerPack: p.pricePerPack,
    cigsPerPack: p.cigsPerPack,
    baselineCigs,
    smokedSinceQuit,
    avoidedCigs,
    savedMoney,
    avoidedTar: avoidedCigs * 0.012,        // ~12 mg tar per cigarette -> grams
    avoidedNicotine: avoidedCigs * 1,       // ~1 mg nicotine per cigarette -> mg
    cravingsTotal: state.cravings.length,
    cravingsResisted,
    cravingsLost,
    cravingSuccessRate: state.cravings.length ? cravingsResisted / state.cravings.length : 0,
    relapseCount: state.relapses.length,
    relapseCigs: sum(state.relapses, (r) => r.count),
    lastRelapseTs: lastRelapse || null,
    cleanStreak,
    logStreak,
    diaryCount,
    recordDays: activeDays.size,
    goalAmount: Number(p.goal?.amount) || 0,
    goalName: p.goal?.name || '',
    sinceQuitAt: quitMs,
  };
}

/* ---------- achievements ---------- */

function syncAchievements(stats) {
  const fresh = [];
  for (const ach of ACHIEVEMENTS) {
    if (state.unlocked[ach.id]) continue;
    let ok = false;
    try { ok = !!ach.check(stats); } catch { ok = false; }
    if (ok) {
      state.unlocked[ach.id] = new Date().toISOString();
      fresh.push(ach);
    }
  }
  return fresh;
}

export function achievementView(stats) {
  return ACHIEVEMENTS.map((a) => {
    let progress = 0;
    try { progress = clamp(Number(a.progress(stats)) || 0, 0, 1); } catch { progress = 0; }
    return { ...a, unlocked: !!state.unlocked[a.id], unlockedAt: state.unlocked[a.id] || null, progress };
  });
}

/* ---------- export / import ---------- */

export function exportJSON() {
  return JSON.stringify({ app: 'quit-smoking', exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  const payload = parsed && parsed.state ? parsed.state : parsed;
  if (!payload || typeof payload !== 'object' || !payload.profile) {
    throw new Error('文件里没有找到戒烟数据');
  }
  replaceState(payload);
  return computeStats();
}

/* ---------- demo data (for previewing the analytics screens) ---------- */

export function seedDemoData() {
  const now = Date.now();
  const quitMs = now - 46 * MS.d - 7 * MS.h;
  const triggers = ['after_meal', 'coffee', 'stress', 'boredom', 'alcohol', 'late_night', 'social', 'work_break'];
  const moods = ['calm', 'anxious', 'irritable', 'down', 'tired', 'happy', 'relaxed'];
  const methods = ['breathe', 'water', 'walk', 'gum', 'talk', 'distract'];

  const pick = (arr, n) => {
    const copy = [...arr];
    const out = [];
    for (let i = 0; i < n && copy.length; i += 1) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    return out;
  };

  const next = defaultState();
  next.profile.quitAt = new Date(quitMs).toISOString();
  next.profile.cigsPerDay = 20;
  next.profile.cigsPerPack = 20;
  next.profile.pricePerPack = 28;
  next.profile.goal = { name: '一副新耳机', amount: 1200 };
  next.profile.onboarded = true;
  next.profile.createdAt = new Date(quitMs).toISOString();

  // a couple of slips, concentrated in the first two weeks
  const slipDays = [4, 6, 9, 11, 13, 21, 33];
  slipDays.forEach((d, i) => {
    const ts = quitMs + d * MS.d + (9 + (i % 8)) * MS.h;
    if (ts > now) return;
    next.relapses.push({
      id: uid('rl'),
      ts: new Date(ts).toISOString(),
      count: i % 3 === 0 ? 2 : 1,
      triggers: pick(triggers, 2),
      moods: pick(moods, 1),
      note: i === 0 ? '朋友递烟，没忍住。' : '',
    });
  });

  // cravings across the whole period, denser early on
  for (let d = 0; d < 46; d += 1) {
    const base = quitMs + d * MS.d;
    const decay = Math.max(0.25, 1 - d / 34);
    const n = Math.round((1 + Math.random() * 4) * decay);
    for (let i = 0; i < n; i += 1) {
      const hour = [9, 10, 13, 14, 15, 16, 20, 21, 22][Math.floor(Math.random() * 9)];
      const ts = base + hour * MS.h + Math.floor(Math.random() * 56) * MS.m;
      if (ts > now) continue;
      const resisted = Math.random() > 0.18 * decay;
      next.cravings.push({
        id: uid('cv'),
        ts: new Date(ts).toISOString(),
        intensity: clamp(Math.round(3 + Math.random() * 6 * decay), 1, 10),
        triggers: pick(triggers, 1 + Math.floor(Math.random() * 2)),
        moods: pick(moods, 1),
        resisted,
        methods: resisted ? pick(methods, 1 + Math.floor(Math.random() * 2)) : ['nothing'],
        note: '',
        durationSec: 60 + Math.floor(Math.random() * 240),
      });
    }
  }

  // diaries with feelings and symptoms
  for (let d = 40; d >= 0; d -= 1) {
    const ts = now - d * MS.d;
    const key = dayKey(new Date(ts));
    if (Math.random() < 0.22) continue;
    next.diaries[key] = {
      smoked: slipDays.includes(45 - d) ? 1 : 0,
      mood: pick(moods, 1)[0],
      symptoms: pick(['cough', 'sleep', 'appetite', 'focus', 'mouth', 'weight'], Math.floor(Math.random() * 2)),
      note: Math.random() < 0.25 ? '今天比昨天好一点。' : '',
      weight: 68 + Math.round(Math.random() * 20) / 10,
    };
  }

  next.relapses.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  next.cravings.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  replaceState(next);
  return computeStats();
}

/* ---------- aggregates used by the analytics view ---------- */

/** Per-day rollup for the calendar heatmap. */
export function dailyRollup() {
  const map = new Map();
  const ensure = (key) => {
    if (!map.has(key)) map.set(key, { key, smoked: 0, cravings: 0, resisted: 0, logged: false });
    return map.get(key);
  };

  for (const r of state.relapses) {
    const cell = ensure(dayKey(r.ts));
    cell.smoked += r.count;
    cell.logged = true;
  }
  for (const c of state.cravings) {
    const cell = ensure(dayKey(c.ts));
    cell.cravings += 1;
    if (c.resisted) cell.resisted += 1;
    cell.logged = true;
  }
  for (const [key, d] of Object.entries(state.diaries)) {
    const cell = ensure(key);
    cell.logged = true;
    if (Number(d.smoked) > 0 && cell.smoked === 0) cell.smoked = Number(d.smoked);
  }
  return map;
}

/** Craving counts bucketed by hour of day. */
export function hourlyHistogram() {
  const buckets = new Array(24).fill(0);
  for (const c of state.cravings) buckets[new Date(c.ts).getHours()] += 1;
  return buckets;
}

/** Trigger frequency + how often it ended in a slip. */
export function triggerStats() {
  const map = new Map();
  const ensure = (id) => {
    if (!map.has(id)) map.set(id, { id, total: 0, slipped: 0, intensitySum: 0, intensityN: 0 });
    return map.get(id);
  };
  for (const c of state.cravings) {
    for (const t of c.triggers) {
      const e = ensure(t);
      e.total += 1;
      if (!c.resisted) e.slipped += 1;
      e.intensitySum += c.intensity;
      e.intensityN += 1;
    }
  }
  for (const r of state.relapses) {
    for (const t of r.triggers) {
      const e = ensure(t);
      e.total += 1;
      e.slipped += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

/** Average craving intensity grouped by mood. */
export function moodStats() {
  const map = new Map();
  for (const c of state.cravings) {
    for (const m of c.moods) {
      if (!map.has(m)) map.set(m, { id: m, n: 0, sum: 0, slipped: 0 });
      const e = map.get(m);
      e.n += 1;
      e.sum += c.intensity;
      if (!c.resisted) e.slipped += 1;
    }
  }
  return Array.from(map.values())
    .map((e) => ({ ...e, avg: e.n ? e.sum / e.n : 0 }))
    .sort((a, b) => b.avg - a.avg);
}

/** Cigarettes + cravings per day over the last `n` days (oldest first). */
export function trendSeries(n = 30) {
  const roll = dailyRollup();
  const today = startOfDay(new Date());
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = addDays(today, -i);
    const key = dayKey(d);
    const cell = roll.get(key) || { smoked: 0, cravings: 0, resisted: 0, logged: false };
    out.push({ key, date: d, ...cell });
  }
  return out;
}

/** Which weeks of the quit attempt had the most slips. */
export function weeklyRelapses() {
  const quitMs = new Date(state.profile.quitAt).getTime();
  const weeks = new Map();
  for (const r of state.relapses) {
    const w = Math.floor((new Date(r.ts).getTime() - quitMs) / (7 * MS.d));
    if (w < 0) continue;
    weeks.set(w, (weeks.get(w) || 0) + r.count);
  }
  return weeks;
}

export function bestMethod() {
  const map = new Map();
  for (const c of state.cravings) {
    if (!c.resisted) continue;
    for (const m of c.methods) map.set(m, (map.get(m) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

export { STORAGE_KEY, SCHEMA_VERSION };
