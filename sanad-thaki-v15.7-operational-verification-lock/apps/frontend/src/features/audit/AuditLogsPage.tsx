import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Eye, Filter, Calendar, User, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, Badge, Input, Select, Button } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { apiService } from '@/services/api';
import { formatDate } from '@/utils/utils';
import type { AuditLog, SecurityAuditEntry } from '@/types';

export default function AuditLogsPage() {
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState('audit');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [userQuery, setUserQuery] = useState('');
  const [actionQuery, setActionQuery] = useState('');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      if (activeTab === 'audit') {
        const res = await apiService.getAuditLogs();
        setAuditLogs(res.auditLogs);
      } else {
        const res = await apiService.getSecurityAuditTrail();
        setSecurityLogs(res.securityAuditTrail);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Filter logs locally
  const filteredAuditLogs = auditLogs.filter(log => {
    const matchesUser = userQuery ? log.userId.toLowerCase().includes(userQuery.toLowerCase()) : true;
    const matchesAction = actionQuery ? log.action.toLowerCase().includes(actionQuery.toLowerCase()) : true;
    return matchesUser && matchesAction;
  });

  const filteredSecurityLogs = securityLogs.filter(log => {
    const matchesUser = userQuery ? log.userId?.toLowerCase().includes(userQuery.toLowerCase()) : true;
    const matchesAction = actionQuery ? log.action.toLowerCase().includes(actionQuery.toLowerCase()) : true;
    return matchesUser && matchesAction;
  });

  const getActionLabel = (action: string) => {
    // Human-friendly mapping for Arabic
    switch (action) {
      case 'LOGIN_SUCCESS': return 'تسجيل دخول ناجح';
      case 'CREATE_USER_INVITE': return 'دعوة موظف جديد';
      case 'UPDATE_COMPANY_SETTINGS': return 'تعديل إعدادات المنشأة';
      case 'INVOICE_CREATED': return 'إنشاء فاتورة';
      case 'INVOICE_SUBMITTED_FOR_REVIEW': return 'إرسال فاتورة للمراجعة';
      case 'INVOICE_APPROVED': return 'اعتماد فاتورة';
      case 'INVOICE_REJECTED': return 'رفض فاتورة';
      case 'MATCH_APPROVED': return 'اعتماد مطابقة بنكية';
      case 'MATCH_REJECTED': return 'رفض مطابقة بنكية';
      case 'SUPPORT_TICKET_CREATED': return 'إنشاء تذكرة دعم فني';
      case 'SIGNUP_COMPANY': return 'تسجيل شركة جديدة';
      default: return action;
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'HIGH': return 'danger';
      case 'MEDIUM': return 'warning';
      case 'INFO': return 'info';
      default: return 'default';
    }
  };

  const auditColumns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'التاريخ والوقت',
      accessor: (log) => formatDate(log.createdAt)
    },
    {
      key: 'userId',
      header: 'معرّف المستخدم',
      accessor: (log) => (
        <div className="font-mono text-xs text-content-secondary truncate max-w-[120px]">
          {log.userId}
        </div>
      )
    },
    {
      key: 'action',
      header: 'العملية / الإجراء',
      accessor: (log) => (
        <Badge variant={log.action.includes('FAILED') ? 'danger' : 'info'}>
          {getActionLabel(log.action)}
        </Badge>
      )
    },
    {
      key: 'entityType',
      header: 'نوع الكيان',
      accessor: (log) => (
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-surface-2 text-content-secondary">
          {log.entityType}
        </span>
      )
    },
    {
      key: 'metadata',
      header: 'تفاصيل إضافية',
      accessor: (log) => (
        <span className="text-xs text-content-tertiary truncate max-w-[200px] block">
          {log.metadata ? JSON.stringify(log.metadata) : '-'}
        </span>
      )
    }
  ];

  const securityColumns: Column<SecurityAuditEntry>[] = [
    {
      key: 'createdAt',
      header: 'التاريخ والوقت',
      accessor: (log) => formatDate(log.createdAt)
    },
    {
      key: 'ipAddress',
      header: 'عنوان IP',
      accessor: (log) => (
        <span className="font-mono text-xs text-content-secondary">{log.ipAddress}</span>
      )
    },
    {
      key: 'action',
      header: 'الحدث',
      accessor: (log) => (
        <Badge variant={log.result === 'FAILURE' ? 'danger' : 'success'}>
          {getActionLabel(log.action)}
        </Badge>
      )
    },
    {
      key: 'result',
      header: 'النتيجة',
      accessor: (log) => (
        <Badge variant={log.result === 'SUCCESS' ? 'success' : 'danger'}>
          {log.result === 'SUCCESS' ? 'نجاح' : 'فشل'}
        </Badge>
      )
    },
    {
      key: 'userAgent',
      header: 'المتصفح ونظام التشغيل',
      accessor: (log) => (
        <span className="text-xs text-content-tertiary truncate max-w-[250px] block" title={log.userAgent}>
          {log.userAgent || '-'}
        </span>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="سجلات تدقيق النشاط"
        description="مراقبة ومراجعة سجل العمليات الحساسة ونشاط الحماية والأمان داخل المنشأة"
      />

      <Tabs
        tabs={[
          { key: 'audit', label: 'سجل العمليات الإدارية', icon: Shield },
          { key: 'security', label: 'سجل الحماية وجلسات الدخول', icon: Shield }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 w-full">
            <Input
              label="تصفية حسب مستخدم"
              placeholder="ابحث بـ ID المستخدم..."
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex-1 w-full">
            <Input
              label="تصفية حسب إجراء"
              placeholder="ابحث باسم العملية..."
              value={actionQuery}
              onChange={(e) => setActionQuery(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="pt-5 shrink-0 w-full md:w-auto">
            <Button variant="secondary" onClick={fetchLogs} className="w-full">
              تحديث السجل
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {activeTab === 'audit' ? (
            <DataTable
              data={filteredAuditLogs}
              columns={auditColumns}
              keyExtractor={(log) => log.id}
              loading={loading}
              emptyTitle="لا توجد سجلات عمليات"
              emptyDescription="لم يتم العثور على أي إجراءات إدارية مسجلة للفلتر المحدد"
            />
          ) : (
            <DataTable
              data={filteredSecurityLogs}
              columns={securityColumns}
              keyExtractor={(log) => log.id}
              loading={loading}
              emptyTitle="لا توجد سجلات أمان"
              emptyDescription="لم يتم العثور على أي أحداث أمان أو جلسات دخول مسجلة للفلتر المحدد"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
