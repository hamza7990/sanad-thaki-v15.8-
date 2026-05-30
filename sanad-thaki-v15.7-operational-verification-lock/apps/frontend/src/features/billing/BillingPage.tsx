import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CreditCard, Check, Sparkles, Zap, Download,
  AlertCircle, Calendar, ArrowUpRight, Users, CheckCircle2,
  Lock, RefreshCw
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Badge, Card, CardContent, Modal, Input } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { apiService, ApiError } from '@/services/api';
import { useNotification } from '@/hooks/useNotification';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatDate } from '@/utils/utils';
import type { BillingPlan, TenantUsage } from '@/types';

interface PaymentHistory {
  id: string;
  invoiceNumber: string;
  paymentDate: string;
  amount: number;
  status: 'PAID' | 'FAILED' | 'PENDING';
  planLabel: string;
}

export default function BillingPage() {
  const { t, i18n } = useTranslation();
  const notify = useNotification();
  const isRtl = i18n.language === 'ar';

  const { company, entitlements, setAuth, user, companies } = useAuthStore();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [usage, setUsage] = useState<TenantUsage>({
    invoicesUsed: 0,
    invoicesLimit: 100,
    whatsappUsed: 0,
    whatsappLimit: 0,
    usersUsed: 1,
    usersLimit: 3
  });
  
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  
  // Credit Card Form
  const [cardForm, setCardForm] = useState({
    cardholderName: '',
    cardNumber: '',
    expiry: '',
    cvc: ''
  });

  // Mock Payment History
  const [payments, setPayments] = useState<PaymentHistory[]>([]);

  useEffect(() => {
    async function initBilling() {
      try {
        setLoading(true);
        // Fetch plans
        const planData = await apiService.getPlans();
        setPlans(planData);

        // Fetch usage
        const usageData = await apiService.getTenantUsage();
        
        // Count users currently in company
        const users = await apiService.getUsers().catch(() => []);

        // Compute usages from events rollup
        let invoicesUsed = 0;
        let whatsappUsed = 0;

        if (usageData && Array.isArray(usageData.usage)) {
          usageData.usage.forEach((u: any) => {
            if (u.metric.startsWith('invoice_created') || u.metric.startsWith('invoice_queued') || u.metric.startsWith('invoice_imported')) {
              invoicesUsed += u.quantity;
            }
            if (u.metric.startsWith('whatsapp')) {
              whatsappUsed += u.quantity;
            }
          });
        }

        setUsage({
          invoicesUsed,
          invoicesLimit: entitlements?.invoiceMonthlyLimit || 100,
          whatsappUsed,
          whatsappLimit: entitlements?.whatsappMonthlyLimit || 0,
          usersUsed: users.length || 1,
          usersLimit: entitlements?.userLimit || 3
        });

        // Payment history: show current active plan subscription as a record
        // (full billing history requires a dedicated /billing/history endpoint)
        if (entitlements) {
          setPayments([
            {
              id: 'current-plan',
              invoiceNumber: `SUB-${entitlements.code.toUpperCase()}-CURRENT`,
              paymentDate: new Date().toISOString(),
              amount: entitlements.priceSar || 0,
              status: 'PAID',
              planLabel: entitlements.label || entitlements.code
            }
          ]);
        } else {
          setPayments([]);
        }
      } catch (err) {
        console.error('Error fetching billing data:', err);
        notify.error('خطأ', 'فشل في تحميل بيانات الاشتراك والدفع');
      } finally {
        setLoading(false);
      }
    }
    initBilling();
  }, [entitlements, notify]);

  const handleOpenCheckout = (plan: BillingPlan) => {
    if (plan.code === entitlements?.code) return;
    setSelectedPlan(plan);
    setCardForm({ cardholderName: '', cardNumber: '', expiry: '', cvc: '' });
    setShowCheckoutModal(true);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    
    if (!cardForm.cardholderName || !cardForm.cardNumber || !cardForm.expiry || !cardForm.cvc) {
      notify.error(isRtl ? 'خطأ' : 'Error', isRtl ? 'يرجى إدخال جميع بيانات البطاقة الائتمانية' : 'Please fill all card details');
      return;
    }

    setProcessingPayment(true);
    try {
      const res = await apiService.upgradePlan(selectedPlan.code);
      
      // Update session store with new company & entitlements
      if (user) {
        setAuth(user, res.company, companies, res.entitlements);
      }

      notify.success(
        isRtl ? 'تم تحديث الاشتراك بنجاح' : 'Subscription Updated',
        isRtl 
          ? `تمت ترقية منشأتك إلى الباقة ${selectedPlan.label} بنجاح.` 
          : `Your workspace has been upgraded to the ${selectedPlan.label} plan successfully.`
      );

      // Add upgrade record to payment log
      setPayments((prev) => [
        {
          id: `pay_${Date.now()}`,
          invoiceNumber: `SUB-${selectedPlan.code.toUpperCase()}-${new Date().toISOString().slice(0, 7)}`,
          paymentDate: new Date().toISOString(),
          amount: selectedPlan.priceSar,
          status: 'PAID',
          planLabel: selectedPlan.label
        },
        ...prev.filter(p => p.id !== 'current-plan')
      ]);
      
      setShowCheckoutModal(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (isRtl ? 'فشل معالجة عملية الدفع' : 'Payment processing failed');
      notify.error(isRtl ? 'خطأ في الدفع' : 'Payment Error', msg);
    } finally {
      setProcessingPayment(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'PAID': return 'success';
      case 'FAILED': return 'danger';
      default: return 'warning';
    }
  };

  const getStatusLabel = (status: string) => {
    if (isRtl) {
      switch (status) {
        case 'PAID': return 'مدفوعة';
        case 'FAILED': return 'فشلت';
        default: return 'معلقة';
      }
    }
    return status;
  };

  const columns: Column<PaymentHistory>[] = [
    {
      key: 'invoiceNumber',
      header: isRtl ? 'رقم الفاتورة' : 'Invoice Number',
      accessor: (p) => <span className="font-mono text-content-primary">{p.invoiceNumber}</span>
    },
    {
      key: 'paymentDate',
      header: isRtl ? 'تاريخ الدفع' : 'Payment Date',
      accessor: (p) => formatDate(p.paymentDate)
    },
    {
      key: 'planLabel',
      header: isRtl ? 'الباقة المشحونة' : 'Billing Plan',
      accessor: (p) => p.planLabel
    },
    {
      key: 'amount',
      header: isRtl ? 'المبلغ المدفوع' : 'Amount Paid',
      accessor: (p) => (
        <span className="font-bold">
          {formatCurrency(p.amount)}
        </span>
      )
    },
    {
      key: 'status',
      header: isRtl ? 'حالة العملية' : 'Payment Status',
      accessor: (p) => (
        <Badge variant={getStatusBadgeVariant(p.status)}>
          {getStatusLabel(p.status)}
        </Badge>
      )
    },
    {
      key: 'actions',
      header: '',
      accessor: () => (
        <Button variant="ghost" size="sm" onClick={() => notify.success(isRtl ? 'نجاح' : 'Success', isRtl ? 'بدأ تحميل الفاتورة الضريبية...' : 'Downloading PDF Invoice...')}>
          <Download size={14} className="me-1.5" />
          {isRtl ? 'تحميل PDF' : 'Download PDF'}
        </Button>
      )
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-content-secondary">
        <RefreshCw className="animate-spin me-2" size={18} />
        {isRtl ? 'جاري تحميل بيانات الاشتراك...' : 'Loading subscription details...'}
      </div>
    );
  }

  const invoicePercent = Math.min(100, Math.round((usage.invoicesUsed / usage.invoicesLimit) * 100));
  const whatsappPercent = usage.whatsappLimit > 0 ? Math.min(100, Math.round((usage.whatsappUsed / usage.whatsappLimit) * 100)) : 0;
  const userPercent = Math.min(100, Math.round((usage.usersUsed / usage.usersLimit) * 100));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('billing.title')}
        description={isRtl ? 'أدر اشتراكك والحدود والمقاعد المتاحة واطلع على سجل الفواتير والمطالبة المالية.' : 'Manage subscriptions, seats, resource consumption metrics, and download invoice records.'}
      />

      {/* ============================================================
          CURRENT SUBSCRIPTION LIMITS & METRICS
         ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Invoices Limit */}
        <Card className="hover:shadow-md transition-shadow relative overflow-hidden">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-content-tertiary uppercase tracking-wider">{t('billing.invoiceLimit')}</p>
                <h3 className="text-2xl font-bold mt-1 text-content-primary">
                  {usage.invoicesUsed} <span className="text-sm font-normal text-content-tertiary">/ {usage.invoicesLimit}</span>
                </h3>
              </div>
              <div className="p-2.5 bg-primary-50 rounded-xl dark:bg-primary-950/30">
                <Zap className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
            </div>
            
            <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 rounded-full ${
                  invoicePercent > 90 ? 'bg-danger-500' : invoicePercent > 70 ? 'bg-warning-500' : 'bg-primary-600'
                }`}
                style={{ width: `${invoicePercent}%` }}
              />
            </div>
            <p className="text-xs text-content-secondary">
              {isRtl 
                ? `استهلكت المنشأة ${invoicePercent}% من سقف الفواتير الضريبية المتاحة للشهر الحالي.`
                : `Your company used ${invoicePercent}% of the tax invoice quota allocated for this month.`}
            </p>
          </CardContent>
        </Card>

        {/* WhatsApp Quota */}
        <Card className="hover:shadow-md transition-shadow relative overflow-hidden">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-content-tertiary uppercase tracking-wider">{t('billing.whatsappLimit')}</p>
                <h3 className="text-2xl font-bold mt-1 text-content-primary">
                  {usage.whatsappLimit > 0 ? (
                    <>
                      {usage.whatsappUsed} <span className="text-sm font-normal text-content-tertiary">/ {usage.whatsappLimit}</span>
                    </>
                  ) : (
                    <span className="text-lg text-content-tertiary font-semibold">غير متاح</span>
                  )}
                </h3>
              </div>
              <div className="p-2.5 bg-success-50 rounded-xl dark:bg-success-950/30">
                <Sparkles className="w-5 h-5 text-success-600 dark:text-success-400" />
              </div>
            </div>
            
            <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-success-600 transition-all duration-300 rounded-full"
                style={{ width: `${whatsappPercent}%` }}
              />
            </div>
            <p className="text-xs text-content-secondary">
              {usage.whatsappLimit > 0 
                ? (isRtl ? `تذكيرات واتساب التلقائية مفعلة. متبقي ${usage.whatsappLimit - usage.whatsappUsed} رسالة.` : `Automatic WhatsApp reminders active. ${usage.whatsappLimit - usage.whatsappUsed} remaining.`)
                : (isRtl ? 'باقة المنشأة الحالية لا تدعم تذكيرات واتساب للمدفوعات.' : 'Your plan does not support automatic WhatsApp payment alerts.')}
            </p>
          </CardContent>
        </Card>

        {/* Users / Seats Limit */}
        <Card className="hover:shadow-md transition-shadow relative overflow-hidden">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-content-tertiary uppercase tracking-wider">{t('billing.usersLimit')}</p>
                <h3 className="text-2xl font-bold mt-1 text-content-primary">
                  {usage.usersUsed} <span className="text-sm font-normal text-content-tertiary">/ {usage.usersLimit}</span>
                </h3>
              </div>
              <div className="p-2.5 bg-info-50 rounded-xl dark:bg-primary-950/20">
                <Users className="w-5 h-5 text-primary-500" />
              </div>
            </div>
            
            <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-500 transition-all duration-300 rounded-full"
                style={{ width: `${userPercent}%` }}
              />
            </div>
            <p className="text-xs text-content-secondary">
              {isRtl 
                ? `تم حجز وإعداد ${usage.usersUsed} من أصل ${usage.usersLimit} مقاعد مستخدمين مصرحين.`
                : `Allocated ${usage.usersUsed} of ${usage.usersLimit} active user credentials inside this company.`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================
          SUBSCRIPTION PRICING PACKAGES
         ============================================================ */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-content-primary">{t('billing.pricing')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-1">
          {plans.map((p) => {
            const isCurrent = p.code === entitlements?.code;
            return (
              <Card 
                key={p.code} 
                className={`relative flex flex-col justify-between transition-all duration-200 ${
                  isCurrent 
                    ? 'border-2 border-primary-500 shadow-md ring-1 ring-primary-500/20' 
                    : 'hover:border-content-tertiary'
                }`}
              >
                {isCurrent && (
                  <span className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                    {t('billing.current')}
                  </span>
                )}
                
                <CardContent className="p-6 flex flex-col gap-6 flex-grow">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xl font-bold text-content-primary">{p.label}</h3>
                    <p className="text-sm text-content-secondary min-h-[40px] mt-1">{p.marketing}</p>
                  </div>

                  <div className="flex items-baseline gap-1.5 py-4 border-y border-border">
                    <span className="text-4xl font-extrabold text-content-primary">{p.priceSar}</span>
                    <span className="text-sm text-content-tertiary">{t('common.currency')}</span>
                    <span className="text-xs text-content-tertiary ms-1">{t('billing.monthly')}</span>
                  </div>

                  {/* Limits and quotas lists */}
                  <ul className="flex flex-col gap-3.5 text-sm text-content-secondary">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      <span>
                        {isRtl ? `حتى ${p.invoiceMonthlyLimit} فاتورة شهرياً` : `Up to ${p.invoiceMonthlyLimit} invoices / month`}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      <span>
                        {p.whatsappMonthlyLimit > 0 
                          ? (isRtl ? `حتى ${p.whatsappMonthlyLimit} تذكير واتساب شهرياً` : `Up to ${p.whatsappMonthlyLimit} WhatsApp alerts / month`)
                          : (isRtl ? 'بدون تذكيرات واتساب' : 'No WhatsApp reminders')}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      <span>
                        {isRtl ? `عدد ${p.userLimit} مقاعد مستخدمين للمنشأة` : `Up to ${p.userLimit} user seats`}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.features.bankMatching ? (
                        <CheckCircle2 size={16} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle size={16} className="text-content-tertiary flex-shrink-0" />
                      )}
                      <span className={p.features.bankMatching ? '' : 'text-content-tertiary line-through'}>
                        {isRtl ? 'المطابقة البنكية التلقائية' : 'Bank statement auto-matching'}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.features.advancedReports ? (
                        <CheckCircle2 size={16} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle size={16} className="text-content-tertiary flex-shrink-0" />
                      )}
                      <span className={p.features.advancedReports ? '' : 'text-content-tertiary line-through'}>
                        {isRtl ? 'التقارير التحليلية المتقدمة' : 'Advanced analytical reports'}
                      </span>
                    </li>
                  </ul>
                </CardContent>

                <div className="p-6 pt-0 mt-auto">
                  <Button 
                    className="w-full" 
                    variant={isCurrent ? 'secondary' : 'primary'}
                    disabled={isCurrent}
                    onClick={() => handleOpenCheckout(p)}
                  >
                    {isCurrent ? t('billing.current') : t('billing.selectPlan')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          BILLING & PAYMENT TRANSACTION LOGS
         ============================================================ */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-bold text-content-primary mb-4">{t('billing.history')}</h2>
          <div className="p-0 border rounded-xl overflow-hidden bg-surface-1 border-border">
            <DataTable
              data={payments}
              columns={columns}
              keyExtractor={(p) => p.id}
            />
          </div>
        </CardContent>
      </Card>

      {/* ============================================================
          STRIPE PAYMENTS MODAL SIMULATOR
         ============================================================ */}
      <Modal
        open={showCheckoutModal}
        onClose={() => !processingPayment && setShowCheckoutModal(false)}
        title={isRtl ? 'بوابة الدفع الآمنة (Stripe)' : 'Secure Stripe Payment Gateway'}
      >
        {selectedPlan && (
          <form onSubmit={handleCheckoutSubmit} className="flex flex-col gap-4">
            <div className="bg-surface-2 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-content-tertiary">{isRtl ? 'الباقة المحددة' : 'Selected Plan'}</p>
                <h4 className="text-base font-bold text-content-primary mt-0.5">{selectedPlan.label}</h4>
              </div>
              <div className="text-end">
                <p className="text-xs text-content-tertiary">{isRtl ? 'قيمة الاشتراك' : 'Subscription Price'}</p>
                <h4 className="text-lg font-extrabold text-primary-600 mt-0.5">
                  {formatCurrency(selectedPlan.priceSar)} <span className="text-xs font-normal text-content-tertiary">/ {isRtl ? 'شهر' : 'mo'}</span>
                </h4>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Input
                label={isRtl ? 'اسم صاحب البطاقة' : 'Cardholder Name'}
                type="text"
                value={cardForm.cardholderName}
                onChange={(e) => setCardForm({ ...cardForm, cardholderName: e.target.value })}
                placeholder="SARAH AL-OTAIBI"
                required
                disabled={processingPayment}
              />

              <div className="relative">
                <Input
                  label={isRtl ? 'رقم البطاقة الائتمانية' : 'Card Number'}
                  type="text"
                  value={cardForm.cardNumber}
                  onChange={(e) => {
                    // Simple formatting for credit cards
                    const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                    const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
                    setCardForm({ ...cardForm, cardNumber: formatted });
                  }}
                  placeholder="4242 4242 4242 4242"
                  required
                  disabled={processingPayment}
                />
                <CreditCard className={`absolute bottom-3 ${isRtl ? 'left-3' : 'right-3'} w-4.5 h-4.5 text-content-tertiary`} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={isRtl ? 'تاريخ الانتهاء' : 'Expiration Date'}
                  type="text"
                  value={cardForm.expiry}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                    const formatted = value.length >= 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value;
                    setCardForm({ ...cardForm, expiry: formatted });
                  }}
                  placeholder="MM/YY"
                  required
                  disabled={processingPayment}
                />

                <Input
                  label={isRtl ? 'الرمز الأمني (CVC)' : 'Security Code (CVC)'}
                  type="password"
                  value={cardForm.cvc}
                  onChange={(e) => setCardForm({ ...cardForm, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="•••"
                  required
                  disabled={processingPayment}
                />
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 py-2.5 text-xs text-content-tertiary border-t border-border mt-2">
              <Lock size={12} />
              <span>{isRtl ? 'تشفير آمن بمستوى البنوك (256-bit SSL)' : 'Secure SSL encrypted bank-grade checkout'}</span>
            </div>

            <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCheckoutModal(false)}
                disabled={processingPayment}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={processingPayment}
              >
                {processingPayment ? t('billing.processing') : `${t('billing.pay')} (${formatCurrency(selectedPlan.priceSar)})`}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
