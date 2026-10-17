import { formatCurrency, formatMoneyMap } from '../utils/currency';

export interface MoneyMap {
  INR?: number;
  USD?: number;
}

export interface SpendBreakdown {
  company?: MoneyMap;
  partner?: MoneyMap;
  byPartner?: Array<{ name: string; INR?: number; USD?: number }>;
  byCategory?: Array<{
    category: string;
    companyINR?: number;
    companyUSD?: number;
    partnerINR?: number;
    partnerUSD?: number;
  }>;
  byMonth?: Array<{
    month: string;
    company?: MoneyMap;
    partner?: MoneyMap;
  }>;
}

function totalOf(map?: MoneyMap) {
  return (map?.INR || 0) + (map?.USD || 0);
}

function BarRow({ label, company, partner, max }: { label: string; company: number; partner: number; max: number }) {
  const companyWidth = max > 0 ? Math.max(2, (company / max) * 100) : 0;
  const partnerWidth = max > 0 ? Math.max(2, (partner / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-gray-700 gap-3">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-gray-500">
          {company > 0 && <span className="mr-2">Company {formatCurrency(company, 'INR')}</span>}
          {partner > 0 && <span>Partner {formatCurrency(partner, 'INR')}</span>}
          {company <= 0 && partner <= 0 && '—'}
        </span>
      </div>
      <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
        {company > 0 && <div className="h-full bg-cravora-purple" style={{ width: `${companyWidth}%` }} title={`Company ${company}`} />}
        {partner > 0 && <div className="h-full bg-slate-500" style={{ width: `${partnerWidth}%` }} title={`Partner ${partner}`} />}
      </div>
    </div>
  );
}

function MonthBars({ rows }: { rows: NonNullable<SpendBreakdown['byMonth']> }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(totalOf(row.company), totalOf(row.partner))));
  if (rows.length === 0) return <p className="text-sm text-gray-500">No spend in this period.</p>;
  return (
    <div className="flex items-end gap-3 h-40">
      {rows.map((row) => {
        const company = totalOf(row.company);
        const partner = totalOf(row.partner);
        return (
          <div key={row.month} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
            <div className="w-full flex items-end justify-center gap-1 h-28">
              <div
                className="w-3 sm:w-4 rounded-t bg-cravora-purple"
                style={{ height: `${Math.max(company > 0 ? 8 : 0, (company / max) * 100)}%` }}
                title={`Company ${formatMoneyMap(row.company)}`}
              />
              <div
                className="w-3 sm:w-4 rounded-t bg-slate-500"
                style={{ height: `${Math.max(partner > 0 ? 8 : 0, (partner / max) * 100)}%` }}
                title={`Partner ${formatMoneyMap(row.partner)}`}
              />
            </div>
            <span className="text-[11px] text-gray-500 truncate w-full text-center">{row.month.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SpendCharts({ breakdown, title = 'Spend reports' }: { breakdown?: SpendBreakdown | null; title?: string }) {
  if (!breakdown) return null;
  const company = breakdown.company || {};
  const partner = breakdown.partner || {};
  const companyTotal = totalOf(company);
  const partnerTotal = totalOf(partner);
  const compareMax = Math.max(companyTotal, partnerTotal, 1);
  const partnerRows = breakdown.byPartner || [];
  const categoryRows = (breakdown.byCategory || []).slice(0, 8);
  const categoryMax = Math.max(1, ...categoryRows.map((row) => (row.companyINR || 0) + (row.partnerINR || 0)));
  const partnerMax = Math.max(1, ...partnerRows.map((row) => totalOf(row)));
  const hasUsd = (company.USD || 0) + (partner.USD || 0) > 0;
  const empty = companyTotal <= 0 && partnerTotal <= 0;

  return (
    <section className="bg-white rounded-2xl shadow-lg p-6 mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-500 mt-1">Company funds vs money a partner paid personally. INR bars are shown separately from any USD totals.</p>
        </div>
        <div className="flex gap-4 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-cravora-purple" /> Company</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-500" /> Partner</span>
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-gray-500">No expenses in this date range yet.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Company vs partner</h3>
            <BarRow label="Company funds" company={company.INR || 0} partner={0} max={compareMax} />
            <BarRow label="Paid by partners" company={0} partner={partner.INR || 0} max={compareMax} />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Company</p>
                <p className="font-semibold text-gray-800">{formatMoneyMap(company)}</p>
              </div>
              <div className="rounded-xl bg-slate-100 px-3 py-2">
                <p className="text-xs text-gray-500">Partners</p>
                <p className="font-semibold text-gray-800">{formatMoneyMap(partner)}</p>
              </div>
            </div>
            {hasUsd && <p className="text-xs text-amber-700">USD amounts are included in the totals above and are not mixed into the INR bars.</p>}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">By month</h3>
            <MonthBars rows={breakdown.byMonth || []} />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Partner spend</h3>
            {partnerRows.length === 0 && <p className="text-sm text-gray-500">No partner-paid expenses in this period.</p>}
            {partnerRows.map((row) => (
              <BarRow key={row.name} label={row.name} company={0} partner={row.INR || 0} max={partnerMax} />
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">By category</h3>
            {categoryRows.length === 0 && <p className="text-sm text-gray-500">No categories in this period.</p>}
            {categoryRows.map((row) => (
              <BarRow
                key={row.category}
                label={row.category}
                company={row.companyINR || 0}
                partner={row.partnerINR || 0}
                max={categoryMax}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
