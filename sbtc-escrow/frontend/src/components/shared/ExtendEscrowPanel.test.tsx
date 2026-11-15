import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtendEscrowPanel } from './ExtendEscrowPanel';

// Testnet heights and rates as observed when escrow-v9 #2 was extended:
// burn height 38860, Stacks height ~1,028,000, Stacks blocks ~8s apart.
const BURN_HEIGHT = 38_860;
const STACKS_HEIGHT = 1_028_000;
const STACKS_MINUTES_PER_BLOCK = 0.14;

vi.mock('@/hooks/use-block-height', () => ({
  useBlockHeight: () => ({ data: STACKS_HEIGHT }),
}));
vi.mock('@/hooks/use-burn-block-height', () => ({
  useBurnBlockHeight: () => ({ data: BURN_HEIGHT }),
}));
vi.mock('@/hooks/use-block-rate', async (importActual) => ({
  ...(await importActual<typeof import('@/hooks/use-block-rate')>()),
  useBlockRate: () => ({ data: { minutesPerBlock: STACKS_MINUTES_PER_BLOCK } }),
}));
const extendEscrow = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/escrow-service', () => ({
  extendEscrow: (...args: unknown[]) => extendEscrow(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// escrow-v8 (testnet v3) is burn-clock on every branch; v4 behaves the same here.
const BURN = 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v8';
const LEGACY = 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v7';

function open(contractId: string, currentExpiresAt: number) {
  render(<ExtendEscrowPanel contractId={contractId} escrowId={2} currentExpiresAt={currentExpiresAt} />);
  fireEvent.click(screen.getByRole('button', { name: /extend deadline/i }));
}

const confirm = () => screen.getByRole('button', { name: /confirm extension/i });

describe('ExtendEscrowPanel on a burn-block (v3+) contract', () => {
  beforeEach(() => extendEscrow.mockClear());

  it('sends +1 Day as burn blocks (360 at 4 min), not Stacks blocks', () => {
    open(BURN, 38_871);
    fireEvent.click(screen.getByRole('button', { name: '+1 Day' }));
    fireEvent.click(confirm());
    expect(extendEscrow).toHaveBeenCalledWith(BURN, 2, 360);
  });

  it('shows what typed burn blocks mean in time (30 blocks ≈ 2h)', () => {
    open(BURN, 38_871);
    fireEvent.change(screen.getByPlaceholderText(/burn blocks/i), { target: { value: '30' } });
    expect(screen.getByText(/new expiry: burn block 38,901/i)).toHaveTextContent('+2h 0m');
  });

  it('caps the extension at the contract limit from the burn height', () => {
    // Contract: (new-expires - burn-block-height) <= 52560.
    // 38871 + additional - 38860 <= 52560  →  additional <= 52549.
    open(BURN, 38_871);
    const input = screen.getByPlaceholderText(/burn blocks/i);
    fireEvent.change(input, { target: { value: '52549' } });
    expect(confirm()).toBeEnabled();
    fireEvent.change(input, { target: { value: '52550' } });
    expect(confirm()).toBeDisabled();
  });
});

describe('ExtendEscrowPanel on a Stacks-block (v2/v7) contract', () => {
  beforeEach(() => extendEscrow.mockClear());

  it('keeps converting presets with the live Stacks block rate', () => {
    open(LEGACY, STACKS_HEIGHT + 100);
    fireEvent.click(screen.getByRole('button', { name: '+1 Day' }));
    fireEvent.click(confirm());
    expect(extendEscrow).toHaveBeenCalledWith(LEGACY, 2, Math.round(1440 / STACKS_MINUTES_PER_BLOCK));
  });
});
