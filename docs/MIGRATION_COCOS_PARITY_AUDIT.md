# M0–M6.1a 历史功能迁移审计与 Cocos 对齐计划

> 审计日期：2026-11-12  
> 唯一规则基线：main / ae04c0b9af63e14c4c03799d8f7f5d24820c4534（M6.0a–M6.1a 集成提交）  
> 迁移工作区：PR #15 / feature/cocos-wechat-migration-poc  
> 原则：保留历史行为与修复；不按旧提交逐版重写；以最新 main 的集成实现为准。

## 1. 审计结论

Cocos 迁移已经完成真实 Creator 3.8.8 Web Mobile 构建和浏览器触控验证，也接入了一部分 M6 规则模块；但当前可运行战斗仍是简化纵向切片，不能称为 M0–M6.1a 完整迁移。

当前代码分成三个层次，必须明确区分：

1. **已复用的规则模块**：combat、progression、arsenal、autoGrowth、streak、supplies、pressure、visibility、campaignDirector、routeDecisions、runRandom、runSafeSave、platformStorage、battlefields、metaProgression、contentCatalog、heroRuntime、weaponRuntime 共 18 个模块在 Cocos assets/scripts/m6 中与 main 的 src/game 对应文件逐字节一致，CI 有 check-m6-copy.mjs 防漂移。
2. **Cocos 运行时实际接线**：PocWorld 现已接入 main 的五波/三幕状态机、波末合法卡牌与路线决策、四武器独立攻击驱动、M5 自动升级/进化调谐，以及 M2 自爆虫与连杀、M3 精英和战场补给。这仍是迁移纵向切片，未完成主线所有虫族行为、存档及视听表现。
3. **浏览器 Canvas 预览专属功能**：clients/cocos-preview 的 m6Ui.ts 已接入战区选择、预览独立存档、资源结算和工坊购买；这些 DOM/localStorage 页面并不是 Cocos Creator 场景，不能作为 Cocos 或微信端已完成的证据。

因此，本次迁移的工作目标从“继续扩充 PoC”调整为“以 main 的 M6.1a 为基准，完成玩法行为对齐”。新增英雄和新武器暂缓扩充；已完成的凯恩与专属轨道炮保留为迁移分支的扩展验证样例。

## 2. M0–M6.1a 功能对照

状态定义：
- **部分完成**：有可运行实现或共享规则，但与主线完整行为不一致，或只在 Canvas 预览生效。
- **未迁移**：Cocos Creator 运行时没有对应功能，或缺少主线要求的行为/验收。
- **已验证**：仅表示表中注明的自动化或浏览器构建证据，不代表微信真机验收。

