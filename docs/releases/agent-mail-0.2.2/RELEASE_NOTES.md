# Agent Mail 0.2.2 · DSH 0.2 兼容与邮箱视口修复

一个包包含 Agent Mail MCP 集成和邮箱 UI。此版本精确依赖 DSH `0.2.0-rc.2`，因此作为 GitHub 预发布提供；旧 DSH 主机应先完成运行时升级。

## 本次改进

- 适配 DSH 0.2 的客户端模块、右侧栏与 ToolRuntime 调用接口。
- 修复短侧栏中已发送计数可见、列表行被裁至零高度的问题；提供滚动路径、列表与详情最小视口，保留键盘调整和重置。
- 完成真实 Chrome/Firefox 的持久已发送记录与投递详情检查。投递回执、任务状态和详情中的处理结果分别显示；缺少任务关联证据时保留未知。
- 适配新宿主的失败激活检查：核对失败 loader 状态及未注册工具，宿主继续运行不代表插件激活成功。

## 兼容性与安装

- DSH：`0.2.0-rc.2`；精确 peer 为 `@deepseek-ai/dsh-mcp-client@0.2.0-rc.2`。
- Node：`^22.19.0 || >=24.0.0`；合同检查覆盖 22.19.0 和 24.19.0。
- Provider：独立安装的 [Agent Mail 1.0.0-alpha.7](https://github.com/dff652/agent-mail/releases/tag/v1.0.0-alpha.7)。插件不安装或升级 provider。
- 下载归档并按 SHA256SUMS 校验。在已升级、备份完成的 DSH 上使用 `dsh plugin --profile web add -w /absolute/path/to/dff652-dsh-agent-mail-0.2.2.tgz`；headless 使用对应 profile。
- 保持现有 provider、邮箱、身份与连接配置。旧 MCP + UI 两包部署先移除独立 UI，再安装统一包；不要同时安装兼容 UI 包。

## 验证与限制

118 项合同在两个 Node 版本通过；仓库公开边界、生成客户端和打包 allowlist 通过。相同摘要归档已完成隔离安装、激活、重连、重复命名空间拒绝、卸载、真实 alpha.7 合成消息生命周期以及 Chrome/Firefox 检查。详细边界见 [DSH 0.2 适配记录](https://github.com/dff652/deepseek-harness-community-plugins/blob/main/docs/dsh-0.2.0-rc.2-adaptation.md)。公开下载摘要、九文件绑定、下载字节的洁净 profile 安装/移除与跨版本迁移、真实隔离 provider 生命周期均已通过，详见 [发布验收记录](https://github.com/dff652/deepseek-harness-community-plugins/blob/main/docs/agent-mail-0.2.2-release.md)。

不自动唤醒模型，不提供持续在线状态或人类已读证明。超时不能证明发送未执行。详情缺少任务 ID 时不会从无法关联的事件推断任务完成。
DSH 上游 PWA manifest 的认证问题需要宿主侧修复，插件归档不包含该 HTML override。

## 校验与回退

```text
5f719a75220d5f192f24a74939d54d0e791ad8b4722fa3c124f807770b824e09  dff652-dsh-agent-mail-0.2.2.tgz
```

归档只有九个普通文件，不含 provider、凭据、消息或运行数据库。回退须同时恢复与旧插件匹配的 DSH 运行时及插件配置：0.2.1 对应旧 DSH `0.1.1-rc.2`，不能只在 DSH 0.2 上替换旧包。保留当前邮箱，不用旧备份覆盖升级后新增消息。npm 发布和线上来源切换单独决定。
