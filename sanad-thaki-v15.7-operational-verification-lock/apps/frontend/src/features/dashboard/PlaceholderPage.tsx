import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui';
import * as Icons from 'lucide-react';

interface PlaceholderPageProps {
  titleKey: string;
  iconName: keyof typeof Icons;
  description?: string;
}

export function PlaceholderPage({ titleKey, iconName, description }: PlaceholderPageProps) {
  const { t } = useTranslation();
  const Icon = Icons[iconName] as React.ComponentType<{ className?: string }>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <PageHeader
        title={t(titleKey)}
        description={description || `${t(titleKey)} — ${t('app.tagline')}`}
      />

      <Card className="border border-border bg-surface-1 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-950/30 flex items-center justify-center text-primary-600 dark:text-primary-400 mb-4">
            {Icon && <Icon className="w-8 h-8" />}
          </div>
          <h2 className="text-xl font-bold text-content-primary mb-2">
            {t(titleKey)}
          </h2>
          <p className="text-sm text-content-secondary max-w-md">
            هذه الصفحة قيد التطوير والتحضير للعمليات المالية. سيتم تفعيل الميزات والربط البرمجي الكامل قريباً.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
