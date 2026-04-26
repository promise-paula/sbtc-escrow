import { useState, useCallback } from 'react';

export interface AddressBookEntry {
  name: string;
  address: string;
  addedAt: number;
}

const STORAGE_KEY = 'sbtc-escrow-address-book';

function load(): AddressBookEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: AddressBookEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded — fail silently; UI keeps in-memory state
  }
}

export function useAddressBook() {
  const [entries, setEntries] = useState<AddressBookEntry[]>(load);

  const add = useCallback((name: string, address: string) => {
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.address !== address);
      const next = [
        ...filtered,
        { name, address, addedAt: Date.now() },
      ].sort((a, b) => a.name.localeCompare(b.name));
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((address: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.address !== address);
      save(next);
      return next;
    });
  }, []);

  const findByAddress = useCallback(
    (address: string) => entries.find((e) => e.address === address),
    [entries],
  );

  return { entries, add, remove, findByAddress };
}
