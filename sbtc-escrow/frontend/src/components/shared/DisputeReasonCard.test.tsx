import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ insert }) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DisputeReasonCard } from './DisputeReasonCard';
import { useSubmitDisputeReason } from '@/hooks/use-dispute-reason';

const V9 = 'ST3B5FYTCXN7CWSYT123YSEB7V2K2XE31JPMMRM9Y.escrow-v9';
const BUYER = 'ST38AEGHHPTZC78V67A70B6QK6FTKJ8XKHJZ9P634';
const SELLER = 'ST1Q7W4CND6FCXKXVTE58KTGXJHSV8FJ0RQ026KY0';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const base = {
  contractId: V9,
  escrowId: 5,
  disputedBy: BUYER,
  disputerRole: 'buyer' as const,
  existingReason: null,
  isSigningIn: false,
  onSignIn: vi.fn(),
};

describe('useSubmitDisputeReason', () => {
  beforeEach(() => insert.mockClear());

  it("saves the reason against the escrow's own contract", async () => {
    const { result } = renderHook(() => useSubmitDisputeReason(), { wrapper });
    result.current.mutate({ contractId: V9, escrowId: 5, reasonCategory: 'not_delivered', submittedBy: BUYER });
    await waitFor(() => expect(insert).toHaveBeenCalled());
    expect(insert.mock.calls[0][0]).toMatchObject({ contract_id: V9, escrow_id: 5, submitted_by: BUYER });
  });
});

describe('DisputeReasonCard', () => {
  beforeEach(() => insert.mockClear());

  it('asks the disputer to sign in before saving when not signed in', () => {
    const onSignIn = vi.fn();
    render(<DisputeReasonCard {...base} viewerAddress={BUYER} isAuthenticated={false} onSignIn={onSignIn} />, { wrapper });
    expect(screen.getByText(/no reason is attached yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save reason/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('lets a signed-in disputer save a reason for this escrow', async () => {
    render(<DisputeReasonCard {...base} viewerAddress={BUYER} isAuthenticated />, { wrapper });
    const save = screen.getByRole('button', { name: /save reason/i });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /not delivered/i }));
    fireEvent.click(save);
    await waitFor(() => expect(insert).toHaveBeenCalled());
    expect(insert.mock.calls[0][0]).toMatchObject({ contract_id: V9, escrow_id: 5, reason_category: 'not_delivered' });
  });

  it('prefills the reason picked in the dispute form', () => {
    render(
      <DisputeReasonCard {...base} viewerAddress={BUYER} isAuthenticated
        initialReason={{ category: 'not_as_described', details: 'Screen is cracked' }} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /not as described/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByDisplayValue('Screen is cracked')).toBeInTheDocument();
  });

  it('shows nothing to the other party while no reason exists', () => {
    const { container } = render(<DisputeReasonCard {...base} viewerAddress={SELLER} isAuthenticated />, { wrapper });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a saved reason to either party', () => {
    render(
      <DisputeReasonCard {...base} viewerAddress={SELLER} isAuthenticated={false}
        existingReason={{ id: 1, escrowId: 5, reasonCategory: 'not_delivered', reasonLabel: 'Item / service not delivered', details: 'Nothing arrived', submittedBy: BUYER, createdAt: '' }} />,
      { wrapper },
    );
    expect(screen.getByText('Item / service not delivered')).toBeInTheDocument();
    expect(screen.getByText(/nothing arrived/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });
});
