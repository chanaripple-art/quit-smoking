/* ==========================================================================
   app.js — router, views, forms, live clock
   ========================================================================== */

import {
  $, $$, esc, fmtInt, fmtMoney, fmtDate, fmtTime, fmtDateTime, relativeTime,
  dayKey, parseDayKey, toLocalInput, startOfDay, addDays, addMonths, durationParts,
  fmtClock, fmtSpan, fmtCountdown, clamp, pct, sum, avg, topN, uid, haptic,
  toast, openSheet, closeSheet, confirmSheet, downloadText, isSameDay,
} from './util.js';

import {
  HEALTH_MILESTONES, milestoneProgress, TRIGGERS, MOODS, METHODS, SYMPTOMS,
  ACHIEVEMENTS, HOME_QUOTES, emojiOf, nameOf, labelOf,
} from './content.js';

import * as store from './store.js';
import { lineChart, columnChart, hbarList, ring, sparkline, PALETTE } from './charts.js';
import { openSOS, closeSOS, isSOSOpen } from './sos.js';

/* ==========================================================================
   UI state (not persisted with the health data)
   ========================================================================== */

const UI_KEY = 'quit-smoking::ui::v1';

const firstOfThisMonth = startOfDay(new Date());
firstOfThisMonth.setDate(1);

const ui = {
  route: 'home',
  recordTab: 'relapse',
  calMonth: firstOfThisMonth, // always a Date, never a timestamp
  bannerDismissed: false,
};

try {
  const raw = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
  if (raw.bannerDismissed) ui.bannerDismissed = true;
  if (raw.recordTab) ui.recordTab = raw.recordTab;
} catch { /* ignore */ }

function persistUI() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ bannerDismissed: ui.bannerDismissed, recordTab: ui.recordTab }));
  } catch { /* ignore */ }
}

/* ==========================================================================
   Boot
   ========================================================================== */

store.load();

const ROUTES = ['home', 'record', 'stats', 'badges', 'settings'];

function parseHash() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const route = ROUTES.includes(path) ? path : 'home';
  const params = new URLSearchParams(query || '');
  return { route, params };
}

function navigate(route, params) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  location.hash = `#/${route}${qs}`;
}

function render() {
  const { route, params } = parseHash();
  ui.route = route;

  $$('#tabBar .tab-item').forEach((btn) => {
    const active = btn.dataset.route === route;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const view = $('#viewRoot');
  switch (route) {
    case 'record': view.innerHTML = renderRecordView(); break;
    case 'stats': view.innerHTML = renderStatsView(); break;
    case 'badges': view.innerHTML = renderBadgesView(); break;
    case 'settings': view.innerHTML = renderSettingsView(); break;
    default: view.innerHTML = renderHomeView(); break;
  }

  bindCurrentView();

  const titles = { home: '戒烟', record: '记录', stats: '分析', badges: '成就', settings: '我的' };
  $('#headerTitle').textContent = titles[route] || '戒烟';

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if (params && params.get && params.get('action') === 'sos') openSOS();
}

window.addEventListener('hashchange', render);

/* ==========================================================================
   Live clock — updates the hero without re-rendering the view
   ========================================================================== */

function tickLive() {
  if (ui.route !== 'home') return;
  const stats = store.computeStats();
  setText('[data-t-days]', stats.fullDays);
  setText('[data-t-clock]', fmtClock(stats.elapsedMs));
  setText('[data-t-avoided]', fmtInt(stats.avoidedCigs));
  setText('[data-t-money]', fmtMoney(stats.savedMoney));
  setText('[data-t-resisted]', fmtInt(stats.cravingsResisted));

  const mp = milestoneProgress(stats.elapsedMs);
  if (mp.next) {
    setText('[data-t-next]', mp.next.title);
    setText('[data-t-nextleft]', `还有 ${fmtSpan(mp.next.ms - stats.elapsedMs)}`);
    const bar = $('[data-t-milestonebar]');
    if (bar) bar.style.width = `${(mp.progress * 100).toFixed(2)}%`;
  }
}

function setText(sel, value) {
  const el = $(sel);
  if (el && el.textContent !== String(value)) el.textContent = value;
}

setInterval(tickLive, 1000);

/* ==========================================================================
   Shared fragments
   ========================================================================== */

function chipRow(list, selected, key, opts = {}) {
  const { danger = false, single = false } = opts;
  return list
    .map((item) => {
      const on = single ? selected === item.id : selected.includes(item.id);
      return `<button class="chip ${on ? 'is-on' : ''} ${danger ? 'chip--danger' : ''}"
                type="button" data-chip="${esc(key)}" data-id="${esc(item.id)}"
                ${single ? 'data-single="1"' : ''}>
                ${item.emoji ? `${item.emoji} ` : ''}${esc(item.label)}
              </button>`;
    })
    .join('');
}

/** Wire up chip groups inside a container. `model` is a mutable object. */
function bindChips(root, model) {
  root.querySelectorAll('[data-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.chip;
      const id = chip.dataset.id;
      const single = chip.dataset.single === '1';
      if (single) {
        // re-tapping the active chip clears the choice
        model[key] = model[key] === id ? '' : id;
        root.querySelectorAll(`[data-chip="${key}"]`).forEach((c) => {
          c.classList.toggle('is-on', c.dataset.id === model[key]);
        });
      } else {
        const list = model[key] || (model[key] = []);
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1);
        else list.push(id);
        chip.classList.toggle('is-on', i < 0);
      }
      haptic(5);
    });
  });
}

function bindSegment(root, model, key, onDone) {
  const group = root.querySelector(`[data-seg="${key}"]`);
  if (!group) return;
  group.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      model[key] = btn.dataset.val;
      group.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
      haptic(5);
      if (onDone) onDone(btn.dataset.val);
    });
  });
}

function bindStepper(root, selector, onChange) {
  const wrap = root.querySelector(selector);
  if (!wrap) return;
  const valEl = wrap.querySelector('.val');
  let value = Number(wrap.dataset.value) || 0;
  const min = Number(wrap.dataset.min) || 0;
  const max = Number(wrap.dataset.max) || 99;
  const render = () => {
    valEl.innerHTML = `${value}<small>${wrap.dataset.unit || '支'}</small>`;
    wrap.dataset.value = String(value);
    if (onChange) onChange(value);
  };
  wrap.querySelector('[data-step="down"]').addEventListener('click', () => {
    value = clamp(value - 1, min, max); haptic(5); render();
  });
  wrap.querySelector('[data-step="up"]').addEventListener('click', () => {
    value = clamp(value + 1, min, max); haptic(5); render();
  });
  render();
  return { get value() { return value; }, set value(v) { value = clamp(v, min, max); render(); } };
}

function isEmptyData() {
  const s = store.getState();
  return !s.relapses.length && !s.cravings.length && !Object.keys(s.diaries).length;
}

/* ==========================================================================
   View: HOME
   ========================================================================== */

