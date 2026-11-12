# M6.0 主框架第一阶段：内容注册、关卡调度与可复现随机

> 实现状态：**已接入现有五波战斗的基础架构**；三幕长局、路线事件、局外资源与完整存档恢复仍为后续工作。  
> 对照需求：[Roguelite 三幕设计 PRD](https://github.com/kk518/endless-swarm/blob/docs/prd-v2-m6-m8-planning/docs/PRD_ROGUELITE_CORE_LOOP.md) / [英雄武器 PRD](https://github.com/kk518/endless-swarm/blob/docs/prd-v2-m6-m8-planning/docs/PRD_HERO_WEAPON_SYSTEM.md)

## 1. 本次目标与边界

- **目标**：把原本由 `GameScene` 写死的五波顺序、Boss 结束、随机源、英雄身份和普通武器分发，逐步迁移到数据驱动的框架。
- **保留行为**：当前仍是原有五波/四武器/四进化/波末三选一；自动 XP 不弹窗，手机可见虫潮规则不退化。
- **预留扩展**：未来三幕九遭遇、英雄选择与专武、按战区装载不同敌群、随机路线/事件、进度快照与局外结算。
- **此分支不做**：新英雄视觉、史诗融合、真正的十五分钟长局、永久资源经济、后台自动恢复、客户端升级存档。代码中有 schema/端口并不等于这些功能已完成。

## 2. 模块边界

```text
src/main.ts                     HTML 输入/奖励/结算外壳
       │
       ▼
src/game/GameScene.ts           Phaser 渲染、命中、敌人、摇杆、场景生命周期
       ├── contentCatalog.ts    静态英雄/普通武器/英雄专武元数据与槽位校验
       ├── heroRuntime.ts       英雄被动出击/战斗帧/击杀生命周期接口
       ├── weaponRuntime.ts     普通枪/专属枪共用攻击驱动注册与槽位校验
       ├── campaignDirector.ts  幕与遭遇数据、状态转换、终局/奖励、快照 schema
       ├── runRandom.ts         battle/reward/event/visual 四个独立可重放随机流
       ├── progression.ts       原 22 卡、五波数据（仍作为兼容素材）
       ├── arsenal.ts           现有四武器升级/进化数值
       ├── autoGrowth.ts        自动 XP 与训练偏好
       └── combat.ts/pressure.ts/visibility.ts 现有无渲染依赖的战斗规则
```

新的游戏核心模块**不依赖 Phaser/DOM**，可以直接使用 Node 单元测试验证；`GameScene` 暂保留实际射击、碰撞和视觉效果，**没有在本轮做破坏性大重写**。

## 3. 新武器扩展的实际步骤

**数据注册和真实战斗驱动是两件事**，不能只写一个名字就让未完成的枪进入掉落池。

1. 在 `contentCatalog.ts` 增加 `WeaponDefinition`：唯一 `id`、名称、`slot`（`standard` 或 `signature`）、标签和 `driverId`。
2. 为新枪添加真实射击逻辑、范围/冷却参数、命中形态；通过 `createWeaponRuntimeRegistry` 注册攻击驱动。注册器会拒绝缺少驱动、槽位不匹配、重复驱动或无效射程。
3. 在未来的武器成长数据表中补足本局 Lv.1–5、进化配方与完整数值；**目前原版 `progression.ts` 的 `WeaponId` 和 `arsenal.ts` 仍只有 4 个 ID**，不能假称仅注册 metadata 就能自动装备第五把普通枪。
4. 补充图形/物理挂架和 HUD 表示，并让奖励合法池只提供完整安装的武器。
5. 测试武器上限（4 普通槽 + 1 独立英雄级专武槽）、射击行为、XP、进化及中断重开。

**先完成第一把新枪重机炮或低温投射器后**，再将目前的硬编码 `WeaponId`、进化和四挂架映射迁往统一类型/驱动定义，避免为不存在的新武器大规模修改逻辑。

## 4. 新英雄扩展的实际步骤

1. 在目录中注册英雄 `id`、名称、`starterWeaponId`、`passiveId`、`signatureWeaponId`。
2. 配置一条 `HeroPassiveRuntime`，可以监听出击开始、战斗帧和敌人击杀；具体效果由战斗适配器实现，目录中不会直接执行伤害。
3. 对应英雄级武器使用 `slot: 'signature'` 独立驱动；不能挤占普通四槽，不能任意拿别人的专武。
4. 再添加英雄选择界面、真实机甲视觉/被动、英雄觉醒和战后展示。不能仅注册角色元数据就展示“凯恩已可用”。
5. 当前仅注册无专武被动的**基础星际战士 `marine`**，保持线上战斗数值完全一致。凯恩/灰烬/伊芙未来依次添加，未开发角色不在玩家列表中。

## 5. 关卡框架：一份活的旧五波、一份未启用的三幕蓝图

`campaignDirector.ts` 将可配置内容组织为：
- Campaign → Acts → Encounters；
- 每段具有唯一 ID、标题、敌群/持续时间、压力档位与 `card | route | none` 决策类型；
- `playing → reward → playing` 或 `boss → victory/timeout` 的受检状态转换；
- 明确的 `CampaignRunState` 和 `CampaignCheckpoint` v1 格式。

**PROTOTYPE_CAMPAIGN（当前使用）**
- 将现有五波划分为三段有标题的幕，计时/敌方阵容完全沿用旧 WAVES；
- 普通波结束仍暂停并从现有合法卡池三选一，Boss 击败判胜、超时判失败；
- HUD 展示当前幕与段落，波次从 Director 提取，不再由孤立变量+硬编码波数判断；
- 单局仍约 260 秒战斗时间，不是 15–20 分钟长局。

**THREE_ACT_BLUEPRINT（仅作为数据与测试蓝图）**
- 三幕各三段，共九个遭遇；计划战斗计时合计 **980 秒 ≈ 16 分 20 秒**；
- 六次 `card` 大选择 + 两次 `route` 路线分岔 + 最终 Boss；
- **没有接入实际播放**：现有游戏尚未支持路线选择 UI、区域事件、完整阶段奖池和中断恢复。因此不能直接把它赋给 GameScene 并声称 M6.0 已完成。

## 6. 随机流与未来存档

`runRandom.ts` 为每局 seed 生成：
- combat：敌人出生、暴击、精英和补给等影响战斗的随机；
- rewards：阶段战术卡，不再受开枪次数/敌人行为等战斗随机消费影响；
- events：预留战区事件、风险路线；
- visuals：粒子和纯视觉噪声，不影响卡池与敌人。

每个流有 `snapshot()` 和 `restore()`；`campaignDirector.ts` 可以验证并恢复**纯阶段状态**。

**实际恢复整局还未实现**。未来安全节点持久化必须同时保存：
- 关卡状态和当前随机流位置；
- `RunBuild`、GrowthState、训练倾向、英雄/专武/模组和阶段奖励；
- 生命、总计时、结算去重 ID；
- 安全节点的干净战场状态，不能把 Phaser 对象直接序列化。

保存到 localStorage、UI 继续游戏、资源事务、防跨标签重复领奖属于之后 M6.0/M6.1 的独立工作包。**仅有 checkpoint schema 不表示玩家现在刷新页面能恢复进度**。

## 7. 本次测试与验收

| 项目 | 自动化验证 |
|---|---|
| 旧五波数据兼容与 Boss 胜败 | `tests/campaignDirector.test.ts` |
| 三幕 9 节点 / 6+2 决策规划 | `tests/campaignDirector.test.ts` |
| 阶段状态不可重复领取奖励、错误快照拒绝 | `tests/campaignDirector.test.ts` |
| 新英雄/普通武器/独立专武声明的合法性 | `tests/contentCatalog.test.ts` |
| 普通/专属攻击驱动与槽位限制 | `tests/weaponRuntime.test.ts` |
| 英雄被动 hook 映射与缺失拒绝 | `tests/heroRuntime.test.ts` |
| 随机流可复现、互不干扰、能保存游标 | `tests/runRandom.test.ts` |
| 现有自动 XP、武器数值、卡牌、可见性等 | 原有 `tests/*.test.ts` 全量回归 |

发布当前分支之前必须满足 GitHub CI `npm test` + `npm run build`。CI 成功不等于已经进行了真机试玩或完整三幕游戏测试。

## 8. 下一阶段的合理交付顺序

- **M6.0a（本分支）**：目录/驱动/英雄 hook/关卡 director/随机分域，实际五波接线与测试。
- **M6.0b**：围绕 Director 实现真正的九段内容、阶段大决策与两次风险分岔。阶段开始/结束切换不允许误弹 XP 选择。
- **M6.0c**：安全节点自动保存/恢复，并实现失败也可获得的**最小战备结算 + 一项可消费永久升级**；没有这一项，不上线 20 分钟失败零收益的长局。
- **M6.1**：可选双战区、各自主素材、永久装备工坊、真正有区别的敌群/事件。
- **M6.2**：凯恩/灰烬/伊芙的被动与专武、首批两条跨武器融合，奖励合法池与卡牌稀有度。

最重要的是**从此以后为可运行内容注册明确扩展点，但不把未开发的设计稿直接注入已上线卡池**。
