# Cocos 微信小游戏迁移：PoC 状态跟踪

> 分支 `feature/cocos-wechat-migration-poc`；**主线封板，迁移优先**。仅本分支承载新 Cocos 功能。
> 基线：创建分支时 `main` 的现有 Phaser M5.2/M5.3 版本；PR #7 产品规划与 PR #10 M6 Core 仍按真实合并状态接入，不把未合并代码视为已发布。
> 本记录不等同于微信构建/真机验收。

| 工作项 | 当前状态 | 证据 / 下一步 |
| --- | --- | --- |
| MIG-00 迁移分支与基线隔离 | 已建立 | `feature/cocos-wechat-migration-poc`，不修改 `main` |
| MIG-01 Cocos 2D 工程骨架 | **已构建验证** | Creator 3.8.8 真实场景、`.meta`、Web Mobile 构建和公开部署已通过 |
| MIG-01 一枪一虫战斗演示 | **网页运行已验证** | 官方 Cocos 构建+Playwright 运行，敌人击杀与触摸位移成功；Graphics 仍为临时美术 |
| MIG-02 Core 可移植验证 | **Web 双端验证通过** | 一份 PocWorld 支持 Vite Canvas 与 Cocos Web Mobile；微信端构建仍待验证 |
| MIG-03 移动、单指和中断适配 | **浏览器模拟触摸已验证** | Playwright 使用 Chrome 真实触屏事件并验证位移与松手；微信真机前后台仍待验 |
| Web Mobile 发布 | **已构建/部署/浏览器运行验证** | 见 GitHub Actions Run #43166896140，独立 `/swarm/cocos-preview/creator/` 路由 |
| 微信小游戏发布 | 未验证 | 需 Cocos 3.8 编辑器、微信开发者工具、真机 |
| 2.5D 正式美术 | 未开始 | 当前仅用 Cocos Graphics 绘制占位图形 |
| 旧 Phaser 五波功能 parity | 未开始 | G2/G3 待拆分真实 GameCore |
| 线上 H5 切换 | **禁止** | `https://kk518.top/swarm/` 保持原样 |

## 第一阶段验收

- [x] 迁移分支隔离与回归测试代码
- [x] Cocos 组件中的触摸、角色、工虫、射击、HUD 原型逻辑
- [x] Cocos Creator 3.8.8 实际编辑器编译
- [x] 保存 `Battle.scene` 和所需 `.meta`，经真实 Creator 构建验证
- [x] Web Mobile 在 Playwright 手机模拟浏览器成功运行，单指拖动产生位移
- [ ] 微信开发者工具导入、体验版和 Android/iOS 真机
- [ ] 记录实际包体、帧耗时、内存、音频及后台恢复

**声明**：源码没有实现音效、完整 M5/M6、正式微信账号/登录、2.5D 模型、资源分包/正式审核；不存在这些功能的成功验收证据。

