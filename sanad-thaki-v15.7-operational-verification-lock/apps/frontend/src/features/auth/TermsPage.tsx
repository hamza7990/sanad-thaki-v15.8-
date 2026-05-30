import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, ChevronRight, FileText } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, CardContent } from '@/components/ui';

export default function TermsPage() {
  const navigate = useNavigate();

  const policies = [
    {
      title: '1. الشروط والأحكام العامة',
      content: 'سند ذكي هي منصة تحصيل وإدارة لمطالبات وفواتير العملاء قبل المحاسبة. لا يمثل النظام حلاً محاسبياً متكاملاً، وتتحمل المنشأة وحدها صحة البيانات المالية المدخلة واعتماد الفواتير.'
    },
    {
      title: '2. سياسة الخصوصية وسرية البيانات',
      content: 'نلتزم بتشفير كشوفات الحساب والتوكنات السرية باستخدام تشفير AES-256 المستأجر. لا يمكن لمشرفي المنصة فك تشفير بياناتك السرية بدون تدوير ومزامنة المفاتيح الأمنية.'
    },
    {
      title: '3. سياسة الاستخدام العادل والمقاعد',
      content: 'تخضع الحسابات لقيود باقة الاشتراك الشهرية المحددة. سيتم إيقاف معالجة الفواتير الإضافية أو إرسال إشعارات واتساب تلقائياً بمجرد استهلاك السقف المحدد للباقة.'
    },
    {
      title: '4. سياسة إشعارات واتساب',
      content: 'يجب أن تلتزم المنشأة بسياسة مراسلات Meta الرسمية، حيث يقتصر الإرسال على القوالب والرسائل المعتمدة فقط تجنباً لحظر الأرقام من قبل شركة Meta.'
    },
    {
      title: '5. سياسة الاحتفاظ بالبيانات وحذفها',
      content: 'في حال انتهاء أو إلغاء الاشتراك، يحتفظ النظام ببيانات الفواتير والعمليات لمدة 90 يوماً كحد أقصى قبل جدولتها للحذف النهائي والآمن من خوادم وقواعد بيانات المستأجرين.'
    }
  ];

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col font-sans antialiased">
      {/* NAVBAR */}
      <header className="bg-surface-1 border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">س</span>
            </div>
            <span className="text-sm font-bold text-content-primary">سند ذكي</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>
              دخول النظام
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/signup')}>
              ابدأ مجاناً
            </Button>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12 w-full flex flex-col gap-6">
        <div className="flex items-center gap-2 text-sm text-content-tertiary">
          <Link to="/" className="hover:text-content-primary transition-colors">الرئيسية</Link>
          <ChevronRight size={14} />
          <span>الشروط والسياسات</span>
        </div>

        <div className="border-b border-border pb-4">
          <h1 className="text-3xl font-black text-content-primary">الشروط والسياسات العامة للاستخدام</h1>
          <p className="text-sm text-content-secondary mt-1">سند ذكي — النسخة v15.8 (Operational Release)</p>
        </div>

        <Card className="border-warning-200 bg-warning-50/10">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldCheck className="text-warning-600 shrink-0 mt-0.5" size={20} />
            <div className="text-xs text-warning-800 leading-relaxed">
              <strong>تنبيه هام للمشغلين والملاك:</strong>
              <p className="mt-1">
                هذه صياغة تشغيلية وتجارية أولية ضمن نسخة سند ذكي، وتحتاج مراجعة قانونية نهائية قبل الإطلاق المدفوع العام أو إدخال بيانات عملاء حقيقية.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 mt-2">
          {policies.map((p, idx) => (
            <Card key={idx}>
              <CardContent className="p-6 flex flex-col gap-2 text-start">
                <h3 className="text-base font-bold text-content-primary">{p.title}</h3>
                <p className="text-sm text-content-secondary leading-relaxed">{p.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center pt-8 border-t border-border mt-6">
          <p className="text-xs text-content-tertiary">
            © {new Date().getFullYear()} سند ذكي. جميع السياسات خاضعة للأنظمة المعمول بها في المملكة العربية السعودية.
          </p>
        </div>
      </main>
    </div>
  );
}
