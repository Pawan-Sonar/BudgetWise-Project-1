import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "../contexts/AuthContext";
import Navbar from '../components/Navbar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Progress } from '../components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Target, AlertTriangle, Pencil } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', AUD: 'A$', CAD: 'C$' };

const EXPENSE_CATEGORIES = [
  'Rent/Mortgage', 'Food & Dining', 'Transportation', 'Groceries',
  'Entertainment', 'Shopping', 'Utilities', 'Healthcare',
  'Education', 'Insurance', 'Travel', 'Subscriptions', 'Personal Care', 'Other'
];

export default function BudgetGoalsPage() {
  const { getAuthHeaders } = useAuth();
  const [goals, setGoals] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [form, setForm] = useState({ category: '', limit_amount: '', period: 'monthly' });
  const [currency, setCurrency] = useState('INR');
  const sym = CURRENCY_SYMBOLS[currency] || '\u20B9';

  const fetchGoals = async () => {
    try {
      const [goalsRes, setRes] = await Promise.all([
        axios.get(`${API}/budget-goals`, { headers: getAuthHeaders() }),
        axios.get(`${API}/settings`, { headers: getAuthHeaders() }),
      ]);
      setGoals(goalsRes.data);
      setCurrency(setRes.data.currency || 'INR');
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchGoals(); }, []);

  const openCreate = () => {
    setEditingGoal(null);
    setForm({ category: '', limit_amount: '', period: 'monthly' });
    setShowDialog(true);
  };

  const openEdit = (goal) => {
    setEditingGoal(goal);
    setForm({
      category: goal.category,
      limit_amount: String(goal.limit_amount),
      period: goal.period || 'monthly',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.category || !form.limit_amount) {
      toast.error('Fill in all fields');
      return;
    }
    const payload = {
      category: form.category,
      limit_amount: parseFloat(form.limit_amount),
      period: form.period,
    };
    try {
      if (editingGoal) {
        await axios.put(`${API}/budget-goals/${editingGoal.goal_id}`, payload, {
          headers: getAuthHeaders(),
        });
        toast.success('Budget goal updated!');
      } else {
        await axios.post(`${API}/budget-goals`, payload, {
          headers: getAuthHeaders(),
        });
        toast.success('Budget goal created!');
      }
      setShowDialog(false);
      setEditingGoal(null);
      setForm({ category: '', limit_amount: '', period: 'monthly' });
      fetchGoals();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409) {
        toast.error(detail || 'This budget already exists');
      } else {
        toast.error(detail || 'Failed to save goal');
      }
    }
  };

  const handleDelete = async (goalId) => {
    if (!window.confirm('Delete this budget goal?')) return;
    try {
      await axios.delete(`${API}/budget-goals/${goalId}`, { headers: getAuthHeaders() });
      toast.success('Goal deleted');
      fetchGoals();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="budget-goals-page">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Budget Goals</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Set spending limits for each category and track your progress.</p>
          </div>
          <Button onClick={openCreate} className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg" data-testid="add-goal-btn">
            <Plus size={16} className="mr-1" /> Add Goal
          </Button>
        </div>

        {goals.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-16 text-center">
            <Target size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400 text-lg">No budget goals yet</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Create a goal to start tracking your spending limits.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map(goal => {
              const pct = goal.limit_amount > 0 ? Math.min((goal.spent / goal.limit_amount) * 100, 100) : 0;
              const isOver = goal.spent > goal.limit_amount;
              const isWarning = pct >= 80 && !isOver;
              return (
                <div key={goal.goal_id} className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border ${isOver ? 'border-red-200 dark:border-red-800' : isWarning ? 'border-orange-200 dark:border-orange-800' : 'border-slate-100 dark:border-slate-800'} p-6 hover:shadow-md transition-shadow`} data-testid={`goal-${goal.goal_id}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Target size={18} className={isOver ? 'text-red-500' : 'text-indigo-500 dark:text-indigo-400'} />
                      <h3 className="font-bold text-slate-800 dark:text-slate-200">{goal.category}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(goal)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 transition-colors" data-testid={`edit-goal-${goal.goal_id}`} aria-label="Edit goal">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(goal.goal_id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors" data-testid={`delete-goal-${goal.goal_id}`} aria-label="Delete goal">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">Spent</p>
                      <p className={`text-2xl font-extrabold ${isOver ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {sym}{new Intl.NumberFormat('en-IN').format(Math.round(goal.spent))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">Limit</p>
                      <p className="text-lg font-bold text-slate-500 dark:text-slate-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {sym}{new Intl.NumberFormat('en-IN').format(Math.round(goal.limit_amount))}
                      </p>
                    </div>
                  </div>

                  <Progress value={pct} className={`h-2.5 ${isOver ? '[&>div]:bg-red-500' : isWarning ? '[&>div]:bg-orange-400' : '[&>div]:bg-emerald-500'}`} />

                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-slate-400 dark:text-slate-500 capitalize">{goal.period}</span>
                    {isOver && (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-500">
                        <AlertTriangle size={12} /> Over budget!
                      </span>
                    )}
                    {isWarning && (
                      <span className="flex items-center gap-1 text-xs font-medium text-orange-500">
                        <AlertTriangle size={12} /> Nearing limit
                      </span>
                    )}
                    {!isOver && !isWarning && (
                      <span className="text-xs text-emerald-500 font-medium">{Math.round(pct)}% used</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create/Edit Goal Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditingGoal(null); }}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 dark:border-slate-800 rounded-xl" data-testid="add-goal-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editingGoal ? 'Edit Budget Goal' : 'Create Budget Goal'}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              {editingGoal ? 'Update the spending limit or period for this category.' : 'Set a spending limit for a category to track your budget.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="goal-category-select">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c} className="dark:text-slate-200 dark:focus:bg-slate-700">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Spending Limit ({sym})</Label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                className="rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                value={form.limit_amount}
                onChange={e => setForm(f => ({ ...f, limit_amount: e.target.value }))}
                data-testid="goal-limit-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v }))}>
                <SelectTrigger className="rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white" data-testid="goal-period-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectItem value="monthly" className="dark:text-slate-200 dark:focus:bg-slate-700">Monthly</SelectItem>
                  <SelectItem value="weekly" className="dark:text-slate-200 dark:focus:bg-slate-700">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditingGoal(null); }} className="rounded-lg" data-testid="cancel-goal-btn">Cancel</Button>
            <Button onClick={handleSave} className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg" data-testid="save-goal-btn">
              {editingGoal ? 'Save Changes' : 'Create Goal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