function renderHomeView() {
  const stats = store.computeStats();
  const mp = milestoneProgress(stats.elapsedMs);
  const s = store.getState();

  const isFresh = stats.elapsedMs < 3 * 3600000; // first 3 hours — highest relapse risk
  const quote = HOME_QUOTES[Math.floor(stats.fullDays) % HOME_QUOTES.length];
  const showBanner = !ui.bannerDismissed && !isStandalone();

  const goalAmount = stats.goalAmount;
  const goalPct = goalAmount > 0 ? clamp(stats.savedMoney / goalAmount, 0, 1) : 0;

  return `
  <div class="view">

    ${showBanner ? `
    <div class="banner" style="margin-bottom:14px">
      <span class="ic">📲</span>
      <div class="grow">
        <strong>把它装到主屏幕</strong><br />
        点 Safari 底部的「分享」→「添加到主屏幕」，就能全屏离线使用，还能收提醒。
      </div>
      <button class="close" type="button" data-act="dismiss-banner" aria-label="关闭">✕</button>
    </div>` : ''}

    <!-- hero -->
    <div class="hero ${isFresh ? 'hero--fresh' : ''}">
      <div class="hero-label">已戒烟</div>
      <div class="hero-days">
        <span class="num" data-t-days>${stats.fullDays}</span>
        <span class="unit">天</span>
      </div>
      <div class="hero-clock tnum" data-t-clock>${fmtClock(stats.elapsedMs)}</div>
      <div class="hero-since">从 ${esc(fmtDateTime(stats.sinceQuitAt))} 开始</div>

      <div class="hero-goal">
        <div class="row row--between" style="font-size:12.5px;color:var(--text-faint);margin-bottom:6px">
          <span>健康恢复进度</span>
          <span>${mp.index} / ${mp.total} 个里程碑</span>
        </div>
        <div class="milestone-track">
          ${HEALTH_MILESTONES.map((m) => `<i class="${stats.elapsedMs >= m.ms ? 'done' : ''}"></i>`).join('')}
        </div>
      </div>
    </div>

    <!-- headline stats -->
    <div class="stat-grid" style="margin-top:12px">
      <div class="stat-tile">
        <div class="val ${isFresh ? 'warn' : 'accent'}" data-t-avoided>${fmtInt(stats.avoidedCigs)}</div>
        <div class="lbl">少抽的烟（支）</div>
      </div>
      <div class="stat-tile">
        <div class="val good" data-t-money>${fmtMoney(stats.savedMoney)}</div>
        <div class="lbl">省下（元）</div>
      </div>
      <div class="stat-tile">
        <div class="val" data-t-resisted>${fmtInt(stats.cravingsResisted)}</div>
        <div class="lbl">扛过烟瘾（次）</div>
      </div>
    </div>

    <!-- SOS -->
    <button class="btn-sos" style="margin-top:14px" type="button" data-act="sos">
      <svg viewBox="0 0 24 24"><path d="M12 2 3 6v6c0 5 3.8 9.2 9 10 5.2-.8 9-5 9-10V6l-9-4Zm1 14h-2v-2h2v2Zm0-4h-2V7h2v5Z"/></svg>
      <span>烟瘾来了，点这里</span>
    </button>

    <!-- quick actions -->
    <div class="action-grid" style="margin-top:10px">
      <button class="btn" type="button" data-act="new-relapse">
        <svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>
        我抽了一支
      </button>
      <button class="btn" type="button" data-act="new-craving">
        <svg viewBox="0 0 24 24"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-15h-2v6l5 3 1-1.7-4-2.3V7Z"/></svg>
        补记一次烟瘾
      </button>
      <button class="btn" type="button" data-act="new-diary">
        <svg viewBox="0 0 24 24"><path d="M5 3h11l4 4v14H5V3Zm10 1.5V8h3.5L15 4.5ZM7 12h10v-2H7v2Zm0 4h10v-2H7v2Z"/></svg>
        今日打卡
      </button>
      <button class="btn" type="button" data-act="go-stats">
        <svg viewBox="0 0 24 24"><path d="M5 20H3v-9h2v9Zm8 0h-2V4h2v16Zm8 0h-2V9h2v11Z"/></svg>
        查看数据
      </button>
    </div>

    <!-- next health milestone -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">下一个健康里程碑</h2>
        <span class="section-note">${mp.index}/${mp.total}</span>
      </div>
      <div class="card">
        ${mp.next ? `
          <div class="milestone-next">
            <div class="icon">${mp.next.emoji}</div>
            <div class="grow">
              <div class="title">${esc(mp.next.title)} · <span data-t-nextleft>还有 ${esc(fmtSpan(mp.next.ms - stats.elapsedMs))}</span></div>
              <div class="desc">${esc(mp.next.desc)}</div>
            </div>
          </div>
          <div class="progress" style="margin-top:14px">
            <span data-t-milestonebar style="width:${(mp.progress * 100).toFixed(2)}%"></span>
          </div>
        ` : `
          <div class="milestone-next">
            <div class="icon">💎</div>
            <div class="grow">
              <div class="title">全部里程碑已解锁</div>
              <div class="desc">15 年。你的身体已经和从不吸烟的人站在同一条线上。</div>
            </div>
          </div>
        `}
      </div>
    </div>

    <!-- savings goal -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">存钱罐</h2>
        <button class="section-note" type="button" data-act="edit-goal" style="color:var(--accent);font-weight:600">
          ${goalAmount > 0 ? '修改' : '设定目标'}
        </button>
      </div>
      <div class="card card--tint">
        ${goalAmount > 0 ? `
          <div class="row row--between" style="margin-bottom:10px">
            <div>
              <div style="font-size:15.5px;font-weight:600">${esc(stats.goalName || '目标')}</div>
              <div style="font-size:12.5px;color:var(--text-faint);margin-top:2px">
                已存 ¥${fmtMoney(stats.savedMoney)} / ¥${fmtMoney(goalAmount)}
              </div>
            </div>
            <div style="font-size:19px;font-weight:700;color:${goalPct >= 1 ? 'var(--good)' : 'var(--accent)'}">
              ${pct(stats.savedMoney, goalAmount)}%
            </div>
          </div>
          <div class="progress progress--gold"><span style="width:${(goalPct * 100).toFixed(1)}%"></span></div>
          <div style="font-size:12.5px;color:var(--text-faint);margin-top:10px">
            ${goalPct >= 1
              ? '🎉 目标达成，可以买了。'
              : `还差 ¥${fmtMoney(Math.max(0, goalAmount - stats.savedMoney))}，按当前进度大约 ${estimateDays(stats, goalAmount - stats.savedMoney)} 天。`}
          </div>
        ` : `
          <div class="row" style="gap:14px">
            <div style="font-size:30px">🐷</div>
            <div class="grow">
              <div style="font-size:15px;font-weight:600">给省下的钱一个去处</div>
              <div style="font-size:12.5px;color:var(--text-faint);margin-top:3px;line-height:1.55">
                你到现在已经省了 ¥${fmtMoney(stats.savedMoney)}。设一个具体的目标，比看着一个数字有用得多。
              </div>
            </div>
          </div>
          <button class="btn btn--primary btn--block" style="margin-top:14px" type="button" data-act="edit-goal">设定目标</button>
        `}
      </div>
    </div>

    ${stats.cravingsTotal + stats.relapseCount > 0 ? `
    <div class="section">
      <div class="section-head"><h2 class="section-title">最近</h2></div>
      <div class="list">${renderRecentRows()}</div>
    </div>` : ''}

    <div class="section">
      <div class="card" style="text-align:center">
        <div style="font-size:26px;margin-bottom:8px">🌤️</div>
        <div style="font-size:14px;color:var(--text-dim);line-height:1.7">${esc(quote)}</div>
      </div>
    </div>

    ${isEmptyData() ? `
    <div class="section">
      <div class="card" style="border-style:dashed">
        <div style="font-size:14.5px;font-weight:600;margin-bottom:6px">还没有任何记录</div>
        <div style="font-size:13px;color:var(--text-faint);line-height:1.65;margin-bottom:14px">
          记录是这套工具的全部价值来源——它会告诉你你的高危时段、触发场景和有效对策。
          想先看看完整效果，可以载入一份演示数据。
        </div>
        <button class="btn btn--block" type="button" data-act="seed-demo">载入演示数据</button>
      </div>
    </div>` : ''}

  </div>`;
}

function estimateDays(stats, remaining) {
  const perDay = stats.perCig * stats.cigsPerDay;
  if (perDay <= 0) return '—';
  return Math.max(1, Math.ceil(remaining / perDay));
}

function renderRecentRows() {
  const s = store.getState();
  const items = [
    ...s.relapses.slice(0, 4).map((r) => ({ kind: 'relapse', ts: r.ts, data: r })),
    ...s.cravings.slice(0, 4).map((c) => ({ kind: 'craving', ts: c.ts, data: c })),
  ]
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 5);

  if (!items.length) return '<div class="empty-state">还没有记录</div>';

  return items.map((it) => {
    if (it.kind === 'relapse') {
      const r = it.data;
      const tags = r.triggers.map((t) => nameOf(TRIGGERS, t)).join('、');
      return `<div class="list-row">
        <span style="font-size:19px">🚬</span>
        <div class="grow">
          <div class="label">抽了 ${r.count} 支</div>
          <div class="sub">${esc(relativeTime(r.ts))}${tags ? ` · ${esc(tags)}` : ''}</div>
        </div>
      </div>`;
    }
    const c = it.data;
    const tags = c.triggers.map((t) => nameOf(TRIGGERS, t)).join('、');
    return `<div class="list-row">
      <span style="font-size:19px">${c.resisted ? '💪' : '😔'}</span>
      <div class="grow">
        <div class="label">${c.resisted ? '扛过烟瘾' : '烟瘾后复吸'} · 强度 ${c.intensity}</div>
        <div class="sub">${esc(relativeTime(c.ts))}${tags ? ` · ${esc(tags)}` : ''}</div>
      </div>
    </div>`;
  }).join('');
}

/* ==========================================================================
   View: RECORD
   ========================================================================== */

function renderRecordView() {
  const tabs = [
    { id: 'relapse', label: '复吸' },
    { id: 'craving', label: '烟瘾' },
    { id: 'diary', label: '日记' },
  ];
  const s = store.getState();

  let body = '';
  if (ui.recordTab === 'relapse') body = renderRelapseTab(s);
  else if (ui.recordTab === 'craving') body = renderCravingTab(s);
  else body = renderDiaryTab(s);

  return `
  <div class="view">
    <div class="segmented" data-seg="recordTab">
      ${tabs.map((t) => `<button type="button" data-val="${t.id}"
        class="${ui.recordTab === t.id ? 'is-active' : ''}">${t.label}</button>`).join('')}
    </div>
    <div style="margin-top:16px">${body}</div>
  </div>`;
}

function renderRelapseTab(s) {
  const list = s.relapses;
  return `
    <div class="card card--tint">
      <div style="font-size:15.5px;font-weight:600">诚实记录每一次复吸</div>
      <div style="font-size:13px;color:var(--text-faint);margin-top:6px;line-height:1.65">
        复吸不是失败，是数据。每一次都记下来，我们才能找出你的触发模式。
      </div>
      <button class="btn btn--primary btn--block" style="margin-top:14px" type="button" data-act="new-relapse">
        记录一支
      </button>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">复吸历史</h2>
        <span class="section-note">共 ${list.length} 次 · ${fmtInt(sum(list, (r) => r.count))} 支</span>
      </div>
      ${list.length ? `<div class="list">${list.map(renderRelapseRow).join('')}</div>`
        : '<div class="card"><div class="empty-state"><strong>没有复吸记录</strong>希望这一栏一直是空的。</div></div>'}
    </div>`;
}

function renderRelapseRow(r) {
  const tags = r.triggers.map((t) => `${emojiOf(TRIGGERS, t)}${nameOf(TRIGGERS, t)}`).join(' ');
  const moods = r.moods.map((m) => `${emojiOf(MOODS, m)}${nameOf(MOODS, m)}`).join(' ');
  return `<div class="list-row">
    <span style="font-size:19px">🚬</span>
    <div class="grow">
      <div class="label">${r.count} 支 · ${esc(fmtTime(r.ts))}</div>
      <div class="sub">${esc(fmtDate(r.ts, false))}${tags ? ` · ${esc(tags)}` : ''}${moods ? ` · ${esc(moods)}` : ''}</div>
      ${r.note ? `<div class="sub" style="color:var(--text-dim);margin-top:4px">“${esc(r.note)}”</div>` : ''}
    </div>
    <button class="chev" type="button" data-act="del-relapse" data-id="${esc(r.id)}" aria-label="删除">✕</button>
  </div>`;
}

