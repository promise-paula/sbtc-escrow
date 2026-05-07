import { useState, useCallback } from 'react';
import { SETTINGS_CHANGED_EVENT } from './use-usd-estimate';

export interface AppSettings {
  showUsd: boolean;
  notifyConfirmations: boolean;
  notifyDisputes: boolean;
  notifyDeliveries: boolean;
}

const STORAGE_KEY = 'sbtc-escrow-settings';

const defaults: AppSettings = {
  showUsd: false,
  notifyConfirmations: false,
  notifyDisputes: false,
  notifyDeliveries: false,
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Strip keys that no longer exist in the schema to avoid stale data
    const validKeys = Object.keys(defaults) as (keyof AppSettings)[];
    const cleaned = validKeys.reduce((acc, k) => {
      acc[k] = (k in parsed ? parsed[k] : defaults[k]) as AppSettings[typeof k];
      return acc;
    }, {} as AppSettings);
    return cleaned;
  } catch {
    return defaults;
  }
}

function notifyChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(load);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      notifyChange();
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettingsState(defaults);
    notifyChange();
  }, []);

  return { settings, update, reset };
}
