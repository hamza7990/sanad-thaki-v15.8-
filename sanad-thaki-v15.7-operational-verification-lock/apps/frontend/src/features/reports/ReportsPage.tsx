import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, DollarSign, Receipt, Percent, FileDown,
  Calendar, RefreshCw, BarChart3, Clock, AlertCircle
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
import type { FinanceReport } from '@/types';

export default function ReportsPage() {
  const { t } = useTranslation();
  const notify = useNotification();

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
  const COLORS = ['var(--color-success-500)', 'var(--color-warning-500)', 'var(--color-primary-500)', 'var(--color-danger-500)'];

  const agingData = report ? [
    { name: '0-30 يوم', value: Number(report.aging['0_30']?.amount || 0) },
    { name: '31-60 يوم', value: Number(report.aging['31_60']?.amount || 0) },
    { name: '61-90 يوم', value: Number(report.aging['61_90']?.amount || 0) },
    { name: 'أكثر من 90 يوم', value: Number(report.aging['90_plus']?.amount || 0) }
  ].filter(d => d.value > 0) : [];

  const comparisonData = report?.monthlyComparison || [];

  return (
    <div className="flex flex-col gap-6">
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
            <Button variant="secondary" onClick={() => handleExport('pdf')} size="sm">
              <FileDown size={14} className="me-1.5" />
              تصدير PDF
            </Button>
          </div>
        }
      />

      {/* Date Filters */}
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

      {loading ? (
        <div className="p-12 text-center text-content-secondary">جاري تحميل البيانات والتحليلات...</div>
      ) : !report ? (
        <Card className="border-danger-200 bg-danger-50 dark:bg-danger-900/10">
          <CardContent className="flex items-center gap-2.5 p-4 text-sm text-danger-700 dark:text-danger-400">
            <AlertCircle size={16} />
            تعذر تحميل بيانات التقرير المالي للمنشأة.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-content-secondary">إجمالي المبالغ المحصلة</p>
                  <h4 className="text-xl font-bold text-success-600 mt-1">{formatCurrency(report.summary.paidAmount)}</h4>
                </div>
                <div className="w-10 h-10 rounded-lg bg-success-50 dark:bg-success-950/20 flex items-center justify-center text-success-600">
                  <DollarSign size={20} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-content-secondary">المبالغ المستحقة المعلقة</p>
                  <h4 className="text-xl font-bold text-warning-600 mt-1">{formatCurrency(report.summary.outstandingAmount)}</h4>
                </div>
                <div className="w-10 h-10 rounded-lg bg-warning-50 dark:bg-warning-950/20 flex items-center justify-center text-warning-600">
                  <Clock size={20} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-content-secondary">معدل التحصيل المالي</p>
                  <h4 className="text-xl font-bold text-primary-600 mt-1">{report.summary.collectionRate}%</h4>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-950/20 flex items-center justify-center text-primary-600">
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

          {/* Charts Area */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Invoice & Paid volume over time */}
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
                        <Bar name="إجمالي الفواتير" dataKey="totalAmount" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} />
                        <Bar name="المبالغ المحصلة" dataKey="paidAmount" fill="var(--color-success-500)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Aging structure */}
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

          {/* Top Overdue Customers Table */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-base font-bold text-content-primary mb-4">أكبر العملاء المتأخرين عن السداد</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-start">
                  <thead>
                    <tr className="border-b border-border text-content-secondary">
                      <th className="py-2.5 text-start font-semibold">اسم العميل</th>
                      <th className="py-2.5 text-start font-semibold">عدد الفواتير المعلقة</th>
                      <th className="py-2.5 text-start font-semibold">المبلغ الإجمالي المستحق</th>
                      <th className="py-2.5 text-start font-semibold">منها مبالغ متأخرة</th>
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
                          <td className="py-3 font-medium">{cust.customerName}</td>
                          <td className="py-3">{cust.invoiceCount}</td>
                          <td className="py-3 font-semibold">{formatCurrency(cust.totalAmount)}</td>
                          <td className="py-3 font-semibold text-danger-600">{formatCurrency(cust.overdueAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
