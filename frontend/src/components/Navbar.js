import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './ui/button';
import { LayoutDashboard, ArrowLeftRight, BarChart3, Target, LogOut, Plus, Sun, Moon, Settings, Wallet } from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Navbar({ onAddTransaction }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 sticky top-0 z-50" data-testid="navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0" data-testid="navbar-logo">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg">{'\u20B9'}</span>
            </div>
            <div className="min-w-0 hidden sm:block">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>BudgetWise</h1>
              <p className="hidden xl:block text-xs text-slate-500 dark:text-slate-400 -mt-0.5 truncate max-w-[180px]">
                {user ? `Welcome back, ${user.name}` : 'Finance Tracker'}
              </p>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-0.5 lg:gap-1 flex-1 justify-center px-2 min-w-0">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  aria-label={item.label}
                  className={`flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <span className="hidden xl:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 sm:p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              data-testid="theme-toggle-btn"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {onAddTransaction && (
              <Button
                onClick={onAddTransaction}
                className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-2.5 sm:px-4"
                data-testid="add-transaction-btn"
              >
                <Plus size={16} className="sm:mr-1" />
                <span className="hidden sm:inline">Add Transaction</span>
              </Button>
            )}
            <Button
              onClick={logout}
              variant="destructive"
              className="rounded-lg px-2.5 sm:px-4"
              data-testid="logout-btn"
            >
              <LogOut size={16} className="sm:hidden" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden flex gap-1 pb-2 overflow-x-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon size={14} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
      {/* Color accent bar */}
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"></div>
    </nav>
  );
}
