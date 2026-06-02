import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, Upload, Search, CheckCircle, XCircle,
  MessageCircle, Download, Clock, Eye, Calendar, User,
  CreditCard, Hash, Phone, Building2, AlertTriangle, X,
  ExternalLink, FileCheck, RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Badge, Card, CardContent, Modal, Input, Select, EmptyState } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { apiService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useNotification } from '@/hooks/useNotification';
import { formatCurrency, formatDate, getInvoiceStatusVariant } from '@/utils/utils';
import type { Invoice } from '@/types';

const statusTabs = [
  { key: 'ALL', label: 'الكل' },
  { key: 'DRAFT', label: 'مسودة' },
  { key: 'NEEDS_REVIEW', label: 'قيد المراجعة' },
  { key: 'APPROVED', label: 'معتمدة' },
  { key: 'PAID', label: 'مدفوعة' },
];

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'مسودة',
    NEEDS_REVIEW: 'قيد المراجعة',
    READY_FOR_REVIEW: 'جاهزة للمراجعة',
    APPROVED: 'معتمدة',
    REJECTED: 'مرفوضة',
    PAID: 'مدفوعة',
    CANCELLED: 'ملغاة',
  };
  return map[status] ?? status;
}

// ─── Invoice Detail Modal ────────────────────────────────────
interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onApprove: (invoice: Invoice) => Promise<void>;
  onSubmitReview: (invoice: Invoice) => Promise<void>;
  onRefresh: () => void;
}

