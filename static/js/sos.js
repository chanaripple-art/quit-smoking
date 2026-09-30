/* ==========================================================================
   sos.js — the craving rescue overlay.
   A 5-minute guided intervention: countdown + paced breathing + the 4 D's,
   ending in a short exit survey that turns the episode into data.
   ========================================================================== */

import { $, esc, haptic, toast, openSheet, closeSheet } from './util.js';
import { FOUR_D, SOS_TIPS, CHEERS, TRIGGERS, MOODS, METHODS } from './content.js';
import { addCraving, addRelapse } from './store.js';

/* Paced breathing: 4s in / 2s hold / 6s out / 2s rest = 14s per cycle.
   Long exhales push the parasympathetic system, which is what actually
   takes the edge off a craving. */
const PHASES = [
  { id: 'inhale', label: '吸气', sec: 4, scale: 1.42, animate: true },
  { id: 'hold',   label: '屏住', sec: 2, scale: 1.42, animate: false },
  { id: 'exhale', label: '呼气', sec: 6, scale: 1.0,  animate: true },
  { id: 'rest',   label: '停',   sec: 2, scale: 1.0,  animate: false },
];

const DURATIONS = [
  { sec: 180, label: '3 分钟' },
  { sec: 300, label: '5 分钟' },
  { sec: 600, label: '10 分钟' },
];

let session = null; // active session timers/state

/* ---------- lifecycle ---------- */

export function openSOS(totalSec = 300) {
  const overlay = $('#sosOverlay');
  const content = $('#sosContent');
  if (!overlay || !content) return;

  closeSOS(true);

  session = {
    totalSec,
    remaining: totalSec,
    startedAt: Date.now(),
    phaseIdx: 0,
    phaseStartedAt: Date.now(),
    tipIdx: Math.floor(Math.random() * SOS_TIPS.length),
    phaseTimer: null,
    tickTimer: null,
    tipTimer: null,
    stage: 'running',
    intensity: 6,
    triggers: [],
    moods: [],
    methods: [],
  };

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  haptic(20);

  renderRunning(content);

  session.phaseTimer = setTimeout(runPhase, PHASES[0].sec * 1000);
  session.tickTimer = setInterval(tick, 250);
  session.tipTimer = setInterval(rotateTip, 20000);
}

export function closeSOS(silent = false) {
  if (!session) {
    const overlay = $('#sosOverlay');
    if (overlay) overlay.hidden = true;
    return;
  }
  clearTimeout(session.phaseTimer);
  clearInterval(session.tickTimer);
  clearInterval(session.tipTimer);
  session = null;
  const overlay = $('#sosOverlay');
  if (overlay) overlay.hidden = true;
  if (!silent) document.body.style.overflow = '';
}

export function isSOSOpen() {
  const overlay = $('#sosOverlay');
  return !!overlay && !overlay.hidden;
}

/* ---------- running stage ---------- */

