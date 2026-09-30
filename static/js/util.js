/* ==========================================================================
   util.js — tiny helpers: DOM, dates, formatting, toast, sheet
   ========================================================================== */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- escaping ---------- */

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- ids ---------- */

let seq = 0;
export function uid(prefix = 'id') {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/* ---------- numbers ---------- */

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function fmtInt(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('zh-CN');
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(2).replace(/\.00$/, '') + ' 万';
  return v.toFixed(v >= 100 || Number.isInteger(v) ? 0 : 1);
}

export function pct(part, whole) {
  if (!whole) return 0;
  return clamp(Math.round((part / whole) * 100), 0, 100);
}

/* ---------- dates ---------- */

export const MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(date, n) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** Local 'YYYY-MM-DD' key — never use toISOString() here, it shifts by timezone. */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDayKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Local 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">. */
export function toLocalInput(date = new Date()) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDate(date, withYear = true) {
  const d = new Date(date);
  const base = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return withYear ? `${d.getFullYear()} 年 ${base}` : base;
}

export function fmtTime(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDateTime(date) {
  return `${fmtDate(date)} ${fmtTime(date)}`;
}

export function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return '刚刚';
  const m = Math.floor(diff / MS.m);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  if (d < 30) return `${Math.floor(d / 7)} 周前`;
  return fmtDate(ts, false);
}

export function durationParts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function fmtClock(ms) {
  const { h, m, s } = durationParts(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/** Human duration in Chinese, e.g. "3 天 4 小时". */
export function fmtSpan(ms) {
  const { d, h, m } = durationParts(ms);
  if (d > 0) return h > 0 ? `${d} 天 ${h} 小时` : `${d} 天`;
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  if (m > 0) return `${m} 分钟`;
  return '不到 1 分钟';
}

/** Countdown style, e.g. "2 天 03:12:40" (or "5:04" under an hour). */
export function fmtCountdown(ms) {
  const { d, h, m, s } = durationParts(ms);
  const p = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d} 天 ${p(h)}:${p(m)}:${p(s)}`;
  if (h > 0) return `${h}:${p(m)}:${p(s)}`;
  return `${m}:${p(s)}`;
}

export function isSameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

/* ---------- misc ---------- */

/* Chrome/Firefox log a console error if vibrate() is called before the user
   has interacted with the frame, so gate it behind the first real tap. */
let hapticsArmed = false;
if (typeof window !== 'undefined') {
  const arm = () => {
    hapticsArmed = true;
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('touchstart', arm);
    window.removeEventListener('keydown', arm);
  };
  window.addEventListener('pointerdown', arm, { passive: true });
  window.addEventListener('touchstart', arm, { passive: true });
  window.addEventListener('keydown', arm, { passive: true });
}

export function haptic(pattern = 12) {
  if (!hapticsArmed || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* iOS Safari has no vibrate */ }
}

export function groupBy(list, keyFn) {
  const out = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

export function avg(list, fn = (x) => x) {
  return list.length ? sum(list, fn) / list.length : 0;
}

export function topN(map, n = 5) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/* ---------- toast ---------- */

let toastTimer = null;
let toastOutTimer = null;

export function toast(message, ms = 2000) {
  const node = $('#toast');
  if (!node) return;
  clearTimeout(toastTimer);
  clearTimeout(toastOutTimer);
  node.textContent = message;
  node.hidden = false;
  node.classList.remove('is-out');
  // restart the entry animation
  node.style.animation = 'none';
  void node.offsetWidth;
  node.style.animation = '';
  toastTimer = setTimeout(() => {
    node.classList.add('is-out');
    toastOutTimer = setTimeout(() => { node.hidden = true; }, 280);
  }, ms);
}

/* ---------- bottom sheet ---------- */

export function openSheet(html, onMount) {
  const overlay = $('#sheetOverlay');
  const panel = $('#sheetPanel');
  if (!overlay || !panel) return;
  panel.innerHTML = `<div class="sheet-handle"></div>${html}`;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(panel);
}

export function closeSheet() {
  const overlay = $('#sheetOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
  const panel = $('#sheetPanel');
  if (panel) panel.innerHTML = '';
}

export function sheetOpen() {
  const overlay = $('#sheetOverlay');
  return !!overlay && !overlay.hidden;
}

/** Standard confirmation sheet (nicer than window.confirm). */
export function confirmSheet({ title, body, confirmText = '确定', danger = false, onConfirm }) {
  openSheet(
    `<h2 class="sheet-title">${esc(title)}</h2>
     ${body ? `<p class="sheet-sub">${esc(body)}</p>` : ''}
     <div class="stack" style="margin-top:6px">
       <button class="btn btn--block ${danger ? 'btn--danger' : 'btn--primary'} btn--lg" data-confirm>${esc(confirmText)}</button>
       <button class="btn btn--block btn--ghost" data-cancel>取消</button>
     </div>`,
    (panel) => {
      panel.querySelector('[data-confirm]').addEventListener('click', () => {
        closeSheet();
        if (onConfirm) onConfirm();
      });
      panel.querySelector('[data-cancel]').addEventListener('click', closeSheet);
    }
  );
}

/* ---------- download helper ---------- */

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- svg helpers for charts ---------- */

export function svgEl(width, height, inner, extra = '') {
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"
            role="img" ${extra}>${inner}</svg>`;
}

export function niceMax(value) {
  if (value <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
