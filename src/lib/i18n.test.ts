import { describe, it, expect } from "vitest";
import { LANGS, LOCALES, MESSAGES, formatDate, formatMoney, formatNumber, isLang, langFromLocale, t, type MessageKey } from "./i18n";
import { isOffline, networkAwareMessage, OFFLINE_MESSAGE } from "./use-online";

describe("Languages (localisation)", () => {
  it("has every message in every language, none left blank, and the same placeholders as English", () => {
    const keys = Object.keys(MESSAGES.en) as MessageKey[];
    for (const lang of LANGS) {
      for (const key of keys) {
        const text = MESSAGES[lang][key];
        expect(text, `${lang}.${key}`).toBeTruthy();
        const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
        expect(placeholders(text), `${lang}.${key} placeholders`).toBe(placeholders(MESSAGES.en[key]));
      }
    }
  });

  it("fills in values, falls back to English, and picks a language from a locale", () => {
    expect(t("en", "you_have", { n: 12, unit: "points" })).toBe("You have 12 points here");
    expect(t("es", "you_have", { n: 12, unit: "puntos" })).toBe("Tienes 12 puntos aquí");
    expect(t("ur", "get_my_card")).not.toBe(t("en", "get_my_card"));
    expect(langFromLocale("es-MX")).toBe("es");
    expect(langFromLocale("ur-PK")).toBe("ur");
    expect(langFromLocale("fr-FR")).toBe("en"); // no translation yet
    expect(langFromLocale(null)).toBe("en");
    expect(isLang("es")).toBe(true);
    expect(isLang("de")).toBe(false);
    expect(LOCALES.ur.dir).toBe("rtl");
    expect(LOCALES.en.dir).toBe("ltr");
  });

  it("writes dates, numbers and money the way each language does", () => {
    const d = new Date("2026-11-05T12:00:00Z");
    expect(formatDate("en", d)).toMatch(/5 Nov 2026/);
    expect(formatDate("es", d)).toMatch(/5 nov/i);
    expect(formatNumber("es", 1234.5)).toBe("1234,5"); // Spanish groups from 5 digits
    expect(formatNumber("en", 1234.5)).toBe("1,234.5");
    expect(formatMoney("en", 1870, "GBP")).toBe("£18.70");
    expect(formatMoney("es", 1870, "EUR")).toMatch(/18,70/);
  });
});

describe("Working offline (FR-041)", () => {
  it("says plainly that nothing was changed when the connection is down", () => {
    expect(isOffline()).toBe(false); // no browser here, so it is treated as online
    expect(networkAwareMessage(new TypeError("Failed to fetch"), "x")).toBe(OFFLINE_MESSAGE);
    expect(networkAwareMessage(new Error("Not enough points"), "x")).toBe("Not enough points");
    expect(networkAwareMessage("weird", "Fallback")).toBe("Fallback");
    expect(OFFLINE_MESSAGE).toMatch(/Nothing was changed/);
  });
});
