import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

let existing: { source: string } | null = null;
const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      insert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { HowDidYouHearCard } from './HowDidYouHearCard';

const WALLET = 'ST38AEGHHPTZC78V67A70B6QK6FTKJ8XKHJZ9P634';

function renderCard(props: Partial<React.ComponentProps<typeof HowDidYouHearCard>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <HowDidYouHearCard address={WALLET} isAuthenticated isSigningIn={false} onSignIn={vi.fn()} {...props} />,
    { wrapper },
  );
}

const question = () => screen.queryByText('How did you hear about sBTC Escrow?');

describe('HowDidYouHearCard', () => {
  beforeEach(() => {
    insert.mockClear();
    existing = null;
    // This test environment has no browser storage; use an in-memory one.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it('asks a wallet that is not signed in to sign in before saving', () => {
    const onSignIn = vi.fn();
    renderCard({ isAuthenticated: false, onSignIn });
    expect(question()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save answer/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('saves one answer for the signed-in wallet, then hides', async () => {
    renderCard();
    const save = await screen.findByRole('button', { name: /save answer/i });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /a friend or colleague/i }));
    fireEvent.click(save);
    await waitFor(() => expect(insert).toHaveBeenCalledWith({ wallet_address: WALLET, source: 'friend', other_text: null }));
    await waitFor(() => expect(question()).toBeNull());
  });

  it('only sends free text with Other', async () => {
    renderCard();
    fireEvent.click(await screen.findByRole('radio', { name: /^other$/i }));
    fireEvent.change(screen.getByLabelText(/where did you hear/i), { target: { value: '  A podcast  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith({ wallet_address: WALLET, source: 'other', other_text: 'A podcast' }));
  });

  it('stays hidden after Skip', async () => {
    const { unmount } = renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /skip/i }));
    expect(question()).toBeNull();
    unmount();
    renderCard();
    expect(question()).toBeNull();
  });

  it('does not ask a wallet that already answered', async () => {
    existing = { source: 'search' };
    renderCard();
    await waitFor(() => expect(question()).toBeNull());
  });

  it('treats an existing answer on save as done', async () => {
    insert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
    renderCard();
    fireEvent.click(await screen.findByRole('radio', { name: /search/i }));
    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(question()).toBeNull());
  });
});