function renderCravingTab(s) {
  const list = s.cravings;
  const resisted = list.filter((c) => c.resisted).length;
  return `
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-tile"><div class="val">${list.length}</div><div class="lbl">共记录</div></div>
      <div class="stat-tile"><div class="val good">${resisted}</div><div class="lbl">扛过去</div></div>
      <div class="stat-tile"><div class="val ${list.length && resisted / list.length >= 0.7 ? 'good' : 'warn'}">
        ${list.length ? Math.round((resisted / list.length) * 100) : 0}%</div><div class="lbl">抵抗成功率</div></div>
    </div>

    <div class="action-grid" style="margin-bottom:20px">
      <button class="btn btn--primary" type="button" data-act="sos">🆘 开始急救</button>
      <button class="btn" type="button" data-act="new-craving">✍️ 补记一次</button>
    </div>

    <div class="section-head">
      <h2 class="section-title">烟瘾记录</h2>
      <span class="section-note">共 ${list.length} 条</span>
    </div>
    ${list.length ? `<div class="list">${list.map(renderCravingRow).join('')}</div>`
      : '<div class="card"><div class="empty-state"><strong>还没有烟瘾记录</strong>下次想抽烟的时候，先按下急救按钮。</div></div>'}
  `;
}

function renderCravingRow(c) {
  const tags = c.triggers.map((t) => `${emojiOf(TRIGGERS, t)}${nameOf(TRIGGERS, t)}`).join(' ');
  const methods = c.methods.map((m) => nameOf(METHODS, m)).join('、');
  const bars = Array.from({ length: 10 }, (_, i) =>
    `<i style="flex:1;height:${i < c.intensity ? 100 : 22}%;border-radius:2px;background:${i < c.intensity
      ? (c.intensity >= 7 ? 'var(--danger)' : c.intensity >= 4 ? 'var(--warn)' : 'var(--accent)')
      : 'var(--surface-3)'}"></i>`).join('');
  return `<div class="list-row">
    <span style="font-size:19px">${c.resisted ? '💪' : '😔'}</span>
    <div class="grow">
      <div class="label">${c.resisted ? '扛过去了' : '没扛住'} · 强度 ${c.intensity}/10</div>
      <div class="sub">${esc(fmtDate(c.ts, false))} ${esc(fmtTime(c.ts))}${tags ? ` · ${esc(tags)}` : ''}${methods && c.resisted ? ` · 靠${esc(methods)}` : ''}</div>
      <div style="display:flex;gap:2px;height:16px;margin-top:7px;max-width:130px">${bars}</div>
    </div>
    <button class="chev" type="button" data-act="del-craving" data-id="${esc(c.id)}" aria-label="删除">✕</button>
  </div>`;
}

function renderDiaryTab(s) {
  const entries = Object.entries(s.diaries).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const todayKey = dayKey();
  const today = s.diaries[todayKey];

  return `
    <div class="card card--tint">
      <div class="row row--between">
        <div>
          <div style="font-size:15.5px;font-weight:600">今天的日记</div>
          <div style="font-size:12.5px;color:var(--text-faint);margin-top:3px">${esc(fmtDate(new Date()))}</div>
        </div>
        <div style="font-size:26px">${today && today.mood ? emojiOf(MOODS, today.mood) : '📔'}</div>
      </div>
      <button class="btn ${today ? '' : 'btn--primary'} btn--block" style="margin-top:14px" type="button" data-act="new-diary">
        ${today ? '编辑今天的记录' : '写今天的日记'}
      </button>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">历史日记</h2>
        <span class="section-note">共 ${entries.length} 天</span>
      </div>
      ${entries.length ? `<div class="list">${entries.slice(0, 60).map(([key, d]) => {
        const syms = (d.symptoms || []).map((x) => emojiOf(SYMPTOMS, x)).join('');
        return `<button class="list-row" type="button" data-act="edit-diary" data-day="${esc(key)}">
          <span style="font-size:20px">${d.mood ? emojiOf(MOODS, d.mood) : '📄'}</span>
          <div class="grow">
            <div class="label">${esc(fmtDate(parseDayKey(key), false))}${Number(d.smoked) > 0 ? ` · 抽了 ${d.smoked} 支` : ' · 未复吸'}</div>
            <div class="sub">${d.note ? esc(d.note.slice(0, 40)) : (syms || '无备注')}${syms && d.note ? ` · ${syms}` : ''}</div>
          </div>
          <span class="chev">›</span>
        </button>`;
      }).join('')}</div>`
        : '<div class="card"><div class="empty-state"><strong>还没有日记</strong>每天一句话就够了，用来发现情绪和烟瘾的关系。</div></div>'}
    </div>`;
}

/* ==========================================================================
   View: STATS
   ========================================================================== */

function renderStatsView() {
  const stats = store.computeStats();
  const roll = store.dailyRollup();
  const hasData = stats.cravingsTotal > 0 || stats.relapseCount > 0;

  return `
  <div class="view">

    <div class="stat-grid stat-grid--2">
      <div class="stat-tile">
        <div class="val accent">${stats.fullDays}</div>
        <div class="lbl">已戒烟天数</div>
      </div>
      <div class="stat-tile">
        <div class="val ${stats.cleanStreak >= 7 ? 'good' : ''}">${Math.floor(stats.cleanStreak)}</div>
        <div class="lbl">连续无烟天数</div>
      </div>
      <div class="stat-tile">
        <div class="val">${fmtInt(stats.avoidedCigs)}</div>
        <div class="lbl">少抽的烟（支）</div>
      </div>
      <div class="stat-tile">
        <div class="val good">¥${fmtMoney(stats.savedMoney)}</div>
        <div class="lbl">省下的钱</div>
      </div>
    </div>

    ${!hasData ? `
      <div class="section">
        <div class="card" style="border-style:dashed">
          <div class="empty-state">
            <strong>数据还不够</strong>
            记录几次烟瘾或复吸之后，这里会出现你的高危时段、触发场景和情绪关系图。
          </div>
          <button class="btn btn--block" type="button" data-act="seed-demo">载入演示数据看效果</button>
        </div>
      </div>` : ''}

    <!-- calendar -->
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">日历</h2>
        <div class="row" style="gap:4px">
          <button class="btn btn--sm btn--ghost" type="button" data-act="cal-prev" aria-label="上个月">‹</button>
          <span class="section-note" style="min-width:76px;text-align:center">${ui.calMonth.getFullYear()} 年 ${ui.calMonth.getMonth() + 1} 月</span>
          <button class="btn btn--sm btn--ghost" type="button" data-act="cal-next" aria-label="下个月">›</button>
        </div>
      </div>
      <div class="card">${renderCalendar(roll)}</div>
    </div>

    ${hasData ? `
    <div class="section">
      <div class="section-head">
        <h2 class="section-title">复吸趋势</h2>
        <span class="section-note">最近 30 天</span>
      </div>
      <div class="card">${renderTrend()}</div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">高危时段</h2>
        <span class="section-note">按小时统计烟瘾次数</span>
      </div>
      <div class="card">${renderHourly()}</div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">触发场景</h2>
        <span class="section-note">Top 6</span>
      </div>
      <div class="card">${renderTriggers()}</div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">情绪与烟瘾强度</h2>
        <span class="section-note">平均强度</span>
      </div>
      <div class="card">${renderMoods()}</div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">什么方法最管用</h2>
        <span class="section-note">成功抵抗时使用</span>
      </div>
      <div class="card">${renderMethods()}</div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">本周小结</h2></div>
      <div class="card">${renderWeekReport()}</div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">身体恢复账本</h2></div>
      <div class="card">
        <div class="stat-grid stat-grid--2">
          <div class="stat-tile"><div class="val danger">${fmtInt(stats.avoidedCigs * 12)}</div><div class="lbl">少摄入焦油（毫克）</div></div>
          <div class="stat-tile"><div class="val warn">${fmtInt(stats.avoidedNicotine)}</div><div class="lbl">少摄入尼古丁（毫克）</div></div>
        </div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:12px;line-height:1.6">
          按每支约 12 毫克焦油、1 毫克尼古丁估算，仅供参考。
        </div>
      </div>
    </div>
    ` : ''}

  </div>`;
}

function renderCalendar(roll) {
  const year = ui.calMonth.getFullYear();
  const month = ui.calMonth.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = first.getDay(); // 0 = Sunday
  const todayKey = dayKey();
  const quitMs = new Date(store.getState().profile.quitAt).getTime();
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

  let cells = '';
  for (let i = 0; i < startWeekday; i += 1) cells += '<div class="heat-cell is-blank"></div>';

  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(year, month, d);
    const key = dayKey(date);
    const cell = roll.get(key);
    const isFuture = date.getTime() > Date.now();
    const beforeQuit = date.getTime() < startOfDay(new Date(quitMs)).getTime();

    let cls = '';
    if (isFuture) cls = 'is-future';
    else if (cell && cell.smoked > 0) cls = 'lv-bad';
    else if (cell && cell.logged) cls = 'lv-2';
    else if (beforeQuit) cls = '';
    else cls = 'lv-0';

    if (key === todayKey) cls += ' is-today';

    const title = cell
      ? `${key}：${cell.smoked > 0 ? `抽了 ${cell.smoked} 支` : '未复吸'}${cell.cravings ? ` · 烟瘾 ${cell.cravings} 次` : ''}`
      : `${key}：无记录`;

    cells += `<button class="heat-cell ${cls}" type="button" data-act="edit-diary" data-day="${key}" title="${esc(title)}">
      ${d}${cell && cell.smoked > 0 ? `<span class="slip">${cell.smoked}</span>` : ''}
    </button>`;
  }

  const monthCells = Array.from({ length: daysInMonth }, (_, i) => {
    const key = dayKey(new Date(year, month, i + 1));
    return roll.get(key) || { smoked: 0, cravings: 0 };
  });
  const cleanDays = monthCells.filter((c) => c.smoked === 0).length;
  const slips = monthCells.filter((c) => c.smoked > 0).length;

  return `
    <div class="heatmap-head">${weekLabels.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="heatmap-grid">${cells}</div>
    <div class="heat-legend">
      <span>复吸</span><i style="background:rgba(248,113,113,.35)"></i>
      <span>有记录</span><i style="background:rgba(52,211,153,.78)"></i>
      <span>未记录</span><i style="background:rgba(52,211,153,.16)"></i>
    </div>
    <div class="row row--between" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:13px">
      <span class="muted">本月无烟 <b style="color:var(--good)">${cleanDays}</b> 天</span>
      <span class="muted">复吸 <b style="color:var(--danger)">${slips}</b> 天</span>
    </div>`;
}

