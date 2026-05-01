import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Escrow, EscrowEvent, EscrowStatus, STATUS_LABELS } from '@/lib/types';
import { STACKS_NETWORK, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { formatAmount, tokenLabel, blockToEstimatedDate, getExplorerUrl } from '@/lib/utils';

interface ReceiptOptions {
  currentBlock?: number;
  minutesPerBlock?: number;
}

export async function generateEscrowReceipt(
  escrow: Escrow,
  events: EscrowEvent[],
  options: ReceiptOptions = {},
) {
  const { currentBlock, minutesPerBlock = DEFAULT_MINUTES_PER_BLOCK } = options;

  const doc          = new jsPDF({ unit: 'mm', format: 'a4' });
  const w            = doc.internal.pageSize.getWidth();  // 210 mm
  const margin       = 20;
  const contentWidth = w - margin * 2;                    // 170 mm
  const PAGE_BOTTOM  = 274;
  const FOOTER_Y     = 284;

  // ── Palette ──────────────────────────────────────────────────────
  const ink        = [18,  20,  30]  as const;   // near-black body text
  const orange     = [249, 115, 22]  as const;   // brand accent
  const dimWhite   = [170, 175, 190] as const;   // muted text on dark bg
  const mutedText  = [107, 114, 128] as const;   // gray-500 (labels)
  const stripe     = [247, 248, 250] as const;   // gray-50  (row fill)
  const borderClr  = [229, 231, 235] as const;   // gray-200 (borders)
  const white      = [255, 255, 255] as const;
  const successGrn = [22,  101, 52]  as const;   // green-800 — white on bg ≈ 6.3:1 (AA+)
  const disputeRed = [220, 38,  38]  as const;   // red-600   — white on bg ≈ 4.6:1 (AA)
  const pendingBlue= [29,  78,  216] as const;   // blue-700  — white on bg ≈ 6.2:1 (AA+)
  const slateGray  = [71,  85,  105] as const;   // slate-600 — white on bg ≈ 6.8:1 (AA+)

  const isSettled = escrow.status === EscrowStatus.Released || escrow.status === EscrowStatus.Refunded;
  const tokenSym  = tokenLabel(escrow.tokenType);
  const dateStr   = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  // Load logo for header branding — graceful fallback if unavailable
  let logoDataUrl: string | null = null;
  try {
    if (typeof window !== 'undefined') {
      const _res = await fetch('/android-chrome-192x192.png');
      if (_res.ok) {
        const _blob = await _res.blob();
        logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(_blob);
        });
      }
    }
  } catch { /* decorative — PDF proceeds without logo */ }

  const fmtBlock = (block: number): string => {
    if (!currentBlock) return `Block ${block.toLocaleString()}`;
    const date = blockToEstimatedDate(block, currentBlock, minutesPerBlock);
    return `Block ${block.toLocaleString()} · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  let y = 0;

  // ── DRAFT watermark — drawn first, sits behind all content ───────
  if (!isSettled) {
    doc.setFontSize(68);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(232, 233, 238);
    doc.text('DRAFT', w / 2, 155, { align: 'center', angle: 42 });
  }

  // ════════════════════════════════════════════════════════════════
  //  HEADER  (44 mm dark panel — compact but spacious)
  // ════════════════════════════════════════════════════════════════
  const HEADER_H = 44;
  doc.setFillColor(...ink);
  doc.rect(0, 0, w, HEADER_H, 'F');
  // Orange accent strip
  doc.setFillColor(...orange);
  doc.rect(0, HEADER_H, w, 1.5, 'F');

  // Logo — 10×10 mm, vertically centred in the upper half of the header
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, 6.5, 10, 10);
  }
  const wordmarkX = logoDataUrl ? margin + 12.5 : margin;

  // Wordmark: "sBTC" orange + " Escrow" white
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...orange);
  const sbtcW = doc.getTextWidth('sBTC');
  doc.text('sBTC', wordmarkX, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...white);
  doc.text(' Escrow', wordmarkX + sbtcW, 13);

  // "RECEIPT" micro-label — top-right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...dimWhite);
  doc.text('RECEIPT', w - margin, 9, { align: 'right' });

  // Escrow ID — large
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...white);
  doc.text(`#${escrow.id}`, w - margin, 20, { align: 'right' });

  // Amount — hero element in orange, largest data on the document
  const amountStr = `${formatAmount(escrow.amount, escrow.tokenType)} ${tokenSym}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...orange);
  doc.text(amountStr, w - margin, 31, { align: 'right' });

  // Status pill
  const statusLabel = STATUS_LABELS[escrow.status];
  let statusColor: readonly [number, number, number] = pendingBlue;
  if      (escrow.status === EscrowStatus.Released) statusColor = successGrn;
  else if (escrow.status === EscrowStatus.Refunded)  statusColor = slateGray;
  else if (escrow.status === EscrowStatus.Disputed)  statusColor = disputeRed;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const pillLabelW = doc.getTextWidth(statusLabel);
  const pillW = pillLabelW + 7;
  const pillY = HEADER_H - 11;
  doc.setFillColor(...statusColor);
  doc.roundedRect(margin, pillY, pillW, 5.5, 1.3, 1.3, 'F');
  doc.setTextColor(...white);
  doc.text(statusLabel, margin + 3.5, pillY + 3.9);

  // Generation date — bottom-right of header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...dimWhite);
  doc.text(dateStr, w - margin, pillY + 3.9, { align: 'right' });

  y = HEADER_H + 1.5 + 9;

  // ── Section heading helper ────────────────────────────────────────
  // Typography: 8.5pt bold orange caps — clear tier-2 heading above 8pt body
  const drawHeading = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...ink);                  // ink on white ≈ 14:1 — WCAG AAA; orange underline below signals the tier
    const titleW = doc.getTextWidth(title.toUpperCase());
    doc.text(title.toUpperCase(), margin, y);
    // Short orange underline anchors the heading
    doc.setDrawColor(...orange);
    doc.setLineWidth(0.4);
    doc.line(margin, y + 1.5, margin + titleW, y + 1.5);
    // Faint rule carries the eye across
    doc.setDrawColor(...borderClr);
    doc.setLineWidth(0.3);
    doc.line(margin + titleW + 3, y + 1.5, w - margin, y + 1.5);
    doc.setLineWidth(0.2);
    y += 8;
  };

  // ── Description ──────────────────────────────────────────────────
  if (escrow.description) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...mutedText);
    const descLines = doc.splitTextToSize(`"${escrow.description}"`, contentWidth) as string[];
    for (const line of descLines) {
      if (y > PAGE_BOTTOM) break;
      doc.text(line, margin, y);
      y += 5.2;
    }
    y += 4;
  }

  // ════════════════════════════════════════════════════════════════
  //  PARTIES — side-by-side cards, 18 mm tall
  // ════════════════════════════════════════════════════════════════
  drawHeading('Parties');

  const HALF_W      = (contentWidth - 5) / 2;
  const PARTY_BOX_H = 18;

  const drawPartyBox = (role: string, addr: string, x: number) => {
    doc.setFillColor(...stripe);
    doc.setDrawColor(...borderClr);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, HALF_W, PARTY_BOX_H, 2, 2, 'FD');
    // Role label — tier 3 (6.5pt muted)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...mutedText);
    doc.text(role, x + 4, y + 5.5);
    // Address — monospace, ink, max 2 lines
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(addr, HALF_W - 8) as string[];
    lines.slice(0, 2).forEach((line, i) => doc.text(line, x + 4, y + 10.5 + i * 4));
  };

  drawPartyBox('BUYER',  escrow.buyer,  margin);
  drawPartyBox('SELLER', escrow.seller, margin + HALF_W + 5);
  y += PARTY_BOX_H + 9;

  // ════════════════════════════════════════════════════════════════
  //  DETAILS — zebra-striped rows, 6.5 mm row height
  // ════════════════════════════════════════════════════════════════
  drawHeading('Details');

  const detailRows: [string, string][] = [
    ['Created',      fmtBlock(escrow.createdAt)],
    ['Expires',      fmtBlock(escrow.expiresAt)],
    ['Platform Fee', `${formatAmount(escrow.feeAmount, escrow.tokenType)} ${tokenSym}`],
  ];
  if (escrow.completedAt) detailRows.push(['Completed',   fmtBlock(escrow.completedAt)]);
  if (escrow.disputedAt)  detailRows.push(['Disputed',    fmtBlock(escrow.disputedAt)]);
  if (escrow.disputedBy)  detailRows.push(['Disputed By', escrow.disputedBy]);

  const ROW_H   = 6.5;
  const LABEL_W = 36;

  detailRows.forEach(([label, value], i) => {
    if (y > PAGE_BOTTOM) return;
    if (i % 2 === 0) {
      doc.setFillColor(...stripe);
      doc.rect(margin, y - 4.5, contentWidth, ROW_H, 'F');
    }
    // Label — tier 3 (8pt muted bold)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...mutedText);
    doc.text(label, margin + 3, y);
    // Value — tier 2 (8pt ink)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    const val = doc.splitTextToSize(value, contentWidth - LABEL_W - 3) as string[];
    doc.text(val[0] ?? '', margin + LABEL_W, y);
    y += ROW_H;
  });
  y += 7;

  // ════════════════════════════════════════════════════════════════
  //  TRANSACTION HASH — monospaced box, 12 mm tall
  // ════════════════════════════════════════════════════════════════
  if (escrow.txHash && y < PAGE_BOTTOM - 16) {
    drawHeading('Transaction Hash');
    const HASH_H = 12;
    doc.setFillColor(...stripe);
    doc.setDrawColor(...borderClr);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, HASH_H, 2, 2, 'FD');
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...ink);
    const hashLines = doc.splitTextToSize(escrow.txHash, contentWidth - 8) as string[];
    doc.text(hashLines[0] ?? '', margin + 4, y + 7.5);
    y += HASH_H + 8;
  }

  // ════════════════════════════════════════════════════════════════
  //  TIMELINE — dot + connector, 7 mm per event
  // ════════════════════════════════════════════════════════════════
  if (events.length > 0 && y < PAGE_BOTTOM - 16) {
    drawHeading('Timeline');
    const sorted = [...events].sort((a, b) => a.blockHeight - b.blockHeight);
    const DOT_X  = margin + 2.5;
    const TEXT_X = margin + 8;
    const STEP   = 7;

    sorted.forEach((event, i) => {
      if (y > PAGE_BOTTOM - 8) {
        const rem = sorted.length - i;
        if (rem > 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.5);
          doc.setTextColor(...mutedText);
          doc.text(`+ ${rem} more event${rem === 1 ? '' : 's'} not shown`, TEXT_X, y);
        }
        return;
      }
      // Connector line to next item
      if (i < sorted.length - 1) {
        doc.setDrawColor(...borderClr);
        doc.setLineWidth(0.35);
        doc.line(DOT_X, y + 1.8, DOT_X, y + STEP);
      }
      // Orange dot
      doc.setFillColor(...orange);
      doc.ellipse(DOT_X, y, 1.2, 1.2, 'F');
      // Event name — 8pt bold ink
      const rawLabel  = event.eventType.replace(/^escrow-/, '').replace(/-/g, ' ');
      const niceLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...ink);
      doc.text(niceLabel, TEXT_X, y + 0.8);
      // Block + date — 7.5pt muted right-aligned
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...mutedText);
      doc.text(fmtBlock(event.blockHeight), w - margin, y + 0.8, { align: 'right' });
      y += STEP;
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  VERIFY — Explorer TX QR only (app page omitted: requires auth)
  // ════════════════════════════════════════════════════════════════
  if (escrow.txHash) {
    const explorerTxUrl = getExplorerUrl('tx', escrow.txHash);

    const QR_SIZE      = 22;
    const BOX_PAD      = 4;
    const BOX_SIZE     = QR_SIZE + BOX_PAD * 2;       // 30 mm
    const QR_SECTION_H = 8 + BOX_SIZE + 12;

    if (y + 5 + QR_SECTION_H > PAGE_BOTTOM) {
      doc.addPage();
      y = 20;
    } else {
      y += 5;
    }

    drawHeading('Verify');

    const qrOpts    = { margin: 1, width: 180, color: { dark: '#12141E', light: '#FFFFFF' } };
    const LABEL_OFF = BOX_SIZE + 4;
    const startX    = margin + (contentWidth - BOX_SIZE) / 2;
    const qrData    = await QRCode.toDataURL(explorerTxUrl, qrOpts);

    doc.setFillColor(...stripe);
    doc.setDrawColor(...borderClr);
    doc.setLineWidth(0.3);
    doc.roundedRect(startX, y, BOX_SIZE, BOX_SIZE, 2, 2, 'FD');
    doc.addImage(qrData, 'PNG', startX + BOX_PAD, y + BOX_PAD, QR_SIZE, QR_SIZE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...ink);
    doc.text(isSettled ? 'Verify settlement' : 'View transaction', startX + BOX_SIZE / 2, y + LABEL_OFF, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...mutedText);
    doc.text('Stacks Explorer', startX + BOX_SIZE / 2, y + LABEL_OFF + 4, { align: 'center' });
  }

  // ════════════════════════════════════════════════════════════════
  //  FOOTER — dark band mirroring the header
  // ════════════════════════════════════════════════════════════════
  doc.setFillColor(...ink);
  doc.rect(0, FOOTER_Y, w, 297 - FOOTER_Y, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...orange);
  doc.text('sBTC Escrow', margin, FOOTER_Y + 6);

  const networkSuffix = STACKS_NETWORK !== 'mainnet'
    ? ` · Stacks ${STACKS_NETWORK.charAt(0).toUpperCase()}${STACKS_NETWORK.slice(1)}`
    : '';
  const footerRight = [appOrigin, `Generated ${dateStr}${networkSuffix}`].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...dimWhite);
  doc.text(footerRight, w - margin, FOOTER_Y + 6, { align: 'right' });

  doc.save(`escrow-${escrow.id}-receipt.pdf`);
}
