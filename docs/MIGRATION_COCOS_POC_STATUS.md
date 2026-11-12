# Cocos Creator 迁移状态

> 更新日期：2026-11-12  
> 工作分支：feature/cocos-wechat-migration-poc（PR #15，保持 Draft）  
> 规则基线：main / M6.0a–M6.1a 集成版本  
> 完整功能对照：见 [M0–M6.1a 历史功能迁移审计](MIGRATION_COCOS_PARITY_AUDIT.md)。

## 当前结论

**Cocos Creator 3.8.8 Web Mobile 的真实构建与浏览器触控验证已通过；M0–M6.1a 完整玩法迁移尚未完成。**

### 已有证据

- GitHub Actions 的 Creator 3.8.8 Web Mobile 构建、独立部署、公网 SHA 校验和 Playwright 原生触摸测试通过：
  - [Run 43166896140](https://github.com/kk518/endless-swarm/actions/runs/43166896140)
  - 当前 PR head 的最新检查记录见 PR #15 Checks。
- Cocos 场景使用 PocWorld 纯 TypeScript 规则；浏览器 Canvas 预览也复用同一份 PocWorld。
- progression、runRandom、battlefields、metaProgression、contentCatalog、heroRuntime、weaponRuntime 十八个规则模块（combat、progression、arsenal、autoGrowth、streak、supplies、pressure、visibility、campaignDirector、routeDecisions、runRandom、runSafeSave、platformStorage、battlefields、metaProgression、contentCatalog、heroRuntime、weaponRuntime）通过 scripts/check-m6-copy.mjs 和 cocosM6Bridge.test.ts 做字节级同步检查。
- PoC 有星际战士和凯恩两名可玩英雄；凯恩有部署强化被动和独立轨道炮专武。
- Canvas 预览已接入双战区选择、独立预览存档、资源结算与工坊购买。

### 当前明确未完成

- PocWorld 仍是约 100 秒的五波简化战斗，不是完整 M1，更不是 M6 三幕九遭遇。
- 缺少完整四普通武器、四武器等级/进化、波末卡牌、M2 连杀/自爆虫、M3 精英/补给、M4.1 视听表现。
- M5.2 自动成长训练策略和 M5.3 手机可见虫潮规则尚未完整接入。
- Cocos Creator 运行时尚未接入 campaignDirector、routeDecisions、runSafeSave 和 platformStorage；Canvas 预览的 DOM/localStorage 功能不能代表 Creator 已完成。
- Cocos Creator 中尚无完整三幕流程、路线选择、安全节点恢复、战区工坊 UI 和真实结算闭环。
- 正式 2.5D 角色/虫族/武器美术、完整音效、微信小游戏构建、微信开发者工具导入及 Android/iOS 微信真机验证均未完成。

## 下一步

P1 的源码准备已完成：18 个主线纯 TypeScript 规则模块已镜像进 Cocos 工程，并扩展字节一致性检查与回归测试。当前 PocWorld 尚未调用其中大部分模块。下一步建立 Core/RunController 接口，先恢复四武器、卡牌、XP/进化和 M0–M5.3 战斗行为，再接入三幕/存档/局外闭环；暂停新增英雄与武器。

## 隔离要求

- PR #15 保持 Draft；本状态更新不代表可合并或发布。
- main、原 Phaser H5 入口和线上 /swarm/ 保持不变。
- 不以 Node 测试、Vite Canvas 预览或浏览器模拟替代 Creator/微信/真机验收。
