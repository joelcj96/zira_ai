import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";
import { translations } from "../i18n/translations";

const I18nContext = createContext(null);

const STORAGE_KEY = "zira_ai_language";
const LEGACY_STORAGE_KEY = "agentcj_language";
const SUPPORTED_LANGUAGES = ["en"];

const getNestedValue = (obj, path) =>
  path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const interpolate = (value, params = {}) =>
  Object.entries(params).reduce(
    (acc, [key, replacement]) => acc.replaceAll(`{${key}}`, String(replacement)),
    value
  );

const normalizeLanguage = (value) => {
  return "en";
};

const detectBrowserLanguage = () => {
  return "en";
};

export const I18nProvider = ({ children }) => {
  const { token, user, refreshUser } = useAuth();
  const missingKeyLogRef = useRef(new Set());
  const [language, setLanguage] = useState(() => {
    const local = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (localStorage.getItem(LEGACY_STORAGE_KEY) && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, localStorage.getItem(LEGACY_STORAGE_KEY));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return normalizeLanguage(local) || detectBrowserLanguage();
  });

  useEffect(() => {
    setLanguage("en");
    localStorage.setItem(STORAGE_KEY, "en");
  }, [user?.preferences?.language]);

  const changeLanguage = async (nextLanguage) => {
    void nextLanguage;
    setLanguage("en");
    localStorage.setItem(STORAGE_KEY, "en");
  };

  const t = (key, params = {}, fallback = "") => {
    const languagePack = translations[language] || translations.en;
    const englishPack = translations.en;
    const localizedValue = getNestedValue(languagePack, key);
    const englishValue = getNestedValue(englishPack, key);

    const isProduction =
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      Boolean(import.meta.env.PROD);

    if (!isProduction && language !== "en" && localizedValue === undefined && englishValue !== undefined) {
      const logId = `${language}:${key}`;
      if (!missingKeyLogRef.current.has(logId)) {
        missingKeyLogRef.current.add(logId);
        console.warn(`[i18n] Missing ${language} translation for key: ${key}`);
      }
    }

    const translated = localizedValue ?? englishValue ?? fallback ?? key;

    if (typeof translated !== "string") return fallback || key;
    return interpolate(translated, params);
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage: changeLanguage,
      t,
      supportedLanguages: SUPPORTED_LANGUAGES
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