function renderTrend() {
  const series = store.trendSeries(30);
  const labels = series.map((d) => `${d.date.getMonth() + 1}/${d.date.getDate()}`);
  return lineChart(
    [
      { name: '抽了几支', color: PALETTE.danger, values: series.map((d) => d.smoked) },
      { name: '烟瘾次数', color: PALETTE.accent, values: series.map((d) => d.cravings), fill: false, dashed: true, dot: false },
    ],
    labels,
    { height: 170 }
  );
}

function renderHourly() {
  const buckets = store.hourlyHistogram();
  const labels = buckets.map((_, i) => `${String(i).padStart(2, '0')}:00`);
  return columnChart(buckets, labels, { height: 150 });
}

function renderTriggers() {
  const stats = store.triggerStats().slice(0, 6);
  if (!stats.length) return '<div class="chart-empty">还没有触发场景数据</div>';
  return hbarList(
    stats.map((t) => ({
      label: `${emojiOf(TRIGGERS, t.id)} ${nameOf(TRIGGERS, t.id)}`,
      value: t.total,
      slipped: t.slipped,
    })),
    { unit: '次' }
  );
}

function renderMoods() {
  const stats = store.moodStats().slice(0, 6);
  if (!stats.length) return '<div class="chart-empty">还没有情绪数据</div>';
  const max = Math.max(...stats.map((m) => m.avg));
  return stats.map((m) => `
    <div class="hbar">
      <div class="hbar-top">
        <span class="k">${emojiOf(MOODS, m.id)} ${esc(nameOf(MOODS, m.id))}</span>
        <span class="v">平均 <b>${m.avg.toFixed(1)}</b> / 10 · ${m.n} 次</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${m.avg >= 7 ? 'is-danger' : m.avg >= 4.5 ? 'is-warn' : ''}"
             style="width:${((m.avg / max) * 100).toFixed(1)}%"></div>
      </div>
    </div>`).join('');
}

function renderMethods() {
  const best = store.bestMethod().slice(0, 5);
  if (!best.length) return '<div class="chart-empty">还没有成功抵抗的记录</div>';
  return hbarList(
    best.map(([id, n]) => ({ label: `${emojiOf(METHODS, id)} ${nameOf(METHODS, id)}`, value: n, slipped: 0 })),
    { unit: '次', showSlipped: false }
  );
}

function renderWeekReport() {
  const series = store.trendSeries(7);
  const prev = store.trendSeries(14).slice(0, 7);
  const curr = {
    smoked: sum(series, (d) => d.smoked),
    cravings: sum(series, (d) => d.cravings),
    resisted: sum(series, (d) => d.resisted),
    logged: series.filter((d) => d.logged).length,
  };
  const last = {
    smoked: sum(prev, (d) => d.smoked),
    cravings: sum(prev, (d) => d.cravings),
  };

  const delta = (now, before, lowerIsBetter = true) => {
    if (before === 0 && now === 0) return '<span class="faint">持平</span>';
    const diff = now - before;
    if (diff === 0) return '<span class="faint">与上周持平</span>';
    const good = lowerIsBetter ? diff < 0 : diff > 0;
    const arrow = diff > 0 ? '↑' : '↓';
    return `<span style="color:${good ? 'var(--good)' : 'var(--danger)'}">${arrow} ${Math.abs(diff)} 与上周</span>`;
  };

  const rate = curr.cravings ? Math.round((curr.resisted / curr.cravings) * 100) : 0;
  const trigger = store.triggerStats()[0];

  const headline = curr.smoked === 0
    ? (curr.cravings > 0 ? '这一周完全没抽，而且你记录并扛过了每一次冲动。' : '这一周干净无烟。')
    : `这一周抽了 ${curr.smoked} 支，比上周${last.smoked > curr.smoked ? '少' : last.smoked < curr.smoked ? '多' : '持平'}。`;

  return `
    <div style="font-size:15px;line-height:1.7;margin-bottom:16px">${esc(headline)}</div>
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-tile"><div class="val danger">${curr.smoked}</div><div class="lbl">抽了（支）</div></div>
      <div class="stat-tile"><div class="val accent">${curr.cravings}</div><div class="lbl">烟瘾（次）</div></div>
      <div class="stat-tile"><div class="val good">${rate}%</div><div class="lbl">抵抗成功率</div></div>
    </div>
    <div class="list" style="border:0;background:transparent">
      <div class="list-row" style="padding-left:0;padding-right:0;border-color:var(--border)">
        <div class="grow"><div class="label">复吸支数</div></div>
        <div class="value">${delta(curr.smoked, last.smoked, true)}</div>
      </div>
      <div class="list-row" style="padding-left:0;padding-right:0;border-color:var(--border)">
        <div class="grow"><div class="label">烟瘾次数</div></div>
        <div class="value">${delta(curr.cravings, last.cravings, true)}</div>
      </div>
      <div class="list-row" style="padding-left:0;padding-right:0;border:0">
        <div class="grow"><div class="label">记录了几天</div></div>
        <div class="value">${curr.logged} / 7 天</div>
      </div>
    </div>
    ${trigger ? `
      <div style="margin-top:16px;padding:13px;border-radius:var(--r-md);background:var(--warn-soft);font-size:13.5px;line-height:1.65;color:var(--warn)">
        ⚠️ 你最常被 <b>${esc(nameOf(TRIGGERS, trigger.id))}</b> 触发（${trigger.total} 次）。
        提前准备一个替代动作，会比临时硬扛有效得多。
      </div>` : ''}
  `;
}

/* ==========================================================================
   View: BADGES
   ========================================================================== */