function InvoiceDetailModal({ invoice, open, onClose, onApprove, onSubmitReview, onRefresh }: InvoiceDetailModalProps) {
  const notify = useNotification();
  const [approving, setApproving] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (open && invoice?.id) {
      setLoadingDetail(true);
      apiService.getInvoice(invoice.id)
        .then((inv) => setDetail(inv ?? invoice))
        .catch(() => setDetail(invoice))
        .finally(() => setLoadingDetail(false));
    } else {
      setDetail(null);
    }
  }, [open, invoice?.id]);

  const inv = detail ?? invoice;
  if (!inv) return null;

  const user = useAuthStore(s => s.user);
  const canApproveInvoice = user?.role === 'OWNER' || user?.role === 'FINANCE_MANAGER';
  const canApprove = canApproveInvoice && (inv.status === 'NEEDS_REVIEW' || inv.status === 'READY_FOR_REVIEW' || inv.status === 'DRAFT');

  const canSubmitInvoice = user?.role === 'OWNER' || user?.role === 'ACCOUNTANT' || user?.role === 'MEMBER';
  const canSubmit = canSubmitInvoice && inv.status === 'DRAFT';
  const [submittingReview, setSubmittingReview] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await onApprove(inv);
      onRefresh();
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setApproving(false);
    }
  };

  const handleSubmitReview = async () => {
    setSubmittingReview(true);
    try {
      await onSubmitReview(inv);
      onRefresh();
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setSubmittingReview(false);
    }
  };

  // Try to get file URL from invoice data
  const fileUrl: string | undefined = (inv as any).fileUrl ?? (inv as any).sourceFileUrl ?? (inv as any).file_url;

  return (
    <Modal open={open} onClose={onClose} title="" size="lg">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content-primary">
                فاتورة رقم: {inv.invoiceNumber || '—'}
              </h2>
              <p className="text-sm text-content-secondary">{inv.customerName || '—'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getInvoiceStatusVariant(inv.status)} dot>
            {getStatusLabel(inv.status)}
          </Badge>
          {loadingDetail && <RefreshCw className="w-4 h-4 text-content-tertiary animate-spin" />}
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        {/* Financial Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4">
            <p className="text-xs text-teal-600 dark:text-teal-400 font-medium mb-1">المبلغ الإجمالي</p>
            <p className="text-xl font-black text-teal-700 dark:text-teal-300 font-mono">
              {formatCurrency(inv.totalAmount)}
            </p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-xs text-content-secondary font-medium mb-1">ضريبة القيمة المضافة (VAT)</p>
            <p className="text-lg font-bold text-content-primary font-mono">
              {inv.vatAmount ? formatCurrency(inv.vatAmount) : '—'}
            </p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-xs text-content-secondary font-medium mb-1">الصافي (بدون ضريبة)</p>
            <p className="text-lg font-bold text-content-primary font-mono">
              {inv.vatAmount && inv.totalAmount
                ? formatCurrency(Number(inv.totalAmount) - Number(inv.vatAmount))
                : '—'}
            </p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailRow icon={Hash} label="رقم الفاتورة" value={inv.invoiceNumber} />
          <DetailRow icon={User} label="اسم العميل / المورد" value={inv.customerName} />
          <DetailRow icon={Building2} label="الرقم الضريبي" value={(inv as any).supplierTaxNumber ?? (inv as any).supplier_tax_number} />
          <DetailRow icon={Phone} label="هاتف العميل" value={inv.customerPhone} />
          <DetailRow icon={Calendar} label="تاريخ الفاتورة" value={inv.invoiceDate ? formatDate(inv.invoiceDate) : undefined} />
          <DetailRow icon={Clock} label="تاريخ الاستحقاق" value={inv.dueDate ? formatDate(inv.dueDate) : undefined} />
          {(inv as any).description && (
            <div className="md:col-span-2">
              <DetailRow icon={FileText} label="وصف / ملاحظات" value={(inv as any).description} />
            </div>
          )}
        </div>

        {/* OCR Extraction Info */}
        {(inv as any).extractionConfidence !== undefined && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">نتيجة القراءة الذكية (AI OCR)</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              دقة الاستخراج: <strong>{Math.round(((inv as any).extractionConfidence ?? 0) * 100)}%</strong>
            </p>
          </div>
        )}

        {/* File Preview */}
        {fileUrl && (
          <div>
            <p className="text-sm font-semibold text-content-primary mb-2 flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> الملف المرفق
            </p>
            <div className="border border-border rounded-xl overflow-hidden">
              {fileUrl.toLowerCase().includes('.pdf') || fileUrl.toLowerCase().includes('pdf') ? (
                <div className="bg-surface-2 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-8 h-8 text-red-500" />
                    <span className="text-sm font-medium text-content-primary">فاتورة PDF</span>
                  </div>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    فتح في نافذة جديدة
                  </a>
                </div>
              ) : (
                <img
                  src={fileUrl}
                  alt="صورة الفاتورة"
                  className="w-full max-h-64 object-contain bg-surface-2"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-surface-1 rounded-b-2xl">
        <Button variant="outline" onClick={onClose}>
          إغلاق
        </Button>
        <div className="flex items-center gap-2">
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-border hover:bg-surface-2 transition-colors text-content-secondary"
            >
              <Download className="w-4 h-4" />
              تحميل الملف
            </a>
          )}
          {canApprove && (
            <Button
              variant="primary"
              icon={CheckCircle}
              onClick={handleApprove}
              loading={approving}
            >
              اعتماد الفاتورة
            </Button>
          )}
          {canSubmit && (
            <Button
              variant="primary"
              icon={FileCheck}
              onClick={handleSubmitReview}
              loading={submittingReview}
            >
              تقديم للمراجعة
            </Button>
          )}
          {inv.status === 'APPROVED' && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              معتمدة
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-content-tertiary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-content-tertiary font-medium">{label}</p>
        <p className="text-sm text-content-primary font-semibold truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function InvoiceCenterPage() {
  const { t } = useTranslation();
  const notify = useNotification();
  const company = useAuthStore(s => s.company);
  const user = useAuthStore(s => s.user);
  
  const canCreateInvoice = user?.role === 'OWNER' || user?.role === 'ACCOUNTANT' || user?.role === 'MEMBER';
  const canApproveInvoice = user?.role === 'OWNER' || user?.role === 'FINANCE_MANAGER';
  const canSendWhatsApp = user?.role === 'OWNER' || user?.role === 'ACCOUNTANT';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // WhatsApp stage selection state
  const [whatsappInvoice, setWhatsappInvoice] = useState<Invoice | null>(null);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [whatsappStage, setWhatsappStage] = useState<'FIRST' | 'SECOND' | 'FINAL'>('FIRST');
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  // Invoice detail modal state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDragging, setUploadDragging] = useState(false);

  // Create Form state
  const [form, setForm] = useState({
    invoiceNumber: '',
    customerName: '',
    supplierTaxNumber: '',
    totalAmount: '',
    vatAmount: '',
    customerPhone: '',
    invoiceDate: '',
    dueDate: '',
  });

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
      };
      if (activeTab !== 'ALL') params.status = activeTab;
      if (searchQuery) params.search = searchQuery;

      const result = await apiService.getInvoices(params);
      if (Array.isArray(result)) {
        setInvoices(result);
        setTotal(result.length);
      } else {
        setInvoices(result.data || []);
        setTotal(result.total || 0);
      }
    } catch (err) {
      notify.error(t('common.error'), String(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, activeTab, searchQuery, t, notify]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleRowClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowDetailModal(true);
  };

  const handleApprove = async (invoice: Invoice) => {
    try {
      await apiService.approveInvoice(invoice.id);
      notify.success('تم الاعتماد', `تم اعتماد الفاتورة ${invoice.invoiceNumber} بنجاح ✓`);
      fetchInvoices();
    } catch (err) {
      notify.error(t('common.error'), String(err));
    }
  };

  const handleSubmitReview = async (invoice: Invoice) => {
    try {
      await apiService.submitForReview(invoice.id);
      notify.success('تم التقديم للمراجعة', `تم تقديم الفاتورة ${invoice.invoiceNumber} للمراجعة بنجاح ✓`);
      fetchInvoices();
    } catch (err) {
      notify.error(t('common.error'), String(err));
    }
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappInvoice) return;
    try {
      setSendingWhatsapp(true);
      await apiService.sendWhatsApp(whatsappInvoice.id, whatsappStage);
      notify.success('تم إرسال التذكير بنجاح ✓', t('whatsapp.send'));
      setShowWhatsappModal(false);
      setWhatsappInvoice(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(t('common.error'), msg);
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const parseLocalizedFloat = (val: string): number => {
    if (!val) return 0;
    const clean = val.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleCreate = async () => {
    if (!form.invoiceNumber.trim()) {
      notify.error(t('common.error'), 'يرجى إدخال رقم الفاتورة.');
      return;
    }
    if (!form.customerName.trim()) {
      notify.error(t('common.error'), 'يرجى إدخال اسم العميل.');
      return;
    }
    const parsedAmount = parseLocalizedFloat(form.totalAmount);
    if (parsedAmount <= 0) {
      notify.error(t('common.error'), 'يجب أن يكون مبلغ الفاتورة الإجمالي أكبر من 0.');
      return;
    }
    try {
      setSubmitting(true);
      await apiService.createInvoice({
        invoiceNumber: form.invoiceNumber.trim(),
        customerName: form.customerName.trim(),
        supplierTaxNumber: form.supplierTaxNumber.trim() || 'N/A',
        totalAmount: parsedAmount,
        vatAmount: form.vatAmount ? parseLocalizedFloat(form.vatAmount) : undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        invoiceDate: form.invoiceDate || undefined,
        dueDate: form.dueDate || undefined,
      });
      notify.success(t('common.success'), t('invoice.create'));
      setShowCreateModal(false);
      setForm({ invoiceNumber: '', customerName: '', supplierTaxNumber: '', totalAmount: '', vatAmount: '', customerPhone: '', invoiceDate: '', dueDate: '' });
      setPage(1);
      fetchInvoices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(t('common.error'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (file: File) => {
    try {
      setSubmitting(true);
      const result = await apiService.uploadInvoiceFile(file);
      notify.success(
        'جارٍ المعالجة',
        `تم رفع الفاتورة "${file.name}" بنجاح. سيتم استخراج البيانات تلقائياً بالذكاء الاصطناعي. المعرف: ${(result as any)?.jobId ?? '—'}`
      );
      setShowUploadModal(false);
      setUploadFile(null);
      setTimeout(() => fetchInvoices(), 2000);
    } catch (err) {
      notify.error(t('common.error'), String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await apiService.exportReport('xlsx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success(t('common.success'), t('common.export'));
    } catch (err) {
      notify.error(t('common.error'), String(err));
    }
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: t('invoice.number'),
      accessor: (row) => (
        <span className="font-semibold text-content-primary">{row.invoiceNumber || '—'}</span>
      ),
      sortable: true,
    },
    {
      key: 'customerName',
      header: t('invoice.customer'),
      accessor: (row) => row.customerName,
      sortable: true,
    },
    {
      key: 'totalAmount',
      header: t('invoice.amount'),
      accessor: (row) => (
        <span className="font-mono tabular-nums font-semibold">{formatCurrency(row.totalAmount)}</span>
      ),
      align: 'end',
      sortable: true,
    },
    {
      key: 'vatAmount',
      header: t('invoice.vat'),
      accessor: (row) => (
        <span className="font-mono tabular-nums text-content-secondary">
          {row.vatAmount ? formatCurrency(row.vatAmount) : '—'}
        </span>
      ),
      align: 'end',
    },
    {
      key: 'invoiceDate',
      header: t('invoice.invoiceDate'),
      accessor: (row) => row.invoiceDate ? formatDate(row.invoiceDate) : '—',
    },
    {
      key: 'dueDate',
      header: t('invoice.dueDate'),
      accessor: (row) => row.dueDate ? formatDate(row.dueDate) : '—',
    },
    {
      key: 'status',
      header: t('invoice.status'),
      accessor: (row) => (
        <Badge variant={getInvoiceStatusVariant(row.status)} dot>
          {getStatusLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      accessor: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            icon={Eye}
            onClick={() => handleRowClick(row)}
            aria-label="عرض التفاصيل"
          />
          {canApproveInvoice && (row.status === 'READY_FOR_REVIEW' || row.status === 'NEEDS_REVIEW') && (
            <Button
              size="sm"
              variant="ghost"
              icon={CheckCircle}
              onClick={() => handleApprove(row)}
              aria-label={t('invoice.approve')}
              className="text-emerald-600 hover:text-emerald-700"
            />
          )}
          {canSendWhatsApp && row.status === 'APPROVED' && row.invoiceNumber && row.customerName && (row as any).supplierTaxNumber && row.totalAmount && Number(row.totalAmount) > 0 && row.customerPhone && (
            <Button
              size="sm"
              variant="ghost"
              icon={MessageCircle}
              onClick={() => {
                setWhatsappInvoice(row);
                setWhatsappStage('FIRST');
                setShowWhatsappModal(true);
              }}
              aria-label={t('whatsapp.send')}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <PageHeader
        title={t('invoice.title')}
        actions={
          canCreateInvoice ? (
            <>
              <Button variant="outline" icon={Upload} onClick={() => setShowUploadModal(true)}>
                {t('invoice.upload')}
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>
                {t('invoice.create')}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mt-6 space-y-4">
        {/* Status tabs */}
        <Tabs
          tabs={statusTabs.map(tab => ({ key: tab.key, label: tab.label }))}
          activeTab={activeTab}
          onChange={(key) => { setActiveTab(key); setPage(1); }}
          variant="pills"
          size="sm"
        />

        {/* DataTable — rows are clickable */}
        <DataTable
          columns={columns}
          data={invoices}
          keyExtractor={(row) => row.id}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          searchable
          searchPlaceholder={t('common.search')}
          onSearch={(q) => { setSearchQuery(q); setPage(1); }}
          pagination
          pageSize={pageSize}
          currentPage={page}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          exportable
          onExport={handleExport}
          loading={loading}
          emptyTitle={t('common.noData')}
          emptyDescription={t('invoice.title')}
          onRowClick={handleRowClick}
          actions={
            canApproveInvoice && selectedKeys.size > 0 ? (
              <Button size="sm" variant="primary" icon={CheckCircle}>
                {t('invoice.approve')} ({selectedKeys.size})
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        invoice={selectedInvoice}
        open={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedInvoice(null); }}
        onApprove={handleApprove}
        onSubmitReview={handleSubmitReview}
        onRefresh={fetchInvoices}
      />

      {/* Create Invoice Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('invoice.create')} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
          <Input label={`${t('invoice.number')} *`} value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} required />
          <Input label={`${t('invoice.customer')} *`} value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
          <Input label={t('invoice.taxNumber')} value={form.supplierTaxNumber} onChange={e => setForm(f => ({ ...f, supplierTaxNumber: e.target.value }))} placeholder="اختياري (أو N/A تلقائياً)" />
          <Input label={`${t('invoice.amount')} *`} type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} required />
          <Input label={t('invoice.vat')} type="number" value={form.vatAmount} onChange={e => setForm(f => ({ ...f, vatAmount: e.target.value }))} />
          <Input label={t('common.date')} type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} />
          <Input label={t('invoice.dueDate')} type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          <Input label="هاتف العميل" type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowCreateModal(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleCreate} loading={submitting}>{t('common.save')}</Button>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={showUploadModal} onClose={() => { setShowUploadModal(false); setUploadFile(null); }} title="رفع فاتورة للقراءة الذكية" size="md">
        <div className="p-6 space-y-4">
          <div
            className={`flex flex-col items-center justify-center w-full h-52 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
              uploadDragging
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                : uploadFile
                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-border hover:border-teal-400 hover:bg-surface-2'
            }`}
            onDragOver={(e) => { e.preventDefault(); setUploadDragging(true); }}
            onDragLeave={() => setUploadDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setUploadDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) setUploadFile(file);
            }}
            onClick={() => document.getElementById('invoice-file-input')?.click()}
          >
            {uploadFile ? (
              <>
                <FileCheck className="w-12 h-12 text-emerald-500 mb-3" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{uploadFile.name}</p>
                <p className="text-xs text-content-tertiary mt-1">{(uploadFile.size / 1024).toFixed(1)} KB — انقر للتغيير</p>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 text-content-tertiary mb-3" />
                <p className="text-sm font-semibold text-content-primary">اسحب الفاتورة هنا أو انقر للاختيار</p>
                <p className="text-xs text-content-tertiary mt-1">PDF, JPG, PNG — حد أقصى 10 ميجا</p>
                <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 font-medium">
                  سيتم استخراج بيانات الفاتورة تلقائياً بالذكاء الاصطناعي ✨
                </p>
              </>
            )}
            <input
              id="invoice-file-input"
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setUploadFile(file);
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setShowUploadModal(false); setUploadFile(null); }}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              icon={Upload}
              disabled={!uploadFile}
              loading={submitting}
              onClick={() => uploadFile && handleUpload(uploadFile)}
            >
              رفع وقراءة الفاتورة
            </Button>
          </div>
        </div>
      </Modal>

      {/* WhatsApp Stage Selection Modal */}
      <Modal
        open={showWhatsappModal}
        onClose={() => {
          setShowWhatsappModal(false);
          setWhatsappInvoice(null);
        }}
        title="تحديد مرحلة تذكير الدفع عبر الواتساب"
        size="md"
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-content-secondary">
            يرجى اختيار مرحلة التذكير بالفاتورة رقم <strong className="text-content-primary">{whatsappInvoice?.invoiceNumber}</strong> لإرسالها للعميل:
          </p>
          <div className="space-y-3">
            <Select
              label="مرحلة التذكير"
              value={whatsappStage}
              onChange={(e) => setWhatsappStage(e.target.value as any)}
              options={[
                { value: 'FIRST', label: 'التذكير الأول (تحذير لطيف ومبكر)' },
                { value: 'SECOND', label: 'التذكير الثاني (متابعة الدفع والمستحقات)' },
                { value: 'FINAL', label: 'التذكير النهائي (إشعار الدفع النهائي قبل تعليق الخدمة)' }
              ]}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setShowWhatsappModal(false);
                setWhatsappInvoice(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              variant="primary"
              icon={MessageCircle}
              loading={sendingWhatsapp}
              onClick={handleSendWhatsApp}
            >
              إرسال التذكير الآن
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
