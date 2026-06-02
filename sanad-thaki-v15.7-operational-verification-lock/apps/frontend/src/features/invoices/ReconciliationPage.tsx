import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Play, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Badge, Card, CardHeader, CardContent, EmptyState } from '@/components/ui';
import { KPICard } from '@/components/ui/KPICard';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { apiService } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { formatCurrency, formatDate, cn, getMatchStatusVariant, formatPercentage } from '@/utils/utils';
import type { ReconciliationMatch } from '@/types';

export default function ReconciliationPage() {
  const { t } = useTranslation();
  const notify = useNotification();
  const [activeTab, setActiveTab] = useState('pending');
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiService.getMatches();
      setMatches(Array.isArray(result) ? result : []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  const handleRunMatching = async () => {
    try {
      setRunning(true);
      await apiService.runMatching();
      notify.success(t('common.success'), t('bank.runMatching'));
      fetchMatches();
    } catch (err) {
      notify.error(t('common.error'), String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiService.approveMatch(id);
      notify.success(t('common.success'), t('bank.approveMatch'));
      fetchMatches();
    } catch (err) {
      notify.error(t('common.error'), String(err));
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiService.rejectMatch(id);
      notify.success(t('common.success'), t('bank.rejectMatch'));
      fetchMatches();
    } catch (err) {
      notify.error(t('common.error'), String(err));
    }
  };

  const pending = matches.filter(m => m.status === 'PENDING');
  const approved = matches.filter(m => m.status === 'APPROVED');
  const rejected = matches.filter(m => m.status === 'REJECTED');
  const matchRate = matches.length > 0 ? (approved.length / matches.length) * 100 : 0;

  const tabs = [
    { key: 'pending', label: t('bank.matching'), count: pending.length },
    { key: 'approved', label: t('bank.matched'), count: approved.length },
    { key: 'rejected', label: t('invoice.statusRejected'), count: rejected.length },
  ];

  const matchColumns: Column<ReconciliationMatch>[] = [
    {
      key: 'invoice',
      header: t('invoice.number'),
      accessor: (row) => (
        <span className="font-medium">{row.invoice?.invoiceNumber || row.invoiceId.slice(0, 8)}</span>
      ),
    },
    {
      key: 'invoiceAmount',
      header: t('invoice.amount'),
      accessor: (row) => (
        <span className="font-mono tabular-nums">{row.invoice ? formatCurrency(row.invoice.totalAmount) : '—'}</span>
      ),
      align: 'end',
    },
    {
      key: 'score',
      header: t('bank.score'),
      accessor: (row) => (
        <Badge variant={row.score >= 85 ? 'success' : row.score >= 70 ? 'warning' : 'danger'}>
          {formatPercentage(row.score)}
        </Badge>
      ),
      align: 'center',
    },
    {
      key: 'txAmount',
      header: 'مبلغ البنك',
      accessor: (row) => (
        <span className="font-mono tabular-nums">{row.bankTransaction ? formatCurrency(row.bankTransaction.amount) : '—'}</span>
      ),
      align: 'end',
    },
    {
      key: 'txDate',
      header: t('common.date'),
      accessor: (row) => row.bankTransaction ? formatDate(row.bankTransaction.transactionDate) : '—',
    },
    {
      key: 'status',
      header: t('common.status'),
      accessor: (row) => (
        <Badge variant={getMatchStatusVariant(row.status)} dot>
          {row.status === 'PENDING' ? 'معلقة' : row.status === 'APPROVED' ? 'معتمدة' : 'مرفوضة'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      accessor: (row) => row.status === 'PENDING' ? (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="ghost" icon={CheckCircle} onClick={() => handleApprove(row.id)} aria-label={t('bank.approveMatch')}>
            {t('invoice.approve')}
          </Button>
          <Button size="sm" variant="ghost" icon={XCircle} onClick={() => handleReject(row.id)} aria-label={t('bank.rejectMatch')} className="text-danger-600" />
        </div>
      ) : null,
    },
  ];

  const getCurrentData = () => {
    switch (activeTab) {
      case 'pending': return pending;
      case 'approved': return approved;
      case 'rejected': return rejected;
      default: return matches;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <PageHeader
        title={t('nav.reconciliation')}
        description="مطابقة الفواتير مع الحركات البنكية تلقائياً"
        actions={
          <Button variant="primary" icon={Play} onClick={handleRunMatching} loading={running}>
            {t('bank.runMatching')}
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KPICard title="إجمالي المطابقات" value={String(matches.length)} icon={ArrowLeftRight} loading={loading} />
        <KPICard title="معلقة" value={String(pending.length)} icon={AlertTriangle} iconColor="bg-warning-50 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400" loading={loading} />
        <KPICard title="معتمدة" value={String(approved.length)} icon={CheckCircle} iconColor="bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400" loading={loading} />
        <KPICard title="معدل المطابقة" value={formatPercentage(matchRate)} icon={ArrowLeftRight} loading={loading} />
      </div>

      {/* Tabs + Table */}
      <div className="mt-6">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <div className="mt-4">
          <DataTable
            columns={matchColumns}
            data={getCurrentData()}
            keyExtractor={(row) => row.id}
            loading={loading}
            pagination
            pageSize={10}
            emptyTitle="لا توجد مطابقات"
            emptyDescription={activeTab === 'pending' ? 'شغّل المطابقة لاكتشاف التطابقات التلقائية' : undefined}
          />
        </div>
      </div>
    </motion.div>
  );
}
