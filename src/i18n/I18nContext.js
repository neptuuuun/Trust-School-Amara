import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import ar from '../locales/ar.json';
import en from '../locales/en.json';

const I18nContext = createContext(null);

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};

const resources = { ar, en };
const DEFAULT_LANG = localStorage.getItem('admin_lang') || 'ar';

export const I18nProvider = ({ children }) => {
  const [lang, setLang] = useState(DEFAULT_LANG);

  useEffect(() => {
    localStorage.setItem('admin_lang', lang);
  }, [lang]);

  const t = useMemo(() => {
    const dict = resources[lang] || resources.ar;
    return (key, fallback) => {
      const parts = key.split('.');
      let cur = dict;
      for (const p of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
        else { cur = null; break; }
      }
      return (typeof cur === 'string') ? cur : (fallback || key);
    };
  }, [lang]);

  const value = { lang, setLang, t };
  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
};
