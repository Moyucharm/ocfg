# OCfg

`ocfg` 是用于编辑 OpenCode 配置的 CLI 和终端 TUI。

它聚焦日常 OpenCode 配置工作：添加渠道、审查模型、管理插件、切换提示词/规则、设置默认模型，以及在不手动重写 `opencode.jsonc` 的情况下运行诊断。

[English README](./README.md)

## 功能特性

- 使用 `doctor` 和 `validate` 诊断并验证 OpenCode 配置。
- 通过面向协议的端点类型添加、编辑或删除渠道，API key 写入托管密钥文件，并在写入前执行 schema 验证和 Diff 审查。
- 从兼容端点检测模型，或手动输入模型 ID，然后审查上下文/输入/输出限制、GPT-5 长上下文 preset 和常见能力标记。
- 安装、启用、禁用、编辑和移除 OpenCode npm 插件与本地插件文件。
- 管理 `AGENTS.md`、顶层 `instructions` 和单个 agent 的 `agent.<id>.prompt` 对应的提示词/规则文件。
- 在 TUI 中设置或清除顶层 `model` 和 `small_model`。
- 在 TUI 小工具中切换 OpenCode Exa `websearch`/`webfetch` 支持。
- 尽可能保留 JSONC 注释，并通过验证、备份和原子重命名完成写入。

## 发布状态

npm 包名是 `ocfg`，当前项目准备发布 npm `v0.1.0`。

运行要求：Node.js `>=20`。

## 安装

发布到 npm 后：

```bash
npm install -g ocfg
```

包的可执行命令名为 `ocfg`。

npm 发布前可以从源码检出运行：

```bash
npm install
npm run build
node dist/cli.js --help
```

## 快速开始

打开交互式终端 UI。直接运行 `ocfg` 与运行 `ocfg tui` 一样，都会进入 TUI：

```bash
ocfg
ocfg tui
```

检查当前全局 OpenCode 配置：

```bash
ocfg doctor
```

验证当前全局 OpenCode 配置：

```bash
ocfg validate
```

添加一个使用托管 API key 文件的渠道：

```bash
ocfg add provider custom \
  --channel-type openai-compatible \
  --base-url https://example.com/v1 \
  --api-key sk-example \
  --model example-model
```

预览写入内容而不修改文件：

```bash
ocfg add provider custom \
  --channel-type openai-compatible \
  --base-url https://example.com/v1 \
  --api-key sk-example \
  --model example-model \
  --dry-run
```

安装一个 OpenCode npm 插件：

```bash
ocfg install plugin opencode-wakatime
```

安装一个本地插件文件：

```bash
ocfg install plugin ./my-plugin.ts --local --config-scope project
```

安装默认提示词模板作为所选 `AGENTS.md` 规则文件：

```bash
ocfg switch prompt build-focused --rules
```

## 配置目标

默认情况下，命令会操作全局 OpenCode 配置：

```text
~/.config/opencode/opencode.jsonc
```

使用项目作用域来操作项目级配置：

```bash
ocfg doctor --config-scope project
```

需要时也可以显式指定配置文件路径：

```bash
ocfg validate --config-path ./opencode.jsonc
```

新的配置文件只会在确认写入或非 dry-run 写入期间创建。读取和 dry run 不会创建配置文件。

## 端点类型

创建提供商时使用面向协议的端点类型：

- `openai-compatible`
- `openai-responses`
- `anthropic-compatible`
- `gemini-compatible`

模板会提供推荐的提供商包、端点行为、探测支持和模型能力默认值。商业代理名称不会被当作模板处理。

## CLI 命令

Doctor：

```bash
ocfg doctor [--config-scope global|project] [--config-path path] [--json]
```

Validate：

```bash
ocfg validate [--config-scope global|project] [--config-path path] [--json]
```

添加提供商：

```bash
ocfg add provider <provider-id> \
  --channel-type <kind> \
  --api-key <value> \
  --model <id> \
  [--name <name>] \
  [--base-url <url>] \
  [--gpt-5-long-context] \
  [--dry-run]
```

受支持的 OpenAI GPT-5.4/5.5 长上下文模型默认使用更省额度的 `400000/272000/128000` 上下文/输入/输出 preset。使用 `--gpt-5-long-context` 可切换到 OpenAI API 1M 上下文 preset，即 `1050000/922000/128000`。

编辑提供商：

```bash
ocfg edit provider <provider-id> \
  [--name <name>] \
  [--channel-type <kind>] \
  [--base-url <url>] \
  [--api-key <value>] \
  [--set-cache-key] \
  [--dry-run]
```

