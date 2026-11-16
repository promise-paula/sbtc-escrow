-- Optional "How did you hear about sBTC Escrow?" answers, one per wallet.
-- Self-reported. Only the signed-in wallet (wallet-auth JWT) can save or read
-- its own answer; there is no update or delete policy, so an answer can't be
-- changed from the app. The team exports answers with the service role.
create table public.referral_answers (
  wallet_address text primary key,
  source text not null check (source in ('search', 'x', 'stacks_community', 'friend', 'counterparty', 'other')),
  other_text text check (other_text is null or (source = 'other' and char_length(other_text) <= 100)),
  created_at timestamptz not null default now()
);

alter table public.referral_answers enable row level security;

create policy "Wallet can save its own answer"
  on public.referral_answers for insert to authenticated
  with check (wallet_address = (auth.jwt() ->> 'wallet_address'));

create policy "Wallet can read its own answer"
  on public.referral_answers for select to authenticated
  using (wallet_address = (auth.jwt() ->> 'wallet_address'));

grant select, insert on public.referral_answers to authenticated;
