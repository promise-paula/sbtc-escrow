import { Escrow, EscrowStatus, TokenType, STATUS_LABELS } from './types';
import { microToSTX, satsToBTC } from './utils';

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function escrowsToCsv(escrows: Escrow[]): string {
  const headers = [
    'ID',
    'Buyer',
    'Seller',
    'Token',
    'Amount',
    'Fee',
    'Status',
    'Description',
    'Created (block)',
    'Expires (block)',
    'Completed (block)',
    'Disputed (block)',
    'Tx Hash',
  ];

  const rows = escrows.map((e) => {
    const tokenSym = e.tokenType === TokenType.SBTC ? 'sBTC' : 'STX';
    const amount =
      e.tokenType === TokenType.SBTC ? satsToBTC(e.amount) : microToSTX(e.amount);
    const fee =
      e.tokenType === TokenType.SBTC
        ? satsToBTC(e.feeAmount)
        : microToSTX(e.feeAmount);
    return [
      e.id,
      e.buyer,
      e.seller,
      tokenSym,
      amount,
      fee,
      STATUS_LABELS[e.status as EscrowStatus] ?? 'Unknown',
      e.description,
      e.createdAt,
      e.expiresAt,
      e.completedAt ?? '',
      e.disputedAt ?? '',
      e.txHash ?? '',
    ]
      .map(escapeCsv)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
