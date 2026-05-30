import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText,
  ArrowLeftRight,
  BarChart3,
  Upload,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { apiService } from '@/services/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { KPICard } from '@/components/ui/KPICard';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button, Badge } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatPercentage, formatDate } from '@/utils/utils';
import type { FinanceReport, Invoice } from '@/types';

// ============================================================
// DashboardPage — Role-appropriate overview
// ============================================================

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'APPROVED': return <Badge variant="success">معتمد</Badge>;
    case 'NEEDS_REVIEW':
    case 'READY_FOR_REVIEW': return <Badge variant="warning">بانتظار المراجعة</Badge>;
    case 'PAID': return <Badge variant="info">مدفوع</Badge>;
    case 'REJECTED': return <Badge variant="danger">مرفوض</Badge>;
    case 'DRAFT': return <Badge variant="default">مسودة</Badge>;
    default: return <Badge variant="default">{status}</Badge>;
  }
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [report, setReport] = useState<FinanceReport | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  // Compute month-over-month comparison deltas from real data
  const [prevMonthData, setPrevMonthData] = useState<{ invoices: number; collection: number } | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getFinanceReport();
      setReport(data);
      // Extract prev vs current month from monthlyComparison
      if (data.monthlyComparison && data.monthlyComparison.length >= 2) {
        const arr = data.monthlyComparison;
        const cur = arr[arr.length - 1];
        const prev = arr[arr.length - 2];
        if (prev && cur) {
          const invoiceDelta = prev.invoicesCreated
            ? Math.round(((cur.invoicesCreated - prev.invoicesCreated) / prev.invoicesCreated) * 100)
            : 0;
          const collectionDelta = prev.paidAmount && cur.totalAmount
            ? Math.round((((cur.paidAmount / cur.totalAmount) - (prev.paidAmount / prev.totalAmount)) / Math.max(prev.paidAmount / prev.totalAmount, 0.01)) * 100)
            : 0;
          setPrevMonthData({ invoices: invoiceDelta, collection: collectionDelta });
        }
      }
    } catch {
      // Silently fail — KPIs will show fallback
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const data = await apiService.getInvoices();
      const invoices = Array.isArray(data.data) ? data.data : [];
      setRecentInvoices(invoices.slice(0, 8));
    } catch {
      // Ignore
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
    fetchRecentInvoices();
  }, [fetchReport, fetchRecentInvoices]);

  useEffect(() => {
    document.title = `${t('nav.dashboard')} | ${t('app.name')}`;
  }, [t]);

  const userName = user?.name ?? '';

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col gap-6"
    >
      {/* ── Page header ──────────────────────────────────── */}
      <PageHeader
        title={t('dashboard.greeting', { name: userName })}
        description={t('dashboard.greetingDesc')}
      />

      {/* ── KPI Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={t('dashboard.totalInvoices')}
          value={loading ? '—' : String(report?.summary.totalInvoices ?? 0)}
          icon={FileText}
          iconColor="bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
          change={
            report && prevMonthData
              ? { value: prevMonthData.invoices, label: t('reports.monthlyComparison') }
              : undefined
          }
          loading={loading}
        />

        <KPICard
          title={t('dashboard.pendingApproval')}
          value={loading ? '—' : String(report?.summary.readyForReview ?? 0)}
          icon={Clock}
          iconColor="bg-warning-50 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400"
          loading={loading}
        />

        <KPICard
          title={t('dashboard.totalAmount')}
          value={
            loading
              ? '—'
              : formatCurrency(report?.summary.outstandingAmount ?? 0)
          }
          icon={DollarSign}
          iconColor="bg-accent-50 text-accent-600 dark:bg-accent-900/30 dark:text-accent-400"
          loading={loading}
        />

        <KPICard
          title={t('dashboard.collectionRate')}
          value={
            loading
              ? '—'
              : formatPercentage(report?.summary.collectionRate ?? 0)
          }
          icon={TrendingUp}
          iconColor="bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400"
          change={
            report && prevMonthData
              ? { value: prevMonthData.collection, label: t('reports.monthlyComparison') }
              : undefined
          }
          loading={loading}
        />
      </div>

      {/* ── Bottom row: Recent Invoices + Quick Actions ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Invoices — takes 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-content-primary">
              {t('dashboard.recentActivity')}
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/invoices')}
              className="text-xs text-content-secondary"
            >
              عرض الكل
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {invoicesLoading ? (
              <div className="flex flex-col gap-3 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : recentInvoices.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="mx-auto w-10 h-10 text-content-tertiary mb-2" />
                <p className="text-sm text-content-secondary">{t('dashboard.noRecentActivity')}</p>
                <p className="text-xs text-content-tertiary mt-1">{t('dashboard.noRecentActivityDesc')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-1 transition-colors cursor-pointer"
                    onClick={() => navigate('/invoices')}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                        <FileText size={14} className="text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-content-primary truncate">
                          {inv.customerName}
                        </p>
                        <p className="text-xs text-content-tertiary">
                          {inv.invoiceNumber} · {inv.createdAt ? formatDate(inv.createdAt) : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ms-2">
                      <span className="text-sm font-semibold text-content-primary">
                        {formatCurrency(inv.totalAmount)}
                      </span>
                      {getStatusBadge(inv.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-content-primary">
              {t('dashboard.quickActions')}
            </h3>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                icon={Upload}
                fullWidth
                onClick={() => navigate('/invoices')}
                className="justify-start"
              >
                {t('dashboard.uploadInvoice')}
              </Button>

              <Button
                variant="outline"
                icon={ArrowLeftRight}
                fullWidth
                onClick={() => navigate('/reconciliation')}
                className="justify-start"
              >
                {t('dashboard.runMatching')}
              </Button>

              <Button
                variant="outline"
                icon={BarChart3}
                fullWidth
                onClick={() => navigate('/reports')}
                className="justify-start"
              >
                {t('dashboard.viewReports')}
              </Button>

              {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
                <Button
                  variant="outline"
                  icon={CheckCircle}
                  fullWidth
                  onClick={() => navigate('/users')}
                  className="justify-start"
                >
                  إدارة الفريق
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Finance Summary (if data available) ────────────── */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-success-50 dark:bg-success-900/20 flex items-center justify-center">
                  <CheckCircle size={16} className="text-success-600 dark:text-success-400" />
                </div>
                <div>
                  <p className="text-xs text-content-tertiary">المبلغ المحصّل</p>
                  <p className="text-sm font-bold text-success-600">
                    {formatCurrency(report.summary.paidAmount ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-warning-50 dark:bg-warning-900/20 flex items-center justify-center">
                  <Clock size={16} className="text-warning-600 dark:text-warning-400" />
                </div>
                <div>
                  <p className="text-xs text-content-tertiary">الفواتير المعتمدة</p>
                  <p className="text-sm font-bold text-warning-600">
                    {report.summary.approved ?? 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-danger-50 dark:bg-danger-900/20 flex items-center justify-center">
                  <XCircle size={16} className="text-danger-600 dark:text-danger-400" />
                </div>
                <div>
                  <p className="text-xs text-content-tertiary">المبالغ المتأخرة</p>
                  <p className="text-sm font-bold text-danger-600">
                    {formatCurrency(report.summary.outstandingAmount ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
}
