import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2, Users, Receipt, MessageCircle, AlertOctagon,
  Settings, Key, Database, RefreshCw, Send, ShieldAlert, CheckCircle, Clock, Plus
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, CardContent, CardHeader, Input, Select, Badge, Modal } from '@/components/ui';
import { Tabs } from '@/components/ui/Tabs';
import { apiService, ApiError } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { formatDate } from '@/utils/utils';

export default function PlatformPage() {
  const { t } = useTranslation();
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // Overview states
  const [overview, setOverview] = useState<any>(null);

  // Companies states
  const [companies, setCompanies] = useState<any[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Platform Tickets states
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [replyTicket, setReplyTicket] = useState<any | null>(null);
  const [supportReply, setSupportReply] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  // Platform logs states
  const [platformLogs, setPlatformLogs] = useState<any[]>([]);
  const [clientAuditSummary, setClientAuditSummary] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Action Modals (Rotate Key / Reprovision)
  const [rotateKeyCompany, setRotateKeyCompany] = useState<any | null>(null);
  const [reprovisionCompany, setReprovisionCompany] = useState<any | null>(null);
  const [confirmId, setConfirmId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Create Platform Company states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    taxNumber: '',
    email: '',
    city: '',
    packageCode: 'basic' as 'basic' | 'growth' | 'professional',
    status: 'TRIAL' as 'TRIAL' | 'ACTIVE' | 'SUSPENDED',
    primaryUserEmail: '',
    primaryUserPassword: '',
    primaryUserRole: 'ADMIN' as 'ADMIN' | 'FINANCE_MANAGER' | 'ACCOUNTANT'
  });

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getPlatformOverview();
      setOverview(data);
    } catch (err) {
      console.error('Error fetching platform overview:', err);
      notify.error('خطأ', 'فشل تحميل بيانات منصة الإشراف');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const data = await apiService.getPlatformCompanies();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching platform companies:', err);
      notify.error('خطأ', 'فشل تحميل قائمة الشركات');
    } finally {
      setLoadingCompanies(false);
    }
  }, [notify]);

  const fetchTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const data = await apiService.getPlatformTickets();
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching platform tickets:', err);
      notify.error('خطأ', 'فشل تحميل التذاكر');
    } finally {
      setLoadingTickets(false);
    }
  }, [notify]);

  const fetchSecurityLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await apiService.getPlatformSecurityLogs();
      setPlatformLogs(res.platformLogs || []);
      setClientAuditSummary(res.clientAuditSummary || []);
    } catch (err) {
      console.error('Error fetching security logs:', err);
      notify.error('خطأ', 'فشل تحميل سجلات الأمان');
    } finally {
      setLoadingLogs(false);
    }
  }, [notify]);

  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
    if (activeTab === 'companies') fetchCompanies();
    if (activeTab === 'tickets') fetchTickets();
    if (activeTab === 'logs') fetchSecurityLogs();
  }, [activeTab, fetchOverview, fetchCompanies, fetchTickets, fetchSecurityLogs]);

  // Handle Company Status Update
  const handleUpdateStatus = async (companyId: string, newStatus: string) => {
    try {
      await apiService.updateCompanyStatus(companyId, newStatus);
      notify.success('تم التحديث', 'تم تغيير حالة الشركة بنجاح');
      fetchCompanies();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل تغيير حالة الشركة';
      notify.error('خطأ', msg);
    }
  };

  // Handle Create Company Registration
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      notify.error('خطأ', 'يرجى إدخال اسم الشركة');
      return;
    }
    if (createForm.primaryUserEmail.trim() && !createForm.primaryUserPassword) {
      notify.error('خطأ', 'يرجى إدخال كلمة مرور للمسؤول الأول');
      return;
    }
    if (createForm.primaryUserEmail.trim() && createForm.primaryUserPassword.length < 12) {
      notify.error('خطأ', 'يجب أن تتكون كلمة المرور للمسؤول من 12 حرفاً على الأقل');
      return;
    }

    setCreateSubmitting(true);
    try {
      await apiService.createPlatformCompany({
        name: createForm.name.trim(),
        taxNumber: createForm.taxNumber.trim() || undefined,
        email: createForm.email.trim() || undefined,
        city: createForm.city.trim() || undefined,
        packageCode: createForm.packageCode,
        status: createForm.status,
        primaryUserEmail: createForm.primaryUserEmail.trim() || undefined,
        primaryUserPassword: createForm.primaryUserPassword || undefined,
        primaryUserRole: createForm.primaryUserRole,
      });
      notify.success('تمت الإضافة بنجاح', `تم تسجيل شركة ${createForm.name} وتزويدها بالخلفية`);
      setShowCreateModal(false);
      setCreateForm({
        name: '',
        taxNumber: '',
        email: '',
        city: '',
        packageCode: 'basic',
        status: 'TRIAL',
        primaryUserEmail: '',
        primaryUserPassword: '',
        primaryUserRole: 'ADMIN'
      });
      fetchCompanies();
      fetchOverview();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل تسجيل الشركة الجديدة';
      notify.error('خطأ في التسجيل', msg);
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Crypto Key Rotation
  const handleRotateKey = async () => {
    if (!rotateKeyCompany) return;
    if (confirmId !== rotateKeyCompany.id) {
      notify.error('خطأ في التأكيد', 'يرجى إدخال معرّف الشركة لتأكيد العملية');
      return;
    }

    setActionLoading(true);
    try {
      await apiService.rotateCompanyKey(rotateKeyCompany.id, confirmId);
      notify.success('تم بنجاح', 'تم تدوير مفتاح التشفير وإعادة تشفير كافة البيانات السرية بنجاح للشركة');
      setRotateKeyCompany(null);
      setConfirmId('');
      fetchCompanies();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err.message || 'فشل تدوير المفتاح');
      notify.error('خطأ', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reprovisioning
  const handleReprovision = async () => {
    if (!reprovisionCompany) return;
    if (confirmId !== reprovisionCompany.id) {
      notify.error('خطأ في التأكيد', 'يرجى إدخال معرّف الشركة لتأكيد العملية');
      return;
    }

    setActionLoading(true);
    try {
      await apiService.reprovisionCompany(reprovisionCompany.id, confirmId);
      notify.success('تم التزويد', 'تمت إعادة تهيئة وتزويد قاعدة البيانات الافتراضية للشركة بنجاح');
      setReprovisionCompany(null);
      setConfirmId('');
      fetchCompanies();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err.message || 'فشل تزويد المنشأة');
      notify.error('خطأ', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Respond to Support Ticket
  const handleSendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportReply.trim()) return;

    setSubmittingReply(true);
    try {
      await apiService.respondToTicket(replyTicket.id, supportReply);
      notify.success('تم الإرسال', 'تم إرسال الرد وتحديث حالة التذكرة للعميل');
      setSupportReply('');
      setReplyTicket(null);
      fetchTickets();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل إرسال الرد';
      notify.error('خطأ', msg);
    } finally {
      setSubmittingReply(false);
    }
  };

  const getCompanyStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <Badge variant="success">نشط</Badge>;
      case 'TRIAL': return <Badge variant="default">تجريبي</Badge>;
      case 'SUSPENDED': return <Badge variant="danger">موقوف</Badge>;
      case 'CANCELLED': return <Badge variant="danger">ملغي</Badge>;
      default: return <Badge variant="default">{status}</Badge>;
    }
  };

  const getProvisionBadge = (status: string) => {
    switch (status) {
      case 'READY': return <Badge variant="success">جاهز</Badge>;
      case 'PROVISIONING': return <Badge variant="warning">قيد التزويد</Badge>;
      case 'FAILED': return <Badge variant="danger">فشل التزويد</Badge>;
      default: return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="بوابة إشراف المنصة (Platform Admin)"
        description="لوحة إشراف فنية وأمنية لإدارة قواعد بيانات الشركات المستأجرة، تدوير المفاتيح، والرد على التذاكر"
      />

      <Tabs
        tabs={[
          { key: 'overview', label: 'نظرة عامة والنشاط', icon: Building2 },
          { key: 'companies', label: 'إدارة الشركات المستأجرة', icon: Database },
          { key: 'tickets', label: 'تذاكر الدعم المفتوحة', icon: AlertOctagon },
          { key: 'logs', label: 'سجل الأمان والعمليات', icon: ShieldAlert }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card className="bg-surface-1 border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-content-secondary">إجمالي الشركات</span>
                  <h4 className="text-2xl font-bold text-content-primary mt-1">{overview?.total_companies || overview?.totalCompanies || 0}</h4>
                </div>
                <Building2 className="w-8 h-8 text-primary-500" />
              </CardContent>
            </Card>

            <Card className="bg-surface-1 border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-content-secondary">الشركات النشطة</span>
                  <h4 className="text-2xl font-bold text-success-600 mt-1">{overview?.active_companies || overview?.activeCompanies || 0}</h4>
                </div>
                <Users className="w-8 h-8 text-success-500" />
              </CardContent>
            </Card>

            <Card className="bg-surface-1 border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-content-secondary">إجمالي الفواتير</span>
                  <h4 className="text-2xl font-bold text-content-primary mt-1">{overview?.invoice_count || overview?.totalInvoices || 0}</h4>
                </div>
                <Receipt className="w-8 h-8 text-secondary-500" />
              </CardContent>
            </Card>

            <Card className="bg-surface-1 border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-content-secondary">رسائل الواتساب</span>
                  <h4 className="text-2xl font-bold text-content-primary mt-1">{overview?.whatsapp_count || overview?.totalWhatsappMessages || 0}</h4>
                </div>
                <MessageCircle className="w-8 h-8 text-indigo-500" />
              </CardContent>
            </Card>

            <Card className="bg-surface-1 border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-content-secondary">تذاكر الدعم المفتوحة</span>
                  <h4 className="text-2xl font-bold text-warning-600 mt-1">{overview?.open_tickets || overview?.openTickets || 0}</h4>
                </div>
                <AlertOctagon className="w-8 h-8 text-warning-500" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h3 className="text-md font-bold text-content-primary">آخر الشركات المسجلة مؤخراً</h3>
            </CardHeader>
            <CardContent className="p-0">
              {overview?.recentCompanies?.length === 0 ? (
                <div className="p-8 text-center text-content-secondary">لا توجد شركات مسجلة في الوقت الحالي.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-content-secondary text-xs font-semibold">
                        <th className="p-3 text-start">الشركة</th>
                        <th className="p-3 text-start">الباقة</th>
                        <th className="p-3 text-start">عدد الفواتير</th>
                        <th className="p-3 text-start">حالة الاتصال</th>
                        <th className="p-3 text-start">تاريخ التسجيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {overview?.recentCompanies?.map((c: any) => (
                        <tr key={c.id} className="hover:bg-surface-2">
                          <td className="p-3 font-medium text-content-primary">{c.name}</td>
                          <td className="p-3 text-content-secondary uppercase">{c.package_code || c.packageCode}</td>
                          <td className="p-3 text-content-secondary">{c.invoice_count}</td>
                          <td className="p-3">{getCompanyStatusBadge(c.status)}</td>
                          <td className="p-3 text-content-tertiary">{formatDate(c.created_at || c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: COMPANIES */}
      {activeTab === 'companies' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-content-primary">قائمة الشركات والربط البرمجي</h3>
              <p className="text-xs text-content-secondary">تحكم في حالة الاتصال للشركات، وقم بإجراء تدوير المفاتيح أو صيانة قاعدة البيانات</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus size={14} className="me-1" />
                تسجيل منشأة جديدة
              </Button>
              <Button variant="secondary" size="sm" onClick={fetchCompanies} loading={loadingCompanies}>
                <RefreshCw size={14} className="me-1" />
                تحديث القائمة
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingCompanies && companies.length === 0 ? (
              <div className="p-12 text-center text-content-secondary">جاري جلب قائمة الشركات...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-content-secondary text-xs font-semibold">
                      <th className="p-4 text-start">اسم المنشأة</th>
                      <th className="p-4 text-start">باقة الاشتراك</th>
                      <th className="p-4 text-start">التزويد والجاهزية</th>
                      <th className="p-4 text-start">حالة الشركة</th>
                      <th className="p-4 text-start">المقاييس (فواتير/واتساب)</th>
                      <th className="p-4 text-center">إجراءات الأمان والصيانة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {companies.map((c: any) => (
                      <tr key={c.id} className="hover:bg-surface-2">
                        <td className="p-4">
                          <div className="font-bold text-content-primary">{c.name}</div>
                          <div className="text-[10px] text-content-tertiary font-mono">{c.id}</div>
                        </td>
                        <td className="p-4 text-content-secondary uppercase font-semibold">
                          {c.package_code || c.packageCode}
                        </td>
                        <td className="p-4">
                          {getProvisionBadge(c.provision_status || c.provisionStatus)}
                        </td>
                        <td className="p-4">
                          <Select
                            value={c.status}
                            onChange={(e) => handleUpdateStatus(c.id, e.target.value)}
                            options={[
                              { value: 'TRIAL', label: 'تجريبي' },
                              { value: 'ACTIVE', label: 'نشط' },
                              { value: 'SUSPENDED', label: 'موقوف' },
                              { value: 'CANCELLED', label: 'ملغي' }
                            ]}
                          />
                        </td>
                        <td className="p-4 text-xs text-content-secondary">
                          <div>الفواتير: {c.invoice_count || 0} / {c.invoice_monthly_limit}</div>
                          <div>واتساب: {c.whatsapp_count || 0} / {c.whatsapp_monthly_limit}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setRotateKeyCompany(c)}
                              title="تدوير مفتاح التشفير"
                            >
                              <Key size={12} className="me-1" />
                              تدوير المفتاح
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setReprovisionCompany(c)}
                              title="إعادة تزويد قاعدة البيانات"
                              className="text-danger-600 hover:text-danger-700"
                            >
                              <Database size={12} className="me-1" />
                              إعادة التزويد
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: TICKETS */}
      {activeTab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-content-primary">طلبات الدعم الفني الواردة من الشركات</h3>
                  <p className="text-xs text-content-secondary">يرجى متابعة التذاكر المفتوحة والرد عليها فورياً لضمان سلاسة العمليات المالية</p>
                </div>
                <Button variant="secondary" size="sm" onClick={fetchTickets} loading={loadingTickets}>
                  تحديث
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loadingTickets && tickets.length === 0 ? (
                  <div className="p-12 text-center text-content-secondary">جاري تحميل تذاكر الدعم...</div>
                ) : tickets.length === 0 ? (
                  <div className="p-12 text-center text-content-secondary">لا توجد تذاكر دعم فني في انتظار الرد حالياً.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-2 text-content-secondary text-xs font-semibold">
                          <th className="p-3 text-start">الشركة</th>
                          <th className="p-3 text-start">التصنيف</th>
                          <th className="p-3 text-start">الأهمية</th>
                          <th className="p-3 text-start">معاينة المشكلة</th>
                          <th className="p-3 text-start">الحالة</th>
                          <th className="p-3 text-center">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {tickets.map((t: any, idx) => (
                          <tr key={t.id || idx} className="hover:bg-surface-2">
                            <td className="p-3">
                              <span className="font-bold text-content-primary">{t.company_name || t.companyName || 'شركة مستأجرة'}</span>
                            </td>
                            <td className="p-3 text-content-secondary uppercase">{t.category}</td>
                            <td className="p-3 text-content-secondary font-medium">{t.priority}</td>
                            <td className="p-3 text-content-secondary max-w-xs truncate">{t.description_preview || t.description}</td>
                            <td className="p-3">
                              <Badge variant={t.status === 'CLOSED' ? 'success' : 'warning'}>
                                {t.status === 'OPEN' ? 'مفتوحة' : t.status === 'IN_PROGRESS' ? 'قيد العمل' : 'مغلقة'}
                              </Badge>
                            </td>
                            <td className="p-3 text-center">
                              {t.status !== 'CLOSED' && (
                                <Button variant="secondary" size="sm" onClick={() => setReplyTicket(t)}>
                                  رد وحل المشكلة
                                </Button>
                              )}
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

          <div className="lg:col-span-1">
            {replyTicket ? (
              <Card className="border-primary-200 bg-surface-1">
                <CardHeader>
                  <h3 className="text-md font-bold text-content-primary">الرد على التذكرة</h3>
                  <p className="text-xs text-content-secondary">المرسلة من: <span className="font-semibold">{replyTicket.company_name}</span></p>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="p-3 rounded-lg bg-surface-2 text-xs text-content-secondary border mb-4">
                    <p className="font-bold mb-1">وصف المشكلة:</p>
                    <p>{replyTicket.description || replyTicket.description_preview}</p>
                  </div>
                  <form onSubmit={handleSendTicketReply} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-content-secondary font-bold">صياغة الرد الرسمي للعميل</span>
                      <textarea
                        value={supportReply}
                        onChange={(e) => setSupportReply(e.target.value)}
                        placeholder="أدخل الحل للمشكلة أو التعليمات اللازمة للمشغل والمالك لتجاوز الخطأ التقني..."
                        rows={6}
                        className="p-3 rounded-lg border border-border bg-surface-1 text-sm text-content-primary focus:outline-none focus:border-primary-500"
                        required
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="secondary" size="sm" type="button" onClick={() => setReplyTicket(null)}>
                        إلغاء
                      </Button>
                      <Button variant="primary" size="sm" type="submit" loading={submittingReply}>
                        إرسال الحل والرد
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <div className="p-6 text-center border border-dashed rounded-xl flex flex-col items-center justify-center min-h-[300px] text-content-secondary gap-2 bg-surface-1">
                <AlertOctagon className="w-10 h-10 text-content-tertiary" />
                <p className="font-bold text-sm">حدد تذكرة للرد عليها</p>
                <p className="text-xs">تواصل مع مسؤولي وملاك الشركات لحل مشاكلهم وإقفال التذاكر المفتوحة.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY LOGS */}
      {activeTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-md font-bold text-content-primary">سجل عمليات مدراء المنصة (Platform Activity)</h3>
              <p className="text-xs text-content-secondary">الأحداث والعمليات الكبرى التي نفذها المشرفون على قواعد بيانات المستأجرين</p>
            </CardHeader>
            <CardContent className="p-0">
              {platformLogs.length === 0 ? (
                <div className="p-6 text-center text-content-secondary">لا توجد سجلات مشرفين مسجلة حتى الآن.</div>
              ) : (
                <div className="overflow-y-auto max-h-[450px]">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-content-secondary font-semibold">
                        <th className="p-3 text-start">المشرف</th>
                        <th className="p-3 text-start">العملية</th>
                        <th className="p-3 text-start">المستهدف</th>
                        <th className="p-3 text-start">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {platformLogs.map((log: any, idx: number) => (
                        <tr key={log.id || idx} className="hover:bg-surface-2">
                          <td className="p-3 font-mono">{log.user_id || 'platform-root'}</td>
                          <td className="p-3 text-content-primary font-bold">{log.action}</td>
                          <td className="p-3 font-mono text-content-secondary">{log.entity_id || log.entity_type}</td>
                          <td className="p-3 text-content-tertiary">{formatDate(log.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-md font-bold text-content-primary">سجل عمليات الشركات (Client Activity Summary)</h3>
              <p className="text-xs text-content-secondary">تتبع ملخص العمليات المالية وتوليد الفواتير ومطابقة البنك لدى كافة العملاء</p>
            </CardHeader>
            <CardContent className="p-0">
              {clientAuditSummary.length === 0 ? (
                <div className="p-6 text-center text-content-secondary">لا توجد سجلات مستخدمين مسجلة حتى الآن.</div>
              ) : (
                <div className="overflow-y-auto max-h-[450px]">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-content-secondary font-semibold">
                        <th className="p-3 text-start">معرّف الشركة</th>
                        <th className="p-3 text-start">العملية المنفذة</th>
                        <th className="p-3 text-start">المستند المتأثر</th>
                        <th className="p-3 text-start">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {clientAuditSummary.map((log: any, idx: number) => (
                        <tr key={log.id || idx} className="hover:bg-surface-2">
                          <td className="p-3 font-mono">{log.company_id}</td>
                          <td className="p-3 text-content-primary font-bold">{log.action}</td>
                          <td className="p-3 text-content-secondary">{log.entity_type}</td>
                          <td className="p-3 text-content-tertiary">{formatDate(log.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* CONFIRM ROTATE KEY MODAL */}
      {rotateKeyCompany && (
        <Modal
          open={true}
          title="تدوير مفتاح تشفير قاعدة البيانات"
          onClose={() => { setRotateKeyCompany(null); setConfirmId(''); }}
        >
          <div className="flex flex-col gap-4">
            <div className="p-3 rounded-lg bg-danger-50 text-xs text-danger-800 border border-danger-200 flex items-start gap-2">
              <ShieldAlert className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">تحذير أمني هام</p>
                <p>تدوير مفتاح التشفير عملية حساسة للغاية. سيقوم النظام بتوليد مفتاح AES-256 جديد وإعادة تشفير كافة البيانات المشفرة (مثل التوكنات والحسابات البنكية) التابعة للشركة. تأكد من ثبات النظام قبل التأكيد.</p>
              </div>
            </div>

            <div className="text-sm text-content-primary">
              يرجى تأكيد العملية بكتابة معرّف الشركة التالي للمتابعة:
              <div className="font-mono bg-surface-2 p-2 rounded border border-border text-center font-bold select-all my-2">
                {rotateKeyCompany.id}
              </div>
            </div>

            <Input
              label="تأكيد معرّف الشركة"
              value={confirmId}
              onChange={(e) => setConfirmId(e.target.value)}
              placeholder="الصق معرّف الشركة هنا للتحقق"
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setRotateKeyCompany(null); setConfirmId(''); }}
                disabled={actionLoading}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRotateKey}
                loading={actionLoading}
              >
                تأكيد التدوير وتوليد المفتاح
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CONFIRM REPROVISION DB MODAL */}
      {reprovisionCompany && (
        <Modal
          open={true}
          title="إعادة تزويد وتهيئة قاعدة بيانات الشركة"
          onClose={() => { setReprovisionCompany(null); setConfirmId(''); }}
        >
          <div className="flex flex-col gap-4">
            <div className="p-3 rounded-lg bg-danger-50 text-xs text-danger-800 border border-danger-200 flex items-start gap-2">
              <ShieldAlert className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">تحذير تخريب وتدمير البيانات</p>
                <p>إعادة التزويد تعني مسح وتفريغ قاعدة بيانات المنشأة بالكامل وتزويدها من جديد بالهيكل الأولي (Seeding). ستفقد كافة الفواتير، الحسابات والبيانات المسجلة نهائياً!</p>
              </div>
            </div>

            <div className="text-sm text-content-primary">
              يرجى تأكيد العملية بكتابة معرّف الشركة التالي للمتابعة:
              <div className="font-mono bg-surface-2 p-2 rounded border border-border text-center font-bold select-all my-2">
                {reprovisionCompany.id}
              </div>
            </div>

            <Input
              label="تأكيد معرّف الشركة"
              value={confirmId}
              onChange={(e) => setConfirmId(e.target.value)}
              placeholder="الصق معرّف الشركة هنا للتحقق"
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setReprovisionCompany(null); setConfirmId(''); }}
                disabled={actionLoading}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleReprovision}
                loading={actionLoading}
                className="bg-danger-600 hover:bg-danger-700"
              >
                إعادة التزويد ومسح البيانات
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CREATE COMPANY MODAL */}
      {showCreateModal && (
        <Modal
          open={true}
          title="تسجيل منشأة جديدة في النظام"
          onClose={() => setShowCreateModal(false)}
          size="lg"
        >
          <form onSubmit={handleCreateCompany} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="اسم الشركة / المنشأة"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="مثال: شركة الحلول المتقدمة"
                required
              />

              <Input
                label="الرقم الضريبي"
                value={createForm.taxNumber}
                onChange={(e) => setCreateForm({ ...createForm, taxNumber: e.target.value })}
                placeholder="مثال: 300000000000003"
              />

              <Input
                label="بريد التواصل للشركة"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="office@company.com"
              />

              <Input
                label="المدينة"
                value={createForm.city}
                onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                placeholder="مثال: الرياض"
              />

              <Select
                label="باقة الاشتراك"
                value={createForm.packageCode}
                onChange={(e) => setCreateForm({ ...createForm, packageCode: e.target.value as any })}
                options={[
                  { value: 'basic', label: 'الباقة الأساسية (99 ريال)' },
                  { value: 'growth', label: 'باقة النمو (249 ريال)' },
                  { value: 'professional', label: 'الباقة الاحترافية (499 ريال)' }
                ]}
              />

              <Select
                label="الحالة التشغيلية"
                value={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as any })}
                options={[
                  { value: 'TRIAL', label: 'فترة تجريبية' },
                  { value: 'ACTIVE', label: 'نشط / متصل' },
                  { value: 'SUSPENDED', label: 'موقف مؤقتاً' }
                ]}
              />
            </div>

            <div className="border-t border-border pt-4 mt-2">
              <h4 className="text-sm font-bold text-content-primary mb-3">حساب المسؤول المالي الأول (اختياري)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="بريد المسؤول الأول"
                  type="email"
                  value={createForm.primaryUserEmail}
                  onChange={(e) => setCreateForm({ ...createForm, primaryUserEmail: e.target.value })}
                  placeholder="admin@company.com"
                />

                <Input
                  label="كلمة مرور المسؤول"
                  type="password"
                  value={createForm.primaryUserPassword}
                  onChange={(e) => setCreateForm({ ...createForm, primaryUserPassword: e.target.value })}
                  placeholder="12 حرفاً على الأقل"
                />

                <Select
                  label="دور المسؤول الممنوح"
                  value={createForm.primaryUserRole}
                  onChange={(e) => setCreateForm({ ...createForm, primaryUserRole: e.target.value as any })}
                  options={[
                    { value: 'ADMIN', label: 'مدير النظام (كامل الصلاحيات)' },
                    { value: 'FINANCE_MANAGER', label: 'المدير المالي' },
                    { value: 'ACCOUNTANT', label: 'محاسب فواتير' }
                  ]}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={createSubmitting}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                loading={createSubmitting}
              >
                تسجيل وتجهيز المنشأة
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
