import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "../contexts/AuthContext";
import Navbar from '../components/Navbar';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Settings, Check, Globe } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CURRENCIES = [
  { code: 'INR', symbol: '\u20B9', name: 'Indian Rupee', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'EUR', symbol: '\u20AC', name: 'Euro', flag: '\uD83C\uDDEA\uD83C\uDDFA' },
  { code: 'GBP', symbol: '\u00A3', name: 'British Pound', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'JPY', symbol: '\u00A5', name: 'Japanese Yen', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '\uD83C\uDDE6\uD83C\uDDFA' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '\uD83C\uDDE8\uD83C\uDDE6' },
];

export default function SettingsPage() {
  const { user, getAuthHeaders } = useAuth();
  const [selectedCurrency, setSelectedCurrency] = useState('INR');
  const [savedCurrency, setSavedCurrency] = useState('INR');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const resp = await axios.get(`${API}/settings`, { headers: getAuthHeaders() });
        setSelectedCurrency(resp.data.currency || 'INR');
        setSavedCurrency(resp.data.currency || 'INR');
      } catch (err) {
        console.error(err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings`, { currency: selectedCurrency }, { headers: getAuthHeaders() });
      setSavedCurrency(selectedCurrency);
      toast.success('Currency updated successfully!');
    } catch (err) {
      toast.error('Failed to update currency');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = selectedCurrency !== savedCurrency;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="settings-page">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <Settings size={28} className="text-indigo-500" />
            Settings
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your account preferences.</p>
        </div>

        {/* Profile Section */}
        {user && (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Profile</h2>
            <div className="flex items-center gap-4">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-14 h-14 rounded-full border-2 border-indigo-200 dark:border-indigo-800" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xl font-bold">
                  {user.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-800 dark:text-white text-lg">{user.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Currency Section */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={20} className="text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Default Currency</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Choose the currency used to display all amounts across the app.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CURRENCIES.map(cur => (
              <button
                key={cur.code}
                onClick={() => setSelectedCurrency(cur.code)}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                  selectedCurrency === cur.code
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-white dark:bg-slate-800'
                }`}
                data-testid={`currency-${cur.code}`}
              >
                <span className="text-2xl">{cur.flag}</span>
                <div className="flex-1 text-left">
                  <p className={`font-semibold ${selectedCurrency === cur.code ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                    {cur.code}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{cur.name}</p>
                </div>
                <span className={`text-xl font-bold ${selectedCurrency === cur.code ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {cur.symbol}
                </span>
                {selectedCurrency === cur.code && (
                  <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center">
                    <Check size={14} className="text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {hasChanges && (
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedCurrency(savedCurrency)}
                className="rounded-lg dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg"
                data-testid="save-currency-btn"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
