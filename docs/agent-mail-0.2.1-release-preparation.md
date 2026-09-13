# Agent Mail 0.2.1 发布准备

核对日期：2026-09-13。源码与既有验收文档已推送至 `fa4f22f`，
[远端 CI](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/34750682071)
的 Node 22.19.0、24.19.0 测试、公开边界和打包检查全部通过。
本文件保留发布准备时的核对与方案。后续授权执行已完成：材料提交为 `dfa0d5e`，
tag、GitHub Release 与公开下载包安装/移除/迁移验收均通过，见
[0.2.1 发布记录](agent-mail-0.2.1-release.md)。发布窗口未执行目录、npm 和生产操作。
后续单独同意的[目录更新](agent-mail-0.2.1-catalog-handoff.md)已推送；
下方准备阶段的目录快照和草案保留为历史记录。

## 可审阅的发布对象

| 项目 | 拟执行内容 |
|---|---|
| 包 | 统一 `@dff652/dsh-agent-mail@0.2.1`，一个 MCP 与一个邮箱 UI |
| 产品源码 | `267584e`；九个打包文件与下面拟用 tag 对象逐字节一致 |
| 拟用 tag 对象 | `fa4f22f72535f871f24d8511b476cd44aaff2310`，已在 `origin/main` 且 CI 通过 |
| 拟用 annotated tag | `dsh-agent-mail-v0.2.1` |
| 渠道 | GitHub Release，非 prerelease，建议设为本仓 Latest，接替统一包 0.2.0 |
| 发布标题 | `Agent Mail 0.2.1 — AI 协作邮箱体验与回执修复` |
| 发布正文 | [RELEASE_NOTES.md](releases/agent-mail-0.2.1/RELEASE_NOTES.md) |
| 上传资产 | `dff652-dsh-agent-mail-0.2.1.tgz` 与 [SHA256SUMS](releases/agent-mail-0.2.1/SHA256SUMS) |
| SHA-256 | `6ab01c2d9a287cd991aa4380f0375d89b743101c86cb2ef71f2de6ae7c58fb23` |
| provider | 继续使用独立安装、已发布的 `agent-mail@1.0.0-alpha.7`；本轮不发布 provider |
| npm / 兼容 UI | 未选择 npm 渠道；不单独发布 `@dff652/dsh-agent-mail-ui@0.1.9` |

本地上传目录为仓库忽略的 `dist/releases/dsh-agent-mail-v0.2.1/`，包含上述两个上传资产。
该目录没有加入 Git；可审阅的文本材料位于 `docs/releases/agent-mail-0.2.1/`。
归档沿用最终验收候选。本轮使用 Node 24.19.0 / npm 11.17.0 再次打包，压缩字节也完全相同。
包内 README 保留验收时的 candidate 表述；发布渠道状态以 GitHub Release 为准。
不得为调整该文案而静默改写已验收归档。

## 远端核对快照

以下为本轮通过 GitHub API、远端 refs、匿名下载及 npm registry 读取的事实。
执行发布前需要再次检查版本与 PR 是否已变化。

