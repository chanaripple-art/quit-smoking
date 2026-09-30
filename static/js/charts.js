/* ==========================================================================
   charts.js — dependency-free SVG chart renderers.
   Every function returns an HTML/SVG string; no canvas, no libraries, so it
   works fully offline inside the PWA.
   ========================================================================== */

import { esc, niceMax } from './util.js';

let gradSeq = 0;
const nextGradId = () => `grad${(gradSeq += 1)}`;

const PALETTE = {
  accent: 'var(--accent)',
  danger: 'var(--danger)',
  warn: 'var(--warn)',
  info: 'var(--info)',
  good: 'var(--good)',
};

/* --------------------------------------------------------------------------
   Line chart (multi-series, area fill on the first series)
   -------------------------------------------------------------------------- */

export function lineChart(series, labels, opts = {}) {
  const { height = 160, yTicks = 3, unit = '' } = opts;
  const W = 340;
  const H = height;
  const padL = 30;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = series.flatMap((s) => s.values);
  const rawMax = Math.max(1, ...values);
  const maxY = niceMax(rawMax);
  const n = Math.max(1, (series[0]?.values.length || 1) - 1);

  const xAt = (i) => padL + (plotW * i) / n;
  const yAt = (v) => padT + plotH - (plotH * v) / maxY;

  let inner = '';

  /* horizontal grid + y labels */
  for (let t = 0; t <= yTicks; t += 1) {
    const v = (maxY * t) / yTicks;
    const y = yAt(v);
    inner += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"
                stroke="var(--border)" stroke-width="1" stroke-dasharray="${t === 0 ? '0' : '3 4'}"/>`;
    inner += `<text x="${padL - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end"
                font-size="9.5" fill="var(--text-faint)">${Math.round(v)}</text>`;
  }

  /* series */
  series.forEach((s, si) => {
    const color = s.color || PALETTE.accent;
    const pts = s.values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);

    if (si === 0 && s.fill !== false && s.values.length > 1) {
      const gid = nextGradId();
      inner += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="${color}" stop-opacity="0.30"/>
                  <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient></defs>`;
      inner += `<polygon points="${padL},${yAt(0).toFixed(1)} ${pts.join(' ')} ${xAt(n).toFixed(1)},${yAt(0).toFixed(1)}"
                  fill="url(#${gid})"/>`;
    }

    inner += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}"
                stroke-width="${s.dashed ? 1.6 : 2.2}" stroke-linejoin="round" stroke-linecap="round"
                ${s.dashed ? 'stroke-dasharray="4 4" opacity="0.75"' : ''}/>`;

    if (s.dot !== false && s.values.length) {
      const lastX = xAt(s.values.length - 1);
      const lastY = yAt(s.values[s.values.length - 1]);
      inner += `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.4" fill="${color}"/>`;
    }
  });

  /* x labels — first / middle / last only, to stay legible on a phone */
  const labelIdx = labels.length <= 1 ? [0] : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];
  const seen = new Set();
  labelIdx.forEach((i) => {
    if (i < 0 || i >= labels.length || seen.has(i)) return;
    seen.add(i);
    const anchor = i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle';
    const x = Math.min(Math.max(xAt(i), padL), W - padR);
    inner += `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}"
                font-size="9.5" fill="var(--text-faint)">${esc(labels[i])}</text>`;
  });

  const legend = series.length > 1
    ? `<div class="row wrap" style="gap:14px;margin-top:8px;font-size:12px;color:var(--text-faint)">
         ${series.map((s) => `<span class="row" style="gap:5px">
            <i style="width:10px;height:10px;border-radius:3px;background:${s.color || PALETTE.accent};display:block"></i>${esc(s.name || '')}
         </span>`).join('')}
       </div>`
    : '';

  /* max marker label */
  const peak = Math.max(...values);
  const peakNote = unit && peak > 0
    ? `<div style="font-size:11.5px;color:var(--text-faint);margin-top:4px">峰值 ${peak}${esc(unit)}</div>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="趋势图">${inner}</svg>${peakNote}${legend}`;
}

/* --------------------------------------------------------------------------
   Column chart (hourly craving distribution)
   -------------------------------------------------------------------------- */