function renderBadgesView() {
  const stats = store.computeStats();
  const list = store.achievementView(stats);
  const unlockedCount = list.filter((a) => a.unlocked).length;
  const goalAmount = stats.goalAmount;
  const goalPct = goalAmount > 0 ? clamp(stats.savedMoney / goalAmount, 0, 1) : 0;

  return `
  <div class="view">

    <div class="card card--tint">
      <div class="row" style="gap:18px">
        <div>${ring(unlockedCount / list.length, { size: 88, stroke: 9, color: PALETTE.accent })}</div>
        <div class="grow">
          <div style="font-size:19px;font-weight:700">${unlockedCount} / ${list.length}</div>
          <div style="font-size:13px;color:var(--text-faint);margin-top:3px;line-height:1.6">
            已解锁的成就。越往后越难，也越值。
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2 class="section-title">存钱罐</h2>
        <button class="section-note" type="button" data-act="edit-goal" style="color:var(--accent);font-weight:600">
          ${goalAmount > 0 ? '修改目标' : '设定目标'}
        </button>
      </div>
      <div class="card">
        ${goalAmount > 0 ? `
          <div class="row row--between" style="margin-bottom:12px">
            <div class="grow">
              <div style="font-size:16px;font-weight:600">${esc(stats.goalName || '目标')}</div>
              <div style="font-size:12.5px;color:var(--text-faint);margin-top:3px">
                ¥${fmtMoney(stats.savedMoney)} / ¥${fmtMoney(goalAmount)}
              </div>
            </div>
            <div style="font-size:22px;font-weight:800;color:${goalPct >= 1 ? 'var(--good)' : 'var(--gold)'}">
              ${pct(stats.savedMoney, goalAmount)}%
            </div>
          </div>
          <div class="progress progress--gold"><span style="width:${(goalPct * 100).toFixed(1)}%"></span></div>
          <div style="font-size:13px;color:var(--text-dim);margin-top:12px;line-height:1.6">
            ${goalPct >= 1
              ? '🎉 已经存够了，去买吧。'
              : `还差 <b style="color:var(--gold)">¥${fmtMoney(Math.max(0, goalAmount - stats.savedMoney))}</b>，大约 ${estimateDays(stats, goalAmount - stats.savedMoney)} 天。`}
          </div>
        ` : `
          <div class="empty-state" style="padding:18px">
            <strong>还没有目标</strong>
            把省下的钱对应到一个具体的想要的东西上，动力会强很多。
          </div>
          <button class="btn btn--primary btn--block" type="button" data-act="edit-goal">设定目标</button>
        `}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">成就徽章</h2></div>
      <div class="badge-grid">
        ${list.map((a) => `
          <div class="badge ${a.unlocked ? 'is-unlocked' : 'is-locked'}" title="${esc(a.desc)}">
            <div class="em">${a.unlocked ? a.emoji : '🔒'}</div>
            <div class="nm">${esc(a.name)}</div>
            <div class="ds">${a.unlocked ? esc(fmtDate(a.unlockedAt, false)) : esc(a.desc)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">进行中</h2></div>
      <div class="card">
        ${list.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress).slice(0, 4).map((a) => `
          <div class="hbar">
            <div class="hbar-top">
              <span class="k">${a.emoji} ${esc(a.name)}</span>
              <span class="v">${Math.round(a.progress * 100)}% · ${esc(a.desc)}</span>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${(a.progress * 100).toFixed(1)}%"></div></div>
          </div>`).join('') || '<div class="chart-empty">全部解锁了 🎉</div>'}
      </div>
    </div>

  </div>`;
}

/* ==========================================================================
   View: SETTINGS
   ========================================================================== */

function renderSettingsView() {
  const p = store.getState().profile;
  const stats = store.computeStats();
  const perDayCost = p.cigsPerDay * stats.perCig;

  return `
  <div class="view">

    <div class="section" style="margin-top:6px">
      <div class="section-head">
        <h2 class="section-title">运行状态</h2>
        <button class="section-note" type="button" data-act="refresh-runtime"
                style="color:var(--accent);font-weight:600">重新检测</button>
      </div>
      <div class="list">
        <div class="list-row">
          <span style="font-size:18px">📱</span>
          <div class="grow"><div class="label">运行模式</div>
            <div class="sub">全屏 App 还是浏览器里的网页</div></div>
          <div class="value" data-rt="mode">检测中…</div>
        </div>
        <div class="list-row">
          <span style="font-size:18px">🔒</span>
          <div class="grow"><div class="label">HTTPS</div>
            <div class="sub">离线能力的前提，必须是「是」</div></div>
          <div class="value" data-rt="secure">检测中…</div>
        </div>
        <div class="list-row">
          <span style="font-size:18px">⚙️</span>
          <div class="grow"><div class="label">Service Worker</div>
            <div class="sub">负责把 App 缓存到手机本地</div></div>
          <div class="value" data-rt="sw">检测中…</div>
        </div>
        <div class="list-row">
          <span style="font-size:18px">📡</span>
          <div class="grow"><div class="label">网络</div></div>
          <div class="value" data-rt="online">检测中…</div>
        </div>
        <div class="list-row">
          <span style="font-size:18px">🌐</span>
          <div class="grow"><div class="label">当前网址</div></div>
          <div class="value" data-rt="origin"
               style="font-size:12.5px;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">…</div>
        </div>
        <div class="list-row">
          <span style="font-size:18px">📦</span>
          <div class="grow"><div class="label">离线缓存</div></div>
          <div class="value" data-rt="cache" style="font-size:12.5px">…</div>
        </div>
      </div>
      <div data-rt-warning hidden style="margin-top:10px"></div>
      <div style="font-size:12.5px;color:var(--text-faint);margin:10px 4px 0;line-height:1.6">
        想验证离线：打开一次让页面加载完 → 开飞行模式 → 从主屏幕图标进来，应该照常可用。
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">我的吸烟史</h2></div>
      <div class="list">
        <button class="list-row" type="button" data-act="edit-quit">
          <span style="font-size:18px">🗓️</span>
          <div class="grow"><div class="label">戒烟开始时间</div>
            <div class="sub">${esc(fmtDateTime(p.quitAt))}</div></div>
          <span class="chev">›</span>
        </button>
        <button class="list-row" type="button" data-act="edit-habit">
          <span style="font-size:18px">🚬</span>
          <div class="grow"><div class="label">原来每天抽多少</div>
            <div class="sub">${p.cigsPerDay} 支 / 天</div></div>
          <span class="chev">›</span>
        </button>
        <button class="list-row" type="button" data-act="edit-habit">
          <span style="font-size:18px">💵</span>
          <div class="grow"><div class="label">烟的价格</div>
            <div class="sub">¥${p.pricePerPack} / ${p.cigsPerPack} 支</div></div>
          <span class="chev">›</span>
        </button>
        <button class="list-row" type="button" data-act="edit-goal">
          <span style="font-size:18px">🐷</span>
          <div class="grow"><div class="label">存钱罐目标</div>
            <div class="sub">${stats.goalAmount > 0 ? `${esc(stats.goalName || '目标')} · ¥${fmtMoney(stats.goalAmount)}` : '未设定'}</div></div>
          <span class="chev">›</span>
        </button>
      </div>
      <div style="font-size:12.5px;color:var(--text-faint);margin:10px 4px 0;line-height:1.6">
        按当前设置，你每天省下 <b style="color:var(--good)">¥${fmtMoney(perDayCost)}</b>，每月约
        <b style="color:var(--good)">¥${fmtMoney(perDayCost * 30)}</b>。
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">提醒</h2></div>
      <div class="list">
        <div class="list-row">
          <span style="font-size:18px">🔔</span>
          <div class="grow"><div class="label">本地通知</div>
            <div class="sub">${notificationState()}</div></div>
          <button class="switch ${p.notifications ? 'is-on' : ''}" type="button" data-act="toggle-notify" aria-label="通知开关"></button>
        </div>
        <div class="list-row">
          <span style="font-size:18px">⚠️</span>
          <div class="grow"><div class="label">高危时段提醒</div>
            <div class="sub">${riskWindowSummary()}</div></div>
          <button class="switch ${p.riskReminder ? 'is-on' : ''}" type="button" data-act="toggle-risk" aria-label="高危提醒开关"></button>
        </div>
        <button class="list-row" type="button" data-act="test-notify">
          <span style="font-size:18px">🧪</span>
          <div class="grow"><div class="label">发一条测试提醒</div>
            <div class="sub">检查通知是否真的能弹出来</div></div>
          <span class="chev">›</span>
        </button>
      </div>
      <div style="font-size:12.5px;color:var(--text-faint);margin:10px 4px 0;line-height:1.6">
        iOS 上必须先把 App「添加到主屏幕」并允许通知，提醒才有效。网页版只能在 App 打开时触发。
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">数据</h2></div>
      <div class="list">
        <button class="list-row" type="button" data-act="export">
          <span style="font-size:18px">📤</span>
          <div class="grow"><div class="label">导出备份</div>
            <div class="sub">下载 JSON 文件，换手机或重装时可恢复</div></div>
          <span class="chev">›</span>
        </button>
        <button class="list-row" type="button" data-act="import">
          <span style="font-size:18px">📥</span>
          <div class="grow"><div class="label">导入备份</div>
            <div class="sub">从 JSON 文件恢复记录</div></div>
          <span class="chev">›</span>
        </button>
        <button class="list-row" type="button" data-act="seed-demo">
          <span style="font-size:18px">🧪</span>
          <div class="grow"><div class="label">载入演示数据</div>
            <div class="sub">用 46 天的模拟记录预览所有图表</div></div>
          <span class="chev">›</span>
        </button>
        <button class="list-row" type="button" data-act="clear">
          <span style="font-size:18px">🗑️</span>
          <div class="grow"><div class="label" style="color:var(--danger)">清空所有数据</div>
            <div class="sub">不可撤销，建议先导出备份</div></div>
          <span class="chev">›</span>
        </button>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">关于</h2></div>
      <div class="card">
        <div style="font-size:14px;line-height:1.75;color:var(--text-dim)">
          这个 App 把所有的记录都保存在你自己的手机上（localStorage），不上传任何服务器，也不需要注册登录。
          <b style="color:var(--text)">正因如此，换手机或清理浏览器数据前请务必导出备份。</b>
        </div>
        <div style="margin-top:14px;font-size:12.5px;color:var(--text-faint);line-height:1.7">
          统计数据：${store.getState().relapses.length} 条复吸 · ${store.getState().cravings.length} 条烟瘾 ·
          ${Object.keys(store.getState().diaries).length} 篇日记 · 已解锁 ${Object.keys(store.getState().unlocked).length} 个成就
        </div>
        <div style="margin-top:14px;font-size:12px;color:var(--text-faint);line-height:1.7">
          健康时间线参考 CDC / NHS 公开资料。本 App 不能替代医生的诊断和药物治疗建议。
          如果你烟龄较长或每天超过 20 支，戒烟前建议咨询医生，必要时使用尼古丁替代疗法。
        </div>
      </div>
    </div>

  </div>`;
}

function notificationState() {
  if (!('Notification' in window)) return '当前浏览器不支持';
  const p = Notification.permission;
  if (p === 'granted') return '已授权';
  if (p === 'denied') return '已被拒绝，需到系统设置里开启';
  return '未授权，打开开关即可申请';
}

function riskWindowSummary() {
  const hist = store.hourlyHistogram();
  const ranked = hist.map((n, h) => ({ n, h })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (!risks().length) return '记录更多烟瘾后自动识别';
  return `高危时段：${risks().map((h) => `${String(h).padStart(2, '0')}:00`).join('、')}`;
}

function risks() {
  const hist = store.hourlyHistogram();
  return hist
    .map((n, h) => ({ n, h }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => x.h)
    .sort((a, b) => a - b);
}

/* ==========================================================================
   Runtime self-check — lets you verify HTTPS / service worker / offline
   straight from the phone, with no Mac and no devtools.
   ========================================================================== */

const runtime = {
  mode: 'checking',
  secure: false,
  sw: 'checking',
  online: navigator.onLine,
  origin: typeof location !== 'undefined' ? location.origin : '',
  cache: '…',
};

const SW_LABEL = {
  checking: '检测中…',
  active: '已激活',
  registered: '已注册但未激活',
  none: '未注册',
  unsupported: '浏览器不支持',
  insecure: '被 HTTPS 限制',
  error: '检测失败',
};

async function refreshRuntime() {
  runtime.mode = isStandalone() ? 'standalone' : 'browser';
  runtime.online = navigator.onLine;
  runtime.secure = window.isSecureContext;
  runtime.origin = location.origin;

  if (!('serviceWorker' in navigator)) {
    runtime.sw = 'unsupported';
  } else if (!window.isSecureContext) {
    // browsers refuse to register a SW outside a secure context
    runtime.sw = 'insecure';
  } else {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      runtime.sw = reg ? (reg.active ? 'active' : 'registered') : 'none';
    } catch {
      runtime.sw = 'error';
    }
  }

  try {
    const keys = await caches.keys();
    runtime.cache = keys.length ? keys.join('、') : '无';
  } catch {
    runtime.cache = '不可用';
  }

  updateRuntimeDom();
  return runtime;
}

function updateRuntimeDom() {
  const values = {
    mode: runtime.mode === 'standalone' ? '已安装到主屏幕'
      : runtime.mode === 'browser' ? '浏览器标签页' : '检测中…',
    secure: runtime.secure ? '是' : '否',
    sw: SW_LABEL[runtime.sw] || runtime.sw,
    online: runtime.online ? '在线' : '离线',
    origin: runtime.origin,
    cache: runtime.cache,
  };

  Object.entries(values).forEach(([key, text]) => {
    document.querySelectorAll(`[data-rt="${key}"]`).forEach((el) => {
      el.textContent = text;
    });
  });

  /* colour the two rows that matter */
  const secureEl = document.querySelector('[data-rt="secure"]');
  if (secureEl) secureEl.style.color = runtime.secure ? 'var(--good)' : 'var(--danger)';

  const swEl = document.querySelector('[data-rt="sw"]');
  if (swEl) {
    swEl.style.color = runtime.sw === 'active' ? 'var(--good)'
      : runtime.sw === 'checking' ? 'var(--text-dim)'
        : 'var(--warn)';
  }

  const onlineEl = document.querySelector('[data-rt="online"]');
  if (onlineEl) onlineEl.style.color = runtime.online ? 'var(--good)' : 'var(--warn)';

  /* contextual warning */
  const box = document.querySelector('[data-rt-warning]');
  if (box) {
    let msg = '';
    if (!runtime.secure) {
      msg = '当前不是 HTTPS。用 IP 地址直接访问时，浏览器会禁止注册 Service Worker —— 网页能看，但断网就打不开，也不能真正装成 App。请配置 HTTPS 后再从主屏幕安装。';
    } else if (runtime.sw === 'none' || runtime.sw === 'registered') {
      msg = 'Service Worker 还没激活。如果你刚部署完，联网刷新一次页面等它装好；如果一直这样，检查服务器是不是把 sw.js 缓存住了。';
    } else if (runtime.sw === 'active' && runtime.mode !== 'standalone') {
      msg = '一切正常。点 Safari 底部的「分享」→「添加到主屏幕」，就能变成全屏 App 并离线使用。';
    }
    if (msg) {
      box.hidden = false;
      box.className = `banner${runtime.sw === 'active' ? '' : ''}`;
      box.innerHTML = `<span class="ic">${runtime.sw === 'active' ? '✅' : '⚠️'}</span><div class="grow">${esc(msg)}</div>`;
      box.style.background = runtime.sw === 'active' ? 'var(--good-soft)' : 'var(--warn-soft)';
      box.style.borderColor = runtime.sw === 'active' ? 'rgba(52,211,153,.28)' : 'rgba(251,191,36,.28)';
      box.style.color = runtime.sw === 'active' ? '#A7F3D0' : '#FDE68A';
    } else {
      box.hidden = true;
    }
  }
}

window.addEventListener('online', () => { runtime.online = true; updateRuntimeDom(); });
window.addEventListener('offline', () => { runtime.online = false; updateRuntimeDom(); });

/* ==========================================================================
   Binding per view
   ========================================================================== */

function bindCurrentView() {
  const root = $('#viewRoot');

  /* segmented control for the record tabs */
  if (ui.route === 'record') {
    root.querySelectorAll('[data-seg="recordTab"] button').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.recordTab = btn.dataset.val;
        persistUI();
        haptic(6);
        render();
      });
    });
  }

  /* the runtime panel needs an async probe to fill in */
  if (ui.route === 'settings') refreshRuntime();
}

/* ==========================================================================
   Global click delegation
   ========================================================================== */

document.addEventListener('click', (event) => {
  const nav = event.target.closest('#tabBar .tab-item');
  if (nav) {
    navigate(nav.dataset.route);
    haptic(6);
    return;
  }

  const btn = event.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;

  const actions = {
    'dismiss-banner': () => { ui.bannerDismissed = true; persistUI(); render(); },
    sos: () => openSOS(),
    'go-stats': () => navigate('stats'),
    'new-relapse': () => openRelapseSheet(),
    'new-craving': () => openCravingSheet(),
    'new-diary': () => openDiarySheet(dayKey()),
    'edit-diary': () => openDiarySheet(btn.dataset.day),
    'del-relapse': () => deleteRecord('relapse', btn.dataset.id, '删除这条复吸记录？'),
    'del-craving': () => deleteRecord('craving', btn.dataset.id, '删除这条烟瘾记录？'),
    'edit-quit': () => openQuitSheet(),
    'edit-habit': () => openHabitSheet(),
    'edit-goal': () => openGoalSheet(),
    'toggle-notify': () => toggleNotifications(),
    'toggle-risk': () => store.saveProfile({ riskReminder: !store.getState().profile.riskReminder }),
    'test-notify': () => sendNotification('测试提醒', '如果你看到这条，说明通知是通的。'),
    export: () => doExport(),
    import: () => doImport(),
    'seed-demo': () => doSeedDemo(),
    clear: () => doClear(),
    'cal-prev': () => { ui.calMonth = addMonths(ui.calMonth, -1); render(); },
    'cal-next': () => { ui.calMonth = addMonths(ui.calMonth, 1); render(); },
    'refresh-runtime': () => { refreshRuntime(); toast('已重新检测'); },
  };

  const fn = actions[act];
  if (fn) {
    event.preventDefault();
    fn();
  }
});

/* header SOS button */
$('#headerAction').hidden = false;
$('#headerAction').textContent = '🆘 急救';
$('#headerAction').addEventListener('click', () => openSOS());

/* sheet overlay: tap outside to close */
$('#sheetOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'sheetOverlay') closeSheet();
});

/* escape closes the topmost layer */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (isSOSOpen()) closeSOS();
  else if (!$('#sheetOverlay').hidden) closeSheet();
});

/* header shadow on scroll */
window.addEventListener('scroll', () => {
  const header = $('#appHeader');
  if (header) header.classList.toggle('is-scrolled', window.scrollY > 6);
}, { passive: true });

/* ==========================================================================
   Sheets: forms
   ========================================================================== */

function sheetHeader(title, sub) {
  return `<h2 class="sheet-title">${esc(title)}</h2>${sub ? `<p class="sheet-sub">${esc(sub)}</p>` : ''}`;
}

/* ---------- relapse ---------- */

function openRelapseSheet() {
  const model = { triggers: [], moods: [] };
  const html = `
    ${sheetHeader('记录一支烟', '不需要自责，如实记录就好。')}
    <div class="field">
      <div class="field-label"><span>抽了几支</span></div>
      <div class="stepper" data-value="1" data-min="1" data-max="50" data-unit="支" data-stepper="count">
        <button type="button" data-step="down">−</button>
        <span class="val">1<small>支</small></span>
        <button type="button" data-step="up">＋</button>
      </div>
    </div>
    <div class="field">
      <div class="field-label"><span>时间</span></div>
      <input class="input" type="datetime-local" value="${toLocalInput()}" data-time />
    </div>
    <div class="field">
      <div class="field-label"><span>什么场景</span><span class="hint">可多选</span></div>
      <div class="chip-row" data-chip-group>${chipRow(TRIGGERS, model.triggers, 'triggers')}</div>
    </div>
    <div class="field">
      <div class="field-label"><span>当时的心情</span></div>
      <div class="chip-row" data-chip-group>${chipRow(MOODS, model.moods, 'moods')}</div>
    </div>
    <div class="field">
      <div class="field-label"><span>备注</span><span class="hint">可选</span></div>
      <textarea class="textarea" data-note placeholder="发生了什么？下次想怎么应对？"></textarea>
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-save>保存</button>
    <div style="height:10px"></div>
  `;

  openSheet(html, (panel) => {
    bindChips(panel, model);
    const stepper = bindStepper(panel, '[data-stepper="count"]');

    const save = () => {
      const timeInput = panel.querySelector('[data-time]');
      const ts = timeInput.value ? new Date(timeInput.value).toISOString() : new Date().toISOString();
      store.addRelapse({
        ts,
        count: stepper.value,
        triggers: model.triggers,
        moods: model.moods,
        note: panel.querySelector('[data-note]').value,
      });
      closeSheet();
      toast('已记录。看看分析页，找出你的触发模式。');
      haptic(20);
      render();
    };

    panel.querySelector('[data-save]').addEventListener('click', save);
  });
}

/* ---------- manual craving ---------- */

function openCravingSheet() {
  const model = { triggers: [], moods: [], methods: [], resisted: '1', intensity: 6 };
  const html = `
    ${sheetHeader('补记一次烟瘾', '想起来才记也没关系，比不记强。')}
    <div class="field">
      <div class="field-label"><span>想抽的强度</span><span class="hint" data-iv>${model.intensity} / 10</span></div>
      <input type="range" min="1" max="10" step="1" value="${model.intensity}" data-intensity />
    </div>
    <div class="field">
      <div class="field-label"><span>结果</span></div>
      <div class="segmented" data-seg="resisted">
        <button type="button" data-val="1" class="is-active">扛过去了</button>
        <button type="button" data-val="0">还是抽了</button>
      </div>
    </div>
    <div class="field">
      <div class="field-label"><span>时间</span></div>
      <input class="input" type="datetime-local" value="${toLocalInput()}" data-time />
    </div>
    <div class="field">
      <div class="field-label"><span>什么触发的</span><span class="hint">可多选</span></div>
      <div class="chip-row">${chipRow(TRIGGERS, model.triggers, 'triggers')}</div>
    </div>
    <div class="field">
      <div class="field-label"><span>当时的心情</span></div>
      <div class="chip-row">${chipRow(MOODS, model.moods, 'moods')}</div>
    </div>
    <div class="field">
      <div class="field-label"><span>你做了什么</span></div>
      <div class="chip-row">${chipRow(METHODS, model.methods, 'methods')}</div>
    </div>
    <div class="field">
      <div class="field-label"><span>备注</span><span class="hint">可选</span></div>
      <textarea class="textarea" data-note placeholder="记一句当时的想法"></textarea>
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-save>保存</button>
    <div style="height:10px"></div>
  `;

  openSheet(html, (panel) => {
    bindChips(panel, model);
    bindSegment(panel, model, 'resisted');

    const range = panel.querySelector('[data-intensity]');
    const ivLabel = panel.querySelector('[data-iv]');
    range.addEventListener('input', () => {
      model.intensity = Number(range.value);
      ivLabel.textContent = `${model.intensity} / 10`;
    });

    panel.querySelector('[data-save]').addEventListener('click', () => {
      const timeInput = panel.querySelector('[data-time]');
      const ts = timeInput.value ? new Date(timeInput.value).toISOString() : new Date().toISOString();
      const resisted = model.resisted === '1';
      store.addCraving({
        ts,
        intensity: model.intensity,
        triggers: model.triggers,
        moods: model.moods,
        methods: model.methods,
        resisted,
        note: panel.querySelector('[data-note]').value,
      });
      if (!resisted) {
        store.addRelapse({ ts, count: 1, triggers: model.triggers, moods: model.moods, note: '' });
      }
      closeSheet();
      toast(resisted ? '记下了。这一仗你赢了。' : '记下了。这只是一次，不是结局。');
      haptic(20);
      render();
    });
  });
}

/* ---------- diary ---------- */

function openDiarySheet(day) {
  const key = day || dayKey();
  const existing = store.getState().diaries[key] || {};
  const model = {
    mood: existing.mood || '',
    symptoms: existing.symptoms ? [...existing.symptoms] : [],
  };

  const html = `
    ${sheetHeader(fmtDate(parseDayKey(key)), '一句话就够了。')}
    <div class="field">
      <div class="field-label"><span>这天抽了几支</span></div>
      <div class="stepper" data-value="${Number(existing.smoked) || 0}" data-min="0" data-max="60" data-unit="支" data-stepper="smoked">
        <button type="button" data-step="down">−</button>
        <span class="val">0<small>支</small></span>
        <button type="button" data-step="up">＋</button>
      </div>
    </div>
    <div class="field">
      <div class="field-label"><span>整体心情</span></div>
      <div class="chip-row">${chipRow(MOODS, model.mood, 'mood', { single: true })}</div>
    </div>
    <div class="field">
      <div class="field-label"><span>身体感受</span><span class="hint">可多选</span></div>
      <div class="chip-row">${chipRow(SYMPTOMS, model.symptoms, 'symptoms')}</div>
    </div>
    <div class="field">
      <div class="field-label"><span>体重</span><span class="hint">可选，公斤</span></div>
      <input class="input" type="number" inputmode="decimal" step="0.1" placeholder="例如 65.5"
             value="${existing.weight ? esc(existing.weight) : ''}" data-weight />
    </div>
    <div class="field">
      <div class="field-label"><span>今天怎么样</span><span class="hint">可选</span></div>
      <textarea class="textarea" data-note placeholder="有什么感觉、什么事、什么想法？">${esc(existing.note || '')}</textarea>
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-save>保存</button>
    <div style="height:10px"></div>
  `;

  openSheet(html, (panel) => {
    bindChips(panel, model);
    const stepper = bindStepper(panel, '[data-stepper="smoked"]');

    panel.querySelector('[data-save]').addEventListener('click', () => {
      const weightRaw = panel.querySelector('[data-weight]').value;
      store.saveDiary(key, {
        smoked: stepper.value,
        mood: model.mood,
        symptoms: model.symptoms,
        note: panel.querySelector('[data-note]').value.trim(),
        weight: weightRaw ? Number(weightRaw) : undefined,
      });
      closeSheet();
      toast('日记已保存');
      haptic(15);
      render();
    });
  });
}

/* ---------- quit date ---------- */

function openQuitSheet() {
  const p = store.getState().profile;
  const html = `
    ${sheetHeader('戒烟开始时间', '改到准确的时刻，计时会更真实。')}
    <div class="field">
      <div class="field-label"><span>日期与时间</span></div>
      <input class="input" type="datetime-local" value="${toLocalInput(p.quitAt)}" data-time />
    </div>
    <div class="stack" style="margin-bottom:16px">
      <button class="btn btn--sm" type="button" data-quick="now">就是现在</button>
      <button class="btn btn--sm" type="button" data-quick="today">今天 0 点</button>
      <button class="btn btn--sm" type="button" data-quick="yesterday">昨天 0 点</button>
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-save>保存</button>
    <div style="height:10px"></div>
  `;

  openSheet(html, (panel) => {
    const input = panel.querySelector('[data-time]');
    panel.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.quick;
        if (kind === 'now') input.value = toLocalInput(new Date());
        if (kind === 'today') { const d = startOfDay(new Date()); input.value = toLocalInput(d); }
        if (kind === 'yesterday') { const d = addDays(startOfDay(new Date()), -1); input.value = toLocalInput(d); }
        haptic(6);
      });
    });
    panel.querySelector('[data-save]').addEventListener('click', () => {
      if (!input.value) return;
      store.saveProfile({ quitAt: new Date(input.value).toISOString() });
      closeSheet();
      toast('已更新戒烟时间');
      render();
    });
  });
}

/* ---------- habit + price ---------- */

function openHabitSheet() {
  const p = store.getState().profile;
  const html = `
    ${sheetHeader('吸烟习惯', '用来计算你少抽了多少、省了多少钱。')}
    <div class="field">
      <div class="field-label"><span>原来每天抽几支</span></div>
      <div class="stepper" data-value="${p.cigsPerDay}" data-min="1" data-max="100" data-unit="支/天" data-stepper="perday">
        <button type="button" data-step="down">−</button>
        <span class="val">${p.cigsPerDay}<small>支/天</small></span>
        <button type="button" data-step="up">＋</button>
      </div>
    </div>
    <div class="field">
      <div class="field-label"><span>一包烟多少钱（元）</span></div>
      <input class="input" type="number" inputmode="decimal" step="0.5" value="${p.pricePerPack}" data-price />
    </div>
    <div class="field">
      <div class="field-label"><span>一包几支</span></div>
      <div class="stepper" data-value="${p.cigsPerPack}" data-min="1" data-max="50" data-unit="支/包" data-stepper="perpack">
        <button type="button" data-step="down">−</button>
        <span class="val">${p.cigsPerPack}<small>支/包</small></span>
        <button type="button" data-step="up">＋</button>
      </div>
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-save>保存</button>
    <div style="height:10px"></div>
  `;

  openSheet(html, (panel) => {
    const perDay = bindStepper(panel, '[data-stepper="perday"]');
    const perPack = bindStepper(panel, '[data-stepper="perpack"]');
    panel.querySelector('[data-save]').addEventListener('click', () => {
      const price = Number(panel.querySelector('[data-price]').value);
      store.saveProfile({
        cigsPerDay: perDay.value,
        cigsPerPack: perPack.value,
        pricePerPack: Number.isFinite(price) && price >= 0 ? price : 25,
      });
      closeSheet();
      toast('已保存');
      render();
    });
  });
}

/* ---------- savings goal ---------- */

const GOAL_PRESETS = [
  { name: '一顿好的', amount: 200 },
  { name: '一双球鞋', amount: 600 },
  { name: '一副耳机', amount: 1200 },
  { name: '一次短途旅行', amount: 3000 },
  { name: '一台新手机', amount: 6000 },
];

function openGoalSheet() {
  const p = store.getState().profile;
  const stats = store.computeStats();
  const html = `
    ${sheetHeader('存钱罐目标', `你已经省下 ¥${fmtMoney(stats.savedMoney)}，把它花在看得见的地方。`)}
    <div class="field">
      <div class="field-label"><span>想要什么</span></div>
      <input class="input" type="text" maxlength="16" placeholder="例如：一副新耳机"
             value="${esc(p.goal?.name || '')}" data-name />
      <div class="chip-row" style="margin-top:10px">
        ${GOAL_PRESETS.map((g) => `<button class="chip" type="button" data-preset="${esc(g.name)}" data-amount="${g.amount}">${esc(g.name)} · ¥${g.amount}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <div class="field-label"><span>目标金额（元）</span></div>
      <input class="input" type="number" inputmode="decimal" step="50" placeholder="1200"
             value="${p.goal?.amount ? esc(p.goal.amount) : ''}" data-amount />
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-save>保存</button>
    <button class="btn btn--ghost btn--block" type="button" data-clear>清除目标</button>
    <div style="height:10px"></div>
  `;

  openSheet(html, (panel) => {
    const nameEl = panel.querySelector('[data-name]');
    const amountEl = panel.querySelector('[data-amount]');
    panel.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        nameEl.value = btn.dataset.preset;
        amountEl.value = btn.dataset.amount;
        panel.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('is-on', b === btn));
        haptic(6);
      });
    });
    panel.querySelector('[data-save]').addEventListener('click', () => {
      const amount = Number(amountEl.value) || 0;
      store.saveProfile({ goal: { name: nameEl.value.trim() || '目标', amount } });
      closeSheet();
      toast(amount > 0 ? '目标已设定' : '已保存');
      render();
    });
    panel.querySelector('[data-clear]').addEventListener('click', () => {
      store.saveProfile({ goal: { name: '', amount: 0 } });
      closeSheet();
      toast('已清除目标');
      render();
    });
  });
}

