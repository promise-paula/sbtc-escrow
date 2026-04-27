import { jsPDF } from 'jspdf';
import { Escrow, EscrowEvent, STATUS_LABELS } from '@/lib/types';
import { STACKS_NETWORK, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { formatAmount, tokenLabel, blockToEstimatedDate } from '@/lib/utils';

interface ReceiptOptions {
  /** Current block height — required to compute approximate dates from block heights. */
  currentBlock?: number;
  /** Live or fallback block rate in minutes/block. */
  minutesPerBlock?: number;
}

export function generateEscrowReceipt(
  escrow: Escrow,
  events: EscrowEvent[],
  options: ReceiptOptions = {},
) {
  const { currentBlock, minutesPerBlock = DEFAULT_MINUTES_PER_BLOCK } = options;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = w - margin * 2;
  let y = 25;

  const orange = [249, 115, 22] as const;
  const PAGE_BOTTOM = 270;

  const formatBlockWithDate = (block: number): string => {
    if (!currentBlock) return `Block ${block.toLocaleString()}`;
    const date = blockToEstimatedDate(block, currentBlock, minutesPerBlock);
    return `Block ${block.toLocaleString()} (~${date.toLocaleDateString()})`;
  };

  // Header bar
  doc.setFillColor(...orange);
  doc.rect(0, 0, w, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('sBTC ESCROW RECEIPT', margin, 8);
  doc.setTextColor(0, 0, 0);

  y = 22;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`Escrow #${escrow.id}`, margin, y);
  y += 8;

  // Status
  const statusLabel = STATUS_LABELS[escrow.status];
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Status: ${statusLabel}`, margin, y);
  y += 12;

  // Amount (token-aware)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const tokenSym = tokenLabel(escrow.tokenType);
  doc.text(`Amount: ${formatAmount(escrow.amount, escrow.tokenType)} ${tokenSym}`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, w - margin, y);
  y += 8;

  // Description
  if (escrow.description) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Description', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const descLines = doc.splitTextToSize(escrow.description, contentWidth) as string[];
    for (const line of descLines) {
      if (y > PAGE_BOTTOM) break;
      doc.text(line, margin, y);
      y += 5;
    }
    y += 5;
  }

  // Parties
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Parties', margin, y);
  y += 6;

  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.text(`Buyer:  ${escrow.buyer}`, margin, y);
  y += 5;
  doc.text(`Seller: ${escrow.seller}`, margin, y);
  y += 10;

  // Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Details', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const details: [string, string][] = [
    ['Created', formatBlockWithDate(escrow.createdAt)],
    ['Expires', formatBlockWithDate(escrow.expiresAt)],
    ['Platform Fee', `${formatAmount(escrow.feeAmount, escrow.tokenType)} ${tokenSym}`],
  ];
  if (escrow.completedAt) {
    details.push(['Completed', formatBlockWithDate(escrow.completedAt)]);
  }
  if (escrow.disputedAt) {
    details.push(['Disputed', formatBlockWithDate(escrow.disputedAt)]);
  }
  if (escrow.disputedBy) {
    details.push(['Disputed By', escrow.disputedBy]);
  }

  for (const [label, value] of details) {
    if (y > PAGE_BOTTOM) break;
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(value, contentWidth - 32) as string[];
    for (let i = 0; i < valueLines.length; i++) {
      if (y > PAGE_BOTTOM) break;
      doc.text(valueLines[i], margin + 30, y);
      if (i < valueLines.length - 1) y += 5;
    }
    y += 5;
  }
  y += 3;

  // Tx hash on its own line so it can wrap cleanly
  if (escrow.txHash && y < PAGE_BOTTOM - 10) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Transaction Hash:', margin, y);
    y += 5;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    const hashLines = doc.splitTextToSize(escrow.txHash, contentWidth) as string[];
    for (const line of hashLines) {
      if (y > PAGE_BOTTOM) break;
      doc.text(line, margin, y);
      y += 4;
    }
    y += 5;
  }

  // Timeline
  if (events.length > 0 && y < 250) {
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, w - margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Timeline', margin, y);
    y += 6;

    doc.setFontSize(9);
    const sorted = [...events].sort((a, b) => b.blockHeight - a.blockHeight);
    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];
      if (y > PAGE_BOTTOM) {
        const remaining = sorted.length - i;
        if (remaining > 0) {
          doc.setFont('helvetica', 'italic');
          doc.text(`+ ${remaining} more event${remaining === 1 ? '' : 's'} not shown`, margin, y);
        }
        break;
      }
      doc.setFont('helvetica', 'bold');
      const label = event.eventType.replace(/^escrow-/, '').replace(/-/g, ' ').toUpperCase();
      doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(formatBlockWithDate(event.blockHeight), margin + 55, y);
      y += 5;
    }
  }

  // Footer
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, 280, w - margin, 280);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  const network = STACKS_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet';
  doc.text(`Generated ${new Date().toISOString()} — ${network}`, margin, 285);

  doc.save(`escrow-${escrow.id}-receipt.pdf`);
}