export function columnChart(values, labels, opts = {}) {
  const { height = 140, color = PALETTE.accent, highlightMax = true, unit = '' } = opts;
  const W = 340;
  const H = height;
  const padL = 26;
  const padR = 8;
  const padT = 16;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = Math.max(1, ...values);
  const maxY = niceMax(max);
  const n = values.length;
  const slot = plotW / Math.max(1, n);
  const barW = Math.max(3, slot * 0.62);
  const peakIdx = values.indexOf(Math.max(...values));

  let inner = '';
  for (let t = 0; t <= 2; t += 1) {
    const v = (maxY * t) / 2;
    const y = padT + plotH - (plotH * v) / maxY;
    inner += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"
                stroke="var(--border)" stroke-width="1" stroke-dasharray="${t === 0 ? '0' : '3 4'}"/>`;
    inner += `<text x="${padL - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end"
                font-size="9.5" fill="var(--text-faint)">${Math.round(v)}</text>`;
  }

  values.forEach((v, i) => {
    const h = v > 0 ? Math.max(2, (plotH * v) / maxY) : 0;
    const x = padL + slot * i + (slot - barW) / 2;
    const y = padT + plotH - h;
    const isPeak = highlightMax && i === peakIdx && v > 0;
    if (h > 0) {
      inner += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
                  rx="${Math.min(3, barW / 2).toFixed(1)}"
                  fill="${isPeak ? PALETTE.warn : color}" opacity="${isPeak ? 1 : 0.78}"/>`;
    }
    if (isPeak) {
      inner += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle"
                  font-size="9.5" font-weight="600" fill="${PALETTE.warn}">${v}</text>`;
    }
  });

  /* x labels: every 3 hours */
  labels.forEach((lb, i) => {
    if (i % 3 !== 0 && i !== labels.length - 1) return;
    const x = padL + slot * i + slot / 2;
    inner += `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle"
                font-size="9" fill="var(--text-faint)">${esc(lb)}</text>`;
  });

  const note = peakIdx >= 0 && values[peakIdx] > 0
    ? `<div style="font-size:11.5px;color:var(--text-faint);margin-top:4px">
         高危时段：<b style="color:var(--warn)">${esc(labels[peakIdx])}</b> 前后（${values[peakIdx]} 次${esc(unit)}）
       </div>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="时段分布">${inner}</svg>${note}`;
}

/* --------------------------------------------------------------------------
   Ring / donut gauge
   -------------------------------------------------------------------------- */

export function ring(progress, opts = {}) {
  const { size = 84, stroke = 9, color = PALETTE.accent, label = '', sub = '' } = opts;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const mid = size / 2;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"
      transform="rotate(-90 ${mid} ${mid})"/>
    ${label ? `<text x="${mid}" y="${mid + 1}" text-anchor="middle" font-size="${size * 0.26}" font-weight="700" fill="var(--text)">${esc(label)}</text>` : ''}
    ${sub ? `<text x="${mid}" y="${mid + size * 0.19}" text-anchor="middle" font-size="${size * 0.13}" fill="var(--text-faint)">${esc(sub)}</text>` : ''}
  </svg>`;
}

/* --------------------------------------------------------------------------
   HTML horizontal bar list (triggers, methods, moods)
   -------------------------------------------------------------------------- */

export function hbarList(items, opts = {}) {
  const { unit = '次', dangerRatio = 0.5, showSlipped = true } = opts;
  if (!items.length) return '';
  const max = Math.max(1, ...items.map((i) => i.value));
  return items
    .map((it) => {
      const width = Math.max(2, (it.value / max) * 100);
      const ratio = it.value ? it.slipped / it.value : 0;
      const cls = ratio >= dangerRatio && it.slipped > 0 ? 'is-danger' : ratio > 0.25 ? 'is-warn' : '';
      const slippedNote = showSlipped && it.slipped > 0
        ? ` · 其中 <b style="color:var(--danger)">${it.slipped}</b> 次失败`
        : '';
      return `<div class="hbar">
        <div class="hbar-top">
          <span class="k">${esc(it.label)}</span>
          <span class="v"><b>${it.value}</b> ${esc(unit)}${it.extra || ''}${slippedNote}</span>
        </div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${width.toFixed(1)}%"></div></div>
      </div>`;
    })
    .join('');
}

/* --------------------------------------------------------------------------
   Sparkline (tiny inline trend for tiles)
   -------------------------------------------------------------------------- */

export function sparkline(values, opts = {}) {
  const { width = 90, height = 26, color = PALETTE.accent } = opts;
  if (!values.length) return '';
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${((width * i) / n).toFixed(1)},${(height - (height * v) / max).toFixed(1)}`);
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8"
      stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

export { PALETTE };
