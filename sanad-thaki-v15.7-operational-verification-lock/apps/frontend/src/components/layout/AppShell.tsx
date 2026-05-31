import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  ScanLine,
  Landmark,
  ArrowLeftRight,
  BarChart3,
  MessageCircle,
  Users,
  Settings,
  HelpCircle,
  Shield,
  CreditCard,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Building2,
  ChevronDown,
  Menu,
} from 'lucide-react';
import { cn, getInitials } from '@/utils/utils';
import type { UserRole } from '@/types';

// ============================================================
// Navigation Configuration
// ============================================================

interface NavItem {
  key: string;
  path: string;
  icon: React.ElementType;
  labelKey: string;
  roles: UserRole[];
  badge?: number;
}

const navItems: NavItem[] = [
  { key: 'dashboard', path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', roles: ['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SANAD_ADMIN'] },
  { key: 'invoices', path: '/invoices', icon: FileText, labelKey: 'nav.invoices', roles: ['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT'] },
  { key: 'ocr', path: '/ocr', icon: ScanLine, labelKey: 'nav.ocr', roles: ['OWNER', 'MEMBER', 'ACCOUNTANT', 'FINANCE_MANAGER'] },
  { key: 'bank', path: '/bank', icon: Landmark, labelKey: 'nav.bankOperations', roles: ['OWNER', 'FINANCE_MANAGER'] },
  { key: 'reconciliation', path: '/reconciliation', icon: ArrowLeftRight, labelKey: 'nav.reconciliation', roles: ['OWNER', 'FINANCE_MANAGER'] },
  { key: 'reports', path: '/reports', icon: BarChart3, labelKey: 'nav.reports', roles: ['OWNER', 'FINANCE_MANAGER', 'ADMIN'] },
  { key: 'whatsapp', path: '/whatsapp', icon: MessageCircle, labelKey: 'nav.whatsapp', roles: ['OWNER', 'ACCOUNTANT', 'FINANCE_MANAGER'] },
  { key: 'users', path: '/users', icon: Users, labelKey: 'nav.users', roles: ['OWNER', 'ADMIN'] },
  { key: 'settings', path: '/settings', icon: Settings, labelKey: 'nav.settings', roles: ['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SANAD_ADMIN'] },
  { key: 'billing', path: '/billing', icon: CreditCard, labelKey: 'nav.billing', roles: ['OWNER', 'ADMIN'] },
  { key: 'support', path: '/support', icon: HelpCircle, labelKey: 'nav.support', roles: ['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT'] },
  { key: 'audit', path: '/audit', icon: Shield, labelKey: 'nav.audit', roles: ['OWNER', 'ADMIN', 'FINANCE_MANAGER'] },
  // Platform admin
  { key: 'platform', path: '/platform', icon: Building2, labelKey: 'nav.platform', roles: ['SANAD_ADMIN'] },
];

// ============================================================
// AppShell Component
// ============================================================

interface AppShellProps {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: UserRole;
  };
  company?: {
    id: string;
    name: string;
  } | null;
  companies?: Array<{ id: string; name: string }>;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onCompanyChange?: (companyId: string) => void;
  onLogout: () => void;
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  locale: 'ar' | 'en';
  onLocaleChange: (locale: 'ar' | 'en') => void;
}

