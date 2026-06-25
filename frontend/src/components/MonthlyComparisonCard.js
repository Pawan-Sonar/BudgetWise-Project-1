import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

function GrowthBadge({ pct, invert = false }) {
  if (pct === null || pct === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500">
        <Minus size={11} /> N/A
      </span>
    );
  }
  const isUp = pct >= 0;
  // For expenses, "up" is bad; for income/savings, "up" is good.
  const good = invert ? !isUp : isUp;
  const cls = pct === 0
    ? 'text-slate-500'
    : good
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400';
  const Icon = pct === 0 ? Minus : isUp ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${cls}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      <Icon size={12} /> {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function MonthlyComparisonCard({ data, currencySymbol = '\u20B9' }) {
  if (!data) return null;
  const fmt = (n) => new Intl.NumberFormat('en-IN').format(Math.round(n || 0));
  const { current, previous, growth } = data;

  const rows = [
    { label: 'Income', curr: current.income, prev: previous.income, pct: growth.income_pct, invert: false },
    { label: 'Expenses', curr: current.expenses, prev: previous.expenses, pct: growth.expenses_pct, invert: true },
    { label: 'Net Savings', curr: current.net_savings, prev: previous.net_savings, pct: growth.savings_pct, invert: false },
  ];

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6"
      data-testid="monthly-comparison-card"
    >
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
        Monthly Comparison
      </h3>
      <div className="flex items-baseline justify-between text-xs text-slate-400 dark:text-slate-500 mb-4">
        <span>{previous.label}</span>
        <span className="text-slate-700 dark:text-slate-300 font-semibold">{current.label}</span>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between" data-testid={`comparison-row-${r.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">{r.label}</p>
              <p
                className="text-lg font-extrabold text-slate-800 dark:text-slate-200"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {currencySymbol}{fmt(r.curr)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 dark:text-slate-500">vs {currencySymbol}{fmt(r.prev)}</p>
              <GrowthBadge pct={r.pct} invert={r.invert} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