/* ==========================================================================
   Actions
   ========================================================================== */

function deleteRecord(kind, id, title) {
  confirmSheet({
    title,
    body: '删除后无法恢复。',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      store.removeRecord(kind, id);
      toast('已删除');
      render();
    },
  });
}

function doExport() {
  const stamp = dayKey();
  downloadText(`戒烟备份-${stamp}.json`, store.exportJSON());
  toast('已导出备份文件');
}

function doImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) { input.remove(); return; }
    const reader = new FileReader();
    reader.onload = () => {
      input.remove();
      try {
        store.importJSON(String(reader.result));
        closeSheet();
        toast('导入成功');
        render();
      } catch (err) {
        toast(`导入失败：${err.message}`, 3200);
      }
    };
    reader.onerror = () => { input.remove(); toast('读取文件失败'); };
    reader.readAsText(file);
  });
  input.click();
}

function doSeedDemo() {
  confirmSheet({
    title: '载入演示数据',
    body: '这会覆盖当前所有记录，用于预览图表效果。建议先导出备份。',
    confirmText: '载入演示数据',
    danger: true,
    onConfirm: () => {
      store.seedDemoData();
      toast('演示数据已载入');
      render();
    },
  });
}

function doClear() {
  confirmSheet({
    title: '清空所有数据',
    body: '全部记录、成就和设置都会被删除，无法撤销。',
    confirmText: '确认清空',
    danger: true,
    onConfirm: () => {
      store.clearAll();
      toast('已清空，重新开始');
      render();
    },
  });
}

