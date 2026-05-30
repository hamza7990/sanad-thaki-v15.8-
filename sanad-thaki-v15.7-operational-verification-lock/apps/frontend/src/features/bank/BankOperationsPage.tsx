import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Landmark, Upload, Plus, Play, RefreshCw,
  Search, FileSpreadsheet, CheckCircle, HelpCircle, AlertCircle
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Badge, Card, CardContent, Modal, Input, EmptyState } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { apiService, ApiError } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { formatCurrency, formatDate } from '@/utils/utils';
import type { BankTransaction } from '@/types';

export default function BankOperationsPage() {
  const { t } = useTranslation();
  const notify = useNotification();

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runningMatch, setRunningMatch] = useState(false);

  // Manual Transaction Form
  const [manualForm, setManualForm] = useState({
    transactionDate: '',
    description: '',
    amount: '',
    reference: ''
  });

  // Statement File Form
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.getBankTransactions();
      setTransactions(data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      notify.error('خطأ', 'فشل في تحميل الحركات البنكية');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.transactionDate || !manualForm.description || !manualForm.amount) {
      notify.error('خطأ', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const parsedAmount = parseFloat(manualForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      notify.error('خطأ', 'يجب أن يكون المبلغ أكبر من صفر');
      return;
    }

    setSubmitting(true);
    try {
      await apiService.createBankTransaction({
        bankName: 'البنك التجاري',
        transactionDate: manualForm.transactionDate,
        description: manualForm.description.trim(),
        amount: parsedAmount,
        reference: manualForm.reference.trim() || undefined
      });
      notify.success('تمت الإضافة بنجاح', 'تم تسجيل الحركة البنكية يدوياً بنجاح');
      setShowCreateModal(false);
      setManualForm({ transactionDate: '', description: '', amount: '', reference: '' });
      fetchTransactions();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل إضافة الحركة البنكية';
      notify.error('خطأ', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      notify.error('خطأ', 'يرجى اختيار ملف كشف الحساب أولاً');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiService.uploadBankStatement(selectedFile, 'standard');
      notify.success('تم رفع كشف الحساب', `تم بنجاح رفع كشف حساب يحتوي على ${res.totalRows} حركات بنكية.`);
      setShowUploadModal(false);
      setSelectedFile(null);
      fetchTransactions();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل رفع كشف الحساب البنكي';
      notify.error('خطأ في الرفع', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunMatching = async () => {
    setRunningMatch(true);
    try {
      const res = await apiService.runMatching();
      notify.success('اكتملت المطابقة الذكية', `تم العثور على ${res.matchesFound} مطابقة جديدة واعتمادها بنجاح!`);
      fetchTransactions();
    } catch (err) {
      console.error('Error running match:', err);
      notify.error('خطأ', 'فشل تشغيل محرك المطابقة البنكية');
    } finally {
      setRunningMatch(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'MATCHED': return 'success';
      case 'UNMATCHED': return 'warning';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'MATCHED': return 'مطابقة';
      case 'UNMATCHED': return 'غير مطابقة';
      default: return status;
    }
  };

  const columns: Column<BankTransaction>[] = [
    {
      key: 'transactionDate',
      header: 'تاريخ الحركة',
      accessor: (tx) => formatDate(tx.transactionDate)
    },
    {
      key: 'description',
      header: 'تفاصيل العملية / الوصف',
      accessor: (tx) => (
        <span className="font-semibold text-content-primary block max-w-sm truncate" title={tx.description}>
          {tx.description}
        </span>
      )
    },
    {
      key: 'reference',
      header: 'الرقم المرجعي',
      accessor: (tx) => tx.reference || '-'
    },
    {
      key: 'amount',
      header: 'المبلغ المودع',
      accessor: (tx) => (
        <span className="font-bold text-success-600">
          {formatCurrency(tx.amount)}
        </span>
      )
    },
    {
      key: 'status',
      header: 'الحالة',
      accessor: (tx) => (
        <Badge variant={getStatusBadgeVariant(tx.status)}>
          {getStatusLabel(tx.status)}
        </Badge>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الحركات والعمليات البنكية"
        description="استعرض المدفوعات والعمليات البنكية المودعة أو ارفع كشف الحساب لبدء المطابقة"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={handleRunMatching} variant="primary" loading={runningMatch}>
              <Play size={14} className="me-1.5" />
              تشغيل المطابقة الذكية
            </Button>
            <Button onClick={() => setShowUploadModal(true)} variant="secondary">
              <Upload size={14} className="me-1.5" />
              رفع كشف حساب
            </Button>
            <Button onClick={() => setShowCreateModal(true)} variant="secondary">
              <Plus size={14} className="me-1.5" />
              إدخال حركة يدوية
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-content-secondary">جاري تحميل حركات البنك...</div>
          ) : transactions.length === 0 ? (
            <EmptyState
              title="لا توجد حركات بنكية"
              description="لم يتم رفع أو إدخال حركات بنكية للمنشأة حتى الآن. ارفع كشف حساب للبدء."
              icon={Landmark}
            />
          ) : (
            <DataTable
              data={transactions}
              columns={columns}
              keyExtractor={(tx) => tx.id}
            />
          )}
        </CardContent>
      </Card>

      {/* Manual Entry Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="إضافة حركة بنكية يدوياً"
      >
        <form onSubmit={handleCreateTransaction} className="flex flex-col gap-4">
          <Input
            label="تاريخ العملية"
            type="date"
            value={manualForm.transactionDate}
            onChange={(e) => setManualForm({ ...manualForm, transactionDate: e.target.value })}
            required
            disabled={submitting}
          />

          <Input
            label="وصف العملية / البيان"
            type="text"
            value={manualForm.description}
            onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
            placeholder="مثال: تحويل وارد من عميل فلان الفلاني"
            required
            disabled={submitting}
          />

          <Input
            label="المبلغ المودع (ر.س)"
            type="number"
            value={manualForm.amount}
            onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
            placeholder="0.00"
            required
            disabled={submitting}
          />

          <Input
            label="الرقم المرجعي للتحويل (اختياري)"
            type="text"
            value={manualForm.reference}
            onChange={(e) => setManualForm({ ...manualForm, reference: e.target.value })}
            placeholder="مثال: Ref #12345"
            disabled={submitting}
          />

          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
            >
              حفظ الحركة
            </Button>
          </div>
        </form>
      </Modal>

      {/* Upload Statement Modal */}
      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="رفع ملف كشف الحساب البنكي"
      >
        <form onSubmit={handleUploadStatement} className="flex flex-col gap-4">
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-surface-0 hover:bg-surface-2 transition-colors flex flex-col items-center">
            <FileSpreadsheet className="w-12 h-12 text-content-tertiary mb-3" />
            <p className="text-sm font-semibold text-content-primary">اختر ملف Excel أو CSV الخاص بكشف حساب البنك</p>
            <p className="text-xs text-content-tertiary mt-1.5">يدعم صيغ .xlsx, .csv, .xls</p>
            
            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden"
              id="statement-file-input"
              disabled={submitting}
            />
            
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => document.getElementById('statement-file-input')?.click()}
              disabled={submitting}
            >
              تصفح الملفات
            </Button>

            {selectedFile && (
              <p className="text-sm text-primary-600 font-semibold mt-4">
                الملف المحدد: {selectedFile.name}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowUploadModal(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
            >
              بدء رفع كشف الحساب
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
