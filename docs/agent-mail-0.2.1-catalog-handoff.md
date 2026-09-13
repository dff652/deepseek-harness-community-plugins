# Agent Mail 0.2.1 目录更新与线上来源切换

2026-09-13，用户同意将现有目录 PR 更新至已发布的 0.2.1，待上游合并并刷新目录后，
再将 Host A 的本地归档安装切换到市场来源。发布包、provider 与原有邮箱保持既有验收边界。
本文只记录公开版本、检查结果和操作条件；部署路径、身份、原始运行数据与备份留在本地受保护位置。

## 目录变更

现有 [PR #4837](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4837)
更新同一个 `data/plugins/dff652__deepseek-harness-community-plugins--packages-dsh-agent-mail.yml`。
最终 PR 差异仅包含中英文描述和精确 0.2.1 tarball URL，不添加独立 UI 条目或 npm 映射。

| 项目 | 值 |
|---|---|
| 目录提交 | `180993ae08a40c3a14db87be3c852615a4677f49` |
| 同步的 upstream main | `d9a53bf020be61f21eb9a55f5a12ae7e49bf3d61` |
| 提交方式 | 保留原 PR 历史的合并提交，包含最新目录主线与 Agent Mail 条目更新 |
| 安装包 | [统一 Agent Mail 0.2.1](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.1/dff652-dsh-agent-mail-0.2.1.tgz) |
| SHA-256 | `6ab01c2d9a287cd991aa4380f0375d89b743101c86cb2ef71f2de6ae7c58fb23` |
| Provider | 独立安装的 [Agent Mail 1.0.0-alpha.7](https://github.com/dff652/agent-mail/releases/tag/v1.0.0-alpha.7) |

公开下载、九文件内容、隔离 web/headless 安装与旧两包迁移已在
[发布验收](agent-mail-0.2.1-release.md)中验证。本轮复用相同归档，不重新打包或更改 tag。

## 目录检查

- 目录原生 YAML 读取和条目校验通过；保留既有 URL、name 与分类。
- dshmarket 1.41.0 的安装目标解析对候选条目返回精确的 0.2.1 Release URL。
  只读取得已安装包的 repository 元数据后，对完整候选目录执行同一匹配与恢复解析也得到该 URL，
  无 workspace 协议阻塞；未调用生产更新接口。
- Node 22.19.0 上 README 生成、生成后的一致性检查和三个 added-date 回归测试通过。
- awesome-lint 在与上游 CI 一致的仓库元数据上下文通过，保留 79 条既有警告。
  默认 fork 元数据上下文仅因 fork 缺少 `awesome` / `awesome-list` topics 报两个错误；
  检查规则未禁用，仓库元数据未修改。
- 完整站点构建通过：按 PR 工作流设置 `SKIP_PUBLISH_CHECKS=1`，生成 3,632 个条目的双语页面、
  sitemap 和 count badge。原来的日期解析错误未在同步后的上游代码中重现。
  生成的 `plugins.json` 中只匹配一个 Agent Mail 条目，`npm: null`，tarball 与安装命令均为精确 0.2.1 URL。
- 目录提交已正常推送至现有 PR 分支，远端确认仅一个 YAML 文件、三行增加/三行删除。
  新提交的 [PR check](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/34766232419)
  全部通过，运行绑定完整 head `180993ae08a40c3a14db87be3c852615a4677f49`；
  远端同样通过三个日期回归测试和 3,632 条目的双语完整构建，完成于 `2026-09-13T15:46:29Z`。

生成的两个 README 仅用于本地检查，不纳入 PR 差异；上游在合并后生成 README。
此前基于旧目录主线的日期错误是历史检查结果，新结果须绑定本次提交。

## 线上切换条件

本轮只读核查 Host A（`2026-09-13T15:45:02Z` 再次确认）：统一包仍为 `0.2.0` 的 `file:` 安装，市场为 `1.41.0`。
市场 `/updates` 对它返回 `kind: linked`、`updateAvailable: false`；
运行中市场目录及已核对的公开主线条目仍指向旧的 `0.1.0` tarball。
因此当前不能通过“恢复线上版本”得到 0.2.1。

后续按以下顺序执行已经同意的切换：

1. 确认 PR 已合并；读取公开目录和运行中市场返回的条目，要求安装解析均为上表的 0.2.1 URL。
   目录仍旧、条目重复或出现未审查的 npm 映射时不切换。
2. 重新核对现场服务、profile、当前版本、provider、邮箱、身份与连接设置。
   重新下载目标归档并核对 SHA-256；确认市场没有正在运行的 agent，遵守其更新保护。
3. 按[生产迁移 SOP](agent-mail-production-migration-plan.md)验证完整 DSH 配置与运行环境备份，
   使用 SQLite backup API 或停写后成功 checkpoint 获取一致邮箱备份，验证完整性。
   使用当前 0.2.0 的精确回滚包；历史 alpha.4、独立 UI 和旧 DSH 不是此次回滚目标。
4. 通过市场的本地来源恢复路径安装已核对的目标，按加载结果重启 DSH。
   保持 provider alpha.7、邮箱、身份与连接设置，检查一个 MCP 与一个邮箱 UI。
5. 验证市场记录的来源/版本、实际加载版本、浏览器邮箱、MCP 与既有收发业务路径，
   并单独核对公开 HTTPS 入口。业务验收仅使用获授权的身份和接收方。
6. 如需回滚，只恢复 DSH/plugin 配置与精确 0.2.0 包；不得用旧备份覆盖切换后产生的新消息。
   记录验收结果后再宣称线上完成升级。

市场 `1.41.0` 的 `restore: true` 路径能使用目录中的精确 Release tarball。
其普通更新检测与非 Git 更新路径仍面向 npm `latest`，而此包没有 npm 发布；
切换成功只证明本次可从目录安装 0.2.1，不证明以后每次 GitHub Release 都会自动出现“更新”提示。

## 当前交接

目录 PR 已更新并推送至 `180993ae`，远端检查全部通过，PR 仍 OPEN，
`mergeable: true`、`mergeable_state: clean`、`merged: false`。Host A 尚未切换到 0.2.1。
上游仓库写权限不属于当前账号，合并取决于维护者；PR 开放或目录缓存仍旧时保留现有线上安装。
