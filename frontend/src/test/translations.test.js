import { describe, it, expect } from "vitest";
import { translations } from "../i18n/translations";

// Recursively collect all dot-notation keys from a nested object
function getAllKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "object" && v !== null ? getAllKeys(v, key) : [key];
  });
}

// Mirrors the interpolation logic in I18nContext so we can test it standalone
function interpolate(value, params = {}) {
  return Object.entries(params).reduce(
    (acc, [key, replacement]) => acc.replaceAll(`{${key}}`, String(replacement)),
    value
  );
}

describe("translations", () => {
  const enKeys = getAllKeys(translations.en).sort();
  const frKeys = getAllKeys(translations.fr).sort();
  const esKeys = getAllKeys(translations.es).sort();

  it("FR has every key that EN has", () => {
    const missing = enKeys.filter((k) => !frKeys.includes(k));
    expect(missing, `Missing FR keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("ES has every key that EN has", () => {
    const missing = enKeys.filter((k) => !esKeys.includes(k));
    expect(missing, `Missing ES keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("all translation values are strings (no accidental objects)", () => {
    function checkStrings(obj, lang, path = "") {
      for (const [k, v] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${k}` : k;
        if (typeof v === "object" && v !== null) {
          checkStrings(v, lang, fullPath);
        } else {
          expect(typeof v, `${lang}.${fullPath} should be a string`).toBe("string");
        }
      }
    }
    checkStrings(translations.en, "en");
    checkStrings(translations.fr, "fr");
    checkStrings(translations.es, "es");
  });

  it("interpolates {name} placeholder correctly", () => {
    const template = translations.en.common.welcomeBack;
    expect(template).toContain("{name}");
    const result = interpolate(template, { name: "Alice" });
    expect(result).toBe("Welcome back, Alice");
  });

  it("all three languages have the same key count", () => {
    expect(frKeys.length).toBe(enKeys.length);
    expect(esKeys.length).toBe(enKeys.length);
  });
});
