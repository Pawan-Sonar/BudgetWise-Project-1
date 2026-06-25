import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "../contexts/AuthContext";
import Navbar from '../components/Navbar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Pencil, Wallet, Landmark, Banknote, CreditCard, PiggyBank, TrendingUp
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', AUD: 'A$', CAD: 'C$' };

const ACCOUNT_TYPE_META = {
  bank: { label: 'Bank Account', icon: Landmark, defaultColor: '#818cf8' },
  cash: { label: 'Cash', icon: Banknote, defaultColor: '#34d399' },
  credit_card: { label: 'Credit Card', icon: CreditCard, defaultColor: '#f472b6' },
  wallet: { label: 'Wallet', icon: Wallet, defaultColor: '#fbbf24' },
  savings: { label: 'Savings', icon: PiggyBank, defaultColor: '#60a5fa' },
  investment: { label: 'Investment', icon: TrendingUp, defaultColor: '#fb923c' },
};

const COLOR_OPTIONS = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#fb923c', '#f87171', '#22d3ee', '#a78bfa', '#4ade80',
];

export default function AccountsPage() {
  const { getAuthHeaders } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [currency, setCurrency] = useState('INR');
  const [form, setForm] = useState({
    name: '', account_type: 'bank', balance: '', color: '#818cf8',
  });

  const sym = CURRENCY_SYMBOLS[currency] || '\u20B9';

  const fetchAccounts = async () => {
    try {
      const [accRes, setRes] = await Promise.all([
        axios.get(`${API}/accounts`, { headers: getAuthHeaders() }),
        axios.get(`${API}/settings`, { headers: getAuthHeaders() }),
      ]);
      setAccounts(accRes.data);
      setCurrency(setRes.data.currency || 'INR');
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const openCreate = () => {
    setEditAccount(null);
    setForm({ name: '', account_type: 'bank', balance: '', color: '#818cf8' });
    setShowDialog(true);
  };

  const openEdit = (acc) => {
    setEditAccount(acc);
    setForm({
      name: acc.name,
      account_type: acc.account_type,
      balance: String(acc.balance),
      color: acc.color || '#818cf8',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.account_type) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      const payload = {
        name: form.name,
        account_type: form.account_type,
        balance: parseFloat(form.balance) || 0,
        color: form.color,
      };
      if (editAccount) {
        await axios.put(`${API}/accounts/${editAccount.account_id}`, payload, {
          headers: getAuthHeaders(),
        });
        toast.success('Account updated!');
      } else {
        await axios.post(`${API}/accounts`, payload, {
          headers: getAuthHeaders(),
        });
        toast.success('Account created!');
      }
      setShowDialog(false);
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save account');
    }
  };

  const handleDelete = async (accountId) => {
    if (!window.confirm('Delete this account? Transactions linked to it will be unlinked.')) return;
    try {
      await axios.delete(`${API}/accounts/${accountId}`, { headers: getAuthHeaders() });
      toast.success('Account deleted');
      fetchAccounts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

  const formatAmount = (n) => {
    if (n < 0) return `-${sym}${new Intl.NumberFormat('en-IN').format(Math.abs(Math.round(n)))}`;
    return `${sym}${new Intl.NumberFormat('en-IN').format(Math.round(n))}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="accounts-page">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Accounts</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your bank accounts, wallets, and more.</p>
          </div>
          <Button onClick={openCreate} className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg" data-testid="add-account-btn">
            <Plus size={16} className="mr-1" /> Add Account
          </Button>
        </div>

        {/* Total Balance Card */}
        <div className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 rounded-xl p-6 mb-8 text-white shadow-lg" data-testid="total-balance-card">
          <p className="text-sm font-medium opacity-80 uppercase tracking-wider">Total Balance</p>
          <p className="text-4xl font-extrabold mt-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {formatAmount(totalBalance)}
          </p>
          <p className="text-sm opacity-70 mt-1">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Account Cards */}
        {accounts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-16 text-center">
            <Wallet size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400 text-lg">No accounts yet</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Create an account to start organizing your finances.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accounts.map(acc => {
              const meta = ACCOUNT_TYPE_META[acc.account_type] || ACCOUNT_TYPE_META.wallet;
              const IconComp = meta.icon;
              return (
                <div
                  key={acc.account_id}
                  className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 hover:shadow-md transition-shadow relative overflow-hidden"
                  data-testid={`account-${acc.account_id}`}
                >
                  {/* Color accent */}
                  <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: acc.color || meta.defaultColor }}></div>

                  <div className="flex items-center justify-between mb-4 mt-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${acc.color || meta.defaultColor}20` }}>
                        <IconComp size={20} style={{ color: acc.color || meta.defaultColor }} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">{acc.name}</h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{meta.label}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(acc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 transition-colors"
                        data-testid={`edit-account-${acc.account_id}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(acc.account_id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                        data-testid={`delete-account-${acc.account_id}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">Balance</p>
                    <p className={`text-2xl font-extrabold ${acc.balance >= 0 ? 'text-slate-800 dark:text-white' : 'text-red-500'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatAmount(acc.balance)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add/Edit Account Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 dark:border-slate-800 rounded-xl" data-testid="account-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editAccount ? 'Edit Account' : 'Create Account'}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              {editAccount ? 'Update account details.' : 'Add a new financial account to track.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Account Name</Label>
              <Input
                placeholder="e.g. HDFC Savings"
                className="rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                data-testid="account-name-input"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Account Type</Label>
              <Select value={form.account_type} onValueChange={v => setForm(f => ({ ...f, account_type: v }))}>
                <SelectTrigger className="rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="account-type-select">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {Object.entries(ACCOUNT_TYPE_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key} className="dark:text-slate-200 dark:focus:bg-slate-700">{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Balance */}
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Initial Balance ({sym})</Label>
              <Input
                type="number"
                placeholder="0.00"
                className="rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                value={form.balance}
                onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
                data-testid="account-balance-input"
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-slate-800 dark:border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    data-testid={`color-${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-lg dark:border-slate-700 dark:text-slate-300" data-testid="cancel-account-btn">Cancel</Button>
            <Button onClick={handleSave} className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg" data-testid="save-account-btn">
              {editAccount ? 'Update' : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
