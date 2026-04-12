import { jsPDF } from 'jspdf';
import { Escrow, EscrowEvent, STATUS_LABELS } from '@/lib/types';

export function generateEscrowReceipt(escrow: Escrow, events: EscrowEvent[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 25;

  const orange = [249, 115, 22] as const; // #f97316

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

  // Amount
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const stx = (escrow.amount / 1_000_000).toFixed(6);
  doc.text(`Amount: ${stx} STX`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, w - margin, y);
  y += 8;

  // Parties
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
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
    ['Created', `Block ${escrow.createdAt.toLocaleString()}`],
    ['Expires', `Block ${escrow.expiresAt.toLocaleString()}`],
    ['Platform Fee', `${(escrow.feeAmount / 1_000_000).toFixed(6)} STX`],
  ];
  if (escrow.completedAt) {
    details.push(['Completed', `Block ${escrow.completedAt.toLocaleString()}`]);
  }
  if (escrow.txHash) {
    details.push(['TX Hash', escrow.txHash]);
  }

  for (const [label, value] of details) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 30, y);
    y += 5;
  }
  y += 5;

  // Timeline
  if (events.length > 0) {
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, w - margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Timeline', margin, y);
    y += 6;

    doc.setFontSize(9);
    const sorted = [...events].sort((a, b) => b.blockHeight - a.blockHeight);
    for (const event of sorted) {
      if (y > 270) break; // prevent overflow
      doc.setFont('helvetica', 'bold');
      doc.text(event.eventType.toUpperCase(), margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`Block ${event.blockHeight.toLocaleString()}`, margin + 40, y);
      y += 5;
    }
  }

  // Footer
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, 280, w - margin, 280);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${new Date().toLocaleDateString()} — Testnet`, margin, 285);

  doc.save(`escrow-${escrow.id}-receipt.pdf`);
}