/* ==========================================================================
   Notifications
   ========================================================================== */

async function toggleNotifications() {
  const p = store.getState().profile;
  if (p.notifications) {
    store.saveProfile({ notifications: false });
    toast('已关闭通知');
    render();
    return;
  }

  if (!('Notification' in window)) {
    toast('当前浏览器不支持通知');
    return;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); } catch { /* user dismissed */ }
  }
  if (permission !== 'granted') {
    toast('没有拿到通知权限。iOS 上需要先「添加到主屏幕」，再在系统设置里允许通知。', 3600);
    render();
    return;
  }

  store.saveProfile({ notifications: true });
  toast('通知已开启');
  await sendNotification('通知已开启 ✅', '我会在你容易想抽烟的时段提醒你。');
  render();
}

async function sendNotification(title, body, tag = 'quit-test') {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    toast('通知权限未开启');
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg && reg.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: './static/icons/icon-192.png',
        badge: './static/icons/icon-192.png',
        tag,
      });
      return true;
    }
  } catch { /* fall through to the plain constructor */ }
  try {
    new Notification(title, { body, icon: './static/icons/icon-192.png', tag });
    return true;
  } catch {
    toast('通知发送失败');
    return false;
  }
}

/** Fires at most one milestone + one risk-window notice per app session. */
async function maybeNotify() {
  const p = store.getState().profile;
  if (!p.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;

  const stats = store.computeStats();
  const mp = milestoneProgress(stats.elapsedMs);
  const seen = p.notified || {};
  const todayKey = dayKey();

  /* --- newly crossed milestone --- */
  if (mp.done.length && !seen[`ms:${mp.done.length}`]) {
    const last = mp.done[mp.done.length - 1];
    await sendNotification(`${last.emoji} 达成「${last.title}」`, last.desc, 'quit-milestone');
    seen[`ms:${mp.done.length}`] = Date.now();
  }

  /* --- risk window: 15 min before a historically high-risk hour --- */
  if (p.riskReminder) {
    const hour = new Date().getHours();
    const riskHours = risks();
    const soon = riskHours.find((h) => (h - 1 + 24) % 24 === hour || h === hour);
    const key = `risk:${todayKey}:${soon}`;
    if (soon !== undefined && !seen[key]) {
      await sendNotification(
        '⚠️ 高危时段快到了',
        `你通常在 ${String(soon).padStart(2, '0')}:00 前后最想抽烟。先倒杯水，把急救按钮放在手边。`,
        'quit-risk'
      );
      seen[key] = Date.now();
    }
  }

  store.saveProfile({ notified: seen });
}

/* ==========================================================================
   Onboarding
   ========================================================================== */

function maybeOnboard() {
  const p = store.getState().profile;
  if (p.onboarded) return;

  const model = { quitAt: toLocalInput(new Date()) };
  const html = `
    ${sheetHeader('先设置三件事', '这些数据只存在你的手机上，用来算你省了多少钱、身体恢复到了哪一步。')}
    <div class="field">
      <div class="field-label"><span>你从什么时候开始戒烟的</span></div>
      <input class="input" type="datetime-local" value="${model.quitAt}" data-time />
      <div class="chip-row" style="margin-top:10px">
        <button class="chip" type="button" data-quick="now">就是现在</button>
        <button class="chip" type="button" data-quick="today">今天 0 点</button>
        <button class="chip" type="button" data-quick="yesterday">昨天 0 点</button>
      </div>
    </div>
    <div class="field">
      <div class="field-label"><span>原来每天抽几支</span></div>
      <div class="stepper" data-value="20" data-min="1" data-max="100" data-unit="支/天" data-stepper="perday">
        <button type="button" data-step="down">−</button>
        <span class="val">20<small>支/天</small></span>
        <button type="button" data-step="up">＋</button>
      </div>
    </div>
    <div class="field">
      <div class="field-label"><span>一包烟多少钱（元）</span></div>
      <input class="input" type="number" inputmode="decimal" step="0.5" value="25" data-price />
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-save>开始</button>
    <button class="btn btn--ghost btn--block" type="button" data-skip>先随便看看</button>
    <div style="height:10px"></div>
  `;

  openSheet(html, (panel) => {
    const timeEl = panel.querySelector('[data-time]');
    const stepper = bindStepper(panel, '[data-stepper="perday"]');
    panel.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.quick;
        const d = kind === 'now' ? new Date() : addDays(startOfDay(new Date()), kind === 'yesterday' ? -1 : 0);
        timeEl.value = toLocalInput(d);
        panel.querySelectorAll('[data-quick]').forEach((b) => b.classList.toggle('is-on', b === btn));
        haptic(6);
      });
    });
    panel.querySelector('[data-save]').addEventListener('click', () => {
      const price = Number(panel.querySelector('[data-price]').value);
      store.saveProfile({
        quitAt: new Date(timeEl.value || new Date()).toISOString(),
        cigsPerDay: stepper.value,
        pricePerPack: Number.isFinite(price) && price >= 0 ? price : 25,
        onboarded: true,
      });
      closeSheet();
      toast('开始吧。今天不抽，就是全部的胜利。', 3000);
      render();
    });
    panel.querySelector('[data-skip]').addEventListener('click', () => {
      store.saveProfile({ onboarded: true });
      closeSheet();
      render();
    });
  });
}

