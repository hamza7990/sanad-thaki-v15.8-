import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ScanLine, Upload, CheckCircle, XCircle, Eye, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Badge, Card, CardContent, Modal, EmptyState } from '@/components/ui';
import { KPICard } from '@/components/ui/KPICard';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { apiService } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { cn, formatCurrency } from '@/utils/utils';
import type { ProcessingJob } from '@/types';

export default function OcrCenterPage() {
  const { t } = useTranslation();
  const notify = useNotification();
  const [activeTab, setActiveTab] = useState('queue');
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchJobs = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const data = await apiService.getProcessingJobs();
      setJobs(data);
    } catch (err) {
      console.error('Error fetching processing jobs:', err);
      if (!isSilent) notify.error(t('common.error'), 'فشل في تحميل قائمة معالجة الفواتير');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    fetchJobs();

    // Auto-poll the queue every 4 seconds so the user sees real-time OCR results
    const interval = setInterval(() => {
      fetchJobs(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleUpload = async (files: FileList) => {
    try {
      setUploading(true);
      for (const file of Array.from(files)) {
        await apiService.uploadInvoiceFile(file);
      }
      notify.success(t('common.success'), `تم رفع ${files.length} فاتورة وبدأت المعالجة بالذكاء الاصطناعي`);
      setShowUploadModal(false);
      fetchJobs();
    } catch (err) {
      notify.error(t('common.error'), String(err));
    } finally {
      setUploading(false);
    }
  };

  const queueTabs = [
    { key: 'queue', label: 'قائمة المعالجة النشطة', icon: ScanLine },
    { key: 'completed', label: 'المستخرجة بنجاح', icon: CheckCircle },
    { key: 'failed', label: 'التي تعذر استخراجها', icon: XCircle },
  ];

  const getConfidenceColor = (score: number) => {
    if (score >= 85) return 'success';
    if (score >= 60) return 'warning';
    return 'danger';
  };

  // Dynamic KPI Calculations from the loaded jobs
  const totalJobs = jobs.length;
  
  const completedJobs = jobs.filter(j => j.status === 'PASSED' || j.status === 'PENDING_REVIEW');
  const successRate = totalJobs > 0 ? Math.round((completedJobs.length / totalJobs) * 100) : 0;
  
  const confidenceScores = completedJobs.map(j => Number(j.confidence || 0));
  const avgConfidence = confidenceScores.length > 0 ? Math.round((confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length) * 100) : 0;
  
  const pendingReviewCount = jobs.filter(j => j.status === 'PENDING_REVIEW').length;

  // Filtered jobs for lists
  const activeQueueJobs = jobs.filter(j => j.status === 'QUEUED' || j.status === 'PROCESSING');
  const failedJobs = jobs.filter(j => j.status === 'FAILED');

  // Columns Configuration
  const queuedColumns: Column<any>[] = [
    {
      key: 'fileName',
      header: 'اسم الملف المرفوع',
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-content-primary">{row.fileName}</span>
          <span className="text-xs text-content-tertiary">{row.mimeType}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'تاريخ وقت الرفع',
      accessor: (row) => <span>{new Date(row.createdAt).toLocaleString('ar-SA')}</span>,
    },
    {
      key: 'status',
      header: 'الحالة الحالية المعالجة',
      accessor: (row) => (
        <Badge variant={row.status === 'PROCESSING' ? 'warning' : 'default'} dot>
          {row.status === 'PROCESSING' ? 'جاري القراءة والاستخراج بالذكاء الاصطناعي...' : 'بانتظار دور المعالجة...'}
        </Badge>
      ),
    },
    {
      key: 'attempts',
      header: 'محاولات الاسترجاع',
      accessor: (row) => <span className="font-mono text-content-secondary">{row.attempts} / 3</span>,
    },
  ];

  const completedColumns: Column<any>[] = [
    {
      key: 'fileName',
      header: 'الملف والبيانات المستخرجة للدفاتر الماليّة',
      accessor: (row) => {
        const details = row.extracted || {};
        return (
          <div className="flex flex-col gap-1.5 py-1">
            <span className="font-semibold text-content-primary">{row.fileName}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-1.5 text-xs text-teal-800 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20 p-2 rounded border border-teal-100 dark:border-teal-900/30">
              {details.invoiceNumber && <span><strong>رقم الفاتورة:</strong> {details.invoiceNumber}</span>}
              {details.customerName && <span><strong>العميل:</strong> {details.customerName}</span>}
              {details.totalAmount && <span><strong>المبلغ:</strong> {formatCurrency(Number(details.totalAmount))}</span>}
            </div>
          </div>
        );
      },
    },
    {
      key: 'processingFinishedAt',
      header: 'تاريخ ووقت المعالجة',
      accessor: (row) => <span>{row.processingFinishedAt ? new Date(row.processingFinishedAt).toLocaleString('ar-SA') : '—'}</span>,
    },
    {
      key: 'confidence',
      header: 'معدل دقة القراءة',
      accessor: (row) => {
        const score = Math.round((row.confidence || 0) * 100);
        return (
          <Badge variant={getConfidenceColor(score)} size="sm">
            {score}%
          </Badge>
        );
      },
      align: 'center',
    },
    {
      key: 'status',
      header: 'الحالة في الفواتير',
      accessor: (row) => (
        <Badge variant={row.status === 'PASSED' ? 'success' : 'warning'} dot>
          {row.status === 'PASSED' ? 'مكتمل ومسجل كمسودة' : 'بانتظار مراجعة المدير المالي'}
        </Badge>
      ),
    },
  ];

  const failedColumns: Column<any>[] = [
    {
      key: 'fileName',
      header: 'اسم الملف المرفوع',
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-content-primary">{row.fileName}</span>
          <span className="text-xs text-content-tertiary">{row.mimeType}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'وقت المحاولة',
      accessor: (row) => <span>{new Date(row.createdAt).toLocaleString('ar-SA')}</span>,
    },
    {
      key: 'errorMessage',
      header: 'سبب تعذر القراءة والخطأ المكتشف',
      accessor: (row) => (
        <span className="text-danger-600 text-xs font-semibold block max-w-sm whitespace-normal" title={row.errorMessage}>
          {row.errorMessage || 'تنسيق الملف غير مدعوم أو غير مقروء بصرياً'}
        </span>
      ),
    },
    {
      key: 'attempts',
      header: 'المحاولات',
      accessor: (row) => <span className="font-mono text-danger-700 font-bold">{row.attempts} / 3</span>,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <PageHeader
        title="مركز معالجة الفواتير (OCR & AI)"
        description="معالجة فواتير المشتريات والمبيعات بالذكاء الاصطناعي واستخراج البيانات تلقائياً دون كتابة يدوية"
        actions={
          <Button variant="primary" icon={Upload} onClick={() => setShowUploadModal(true)}>
            رفع فواتير جديدة
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KPICard title="إجمالي الملفات المعالجة" value={String(totalJobs)} icon={ScanLine} loading={loading} />
        <KPICard title="معدل نجاح القراءة الذاتية" value={totalJobs > 0 ? `${successRate}%` : '—'} icon={CheckCircle} iconColor="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" loading={loading} />
        <KPICard title="متوسط دقة استخراج الحقول" value={completedJobs.length > 0 ? `${avgConfidence}%` : '—'} icon={Eye} iconColor="bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400" loading={loading} />
        <KPICard title="فواتير بانتظار المراجعة والاعتماد" value={String(pendingReviewCount)} icon={AlertTriangle} iconColor="bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400" loading={loading} />
      </div>

      {/* Tabs + Content */}
      <div className="mt-6">
        <Tabs tabs={queueTabs} activeTab={activeTab} onChange={setActiveTab} />

        <div className="mt-4">
          {activeTab === 'queue' && (
            <Card>
              <CardContent className="p-4">
                {activeQueueJobs.length > 0 ? (
                  <DataTable
                    columns={queuedColumns}
                    data={activeQueueJobs}
                    keyExtractor={(row) => row.id}
                    loading={loading}
                  />
                ) : (
                  <EmptyState
                    icon={ScanLine}
                    title="لا توجد فواتير قيد المعالجة حالياً"
                    description="ارفع صور الفواتير أو ملفات PDF لبدء عملية القراءة التلقائية بالذكاء الاصطناعي."
                    action={
                      <Button variant="primary" icon={Upload} onClick={() => setShowUploadModal(true)}>
                        رفع فواتير جديدة
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'completed' && (
            <Card>
              <CardContent className="p-4">
                {completedJobs.length > 0 ? (
                  <DataTable
                    columns={completedColumns}
                    data={completedJobs}
                    keyExtractor={(row) => row.id}
                    loading={loading}
                  />
                ) : (
                  <EmptyState
                    icon={CheckCircle}
                    title="لا توجد فواتير معالجة مكتملة"
                    description="بعد رفع الفواتير، ستظهر هنا تفاصيل الاستخراج التلقائي بنجاح."
                  />
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'failed' && (
            <Card>
              <CardContent className="p-4">
                {failedJobs.length > 0 ? (
                  <DataTable
                    columns={failedColumns}
                    data={failedJobs}
                    keyExtractor={(row) => row.id}
                    loading={loading}
                  />
                ) : (
                  <EmptyState
                    icon={XCircle}
                    title="لا توجد فواتير فاشلة"
                    description="تظهر هنا الملفات التي تعذر قراءتها بسبب دقة الصورة أو تلف الملف للتعديل عليها."
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <Modal open={showUploadModal} onClose={() => setShowUploadModal(false)} title="رفع فواتير للقراءة بالذكاء الاصطناعي" size="md">
        <div className="p-6">
          <label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-surface-2 transition-colors">
            <Upload className="w-12 h-12 text-content-tertiary mb-4 animate-bounce" />
            <p className="text-sm font-semibold text-content-primary">اسحب الفواتير هنا أو انقر للتصفح والرفع</p>
            <p className="text-xs text-content-tertiary mt-2">الملفات المدعومة: PDF, JPG, PNG — يمكنك رفع ملفات متعددة دفعة واحدة</p>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
              }}
            />
          </label>
        </div>
        {uploading && (
          <div className="px-6 pb-4">
            <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-teal-600 rounded-full animate-loading" style={{ width: '80%' }} />
            </div>
            <p className="text-xs text-teal-800 mt-2 text-center">جاري الرفع وتحليل الفواتير بصرياً بالذكاء الاصطناعي...</p>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