参考：[迁移 RFC / PR #12](https://github.com/kk518/endless-swarm/pull/12)。

## 2026-11-12：独立网页预览已上线（经过公网 SHA 校验）

- **试玩地址：** https://kk518.top/swarm/cocos-preview/
- **源码：** `clients/cocos-preview/`，从 `clients/cocos/assets/scripts/PocWorld.ts` 导入**同一份核心逻辑**，没有复制一套战斗规则。
- **构建：** `.github/workflows/cocos-preview.yml`，由迁移分支 Draft PR 同步触发，依次运行旧 H5/PoC Node 测试、预览 TypeScript 检查、Vite 子目录构建、独立 SSH rsync 和公网精确 SHA 校验。
- **实测结果：** GitHub Actions Run [43147795222](https://github.com/kk518/endless-swarm/actions/runs/43147795222) 全绿，包含公网版本校验成功。
- **性质：** Canvas 2D 临时表现层 + Cocos PoC 共享规则，**不是 Cocos Creator 的 Web Mobile 引擎产物**；微信小游戏/真机仍未验证。后续需要在远程构建环境中配置受支持的 Cocos Creator 3.8 版本，不能把 Vite 构建冒充 Cocos 构建。
- **主线隔离：** 只发布到 `/var/www/endless-swarm/cocos-preview/`，原 `/swarm/` 的资源与线上逻辑未被本次迁移部署覆盖。
- **保留风险：** 当前 `main` 的旧部署工作流会对父级 `/var/www/endless-swarm/` 执行 `rsync --delete`。主线已封板所以没有改动它；未来若恢复 main 发版，必须先为 `/cocos-preview/` 增加 rsync 排除项，或迁移到独立 Nginx alias，否则子目录可能被删除。

**接下来的工作**：优先搭建 GitHub 执行的真正 Creator 3.8 构建环境并生成引擎工程所需场景、`.meta` 等资源元数据，验证 Web Mobile 后保持子页面预览方式，再扩展武器与虫群。

## 2026-11-12：G1/G2 增量实施记录（本轮）

- **共享战斗逻辑**：`PocWorld.ts` 增加五波阶段推进、三类常规虫、第五波 Boss、自动 XP 等级提升、Lv.3 解锁电弧线圈、连锁伤害与胜利结算；既有单指移动、自动射击和停步火力展开继续保留。
- **两端表现**：`PocBattle.ts` 和 `clients/cocos-preview/src/main.ts` 读取同一个 PoC 规则状态，显示波次、等级、虫种、连锁攻击和 Boss 血条。
- **回归测试**：添加敌种数值差异、自动 XP、第五波/Boss、重开清理的单元测试，原 H5 和新预览的 GitHub CI 已通过。这里的“五波”是迁移阶段的简化样板，**不是完整 Phaser M6 功能对等**。
- **远程 Creator 工程**：已提交 `Battle.scene`、`.meta`、`clients/cocos/package.json` 的 3.8.8 项目声明、独立 macOS 编辑器构建工作流 `.github/workflows/cocos-creator-web.yml`。
- **构建阻塞与修复**：Creator 工程的 `tsconfig.json` 原引用未提交的 `temp/tsconfig.cocos.json`，导致 Vite 无法构建共享规则；已改为独立、可解析的 tsconfig 并通过 Web CI。
- **正式 Cocos 状态**：macOS GitHub Actions [实验运行](https://github.com/kk518/endless-swarm/actions/runs/43150575213) 已启动官方 3.8.8 安装包下载；截至本记录，**未确认真正的 Creator Web Mobile 构建成功**。只有该工作流的编辑器编译、引擎产物及 `/swarm/cocos-preview/creator/` 公网 SHA 校验全部通过，才更新为“真 Cocos 构建已上线”。
- **路线隔离**：稳定预览继续使用 `/swarm/cocos-preview/`（Canvas 2D 调用同一份纯 TS Core），真 Cocos 产物使用独立子路径 `/swarm/cocos-preview/creator/`，不覆盖旧 Phaser 生产入口。

## 2026-11-12：英雄/专武扩展 + Cocos 浏览器触摸实证

- **真实 Cocos Web Mobile**：GitHub Actions [Run #43166896140](https://github.com/kk518/endless-swarm/actions/runs/43166896140) 所有工作成功：官方 Creator 3.8.8 编译 → Web Mobile 产物 → SSH 部署 → 公网 SHA 验证 → Playwright 手机模拟浏览器运行。
- **触摸验收**：对 Canvas 发送 Chromium 原生 touchStart/touchMove/touchEnd；读取只读调试接口确认世界坐标 X 增加、触摸释放。旧测试在手机模拟器使用键盘方向键导致误报，已经替换为目标操作方式；并保存浏览器截图/诊断工件。
- **M6 规则同步**：以 `src/game` 为唯一权威来源，将 `contentCatalog.ts`、`heroRuntime.ts`、`weaponRuntime.ts` 镜像到 Cocos assets，并由 `scripts/check-m6-copy.mjs` 防止规则分叉。原有 `runRandom`、`battlefields`、`metaProgression` 继续共用。
- **真正可玩的两英雄**：星际战士（常规电磁步枪 + 后续电弧线圈）与凯恩（强化火力展开被动 + 独立攻城轨道炮）；通过 M6 的英雄注册和武器驱动注册来校验可用性。凯恩轨道炮可在移动时发射，最多穿透三个虫族，浏览器/Cocos 表现分别显示金色轨道光束。
- **双端状态**：H5 Canvas 试玩在 `/swarm/cocos-preview/`，真正的 Cocos Web Mobile 在 `/swarm/cocos-preview/creator/`。两者使用相同的 PoC 战斗核心；目前用户可在 Canvas 选择凯恩，Creator 版使用 H 键或顶部右侧区域切换临时英雄。
- **已测试**：武器驱动完整性、普通/专武槽分离、移动状态轨道炮实际伤害、独立被动、重开复位、固定 Seed 战斗可复现；原 H5 CI 和 Canvas 预览部署均通过。
- **仍未完成**：真正 2.5D 原创角色/武器贴图、完整 M6 三幕九遭遇与局内卡牌、微信小游戏构建及 Android/iOS 微信真机、云存档与发布资质。这些不可由浏览器成功推断。
- **版本状态**：迁移工作仍在 Draft PR #15；未合并 `main`，也未覆盖原版 `/swarm/`。
