export const quotationLinks = [
  { path: '/history', label: 'All quotations' },
  { path: '/', label: 'New quotation' },
];

export const invoiceLinks = [
  { path: '/invoices', label: 'Invoices' },
  { path: '/payments', label: 'Record payment' },
  { path: '/receipts', label: 'Receipts' },
];

export function invoiceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Draft',
    issued: 'Due',
    partially_paid: 'Part-paid',
    paid: 'Paid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

export function quotationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Draft',
    final: 'Ready to send',
    sent: 'Sent to client',
    viewed: 'Client viewed',
    accepted: 'Accepted',
    rejected: 'Rejected',
    expired: 'Expired',
    converted: 'Invoice created',
  };
  return labels[status] || status;
}

export function activityLabel(kind: string) {
  const labels: Record<string, string> = {
    client_receipt: 'Payment received',
    advance: 'Advance received',
    expense_payment: 'Expense paid',
    vendor_payment: 'Supplier bill paid',
    transfer: 'Transfer',
    opening: 'Starting balance',
    adjustment: 'Balance adjustment',
    reversal: 'Undone transaction',
    invoice_allocation: 'Advance applied to invoice',
    partner_reimbursement: 'Partner reimbursed',
  };
  return labels[kind] || kind.replace(/_/g, ' ');
}
