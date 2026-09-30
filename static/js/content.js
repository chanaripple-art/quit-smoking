/* ==========================================================================
   content.js — static content: health milestones, achievements, taxonomies
   ========================================================================== */

import { MS } from './util.js';

/* --------------------------------------------------------------------------
   Health recovery milestones.
   Durations follow the widely cited CDC / NHS / WHO recovery timeline.
   -------------------------------------------------------------------------- */

export const HEALTH_MILESTONES = [
  { id: 'm20min',  ms: 20 * MS.m,        emoji: '💓', title: '20 分钟',   desc: '心率与血压开始回落到正常水平。' },
  { id: 'm8h',     ms: 8 * MS.h,         emoji: '🫁', title: '8 小时',    desc: '血液中的一氧化碳降到一半，血氧回升。' },
  { id: 'm12h',    ms: 12 * MS.h,        emoji: '🩸', title: '12 小时',   desc: '血液一氧化碳降至正常，心脏负担减轻。' },
  { id: 'm24h',    ms: 24 * MS.h,        emoji: '❤️', title: '24 小时',   desc: '心脏病发作风险开始下降。' },
  { id: 'm48h',    ms: 48 * MS.h,        emoji: '👅', title: '48 小时',   desc: '嗅觉与味觉开始恢复，食物变香了。' },
  { id: 'm72h',    ms: 72 * MS.h,        emoji: '✨', title: '72 小时',   desc: '尼古丁基本排出体外，支气管放松，呼吸更顺畅。这是戒断反应最强的关口。' },
  { id: 'm1w',     ms: 7 * MS.d,         emoji: '🌱', title: '1 周',      desc: '体内尼古丁代谢物清零，渴求感开始明显减弱。' },
  { id: 'm2w',     ms: 14 * MS.d,        emoji: '🏃', title: '2 周',      desc: '血液循环改善，走路和运动不再那么喘。' },
  { id: 'm1mo',    ms: 30 * MS.d,        emoji: '🌿', title: '1 个月',    desc: '咳嗽与气短明显减少，肺功能可提升约 30%。' },
  { id: 'm3mo',    ms: 90 * MS.d,        emoji: '🌳', title: '3 个月',    desc: '肺功能持续改善，气道纤毛开始修复，排痰能力增强。' },
  { id: 'm9mo',    ms: 270 * MS.d,       emoji: '🍃', title: '9 个月',    desc: '咳嗽、鼻塞、疲劳显著减轻，纤毛基本恢复，肺部感染减少。' },
  { id: 'm1y',     ms: 365 * MS.d,       emoji: '🏆', title: '1 年',      desc: '冠心病风险降到吸烟者的一半。' },
  { id: 'm5y',     ms: 5 * 365 * MS.d,   emoji: '🛡️', title: '5 年',      desc: '中风风险接近从不吸烟的人。' },
  { id: 'm10y',    ms: 10 * 365 * MS.d,  emoji: '🎖️', title: '10 年',     desc: '肺癌死亡率约为继续吸烟者的一半。' },
  { id: 'm15y',    ms: 15 * 365 * MS.d,  emoji: '💎', title: '15 年',     desc: '冠心病风险与从不吸烟者相当。' },
];

/** How far along the user is toward the next milestone. */
export function milestoneProgress(elapsedMs) {
  const done = HEALTH_MILESTONES.filter((m) => elapsedMs >= m.ms);
  const next = HEALTH_MILESTONES.find((m) => elapsedMs < m.ms) || null;
  let progress = 1;
  if (next) {
    const prevMs = done.length ? done[done.length - 1].ms : 0;
    const span = next.ms - prevMs;
    progress = span > 0 ? (elapsedMs - prevMs) / span : 0;
  }
  return { done, next, progress: Math.max(0, Math.min(1, progress)), index: done.length, total: HEALTH_MILESTONES.length };
}

/* --------------------------------------------------------------------------
   Achievement definitions.
   `check(stats)` returns true when unlocked. `progress(stats)` -> 0..1
   -------------------------------------------------------------------------- */