编辑模型：

```bash
ocfg edit model <provider-id/model-id> \
  [--name <name>] \
  [--context <tokens>] \
  [--input <tokens>] \
  [--output <tokens>] \
  [--gpt-5-long-context | --no-gpt-5-long-context] \
  [--reasoning] \
  [--tool-call] \
  [--temperature] \
  [--dry-run]
```

删除提供商：

```bash
ocfg delete provider <provider-id> [--confirm-token <token>] [--dry-run]
```

删除模型：

```bash
ocfg delete model <provider-id/model-id> [--confirm-token <token>] [--dry-run]
```

列出已配置插件：

```bash
ocfg list plugins [--config-scope global|project] [--config-path path] [--json]
```

安装或启用 npm 插件：

```bash
ocfg install plugin <package-name> [--options-json <json>] [--dry-run]
ocfg enable plugin <package-name> [--options-json <json>] [--dry-run]
```

安装本地插件文件：

```bash
ocfg install plugin <path-to-js-or-ts-file> --local [--as <filename>] [--config-scope global|project] [--dry-run]
```

禁用或启用本地插件文件：

```bash
ocfg disable plugin <filename-or-name> --local [--config-scope global|project] [--dry-run]
ocfg enable plugin <filename-or-name> --local [--config-scope global|project] [--dry-run]
```

使用旧别名添加插件：

```bash
ocfg add plugin <package-name> [--options-json <json>] [--dry-run]
```

编辑插件：

```bash
ocfg edit plugin <package-name> [--options-json <json> | --clear-options] [--dry-run]
```

禁用或删除 npm 插件：

```bash
ocfg disable plugin <package-name> [--dry-run]
ocfg delete plugin <package-name> [--dry-run]
```

列出 AGENTS.md 规则、已配置 instructions、提示词文件和内置提示词模板：

```bash
ocfg list prompts [--config-scope global|project] [--config-path path] [--json]
```

添加、编辑、切换或删除提示词文件：

```bash
ocfg add prompt <name> [--content <text> | --content-file <path> | --template <id>] [--global-instructions | --agent <agent-id>] [--dry-run]
ocfg edit prompt <name> (--content <text> | --content-file <path>) [--dry-run]
ocfg switch prompt <name-or-template-id> (--rules | --global-instructions | --agent <agent-id>) [--dry-run]
ocfg delete prompt <name> [--dry-run]
```

编辑或移除 OpenCode 规则/指令条目：

```bash
ocfg add rules (--content <text> | --content-file <path>) [--config-scope global|project] [--dry-run]
ocfg edit rules (--content <text> | --content-file <path>) [--config-scope global|project] [--dry-run]
ocfg delete rules [--config-scope global|project] [--dry-run]
ocfg delete instruction <ref> [--dry-run]
```

管理可复用的 `AGENTS.md` 配置：

```bash
ocfg add rules-config <name> [--content <text> | --content-file <path>] [--dry-run]
ocfg edit rules-config <name> (--content <text> | --content-file <path>) [--dry-run]
ocfg switch rules-config <name> [--dry-run]
ocfg delete rules-config <name> [--dry-run]
```

OpenCode 使用 `AGENTS.md` 作为全局/项目规则，使用 `instructions` 追加可复用规则文件，使用 `agent.<id>.prompt` 管理单个 agent 的 system prompt。ocfg 自己管理的提示词文件会存放在 `~/.config/ocfg/prompts/`，可复用 `AGENTS.md` 配置会存放在 `~/.config/ocfg/agents/`；OpenCode 配置里只写入指向这些 ocfg 文件的引用。`--rules` 会替换所选 `AGENTS.md`，`--global-instructions` 会把 ocfg 提示词文件路径写入 `instructions`，agent 切换会把 ocfg 提示词文件引用写入 `agent.<id>.prompt`。

替换或删除已有 `AGENTS.md` 时会把带时间戳的备份放在 `~/.config/ocfg/backups/agents/`；如果当前规则尚未存在于可复用配置库，还会保存到 `~/.config/ocfg/agents/previous-agents-*.md`，方便之后切回。

当替换 `AGENTS.md` 且当前规则尚未保存在 `~/.config/ocfg/agents/` 时，TUI 会先显示覆盖风险确认。CLI 命令会在继续执行前打印同样的风险提示，并说明可切换副本和 `AGENTS.md.bak.*` 备份的位置。

打开 TUI：

```bash
ocfg tui
```

