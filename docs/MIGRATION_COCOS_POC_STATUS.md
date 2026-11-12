# Cocos 微信小游戏迁移：PoC 状态跟踪

> 分支 `feature/cocos-wechat-migration-poc`；**主线封板，迁移优先**。仅本分支承载新 Cocos 功能。
> 基线：创建分支时 `main` 的现有 Phaser M5.2/M5.3 版本；PR #7 产品规划与 PR #10 M6 Core 仍按真实合并状态接入，不把未合并代码视为已发布。
> 本记录不等同于微信构建/真机验收。

| 工作项 | 当前状态 | 证据 / 下一步 |
| --- | --- | --- |
| MIG-00 迁移分支与基线隔离 | 已建立 | `feature/cocos-wechat-migration-poc`，不修改 `main` |
| MIG-01 Cocos 2D 工程骨架 | **部分** | `clients/cocos/package.json` + TypeScript 组件；仍需 Creator 编辑器创建/保存标准场景和 .meta |
| MIG-01 一枪一虫战斗演示 | **代码就绪，运行未证实** | `PocBattle.ts` + `PocWorld.ts`；Cocos Graphics 临时美术 |
| MIG-02 Core 可移植验证 | **Node 单测代码就绪** | 同一个 PocWorld 文件既被 Cocos 组件引入又被 Node 测试引入；微信端编译待验证 |
| MIG-03 移动、单指和中断适配 | **代码就绪，真机待验** | `input` 触摸/键盘与 `game` 前后台回调 |
| Web Mobile 发布 | 未验证 | 需 Cocos 3.8 编辑器构建 |
| 微信小游戏发布 | 未验证 | 需 Cocos 3.8 编辑器、微信开发者工具、真机 |
| 2.5D 正式美术 | 未开始 | 当前仅用 Cocos Graphics 绘制占位图形 |
| 旧 Phaser 五波功能 parity | 未开始 | G2/G3 待拆分真实 GameCore |
| 线上 H5 切换 | **禁止** | `https://kk518.top/swarm/` 保持原样 |

## 第一阶段验收

- [x] 迁移分支隔离与回归测试代码
- [x] Cocos 组件中的触摸、角色、工虫、射击、HUD 原型逻辑
- [ ] Cocos Creator 3.8.x 实际编辑器编译
- [ ] 保存有效 `Battle.scene` 和所有相关 `.meta`
- [ ] Web Mobile 在浏览器真实预览
- [ ] 微信开发者工具导入、体验版和 Android/iOS 真机
- [ ] 记录实际包体、帧耗时、内存、音频及后台恢复

**声明**：源码没有实现音效、完整 M5/M6、正式微信账号/登录、2.5D 模型、资源分包/正式审核；不存在这些功能的成功验收证据。

参考：[迁移 RFC / PR #12](https://github.com/kk518/endless-swarm/pull/12)。
