# OCfg

OpenCode 配置编辑器。

## 功能特性

- 使用 `doctor` 检查配置健康状态。
- 使用 `validate` 按 OpenCode schema 验证配置。
- 通过面向协议的端点模板添加提供商。
- 编辑提供商名称、通道类型、基础 URL、API key 文件引用和 `setCacheKey`。
- 编辑模型显示名称、限制和常见能力标记。
- 在现有提供商下添加或删除模型。
- 删除提供商时检查顶层默认引用。
- 在 TUI 中设置或清除顶层 `model` 和 `small_model`。
- 安装、启用和禁用 OpenCode npm 插件与本地插件文件。
- 管理 OpenCode 提示词/规则文件，覆盖 `AGENTS.md`、顶层 `instructions` 和单个 agent 的 `agent.<id>.prompt`。
- 尽可能保留编辑路径之外的 JSONC 注释。
- 写入时执行验证、备份创建和原子重命名。

## 安装

发布后安装包：

```bash
npm install -g ocfg
```

从源码检出运行：

```bash
npm install
npm run build
node dist/cli.js --help
```

包的可执行命令名为 `ocfg`。

## 快速开始

打开交互式终端 UI：

```bash
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

添加一个使用托管密钥文件的提供商：

```bash
ocfg add provider custom \
  --channel-type openai-compatible \
  --base-url https://example.com/v1 \
  --api-key sk-example \
  --model example-model
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

预览写入内容而不修改文件：

```bash
ocfg add provider custom \
  --channel-type openai-compatible \
  --base-url https://example.com/v1 \
  --api-key sk-example \
  --model example-model \
  --dry-run
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
  [--dry-run]
```

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
  [--output <tokens>] \
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
- `Add Provider` 通过端点类型、提供商元数据、密钥文件存储、模型检测或手动模型输入、能力审查和 diff 审查来创建提供商。
- `Edit Provider` 选择现有提供商，编辑提供商字段，并可进入模型管理。
- `Manage Plugins` 列出 npm 和本地插件，把 npm 包写入配置，把本地文件安装到 OpenCode 插件目录，编辑 npm 选项 JSON，并切换本地插件文件启用状态。
- `Manage Prompts` 列出并编辑 `AGENTS.md`、可复用 `AGENTS.md` 配置、已配置的 `instructions`、提示词文件和内置默认模板；可创建/编辑/切换/删除 `AGENTS.md` 配置，切换覆盖前会确认并自动保留旧的当前规则，创建、编辑、替换和删除当前 `AGENTS.md`，添加自定义提示词文件，用支持方向键移动和自动换行的多行编辑器编辑内容，作为全局指令使用，或应用到 `build`、`plan` 及自定义 agent。
- `Delete Provider` 选择现有提供商，并对被引用的提供商要求额外确认。
- `Set Default Model` 使用现有 provider/model 引用设置或清除顶层 `model` 和 `small_model`。
- `Switch Config Target` 在写入前切换全局和项目配置目标。

会修改配置的 TUI 流程会在写入前显示 diff，并要求明确确认。本地插件安装会报告受影响的文件路径；启用/禁用结果直接体现在插件列表状态中。

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

TUI 写入会显示 diff，并要求明确确认后才写入。

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
