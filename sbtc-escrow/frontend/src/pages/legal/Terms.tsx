import { LegalShell, LegalSection } from './LegalShell';
import { REPO_URL } from '@/lib/stacks-config';
import { Link } from 'react-router-dom';

/**
 * Terms of service. The load-bearing sections (03 fees, 04 disputes) mirror
 * what the Clarity contract actually enforces. If contract behavior changes
 * in a new version, this page must change with it. KEEP IN SYNC.
 */
export default function Terms() {
  return (
    <LegalShell
      title="Terms of Service"
      description="The terms for using sBTC Escrow: a non-custodial smart-contract escrow on Stacks. Plain language, matching what the contract enforces."
      path="/terms"
      effectiveDate="July 16, 2026"
    >
      <LegalSection num="01" heading="What you are agreeing to">
        <p>
          These terms govern your use of the sBTC Escrow website and interface ("the app"). You
          will be asked to accept them the first time you connect a wallet; connecting a wallet or
          creating an escrow is acceptance. If you do not accept them, do not use the app.
        </p>
        <p>
          You must be at least 18 years old, legally able to enter contracts, and not barred from
          using this service under the laws that apply to you, including sanctions laws.
        </p>
      </LegalSection>

      <LegalSection num="02" heading="Non-custodial software, not a money service">
        <p>
          sBTC Escrow is an interface to an open-source smart contract on the Stacks blockchain.
          <strong> We never hold, control, or have access to your funds.</strong> Funds you escrow are
          held by the contract itself and move only according to its published rules, triggered by
          signatures from the escrow's participants. We are not a bank, exchange, custodian,
          payment processor, or money transmitter.
        </p>
        <p>
          We are also not a party to your underlying deal. What the seller owes the buyer, and
          whether it was delivered, is between you and your counterparty. The contract enforces
          custody of the funds, nothing else.
        </p>
      </LegalSection>

      <LegalSection num="03" heading="No fiduciary or escrow-agent relationship">
        <p>
          Despite the product's name, we are not an escrow agent in the traditional legal sense
          and owe you no fiduciary duties. A traditional escrow agent receives and holds deposits;
          we never do. Funds go from your wallet into the smart contract, and the contract's
          published code, not our judgment or discretion, controls custody. Nothing in these terms
          or in your use of the app creates an agency, trust, fiduciary, advisory, partnership, or
          employment relationship between you and us.
        </p>
      </LegalSection>

      <LegalSection num="04" heading="Fees">
        <p>
          The platform fee rate is displayed in the app before you sign anything and is documented
          in the <Link to="/docs/concepts/fees-and-limits">docs</Link>. The fee is <strong>locked into
          each escrow at creation</strong>: the contract records the fee amount when you create the
          escrow, and later rate changes apply only to escrows created after them. Nobody,
          including us, can raise the fee on an existing escrow.
        </p>
        <p>
          The fee is charged only when funds go to the seller (release, or a dispute resolved for
          the seller). When funds return to the buyer, whether by refund, dispute resolution, or
          timeout recovery, the fee is returned to the buyer in full. In a split resolution, the
          fee is pro-rated the same way. Stacks network (gas) fees are separate, set by the
          network, and paid to miners, not to us.
        </p>
      </LegalSection>

      <LegalSection num="05" heading="Disputes and their limits">
        <p>
          Either participant can open a dispute on an active escrow. Disputes are resolved by the
          platform admin, whose powers are constrained by the contract itself:
        </p>
        <ul>
          <li>The admin can only act on escrows that are actually in dispute: release to the seller, refund to the buyer, or split. The admin cannot touch any other escrow or its funds.</li>
          <li>If the admin does not resolve a dispute within the on-chain timeout, the buyer can recover the funds directly from the contract, with no permission needed.</li>
          <li>If the seller had signaled delivery and the admin lets twice that window pass, the seller can claim the funds directly.</li>
          <li>Dispute resolutions execute on-chain and are final. There is no off-chain appeal through us.</li>
        </ul>
        <p>
          <strong>A conflict we disclose:</strong> because the fee is charged on seller-favorable
          outcomes and returned to the buyer on buyer-favorable ones, we earn more when a dispute
          is resolved for the seller. The amount at stake for us is at most the escrow's locked
          fee, never more than 0.5% of the amount, and every resolution is public on-chain, so our
          record can be audited by anyone. By using the app you accept this structure.
        </p>
        <p>
          This mechanism is the only remedy we provide for contested escrows. It does not limit
          any rights or claims you may have against your counterparty under the law that governs
          your underlying deal.
        </p>
      </LegalSection>

      <LegalSection num="06" heading="Your responsibilities">
        <ul>
          <li>Securing your wallet and keys. A signed transaction is yours; we cannot reverse it.</li>
          <li>Verifying the counterparty address before locking funds. Funds sent under a mistyped or fraudulent address follow the contract rules regardless.</li>
          <li>Doing your own diligence on who you transact with and what you are buying or selling.</li>
          <li>Your taxes and your compliance with the laws of your jurisdiction.</li>
        </ul>
        <p>
          You agree to indemnify us against third-party claims arising from your breach of these
          terms or your unlawful use of the app.
        </p>
      </LegalSection>

      <LegalSection num="07" heading="Prohibited use">
        <p>
          You may not use the app for anything unlawful: trading in illegal goods or services,
          fraud, money laundering, financing prohibited activities, or evading sanctions. We may
          restrict the interface (though we cannot seize escrowed funds, by design) where required
          by law.
        </p>
      </LegalSection>

      <LegalSection num="08" heading="Risks you accept">
        <ul>
          <li><strong>Smart contract risk.</strong> The contract is open source and has passed multiple self-audit rounds with extensive invariant tests, but no audit eliminates the possibility of bugs.</li>
          <li><strong>Blockchain finality.</strong> Confirmed transactions cannot be undone by anyone.</li>
          <li><strong>Market risk.</strong> STX and sBTC prices are volatile. USD figures in the app are estimates from third-party feeds, not guarantees.</li>
          <li><strong>Protocol risk.</strong> Stacks, the sBTC peg, and wallets are independent systems we do not control.</li>
          <li><strong>Regulatory risk.</strong> The legal treatment of digital assets can change where you live.</li>
        </ul>
      </LegalSection>

      <LegalSection num="09" heading="No warranty, limited liability">
        <p>
          The app and the contract are provided as is, without warranties of any kind, express or
          implied. To the maximum extent permitted by law, we are not liable for indirect,
          incidental, or consequential damages, or for losses arising from the risks in section
          08, from your counterparty's conduct, or from your own errors. Where liability cannot be
          excluded, it is limited to the greater of US$100 or the platform fees you paid us in the
          twelve months before the claim. Nothing in these terms limits rights you have under
          mandatory consumer-protection law, or liability that cannot lawfully be limited.
        </p>
      </LegalSection>

      <LegalSection num="10" heading="Changes and versions">
        <p>
          We may update these terms; the effective date above will change and continued use after
          a change is acceptance. One thing cannot change retroactively: an escrow keeps the rules
          of the contract version it was created under, because those rules are on-chain. New
          contract versions apply only to escrows created after them.
        </p>
      </LegalSection>

      <LegalSection num="11" heading="Governing law">
        <p>
          These terms are governed by the laws of [JURISDICTION TO BE DETERMINED], and its courts
          have jurisdiction over disputes about these terms (as opposed to escrow disputes, which
          section 05 covers on-chain). If you use the app as a consumer, this choice does not
          deprive you of protections that the mandatory law of your home jurisdiction grants you.
        </p>
      </LegalSection>

      <LegalSection num="12" heading="General">
        <p>
          If any part of these terms is found unenforceable, the rest stays in force. These terms
          are the entire agreement between you and us about the app. Our not enforcing a provision
          is not a waiver of it. You may not assign these terms; we may assign them to a successor
          operator of the service, and section 10 protects you either way: existing escrows keep
          their on-chain rules.
        </p>
      </LegalSection>

      <LegalSection num="13" heading="Contact">
        <p>
          Questions about these terms: open an issue on{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a> or message{' '}
          <a href="https://x.com/sbtcescrow" target="_blank" rel="noopener noreferrer">@sbtcescrow</a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
