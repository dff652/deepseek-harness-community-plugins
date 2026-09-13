# Agent Mail 0.2.1 发布与公开下载验收

2026-09-13 完成 GitHub 发布及公开下载包验收。本轮已获授权提交/推送发布材料、
创建/推送 tag、发布 GitHub Release 并验证公开下载；目录修改与生产升级不在本次执行范围。
后续单独同意的[目录更新与来源切换交接](agent-mail-0.2.1-catalog-handoff.md)另行记录；
下文保留本次发布窗口的事实。

## 发布对象

| 项目 | 实际结果 |
|---|---|
| 包 | `@dff652/dsh-agent-mail@0.2.1`，统一 MCP 与邮箱 UI，九文件 |
| Release | [Agent Mail 0.2.1](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.2.1)，非 draft、非 prerelease，Latest |
| 发布时间 | `2026-09-13T14:39:00Z` |
| Annotated tag | `dsh-agent-mail-v0.2.1`，tag 对象 `e5f174310f7b133dfc2bb6afb43fba21041d43ca` |
| Tag 解引用提交 | `fa4f22f72535f871f24d8511b476cd44aaff2310`；产品修复为 `267584e` |
| 发布材料提交 | `dfa0d5e73500e8a451d95cbccc9fa6a6297cb0bf`，已推送 |
| Tarball | [dff652-dsh-agent-mail-0.2.1.tgz](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.1/dff652-dsh-agent-mail-0.2.1.tgz)，48,783 bytes |
| SHA-256 | `6ab01c2d9a287cd991aa4380f0375d89b743101c86cb2ef71f2de6ae7c58fb23` |
| 校验文件 | [SHA256SUMS](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.1/SHA256SUMS)，98 bytes |

Release 仅有上述两个资产，正文与已提交的
[发布说明](releases/agent-mail-0.2.1/RELEASE_NOTES.md)一致。
上传、匿名下载、验收候选和 tag 源码的九文件内容保持一致，未重写包内 candidate 文案或改变已验收摘要。
发布准备中的拟用 tag 对象保持不变；后续材料提交不改写 tag。

## 本轮验证

| 验证项 | 结果与范围 |
|---|---|
| 材料提交 CI | [34763180891](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/34763180891)，对应 `dfa0d5e`，Node 22.19.0 / 24.19.0 全部通过 |
| Tag CI | [34763272184](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/34763272184)，对应 tag 源码 `fa4f22f`，两个 Node 任务全部通过 |
| CI 检查范围 | 包合同测试、公开边界和包文件 allowlist；此前同一源码的 118 项测试与完整隔离矩阵见完成度复核 |
| 匿名下载 | 无认证 HTTP 下载 tarball 和 SHA256SUMS，均为 200；大小、文件名与远端资产一致，SHA-256 匹配 |
| 内容核对 | 下载 tarball 的九个条目均为允许的普通文件，逐文件与 tag 源码相同 |
| 新 web/headless profile | `tests/dsh-agent-mail-unified.acceptance.mjs` 显式使用下载包；安装、生成配置和移除均通过 |
| 旧两包迁移 | 匿名下载并核实 MCP 0.1.1 与 UI 0.1.7；共装时触发预期的 duplicate UI 拒绝，移除旧 UI 后统一安装通过 |
| 隔离与清理 | DSH 命令由隔离 home 守卫启动；临时 home 已删除、运行时临时缓存已清理，未发现工作目录仍位于该隔离树的进程 |

web/headless 配置均确认一个 `mcp-agent-mail` 与一个由统一包提供的 `dsh-agent-mail-ui`。
守卫要求 DSH home 位于本次新建测试目录，下载包通过
`DSH_AGENT_MAIL_UNIFIED_TARBALL` 显式传入；未使用默认生产 home。
迁移门在重复 UI 校验阶段使用固定失败的 provider 占位命令，不读取生产邮箱。

本轮没有重复完整浏览器、TLS receipts 和管理恢复矩阵；这些已通过的证据绑定同一个
`6ab01c2d…` 归档，见 [C01–C08 完成度复核](agent-mail-ui-0.2.1-completion-review.md)。
此前 0.2.0 的双物理主机矩阵仍是历史证据，不宣称 0.2.1 已重新执行该矩阵。
发布验收的原始下载、日志和隔离记录保存在本地忽略目录，未上传为 Release 资产。

## 安装、回滚与后续边界

安装一个统一包即可获得 MCP 与邮箱 UI。持久发送回执与收件人详情继续使用独立、已发布的
[Agent Mail provider alpha.7](https://github.com/dff652/agent-mail/releases/tag/v1.0.0-alpha.7)；
本轮没有重新发布 provider，也没有 npm 或独立 UI 0.1.9 发布。

已使用统一 0.2.0 的部署升级时保持 provider、邮箱、身份和连接配置。
旧 MCP + UI 两包部署先保存原包和配置，再移除独立 UI 后安装统一包。
统一包回滚资产为 [0.2.0 Release](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.2.0)，
tarball SHA-256 为 `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf`；
已在发布准备阶段匿名下载验证。回滚 DSH/plugin 配置时不得覆盖已有新消息的邮箱。
完整步骤见 [发布准备与回滚方案](agent-mail-0.2.1-release-preparation.md)。

[目录 PR #4837](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4837)
在本次发布准备核对时仍开放且指向 0.2.0，本轮没有修改它。
后续目录执行应重新读取 PR/upstream，再更新现有条目至已公开验证的 0.2.1 URL；
其检查、合并和商店实际下载目标分别验收，不新增独立 UI 条目。

本轮未操作生产或已有用户预览。0.2.0 的生产结果保留在
[生产验收记录](agent-mail-0.2.0-production-acceptance.md)；
0.2.1 生产升级需要另行现场核查、备份和部署授权。