/* ==========================================================================
   Achievement celebrations
   ========================================================================== */

let freshQueue = [];

store.subscribe((_state, meta) => {
  if (meta && meta.fresh && meta.fresh.length) {
    freshQueue.push(...meta.fresh);
    // let the sheet that triggered this finish closing first
    setTimeout(showNextAchievement, 420);
  }
});

let celebrating = false;

function showNextAchievement() {
  if (celebrating || !freshQueue.length) return;
  // don't stack on top of the SOS overlay
  if (isSOSOpen()) {
    setTimeout(showNextAchievement, 1500);
    return;
  }
  const ach = freshQueue.shift();
  celebrating = true;
  haptic([15, 60, 15]);

  openSheet(`
    <div style="text-align:center;padding:10px 0 4px">
      <div style="font-size:64px;line-height:1;animation:pop-in .5s cubic-bezier(.2,1.4,.4,1)">${ach.emoji}</div>
      <div style="font-size:12px;font-weight:700;letter-spacing:.18em;color:var(--accent);margin-top:16px">成就解锁</div>
      <h2 class="sheet-title" style="margin-top:8px">${esc(ach.name)}</h2>
      <p class="sheet-sub" style="margin-bottom:22px">${esc(ach.desc)}</p>
    </div>
    <button class="btn btn--primary btn--block btn--lg" type="button" data-ok>继续</button>
    <div style="height:10px"></div>
  `, (panel) => {
    panel.querySelector('[data-ok]').addEventListener('click', () => {
      closeSheet();
      celebrating = false;
      setTimeout(showNextAchievement, 420);
    });
  });
}

/* ==========================================================================
   Helpers
   ========================================================================== */

function isStandalone() {
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true
  );
}

/* ==========================================================================
   Service worker + boot
   ========================================================================== */

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    // pick up new versions without a manual hard-refresh
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('有新版本，刷新后生效', 3000);
        }
      });
    });
  } catch (err) {
    console.warn('[sw] registration failed:', err);
  }
}

function boot() {
  render();
  maybeOnboard();
  registerSW();
  refreshRuntime();
  setTimeout(maybeNotify, 2500);

  // re-check reminders whenever the app comes back to the foreground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tickLive();
      refreshRuntime();
      setTimeout(maybeNotify, 1200);
    }
  });
}

boot();

/* expose a few internals for debugging in the console */
window.__qs = { store, ui, render, navigate, openSOS, runtime, refreshRuntime };
