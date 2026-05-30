import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell, CheckCircle, AlertCircle, Info, HelpCircle,
  Eye, Trash2, Check, BellOff
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Badge, Card, CardContent, EmptyState } from '@/components/ui';
import { apiService } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { formatDate, cn } from '@/utils/utils';
import type { DbNotification } from '@/types';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const notify = useNotification();

  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiService.markNotificationRead(id);
      
      // Update state locally
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      notify.success('تم التحديث', 'تم تعيين الإشعار كمقروء');
    } catch (err) {
      console.error('Error marking read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-success-600 w-5 h-5 shrink-0" />;
      case 'warning':
        return <AlertCircle className="text-warning-600 w-5 h-5 shrink-0" />;
      case 'error':
        return <AlertCircle className="text-danger-600 w-5 h-5 shrink-0" />;
      case 'info':
      default:
        return <Info className="text-primary-600 w-5 h-5 shrink-0" />;
    }
  };

  const getNotificationBg = (type: string, isRead: boolean) => {
    if (isRead) return 'bg-surface-1';
    switch (type) {
      case 'success': return 'bg-success-50/40 dark:bg-success-950/10 border-s-4 border-s-success-600';
      case 'warning': return 'bg-warning-50/40 dark:bg-warning-950/10 border-s-4 border-s-warning-600';
      case 'error': return 'bg-danger-50/40 dark:bg-danger-950/10 border-s-4 border-s-danger-600';
      case 'info':
      default:
        return 'bg-primary-50/40 dark:bg-primary-950/10 border-s-4 border-s-primary-600';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="مركز الإشعارات والتنبيهات"
        description="إشعارات فورية حول اعتمادات الفواتير والمطابقات البنكية وأحداث المنشأة"
      />

      <Card>
        <CardContent className="p-4 flex justify-between items-center bg-surface-1 border border-border rounded-xl">
          <div className="flex items-center gap-2">
            <Bell className="text-content-secondary w-5 h-5" />
            <span className="text-sm font-semibold text-content-primary">
              لديك {unreadCount} تنبيهات غير مقروءة حالياً
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={fetchNotifications}>
            تحديث
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="p-12 text-center text-content-secondary">جاري تحميل التنبيهات...</div>
        ) : notifications.length === 0 ? (
          <EmptyState
            title="لا توجد تنبيهات"
            description="مركز إشعاراتك فارغ تماماً حالياً"
            icon={BellOff}
          />
        ) : (
          notifications.map(item => (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-4 p-4 rounded-xl border border-border transition-all duration-200',
                getNotificationBg(item.type, item.is_read)
              )}
            >
              <div className="mt-0.5">
                {getNotificationIcon(item.type)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <h4 className={cn('text-sm font-bold text-content-primary', !item.is_read && 'text-primary-900 dark:text-primary-300')}>
                    {item.title}
                  </h4>
                  <span className="text-xs text-content-tertiary whitespace-nowrap shrink-0">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
                {item.message && (
                  <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                    {item.message}
                  </p>
                )}
              </div>

              {!item.is_read && (
                <button
                  onClick={() => handleMarkAsRead(item.id)}
                  className="p-1.5 rounded-lg hover:bg-surface-2 text-content-tertiary hover:text-content-primary transition-colors ms-2"
                  title="تعيين كمقروء"
                >
                  <Check size={16} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
