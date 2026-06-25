import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from "../contexts/AuthContext";
import Navbar from '../components/Navbar';
import TransactionForm from '../components/TransactionForm';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import {
  Search, Download, Trash2, Pencil, ChevronLeft, ChevronRight, RotateCcw, Filter,
  ShoppingCart, Home, Utensils, Car, Gamepad2, ShoppingBag, Briefcase, DollarSign, TrendingUp,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', AUD: 'A$', CAD: 'C$' };

const CATEGORY_ICONS = {
  'Rent/Mortgage': Home, 'Food & Dining': Utensils, 'Transportation': Car,
  'Groceries': ShoppingCart, 'Entertainment': Gamepad2, 'Shopping': ShoppingBag,
  'Salary': Briefcase, 'Freelance': DollarSign, 'Investments': TrendingUp, 'default': ShoppingCart,
};

const ALL_CATEGORIES = [
  'Salary', 'Freelance', 'Investments', 'Business', 'Gifts',
  'Rent/Mortgage', 'Food & Dining', 'Transportation', 'Groceries',
  'Entertainment', 'Shopping', 'Utilities', 'Healthcare', 'Education',
  'Insurance', 'Travel', 'Subscriptions', 'Personal Care', 'Other',
];

const DATE_PRESETS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'Current Month' },
  { value: 'custom', label: 'Custom Range' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const offsetStr = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const DEFAULT_FILTERS = {
  type: 'all',
  category: 'all',
  search: '',
  datePreset: 'all',
  startDate: '',
  endDate: '',
  minAmount: '',
  maxAmount: '',
};

export default function TransactionsPage() {
  const { getAuthHeaders } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editTxn, setEditTxn] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [currency, setCurrency] = useState('INR');
  const limit = 10;
  const sym = CURRENCY_SYMBOLS[currency] || '\u20B9';
  const debounceRef = useRef(null);

  const computeDateRange = (preset, customStart, customEnd) => {
    switch (preset) {
      case 'today': return { startDate: todayStr(), endDate: todayStr() };
      case '7d': return { startDate: offsetStr(6), endDate: todayStr() };
      case '30d': return { startDate: offsetStr(29), endDate: todayStr() };
      case 'month': return { startDate: firstOfMonth(), endDate: todayStr() };
      case 'custom': return { startDate: customStart || '', endDate: customEnd || '' };
      default: return { startDate: '', endDate: '' };
    }
  };

  const fetchTransactions = useCallback(async (currentFilters, currentPage) => {
    try {
      const params = { limit, skip: currentPage * limit };
      if (currentFilters.type !== 'all') params.type = currentFilters.type;
      if (currentFilters.category !== 'all') params.category = currentFilters.category;
      const { startDate, endDate } = computeDateRange(currentFilters.datePreset, currentFilters.startDate, currentFilters.endDate);
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (currentFilters.minAmount !== '' && !isNaN(parseFloat(currentFilters.minAmount))) {
        params.min_amount = parseFloat(currentFilters.minAmount);
      }
      if (currentFilters.maxAmount !== '' && !isNaN(parseFloat(currentFilters.maxAmount))) {
        params.max_amount = parseFloat(currentFilters.maxAmount);
      }
      if (currentFilters.search.trim()) params.search = currentFilters.search.trim();

      const resp = await axios.get(`${API}/transactions`, {
        params, headers: getAuthHeaders(),
      });
      setTransactions(resp.data.transactions);
      setTotal(resp.data.total);
    } catch (err) {
      console.error(err);
    }
  }, [getAuthHeaders]);

  const fetchCurrency = useCallback(async () => {
    try {
      const resp = await axios.get(`${API}/settings`, { headers: getAuthHeaders() });
      setCurrency(resp.data.currency || 'INR');
    } catch {
      // fall back to default currency below
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchCurrency(); }, [fetchCurrency]);

  // Debounce search + amount inputs; immediate for selects
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTransactions(filters, page);
    }, 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [filters, page, fetchTransactions]);

  const updateFilter = (key, value) => {
    setPage(0);
    setFilters(f => ({ ...f, [key]: value }));
  };

  const resetFilters = () => {
    setPage(0);
    setFilters(DEFAULT_FILTERS);
    toast.success('Filters cleared');
  };

  const handleDelete = async (txnId) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await axios.delete(`${API}/transactions/${txnId}`, { headers: getAuthHeaders() });
      toast.success('Transaction deleted');
      fetchTransactions(filters, page);
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (filters.type !== 'all') params.type = filters.type;
      if (filters.category !== 'all') params.category = filters.category;
      const { startDate, endDate } = computeDateRange(filters.datePreset, filters.startDate, filters.endDate);
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (filters.minAmount !== '' && !isNaN(parseFloat(filters.minAmount))) {
        params.min_amount = parseFloat(filters.minAmount);
      }
      if (filters.maxAmount !== '' && !isNaN(parseFloat(filters.maxAmount))) {
        params.max_amount = parseFloat(filters.maxAmount);
      }
      if (filters.search.trim()) params.search = filters.search.trim();

      const resp = await axios.get(`${API}/transactions/export`, {
        params, headers: getAuthHeaders(), responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transactions.csv';
      a.click();
      const activeCount = Object.keys(params).length;
      toast.success(activeCount > 0 ? `CSV exported (${activeCount} filter${activeCount > 1 ? 's' : ''} applied)` : 'CSV exported!');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditTxn(null);
    fetchTransactions(filters, page);
    toast.success(editTxn ? 'Transaction updated!' : 'Transaction added!');
  };

  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const isCustom = filters.datePreset === 'custom';
  const activeFilterCount = [
    filters.type !== 'all',
    filters.category !== 'all',
    filters.search.trim() !== '',
    filters.datePreset !== 'all',
    filters.minAmount !== '',
    filters.maxAmount !== '',
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="transactions-page">
      <Navbar onAddTransaction={() => { setEditTxn(null); setShowForm(true); }} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
              All Transactions
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {total} transaction{total !== 1 ? 's' : ''} {activeFilterCount > 0 && `\u00b7 ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active`}
            </p>
          </div>
          <Button onClick={handleExport} variant="outline" className="rounded-lg border-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" data-testid="export-csv-btn">
            <Download size={16} className="mr-2" /> Export CSV
          </Button>
        </div>

        {/* Advanced Filter Panel */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-5 mb-6" data-testid="filter-panel">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-indigo-500 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filters</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400"
              data-testid="reset-filters-btn"
              disabled={activeFilterCount === 0}
            >
              <RotateCcw size={14} className="mr-1" /> Reset
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">Search</Label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                <Input
                  placeholder="Search by description or category..."
                  className="pl-10 h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  value={filters.search}
                  onChange={e => updateFilter('search', e.target.value)}
                  data-testid="search-transactions-input"
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">Type</Label>
              <Select value={filters.type} onValueChange={v => updateFilter('type', v)}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="filter-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectItem value="all" className="dark:text-slate-200 dark:focus:bg-slate-700">All Types</SelectItem>
                  <SelectItem value="income" className="dark:text-slate-200 dark:focus:bg-slate-700">Income</SelectItem>
                  <SelectItem value="expense" className="dark:text-slate-200 dark:focus:bg-slate-700">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">Category</Label>
              <Select value={filters.category} onValueChange={v => updateFilter('category', v)}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="filter-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700 max-h-64">
                  <SelectItem value="all" className="dark:text-slate-200 dark:focus:bg-slate-700">All Categories</SelectItem>
                  {ALL_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c} className="dark:text-slate-200 dark:focus:bg-slate-700">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date preset */}
            <div>
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">Date Range</Label>
              <Select value={filters.datePreset} onValueChange={v => updateFilter('datePreset', v)}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="filter-date-preset-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {DATE_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value} className="dark:text-slate-200 dark:focus:bg-slate-700">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Min Amount */}
            <div>
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">Min Amount ({sym})</Label>
              <Input
                type="number"
                placeholder="0"
                value={filters.minAmount}
                onChange={e => updateFilter('minAmount', e.target.value)}
                className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                data-testid="filter-min-amount-input"
              />
            </div>

            {/* Max Amount */}
            <div>
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">Max Amount ({sym})</Label>
              <Input
                type="number"
                placeholder="No limit"
                value={filters.maxAmount}
                onChange={e => updateFilter('maxAmount', e.target.value)}
                className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                data-testid="filter-max-amount-input"
              />
            </div>

            {/* Custom dates */}
            {isCustom && (
              <>
                <div>
                  <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">From</Label>
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={e => updateFilter('startDate', e.target.value)}
                    className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    data-testid="filter-start-date-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">To</Label>
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={e => updateFilter('endDate', e.target.value)}
                    className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    data-testid="filter-end-date-input"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="transactions-table">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No transactions found</td>
                  </tr>
                ) : transactions.map(txn => {
                  const IconComp = CATEGORY_ICONS[txn.category] || CATEGORY_ICONS.default;
                  const isIncome = txn.type === 'income';
                  return (
                    <tr key={txn.txn_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors" data-testid={`txn-row-${txn.txn_id}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isIncome ? 'bg-emerald-50 dark:bg-emerald-500/15' : 'bg-red-50 dark:bg-red-500/15'}`}>
                            <IconComp size={16} className={isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} />
                          </div>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{txn.description}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isIncome ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400'}`}>
                          {txn.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{new Date(txn.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {isIncome ? '+' : '-'}{sym}{new Intl.NumberFormat('en-IN').format(txn.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => { setEditTxn(txn); setShowForm(true); }} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 transition-colors" data-testid={`edit-txn-${txn.txn_id}`}>
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleDelete(txn.txn_id)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors" data-testid={`delete-txn-${txn.txn_id}`}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400">Page {page + 1} of {totalPages} ({total} total)</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="prev-page-btn">
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="next-page-btn">
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <TransactionForm open={showForm} onClose={() => { setShowForm(false); setEditTxn(null); }} onSuccess={handleSuccess} editTransaction={editTxn} currency={currency} />
    </div>
  );
}
