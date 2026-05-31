import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DollarSign, Receipt, Percent, FileDown,
  Clock, AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { apiService } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { formatCurrency } from '@/utils/utils';
import { useAuth } from '@/hooks/useAuth';
import type { FinanceReport } from '@/types';

export default function ReportsPage() {
  const { t } = useTranslation();
  const notify = useNotification();
  const { company } = useAuth();
  const companyName = company?.name || 'المنشأة الشريكة';

  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Filter dates
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.getFinanceReport({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setReport(data);
    } catch (err) {
      console.error('Error fetching report:', err);
      notify.error('خطأ', 'فشل في تحميل التقارير المالية');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, notify]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async (format: 'pdf' | 'csv' | 'xlsx') => {
    if (format === 'pdf') {
      window.print();
      return;
    }
    try {
      const blob = await apiService.exportReport(format, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_سند_المالي.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notify.success('تم التصدير بنجاح', `تم تحميل التقرير بصيغة ${format.toUpperCase()}`);
    } catch (err) {
      console.error('Export error:', err);
      notify.error('فشل التصدير', 'حدث خطأ أثناء تحميل الملف المصدّر');
    }
  };

  // Recharts details
  const COLORS = ['#10b981', '#f59e0b', '#14b8a6', '#ef4444'];

  const agingData = report ? [
    { name: '0-30 يوم', value: Number(report.aging['0_30']?.amount || 0) },
    { name: '31-60 يوم', value: Number(report.aging['31_60']?.amount || 0) },
    { name: '61-90 يوم', value: Number(report.aging['61_90']?.amount || 0) },
    { name: 'أكثر من 90 يوم', value: Number(report.aging['90_plus']?.amount || 0) }
  ].filter(d => d.value > 0) : [];

  const comparisonData = report?.monthlyComparison || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Screen Page Header (Hidden in Print) */}
      <div className="no-print">
        <PageHeader
          title="التقارير التحليلية والمالية"
          description="استعرض أداء التحصيل، وتفاصيل الفواتير، وتحليل أعمار الذمم للمنشأة"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => handleExport('xlsx')} size="sm">
                <FileDown size={14} className="me-1.5" />
                تصدير Excel
              </Button>
              <Button variant="secondary" onClick={() => handleExport('csv')} size="sm">
                <FileDown size={14} className="me-1.5" />
                تصدير CSV
              </Button>
              <Button variant="primary" onClick={() => handleExport('pdf')} size="sm">
                <FileDown size={14} className="me-1.5" />
                تصدير PDF الاحترافي
              </Button>
            </div>
          }
        />
      </div>

      {/* Screen Date Filters (Hidden in Print) */}
      <div className="no-print">
        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <Input
                label="تاريخ البداية"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex-1 w-full">
              <Input
                label="تاريخ النهاية"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="pt-5 shrink-0 w-full md:w-auto flex gap-2">
              <Button variant="primary" onClick={fetchReport} className="w-full md:w-auto">
                تصفية التقرير
              </Button>
              <Button variant="secondary" onClick={() => { setStartDate(''); setEndDate(''); }} className="w-full md:w-auto">
                تصفير
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="p-12 text-center text-content-secondary no-print">جاري تحميل البيانات والتحليلات...</div>
      ) : !report ? (
        <div className="no-print">
          <Card className="border-danger-200 bg-danger-50 dark:bg-danger-900/10">
            <CardContent className="flex items-center gap-2.5 p-4 text-sm text-danger-700 dark:text-danger-400">
              <AlertCircle size={16} />
              تعذر تحميل بيانات التقرير المالي للمنشأة.
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* ============================================================
              PRINT-ONLY: PROFESSIONAL HEADER & COVER INFORMATION
             ============================================================ */}
          <div className="hidden print:block border-b-2 border-teal-600 pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg">س</div>
                  <h1 className="text-xl font-bold text-teal-800">منصة سند الذكي</h1>
                </div>
                <p className="text-[10px] text-content-secondary mt-1">نظام الربط الإلكتروني وإدارة التحصيل الذكي للذمم المالية للمنشآت</p>
              </div>
              <div className="text-end">
                <h2 className="text-base font-bold text-content-primary">تقرير الأداء والتحليل المالي للذمم</h2>
                <p className="text-xs text-content-secondary mt-1">المنشأة الشريكة: <strong>{companyName}</strong></p>
                <p className="text-[10px] text-content-tertiary">تاريخ الإصدار: {new Date().toLocaleDateString('ar-SA')} - {new Date().toLocaleTimeString('ar-SA')}</p>
              </div>
            </div>
            {(startDate || endDate) && (
              <div className="mt-3 text-[10px] text-teal-800 bg-teal-50 border border-teal-100 p-2 rounded flex gap-4">
                {startDate && <span><strong>من تاريخ:</strong> {startDate}</span>}
                {endDate && <span><strong>إلى تاريخ:</strong> {endDate}</span>}
              </div>
            )}
          </div>

          {/* ============================================================
              PRINT-ONLY: KPI TABLE (CLEAN & SHARP FOR CFO AUDITING)
             ============================================================ */}
          <div className="hidden print:block mb-6">
            <h3 className="text-xs font-bold text-teal-800 mb-2 border-s-4 border-teal-600 pr-2">ملخص مؤشرات الأداء والملائمة المالية</h3>
            <table className="w-full text-start text-xs border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">إجمالي الفواتير المعالجة</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">إجمالي المبالغ المحصلة</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">المبالغ المستحقة المعلقة</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">معدل التحصيل المالي</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2.5 px-3 border-e border-slate-200 font-bold">{report.summary.totalInvoices} فاتورة</td>
                  <td className="py-2.5 px-3 border-e border-slate-200 font-bold text-emerald-700">{formatCurrency(report.summary.paidAmount)}</td>
                  <td className="py-2.5 px-3 border-e border-slate-200 font-bold text-amber-600">{formatCurrency(report.summary.outstandingAmount)}</td>
                  <td className="py-2.5 px-3 font-bold text-teal-700">{report.summary.collectionRate}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SCREEN-ONLY: KPI Dashboard (Hidden in Print) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-content-secondary">إجمالي المبالغ المحصلة</p>
                  <h4 className="text-xl font-bold text-emerald-600 dark:text-emerald-500 mt-1">{formatCurrency(report.summary.paidAmount)}</h4>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-600">
                  <DollarSign size={20} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-content-secondary">المبالغ المستحقة المعلقة</p>
                  <h4 className="text-xl font-bold text-amber-600 dark:text-amber-500 mt-1">{formatCurrency(report.summary.outstandingAmount)}</h4>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center text-amber-600">
                  <Clock size={20} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-content-secondary">معدل التحصيل المالي</p>
                  <h4 className="text-xl font-bold text-teal-600 mt-1">{report.summary.collectionRate}%</h4>
                </div>
                <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950/20 flex items-center justify-center text-teal-600">
                  <Percent size={20} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-content-secondary">عدد الفواتير المعالجة</p>
                  <h4 className="text-xl font-bold text-content-primary mt-1">{report.summary.totalInvoices}</h4>
                </div>
                <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center text-content-primary">
                  <Receipt size={20} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SCREEN-ONLY: Charts Area (Hidden in Print) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="text-base font-bold text-content-primary mb-4">أداء التحصيل والمقارنة الشهرية</h3>
                <div className="h-80">
                  {comparisonData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-content-tertiary">لا توجد بيانات مقارنة</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparisonData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        <Legend />
                        <Bar name="إجمالي الفواتير" dataKey="totalAmount" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                        <Bar name="المبالغ المحصلة" dataKey="paidAmount" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="text-base font-bold text-content-primary mb-4">هيكل أعمار الذمم المالي</h3>
                <div className="h-80 flex flex-col items-center justify-center">
                  {agingData.length === 0 ? (
                    <div className="text-content-tertiary">لا توجد ذمم معلقة حالياً</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="70%">
                        <PieChart>
                          <Pie
                            data={agingData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {agingData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 gap-2 text-xs w-full mt-4">
                        {agingData.map((item, index) => (
                          <div key={item.name} className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <span className="text-content-secondary truncate">
                              {item.name}: {formatCurrency(item.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ============================================================
              PRINT-ONLY: MONTHLY COMPARISON TABLE
             ============================================================ */}
          <div className="hidden print:block mb-6">
            <h3 className="text-xs font-bold text-teal-800 mb-2 border-s-4 border-teal-600 pr-2">تحليل التحصيل والمقارنة الشهرية</h3>
            <table className="w-full text-start text-xs border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">الشهر المالي</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">عدد الفواتير المنشأة</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">إجمالي قيمة الفواتير</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">المبالغ المحصلة</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">معدل التحصيل الشهري</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-2 px-3 text-center text-slate-400">لا توجد بيانات مقارنة شهرياً</td>
                  </tr>
                ) : (
                  comparisonData.map((item, idx) => {
                    const rate = item.totalAmount > 0 
                      ? Math.round((item.paidAmount / item.totalAmount) * 100) 
                      : 0;
                    return (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-semibold border-e border-slate-100">{item.month}</td>
                        <td className="py-2 px-3 border-e border-slate-100">{item.invoicesCreated || 0}</td>
                        <td className="py-2 px-3 border-e border-slate-100 font-mono">{formatCurrency(item.totalAmount)}</td>
                        <td className="py-2 px-3 border-e border-slate-100 font-mono text-emerald-700">{formatCurrency(item.paidAmount)}</td>
                        <td className="py-2 px-3 font-bold text-teal-700">{rate}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ============================================================
              PRINT-ONLY: AGING DEBT STRUCTURE TABLE
             ============================================================ */}
          <div className="hidden print:block mb-6">
            <h3 className="text-xs font-bold text-teal-800 mb-2 border-s-4 border-teal-600 pr-2">تحليل هيكل أعمار الذمم المالي</h3>
            <table className="w-full text-start text-xs border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">شريحة تأخر الذمة المالية</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">إجمالي المبلغ المعلق المستحق</th>
                  <th className="py-2 px-3 text-start font-semibold text-slate-700">النسبة المئوية من إجمالي الدين</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agingData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-2 px-3 text-center text-slate-400">لا توجد ذمم معلقة حالياً</td>
                  </tr>
                ) : (
                  agingData.map((item, idx) => {
                    const totalOutstanding = report.summary.outstandingAmount || 1;
                    const percent = Math.round((item.value / totalOutstanding) * 100);
                    return (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-semibold border-e border-slate-100">{item.name}</td>
                        <td className="py-2 px-3 border-e border-slate-100 font-mono font-bold text-amber-600">{formatCurrency(item.value)}</td>
                        <td className="py-2 px-3 font-bold text-teal-700">{percent}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Top Overdue Customers Card (Visible in both screen & print) */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-base font-bold text-teal-800 dark:text-teal-400 mb-4 border-s-4 border-teal-600 pr-2">أكبر العملاء المتأخرين عن السداد</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-start">
                  <thead>
                    <tr className="border-b border-border text-content-secondary bg-slate-50 dark:bg-slate-900/30">
                      <th className="py-2.5 px-3 text-start font-semibold">اسم العميل</th>
                      <th className="py-2.5 px-3 text-start font-semibold">عدد الفواتير المعلقة</th>
                      <th className="py-2.5 px-3 text-start font-semibold">المبلغ الإجمالي المستحق</th>
                      <th className="py-2.5 px-3 text-start font-semibold text-danger-700 dark:text-danger-400">منها مبالغ متأخرة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.topOverdueCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-content-tertiary">
                          لا يوجد عملاء متأخرون في السداد
                        </td>
                      </tr>
                    ) : (
                      report.topOverdueCustomers.map((cust, i) => (
                        <tr key={i} className="text-content-primary">
                          <td className="py-3 px-3 font-semibold">{cust.customerName}</td>
                          <td className="py-3 px-3">{cust.invoiceCount}</td>
                          <td className="py-3 px-3 font-semibold">{formatCurrency(cust.totalAmount)}</td>
                          <td className="py-3 px-3 font-semibold text-danger-600 dark:text-danger-400">{formatCurrency(cust.overdueAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ============================================================
              PRINT-ONLY: CFO SIGNATURE BLOCK AND AUDIT FOOTER
             ============================================================ */}
          <div className="hidden print:block mt-12 pt-6 border-t border-dashed border-slate-300">
            <div className="grid grid-cols-2 gap-8 text-xs">
              <div>
                <p className="font-bold text-slate-700">إعداد وتأكيد الإدارة المالية:</p>
                <div className="mt-8 border-b border-slate-400 w-48 h-5"></div>
                <p className="text-[10px] text-content-secondary mt-1">الاسم:</p>
                <p className="text-[10px] text-content-secondary mt-1">التوقيع والتاريخ:</p>
              </div>
              <div className="text-end flex flex-col items-end">
                <div className="w-fit text-start">
                  <p className="font-bold text-slate-700">المصادقة والاعتماد (الإدارة العليا):</p>
                  <div className="mt-8 border-b border-slate-400 w-48 h-5"></div>
                  <p className="text-[10px] text-content-secondary mt-1">الاسم والمنصب:</p>
                  <p className="text-[10px] text-content-secondary mt-1">الختم والتوقيع الرسمي:</p>
                </div>
              </div>
            </div>
            <div className="mt-12 text-center text-[9px] text-content-tertiary">
              تقرير رسمي صادر مشفراً بالكامل من نظام منصة سند الذكي لإدارة الفواتير والتحصيل المالي والربط مع هيئة الزكاة والضريبة والجمارك (ZATCA).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