export const ACHIEVEMENTS = [
  /* --- time based --- */
  { id: 'a_1d',   emoji: '🌅', name: '第一天',   desc: '坚持 24 小时',      check: (s) => s.elapsedMs >= MS.d,            progress: (s) => s.elapsedMs / MS.d },
  { id: 'a_3d',   emoji: '⚡', name: '尼古丁清零', desc: '坚持 72 小时',     check: (s) => s.elapsedMs >= 3 * MS.d,        progress: (s) => s.elapsedMs / (3 * MS.d) },
  { id: 'a_1w',   emoji: '🌱', name: '熬过一周',   desc: '连续 7 天',        check: (s) => s.elapsedMs >= 7 * MS.d,        progress: (s) => s.elapsedMs / (7 * MS.d) },
  { id: 'a_2w',   emoji: '🌿', name: '两周',      desc: '连续 14 天',        check: (s) => s.elapsedMs >= 14 * MS.d,       progress: (s) => s.elapsedMs / (14 * MS.d) },
  { id: 'a_1mo',  emoji: '🌳', name: '满月',      desc: '连续 30 天',        check: (s) => s.elapsedMs >= 30 * MS.d,       progress: (s) => s.elapsedMs / (30 * MS.d) },
  { id: 'a_3mo',  emoji: '🏅', name: '一个季度',   desc: '连续 90 天',        check: (s) => s.elapsedMs >= 90 * MS.d,       progress: (s) => s.elapsedMs / (90 * MS.d) },
  { id: 'a_6mo',  emoji: '👑', name: '半年',      desc: '连续 180 天',       check: (s) => s.elapsedMs >= 180 * MS.d,      progress: (s) => s.elapsedMs / (180 * MS.d) },
  { id: 'a_1y',   emoji: '🏆', name: '一整年',     desc: '连续 365 天',       check: (s) => s.elapsedMs >= 365 * MS.d,      progress: (s) => s.elapsedMs / (365 * MS.d) },

  /* --- craving resistance --- */
  { id: 'a_c1',   emoji: '💪', name: '第一次胜利', desc: '扛过 1 次烟瘾',     check: (s) => s.cravingsResisted >= 1,        progress: (s) => s.cravingsResisted / 1 },
  { id: 'a_c10',  emoji: '🛡️', name: '十战十胜',   desc: '扛过 10 次烟瘾',    check: (s) => s.cravingsResisted >= 10,       progress: (s) => s.cravingsResisted / 10 },
  { id: 'a_c50',  emoji: '🗿', name: '铁壁',      desc: '扛过 50 次烟瘾',     check: (s) => s.cravingsResisted >= 50,       progress: (s) => s.cravingsResisted / 50 },
  { id: 'a_c100', emoji: '🐉', name: '百战',      desc: '扛过 100 次烟瘾',    check: (s) => s.cravingsResisted >= 100,      progress: (s) => s.cravingsResisted / 100 },

  /* --- money --- */
  { id: 'a_m100',  emoji: '🪙', name: '第一桶金',  desc: '省下 100 元',       check: (s) => s.savedMoney >= 100,            progress: (s) => s.savedMoney / 100 },
  { id: 'a_m500',  emoji: '💰', name: '五百',     desc: '省下 500 元',        check: (s) => s.savedMoney >= 500,            progress: (s) => s.savedMoney / 500 },
  { id: 'a_m1000', emoji: '💵', name: '一千',     desc: '省下 1000 元',       check: (s) => s.savedMoney >= 1000,           progress: (s) => s.savedMoney / 1000 },
  { id: 'a_m5000', emoji: '💎', name: '五千',     desc: '省下 5000 元',       check: (s) => s.savedMoney >= 5000,           progress: (s) => s.savedMoney / 5000 },

  /* --- logging habit --- */
  { id: 'a_l7',   emoji: '📝', name: '记录一周',   desc: '连续记录 7 天',      check: (s) => s.logStreak >= 7,               progress: (s) => s.logStreak / 7 },
  { id: 'a_l30',  emoji: '📔', name: '记录一月',   desc: '连续记录 30 天',     check: (s) => s.logStreak >= 30,              progress: (s) => s.logStreak / 30 },
  { id: 'a_d10',  emoji: '🖋️', name: '日记十篇',   desc: '写满 10 篇日记',    check: (s) => s.diaryCount >= 10,             progress: (s) => s.diaryCount / 10 },

  /* --- clean streaks --- */
  { id: 'a_s7',   emoji: '🧊', name: '干净七天',   desc: '7 天未复吸',        check: (s) => s.cleanStreak >= 7,             progress: (s) => s.cleanStreak / 7 },
  { id: 'a_s30',  emoji: '🌟', name: '干净一月',   desc: '30 天未复吸',       check: (s) => s.cleanStreak >= 30,            progress: (s) => s.cleanStreak / 30 },
];

/* --------------------------------------------------------------------------
   Taxonomies used by the record forms
   -------------------------------------------------------------------------- */

export const TRIGGERS = [
  { id: 'after_meal', label: '饭后',     emoji: '🍚' },
  { id: 'coffee',     label: '咖啡/茶',  emoji: '☕️' },
  { id: 'alcohol',    label: '喝酒',     emoji: '🍺' },
  { id: 'stress',     label: '压力大',   emoji: '😖' },
  { id: 'social',     label: '社交场合', emoji: '👥' },
  { id: 'boredom',    label: '无聊',     emoji: '😐' },
  { id: 'driving',    label: '开车',     emoji: '🚗' },
  { id: 'late_night', label: '熬夜',     emoji: '🌙' },
  { id: 'work_break', label: '工作间隙', emoji: '💼' },
  { id: 'phone',      label: '刷手机',   emoji: '📱' },
  { id: 'toilet',     label: '上厕所',   emoji: '🚽' },
  { id: 'habit',      label: '习惯性',   emoji: '🔁' },
];

