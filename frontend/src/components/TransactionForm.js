import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "../contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', AUD: 'A$', CAD: 'C$' };

const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investments', 'Business', 'Gifts', 'Other'];
const EXPENSE_CATEGORIES = [
  'Rent/Mortgage', 'Food & Dining', 'Transportation', 'Groceries',
  'Entertainment', 'Shopping', 'Utilities', 'Healthcare',
  'Education', 'Insurance', 'Travel', 'Subscriptions', 'Personal Care', 'Other'
];

export default function TransactionForm({ open, onClose, onSuccess, editTransaction, currency = 'INR', defaultType = 'expense' }) {
  const { getAuthHeaders } = useAuth();
  const sym = CURRENCY_SYMBOLS[currency] || '\u20B9';
  const isEdit = !!editTransaction;

  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    category: '',
    description: '',
    date: new Date(),
    account_id: '',
  });
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (open) {
      // Fetch accounts when dialog opens
      const fetchAccounts = async () => {
        try {
          const resp = await axios.get(`${API}/accounts`, { headers: getAuthHeaders() });
          setAccounts(resp.data || []);
        } catch (err) {
          console.error('Failed to fetch accounts', err);
        }
      };
      fetchAccounts();
    }
  }, [open]);

  useEffect(() => {
    if (editTransaction) {
      setForm({
        type: editTransaction.type,
        amount: String(editTransaction.amount),
        category: editTransaction.category,
        description: editTransaction.description,
        date: new Date(editTransaction.date),
        account_id: editTransaction.account_id || '',
      });
    } else {
      setForm({ type: defaultType || 'expense', amount: '', category: '', description: '', date: new Date(), account_id: '' });
    }
  }, [editTransaction, open, defaultType]);

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = async () => {
    if (!form.amount || !form.category || !form.description) {
      toast.error('Please fill in all fields');
      return;
    }
    try {
      const payload = {
        type: form.type,
        amount: parseFloat(form.amount),
        category: form.category,
        description: form.description,
        date: format(form.date, 'yyyy-MM-dd'),
        account_id: form.account_id || null,
      };
      if (isEdit) {
        await axios.put(`${API}/transactions/${editTransaction.txn_id}`, payload, {
          headers: getAuthHeaders(),
        });
      } else {
        await axios.post(`${API}/transactions`, payload, {
          headers: getAuthHeaders(),
        });
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save transaction');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900 dark:border-slate-800 rounded-xl" data-testid="transaction-form-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
            {isEdit ? 'Edit Transaction' : 'Add Transaction'}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            {isEdit ? 'Update the transaction details below.' : 'Fill in the details to add a new transaction.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Type Toggle */}
          <div className="flex gap-2" data-testid="txn-type-toggle">
            <button
              onClick={() => setForm(f => ({ ...f, type: 'income', category: '' }))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                form.type === 'income'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              data-testid="txn-type-income"
            >
              Income
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, type: 'expense', category: '' }))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                form.type === 'expense'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              data-testid="txn-type-expense"
            >
              Expense
            </button>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Amount ({sym})</Label>
            <Input
              type="number"
              placeholder="0.00"
              className="h-11 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-lg font-semibold"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              data-testid="txn-amount-input"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="h-11 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="txn-category-select">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                {categories.map(c => (
                  <SelectItem key={c} value={c} className="dark:text-slate-200 dark:focus:bg-slate-700 dark:focus:text-white">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account (optional) */}
          {accounts.length > 0 && (
            <div className="space-y-2">
              <Label className="dark:text-slate-300">Account <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span></Label>
              <Select value={form.account_id} onValueChange={v => setForm(f => ({ ...f, account_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="h-11 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="txn-account-select">
                  <SelectValue placeholder="No account" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectItem value="__none__" className="dark:text-slate-200 dark:focus:bg-slate-700">No account</SelectItem>
                  {accounts.map(acc => (
                    <SelectItem key={acc.account_id} value={acc.account_id} className="dark:text-slate-200 dark:focus:bg-slate-700">
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Description</Label>
            <Input
              placeholder="e.g. Monthly rent payment"
              className="h-11 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              data-testid="txn-description-input"
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full h-11 justify-start rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-left font-normal" data-testid="txn-date-picker">
                  <CalendarIcon size={16} className="mr-2 text-slate-400" />
                  {format(form.date, 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white dark:bg-slate-800 dark:border-slate-700" align="start">
                <Calendar
                  mode="single"
                  selected={form.date}
                  onSelect={d => d && setForm(f => ({ ...f, date: d }))}
                  initialFocus
                  className="dark:text-white"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-lg dark:border-slate-700 dark:text-slate-300" data-testid="cancel-txn-btn">Cancel</Button>
          <Button onClick={handleSubmit} className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg" data-testid="save-txn-btn">
            {isEdit ? 'Update' : 'Add Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