被引用对象的删除需要精确的确认令牌。例如，当提供商 `custom` 被 `model` 或 `small_model` 引用时，删除它需要 `--confirm-token delete:custom`。

## TUI 流程

使用 `ocfg tui` 打开 TUI。

- `Doctor` 显示可执行的配置诊断信息。
- `添加渠道` 通过端点类型、渠道元数据、密钥文件存储、模型检测或手动模型输入、能力审查和 Diff 审查来创建渠道。
- `Edit Provider` 选择现有提供商，编辑提供商字段，可进入模型管理，也可在二次确认后删除所选提供商。
- `Manage Plugins` 列出 npm 和本地插件，把 npm 包写入配置，把本地文件安装到 OpenCode 插件目录，编辑 npm 选项 JSON，并切换本地插件文件启用状态。
- `Manage Prompts` 先分为 `通用规则（AGENTS.md）` 和 `智能体提示词（agent.prompt）`。通用规则列出并编辑当前 `AGENTS.md`、可复用 `AGENTS.md` 配置和已配置的 `instructions`；可创建/编辑/切换/删除 `AGENTS.md` 配置，切换覆盖前会确认并自动保留旧的当前规则。智能体提示词列出提示词文件和内置模板，用支持方向键移动和自动换行的多行编辑器编辑内容，并且只应用到 `build`、`plan` 或自定义 Agent。
- `Set Default Model` 使用现有 provider/model 引用设置或清除顶层 `model` 和 `small_model`。
- `Tools` 包含 OpenCode Exa 搜索开关。开启会把 `permission.websearch = "allow"` 和 `permission.webfetch = "allow"` 写入当前选择的全局或项目配置，然后设置当前用户的 `OPENCODE_ENABLE_EXA=1`。关闭只设置 `OPENCODE_ENABLE_EXA=0`，不会改动配置。
- `Switch Config Target` 在写入前切换全局和项目配置目标。

大多数会修改配置的 TUI 流程会在写入前显示 Diff，并要求明确确认。Exa 搜索工具按设计是一键开关：它会立即写入，修改所选 OpenCode 配置时仍会创建常规备份，并且只更新当前用户的环境变量。本地插件安装会报告受影响的文件路径；启用/禁用结果直接体现在插件列表状态中。

Exa 搜索的环境变量变更在 Windows 上使用用户级 `setx`，不需要管理员权限。macOS/Linux 会先复用 `~/.bashrc`、`~/.zshrc` 或 `~/.profile` 里已有的 ocfg Exa 管理块；如果不存在，ocfg 才会按当前 shell 选择一个配置文件写入。请关闭并重新打开当前终端，或打开新的终端窗口，然后再启动 OpenCode。

## 密钥处理

默认 API key 路径会把密钥值写入托管文件，而不是以明文形式写入 OpenCode provider 块。

托管密钥文件使用以下默认位置模式：

```text
~/.config/ocfg/secrets/<provider-id>.api-key
```

OpenCode 配置会存储类似这样的文件引用：

```jsonc
"apiKey": "{file:~/.config/ocfg/secrets/custom.api-key}"
```

该工具会创建权限为 `0700` 的托管密钥目录，并在操作系统支持时创建权限为 `0600` 的密钥文件。

CLI `--api-key` 值在某些系统上仍可能被 shell 历史记录或进程检查记录。请使用可信的 shell 环境，并轮换任何可能已暴露的密钥。

## 写入安全

修改性写入会在写入前验证完整的新配置。

TUI 写入通常会显示 diff，并要求明确确认后才写入。Exa 搜索小工具是一键开关例外。

CLI 写入支持 `--dry-run`，用于打印计划中的 diff 并执行验证，不会创建、修改或删除文件。

真实写入会在目标文件已存在时，在同目录创建带时间戳的备份。

真实写入会经过临时文件和原子重命名。

如果验证失败，配置文件不会被写入。如果托管密钥文件在失败写入过程中被更新，工具会尝试恢复其先前状态。

## 开发

运行检查：

```bash
npm run typecheck
npm test
npm run build
```

运行构建后的 CLI 帮助：

```bash
node dist/cli.js --help
```

## 友情链接
[LINUX DO](https://linux.do/) 论坛为本项目提供了社区支持。关注LD喵，关注LD谢谢喵。

专注 Claude Code 配置编辑的 [zcf](https://github.com/UfoMiao/zcf) 和优秀的 GUI OpenCode 配置编辑器 [AI Toolbox](https://github.com/coulsontl/ai-toolbox) 为本项目的实现提供了灵感，在此感谢这些项目的开发者和贡献者。 