export const MOODS = [
  { id: 'calm',     label: '平静', emoji: '😌', score: 4 },
  { id: 'anxious',  label: '焦虑', emoji: '😰', score: 1 },
  { id: 'irritable',label: '烦躁', emoji: '😤', score: 1 },
  { id: 'down',     label: '低落', emoji: '😔', score: 2 },
  { id: 'tired',    label: '疲惫', emoji: '😮‍💨', score: 2 },
  { id: 'happy',    label: '开心', emoji: '😄', score: 5 },
  { id: 'relaxed',  label: '放松', emoji: '🧘', score: 4 },
];

export const METHODS = [
  { id: 'breathe',  label: '深呼吸', emoji: '🌬️' },
  { id: 'water',    label: '喝水',   emoji: '💧' },
  { id: 'walk',     label: '走动',   emoji: '🚶' },
  { id: 'gum',      label: '嚼口香糖', emoji: '🍬' },
  { id: 'talk',     label: '找人聊天', emoji: '💬' },
  { id: 'distract', label: '转移注意', emoji: '🎮' },
  { id: 'brush',    label: '刷牙',   emoji: '🪥' },
  { id: 'snack',    label: '吃点东西', emoji: '🍎' },
  { id: 'nothing',  label: '没做什么', emoji: '😶' },
];

export const SYMPTOMS = [
  { id: 'cough',   label: '咳嗽',   emoji: '😷' },
  { id: 'sleep',   label: '睡眠差', emoji: '😴' },
  { id: 'appetite',label: '食欲旺', emoji: '🍽️' },
  { id: 'focus',   label: '难集中', emoji: '🌀' },
  { id: 'mouth',   label: '口腔不适', emoji: '👄' },
  { id: 'weight',  label: '体重上升', emoji: '⚖️' },
];

export const labelOf = (list, id) => list.find((x) => x.id === id) || null;
export const emojiOf = (list, id) => (labelOf(list, id) || {}).emoji || '•';
export const nameOf = (list, id) => (labelOf(list, id) || {}).label || id || '未记录';

/* --------------------------------------------------------------------------
   The 4 D's — standard behavioural technique for riding out a craving
   -------------------------------------------------------------------------- */

export const FOUR_D = [
  { k: 'D', t: 'Delay 拖延',      d: '烟瘾的峰值通常只持续 3–5 分钟。先告诉自己"再等 5 分钟"，等计时结束，冲动多半已经退潮。' },
  { k: 'D', t: 'Deep breathe 深呼吸', d: '跟着中间的圆圈呼吸：吸气 4 秒、屏息 2 秒、呼气 6 秒。慢呼气能直接降低交感神经兴奋。' },
  { k: 'D', t: 'Drink water 喝水',  d: '慢慢喝一杯温水，小口咽下。口腔与喉咙的动作会替代掉部分吸烟的仪式感。' },
  { k: 'D', t: 'Do something 转移', d: '立刻起身做一件要用手的事：刷牙、洗碗、走两层楼梯、给朋友发条消息。换个场景就换掉了触发点。' },
];

/** Rotating coaching lines shown during the SOS countdown. */
export const SOS_TIPS = [
  '这只是戒断反应，不是你的意志力问题。它一定会过去。',
  '现在这个感觉，说明你的大脑正在修复。',
  '你已经走到这里了，这一支不值得。',
  '把注意力放到呼吸上，数到 10。',
  '你能感觉到心跳变慢吗？那是身体在感谢你。',
  '抽这一支不会让你更轻松，只会让刚才的努力归零。',
  '烟瘾就像波浪——它涨起来，然后一定会退下去。',
  '想想你已经省下的钱，和那些为你高兴的人。',
  '去喝口水，或者站起来走走。5 分钟就好。',
];

export const CHEERS = [
  '又赢了一次。',
  '这就是在变强。',
  '身体正在记住这个选择。',
  '干得漂亮。',
  '你在重写这个习惯。',
];

/** Random encouragement for the home screen. */
export const HOME_QUOTES = [
  '戒烟不是"少抽一点"，而是不再需要它。',
  '每一次扛过烟瘾，都是在削弱它的力量。',
  '复吸不是失败，是数据。它告诉你要躲开什么。',
  '你不是在放弃什么，你是在拿回什么。',
  '今天不抽，本身就是全部的胜利。',
  '身体的修复从你放下烟的那一刻就开始了。',
  '最难的不是永远不抽，是现在这一支不抽。',
];
