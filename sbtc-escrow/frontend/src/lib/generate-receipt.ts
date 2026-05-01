import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Escrow, EscrowEvent, EscrowStatus, STATUS_LABELS } from '@/lib/types';
import { STACKS_NETWORK, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { formatAmount, tokenLabel, blockToEstimatedDate, getExplorerUrl } from '@/lib/utils';

interface ReceiptOptions {
  /** Current block height — required to compute approximate dates from block heights. */
  currentBlock?: number;
  /** Live or fallback block rate in minutes/block. */
  minutesPerBlock?: number;
}

export async function generateEscrowReceipt(
  escrow: Escrow,
  events: EscrowEvent[],
  options: ReceiptOptions = {},
) {
  const { currentBlock, minutesPerBlock = DEFAULT_MINUTES_PER_BLOCK } = options;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w   = doc.internal.pageSize.getWidth();   // 210 mm
  const margin      = 20;
  const contentWidth = w - margin * 2;            // 170 mm
  const PAGE_BOTTOM  = 274;

  // ── Palette ────────────────────────────────────────────────────
  const ink         = [18,  20,  30]  as const;   // near-black
  const orange      = [249, 115, 22]  as const;   // brand
  const dimWhite    = [170, 175, 190] as const;   // muted on dark bg
  const mutedText   = [107, 114, 128] as const;   // gray-500
  const stripe      = [247, 248, 250] as const;   // gray-50
  const borderClr   = [229, 231, 235] as const;   // gray-200
  const white       = [255, 255, 255] as const;
  const successGrn  = [22,  163, 74]  as const;   // green-600
  const disputeRed  = [220, 38,  38]  as const;   // red-600
  const pendingBlue = [59,  130, 246] as const;   // blue-500
  const slateGray   = [100, 116, 139] as const;   // slate-500 (refunded)

  const isSettled = escrow.status === EscrowStatus.Released || escrow.status === EscrowStatus.Refunded;
  const tokenSym  = tokenLabel(escrow.tokenType);
  const dateStr   = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const formatBlockWithDate = (block: number): string => {
    if (!currentBlock) return `Block ${block.toLocaleString()}`;
    const date = blockToEstimatedDate(block, currentBlock, minutesPerBlock);
    return `Block ${block.toLocaleString()} · ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
  };

  let y = 0;

  // ── DRAFT watermark (rendered before everything — sits behind content) ──
  if (!isSettled) {
    doc.setFontSize(68);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(232, 233, 238);
    doc.text('DRAFT', w / 2, 172, { align: 'center', angle: 42 });
  }

  // ════════════════════════════════════════════════════════════════
  //  HEADER  (dark background)
  // ════════════════════════════════════════════════════════════════
  const HEADER_H = 56;
  doc.setFillColor(...ink);
  doc.rect(0, 0, w, HEADER_H, 'F');

  // Orange accent strip at bottom of header
  doc.setFillColor(...orange);
  doc.rect(0, HEADER_H, w, 1.5, 'F');

  // Wordmark — "sBTC" orange + " Escrow" white
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...orange);
  const sbtcW = doc.getTextWidth('sBTC');
  doc.text('sBTC', margin, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...white);
  doc.text(' Escrow', margin + sbtcW, 15);

  // "RECEIPT" label — top-right, muted
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...dimWhite);
  doc.text('RECEIPT', w - margin, 10, { align: 'right' });

  // Escrow ID — large, top-right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...white);
  doc.text(`#${escrow.id}`, w - margin, 22, { align: 'right' });

  // Amount — prominent orange, right-aligned
  const amountStr = `${formatAmount(escrow.amount, escrow.tokenType)} ${tokenSym}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...orange);
  doc.text(amountStr, w - margin, 34, { align: 'right' });

  // Status pill — lower-left of header
  const statusLabel  = STATUS_LABELS[escrow.status];
  let   statusColor: readonly [number, number, number] = pendingBlue;
  if      (escrow.status === EscrowStatus.Released) statusColor = successGrn;
  else if (escrow.status === EscrowStatus.Refunded)  statusColor = slateGray;
  else if (escrow.status === EscrowStatus.Disputed)  statusColor = disputeRed;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const pillLabelW = doc.getTextWidth(statusLabel);
  const pillW = pillLabelW + 7;
  const PILL_H = 6;
  const pillY  = HEADER_H - 13;
  doc.setFillColor(...statusColor);
  doc.roundedRect(margin, pillY, pillW, PILL_H, 1.5, 1.5, 'F');
  doc.setTextColor(...white);
  doc.text(statusLabel, margin + 3.5, pillY + 4.2);

  // Generation date — lower-right of header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...dimWhite);
  doc.text(dateStr, w - margin, pillY + 4.2, { align: 'right' });

  y = HEADER_H + 1.5 + 11; // after stripe + breathing room

  // ── Description ─────────────────────────────────────────────────
  if (escrow.description) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(...mutedText);
    const descLines = doc.splitTextToSize(`"${escrow.description}"`, contentWidth) as string[];
    for (const line of descLines) {
      if (y > PAGE_BOTTOM) break;
      doc.text(line, margin, y);
      y += 5.5;
    }
    y += 5;
  }

  // ── Section heading helper ───────────────────────────────────────
  const drawHeading = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...orange);
    const titleW = doc.getTextWidth(title.toUpperCase());
    doc.text(title.toUpperCase(), margin, y);
    // Short orange underline
    doc.setDrawColor(...orange);
    doc.setLineWidth(0.4);
    doc.line(margin, y + 1.5, margin + titleW, y + 1.5);
    // Faint rule extending to right margin
    doc.setDrawColor(...borderClr);
    doc.setLineWidth(0.3);
    doc.line(margin + titleW + 3, y + 1.5, w - margin, y + 1.5);
    doc.setLineWidth(0.2);
    y += 9;
  };

  // ════════════════════════════════════════════════════════════════
  //  PARTIES  (two side-by-side cards)
  // ════════════════════════════════════════════════════════════════
  drawHeading('Parties');

  const HALF_W  = (contentWidth - 5) / 2;
  const BOX_H   = 23;

  const drawPartyBox = (role: string, address: string, x: number) => {
    // Background fill
    doc.setFillColor(...stripe);
    doc.roundedRect(x, y, HALF_W, BOX_H, 2, 2, 'F');
    // Border
    doc.setDrawColor(...borderClr);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, HALF_W, BOX_H, 2, 2, 'S');
    // Role label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...mutedText);
    doc.text(role, x + 4, y + 6.5);
    // Address
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(address, HALF_W - 8) as string[];
    lines.slice(0, 3).forEach((line, i) => doc.text(line, x + 4, y + 12.5 + i * 4.2));
  };

  drawPartyBox('BUYER',  escrow.buyer,  margin);
  drawPartyBox('SELLER', escrow.seller, margin + HALF_W + 5);
  y += BOX_H + 11;

  // ════════════════════════════════════════════════════════════════
  //  DETAILS  (zebra-striped table)
  // ════════════════════════════════════════════════════════════════
  drawHeading('Details');

  const detailRows: [string, string][] = [
    ['Created',      formatBlockWithDate(escrow.createdAt)],
    ['Expires',      formatBlockWithDate(escrow.expiresAt)],
    ['Platform Fee', `${formatAmount(escrow.feeAmount, escrow.tokenType)} ${tokenSym}`],
  ];
  if (escrow.completedAt) detailRows.push(['Completed',   formatBlockWithDate(escrow.completedAt)]);
  if (escrow.disputedAt)  detailRows.push(['Disputed',    formatBlockWithDate(escrow.disputedAt)]);
  if (escrow.disputedBy)  detailRows.push(['Disputed By', escrow.disputedBy]);

  const ROW_H   = 7.5;
  const LABEL_W = 38;

  detailRows.forEach(([label, value], i) => {
    if (y > PAGE_BOTTOM) return;
    if (i % 2 === 0) {
      doc.setFillColor(...stripe);
      doc.rect(margin, y - 5, contentWidth, ROW_H, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...mutedText);
    doc.text(label, margin + 3, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ink);
    const valLines = doc.splitTextToSize(value, contentWidth - LABEL_W - 3) as string[];
    doc.text(valLines[0] ?? '', margin + LABEL_W, y);
    y += ROW_H;
  });

  y += 8;

  // ════════════════════════════════════════════════════════════════
  //  TRANSACTION HASH
  // ════════════════════════════════════════════════════════════════
  if (escrow.txHash && y < PAGE_BOTTOM - 22) {
    drawHeading('Transaction Hash');

    const HASH_BOX_H = 16;
    doc.setFillColor(...stripe);
    doc.setDrawColor(...borderClr);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, HASH_BOX_H, 2, 2, 'FD');
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...ink);
    const hashLines = doc.splitTextToSize(escrow.txHash, contentWidth - 8) as string[];
    hashLines.slice(0, 2).forEach((line, i) => {
      if (y + i * 5 < PAGE_BOTTOM) doc.text(line, margin + 4, y + 5.5 + i * 5);
    });
    y += HASH_BOX_H + 10;
  }

  // ════════════════════════════════════════════════════════════════
  //  TIMELINE
  // ════════════════════════════════════════════════════════════════
  if (events.length > 0 && y < PAGE_BOTTOM - 22) {
    drawHeading('Timeline');

    const sorted = [...events].sort((a, b) => a.blockHeight - b.blockHeight);
    const DOT_X  = margin + 2.5;
    const TEXT_X = margin + 9;

    sorted.forEach((event, i) => {
      if (y > PAGE_BOTTOM - 8) {
        const rem = sorted.length - i;
        if (rem > 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(...mutedText);
          doc.text(`+ ${rem} more event${rem === 1 ? '' : 's'} not shown`, TEXT_X, y);
        }
        return;
      }

      // Vertical connector to next item
      if (i < sorted.length - 1) {
        doc.setDrawColor(...borderClr);
        doc.setLineWidth(0.4);
        doc.line(DOT_X, y + 2, DOT_X, y + 8);
      }

      // Dot
      doc.setFillColor(...orange);
      doc.ellipse(DOT_X, y, 1.4, 1.4, 'F');

      // Event name
      const rawLabel  = event.eventType.replace(/^escrow-/, '').replace(/-/g, ' ');
      const niceLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...ink);
      doc.text(niceLabel, TEXT_X, y + 0.8);

      // Block + date — right-aligned
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...mutedText);
      doc.text(formatBlockWithDate(event.blockHeight), w - margin, y + 0.8, { align: 'right' });

      y += 8;
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  VERIFY  (QR codes)
  // ════════════════════════════════════════════════════════════════
  {
    const appOriginForQR = typeof window !== 'undefined' ? window.location.origin : '';
    const escrowPageUrl  = appOriginForQR ? `${appOriginForQR}/escrows/${escrow.id}` : '';
    const explorerTxUrl  = escrow.txHash ? getExplorerUrl('tx', escrow.txHash) : '';

    const qrOpts = { margin: 1, width: 200, color: { dark: '#12141E', light: '#FFFFFF' } };

    // Decide layout: one or two QR codes
    const hasExplorerQR = Boolean(explorerTxUrl);
    const hasEscrowQR   = Boolean(escrowPageUrl);

    if (hasEscrowQR || hasExplorerQR) {
      // If not enough room for QR section (heading + box + labels ≈ 55mm), start a new page
      const QR_SECTION_H = 55;
      if (y + QR_SECTION_H > PAGE_BOTTOM) {
        doc.addPage();
        y = 20;
      }

      drawHeading('Verify');

      const QR_SIZE = 28;   // mm
      const BOX_PADDING = 4;
      const BOX_SIZE    = QR_SIZE + BOX_PADDING * 2;
      const LABEL_Y_OFF = BOX_SIZE + 4;

      if (hasExplorerQR && hasEscrowQR) {
        // Two QR codes side by side
        const gap   = 8;
        const totalW = BOX_SIZE * 2 + gap;
        const startX = margin + (contentWidth - totalW) / 2;

        const [explorerData, escrowData] = await Promise.all([
          QRCode.toDataURL(explorerTxUrl, qrOpts),
          QRCode.toDataURL(escrowPageUrl, qrOpts),
        ]);

        // Explorer TX box
        doc.setFillColor(...stripe);
        doc.setDrawColor(...borderClr);
        doc.setLineWidth(0.3);
        doc.roundedRect(startX, y, BOX_SIZE, BOX_SIZE, 2, 2, 'FD');
        doc.addImage(explorerData, 'PNG', startX + BOX_PADDING, y + BOX_PADDING, QR_SIZE, QR_SIZE);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...ink);
        doc.text('Verify on-chain', startX + BOX_SIZE / 2, y + LABEL_Y_OFF, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...mutedText);
        doc.text('Stacks Explorer', startX + BOX_SIZE / 2, y + LABEL_Y_OFF + 4, { align: 'center' });

        // Escrow page box
        const x2 = startX + BOX_SIZE + gap;
        doc.setFillColor(...stripe);
        doc.setDrawColor(...borderClr);
        doc.roundedRect(x2, y, BOX_SIZE, BOX_SIZE, 2, 2, 'FD');
        doc.addImage(escrowData, 'PNG', x2 + BOX_PADDING, y + BOX_PADDING, QR_SIZE, QR_SIZE);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...ink);
        doc.text('View escrow', x2 + BOX_SIZE / 2, y + LABEL_Y_OFF, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...mutedText);
        const shortUrl = escrowPageUrl.replace(/^https?:\/\//, '');
        doc.text(shortUrl, x2 + BOX_SIZE / 2, y + LABEL_Y_OFF + 4, { align: 'center' });

        y += BOX_SIZE + 14;
      } else {
        // Single QR code, centered
        const singleUrl  = hasExplorerQR ? explorerTxUrl : escrowPageUrl;
        const singleLabel = hasExplorerQR ? 'Verify on-chain' : 'View escrow';
        const singleSub   = hasExplorerQR ? 'Stacks Explorer' : (escrowPageUrl.replace(/^https?:\/\//, ''));
        const startX      = margin + (contentWidth - BOX_SIZE) / 2;

        const qrData = await QRCode.toDataURL(singleUrl, qrOpts);

        doc.setFillColor(...stripe);
        doc.setDrawColor(...borderClr);
        doc.setLineWidth(0.3);
        doc.roundedRect(startX, y, BOX_SIZE, BOX_SIZE, 2, 2, 'FD');
        doc.addImage(qrData, 'PNG', startX + BOX_PADDING, y + BOX_PADDING, QR_SIZE, QR_SIZE);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...ink);
        doc.text(singleLabel, startX + BOX_SIZE / 2, y + LABEL_Y_OFF, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...mutedText);
        doc.text(singleSub, startX + BOX_SIZE / 2, y + LABEL_Y_OFF + 4, { align: 'center' });

        y += BOX_SIZE + 14;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  FOOTER  (dark band)
  // ════════════════════════════════════════════════════════════════
  const FOOTER_Y = 284;
  doc.setFillColor(...ink);
  doc.rect(0, FOOTER_Y, w, 13, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...orange);
  doc.text('sBTC Escrow', margin, FOOTER_Y + 6);

  const appOrigin     = typeof window !== 'undefined' ? window.location.origin : '';
  const networkSuffix = STACKS_NETWORK !== 'mainnet'
    ? ` · ${STACKS_NETWORK.charAt(0).toUpperCase()}${STACKS_NETWORK.slice(1)}`
    : '';
  const footerRight   = [appOrigin, `Generated ${dateStr}${networkSuffix}`].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...dimWhite);
  doc.text(footerRight, w - margin, FOOTER_Y + 6, { align: 'right' });

  doc.save(`escrow-${escrow.id}-receipt.pdf`);
}
