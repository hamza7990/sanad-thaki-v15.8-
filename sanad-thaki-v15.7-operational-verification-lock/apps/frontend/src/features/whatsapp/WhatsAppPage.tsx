import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare, Settings, Layout, FileText, CheckCircle2,
  AlertCircle, ShieldCheck, HelpCircle, Save, Plus, Trash2, Send
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, CardContent, CardHeader, Input, Select, Textarea, Badge } from '@/components/ui';
import { Tabs } from '@/components/ui/Tabs';
import { apiService, ApiError } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { formatDate } from '@/utils/utils';

export default function WhatsAppPage() {
  const { t } = useTranslation();
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('settings');
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);

  // Settings State
  const [settings, setSettings] = useState<any>({
    provider: 'meta',
    phoneNumberId: '',
    businessAccountId: '',
    displayName: '',
    accessToken: '',
    appSecret: '',
    bspName: '',
    bspEndpoint: '',
    bspToken: '',
    isActive: false
  });

  // Templates State
  const [templates, setTemplates] = useState<any[]>([]);

  // Messages log
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.getWhatsAppSettings() as any;
      if (res.settings) {
        setSettings({
          provider: res.settings.provider || 'meta',
          phoneNumberId: res.settings.phone_number_id || '',
          businessAccountId: res.settings.business_account_id || '',
          displayName: res.settings.display_name || '',
          bspName: res.settings.bsp_name || '',
          accessToken: '', // don't prefill passwords
          appSecret: '',
          bspEndpoint: '',
          bspToken: '',
          isActive: res.settings.is_active || false
        });
      }
      if (res.templates) {
        setTemplates(res.templates);
      }
    } catch (err) {
      console.error('Error fetching WhatsApp settings:', err);
      notify.error('خطأ', 'فشل تحميل إعدادات واتساب');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const res = await apiService.getWhatsAppMessages();
      setMessages(res || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadMessages();
  }, [loadData, loadMessages]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiService.updateWhatsAppSettings({
        provider: settings.provider,
        phoneNumberId: settings.phoneNumberId,
        businessAccountId: settings.businessAccountId,
        displayName: settings.displayName,
        accessToken: settings.accessToken || undefined,
        appSecret: settings.appSecret || undefined,
        bspName: settings.bspName || undefined,
        bspEndpoint: settings.bspEndpoint || undefined,
        bspToken: settings.bspToken || undefined,
      } as any);
      notify.success('تم الحفظ', 'تم تحديث إعدادات واتساب للشركة بنجاح');
      loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل تحديث الإعدادات';
      notify.error('خطأ', msg);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveTemplates = async () => {
    if (templates.length === 0) {
      notify.error('خطأ', 'يجب إضافة قالب واحد على الأقل للربط');
      return;
    }
    setSavingTemplates(true);
    try {
      const payload = templates.map(t => ({
        reminderStage: t.reminder_stage || t.reminderStage,
        metaTemplateName: t.meta_template_name || t.metaTemplateName,
        language: t.language || 'ar',
        category: t.category || 'UTILITY',
        bodyPreview: t.body_preview || t.bodyPreview,
        isActive: t.is_active !== undefined ? t.is_active : true
      }));

      await apiService.updateWhatsAppTemplates({ templates: payload } as any);
      notify.success('تم الحفظ', 'تمت مزامنة قوالب واتساب بنجاح وإرسالها للمراجعة');
      loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'فشل حفظ القوالب';
      notify.error('خطأ', msg);
    } finally {
      setSavingTemplates(false);
    }
  };

  const addTemplateRow = (stage: 'FIRST' | 'SECOND' | 'FINAL') => {
    if (templates.some(t => (t.reminder_stage || t.reminderStage) === stage)) {
      notify.warning('موجود بالفعل', `قالب المرحلة ${stage} مضاف مسبقاً`);
      return;
    }
    setTemplates([
      ...templates,
      {
        reminder_stage: stage,
        meta_template_name: '',
        language: 'ar',
        category: 'UTILITY',
        body_preview: '',
        meta_status: 'PENDING',
        is_active: true
      }
    ]);
  };

  const removeTemplateRow = (index: number) => {
    setTemplates(templates.filter((_, i) => i !== index));
  };

  const updateTemplateField = (index: number, field: string, value: any) => {
    const updated = [...templates];
    updated[index] = { ...updated[index], [field]: value };
    setTemplates(updated);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="success">معتمد</Badge>;
      case 'PENDING':
        return <Badge variant="warning">قيد المراجعة</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">مرفوض</Badge>;
      case 'SENT':
      case 'DELIVERED':
      case 'READ':
        return <Badge variant="success">تم الإرسال</Badge>;
      case 'FAILED':
        return <Badge variant="danger">فشل الإرسال</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="بوابة إشعارات واتساب Business"
        description="اربط حساب Meta Business الخاص بك وأرسل تذكيرات الدفع للعملاء آلياً"
      />

      <Card className="border-primary-100 bg-primary-50/10 dark:bg-primary-950/5">
        <CardContent className="p-4 text-sm text-content-secondary space-y-2">
          <p className="font-bold text-content-primary flex items-center gap-1.5">
            <MessageSquare size={16} className="text-primary-600" />
            بوابة المتابعة الآلية وتحصيل المدفوعات (WhatsApp Collection Hub)
          </p>
          <p className="text-xs text-content-secondary">
            هذا القسم مخصص حصرياً لمتابعة تحصيل فواتير العملاء المتعثرة وإرسال التذكيرات الدورية وإدارتها. 
            <strong> هذا النظام ليس منصة محادثة عامة أو دعم فني داخلي.</strong>
          </p>
          <p className="text-xs text-content-tertiary">
            دورة العمل المعتمدة للتحصيل:
            <span className="font-semibold text-content-secondary"> 1. يقوم المحاسب برفع الفاتورة ➔ 2. يعتمدها المدير المالي ➔ 3. تظهر تلقائياً هنا في بوابة الواتساب ➔ 4. يرسل المحاسب التذكير للعميل ➔ 5. يتم السداد وتطابق الدفعة بنكياً لإغلاق الفاتورة.</span>
          </p>
        </CardContent>
      </Card>

      <Tabs
        tabs={[
          { key: 'settings', label: 'إعدادات الاتصال والربط', icon: Settings },
          { key: 'templates', label: 'قوالب تذكيرات الدفع', icon: Layout },
          { key: 'logs', label: 'سجل الرسائل المرسلة', icon: FileText }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {loading ? (
        <div className="p-12 text-center text-content-secondary bg-surface-1 border rounded-2xl">
          جاري تحميل إعدادات واتساب وبوابة الاتصال...
        </div>
      ) : (
        <>
          {/* TAB 1: SETTINGS */}
          {activeTab === 'settings' && (
            <Card>
              <CardContent className="p-6">
                <form onSubmit={handleSaveSettings} className="flex flex-col gap-5 max-w-3xl">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div>
                      <h3 className="text-lg font-bold text-content-primary">مزود خدمة WhatsApp Business API</h3>
                      <p className="text-xs text-content-secondary">اختر منصة Meta السحابية المباشرة أو مزود خدمة معتمد BSP</p>
                    </div>
                    {settings.isActive ? (
                      <Badge variant="success">الربط نشط ومفعل</Badge>
                    ) : (
                      <Badge variant="default">غير متصل</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label="مزود الخدمة"
                      value={settings.provider}
                      onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
                      options={[
                        { value: 'meta', label: 'Meta Cloud API (مستحسن ومجاني)' },
                        { value: 'bsp', label: 'Business Solution Provider (BSP)' }
                      ]}
                    />

                    <Input
                      label="الاسم التعريفي لعرض الحساب"
                      value={settings.displayName}
                      onChange={(e) => setSettings({ ...settings, displayName: e.target.value })}
                      placeholder="مثال: شركة سند للتقنية"
                      required
                    />
                  </div>

                  {settings.provider === 'meta' ? (
                    <div className="flex flex-col gap-4 p-4 rounded-xl bg-surface-2 border border-border">
                      <h4 className="text-sm font-bold text-content-primary flex items-center gap-1.5">
                        <ShieldCheck className="text-primary-600 w-4 h-4" />
                        إعدادات Meta Cloud API المباشرة
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="معرّف رقم الهاتف (Phone Number ID)"
                          value={settings.phoneNumberId}
                          onChange={(e) => setSettings({ ...settings, phoneNumberId: e.target.value })}
                          placeholder="أدخل الرقم المكون من 15 خانة تقريباً"
                          required
                        />

                        <Input
                          label="معرّف حساب الأعمال (WhatsApp Business Account ID)"
                          value={settings.businessAccountId}
                          onChange={(e) => setSettings({ ...settings, businessAccountId: e.target.value })}
                          placeholder="أدخل WABA ID الخاص بك"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="رمز الوصول الدائم (System User Access Token)"
                          type="password"
                          value={settings.accessToken}
                          onChange={(e) => setSettings({ ...settings, accessToken: e.target.value })}
                          placeholder="يبدأ بـ EAAC..."
                        />

                        <Input
                          label="سر التطبيق (App Secret)"
                          type="password"
                          value={settings.appSecret}
                          onChange={(e) => setSettings({ ...settings, appSecret: e.target.value })}
                          placeholder="أدخل سر التطبيق للتحقق من ويب هوك"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 p-4 rounded-xl bg-surface-2 border border-border">
                      <h4 className="text-sm font-bold text-content-primary flex items-center gap-1.5">
                        <ShieldCheck className="text-primary-600 w-4 h-4" />
                        إعدادات مزود الحلول المعتمد (BSP)
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="اسم المزود (BSP Name)"
                          value={settings.bspName}
                          onChange={(e) => setSettings({ ...settings, bspName: e.target.value })}
                          placeholder="مثال: Twilio / Unifonic"
                          required
                        />

                        <Input
                          label="رابط بوابة الإرسال (Endpoint Url)"
                          value={settings.bspEndpoint}
                          onChange={(e) => setSettings({ ...settings, bspEndpoint: e.target.value })}
                          placeholder="https://api.provider.com/whatsapp/send"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="معرّف رقم الهاتف المرسل"
                          value={settings.phoneNumberId}
                          onChange={(e) => setSettings({ ...settings, phoneNumberId: e.target.value })}
                          placeholder="أدخل رقم الجوال المربوط بالخدمة"
                          required
                        />

                        <Input
                          label="توكن التفويض (Bearer/Auth Token)"
                          type="password"
                          value={settings.bspToken}
                          onChange={(e) => setSettings({ ...settings, bspToken: e.target.value })}
                          placeholder="أدخل توكن الربط البرمجي الخاص بالمزود"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
                    <Button type="submit" variant="primary" loading={savingSettings}>
                      حفظ إعدادات الاتصال البرمجي
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* TAB 2: TEMPLATES */}
          {activeTab === 'templates' && (
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-content-primary">إدارة قوالب إشعارات الواتساب الرسمية</h3>
                    <p className="text-xs text-content-secondary">
                      يجب أن تتطابق هذه القوالب مع القوالب المعتمدة في حساب Meta Business الخاص بك لتجنب رفض الإرسال.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => addTemplateRow('FIRST')}>
                      + إضافة قالب تذكير أول
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => addTemplateRow('SECOND')}>
                      + تذكير ثانٍ
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => addTemplateRow('FINAL')}>
                      + تذكير نهائي
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {templates.length === 0 ? (
                    <div className="p-8 text-center text-content-secondary border border-dashed rounded-xl">
                      لا توجد قوالب واتساب نشطة حالياً. استخدم الأزرار أعلاه لإنشاء القوالب.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {templates.map((tpl, index) => (
                        <div key={index} className="p-4 rounded-xl border border-border bg-surface-1 flex flex-col gap-4 relative">
                          <button
                            type="button"
                            onClick={() => removeTemplateRow(index)}
                            className="absolute left-4 top-4 p-1.5 rounded-lg text-content-tertiary hover:text-danger-600 hover:bg-danger-50 transition-colors"
                            title="حذف القالب"
                          >
                            <Trash2 size={16} />
                          </button>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Select
                              label="مرحلة التذكير"
                              value={tpl.reminder_stage || tpl.reminderStage}
                              onChange={(e) => updateTemplateField(index, 'reminder_stage', e.target.value)}
                              options={[
                                { value: 'FIRST', label: 'التذكير الأول (ودّي)' },
                                { value: 'SECOND', label: 'التذكير الثاني (مستعجل)' },
                                { value: 'FINAL', label: 'التذكير النهائي (تحذيري)' }
                              ]}
                            />

                            <Input
                              label="اسم القالب في Meta"
                              value={tpl.meta_template_name || tpl.metaTemplateName}
                              onChange={(e) => updateTemplateField(index, 'meta_template_name', e.target.value)}
                              placeholder="invoice_reminder_first"
                              required
                            />

                            <Select
                              label="اللغة"
                              value={tpl.language}
                              onChange={(e) => updateTemplateField(index, 'language', e.target.value)}
                              options={[
                                { value: 'ar', label: 'العربية (ar)' },
                                { value: 'en', label: 'الإنجليزية (en)' }
                              ]}
                            />

                            <div className="flex flex-col justify-end pb-1.5">
                              <span className="text-xs text-content-secondary mb-1">حالة القالب الرسمية</span>
                              <div>{getStatusBadge(tpl.meta_status)}</div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Textarea
                              label="نص القالب (معاينة)"
                              value={tpl.body_preview || tpl.bodyPreview}
                              onChange={(e) => updateTemplateField(index, 'body_preview', e.target.value)}
                              placeholder="عزيزنا العميل {{1}}، نود تذكيركم بضرورة سداد الفاتورة رقم {{2}} بمبلغ {{3}} قبل تاريخ الاستحقاق. شكراً لكم."
                              rows={3}
                              required
                            />
                            <p className="text-[10px] text-content-tertiary">
                              * استخدم المتغيرات مثل {"{{1}}"} لاسم العميل، و {"{{2}}"} لرقم الفاتورة، و {"{{3}}"} للمبلغ المالي.
                            </p>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
                        <Button variant="primary" onClick={handleSaveTemplates} loading={savingTemplates}>
                          حفظ ومزامنة كافة القوالب
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 3: LOGS */}
          {activeTab === 'logs' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-content-primary">سجل مراسلات تذكير الدفع</h3>
                  <p className="text-xs text-content-secondary">قائمة بكافة تذكيرات الواتساب التي تم إرسالها للعملاء وحالتها الفورية</p>
                </div>
                <Button variant="secondary" size="sm" onClick={loadMessages} loading={loadingMessages}>
                  تحديث السجل
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {messages.length === 0 ? (
                  <div className="p-12 text-center text-content-secondary">
                    لا توجد رسائل مرسلة مسجلة في النظام حتى الآن.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-surface-2 text-content-secondary text-xs font-semibold">
                          <th className="p-4 text-start">رقم المستلم</th>
                          <th className="p-4 text-start">رقم الفاتورة</th>
                          <th className="p-4 text-start">مرحلة التذكير</th>
                          <th className="p-4 text-start">تاريخ الإرسال</th>
                          <th className="p-4 text-start">الحالة</th>
                          <th className="p-4 text-start">تفاصيل إضافية / خطأ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-sm">
                        {messages.map((msg, i) => (
                          <tr key={msg.id || i} className="hover:bg-surface-2 transition-colors">
                            <td className="p-4 text-content-primary font-medium">{msg.to_phone || msg.toPhone}</td>
                            <td className="p-4 text-content-secondary">{msg.invoice_number || msg.invoiceId}</td>
                            <td className="p-4">
                              <Badge variant="default">
                                {msg.reminder_stage === 'FIRST' ? 'الأول' : msg.reminder_stage === 'SECOND' ? 'الثاني' : 'النهائي'}
                              </Badge>
                            </td>
                            <td className="p-4 text-content-tertiary">
                              {msg.sent_at || msg.createdAt ? formatDate(msg.sent_at || msg.createdAt) : '-'}
                            </td>
                            <td className="p-4">{getStatusBadge(msg.status)}</td>
                            <td className="p-4 text-xs text-danger-600 dark:text-danger-400">
                              {msg.failed_reason || msg.failedReason || '-'}
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
        </>
      )}
    </div>
  );
}
