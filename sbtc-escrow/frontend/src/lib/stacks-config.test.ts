import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONTRACT_VERSIONS, contractVersionFor } from './stacks-config';

const CONTRACTS_DIR = join(__dirname, '../../../contracts');

describe('contract versions', () => {
  it("match each contract's ;; version: source header", () => {
    const files = readdirSync(CONTRACTS_DIR).filter((f) => /^escrow.*\.clar$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const header = readFileSync(join(CONTRACTS_DIR, file), 'utf8').match(/^;;\s*version:\s*(\S+)/im)?.[1];
      expect({ contract: file, version: CONTRACT_VERSIONS[file.replace(/\.clar$/, '')] })
        .toEqual({ contract: file, version: header });
    }
  });

  it('come from the contract name, not a separate setting', () => {
    expect(contractVersionFor('escrow-mainnet-v3', '4.0.0')).toBe('3.0.0');
    expect(contractVersionFor('escrow-mainnet-v4', '3.0.0')).toBe('4.0.0');
    expect(contractVersionFor('escrow-unknown', '9.9.9')).toBe('9.9.9');
    expect(contractVersionFor('escrow-unknown', undefined)).toBe('unknown');
  });
});
