import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from "../contexts/AuthContext";
import Navbar from '../components/Navbar';
import TransactionForm from '../components/TransactionForm';
import InsightsCard from '../components/InsightsCard';
import BudgetGoalsWidget from '../components/BudgetGoalsWidget';
import MonthlyComparisonCard from '../components/MonthlyComparisonCard';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, Crown,
  Plus, Minus, BarChart3, Target, FileDown, Loader2,
  ShoppingCart, Home, Utensils, Car, Gamepad2, ShoppingBag, Briefcase, DollarSign,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', AUD: 'A$', CAD: 'C$' };

const CATEGORY_ICONS = {
  'Rent/Mortgage': Home, 'Food & Dining': Utensils, 'Transportation': Car,
  'Groceries': ShoppingCart, 'Entertainment': Gamepad2, 'Shopping': ShoppingBag,
  'Salary': Briefcase, 'Freelance': DollarSign, 'Investments': TrendingUp,
  'default': ShoppingCart,
};

const PIE_COLORS = ['#818cf8', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#fb923c', '#f87171', '#22d3ee', '#a78bfa'];

const formatAmt = (v) => Math.round(Number(v) || 0).toLocaleString();

// Tooltips defined at module scope (not inside render) to avoid React
// destroying the subtree on every parent re-render.
const CustomTooltipPie = ({ active, payload, sym }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{payload[0].name}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{sym}{formatAmt(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

const CustomTooltipBar = ({ active, payload, label, sym }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{sym}{formatAmt(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

const CustomTooltipTrend = ({ active, payload, label, sym }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-sm" style={{ color: p.color }}>
            {p.name}: {sym}{formatAmt(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formDefaultType, setFormDefaultType] = useState('expense');
  const [currency, setCurrency] = useState('INR');
  const [categoryData, setCategoryData] = useState([]);
  const [trends, setTrends] = useState([]);
  const [insights, setInsights] = useState([]);
  const [goals, setGoals] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const sym = CURRENCY_SYMBOLS[currency] || '\u20B9';

  const handleDownloadReport = async () => {
    try {
      setDownloadingPdf(true);
      toast.info('Generating your report…');
      const resp = await axios.get(`${API}/reports/pdf`, {
        headers: getAuthHeaders(),
        responseType: 'blob',
      });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const monthLabel = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }).replace(' ', '-');
      a.href = url;
      a.download = `BudgetWise_Report_${monthLabel}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (err) {
      console.error('PDF download failed', err);
      toast.error(err.response?.data?.detail || 'Failed to generate report');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const opts = { headers };
      const [kpiRes, txnRes, setRes, catRes, trendRes, insightRes, goalsRes, compRes] = await Promise.all([
        axios.get(`${API}/analytics/dashboard-kpis`, opts),
        axios.get(`${API}/transactions?limit=5`, opts),
        axios.get(`${API}/settings`, opts),
        axios.get(`${API}/analytics/spending-by-category?period=month`, opts),
        axios.get(`${API}/analytics/monthly-trends?months=6`, opts),
        axios.get(`${API}/analytics/insights`, opts),
        axios.get(`${API}/budget-goals`, opts),
        axios.get(`${API}/analytics/monthly-comparison`, opts),
      ]);
      setKpis(kpiRes.data);
      setTransactions(txnRes.data.transactions);
      setCurrency(setRes.data.currency || 'INR');
      setCategoryData(catRes.data || []);
      setTrends(trendRes.data || []);
      setInsights(insightRes.data?.insights || []);
      setGoals(goalsRes.data || []);
      setComparison(compRes.data || null);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const formatAmount = (n) => {
    if (n === null || n === undefined) return '0';
    if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return new Intl.NumberFormat('en-IN').format(Math.round(n));
    return n.toFixed(0);
  };

  const handleTransactionAdded = () => {
    setShowForm(false);
    fetchData();
    toast.success('Transaction added!');
  };

  const kpiCards = kpis ? [
    {
      label: 'TOTAL INCOME', value: `${sym}${formatAmount(kpis.total_income)}`,
      sub: 'This month',
      color: 'border-l-emerald-500', textColor: 'text-emerald-600 dark:text-emerald-400',
      icon: TrendingUp, iconBg: 'bg-emerald-50 dark:bg-emerald-500/15',
      testid: 'kpi-income',
    },
    {
      label: 'TOTAL EXPENSES', value: `${sym}${formatAmount(kpis.total_expenses)}`,
      sub: 'This month',
      color: 'border-l-red-500', textColor: 'text-red-500 dark:text-red-400',
      icon: TrendingDown, iconBg: 'bg-red-50 dark:bg-red-500/15',
      testid: 'kpi-expenses',
    },
    {
      label: 'NET SAVINGS', value: `${sym}${formatAmount(kpis.net_savings)}`,
      sub: kpis.net_savings >= 0 ? 'Surplus' : 'Deficit',
      color: 'border-l-violet-500', textColor: 'text-violet-600 dark:text-violet-400',
      icon: Wallet, iconBg: 'bg-violet-50 dark:bg-violet-500/15',
      testid: 'kpi-net-savings',
    },
    {
      label: 'SAVINGS RATE', value: `${(kpis.savings_rate || 0).toFixed(1)}%`,
      sub: kpis.savings_rate >= 20 ? 'Healthy' : kpis.savings_rate >= 10 ? 'Average' : 'Improve',
      color: 'border-l-indigo-500', textColor: 'text-indigo-600 dark:text-indigo-400',
      icon: PiggyBank, iconBg: 'bg-indigo-50 dark:bg-indigo-500/15',
      testid: 'kpi-savings-rate',
    },
  ] : [];

  const incomeExpenseData = kpis ? [
    { name: 'Income', value: kpis.total_income },
    { name: 'Expenses', value: kpis.total_expenses },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="dashboard-page">
      <Navbar onAddTransaction={() => { setFormDefaultType('expense'); setShowForm(true); }} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Section 1: KPI Cards */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
              This Month&apos;s Overview
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              A pulse on your income, spending and savings — updated in real time.
            </p>
          </div>
          <Button
            onClick={handleDownloadReport}
            disabled={downloadingPdf || loading}
            className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white rounded-lg shadow-sm hover:shadow-md transition-all px-5 h-11 font-semibold disabled:opacity-60"
            data-testid="generate-pdf-report-btn"
          >
            {downloadingPdf ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Generating…</>
            ) : (
              <><FileDown size={16} className="mr-2" /> Generate Report</>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" data-testid="kpi-cards">
          {(loading && !kpis) ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-6 animate-pulse">
                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded mb-3"></div>
                <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded mb-2"></div>
                <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
              </div>
            ))
          ) : (
            kpiCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={i}
                  className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 ${card.color} border-l-4 p-6 hover:shadow-md transition-shadow duration-200`}
                  data-testid={card.testid}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 ${card.iconBg} rounded-lg flex items-center justify-center`}>
                      <Icon size={20} className={card.textColor} />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{card.label}</span>
                  </div>
                  <div className={`text-3xl font-extrabold ${card.textColor} mb-1`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {card.value}
                  </div>
                  <p className="text-sm text-slate-400 dark:text-slate-500">{card.sub}</p>
                </div>
              );
            })
          )}
        </div>

        {/* Top Category + Monthly Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* Top Spending Category */}
          <div
            className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 rounded-xl shadow-sm border border-amber-100 dark:border-amber-500/20 p-6"
            data-testid="top-category-card"
          >
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Crown size={16} /> Top Spending Category
            </h3>
            {kpis?.top_category ? (
              <>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  {kpis.top_category.category}
                </p>
                <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {sym}{formatAmount(kpis.top_category.amount)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Highest expense this month</p>
              </>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-6">No expenses recorded yet.</p>
            )}
          </div>

          {/* Monthly Comparison spans 2 columns */}
          <div className="lg:col-span-2">
            <MonthlyComparisonCard data={comparison} currencySymbol={sym} />
          </div>
        </div>

        {/* Section 2: AI Insights */}
        <div className="mb-10">
          <InsightsCard insights={insights} />
        </div>

        {/* Section 3: Charts */}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Financial Insights
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* Income vs Expenses Donut */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6" data-testid="chart-income-vs-expense">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Income vs Expenses</h3>
            {incomeExpenseData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={incomeExpenseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill="#34d399" />
                      <Cell fill="#f87171" />
                    </Pie>
                    <Tooltip content={<CustomTooltipPie sym={sym} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Income</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Expenses</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                No data this month
              </div>
            )}
          </div>

          {/* Spending by Category */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6" data-testid="chart-spending-by-category">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Top Spending Categories</h3>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData.slice(0, 5)} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${sym}${formatAmount(v)}`} />
                  <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltipBar sym={sym} />} />
                  <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={18}>
                    {categoryData.slice(0, 5).map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                No expense data this month
              </div>
            )}
          </div>

          {/* Monthly Trends */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6" data-testid="chart-monthly-trends">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Monthly Trends</h3>
            {trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trends} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${sym}${formatAmount(v)}`} />
                  <Tooltip content={<CustomTooltipTrend sym={sym} />} />
                  <Area type="monotone" dataKey="income" name="Income" stroke="#34d399" strokeWidth={2} fill="url(#dashIncomeGrad)" />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f87171" strokeWidth={2} fill="url(#dashExpenseGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                No trend data available
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Budget Goals */}
        <div className="mb-10">
          <BudgetGoalsWidget goals={goals} currencySymbol={sym} />
        </div>

        {/* Section 5: Recent Transactions */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Recent Transactions
          </h2>
          <Button
            variant="default"
            className="bg-indigo-500 hover:bg-indigo-600 rounded-lg text-sm"
            onClick={() => navigate('/transactions')}
            data-testid="view-all-transactions-btn"
          >
            View All
          </Button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800 mb-10">
          {transactions.length === 0 ? (
            <div className="p-10 text-center text-slate-400 dark:text-slate-500">
              <Wallet size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p>No transactions yet. Add your first transaction!</p>
            </div>
          ) : (
            transactions.map(txn => {
              const IconComp = CATEGORY_ICONS[txn.category] || CATEGORY_ICONS.default;
              const isIncome = txn.type === 'income';
              return (
                <div key={txn.txn_id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors" data-testid={`transaction-${txn.txn_id}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isIncome ? 'bg-emerald-50 dark:bg-emerald-500/15' : 'bg-red-50 dark:bg-red-500/15'}`}>
                      <IconComp size={18} className={isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{txn.description}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{txn.category} &middot; {new Date(txn.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <span className={`font-bold text-base ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {isIncome ? '+' : '-'}{sym}{formatAmount(txn.amount)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Actions */}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-5" style={{ fontFamily: 'Manrope, sans-serif' }}>Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Add Income', icon: Plus, color: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20', iconColor: 'text-emerald-600 dark:text-emerald-400', action: () => { setFormDefaultType('income'); setShowForm(true); } },
            { label: 'Add Expense', icon: Minus, color: 'bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20', iconColor: 'text-red-500 dark:text-red-400', action: () => { setFormDefaultType('expense'); setShowForm(true); } },
            { label: 'View Reports', icon: BarChart3, color: 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20', iconColor: 'text-indigo-600 dark:text-indigo-400', action: () => navigate('/reports') },
            { label: 'Budget Goals', icon: Target, color: 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/10 dark:hover:bg-orange-500/20', iconColor: 'text-orange-500 dark:text-orange-400', action: () => navigate('/goals') },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={item.action}
                className={`${item.color} rounded-xl border border-slate-100 dark:border-slate-800 p-6 text-center transition-all hover:shadow-md hover:-translate-y-0.5`}
                data-testid={`quick-action-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon size={28} className={`${item.iconColor} mx-auto mb-3`} />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.label}</span>
              </button>
            );
          })}
        </div>
      </main>

      <TransactionForm open={showForm} onClose={() => setShowForm(false)} onSuccess={handleTransactionAdded} currency={currency} defaultType={formDefaultType} />
    </div>
  );
}
