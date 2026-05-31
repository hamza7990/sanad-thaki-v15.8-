import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, UserPlus, UserX, UserCheck, ShieldAlert,
  Mail, Shield, RefreshCw, Trash2
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Badge, Card, CardContent, Modal, Input, Select, EmptyState } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { apiService, ApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useNotification } from '@/hooks/useNotification';
import { formatDate } from '@/utils/utils';
import type { User, UserRole } from '@/types';

export default function TeamPage() {
  const { t } = useTranslation();
  const notify = useNotification();
  const currentUser = useAuthStore(s => s.user);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Invite form state
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'MEMBER' as UserRole,
    password: ''
  });

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
      notify.error('خطأ', 'فشل في تحميل أعضاء الفريق');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      notify.error('خطأ', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (form.password && form.password.trim().length < 12) {
      notify.error('خطأ', 'يجب أن تتكون كلمة المرور من 12 خانة على الأقل');
      return;
    }

    setSubmitting(true);
    try {
      await apiService.createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password.trim() || undefined
      });
      if (form.password.trim()) {
        notify.success('تم إنشاء الحساب', 'تم إنشاء حساب الموظف بنجاح بكلمة المرور المحددة');
      } else {
        notify.success('تم إرسال الدعوة', 'تم إرسال رابط تفعيل الحساب إلى البريد الإلكتروني بنجاح');
      }
      setShowInviteModal(false);
      setForm({ name: '', email: '', role: 'MEMBER', password: '' });
      fetchUsers();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل إرسال الدعوة للمستخدم';
      notify.error('خطأ في إرسال الدعوة', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const isOwner = currentUser?.role === 'OWNER';
    if (!isOwner) {
      notify.error('غير مصرح', 'فقط مالك الحساب (OWNER) يمكنه تغيير حالة المستخدمين');
      return;
    }

    if (user.role === 'OWNER') {
      notify.error('خطأ', 'لا يمكن تعليق حساب مالك المنشأة الرئيسي');
      return;
    }

    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiService.updateUserStatus(user.id, nextStatus);
      notify.success('تم تعديل حالة المستخدم', `تم تغيير حالة المستخدم بنجاح إلى ${nextStatus === 'ACTIVE' ? 'نشط' : 'معلق'}`);
      fetchUsers();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل تعديل حالة المستخدم';
      notify.error('خطأ', message);
    }
  };

  const handleRemoveUser = async (user: User) => {
    const isOwner = currentUser?.role === 'OWNER';
    if (!isOwner) {
      notify.error('غير مصرح', 'فقط مالك الحساب (OWNER) يمكنه حذف المستخدمين');
      return;
    }

    if (user.role === 'OWNER') {
      notify.error('خطأ', 'لا يمكن حذف حساب مالك المنشأة الرئيسي');
      return;
    }

    if (!confirm(`هل أنت متأكد من رغبتك في حذف المستخدم ${user.name}؟`)) {
      return;
    }

    try {
      await apiService.archiveUser(user.id);
      notify.success('تم حذف المستخدم', 'تم أرشفة وحذف حساب المستخدم من المنشأة بنجاح');
      fetchUsers();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل حذف المستخدم';
      notify.error('خطأ', message);
    }
  };

  const handleResendInvite = async (user: User) => {
    try {
      await apiService.resetUserInvite(user.id);
      notify.success('تم إعادة إرسال الدعوة', 'تم إعادة إرسال بريد الدعوة للمستخدم بنجاح');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'فشل إعادة إرسال الدعوة';
      notify.error('خطأ', message);
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'OWNER': return 'danger';
      case 'ADMIN': return 'warning';
      case 'FINANCE_MANAGER': return 'success';
      case 'ACCOUNTANT': return 'info';
      default: return 'default';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'OWNER': return 'المالك';
      case 'ADMIN': return 'مدير النظام';
      case 'FINANCE_MANAGER': return 'مدير مالي';
      case 'ACCOUNTANT': return 'محاسب';
      case 'MEMBER': return 'عضو';
      default: return role;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'SUSPENDED': return 'danger';
      case 'ARCHIVED': return 'default';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'نشط';
      case 'SUSPENDED': return 'معلق';
      case 'ARCHIVED': return 'مؤرشف';
      default: return status;
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'الاسم',
      accessor: (user: User) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center font-bold text-content-primary">
            {user.name.charAt(0)}
          </div>
          <div>
            <div className="font-semibold text-content-primary">{user.name}</div>
            <div className="text-xs text-content-tertiary">{user.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      header: 'الدور والجروب الوظيفي',
      accessor: (user: User) => (
        <Badge variant={getRoleBadgeVariant(user.role)}>
          {getRoleLabel(user.role)}
        </Badge>
      )
    },
    {
      key: 'status',
      header: 'الحالة',
      accessor: (user: User) => (
        <Badge variant={getStatusBadgeVariant(user.status)}>
          {getStatusLabel(user.status)}
        </Badge>
      )
    },
    {
      key: 'createdAt',
      header: 'تاريخ الإضافة',
      accessor: (user: User) => user.createdAt ? formatDate(user.createdAt) : '-'
    },
    {
      key: 'actions',
      header: 'الإجراءات والتحكم',
      accessor: (user: User) => {
        const isSelf = currentUser?.id === user.id;
        const isOwner = currentUser?.role === 'OWNER';

        return (
          <div className="flex items-center gap-1.5 justify-end">
            {user.status !== 'ACTIVE' && user.role !== 'OWNER' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleResendInvite(user)}
                title="إعادة إرسال الدعوة"
              >
                <RefreshCw size={14} className="text-content-secondary" />
              </Button>
            )}
            
            {!isSelf && user.role !== 'OWNER' && isOwner && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggleStatus(user)}
                  title={user.status === 'ACTIVE' ? 'تعليق الحساب' : 'تفعيل الحساب'}
                >
                  {user.status === 'ACTIVE' ? (
                    <UserX size={14} className="text-warning-600" />
                  ) : (
                    <UserCheck size={14} className="text-success-600" />
                  )}
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveUser(user)}
                  title="حذف المستخدم"
                >
                  <Trash2 size={14} className="text-danger-600" />
                </Button>
              </>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="إدارة أعضاء الفريق"
        description="دعوة الموظفين والتحكم في صلاحياتهم وحالات دخولهم"
        actions={
          <Button onClick={() => setShowInviteModal(true)} variant="primary">
            <UserPlus size={16} className="me-2" />
            دعوة مستخدم جديد
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-content-secondary">جاري التحميل...</div>
          ) : users.length === 0 ? (
            <EmptyState
              title="لا يوجد مستخدمون"
              description="لم يتم تسجيل مستخدمين آخرين في شركتك حتى الآن"
              icon={Users}
            />
          ) : (
            <DataTable
              data={users}
              columns={columns}
              keyExtractor={(user) => user.id}
            />
          )}
        </CardContent>
      </Card>

      {/* Invite Modal */}
      <Modal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="دعوة موظف جديد للفريق"
      >
        <form onSubmit={handleInvite} className="flex flex-col gap-4">
          <Input
            label="الاسم الكامل"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="أدخل الاسم الكامل"
            required
            disabled={submitting}
          />

          <Input
            label="البريد الإلكتروني للعمل"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="work@company.com"
            required
            disabled={submitting}
          />

          <Select
            label="الدور الصلاحيات"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            options={[
              { value: 'MEMBER', label: 'عضو المنصة (صلاحيات أساسية)' },
              { value: 'ADMIN', label: 'مدير النظام (إدارة المستخدمين والإعدادات)' },
              { value: 'FINANCE_MANAGER', label: 'مدير مالي (اعتمادات مالية ومطابقة بنكية)' },
              { value: 'ACCOUNTANT', label: 'محاسب (رفع الفواتير وإرسال رسائل التذكير)' }
            ]}
            disabled={submitting}
          />

          <Input
            label="كلمة المرور للحساب الجديد (اختياري)"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="أدخل كلمة مرور (حد أدنى 12 خانة) أو اتركها فارغة للإرسال بالبريد"
            disabled={submitting}
            minLength={12}
          />

          {form.role === 'ADMIN' && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning-50 border border-warning-200">
              <ShieldAlert className="text-warning-600 shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-warning-700">
                تحذير: سيحصل هذا المستخدم على صلاحيات واسعة لإدارة المنشأة واستدعاء الفريق، باستثناء عمليات الدفع وإلغاء الاشتراك وحذف المنشأة.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowInviteModal(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
            >
              إرسال الدعوة
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
