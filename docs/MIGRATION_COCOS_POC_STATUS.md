# Cocos Creator 迁移状态

> 更新日期：2026-11-12
> 工作分支：feature/cocos-wechat-migration-poc（Draft PR #15）
> 主线对照基线：main / ae04c0b9（M6.1a）
> 历史功能审计：参见 [M0–M6.1a 功能对照](MIGRATION_COCOS_PARITY_AUDIT.md)

## 技术验收

- 已有真实 **Cocos Creator 3.8.8 Web Mobile** 构建/独立服务器部署及浏览器触摸测试通过的历史证据：[Creator CI](https://github.com/kk518/endless-swarm/actions/runs/43166896140)。
- **当前提交 CI 必须另行核对**：Node 共享核心、Canvas 预览与 Creator 引擎运行的结果不能混为一谈。
- 18 个主线引擎无关模块已同步到 Cocos assets/scripts/m6，CI 通过字节一致性校验避免规则分叉。
- 本次迁移依旧保持 `main`、`/swarm/` 与 Draft PR #15 隔离；浏览器成功不代表微信小游戏/Android/iOS 真机通过。

## 已接入真实战斗核心

1. M0：触摸/键盘移动、移动时自动射击、0.8 秒停步火力展开、固定步长与前后台输入释放。
2. M1/M5：波末可操作三选一卡牌；五波或三幕九遭遇模式；四普通武器（步枪/散射/电弧/喷火）真实攻击驱动、等级/进化调谐与自动 XP 成长。
3. M2：真正可避免的自爆虫 **850ms 红圈预警 / 105 半径 / 2 点伤害**；主线 streak 4.5 秒计时、连杀倍率和 Frenzy 卡牌；连杀 UI。
4. M3：使用主线 canSpawnElite 和补给规则：精英 HP×2.3、击杀奖励与掉落，定时补给、生命修复、超频射击和 EMP 范围伤害；Cocos/Canvas 双端有可见补给/爆炸表现。
5. M5.3：普通武器在目标进入 readable inner view 后才锁定；复用 visibleEdgeSpawn 和 700ms 到场预警；两端统一通过 PocViewport.ts 将 600 单位宽战斗世界投影到原 450 宽 UI 画布，机甲战场缩放为 0.75，摇杆、卡牌与 HUD 不跟随世界缩放。
6. M6：基础九遭遇、六次卡牌、两次路线决策；双战区权重由主线模块驱动；Canvas 预览有独立局外存档与工坊；凯恩英雄及专武留作扩展槽位验证.

## 本次新增：M3.1 主线虫潮节奏

- 正式接入 main 的 `pressurePlan` / `spawnOffset` / `SURGE_PERIOD_MS` / `SURGE_WARNING_MS`；按遭遇压力等级和波内进度逐渐提升虫群频率、组规模和速度。
- 取消此前 Cocos 固定刷怪批次与最短 370ms 间隔的 PoC 逻辑；动态 interval 支持路线压力倍率，出生位置仍经 M5.3 可见边缘安全预警。
- 每 14.5 秒开始一次虫潮集结预警，1.25 秒后触发额外群组；当前进度、倒计时通过共享 State 提供给双端 HUD，波末/重开清理计时。
- 代码验证：`tests/cocosM31PressureParity.test.ts` 覆盖主线动态节奏、实际预警、状态重置、种子确定性。真实 Creator 编译与浏览器触控以最新 PR Checks 为准。

## 尚需严格对齐的历史功能

- M1/M2/M3：喷酸虫远程酸液（700ms 预警、230 速度、2.2s 有效期）与跃袭虫 530ms 预警突进已接线；仍需精英差异化行为和 M3.1 完整虫潮节奏、移动端体验对齐。
- M4/M4.1：四武器挂载点、正式 2.5D 图像、进化光效及完整音频。
- M5.2：波末训练计划 UI、自动进化配方可视化及完整属性反馈。M5.3：主线 readable targeting、700ms 边缘入场标记已接入；本轮新增 600 单位宽世界、独立 World Graphics 和 UI Graphics/DOM HUD 投影。正式手机纵横屏、DPR 与真实 Creator Web Mobile 验收以最新 CI 为准。
- M6：完整九遭遇战斗 parity、安全节点构筑与 RNG 快照存档恢复、Creator 端双战区工坊/局外结算。
- 微信小游戏构建、开发者工具导入及 Android/iOS 微信真机测试尚未完成。

## 验收准则

同一 Seed 与输入序列下比较核心战斗/奖励/路线/存档结果；每一项必须有 Node 规则测试、Cocos Creator 场景接线验证，最终再完成微信真机验收。P2/M2–M5.3 增量需核对 **tests/cocosM23Parity.test.ts**、**tests/cocosEnemyVisibilityParity.test.ts** 和最新 PR Checks；代码已提交不等于发布验收已通过。

## M5.2 波末训练控制（当前提交）

已在 Cocos 核心共享世界新增安全节点专精配置 API。只有结算奖励待选时才能修改专精；只允许选择已装备的普通武器和主线的火力/速攻/机动三倾向。Canvas 预览新增真实可操作的训练按钮；Creator 端新增独立 UI 层的七个训练 Label/点击区域。两端都读取主线 autoGrowth 规则和 RunController 的训练快照。调整配置不会在波内弹窗或重抽卡牌，下一批 XP 等级沿所选专精升级。

本项完成情况需以最新 SHA 对应 Node 回归、Canvas 独立部署和真正 Creator Web Mobile 构建结果为准。仍然缺少 M6.0c 安全节点存档恢复和 Creator 局外工坊完整操作。

## M6.0c 安全节点存档和恢复（本轮新增）

已接入主线 `runSafeSave.ts` 的 schema-v2 验证：`CocosRunController` 在奖励节点或下一遭遇第 0ms 生成完整构筑、经验等级、训练计划、装备快照、生命、已展示卡牌和四路随机状态；`PocWorld` 只在这些安全节点允许导出和恢复，战斗途中不保存敌人/弹幕状态。恢复原先展示的卡牌时直接取保存的 ID，不重抽奖励；来源无效、RNG 损坏或正在战斗时拒绝恢复。

Canvas 预览新增“继续远征”控制和独立的 `cocos-preview-m6:` 存储命名空间，结算成功后仅清理本局 runId 的安全存档；Creator 版采用 `cocos-creator-m6:` 命名空间、屏幕顶部中央恢复入口和 `getStoragePort()` 注入式接口。两者都不能覆盖主线 `/swarm/` 的本地存档。schema-v2 当前仅接受 marine 英雄，凯恩仍需后续扩展。Creator 的工坊结算/微信原生 Storage 适配尚未完成，不可由 Web 通过推断。

本项需以最新提交的 Node/Canvas/Creator 独立 CI 结果确认，不能只因代码已提交就宣称全平台验收。
