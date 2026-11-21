import { describe, expect, it } from "vitest";
import { intlLocale, isLocale, localeFromHeaders, negotiateLocale } from "./locales";
import { createTranslator, msg, placeholders, translate } from "./translate";

describe("translate", () => {
  const zh = { Connect: "连接", "{count} positions": "{count} 个头寸", "{a} of {b}": "{b} 中的 {a}" };

  it("returns the translation, or the English key when there is none", () => {
    expect(translate(zh, "Connect")).toBe("连接");
    expect(translate(zh, "Not translated")).toBe("Not translated");
    expect(translate(null, "Connect")).toBe("Connect");
  });

  it("fills placeholders by name, wherever the translation puts them", () => {
    expect(translate(zh, "{count} positions", { count: 3 })).toBe("3 个头寸");
    expect(translate(zh, "{a} of {b}", { a: 1, b: 4 })).toBe("4 中的 1");
    expect(translate(null, "{a} of {b}", { a: 1, b: 4 })).toBe("1 of 4");
  });

  it("leaves a placeholder it has no value for", () => {
    expect(translate(null, "Hello {name}", {})).toBe("Hello {name}");
  });

  it("does not read inherited properties as values", () => {
    expect(translate(null, "{constructor}", {})).toBe("{constructor}");
  });

  it("carries its locale for the formatters", () => {
    expect(createTranslator("zh-CN", zh).locale).toBe("zh-CN");
  });

  it("lists placeholders in order", () => {
    expect(placeholders("{a} then {b}")).toEqual(["a", "b"]);
  });

  it("msg returns its argument", () => {
    expect(msg("Portfolio")).toBe("Portfolio");
  });
});

describe("negotiateLocale", () => {
  it("serves Simplified Chinese to any Chinese browser", () => {
    expect(negotiateLocale("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
    expect(negotiateLocale("zh")).toBe("zh-CN");
    expect(negotiateLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(negotiateLocale("zh-TW")).toBe("zh-CN");
  });

  it("follows q order, not header order", () => {
    expect(negotiateLocale("en;q=0.5,zh-CN;q=0.9")).toBe("zh-CN");
    expect(negotiateLocale("zh-CN;q=0.4,en-US;q=0.8")).toBe("en");
  });

  it("falls back to English", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
    expect(negotiateLocale("fr-FR,de;q=0.8")).toBe("en");
    expect(negotiateLocale("zh;q=0")).toBe("en");
  });

  it("accepts only known locales from the cookie", () => {
    expect(isLocale("zh-CN")).toBe(true);
    expect(isLocale("zh")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("formats dates day-first in English and in Chinese order in Chinese", () => {
    expect(intlLocale("en")).toBe("en-GB");
    expect(intlLocale("zh-CN")).toBe("zh-CN");
  });
});

describe("localeFromHeaders", () => {
  it("prefers the visitor's chosen locale to the browser's", () => {
    expect(localeFromHeaders("a=1; elyra-locale=en; b=2", "zh-CN")).toBe("en");
    expect(localeFromHeaders("elyra-locale=zh-CN", "en-US")).toBe("zh-CN");
  });

  it("falls back to Accept-Language, ignoring an unknown cookie value", () => {
    expect(localeFromHeaders("elyra-locale=fr", "zh-CN,zh;q=0.9")).toBe("zh-CN");
    expect(localeFromHeaders(null, null)).toBe("en");
  });
});
