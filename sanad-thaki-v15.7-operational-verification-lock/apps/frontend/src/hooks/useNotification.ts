import { useMemo } from 'react';
import { useNotificationStore } from '@/store/notificationStore';

export function useNotification() {
  const addNotification = useNotificationStore((s) => s.addNotification);

  return useMemo(
    () => ({
      success: (title: string, message?: string) =>
        addNotification({ type: 'success', title, message }),
      error: (title: string, message?: string) =>
        addNotification({ type: 'error', title, message }),
      warning: (title: string, message?: string) =>
        addNotification({ type: 'warning', title, message }),
      info: (title: string, message?: string) =>
        addNotification({ type: 'info', title, message }),
    }),
    [addNotification],
  );
}
