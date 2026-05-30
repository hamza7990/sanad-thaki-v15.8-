import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import type { Notification } from '@/types';
import type { LucideIcon } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Icon & colour mapping per notification type                               */
/* -------------------------------------------------------------------------- */

const typeConfig: Record<
  Notification['type'],
  { icon: LucideIcon; iconClass: string; barClass: string }
> = {
  success: {
    icon: CheckCircle,
    iconClass: 'text-success-600',
    barClass: 'bg-success-600',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-danger-600',
    barClass: 'bg-danger-600',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning-600',
    barClass: 'bg-warning-600',
  },
  info: {
    icon: Info,
    iconClass: 'text-primary-600',
    barClass: 'bg-primary-600',
  },
};

/* -------------------------------------------------------------------------- */
/*  Single Toast Item                                                         */
/* -------------------------------------------------------------------------- */

interface ToastItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ notification, onDismiss }) => {
  const { icon: Icon, iconClass, barClass } = typeConfig[notification.type];
  const duration = notification.duration ?? 5000;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (duration <= 0) return;

    const interval = 50; // update every 50ms
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - step;
        return next <= 0 ? 0 : next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [duration]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="card w-80 overflow-hidden shadow-elevated"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3 p-4">
        <Icon size={20} className={`shrink-0 mt-0.5 ${iconClass}`} aria-hidden="true" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-content-primary">{notification.title}</p>
          {notification.message && (
            <p className="mt-0.5 text-xs text-content-secondary">{notification.message}</p>
          )}
        </div>

        <button
          onClick={() => onDismiss(notification.id)}
          className="shrink-0 p-0.5 rounded text-content-tertiary hover:text-content-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary-500"
          aria-label="Dismiss notification"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="h-0.5 w-full bg-surface-2">
          <div
            className={`h-full transition-none ${barClass}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Toast Container                                                           */
/* -------------------------------------------------------------------------- */

export const Toast: React.FC = () => {
  const notifications = useNotificationStore((s) => s.notifications);
  const removeNotification = useNotificationStore((s) => s.removeNotification);

  return (
    <div
      className="fixed bottom-6 end-6 z-50 flex flex-col gap-3"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((n) => (
          <ToastItem key={n.id} notification={n} onDismiss={removeNotification} />
        ))}
      </AnimatePresence>
    </div>
  );
};

Toast.displayName = 'Toast';
