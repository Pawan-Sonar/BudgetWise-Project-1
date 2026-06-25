import React from 'react';
import {
  TrendingUp, TrendingDown, PiggyBank, AlertCircle, AlertTriangle,
  Award, Leaf, ThumbsUp, Lightbulb, Info, Sparkles, Brain,
} from 'lucide-react';

const ICONS = {
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'piggy-bank': PiggyBank,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'award': Award,
  'leaf': Leaf,
  'thumbs-up': ThumbsUp,
  'lightbulb': Lightbulb,
  'info': Info,
  'sparkles': Sparkles,
};

const DIRECTION_STYLES = {
  up: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    icon: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-l-emerald-400',
  },
  down: {
    bg: 'bg-red-50 dark:bg-red-500/15',
    icon: 'text-red-500 dark:text-red-400',
    border: 'border-l-red-400',
  },
  warning: {
    bg: 'bg-orange-50 dark:bg-orange-500/15',
    icon: 'text-orange-500 dark:text-orange-400',
    border: 'border-l-orange-400',
  },
  new: {
    bg: 'bg-violet-50 dark:bg-violet-500/15',
    icon: 'text-violet-500 dark:text-violet-400',
    border: 'border-l-violet-400',
  },
  neutral: {
    bg: 'bg-indigo-50 dark:bg-indigo-500/15',
    icon: 'text-indigo-500 dark:text-indigo-400',
    border: 'border-l-indigo-400',
  },
};

export default function InsightsCard({ insights = [] }) {
  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6"
      data-testid="ai-insights-card"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
          <Brain size={20} className="text-white" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
            AI Financial Insights
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Personalized analysis of your spending</p>
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Add transactions to see insights.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="insights-list">
          {insights.map((ins, idx) => {
            const style = DIRECTION_STYLES[ins.direction] || DIRECTION_STYLES.neutral;
            const Icon = ICONS[ins.icon] || Info;
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 ${style.bg} ${style.border} border-l-4 rounded-lg p-3 hover:shadow-sm transition-shadow`}
                data-testid={`insight-item-${idx}`}
              >
                <div className={`w-8 h-8 shrink-0 rounded-lg bg-white/70 dark:bg-slate-900/40 flex items-center justify-center`}>
                  <Icon size={16} className={style.icon} />
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug pt-1">
                  {ins.message}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