function renderRunning(root) {
  const s = session;
  root.innerHTML = `
    <div class="sos-top">
      <button class="sos-close" type="button" data-close aria-label="关闭">
        <svg viewBox="0 0 24 24"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"/></svg>
      </button>
      <span class="sos-phase-note">烟瘾急救</span>
      <button class="sos-close" type="button" data-durations style="font-size:12px;font-weight:600;width:auto;padding:0 12px;border-radius:999px;height:34px">
        ${DURATIONS.find((d) => d.sec === s.totalSec)?.label || '5 分钟'}
      </button>
    </div>

    <div class="breath-stage">
      <div class="breath-ring"></div>
      <div class="breath-orb" data-orb>
        <div class="inner">
          <div class="ph" data-phase>${PHASES[0].label}</div>
          <div class="cd" data-phasecd>${PHASES[0].sec}</div>
          <div class="sb">跟着呼吸</div>
        </div>
      </div>
    </div>

    <div class="sos-timer" data-clock>${mmss(s.remaining)}</div>
    <div class="sos-timer-sub">烟瘾的峰值通常只持续 3–5 分钟</div>

    <div class="card" style="margin-top:16px;text-align:center;min-height:64px;display:grid;place-items:center">
      <div data-tip style="font-size:14px;line-height:1.65;color:var(--text-dim)">${esc(SOS_TIPS[s.tipIdx])}</div>
    </div>

    <div class="section" style="margin-top:20px">
      <div class="section-head"><h2 class="section-title">4D 法则</h2></div>
      <div class="four-d">
        ${FOUR_D.map((d) => `
          <div class="four-d-item">
            <div class="k">${esc(d.k)}</div>
            <div class="grow">
              <div class="t">${esc(d.t)}</div>
              <div class="d">${esc(d.d)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <div class="stack" style="margin-top:20px">
      <button class="btn btn--good btn--block btn--lg" type="button" data-won>✓ 我扛过去了</button>
      <button class="btn btn--ghost btn--block" type="button" data-lost>我还是抽了</button>
    </div>

    <div style="height:14px"></div>
  `;

  root.querySelector('[data-close]').addEventListener('click', () => {
    if (session && session.stage === 'running') goVerdict();
    else closeSOS();
  });

  root.querySelector('[data-durations]').addEventListener('click', showDurationPicker);
  root.querySelector('[data-won]').addEventListener('click', () => goVerdict(true));
  root.querySelector('[data-lost]').addEventListener('click', () => goVerdict(false));

  applyBreath(PHASES[0]);
}

function tick() {
  if (!session || session.stage !== 'running') return;

  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  session.remaining = Math.max(0, session.totalSec - elapsed);

  const clock = $('[data-clock]');
  if (clock) clock.textContent = mmss(session.remaining);

  /* phase countdown inside the orb */
  const ph = PHASES[session.phaseIdx];
  const phElapsed = Math.floor((Date.now() - session.phaseStartedAt) / 1000);
  const phLeft = Math.max(1, ph.sec - phElapsed);
  const cd = $('[data-phasecd]');
  if (cd) cd.textContent = phLeft;

  if (session.remaining <= 0) goVerdict();
}

function runPhase() {
  if (!session || session.stage !== 'running') return;
  session.phaseIdx = (session.phaseIdx + 1) % PHASES.length;
  session.phaseStartedAt = Date.now();
  applyBreath(PHASES[session.phaseIdx]);
  session.phaseTimer = setTimeout(runPhase, PHASES[session.phaseIdx].sec * 1000);
}

function applyBreath(phase) {
  const orb = $('[data-orb]');
  const label = $('[data-phase]');
  const cd = $('[data-phasecd]');
  if (label) label.textContent = phase.label;
  if (cd) cd.textContent = phase.sec;
  if (orb) {
    orb.style.transition = phase.animate
      ? `transform ${phase.sec}s cubic-bezier(0.4, 0, 0.6, 1)`
      : 'none';
    orb.style.transform = `scale(${phase.scale})`;
  }
}

function rotateTip() {
  if (!session || session.stage !== 'running') return;
  session.tipIdx = (session.tipIdx + 1) % SOS_TIPS.length;
  const el = $('[data-tip]');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => {
      if (!session) return;
      const node = $('[data-tip]');
      if (node) {
        node.textContent = SOS_TIPS[session.tipIdx];
        node.style.transition = 'opacity .4s';
        node.style.opacity = '1';
      }
    }, 300);
  }
  haptic(6);
}

function showDurationPicker() {
  if (!session) return;
  const current = session.totalSec;
  const html = `
    <h2 class="sheet-title">急救时长</h2>
    <p class="sheet-sub">烟瘾峰值一般在 3–5 分钟内退潮，时间越长越保险。</p>
    <div class="stack">
      ${DURATIONS.map((d) => `
        <button class="btn btn--block ${d.sec === current ? 'btn--primary' : ''}" type="button" data-sec="${d.sec}">
          ${esc(d.label)}
        </button>`).join('')}
    </div>`;
  openSheet(html, (panel) => {    panel.querySelectorAll('[data-sec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sec = Number(btn.dataset.sec);
        closeSheet();
        if (session) {
          const spent = Math.floor((Date.now() - session.startedAt) / 1000);
          session.totalSec = sec;
          session.startedAt = Date.now() - spent * 1000;
          session.remaining = Math.max(0, sec - spent);
          session.phaseIdx = 0;
          session.phaseStartedAt = Date.now();
          clearTimeout(session.phaseTimer);
          renderRunning($('#sosContent'));
          session.phaseTimer = setTimeout(runPhase, PHASES[0].sec * 1000);
        }
      });
    });
  });
}

/* ---------- verdict stage (exit survey) ---------- */

function goVerdict(preset = null) {
  if (!session) return;
  session.stage = 'verdict';
  clearTimeout(session.phaseTimer);
  clearInterval(session.tickTimer);
  clearInterval(session.tipTimer);

  if (preset !== null) session.presetResisted = preset;

  renderVerdict();
}

function renderVerdict() {
  const root = $('#sosContent');
  const s = session;
  const spent = Math.max(1, Math.round((Date.now() - s.startedAt) / 1000));
  const preset = s.presetResisted;

  root.innerHTML = `
    <div class="sos-top">
      <button class="sos-close" type="button" data-close aria-label="关闭">
        <svg viewBox="0 0 24 24"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"/></svg>
      </button>
      <span class="sos-phase-note">记录这一次</span>
      <span style="width:34px"></span>
    </div>

    <div class="sos-verdict" style="margin:14px 0 6px">
      <div class="big">${preset === true ? '💪' : preset === false ? '🫂' : '⏳'}</div>
      <div style="font-size:19px;font-weight:700">${preset === true ? '这一波你赢了' : preset === false ? '没关系，重新开始' : '时间到了'}</div>
      <div style="font-size:13.5px;color:var(--text-dim);margin-top:6px;line-height:1.6">
        ${preset === false
          ? '一次复吸不会抹掉之前的努力。把它记下来，我们就知道下次该躲开什么。'
          : spent < 20
            ? '你停下来了，这就够了。下次可以跟着呼吸多待一会儿，效果会更好。'
            : `你在急救里待了 ${spent} 秒，这本身就是有效的抵抗。`}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">刚才有多想抽</h2><span class="section-note" data-iv>${s.intensity} / 10</span></div>
      <input type="range" min="1" max="10" step="1" value="${s.intensity}" data-intensity />
    </div>

    ${preset !== true ? `
    <div class="section">
      <div class="section-head"><h2 class="section-title">结果</h2></div>
      <div class="segmented" data-resisted>
        <button type="button" data-val="1" class="${preset === true ? 'is-active' : ''}">我扛过去了</button>
        <button type="button" data-val="0" class="${preset === false ? 'is-active' : ''}">我抽了</button>
      </div>
    </div>` : ''}

    <div class="section">
      <div class="section-head"><h2 class="section-title">什么触发的</h2><span class="section-note">可多选</span></div>
      <div class="chip-row" data-triggers>
        ${TRIGGERS.map((t) => `<button class="chip" type="button" data-id="${t.id}">${t.emoji} ${esc(t.label)}</button>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">当时的心情</h2></div>
      <div class="chip-row" data-moods>
        ${MOODS.map((m) => `<button class="chip" type="button" data-id="${m.id}">${m.emoji} ${esc(m.label)}</button>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="section-title">你做了什么</h2></div>
      <div class="chip-row" data-methods>
        ${METHODS.map((m) => `<button class="chip" type="button" data-id="${m.id}">${m.emoji} ${esc(m.label)}</button>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="field">
        <div class="field-label"><span>备注</span><span class="hint">可选</span></div>
        <textarea class="textarea" data-note placeholder="写点什么，下次会更有准备"></textarea>
      </div>
    </div>

    <div class="stack" style="margin-top:18px">
      <button class="btn btn--primary btn--block btn--lg" type="button" data-save>保存记录</button>
      <button class="btn btn--ghost btn--block" type="button" data-skip>不记录，直接关闭</button>
    </div>
    <div style="height:14px"></div>
  `;

  /* --- wire up --- */
  const intensity = root.querySelector('[data-intensity]');
  const ivLabel = root.querySelector('[data-iv]');
  intensity.addEventListener('input', () => {
    s.intensity = Number(intensity.value);
    ivLabel.textContent = `${s.intensity} / 10`;
  });

  const resistedGroup = root.querySelector('[data-resisted]');
  if (resistedGroup) {
    s.resisted = preset;
    resistedGroup.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        s.resisted = btn.dataset.val === '1';
        resistedGroup.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
        haptic(8);
      });
    });
  } else {
    s.resisted = true;
  }

  const bindChips = (selector, key) => {
    const wrap = root.querySelector(selector);
    if (!wrap) return;
    wrap.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.id;
        const list = s[key];
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1);
        else list.push(id);
        chip.classList.toggle('is-on', i < 0);
        haptic(6);
      });
    });
  };
  bindChips('[data-triggers]', 'triggers');
  bindChips('[data-moods]', 'moods');
  bindChips('[data-methods]', 'methods');

  const finish = () => {
    if (s.resisted !== true && s.resisted !== false) {
      toast('先选一下刚才的结果');
      return;
    }
    const outcome = s.resisted;
    const durationSec = spent;
    const payload = {
      intensity: s.intensity,
      triggers: s.triggers,
      moods: s.moods,
      methods: s.methods,
      note: root.querySelector('[data-note]').value,
      resisted: outcome,
    };

    if (outcome) {
      addCraving({ ...payload, ts: new Date().toISOString(), durationSec, resisted: true });
      toast(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    } else {
      addCraving({ ...payload, ts: new Date().toISOString(), durationSec, resisted: false });
      addRelapse({
        ts: new Date().toISOString(),
        count: 1,
        triggers: s.triggers,
        moods: s.moods,
        note: payload.note,
      });
      toast('已记录。清空计时不会清空你走过的路。');
    }
    closeSOS();
  };

  root.querySelector('[data-save]').addEventListener('click', finish);
  root.querySelector('[data-skip]').addEventListener('click', () => closeSOS());
  root.querySelector('[data-close]').addEventListener('click', () => closeSOS());
}

function mmss(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