| 对象 | 2026-09-13 核对结果 |
|---|---|
| 统一包 0.2.1 | 没有同名远端 tag、公开或草稿 Release；没有版本冲突 |
| 统一包 0.2.0 | [GitHub Release](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.2.0) 已发布且为 Latest；annotated tag 解引用为 `47c558984f7ccbd698f5ce66c6e56255c8d59aea` |
| provider alpha.7 | [GitHub prerelease](https://github.com/dff652/agent-mail/releases/tag/v1.0.0-alpha.7) 已发布；包含 tarball、SBOM、SHA256SUMS |
| npm | registry 查询 `@dff652/dsh-agent-mail` 与 `@dff652/dsh-agent-mail-ui` 均为 404；本次不申请这些名称或发布 npm |
| 目录 PR | [#4837](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4837) OPEN，非 draft，未合并；head `c36e42b7f85d285cf1b1dc2afddb9d4217ae51ca` |
| PR 现有内容 | 仅修改现有 Agent Mail YAML，指向统一包 0.2.0；没有新增独立 UI 条目 |
| 目录 main | 读取的 `d9a53bf020be61f21eb9a55f5a12ae7e49bf3d61` 中，现有条目仍指向 MCP-only 0.1.0 |
| PR 最后一次检查 | [check](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/34579911635/job/103200817097) 失败，日志为另外三个 `wwweljf/dsh-plugins` 条目无法推导 added-date；不是本包源码 CI 失败 |

目录检查结果绑定其原运行；本轮没有在最新 upstream 重跑完整站点构建，
也不把旧失败直接断言为最新 upstream 仍有同样缺陷。PR 更新后的检查与合并需另外跟进。
目录未合并不妨碍准备直接 GitHub Release 安装材料，也不能宣称商店已升级。

## 精确归档与验收

归档内只有下列九个普通文件：

```text
package/LICENSE
package/NOTICE
package/README.md
package/client.js
package/cordis.patch.yml
package/index.js
package/package.json
package/ui-host.js
package/view.js
```

本轮重新核对生成一致性、dry pack、重复打包字节与拟用 tag 对象；
没有修改产品文件或把旧摘要的浏览器结果转标到新归档。
同一摘要已经完成 118 项本地合同、精确包 web/headless 安装与移除、旧两包迁移、
TLS receipts、Chrome/Firefox 真实侧栏、独立抽屉重启/卸载、管理保存/重启/恢复/激活。
原始步骤及证据边界见 [C01–C08 完成度复核](agent-mail-ui-0.2.1-completion-review.md)。
远端 CI 再次覆盖两种 Node 版本；本轮材料准备不重复跑未变化的完整浏览器矩阵。

0.2.1 的 TLS 场景是在一台机器上的独立客户端与隔离 Hub；
此前两台物理主机的完整验证绑定 0.2.0，不作为 0.2.1 已重跑的双机证据。
0.2.1 的公开下载与下载包安装门仍待真实发布后完成。

## 目录草案

目标仍为现有文件
`data/plugins/dff652__deepseek-harness-community-plugins--packages-dsh-agent-mail.yml`。
完整候选为 [catalog-entry.yml](releases/agent-mail-0.2.1/catalog-entry.yml)，
对当前 PR head 的差异为 [catalog-update.patch](releases/agent-mail-0.2.1/catalog-update.patch)。

草案保留 URL、name 和 `tools` 分类，更新中英文产品描述与精确 0.2.1 tarball URL；
保持 npm 字段缺省，不新增独立 UI YAML。目标下载 URL 尚未发布。
YAML 解析、字段与语言检查通过；与当前目录 `validateEntries` 规则核对一致。
patch 已在隔离副本通过 `git apply --check`，实际应用后的文件与候选 YAML 完全相同。
这些检查不等于完整目录站点构建或商店安装验收。
提交目录变更前应先验证公开下载，再重新读取 PR head 和 upstream；如果 PR 已合并，
应从最新 upstream 更新现有条目，不能把本草案盲目应用到旧分支。

拟用 PR 标题：`Update Agent Mail to unified AI collaboration mailbox 0.2.1`。
拟用 PR 正文要点：

- 更新现有 Agent Mail 条目至单包 MCP + 邮箱 UI 0.2.1，不新增重复 UI 条目。
- 使用 GitHub Release 精确 tarball；提交时补上真实匿名下载摘要和安装验收结果。
- 需要独立 provider alpha.7；不提供自动唤醒或持续在线状态。
- 原 PR 检查失败绑定旧运行；报告更新后实际检查结果，不宣称此前失败已修复。

## 发布执行与发布后验收

下面保留原执行顺序；第 1–4 步已按后续授权完成，执行结果见顶部发布记录。
本仓工作流只有 `public-staging-ci`，tag push 不会自动创建 Release。
创建/推送 tag、发布 Release、更新目录和生产升级分别遵循 [AGENTS.md](../AGENTS.md) 的授权边界。

1. 重新读取远端目标和版本，确认拟用 tag 对象、上述 CI 与精确归档未变。
   若 tag 或 Release 已存在，先检查其对象、资产和摘要，不覆盖或重复创建。
2. 在拟用提交上创建 annotated tag 并推送该 tag。若改用其他提交，重新核对该提交的 CI 与九文件内容。
3. 创建非 draft、非 prerelease 的 GitHub Release，使用上述标题、正文、两个资产并设置 Latest。
   不上传原始日志、浏览器截图、私有配置或 provider 数据，也不复制 provider SBOM 来冒充本包证明。
4. 匿名下载新 Release 的 `SHA256SUMS` 和 tarball，校验摘要及九文件 allowlist。
   用下载的字节在全新隔离 DSH home 跑 web/headless 安装、移除和迁移门，确认一个 MCP 与一个 UI。
   将 `DSH_AGENT_MAIL_UNIFIED_TARBALL` 显式指向下载包；不得使用默认生产 wrapper/home。
5. 下载门通过后，记录 Release URL、tag 对象、摘要、安装结果与时间，再按目录授权应用草案。
   目录检查通过、PR 合并以及商店实际下载目标分别核对。
6. 生产升级使用下一节方案，在其独立授权窗口执行。发布不代表升级已经发生。

## 升级与回滚说明

本轮未读取生产邮箱或重新核查生产配置。既有生产记录为统一包 0.2.0 + provider alpha.7，
见 [0.2.0 生产验收](agent-mail-0.2.0-production-acceptance.md)。生产执行前须现场确认，不能从旧记录推定当前状态。

| 安装现状 | 后续授权升级方式 |
|---|---|
| 已用统一包 0.2.0 | 备份 DSH 配置并核实 provider/邮箱备份；将同一个统一包替换为 0.2.1，保持 provider、身份和连接配置 |
| 仍用旧 MCP + 独立 UI | 保存两个旧精确包与配置；先移除独立 UI，再安装统一 0.2.1，检查一个 MCP/一个 UI |
| 全新安装 | 在部署准备好独立 provider 后，只安装统一包；连接管理还需另配认证管理宿主 |

针对已统一的 0.2.0 基线，回滚只恢复先前 DSH/plugin 配置和下面的统一包；
不为回滚 UI 而覆盖已经产生新消息的邮箱，不重新配对或替换身份，不降级 provider。
旧两包部署则恢复其切换前保存的两包和配置，不能套用统一 0.2.0 的回滚假设。

| 回滚资产 | 已核实值 |
|---|---|
| 下载 | [dff652-dsh-agent-mail-0.2.0.tgz](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.0/dff652-dsh-agent-mail-0.2.0.tgz) |
| SHA-256 | `9d8b1f38b243f4d4c063d83c2b8ea784fa16f9a71afd36dc9c6df68618830bdf` |
| 本轮核验 | 匿名重新下载归档与 SHA256SUMS，摘要匹配；保存于忽略目录 `dist/releases/dsh-agent-mail-v0.2.0-rollback/` |

重启/回滚应作用于已核实的目标宿主。CLI 修改保存的 profile 不保证运行中服务热更新；
重启后再检查实际加载版本、MCP/API、浏览器历史与身份隔离。
详细备份方法见 [生产迁移与回滚 SOP](agent-mail-production-migration-plan.md)，其中旧版本表为历史。

## 当前交付状态

- [x] 拟发布版本、tag 对象、远端 CI、九文件和摘要已绑定。
- [x] 发布正文、SHA256SUMS、目录 YAML/patch 与回滚材料已准备。
- [x] 现有公开版本、provider、npm 名称与目录 PR 已只读复查。
- [x] 新材料本地提交和推送：`dfa0d5e`，Node 22/24 CI 通过。
- [x] 0.2.1 tag、GitHub Release、匿名下载与下载包安装验收：发布记录已归档。
- [x] 后续获授权的目录更新已推送；本地目录、完整站点检查及新提交 CI 全部通过。
- [ ] 目录合并及商店刷新验收，见目录交接记录。
- [ ] 生产现场核查、备份、升级及验收。

未勾选项属于后续转换，不是源码/隔离验收仍有缺口。npm 和独立 UI 发布未纳入本次发布提案。
