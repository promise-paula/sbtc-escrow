import { useState, useCallback } from 'react';

export interface AppSettings {
  compactRows: boolean;
  showUsd: boolean;
  currency: 'STX' | 'microSTX';
  notifyConfirmations: boolean;
  notifyDisputes: boolean;
  notifyExpiry: boolean;
}

const STORAGE_KEY = 'sbtc-escrow-settings';

const defaults: AppSettings = {
  compactRows: false,
  showUsd: false,
  currency: 'STX',
  notifyConfirmations: true,
  notifyDisputes: true,
  notifyExpiry: true,
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(load);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettingsState(defaults);
  }, []);

  return { settings, update, reset };
}
