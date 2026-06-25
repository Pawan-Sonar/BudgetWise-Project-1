import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "../contexts/AuthContext";
import Navbar from '../components/Navbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, CalendarDays, ArrowLeft
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', AUD: 'A$', CAD: 'C$' };
const PIE_COLORS = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#fb923c', '#f87171', '#22d3ee', '#818cf8'];

export default function ReportsPage() {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [categoryData, setCategoryData] = useState([]);
  const [incomeVsExpense, setIncomeVsExpense] = useState(null);
  const [trends, setTrends] = useState([]);
  const [currency, setCurrency] = useState('INR');
  const sym = CURRENCY_SYMBOLS[currency] || '\u20B9';

  const fetchAll = async () => {
    try {
      const headers = getAuthHeaders();
      const opts = { headers };
      const [sumRes, catRes, iveRes, trendRes, setRes] = await Promise.all([
        axios.get(`${API}/analytics/summary?period=${period}`, opts),
        axios.get(`${API}/analytics/spending-by-category?period=${period}`, opts),
        axios.get(`${API}/analytics/income-vs-expenses?period=${period}`, opts),
        axios.get(`${API}/analytics/monthly-trends?months=6`, opts),
        axios.get(`${API}/settings`, opts),
      ]);
      setSummary(sumRes.data);
      setCategoryData(catRes.data);
      setIncomeVsExpense(iveRes.data);
      setTrends(trendRes.data);
      setCurrency(setRes.data.currency || 'INR');
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchAll(); }, [period]);

  const formatAmount = (n) => `${sym}${new Intl.NumberFormat('en-IN').format(Math.round(n))}`;

  const summaryCards = summary ? [
    { label: 'TOTAL INCOME', value: summary.total_income, sub: `${summary.income_count} transactions`, border: 'border-l-emerald-500', text: 'text-emerald-600', icon: TrendingUp, iconBg: 'bg-emerald-50' },
    { label: 'TOTAL EXPENSES', value: summary.total_expenses, sub: `${summary.expense_count} transactions`, border: 'border-l-red-500', text: 'text-red-500', icon: TrendingDown, iconBg: 'bg-red-50' },
    { label: 'NET BALANCE', value: summary.net_balance, sub: summary.status, border: 'border-l-violet-500', text: 'text-violet-600', icon: Wallet, iconBg: 'bg-violet-50' },
    { label: 'THIS MONTH', value: summary.total_transactions, sub: 'Total transactions', border: 'border-l-orange-400', text: 'text-orange-500', icon: CalendarDays, iconBg: 'bg-orange-50', isCount: true },
  ] : [];

  const barData = incomeVsExpense ? [
    { name: 'Income', value: incomeVsExpense.income, fill: '#10b981' },
    { name: 'Expenses', value: incomeVsExpense.expenses, fill: '#ef4444' },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="reports-page">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" className="rounded-lg border-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn">
              <ArrowLeft size={16} className="mr-1" /> Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Financial Analytics & Reports</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Period:</span>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[160px] rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="period-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                <SelectItem value="week" className="dark:text-slate-200 dark:focus:bg-slate-700">This Week</SelectItem>
                <SelectItem value="month" className="dark:text-slate-200 dark:focus:bg-slate-700">This Month</SelectItem>
                <SelectItem value="year" className="dark:text-slate-200 dark:focus:bg-slate-700">This Year</SelectItem>
                <SelectItem value="all" className="dark:text-slate-200 dark:focus:bg-slate-700">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {summaryCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 ${card.border} border-l-4 p-6 hover:shadow-md transition-shadow`} data-testid={`report-card-${i}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-9 h-9 ${card.iconBg} dark:opacity-90 rounded-lg flex items-center justify-center`}>
                    <Icon size={18} className={card.text} />
                  </div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{card.label}</span>
                </div>
                <div className={`text-3xl font-extrabold ${card.text}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {card.isCount ? card.value : formatAmount(card.value)}
                </div>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{card.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* Spending by Category - Pie Chart */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6" data-testid="pie-chart-card">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6" style={{ fontFamily: 'Manrope, sans-serif' }}>Spending by Category</h3>
            {categoryData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500">No expense data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''}
                    labelLine={false}
                  >
                    {categoryData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatAmount(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Income vs Expenses - Bar Chart */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6" data-testid="bar-chart-card">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6" style={{ fontFamily: 'Manrope, sans-serif' }}>Income vs Expenses</h3>
            {!incomeVsExpense || (incomeVsExpense.income === 0 && incomeVsExpense.expenses === 0) ? (
              <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis tickFormatter={v => `${sym}${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatAmount(value)} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={60}>
                    {barData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Monthly Trends - Line/Area Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6" data-testid="trends-chart-card">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6" style={{ fontFamily: 'Manrope, sans-serif' }}>Monthly Trends</h3>
          {trends.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500">No trend data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(v) => {
                    const [y, m] = v.split('-');
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return `${months[parseInt(m)-1]} ${y}`;
                  }}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tickFormatter={v => `${sym}${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) => [formatAmount(value), name === 'income' ? 'Income' : 'Expenses']}
                  labelFormatter={(v) => {
                    const [y, m] = v.split('-');
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return `${months[parseInt(m)-1]} ${y}`;
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2.5} name="Income" dot={{ fill: '#10b981', r: 4 }} />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#expenseGrad)" strokeWidth={2.5} name="Expenses" dot={{ fill: '#ef4444', r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </main>
    </div>
  );
}
