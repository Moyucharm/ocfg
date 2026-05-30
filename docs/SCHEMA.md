# OpenCode Provider Configuration Schema Notes

This file documents the exact OpenCode config structures that OCfg must generate.

## Config Targets

Global target, default for this tool:

```text
~/.config/opencode/opencode.jsonc
```

Project target, available by explicit user selection:

```text
opencode.jsonc
```

OpenCode supports JSON and JSONC. The editor should prefer JSONC for newly created files because comments are useful for user-managed config.

## Top-Level Fields Used By This Tool

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {},
  "plugin": ["opencode-wakatime", ["@my-org/custom-plugin", {}]],
  "model": "provider_id/model_id",
  "small_model": "provider_id/model_id"
}
```

`model` and `small_model` are optional. When present, they must reference an existing provider and model.

`plugin` is optional. It stores npm plugin packages as strings, or package/options tuples of the form `[packageName, optionsObject]`.

## Provider Shape

```jsonc
{
  "provider": {
    "provider-id": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Display Name",
      "options": {
        "baseURL": "https://example.com/v1",
        "apiKey": "{env:EXAMPLE_API_KEY}",
        "setCacheKey": true,
        "timeout": 600000,
        "headers": {
          "X-Custom-Header": "value"
        }
      },
      "models": {
        "model-id": {}
      }
    }
  }
}
```

Known provider fields:

- `api`
- `name`
- `env`
- `id`
- `npm`
- `whitelist`
- `blacklist`
- `options`
- `models`

Known provider option fields:

- `apiKey`
- `baseURL`
- `enterpriseUrl`
- `setCacheKey`
- `timeout`
- `chunkTimeout`

`options` can contain additional provider-specific values.

## Model Shape

```jsonc
{
  "name": "Model Display Name",
  "limit": {
    "context": 200000,
    "output": 64000
  },
  "modalities": {
    "input": ["text", "image", "pdf"],
    "output": ["text"]
  },
  "attachment": true,
  "reasoning": true,
  "temperature": true,
  "tool_call": true,
  "options": {},
  "variants": {}
}
```

Known model fields:

- `id`
- `name`
- `family`
- `release_date`
- `attachment`
- `reasoning`
- `temperature`
- `tool_call`
- `interleaved`
- `cost`
- `limit`
- `modalities`
- `experimental`
- `status`
- `provider`
- `options`
- `headers`
- `variants`

Do not generate unknown top-level model fields.

## Plugin Shape

OpenCode npm plugins are configured through the top-level `plugin` array:

```jsonc
{
  "plugin": [
    "opencode-wakatime",
    ["@my-org/custom-plugin", { "enabled": true }]
  ]
}
```

OCfg must preserve existing tuple options when listing or deleting by package name. Adding a plugin without options should use the compact string form. Adding or editing plugin options should use the `[package, options]` tuple form.

Local plugins are loaded by OpenCode from plugin directories rather than the top-level config array:

```text
~/.config/opencode/plugins/
.opencode/plugins/
```

OCfg installs local plugins by copying `.js`, `.mjs`, `.cjs`, or `.ts` files into the target plugin directory. It disables local plugins by appending `.disabled` to the file name, and enables them by removing that suffix.

## Endpoint Templates

### OpenAI-Compatible Chat Completions

Use for endpoints compatible with `/v1/chat/completions`.

Recommended provider:

```jsonc
{
  "npm": "@ai-sdk/openai-compatible",
  "options": {
    "baseURL": "https://example.com/v1",
    "apiKey": "{env:CUSTOM_OPENAI_API_KEY}",
    "setCacheKey": true
  }
}
```

Probe strategy:

```text
GET {baseURL}/models
```

Unknown model fallback:

```jsonc
{
  "name": "Custom Model"
}
```

Unknown compatible models intentionally omit `limit` and capability flags instead of guessing. Add `limit`, `reasoning`, `tool_call`, `temperature`, modalities, or variants only from a models.dev suffix match or explicit user input. The lookup scans all models.dev providers regardless of channel type and uses the first matching model name suffix. Future/custom aliases such as `gpt5.5-*` must not be mapped to GPT-5 limits unless metadata confirms that exact model name. CLI and TUI flows surface a warning when metadata is missing.

### OpenAI Responses

Use for endpoints using OpenAI Responses API semantics.

Recommended provider:

```jsonc
{
  "npm": "@ai-sdk/openai",
  "options": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "{env:OPENAI_API_KEY}"
  }
}
```

OpenAI provider often has special cache behavior in OpenCode. Do not force extra cache options unless the user is configuring a custom compatible endpoint and explicitly asks for it.

### Claude-Compatible Anthropic Messages

Use for endpoints compatible with Anthropic Messages API.

Recommended provider:

```jsonc
{
  "npm": "@ai-sdk/anthropic",
  "options": {
    "baseURL": "https://example.com/v1",
    "apiKey": "{env:CUSTOM_CLAUDE_API_KEY}",
    "setCacheKey": true
  }
}
```

Claude-like model example:

```jsonc
{
  "name": "Claude Sonnet Compatible",
  "limit": {
    "context": 200000,
    "output": 64000
  },
  "modalities": {
    "input": ["text", "image", "pdf"],
    "output": ["text"]
  },
  "attachment": true,
  "reasoning": true,
  "temperature": true,
  "tool_call": true,
  "options": {
    "thinking": {
      "type": "enabled",
      "budgetTokens": 16000
    }
  }
}
```

### Gemini-Compatible / Google Generative AI

Use for Google native Gemini endpoints or compatible endpoints that expect Google AI SDK behavior.

Recommended provider:

```jsonc
{
  "npm": "@ai-sdk/google",
  "options": {
    "apiKey": "{env:GOOGLE_GENERATIVE_AI_API_KEY}"
  }
}
```

Gemini-like model example:

```jsonc
{
  "name": "Gemini Compatible",
  "limit": {
    "context": 1000000,
    "output": 65536
  },
  "modalities": {
    "input": ["text", "image", "pdf", "audio", "video"],
    "output": ["text"]
  },
  "attachment": true,
  "reasoning": true,
  "temperature": true,
  "tool_call": true
}
```

If the user is configuring a Gemini model through an OpenAI-compatible proxy, use the OpenAI-compatible template and Gemini model capabilities. Warn that provider-specific Gemini options may not work through the proxy.

## Secret Rendering

Environment variable reference:

```jsonc
"apiKey": "{env:PROVIDER_API_KEY}"
```

File reference:

```jsonc
"apiKey": "{file:~/.secrets/provider-api-key}"
```

Plaintext keys must require explicit advanced confirmation and should produce a doctor warning.

## Valid Generated Examples

### OpenAI-Compatible Example

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "custom-openai": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Custom OpenAI Compatible",
      "options": {
        "baseURL": "https://example.com/v1",
        "apiKey": "{env:CUSTOM_OPENAI_API_KEY}",
        "setCacheKey": true
      },
      "models": {
        "gpt-5": {
          "name": "GPT Compatible",
          "limit": {
            "context": 400000,
            "output": 128000
          },
          "modalities": {
            "input": ["text"],
            "output": ["text"]
          },
          "attachment": true,
          "reasoning": true,
          "tool_call": true,
          "temperature": false
        }
      }
    }
  },
  "model": "custom-openai/gpt-5"
}
```

### Claude-Compatible Example

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "custom-claude": {
      "npm": "@ai-sdk/anthropic",
      "name": "Custom Claude Compatible",
      "options": {
        "baseURL": "https://example.com/v1",
        "apiKey": "{env:CUSTOM_CLAUDE_API_KEY}",
        "setCacheKey": true
      },
      "models": {
        "claude-sonnet-compatible": {
          "name": "Claude Sonnet Compatible",
          "limit": {
            "context": 200000,
            "output": 64000
          },
          "modalities": {
            "input": ["text", "image", "pdf"],
            "output": ["text"]
          },
          "attachment": true,
          "reasoning": true,
          "temperature": true,
          "tool_call": true
        }
      }
    }
  }
}
```
