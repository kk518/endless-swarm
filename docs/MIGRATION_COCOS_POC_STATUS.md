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

## 2026-11-12：独立网页预览已上线（经过公网 SHA 校验）

- **试玩地址：** https://kk518.top/swarm/cocos-preview/
- **源码：** `clients/cocos-preview/`，从 `clients/cocos/assets/scripts/PocWorld.ts` 导入**同一份核心逻辑**，没有复制一套战斗规则。
- **构建：** `.github/workflows/cocos-preview.yml`，由迁移分支 Draft PR 同步触发，依次运行旧 H5/PoC Node 测试、预览 TypeScript 检查、Vite 子目录构建、独立 SSH rsync 和公网精确 SHA 校验。
- **实测结果：** GitHub Actions Run [43147795222](https://github.com/kk518/endless-swarm/actions/runs/43147795222) 全绿，包含公网版本校验成功。
- **性质：** Canvas 2D 临时表现层 + Cocos PoC 共享规则，**不是 Cocos Creator 的 Web Mobile 引擎产物**；微信小游戏/真机仍未验证。后续需要在远程构建环境中配置受支持的 Cocos Creator 3.8 版本，不能把 Vite 构建冒充 Cocos 构建。
- **主线隔离：** 只发布到 `/var/www/endless-swarm/cocos-preview/`，原 `/swarm/` 的资源与线上逻辑未被本次迁移部署覆盖。
- **保留风险：** 当前 `main` 的旧部署工作流会对父级 `/var/www/endless-swarm/` 执行 `rsync --delete`。主线已封板所以没有改动它；未来若恢复 main 发版，必须先为 `/cocos-preview/` 增加 rsync 排除项，或迁移到独立 Nginx alias，否则子目录可能被删除。

**接下来的工作**：优先搭建 GitHub 执行的真正 Creator 3.8 构建环境并生成引擎工程所需场景、`.meta` 等资源元数据，验证 Web Mobile 后保持子页面预览方式，再扩展武器与虫群。
