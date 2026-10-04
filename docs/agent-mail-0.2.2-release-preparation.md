# Agent Mail 0.2.2 发布准备

核对日期：2026-10-04。所有者已授权按顺序完成材料、提交/review、push、tag、GitHub Release、公开下载安装验收及目录更新。npm 发布和新的生产来源切换另行决定。

| 对象 | 值 |
|---|---|
| 包 | `@dff652/dsh-agent-mail@0.2.2`，统一 MCP 与邮箱 UI |
| Tag 目标提交 | `7cfab70c55a794d45711bb159d23ca7586f45cac`；九个归档文件逐字节匹配 |
| Annotated tag | `dsh-agent-mail-v0.2.2` |
| GitHub Release | 预发布；明确 DSH `0.2.0-rc.2` 兼容要求，不替换旧运行时稳定 Release 的 Latest 状态 |
| 正文 | [RELEASE_NOTES.md](releases/agent-mail-0.2.2/RELEASE_NOTES.md) |
| 资产 | `dff652-dsh-agent-mail-0.2.2.tgz` 与 [SHA256SUMS](releases/agent-mail-0.2.2/SHA256SUMS) |
| SHA-256 | `5f719a75220d5f192f24a74939d54d0e791ad8b4722fa3c124f807770b824e09` |
| DSH / MCP peer | 精确 `0.2.0-rc.2` |
| Provider | 独立安装 Agent Mail `1.0.0-alpha.7` |
| 源码 CI | [Node 22/24 检查通过](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/37207039810) |

## 归档绑定与执行门

沿用最终已验收归档，禁止重新打包替换上传字节。仅包含 LICENSE、NOTICE、README.md、client.js、cordis.patch.yml、index.js、package.json、ui-host.js、view.js 九个普通文件。生成一致性、118 项合同、公开边界、dry pack、隔离真实 provider 与浏览器证据见 [适配记录](dsh-0.2.0-rc.2-adaptation.md)。归档中准备阶段的 candidate 文案保留；渠道状态以 Release 和发布验收记录为准。

跨版本迁移门显式提供 `DSH_BIN`（新宿主）、`DSH_AGENT_MAIL_MIGRATION_DSH_BIN`（已审阅的旧宿主），以及三个 `DSH_AGENT_MAIL_*_TARBALL` 绝对路径。旧宿主先在另一个全新 profile 安装旧两包；新宿主拒绝直接安装旧 MCP 并恢复原配置。升级统一包后，不兼容旧 UI 在启动时被跳过；loader 中只有一个邮箱 UI，故意失败的 MCP 不注册工具。移除独立 UI 后复核统一配置。验收不使用 exact-version 风险豁免。

执行顺序：重跑必要本地门并独立审阅本次材料；提交/push 并核对 CI；创建/推送上述 tag；发布预发布 Release 的两个精确资产；匿名下载、摘要/allowlist/源码比较；在全新隔离 DSH profile 完成安装、移除与迁移门；通过后更新现有 catalog 条目并提交新的 PR，报告实际检查与合并状态。

## 目录草案

旧 [PR #4837](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4837) 已于 9 月 15 日合并。当前条目指向 0.2.1；新更新从最新 upstream main 开始。
[候选 YAML](releases/agent-mail-0.2.2/catalog-entry.yml) 与 [差异](releases/agent-mail-0.2.2/catalog-update.patch)只更新精确 tarball 与中英文兼容描述，保留名称、URL、分类，不新增重复 UI 条目或 npm 映射。提交时重新读取上游；不宣称 PR 提交等同公开目录已刷新。

## 安装与回退

安装前升级到经审阅的 DSH `0.2.0-rc.2`，备份 DSH 配置、运行时及一致的邮箱数据，并验证回退资产。已使用统一包的部署替换相同包；旧两包部署先移除独立 UI。provider、身份与连接参数保持原配置。

回退到 [0.2.1 Release](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.2.1) 时恢复对应旧 DSH `0.1.1-rc.2` 运行时与插件配置；旧归档 SHA-256 为 `6ab01c2d9a287cd991aa4380f0375d89b743101c86cb2ef71f2de6ae7c58fb23`。不得在 DSH 0.2 上只安装旧 exact-peer 包，也不得覆盖升级后新增消息。此次发布流程不触发新的生产操作。
