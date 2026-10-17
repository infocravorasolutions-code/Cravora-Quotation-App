import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, asBody, asItems } from '../utils/api';
import { formatCurrency } from '../utils/currency';

export default function Dashboard() {
  const [summary, setSummary] = useState<{
    quotations: Record<string, number>;
    invoices: { total: number; unpaid: number; overdue: number; invoiced: number };
    paid: number;
    outstanding: number;
  } | null>(null);
  const [audit, setAudit] = useState<Array<{ _id: string; action: string; entityType: string; entityId: string; timestamp?: string }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiJson('/api/reports/summary')
      .then((data) => setSummary(asBody<{
        quotations: Record<string, number>;
        invoices: { total: number; unpaid: number; overdue: number; invoiced: number };
        paid: number;
        outstanding: number;
      }>(data)))
      .catch((err) => setError(err.message));
    apiJson('/api/audit-logs?limit=8')
      .then((data) => setAudit(asItems(data)))
      .catch(() => setAudit([]));
  }, []);

  const card = (label: string, value: string | number) => (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <Link to="/accounts" className="text-sm font-medium text-cravora-purple">Accounts</Link>
        </div>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {card('Quotations', summary.quotations.total)}
            {card('Drafts', summary.quotations.draft || 0)}
            {card('Sent', (summary.quotations.sent || 0) + (summary.quotations.viewed || 0))}
            {card('Accepted', summary.quotations.accepted || 0)}
            {card('Rejected', summary.quotations.rejected || 0)}
            {card('Invoices', summary.invoices.total)}
            {card('Unpaid invoices', summary.invoices.unpaid)}
            {card('Overdue', summary.invoices.overdue)}
            {card('Invoiced', formatCurrency(summary.invoices.invoiced || 0, 'INR'))}
            {card('Paid', formatCurrency(summary.paid || 0, 'INR'))}
            {card('Outstanding', formatCurrency(summary.outstanding || 0, 'INR'))}
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-lg p-6 mt-6">
          <h2 className="font-semibold text-gray-800 mb-3">Recent audit history</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {audit.map((entry) => (
              <li key={entry._id} className="flex justify-between gap-4 border-b py-2">
                <span>{entry.action} · {entry.entityType} {entry.entityId}</span>
                <span className="text-gray-500">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</span>
              </li>
            ))}
            {audit.length === 0 && <li>No audit events yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
