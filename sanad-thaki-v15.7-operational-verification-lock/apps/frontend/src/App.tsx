import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { useThemeStore } from './store/themeStore';
import { useThemeEffect } from './hooks/useTheme';
import { useAuthStore } from './store/authStore';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';

// Import actual pages
import LandingPage from './features/auth/LandingPage';
import TermsPage from './features/auth/TermsPage';
import LoginPage from './features/auth/LoginPage';
import SignupPage from './features/auth/SignupPage';
import DashboardPage from './features/dashboard/DashboardPage';
import InvoiceCenterPage from './features/invoices/InvoiceCenterPage';
import OcrCenterPage from './features/invoices/OcrCenterPage';
import ReconciliationPage from './features/invoices/ReconciliationPage';
import TeamPage from './features/team/TeamPage';
import SettingsPage from './features/settings/SettingsPage';
import AuditLogsPage from './features/audit/AuditLogsPage';
import NotificationsPage from './features/notifications/NotificationsPage';
import ReportsPage from './features/reports/ReportsPage';
import BankOperationsPage from './features/bank/BankOperationsPage';
import BillingPage from './features/billing/BillingPage';
import WhatsAppPage from './features/whatsapp/WhatsAppPage';
import SupportPage from './features/support/SupportPage';
import PlatformPage from './features/platform/PlatformPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

import type { UserRole } from '@/types';

// Route Guard to verify active user session and wrap in main AppShell layout
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: UserRole[] }> = ({ children, allowedRoles }) => {
  const { user, company, isAuthenticated, logout } = useAuth();
  const companies = useAuthStore((s) => s.companies);
  const { theme, setTheme, locale, setLocale, sidebarCollapsed, toggleSidebar } = useThemeStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
      }}
      company={company ? { id: company.id, name: company.name } : null}
      companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={toggleSidebar}
      onLogout={logout}
      theme={theme}
      onThemeChange={setTheme}
      locale={locale}
      onLocaleChange={setLocale}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  );
};

export const App: React.FC = () => {
  // Synchronize theme store state with DOM (lang, dir, class)
  useThemeEffect();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication pages */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected Application pages */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SANAD_ADMIN']}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT']}>
                <InvoiceCenterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ocr"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'MEMBER', 'ACCOUNTANT', 'FINANCE_MANAGER']}>
                <OcrCenterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bank"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'FINANCE_MANAGER']}>
                <BankOperationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reconciliation"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'FINANCE_MANAGER']}>
                <ReconciliationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'FINANCE_MANAGER', 'ADMIN']}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ACCOUNTANT', 'FINANCE_MANAGER']}>
                <WhatsAppPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN']}>
                <TeamPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SANAD_ADMIN']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN']}>
                <BillingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT']}>
                <SupportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'FINANCE_MANAGER']}>
                <AuditLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MEMBER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SANAD_ADMIN']}>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform"
            element={
              <ProtectedRoute allowedRoles={['SANAD_ADMIN']}>
                <PlatformPage />
              </ProtectedRoute>
            }
          />

          {/* Default Routing fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};