export function AppShell({
  children,
  user,
  company,
  companies = [],
  sidebarCollapsed,
  onToggleSidebar,
  onCompanyChange,
  onLogout,
  theme,
  onThemeChange,
  locale,
  onLocaleChange,
}: AppShellProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  const themeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const ThemeIcon = themeIcon;

  const cycleTheme = () => {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIdx = order.indexOf(theme);
    onThemeChange(order[(currentIdx + 1) % order.length]);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      {/* ============================================================
          SIDEBAR
         ============================================================ */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-full border-e border-border transition-all duration-200 ease-in-out flex-shrink-0',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-lg">
              <span className="text-white font-black text-base">س</span>
            </div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  <p className="text-sm font-black tracking-tight" style={{ color: 'var(--sidebar-active-text)' }}>
                    سند ذكي
                  </p>
                  <p className="text-[10px] leading-tight" style={{ color: 'var(--sidebar-text-muted)' }}>
                    منصة تحصيل ومتابعة فواتير العملاء
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Company Selector */}
        {company && !sidebarCollapsed && companies.length > 1 && (
          <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="relative">
              <button
                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{ backgroundColor: 'var(--sidebar-hover)', color: 'var(--sidebar-text)' }}
                aria-expanded={companyDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className="truncate">{company.name}</span>
                <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--sidebar-text-muted)' }} />
              </button>
              {companyDropdownOpen && (
                <div
                  className="absolute top-full start-0 end-0 mt-1 rounded-lg border shadow-elevated z-50 py-1 bg-surface-1 border-border"
                >
                  {companies.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onCompanyChange?.(c.id);
                        setCompanyDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full text-start px-3 py-2 text-sm transition-colors',
                        c.id === company.id
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                          : 'hover:bg-surface-2 text-content-primary'
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-hide" aria-label="Main navigation">
          <ul className="flex flex-col gap-0.5">
            {filteredNav.map(item => {
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                        sidebarCollapsed ? 'justify-center h-10 w-10 mx-auto' : 'px-3 py-2.5',
                        isActive
                          ? 'text-[var(--sidebar-active-text)]'
                          : 'text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)]'
                      )
                    }
                    style={({ isActive }) => ({
                      backgroundColor: isActive ? 'var(--sidebar-active)' : undefined,
                    })}
                    title={sidebarCollapsed ? t(item.labelKey) : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{t(item.labelKey)}</span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar footer */}
        <div className="p-2 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
          {/* Collapse toggle */}
          <button
            onClick={onToggleSidebar}
            className="w-full flex items-center justify-center h-9 rounded-lg transition-colors hover:bg-[var(--sidebar-hover)]"
            style={{ color: 'var(--sidebar-text-muted)' }}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            ) : (
              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            )}
          </button>
        </div>
      </aside>

      {/* ============================================================
          MAIN CONTENT
         ============================================================ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-surface-1 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden h-9 w-9 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 inline-flex items-center justify-center transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5 text-content-primary" />
            </button>

            {/* Company name in header for mobile */}
            {company && (
              <h1 className="text-base font-semibold text-content-primary truncate">
                {company.name}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle only - language moved to Settings */}
            <button
              onClick={cycleTheme}
              className="h-9 w-9 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 inline-flex items-center justify-center transition-colors"
              aria-label={`Theme: ${t(`theme.${theme}`)}`}
              title={t(`theme.${theme}`)}
            >
              <ThemeIcon className="w-4 h-4 text-content-secondary" />
            </button>

            {/* User menu */}
            <div className="flex items-center gap-3 ms-2 ps-3 border-s border-border">
              <div className="hidden sm:block text-end">
                <p className="text-sm font-medium text-content-primary leading-tight">{user.name}</p>
                <p className="text-xs text-content-tertiary">{t(`users.role${user.role === 'FINANCE_MANAGER' ? 'FinanceManager' : user.role === 'ACCOUNTANT' ? 'Accountant' : user.role === 'SANAD_ADMIN' ? 'Admin' : 'Admin'}`)}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {getInitials(user.name)}
              </div>
              <button
                onClick={onLogout}
                className="h-9 w-9 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-900/30 text-content-tertiary hover:text-danger-600 inline-flex items-center justify-center transition-colors"
                aria-label={t('auth.logout')}
                title={t('auth.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* ============================================================
          MOBILE SIDEBAR OVERLAY
         ============================================================ */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ backgroundColor: 'var(--overlay-bg)' }}
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 end-0 bottom-0 w-72 z-50 md:hidden flex flex-col border-s border-border"
              style={{ backgroundColor: 'var(--sidebar-bg)' }}
            >
              <div className="flex items-center justify-between h-16 px-4 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow">
                    <span className="text-white font-black text-sm">س</span>
                  </div>
                  <p className="text-sm font-black" style={{ color: 'var(--sidebar-active-text)' }}>
                    سند ذكي
                  </p>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[var(--sidebar-hover)]"
                  style={{ color: 'var(--sidebar-text-muted)' }}
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-3 px-2">
                <ul className="flex flex-col gap-0.5">
                  {filteredNav.map(item => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <NavLink
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                              isActive
                                ? 'text-[var(--sidebar-active-text)]'
                                : 'text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)]'
                            )
                          }
                          style={({ isActive }) => ({
                            backgroundColor: isActive ? 'var(--sidebar-active)' : undefined,
                          })}
                        >
                          <Icon className="w-5 h-5" />
                          <span>{t(item.labelKey)}</span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              {/* Logout in mobile menu */}
              <div className="p-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-danger-400 hover:bg-danger-500/10 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span>{t('auth.logout')}</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
