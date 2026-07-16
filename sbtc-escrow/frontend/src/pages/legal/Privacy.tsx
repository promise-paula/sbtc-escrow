import { LegalShell, LegalSection } from './LegalShell';
import { REPO_URL } from '@/lib/stacks-config';

/**
 * Privacy policy. Every claim in here is checked against what the app
 * actually does: no accounts, no analytics, local-only notifications,
 * Supabase stores indexed chain data plus delivery notes, price quotes
 * fetched client-side. If a data flow changes, this page must change
 * with it. KEEP IN SYNC.
 */
export default function Privacy() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="What sBTC Escrow collects, what it never collects, and how on-chain data works. No accounts, no tracking, no ads."
      path="/privacy"
      effectiveDate="July 16, 2026"
    >
      <LegalSection num="01" heading="The short version">
        <p>
          sBTC Escrow is a non-custodial interface to a smart contract on the Stacks blockchain,
          operated by [OPERATOR ENTITY TO BE NAMED] ("we"). We do not ask for your name, email, or
          any account. We run no advertising, no analytics trackers, and no tracking cookies. Most
          of the data involved in using this product is public blockchain data that we index but
          do not control. The service is not directed at children under 18.
        </p>
      </LegalSection>

      <LegalSection num="02" heading="What we never collect">
        <ul>
          <li>No accounts, usernames, passwords, or email addresses.</li>
          <li>No advertising or cross-site tracking of any kind.</li>
          <li>No third-party analytics scripts.</li>
          <li>Your wallet's private keys: they stay in your wallet extension. This site never sees them and cannot transact without your explicit signature.</li>
        </ul>
      </LegalSection>

      <LegalSection num="03" heading="On-chain data is public">
        <p>
          When you create or interact with an escrow, the transaction is recorded on the Stacks
          blockchain: your wallet address, the counterparty's address, the amount, the deadline,
          the escrow description you enter, and every subsequent action (release, refund, dispute,
          resolution). This data is <strong>public and permanent by design</strong>. Anyone can read
          it with a block explorer, and nobody, including us, can edit or delete it.
        </p>
        <p>
          Wallet addresses are pseudonymous, not anonymous. Do not put personal information
          (names, contact details, physical addresses) in escrow descriptions.
        </p>
      </LegalSection>

      <LegalSection num="04" heading="What we store off-chain">
        <p>
          We operate a database (hosted on Supabase) that stores two things:
        </p>
        <ul>
          <li><strong>An index of public chain data.</strong> Copies of escrow records and events, mirrored from the blockchain so pages load fast. This adds nothing that is not already public.</li>
          <li><strong>Delivery notes.</strong> If a seller marks work as delivered with an optional message, that message is stored in our database and shown to the escrow's participants. Keep personal information out of these notes; contact us to request deletion of a note you wrote.</li>
        </ul>
      </LegalSection>

      <LegalSection num="05" heading="Your browser">
        <ul>
          <li><strong>Local storage:</strong> your theme choice (light/dark) and dismissed banners. This never leaves your device. Nothing we store in your browser requires consent under cookie laws, which is why there is no cookie banner.</li>
          <li><strong>Wallet connection:</strong> managed by your wallet extension under its own policy. Disconnecting in the app or the extension ends it.</li>
          <li><strong>Notifications:</strong> if you enable escrow notifications, they are fired locally by your browser. We store no push subscription on any server, and you can revoke the permission in browser settings at any time.</li>
        </ul>
      </LegalSection>

      <LegalSection num="06" heading="Third-party services">
        <p>Using the site causes your browser or our infrastructure to talk to:</p>
        <ul>
          <li><strong>Vercel</strong> (hosting): standard server logs, including IP addresses, under Vercel's privacy policy.</li>
          <li><strong>Supabase</strong> (database): the off-chain data described above.</li>
          <li><strong>Hiro APIs</strong> (blockchain access): your browser queries chain state directly, exposing your IP to Hiro.</li>
          <li><strong>CoinGecko / Coinbase</strong> (price quotes): fetched directly from your browser for USD estimates, exposing your IP to those services.</li>
        </ul>
        <p>Fonts are self-hosted: no font CDN sees your visits.</p>
      </LegalSection>

      <LegalSection num="07" heading="Your rights and data removal">
        <p>
          Where data-protection law such as the GDPR applies to you, the operator named in
          section 01 is the controller. We process the indexed chain data described above on the
          basis of our legitimate interest in operating the service; notifications run only with
          your consent, which you can withdraw in browser settings.
        </p>
        <p>
          Blockchain records cannot be deleted by anyone. For off-chain data we control (delivery
          notes), open an issue on <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a> or
          message <a href="https://x.com/sbtcescrow" target="_blank" rel="noopener noreferrer">@sbtcescrow</a> from
          the wallet-verifiable account involved, and we will remove it within 30 days. Our hosting
          and database providers operate in the United States, so data they handle is processed
          there.
        </p>
      </LegalSection>

      <LegalSection num="08" heading="Changes">
        <p>
          If this policy changes, the effective date above changes with it, and material changes
          will be noted in the repository's commit history, which is public.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
