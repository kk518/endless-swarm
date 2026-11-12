# 《无尽虫潮》Cocos Creator 3.8 微信小游戏迁移 PoC（开发中）

> 状态：**第一批源码已提交，编辑器生成的场景与微信真机构建尚未验证。** 这不是已可直接发布的完整小游戏。
> 迁移功能分支：`feature/cocos-wechat-migration-poc`。原 `main` / Phaser H5 和自动部署保持原样。

## 目标与已经完成的内容

- `assets/scripts/PocWorld.ts`：纯 TypeScript 的固定步长小型战斗模拟（单指移动、停步 0.8s 展开、自动射击、工虫追击、HP/击杀、种子刷怪）。
- `assets/scripts/PocBattle.ts`：Cocos 3.8 `Component`，使用官方 `input` 触摸/键盘事件、`Graphics` 临时绘制机甲/工虫/子弹、`Label` HUD 和前后台中断处理。
- `tests/cocosPocWorld.test.ts`：主仓库 Node 测试覆盖相同的 **Cocos 引用的 PocWorld 模块**。无 DOM、Phaser、Cocos 依赖。
- 这是 **G1 纵向切片源码**，不是 M5/M6 玩法等价实现。历史 Phaser 原型保持可用。

## 如何在安装了 Creator 3.8 LTS 的机器上使场景可预览

**当前仓库还没有由 Cocos 编辑器生成/保存的 `Battle.scene`**，也没有经编辑器导入产生的 `.meta` UUID：不能把“脚本已提交”误当作“能直接点网页预览”。后续在装有 Creator 的开发机上完成并提交资源文件。

1. 安装并固定一个 **3.8.x** 具体补丁版本。用 Creator Dashboard 打开本目录 `clients/cocos`（若编辑器提示工程不完整，则使用 **空 2D 项目** 模板在临时目录生成标准工程，再把其编辑器生成配置合入这里，保留本目录的 `assets/scripts`）。
2. 在 Creator 中使用「资源管理器 → 新建 Scene」创建 `Battle.scene`；在层级中创建 **Canvas（2D）**，并确认场景有用于 Canvas 的 UI Camera。
3. 在 Canvas 节点上通过「添加组件 → 自定义脚本」添加 `PocBattle`，保存场景；在「项目设置」中将设计分辨率设置成例如 450×800、适配手机竖屏，并设置 `Battle` 为启动场景。
4. 保存并 **提交场景、所有 `.meta`、`settings` 和必要项目配置**。不要手改资源 UUID。
5. 编辑器浏览器预览：拖动屏幕下部移动，松开进入火力展开，自动开火；桌面 WASD/方向键移动，R 重新开始。该 PoC 是基础几何图形，**不是最终 2.5D 模型/动画**。
6. 「项目 → 构建发布」分别选择 **Web Mobile** 和 **微信小游戏**；使用微信开发者工具和 Android/iPhone 真机验证，记录包体、场景运行、触控、性能、前后台切换。
7. PoC 真机验证后才标记 G1 完成。不要将新构建部署至现有 `https://kk518.top/swarm/`；H5 验证另用独立 staging 路径。

## 命令行测试

从仓库根目录：

```bash
npm install
npm test
npm run build
```

这些命令只验证 **原 Phaser H5 的 CI 与新增纯 TS 规则测试**，**不等于 Cocos 编译成功**。Cocos 必须由 3.8 编辑器实际构建，才能验证 `PocBattle.ts` 的引擎 API 类型和运行行为。

## 代码边界与后续阶段

本 PoC 的单一纯逻辑模块位于 Cocos 工程的 `assets/scripts/PocWorld.ts`，目前是为了让 Cocos 能零外部包依赖读取、Node 测试也能直接复用**同一份文件**。G2 将核心逻辑从真实 `src/game/GameScene.ts` 拆出后再统一整理到 `packages/game-core`，以同步契约测试确保不会形成两套生产规则。

- G1 完成 Cocos 真实场景、双端构建与真机 PoC。
- G2 复用 M6 `campaignDirector`、`runRandom`、`weaponRuntime`、`heroRuntime` 和旧版战斗规则，建立与旧 H5 的行为对照。
- G3 完成五波、4 武器/进化、自动 XP、Boss；G4 正式 2.5D 美术；G5 接入三幕、局外战区与长局存档。
- **禁止改 main、自动合并、覆盖线上部署或未经审核上传微信正式版。**

详见独立 RFC：[微信优先 Cocos 迁移路线](https://github.com/kk518/endless-swarm/blob/docs/wechat-cocos-migration-rfc-20261112/docs/RFC_WECHAT_COCOS_MIGRATION.md)。

## 参考

- [Cocos Creator 3.8 项目结构](https://docs.cocos.com/creator/3.8/manual/zh/getting-started/project-structure/index.html)
- [Cocos Creator 3.8 输入事件](https://docs.cocos.com/creator/3.8/manual/zh/engine/event/event-input.html)
- [Cocos Creator 3.8 Graphics](https://docs.cocos.com/creator/3.8/manual/zh/ui-system/components/editor/graphics.html)
- [Cocos Creator 3.8 微信发布](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-wechatgame.html)
