import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Building, User, Laptop, Shield, Check, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, CardContent, Input, Select } from '@/components/ui';
import { Tabs } from '@/components/ui/Tabs';
import { apiService, ApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useNotification } from '@/hooks/useNotification';

export default function SettingsPage() {
  const { t } = useTranslation();
  const notify = useNotification();
  
  // Stores
  const { company, user, setAuth } = useAuthStore();
  const { theme, setTheme, locale, setLocale } = useThemeStore();

  const showCompanyTab = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState(showCompanyTab ? 'company' : 'user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Company Form state
  const [companyForm, setCompanyForm] = useState({
    name: '',
    taxNumber: '',
    email: '',
    phone: '',
    city: '',
    address: '',
  });

  // Password Form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Hydrate company profile form
  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name || '',
        taxNumber: company.taxNumber || '',
        email: company.email || '',
        phone: company.phone || '',
        city: company.city || '',
        address: company.address || '',
      });
    }
  }, [company]);

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') {
      notify.error('غير مصرح', 'فقط مالك الحساب أو مدير النظام يمكنه تعديل إعدادات المنشأة');
      return;
    }

    if (!companyForm.name.trim()) {
      setError('اسم المنشأة مطلوب');
      return;
    }

    setLoading(true);
    try {
      const updated = await apiService.updateCompany({
        name: companyForm.name.trim(),
        taxNumber: companyForm.taxNumber.trim(),
        email: companyForm.email.trim(),
        phone: companyForm.phone.trim(),
        city: companyForm.city.trim(),
        address: companyForm.address.trim(),
      });
      
      // Update store state
      setAuth(user, updated, useAuthStore.getState().companies, useAuthStore.getState().entitlements);
      notify.success('تم الحفظ', 'تم تحديث بيانات الشركة بنجاح');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل حفظ التعديلات';
      setError(message);
      notify.error('خطأ', message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!passwordForm.currentPassword) {
      setError('يرجى إدخال كلمة المرور الحالية');
      return;
    }
    if (passwordForm.newPassword.length < 12) {
      setError('يجب أن تكون كلمة المرور الجديدة 12 حرفاً على الأقل');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      await apiService.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );
      notify.success('تم التحديث', 'تم تغيير كلمة المرور بنجاح');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل تغيير كلمة المرور';
      setError(message);
      notify.error('خطأ', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الإعدادات العامة"
        description="إدارة ملف المنشأة، تفضيلات المستخدم، ومظهر مساحة العمل الخاصة بك"
      />

      <Tabs
        tabs={[
          ...(showCompanyTab ? [{ key: 'company', label: 'ملف المنشأة', icon: Building }] : []),
          { key: 'user', label: 'حسابي والأمان', icon: Shield },
          { key: 'workspace', label: 'مظهر مساحة العمل', icon: Laptop }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {error && (
        <Card className="border-danger-200 bg-danger-50 dark:bg-danger-900/10">
          <CardContent className="flex items-center gap-2.5 p-3 text-sm text-danger-700 dark:text-danger-400">
            <AlertCircle size={16} />
            {error}
          </CardContent>
        </Card>
      )}

      {/* COMPANY SETTINGS TAB */}
      {activeTab === 'company' && showCompanyTab && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleUpdateCompany} className="flex flex-col gap-5 max-w-2xl">
              <h3 className="text-lg font-bold text-content-primary mb-1">تفاصيل المنشأة والضرائب</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="اسم المنشأة"
                  type="text"
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  placeholder="أدخل اسم المنشأة"
                  required
                  disabled={loading}
                />
                
                <Input
                  label="الرقم الضريبي VAT"
                  type="text"
                  value={companyForm.taxNumber}
                  onChange={(e) => setCompanyForm({ ...companyForm, taxNumber: e.target.value })}
                  placeholder="الرقم الضريبي المكون من 15 خانة"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="البريد الإلكتروني المالي"
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  placeholder="billing@company.com"
                  disabled={loading}
                />
                
                <Input
                  label="رقم الهاتف"
                  type="text"
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  placeholder="05xxxxxxx"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="المدينة"
                  type="text"
                  value={companyForm.city}
                  onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                  placeholder="الرياض"
                  disabled={loading}
                />
                
                <Input
                  label="العنوان الجغرافي للشركة"
                  type="text"
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  placeholder="مثال: طريق الملك فهد، العليا"
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border">
                <Button
                  type="submit"
                  variant="primary"
                  loading={loading}
                  disabled={user?.role !== 'OWNER' && user?.role !== 'ADMIN'}
                >
                  حفظ تعديلات المنشأة
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* USER SETTINGS TAB */}
      {activeTab === 'user' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-6 max-w-2xl">
              <div>
                <h3 className="text-lg font-bold text-content-primary mb-1">تفاصيل المستخدم</h3>
                <p className="text-sm text-content-secondary">
                  الاسم الحالي: <span className="font-semibold text-content-primary">{user?.name}</span> ({getRoleLabel(user?.role || 'MEMBER')})
                </p>
                <p className="text-sm text-content-secondary mt-1">
                  البريد الإلكتروني المسجل: <span className="font-semibold text-content-primary">{user?.email}</span>
                </p>
              </div>

              <hr className="border-border" />

              <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
                <h3 className="text-lg font-bold text-content-primary mb-1">تحديث كلمة المرور</h3>
                
                <Input
                  label="كلمة المرور الحالية"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="أدخل كلمة المرور الحالية"
                  required
                  disabled={loading}
                />

                <Input
                  label="كلمة المرور الجديدة"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="أدخل 12 حرفاً على الأقل"
                  required
                  disabled={loading}
                />

                <Input
                  label="تأكيد كلمة المرور الجديدة"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="أعد إدخال كلمة المرور الجديدة للتأكيد"
                  required
                  disabled={loading}
                />

                <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={loading}
                  >
                    تغيير كلمة المرور
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      {/* WORKSPACE PREFERENCES TAB */}
      {activeTab === 'workspace' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-6 max-w-2xl">
              <div>
                <h3 className="text-lg font-bold text-content-primary mb-1">تخصيص الواجهة والمظهر</h3>
                <p className="text-sm text-content-secondary">تحكم في تفضيلات العرض واللغة الخاصة بك</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-content-primary">مظهر الواجهة</label>
                  <Select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as any)}
                    options={[
                      { value: 'light', label: 'المظهر الفاتح (Light)' },
                      { value: 'dark', label: 'المظهر الداكن (Dark)' },
                      { value: 'system', label: 'تلقائي حسب نظام التشغيل (System)' }
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-content-primary">لغة العرض الافتراضية</label>
                  <Select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as any)}
                    options={[
                      { value: 'ar', label: 'العربية (Arabic)' },
                      { value: 'en', label: 'English' }
                    ]}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  function getRoleLabel(role: string) {
    switch (role) {
      case 'OWNER': return 'المالك';
      case 'ADMIN': return 'مدير النظام';
      case 'FINANCE_MANAGER': return 'مدير مالي';
      case 'ACCOUNTANT': return 'محاسب';
      case 'MEMBER': return 'عضو المنصة';
      case 'SANAD_ADMIN': return 'مدير المنصة (سند)';
      default: return role;
    }
  }
}
