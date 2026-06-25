import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Target, AlertTriangle, ChevronRight } from 'lucide-react';

export default function BudgetGoalsWidget({ goals = [], currencySymbol = '\u20B9' }) {
  const navigate = useNavigate();
  const visible = goals.slice(0, 4);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6"
      data-testid="dashboard-budget-goals"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-500/15 flex items-center justify-center">
            <Target size={20} className="text-orange-500 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Budget Goals
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Monthly limits & progress</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
          onClick={() => navigate('/goals')}
          data-testid="dashboard-manage-goals-btn"
        >
          Manage <ChevronRight size={14} className="ml-1" />
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="py-10 text-center">
          <Target size={36} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No budget goals yet</p>
          <Button
            onClick={() => navigate('/goals')}
            className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg"
            data-testid="dashboard-create-goal-btn"
            size="sm"
          >
            Create your first goal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="dashboard-goals-list">
          {visible.map((g) => {
            const limit = g.limit_amount || 0;
            const spent = g.spent || 0;
            const remaining = Math.max(limit - spent, 0);
            const pctRaw = limit > 0 ? (spent / limit) * 100 : 0;
            const pct = Math.min(pctRaw, 100);
            const isOver = spent > limit;
            const isWarn = pctRaw >= 80 && !isOver;
            const fmt = (n) => new Intl.NumberFormat('en-IN').format(Math.round(n));
            return (
              <div
                key={g.goal_id}
                className={`rounded-lg p-4 border ${
                  isOver
                    ? 'border-red-200 bg-red-50/40 dark:border-red-500/40 dark:bg-red-500/10'
                    : isWarn
                    ? 'border-orange-200 bg-orange-50/40 dark:border-orange-500/40 dark:bg-orange-500/10'
                    : 'border-slate-100 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-800/30'
                }`}
                data-testid={`dashboard-goal-${g.goal_id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{g.category}</p>
                  <span
                    className={`text-xs font-bold ${
                      isOver
                        ? 'text-red-500 dark:text-red-400'
                        : isWarn
                        ? 'text-orange-500 dark:text-orange-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {Math.round(pctRaw)}% used
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{currencySymbol}{fmt(spent)}</span>
                    {' '}of {currencySymbol}{fmt(limit)}
                  </span>
                  <span>
                    {isOver ? (
                      <span className="text-red-500 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle size={11} /> Over by {currencySymbol}{fmt(spent - limit)}
                      </span>
                    ) : (
                      <>{currencySymbol}{fmt(remaining)} left</>
                    )}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={`h-2 ${
                    isOver
                      ? '[&>div]:bg-red-500'
                      : isWarn
                      ? '[&>div]:bg-orange-400'
                      : '[&>div]:bg-emerald-500'
                  }`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
