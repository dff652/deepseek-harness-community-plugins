# Agent Mail 0.2.2 发布与公开下载验收

2026-10-04 完成授权的 GitHub 预发布和公开下载包验收。目录更新已提交为新 PR；其检查与合并状态见 [目录交接](agent-mail-0.2.2-catalog-handoff.md)。npm 和新的生产操作单独决定。

## 发布对象

| 项目 | 实际结果 |
|---|---|
| 包 | `@dff652/dsh-agent-mail@0.2.2`，统一 MCP 与邮箱 UI |
| Release | [Agent Mail 0.2.2](https://github.com/dff652/deepseek-harness-community-plugins/releases/tag/dsh-agent-mail-v0.2.2)，非 draft、预发布 |
| 发布时间 | `2026-10-04T15:50:39Z` |
| Annotated tag | `dsh-agent-mail-v0.2.2`，对象 `54843b8612ec4130d192d39258bb7a48c15f73a3` |
| Tag 解引用提交 | `7cfab70c55a794d45711bb159d23ca7586f45cac` |
| 材料与迁移门提交 | `b202f1623b6e1f324c784a09b821fc6ab13f8aa0`，已推送 |
| Tarball | [dff652-dsh-agent-mail-0.2.2.tgz](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.2/dff652-dsh-agent-mail-0.2.2.tgz)，48,644 bytes |
| SHA-256 | `5f719a75220d5f192f24a74939d54d0e791ad8b4722fa3c124f807770b824e09` |
| 校验文件 | [SHA256SUMS](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.2/SHA256SUMS) |
| DSH / peer | 精确 `0.2.0-rc.2` |
| Stable Latest | 保持 [0.2.1](agent-mail-0.2.1-release.md)，对应旧 DSH `0.1.1-rc.2` |

只有两个 Release 资产。GitHub API 中的资产大小与 digest 均与上传字节一致；annotated tag 的远端对象及解引用提交已核对。归档沿用已验收的最终候选，不重新打包；九个文件逐字节匹配 tag 源码和材料提交。包内 README 的 candidate 文案保留，公开渠道状态以本记录及 GitHub Release 为准。

## 公开下载与安装

匿名下载未携带认证，并禁用本地 curl 配置。tarball 和 SHA256SUMS 均为 HTTP 200；校验文件、实际摘要、上传资产和已验收归档完全一致。归档只有 LICENSE、NOTICE、README.md、client.js、cordis.patch.yml、index.js、package.json、ui-host.js、view.js 九个普通文件，不含 provider、凭据、消息或运行数据库。

直接使用下载的字节完成以下门：

- 全新隔离 web/headless profile 安装、移除；统一配置恰好包含一个 MCP 和一个邮箱 UI。
- 已审阅旧 DSH 在另一个全新 profile 安装历史 MCP + UI 两包，再用新宿主升级统一包。旧 MCP 的不兼容安装被拒绝且恢复原配置；不兼容独立 UI 在启动时被跳过，loader 中只有一个邮箱 UI。移除独立 UI 后复核统一配置。
- 故意失败的 MCP loader 行及零工具注册、真实隔离 alpha.7 provider 的缺失行、重复 namespace、重连、清理和安装/移除生命周期。

下载字节验收完成于 `2026-10-04T15:52:34.888172+00:00`。所有测试使用显式受控宿主、临时 profile 和合成 provider 数据；没有使用生产默认 wrapper，也没有 exact-version 风险豁免。Chrome/Firefox 复用相同 SHA 的 [既有适配验收](dsh-0.2.0-rc.2-adaptation.md)，本次公开下载门不冒充重跑完整浏览器矩阵。

## CI 与复核

独立预发布 review 通过：两个 Node 版本各 118 项合同、公开边界、生成客户端、dry pack、归档绑定、迁移与真实 provider 生命周期均通过。
[材料 CI](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/37214343038)绑定 `b202f16`，
[tag CI](https://github.com/dff652/deepseek-harness-community-plugins/actions/runs/37214466378)绑定 `7cfab70`，两个 Node job 的所有步骤通过。主线为所有者授权的正常快进推送，初始 required checks 尚待运行时使用了已有 owner bypass；本流程未修改规则，随后精确提交的检查全部通过。

## 安装、回退与目录

插件运行时为 Node `^22.19.0 || >=24.0.0`，provider 仍由独立安装的 [Agent Mail alpha.7](https://github.com/dff652/agent-mail/releases/tag/v1.0.0-alpha.7)提供。DSH 运行时应先升级至目标版本，再安装统一包；保持邮箱、身份与连接配置，移除旧独立 UI。

[0.2.1 回退归档](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.1/dff652-dsh-agent-mail-0.2.1.tgz)已匿名下载核对 SHA-256 `6ab01c2d9a287cd991aa4380f0375d89b743101c86cb2ef71f2de6ae7c58fb23`。回退须恢复匹配的旧 DSH 运行时及插件配置；保持当前邮箱，不用旧备份覆盖升级后的新增消息。DSH 上游 PWA manifest 的认证修复属于宿主 HTML override，归档不包含该修复。

目录 [PR #6577](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6577)仅更新既有条目；上游合并及公开目录刷新分别核对。本轮没有 npm、独立 UI 或 provider 发布，也没有新的生产来源切换。