| 里程碑 | 主线已沉淀的功能与不可丢失规则 | 当前 Cocos 证据 | 结论 |
|---|---|---|---|
| M0 | 单指浮动摇杆；自动索敌/自动射击；移动中持续开火；停步 0.8 秒进入火力展开；移动立即取消；固定步长；暂停/后台恢复与重开隔离 | PocBattle 有触摸输入、生命周期处理；PocWorld 有固定步长、自动步枪、0.8 秒展开和移动取消；Creator Web Mobile 触控自动化通过 | 部分完成：核心手感切片存在，需与主线输入阈值、目标选择、恢复语义做数值对齐 |
| M1 | 五波闭环；四把普通武器；四种普通虫与虫巢 Boss；第 1–4 波后三选一；四普通武器槽；合法卡池和结算 | 已按 main 战役时长接入五波流程、波末可操作卡牌及四普通武器驱动；仍缺完整喷酸虫行为及历史效果/音效 | 部分完成：流程与主要战斗系统已恢复，完整虫族行为待验 |
| M2 | 自爆虫及预警；连杀计时/伤害档位；连杀奖励卡；相关战斗反馈 | bomber 进入 110 距离触发 850ms 红圈预警，105 范围爆炸、2点伤害；移动或击杀可避免；连杀4.5秒窗口/阶梯伤害来自主线 streak 与 combat，Frenzy 卡池保留；浏览器/Creator 均绘制预警 | 已接线、需最新 CI/体验验收；细节表现仍有差距 |
| M3 / M3.1 | 精英虫、战场补给拾取、战术强化；卡牌效果可见化和虫潮节奏修正 | canSpawnElite 按阶段限制精英上限，精英 HP×2.3 并掉落补给；定时补给和 repair/overclock/EMP 已接入，渲染可见；未对齐全部精英攻击与 M3.1 虫潮节奏 | 部分完成，需场景/真机验收 |
| M4 | Iron Veil 军事与虫巢原创美术方向、机甲/虫族视觉识别 | PocBattle 仍使用 Graphics 几何占位绘制 | 未迁移：正式美术尚未开始 |
| M4.1 | 四武器挂载点；武器等级光效；步枪/散射/电弧/喷火独立弹道、特效和音效 | PoC 只有少量几何表现、步枪/电弧/轨道炮效果；没有四挂载和完整 M4.1 视听反馈 | 未迁移 |
| M5.0 | 击杀经验；局内等级；四武器 Lv.1–5；经验升级三选一；两条初始进化；选择期间世界暂停 | 使用主线经验与 weaponTuning，四武器按等级自动分配，升级不弹窗；采用 M5.2 后的无中断行为而非恢复过时的强制 XP 弹窗 | 部分完成，符合当前设计方向 |
| M5.1 | 四把武器各自完整进化；雷暴矩阵与炼狱焚化器真实战斗行为；配方引导与合法奖励池 | 四武器读取主线进化参数（穿透/霰弹/电链/灼烧），部分伤害和控制已生效；配方 UI 引导、所有进化效果及视觉验收仍不足 | 部分完成 |
| M5.2 | XP 不弹窗、不暂停；火力/速攻/机动训练倾向；专精武器优先升级；满级后自动分配；满足条件即时进化；波末面板设置下一波专精 | CocosRunController 已调用主线 autoGrowth 并驱动武器等级、伤害/射速及进化；训练计划 UI 尚未完成 | 部分完成 |
| M5.3 | 手机世界宽度扩至 600；HUD 独立缩放；普通武器优先索敌可见虫；边缘入场预警与安全距离 | PocWorld 使用固定场地边界和简单出生点，没有主线 visibility 规则、屏内索敌和入场预警 | 未迁移 |
| M6.0a | 内容目录；普通/专武攻击驱动注册；英雄生命周期；Campaign Director；四路确定性随机流 | 目录、英雄/武器 Runtime、随机模块已复制；PocRoster 增加 Marine/Kane 与轨道炮。PocWorld 只消费 combat 随机流，未接入 campaignDirector 和阶段快照 | 部分完成 |
| M6.0b | 可选五波/三幕；三幕九遭遇、约 16 分 20 秒战斗时长；六次卡牌决策、两次安全/高危路线；Boss 终局 | PocWorld 已接入主线 CampaignDirector，Creator/Canvas 提供五波与三幕模式切换，波末卡牌和路线可选；战斗/敌种表现仍缺 parity | 部分完成 |
| M6.0c | 安全节点存档/恢复；保存构筑、HP、训练、随机流与已抽卡；失败也有战备；runId 幂等结算；基础装甲工坊 | 纯 metaProgression 规则已复用；Canvas 预览使用独立 localStorage namespace 做结算/购买。Cocos PocBattle 未接入 GameStoragePort、runSafeSave、恢复 UI 或结算工坊 | 部分完成：仅共享规则与 Canvas 预览接线，Creator 运行时未迁移 |
| M6.1a | 钢铁遗迹/感染巢穴双战区；敌群权重差异；战备 + 地区材料原子结算；武器框架/修复模块工坊；出击装备快照 | battlefields/metaProgression 规则已复用；Canvas 预览可选战区、结算材料和购买。Cocos PocBattle 以默认战区和空升级参数创建世界，没有战区/工坊 UI，也没有装备快照 | 部分完成：Creator 运行时未完成 M6.1a 闭环 |

### 2.1 已完成但不应误判为主线 parity 的扩展

- PoC 注册了两名可玩英雄：星际战士和凯恩。
- 凯恩有部署强化被动和独立专武槽的穿透轨道炮；测试覆盖移动中开火、伤害、重开复位和 Seed 可复现。
- 这属于迁移 PoC 的新增验证内容，不替代 M0–M6.1a 的历史功能迁移。暂时保留，不继续增加第三名英雄或新枪。

## 3. 必须纳入迁移的主线模块

以下文件是主线现有规则/状态资产，不应重新发明一套近似实现：

- 战斗与可见性：combat、pressure、visibility、streak、supplies。
- 武器与成长：progression、arsenal、autoGrowth、contentCatalog、weaponRuntime、heroRuntime、weaponVisual。
- 关卡与随机：campaignDirector、routeDecisions、runRandom。
- 局外与恢复：battlefields、metaProgression、runSafeSave、platformStorage。
- 表现边界：Art、Sound、GameScene 中的 Phaser 对象和 DOM UI 不直接复制；应通过 Cocos Presenter、Input、Audio、Storage、UI Adapter 重建。

