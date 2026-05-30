import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HelpCircle, MessageSquare, Plus, CheckCircle, AlertCircle, Clock,
  Eye, RefreshCw, Send, ChevronLeft
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, CardContent, CardHeader, Input, Select, Textarea, Badge } from '@/components/ui';
import { apiService, ApiError } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { formatDate } from '@/utils/utils';

export default function SupportPage() {
  const { t } = useTranslation();
  const notify = useNotification();

  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // New ticket state
  const [newTicket, setNewTicket] = useState({
    category: 'other',
    priority: 'normal',
    description: ''
  });

  // Selected ticket for details modal
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.getTickets() as any;
      // Handle response structure resilience ({ tickets: [] } or raw array)
      if (res && res.tickets) {
        setTickets(res.tickets);
      } else if (Array.isArray(res)) {
        setTickets(res);
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
      notify.error('خطأ', 'فشل تحميل تذاكر الدعم الفني');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTicket.description.trim().length < 5) {
      notify.error('خطأ', 'يرجى كتابة وصف التذكرة بوضوح (5 أحرف على الأقل)');
      return;
    }

    setSubmitting(true);
    try {
      // Direct call bypassing typing limits using any cast
      await apiService.createTicket({
        category: newTicket.category,
        priority: newTicket.priority,
        description: newTicket.description
      } as any);

      notify.success('تم الإرسال', 'تم إنشاء تذكرة الدعم بنجاح وجاري العمل عليها');
      setNewTicket({
        category: 'other',
        priority: 'normal',
        description: ''
      });
      setShowNewForm(false);
      fetchTickets();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل إنشاء تذكرة الدعم';
      notify.error('خطأ', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="warning">مفتوحة</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">قيد المعالجة</Badge>;
      case 'CLOSED':
        return <Badge variant="success">مغلقة</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const p = priority.toLowerCase();
    switch (p) {
      case 'high':
        return <Badge variant="danger">عالية</Badge>;
      case 'normal':
        return <Badge variant="default">عادية</Badge>;
      case 'low':
        default:
          return <Badge variant="success">منخفضة</Badge>;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'login': return 'تسجيل الدخول والوصول';
      case 'invoice': return 'إدارة واعتماد الفواتير';
      case 'whatsapp': return 'بوابة واتساب والربط';
      case 'bank': return 'المطابقة والعمليات البنكية';
      case 'reports': return 'التقارير والإحصاءات';
      case 'backup': return 'طلب نسخ احتياطي أو استرجاع';
      case 'permissions': return 'الصلاحيات والفرق';
      case 'other':
      default:
        return 'أخرى / استفسار عام';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="مركز الدعم الفني والمساعدة"
        description="تواصل مباشرة مع المشغلين ومنفذي النظام للحصول على المساعدة التقنية والمالية الفورية"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: LIST OF TICKETS */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-content-primary">تذاكر الدعم الخاصة بالمنشأة</h3>
                <p className="text-xs text-content-secondary">قائمة بكافة الطلبات المفتوحة والسابقة والردود الواردة عليها</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={fetchTickets} loading={loading}>
                  <RefreshCw size={14} className="me-1" />
                  تحديث
                </Button>
                <Button variant="primary" size="sm" onClick={() => setShowNewForm(!showNewForm)}>
                  <Plus size={14} className="me-1" />
                  تذكرة جديدة
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading && tickets.length === 0 ? (
                <div className="p-12 text-center text-content-secondary">جاري جلب قائمة التذاكر...</div>
              ) : tickets.length === 0 ? (
                <div className="p-12 text-center text-content-secondary">
                  لا توجد تذاكر دعم فني مسجلة لمنشأتكم حالياً.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-content-secondary text-xs font-semibold">
                        <th className="p-4 text-start">رقم التذكرة</th>
                        <th className="p-4 text-start">التصنيف</th>
                        <th className="p-4 text-start">الأهمية</th>
                        <th className="p-4 text-start">الوصف</th>
                        <th className="p-4 text-start">الحالة</th>
                        <th className="p-4 text-start">التاريخ</th>
                        <th className="p-4 text-center">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                      {tickets.map((t, idx) => (
                        <tr key={t.id || idx} className="hover:bg-surface-2 transition-colors">
                          <td className="p-4 text-content-primary font-mono text-xs">{t.id ? t.id.substring(0, 8) : `#${idx}`}</td>
                          <td className="p-4 text-content-primary font-medium">{getCategoryLabel(t.category)}</td>
                          <td className="p-4">{getPriorityBadge(t.priority)}</td>
                          <td className="p-4 text-content-secondary max-w-xs truncate">{t.description}</td>
                          <td className="p-4">{getStatusBadge(t.status)}</td>
                          <td className="p-4 text-content-tertiary whitespace-nowrap">{formatDate(t.created_at || t.createdAt)}</td>
                          <td className="p-4 text-center">
                            <Button variant="secondary" size="sm" onClick={() => setSelectedTicket(t)}>
                              <Eye size={12} className="me-1" />
                              عرض التفاصيل
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: NEW TICKET FORM / DETAILS VIEW */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {showNewForm ? (
            <Card className="border-primary-100 bg-primary-50/10">
              <CardHeader>
                <h3 className="text-md font-bold text-content-primary">فتح تذكرة دعم فني جديدة</h3>
                <p className="text-xs text-content-secondary">يرجى توضيح المشكلة أو الاستفسار بأكبر قدر من التفصيل</p>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={handleSubmitTicket} className="flex flex-col gap-4">
                  <Select
                    label="تصنيف المشكلة"
                    value={newTicket.category}
                    onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                    options={[
                      { value: 'other', label: 'استفسار عام / غير ذلك' },
                      { value: 'login', label: 'مشكلة في تسجيل الدخول والأمان' },
                      { value: 'invoice', label: 'مشكلة في استيراد وقراءة الفواتير (OCR)' },
                      { value: 'whatsapp', label: 'مشكلة في ربط وإرسال الواتساب' },
                      { value: 'bank', label: 'مشكلة في استيراد ومطابقة كشوف الحساب' },
                      { value: 'reports', label: 'مشكلة في حساب التقارير والرسوم البيانية' },
                      { value: 'backup', label: 'طلب نسخ احتياطي أو استرجاع' },
                      { value: 'permissions', label: 'مشكلة في الصلاحيات والفرق' }
                    ]}
                  />

                  <Select
                    label="مستوى الأهمية"
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                    options={[
                      { value: 'low', label: 'منخفضة (استفسار غير عاجل)' },
                      { value: 'normal', label: 'متوسطة / عادية' },
                      { value: 'high', label: 'عالية (تعطل في جزء من المهام)' }
                    ]}
                  />

                  <Textarea
                    label="تفاصيل المشكلة والوصف الدقيق"
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                    placeholder="اكتب وصفاً مفصلاً للمشكلة والخطوات التي قمت بها مع إدراج أرقام الفواتير المتأثرة إن وجدت..."
                    rows={6}
                    required
                  />

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" size="sm" type="button" onClick={() => setShowNewForm(false)}>
                      إلغاء
                    </Button>
                    <Button variant="primary" size="sm" type="submit" loading={submitting}>
                      <Send size={12} className="me-1" />
                      إرسال التذكرة
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : selectedTicket ? (
            <Card className="border-border bg-surface-1">
              <CardHeader className="border-b border-border pb-3 flex flex-row items-center justify-between">
                <div>
                  <h3 className="text-md font-bold text-content-primary">معاينة التذكرة #{selectedTicket.id ? selectedTicket.id.substring(0, 8) : ''}</h3>
                  <p className="text-xs text-content-secondary">تفاصيل المحادثة والردود</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setSelectedTicket(null)}>
                  إغلاق
                </Button>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-content-tertiary">التصنيف: {getCategoryLabel(selectedTicket.category)}</span>
                    <div>{getStatusBadge(selectedTicket.status)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-2 text-sm text-content-primary border border-border">
                    <p className="font-bold text-xs text-content-secondary mb-1">وصف المشكلة من قبلكم:</p>
                    <p className="whitespace-pre-line">{selectedTicket.description}</p>
                    <p className="text-[10px] text-content-tertiary mt-2">تاريخ الإرسال: {formatDate(selectedTicket.created_at || selectedTicket.createdAt)}</p>
                  </div>
                </div>

                {selectedTicket.support_response || selectedTicket.supportResponse ? (
                  <div className="p-3 rounded-lg bg-primary-50/20 dark:bg-primary-950/10 text-sm text-content-primary border border-primary-200">
                    <p className="font-bold text-xs text-primary-700 dark:text-primary-400 mb-1">رد مستشار الدعم الفني:</p>
                    <p className="whitespace-pre-line">{selectedTicket.support_response || selectedTicket.supportResponse}</p>
                    <p className="text-[10px] text-content-tertiary mt-2">
                      تم الرد في: {selectedTicket.responded_at || selectedTicket.respondedAt ? formatDate(selectedTicket.responded_at || selectedTicket.respondedAt) : '-'}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-warning-50/20 text-xs text-warning-800 border border-warning-200 flex items-start gap-2">
                    <Clock size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">قيد الانتظار</p>
                      <p>التذكرة معروضة حالياً على مهندسي ومستشاري المنصة وسيتم موافاتكم بالرد والحل هنا في أقرب وقت.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="p-6 text-center border border-dashed rounded-xl flex flex-col items-center justify-center min-h-[300px] text-content-secondary gap-2 bg-surface-1">
              <HelpCircle className="w-10 h-10 text-content-tertiary" />
              <p className="font-bold text-sm">حدد تذكرة لعرض تفاصيلها</p>
              <p className="text-xs">انقر على زر "عرض التفاصيل" بجانب التذكرة لرؤية الردود أو التحديثات عليها.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
