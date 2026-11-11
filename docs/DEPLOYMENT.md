# 《无尽虫潮》自动部署（CI/CD）

## 目标

将 `kk518/endless-swarm` 的 `main` 分支自动测试、构建，并通过 SSH/rsync 部署到独立目录。复用旧项目 `kk518/bossisnear` 的思路，但**不共享部署目录**。

| 配置 | 值 |
| --- | --- |
| GitHub workflow | `.github/workflows/deploy.yml` |
| 触发 | 推送 / 合并到 `main`，或手动 `workflow_dispatch` |
| 主机上的部署目录 | `/var/www/endless-swarm/` |
| 预期网址 | `https://kk518.top/swarm/` |
| 旧项目位置 | `/var/www/bossisnear/`（**不可覆盖**） |
| 验证 | `npm test` + `npm run build` + 外网 URL 与实际部署 commit 核验 |

> **目前只是配置方案。** GitHub Actions Secrets 属于仓库作用域，旧仓库中的值不会自动复制到新仓库。必须完成下面的服务器及密钥配置之后，才会执行真正的上传。没有 Secrets 时，构建正常完成，但部署会显式提示 SKIPPED。

## 1. 新仓库需要配置的 Actions Secrets

进入 **GitHub → `kk518/endless-swarm` → Settings → Secrets and variables → Actions → New repository secret**，依次配置：

| Secret 名称 | 含义 |
| --- | --- |
| `SERVER_HOST` | 已有服务器的 SSH 主机/IP |
| `SERVER_USER` | 用于部署且有新目录写入权限的 SSH 用户 |
| `SERVER_SSH_KEY` | 该用户对应的 SSH 私钥（保留完整换行） |
| `SERVER_KNOWN_HOSTS` | 已核实的服务器 SSH 主机公钥 known_hosts 记录 |

与旧项目的 Secret **名字相同**，可以沿用同一套服务器连接方式；但每个仓库都必须获得授权（也可以由 GitHub Organization Secret 明确授权）。

**请不要在聊天、Issue、PR 或代码里发送/提交私钥。** 新仓库的 GitHub Connector 无法读取或转移旧仓库 Secret 的明文。建议使用独立的受限部署密钥，后续可以分别撤销。

## 2. 服务器上创建隔离目录

以下在服务器上执行，将 `DEPLOY_USER` 替换为实际部署用户：

```sh
sudo install -d -m 755 -o DEPLOY_USER -g DEPLOY_USER /var/www/endless-swarm
sudo -u DEPLOY_USER touch /var/www/endless-swarm/.endless-swarm-deploy
```

- `/var/www/endless-swarm/` 不能是符号链接。
- 工作流在部署前会确认目录存在、不是符号链接、部署用户可写，并且有 `.endless-swarm-deploy` 标记文件。
- `rsync --delete` 仅作用于 **`/var/www/endless-swarm/`**，并排除该标记文件，避免删除旧项目或误选目录。
- **不要**将新游戏部署在 `/var/www/bossisnear/` 的子目录里：旧项目自身使用 `rsync --delete`，未来更新可能清理新游戏。

## 3. Nginx 路由

在当前提供 `kk518.top` HTTPS 的 **同一个** Nginx `server { ... }` 中增加，不要新建与现有域名冲突的 server 块：

```nginx
location = /swarm {
    return 301 /swarm/;
}

location ^~ /swarm/ {
    alias /var/www/endless-swarm/;
    index index.html;
    try_files $uri $uri/ =404;
}
```

之后验证并重新载入：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

当前版本没有前端路由，`vite.config.ts` 的 `base: './'` 可以从 `/swarm/` 下正确加载 JS/CSS/资源。如果将来加入 history 模式路由，需要重新评估 Nginx fallback。

**注意**：服务器当前 Nginx 配置尚未在本次对话中实际检查；上面是推荐添加的片段，不代表已经修改成功。

## 4. 工作流行为

1. 合并代码到 `main` 后 GitHub Actions 自动触发 `Deploy Endless Swarm`。通过 GitHub Actions 手动触发也**仅限 `main`**，不能通过选择 feature 分支直接发布未经合并的代码。
2. 在 GitHub Runner 使用 Node 22，安装依赖、执行单测和 TypeScript/Vite 生产构建。
3. 构建完成后写入 `dist/deploy-version.json`（当前 Git commit）。若 4 个 SSH Secret 不齐：**跳过部署**，在 Actions Summary 显示警告（不能将其视为已上线）。
4. 若齐全：通过已验证的 SSH known_hosts 严格核验主机、检查专用目录和标记文件。
5. 使用 `rsync -az --delete --delay-updates` 仅同步 `dist/` → `/var/www/endless-swarm/`。
6. 请求 `https://kk518.top/swarm/`，检查 HTTP 成功且返回 Endless Swarm HTML；再请求 `/swarm/deploy-version.json`，核对内容中的 commit 与当前 GitHub Actions 运行的 SHA 完全一致。若仍是旧版或 Nginx 路由错误，工作流失败并显示原因。
7. 推送到 `feature/*` 不触发**生产**部署；仍由现有 `Verify prototype` CI 进行测试和构建。

## 5. 首次上线与常见问题

- **构建成功但部署 SKIPPED**：检查新仓库 4 个 Actions Secrets，必要时检查是否启用可访问的新仓库 Organization Secrets。
- **SSH Permission denied**：确认对应公钥在服务器部署用户的 `~/.ssh/authorized_keys`，该用户具有目录权限。
- **Host key verification failed**：用可信渠道核实主机指纹并更新 `SERVER_KNOWN_HOSTS`，不要关闭 StrictHostKeyChecking。
- **目录预检失败**：在服务器上执行第 2 步，核实文件夹是实体目录，存在标记文件且部署用户可写。
- **同步成功但 HTTP 冒烟检测失败**：排查 Nginx location、HTTPS 站点、静态目录权限和缓存。
- **抽卡版本没有上线**：确认 M0/M1 的 PR 已按顺序合并到 `main`，不能只把代码留在功能分支。

## 6. 安全与后续优化

- 初版延续旧项目的 GitHub Actions → SSH/rsync 思路，不引入新的服务器组件。SSH 秘钥仅作用于部署相关步骤，测试与安装依赖步骤不会得到秘钥环境变量。
- 建议今后为部署密钥限制目录写权限、使用独立 SSH 用户，且仅授予必要权限。
- `npm install` 适用于仓库当前**尚无 `package-lock.json`**的状态；提交 lockfile 后应切换成 `npm ci` 以提高可复现性。
- 正式发布前建议补充分支保护、人工批准环境、上线后功能冒烟测试和版本回滚策略。当前的 rsync 不是原子版本切换，不提供自动回滚。

**发布边界**：未配置密钥或服务器目录前，仓库工作流只是“可执行的部署配置”，不代表网站已经上线。正式部署不应影响 `bossisnear` 现有文件。
