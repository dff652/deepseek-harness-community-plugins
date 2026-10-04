# Agent Mail 0.2.2 目录更新交接

2026-10-04，所有者授权顺序完成发布、公开下载验收和目录更新。0.2.2 为针对 DSH `0.2.0-rc.2` 的预发布；旧稳定 0.2.1 保留其匹配的旧 DSH 兼容范围。

状态核对日期：2026-10-05（Asia/Shanghai）。

## 目录变更

| 项目 | 值 |
|---|---|
| 新 PR | [#6577](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6577)，非 draft |
| Catalog head | `257c91910a4db6fdd259922560e28e6d44b092fb` |
| Upstream base | `bb8496ec4cbb9217b33bf081ec4cdf06b51501e8`，提交前再次核对 |
| 条目 | `data/plugins/dff652__deepseek-harness-community-plugins--packages-dsh-agent-mail.yml` |
| 下载目标 | [0.2.2 精确归档](https://github.com/dff652/deepseek-harness-community-plugins/releases/download/dsh-agent-mail-v0.2.2/dff652-dsh-agent-mail-0.2.2.tgz) |
| SHA-256 | `5f719a75220d5f192f24a74939d54d0e791ad8b4722fa3c124f807770b824e09` |

远端 PR 确认只修改同一个 YAML，三行增加/三行删除：中英文描述明确 DSH `0.2.0-rc.2` 要求，tarball 指向 0.2.2。保留 URL、名称与分类，不新增独立 UI 条目或 npm 映射。旧 PR #4837 已于 9 月 15 日合并，本次从最新上游主线提交新的更新 PR。

## 验证

[公开下载验收](agent-mail-0.2.2-release.md)先于目录提交完成：HTTP 200、摘要和九文件绑定、下载字节洁净安装/移除、跨版本旧两包迁移及真实隔离 provider 生命周期全部通过。

本地目录原生校验、18 项 added-date/capability/discussion 回归、README 生成与一致性检查、awesome-lint 全部通过；lint 复现上游仓库元数据上下文，保留既有警告。完整站点构建生成 4,412 条目的双语页面、sitemap 和 count badge。生成目录只包含一个 Agent Mail 条目，npm 为 null，tarball 与安装命令均指向精确 0.2.2 URL。

生成 README 仅用于验证并恢复；PR 只提交既有 YAML。上游合并后由其工作流生成 README。

远端 [PR check](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/37214917018)的所有步骤及 Submission gate 均已完成并通过，结果绑定完整 head `257c91910a4db6fdd259922560e28e6d44b092fb`。远端同步通过 README/lint、18 项回归和完整站点构建；两个实际 check run 均为 completed/success。

## 合并与来源边界

PR 当前 OPEN、未合并，`mergeable: true`、`mergeable_state: clean`；上游 main 的既有 YAML 仍指向 0.2.1。当前账号无上游写权限，合并取决于维护者。提交 PR、CI 通过、上游合并和公开目录刷新是不同结果。

合并后应重新读取公开目录及现场市场解析的下载目标，再决定生产来源切换。此包仍是 GitHub Release 渠道；没有 npm 发布，不把此次目录更新当作未来自动更新提示的保证。当前已有部署不因本次发布和目录 PR 自动切换来源。
