# 戒烟 · 记录

> **线上地址：<https://chanaripple-art.github.io/quit-smoking/>**
>
> iPhone 用 Safari 打开 → 点底部「分享」→「添加到主屏幕」，就能全屏离线使用。

一个跑在 iPhone 上的戒烟记录与支持工具。**纯前端 PWA —— 没有后端、没有账号、没有第三方依赖**，所有数据只存在你自己的手机里。

---

## 功能

**首页** 实时跳动到秒的戒烟时长；少抽的烟 / 省下的钱 / 扛过的烟瘾三个指标；15 个健康恢复里程碑（20 分钟 → 15 年）进度条；存钱罐目标；常驻的烟瘾急救大红按钮。

**烟瘾急救（SOS）** 全屏 3 / 5 / 10 分钟倒计时，中间一个跟着节律呼吸缩放的光球（吸气 4 秒 → 屏住 2 秒 → 呼气 6 秒，长呼气能真正降低交感神经兴奋），配 4D 法则引导和每 20 秒轮换的激励语。结束后用一张简短复盘表把这次冲动变成数据。

**记录** 复吸打卡 / 烟瘾记录 / 日记三个标签页。每次记录都带触发场景、情绪、应对方法，可编辑可删除。

**分析** 日历热力图（点任意一天补日记）；30 天复吸趋势双线图；24 小时高危时段柱状图；触发场景 Top 6（含失败率）；情绪与烟瘾强度相关性；最有效的应对方法排行；本周 vs 上周小结。

**成就** 21 个徽章（时间 / 抵抗 / 省钱 / 记录习惯 / 连续无烟），解锁时全屏逐条庆祝，另有存钱罐进度。

**我的** 运行状态自检（HTTPS、Service Worker、运行模式、离线缓存）；戒烟时间、日均支数、烟价；通知开关 + 高危时段提醒（从历史数据自动识别，在高峰前提醒）；JSON 备份导入导出。

## 设计取向

不用红色告警，不做道德评判。复吸被当作**数据**而不是失败——记录页的原话是「复吸不是失败，是数据」。超标时的文案是「比今天的目标多 2 根，记下来就好」。

## 数据与隐私

全部记录存在浏览器的 `localStorage` 里（键名 `quit-smoking::state::v1`），不上传任何服务器，不需要注册。

代价是**清除浏览器数据、换设备、卸载 PWA 都会丢**。所以 App 里做了两件事：首页超过 7 天没备份会自动提醒；设置页有常驻的备份提示。请定期「导出备份」存到 iCloud Drive。

## 技术

零依赖、零构建：原生 HTML + CSS + ES 模块，手写 SVG 图表，程序化生成的图标。

```
index.html                 应用外壳
manifest.webmanifest       PWA 清单
sw.js                      Service Worker（离线缓存 + 通知点击）
static/css/styles.css      设计系统（深色优先 + 浅色覆盖）
static/js/app.js           路由、五个视图、表单、通知调度、运行自检
static/js/store.js         状态、持久化、派生统计、成就判定、演示数据
static/js/content.js       健康里程碑、成就定义、分类标签
static/js/charts.js        手写 SVG 图表
static/js/util.js          日期、格式化、Toast、底部弹层
static/js/sos.js           烟瘾急救浮层
static/icons/              应用图标
```

## 测试

端到端测试用 Node 内置的 `WebSocket` 直接驱动 Chrome DevTools Protocol，**不需要任何 npm 依赖**：

```bash
node tools/smoke.mjs https://chanaripple-art.github.io/quit-smoking/
```

覆盖 5 个路由、3 个记录标签页、SOS 完整流程、以及 11 项交互断言（路由、月份切换、表单保存、删除、导出、导入、垃圾数据拒绝、Service Worker 激活、**断网冷启动**）。有任何一个 console error 或未捕获异常就退出码非 0。

当前状态：**全部通过，零 console 错误。**

## 更新这个站点

```bash
node tools/build-dist.mjs                      # 打包到 dist/
GH_TOKEN=<你的token> node tools/deploy-pages.mjs --dir=dist --repo=quit-smoking
```

`deploy-pages.mjs` 通过 GitHub REST API 工作，不需要 git 或 SSH key。它会走 Git Data API 做**单次原子提交**（blob → tree → commit → ref），所以一次部署只触发一次 Pages 构建。

也可以不用命令行：仓库页面点 **Add file → Upload files**，把 `dist/` 的内容拖进去。

## 免责

健康恢复时间线参考 CDC / NHS 公开资料。本应用不能替代医生的诊断和药物治疗建议。如果你烟龄较长或每天超过 20 支，戒烟前建议咨询医生，必要时使用尼古丁替代疗法。