现有十八个镜像模块保持 main 为唯一权威来源。11 个此前缺失的纯 TypeScript 模块已在本轮补入 Cocos assets/scripts/m6，并扩展字节级同步脚本与回归测试；这完成的是源码镜像，不代表 PocWorld 已调用全部规则。若 Cocos Creator 要求 assets/scripts 内存在源码副本，则必须通过同步脚本和字节级校验生成，不允许人工维护两套规则。

## 4. 迁移执行顺序

### P0：基线与历史保护（本轮）

- 将 PR #15 从旧 M5.3 基线同步到当前 main / M6.1a。
- 保留 PR #15 原有提交历史，不覆盖 main，不合并 PR，不改动现有 /swarm/ 生产部署。
- 更新迁移状态文档和本审计表，后续每完成一个系统都更新证据。

### P1：完整 Core 规则进入 Cocos 工程（源码镜像已补齐，运行时接线未完成）

已将主线 18 个引擎无关模块镜像到 Cocos assets/scripts/m6，并把 scripts/check-m6-copy.mjs 与 cocosM6Bridge.test.ts 扩展到全部 18 个模块。下一步要建立稳定的 Core API 和可序列化状态，再逐项接入：combat、progression、arsenal、autoGrowth、streak、supplies、pressure、visibility、campaignDirector、routeDecisions、runRandom、runSafeSave、metaProgression、battlefields、platformStorage、contentCatalog、heroRuntime、weaponRuntime。

先建立稳定的 Core API 和可序列化状态；不把 Phaser GameScene 搬进 Cocos，也不允许 Cocos UI 自己计算奖励、阶段或经济。

### P2：恢复历史战斗行为

按 M0→M5.3 的行为契约逐项对齐：完整四武器驱动和四种敌种、Boss 行为、自爆预警、连杀、精英/补给、四武器等级与进化、自动 XP 训练、手机可见虫潮规则。每项都要有规则测试和 Cocos 场景接线测试。

### P3：恢复 M6 长局与局外闭环

- 五波原型与三幕远征作为独立模式保留。
- 三幕九遭遇、六次卡牌、两次路线选择和最终 Boss。
- 仅在安全节点保存/恢复；已抽卡候选不可刷新重掷。
- 失败/胜利按有效进度一次性结算战备和地区材料。
- 双战区选择与两种工坊装备；装备快照不受进行中购买影响。

### P4：Cocos 表现与平台适配

- 以 Cocos UI/Prefab/Presenter 重建 HUD、奖励、路线、基地、工坊和结算。
- 重建 M4/M4.1 的四武器挂载、等级反馈、攻击特效、音效。
- 2.5D 正式美术按原 Art Direction 逐步替换占位 Graphics。
- 实现并测试 Web/微信 Storage、Lifecycle、Audio 和 Asset Adapter。

### P5：行为一致性与发布验收

- 使用固定 Seed 和相同输入序列，对比 Phaser 主线与 Cocos Core 的阶段、敌种、目标、武器攻击、XP、卡牌、构筑、HP、奖励和存档快照。
- Node 规则测试、Cocos Creator 3.8.8 Web Mobile 构建、Playwright 原生触摸回归全部通过。
- 微信小游戏构建与微信开发者工具导入成功后，分别在 Android/iOS 微信真机验收；记录包体、帧耗时、内存、音频和前后台恢复。
- 浏览器模拟成功不能代替微信构建或真机验收。

## 5. 不可回归的产品约束

1. 单指移动；自动瞄准与射击；移动中不停火；停步 0.8 秒展开，移动立即退出。
2. 波内 XP 成长不出现频繁强制弹窗；重要选择集中在遭遇结束的卡牌/路线节点。
3. 四个普通武器槽与独立英雄专武槽分开计算。
4. 所有卡牌/路线必须合法、可解释、可重复测试；不能刷屏外虫或不可见虫。
5. 长局失败也有合理收益；结算必须按 runId 幂等。
6. 安全节点恢复不得重抽已展示卡牌，也不得改变出击时装备快照。
7. 旧 H5 /swarm/ 与 main 在迁移验收前保持不变。

## 6. 验收定义

只有当 M0–M6.1a 对照表中的每个功能均达到以下要求，才可将“玩法 parity 完成”标记为通过：

- 主线规则在 Cocos Core 中被调用，而不是只复制文件或只在 Canvas 预览中生效；
- 有规则级测试与场景接线测试；
- 固定 Seed 下关键状态转换和奖励结果一致，所有有意差异均有记录；
- Creator Web Mobile 实际运行通过；
- 微信小游戏构建与 Android/iOS 微信真机验收另行通过。

本文件是迁移验收基线。任何新增英雄、武器或美术工作不得挤占 P1–P3 的历史功能对齐。
