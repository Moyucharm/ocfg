import { describe, expect, test } from "vitest"
import { channelTypeOptions } from "../src/core/channel-types.js"
import { chineseText, englishText, nextTuiLanguage, translate, type TuiTextKey } from "../src/tui/i18n.js"

describe("TUI i18n", () => {
  test("keeps English and Chinese dictionaries in sync", () => {
    expect(Object.keys(chineseText).sort()).toEqual(Object.keys(englishText).sort())
  })

  test("interpolates translated messages", () => {
    expect(translate("en", "provider.count", { count: 3 })).toBe("3 models")
    expect(translate("zh-CN", "provider.count", { count: 3 })).toBe("3 个模型")
  })

  test("has concrete text for every key", () => {
    for (const key of Object.keys(englishText) as TuiTextKey[]) {
      expect(translate("en", key)).not.toBe("")
      expect(translate("zh-CN", key)).not.toBe("")
    }
  })

  test("leaves endpoint type labels as canonical English labels", () => {
    expect(channelTypeOptions.map((option) => option.label)).toEqual([
      "OpenAI compatible",
      "OpenAI Responses",
      "Anthropic compatible",
      "Gemini compatible",
    ])
  })

  test("toggles between supported TUI languages", () => {
    expect(nextTuiLanguage("en")).toBe("zh-CN")
    expect(nextTuiLanguage("zh-CN")).toBe("en")
  })
})
