import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileText, ShieldCheck, Zap, MessageSquare, ArrowLeftRight,
  TrendingUp, BarChart3, Users, HelpCircle, CheckCircle2, ChevronLeft
} from 'lucide-react';
import { Button, Card, CardContent, Badge } from '@/components/ui';

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    {
      icon: FileText,
      title: 'تنظيم وضبط الفواتير',
      desc: 'إدخال فواتير العملاء وتنظيمها بدقة وتتبع حالتها خطوة بخطوة لمنع ضياع أي مطالبة مالية.'
    },
    {
      icon: ShieldCheck,
      title: 'نظام الاعتماد الداخلي',
      desc: 'لا يتم إرسال أي مطالبة للعميل إلا بعد اعتمادها ومراجعتها رسمياً من المدير المالي.'
    },
    {
      icon: MessageSquare,
      title: 'تذكيرات واتساب التلقائية',
      desc: 'إرسال تنبيهات دفع ذكية وودية للعملاء عبر واتساب تلقائياً فور اعتماد الفاتورة لتسريع التحصيل.'
    },
    {
      icon: ArrowLeftRight,
      title: 'المطابقة البنكية التلقائية',
      desc: 'ربط ومطابقة كشوفات الحسابات البنكية المستوردة بالفواتير المفتوحة لتحديد المدفوعات آلياً.'
    },
    {
      icon: BarChart3,
      title: 'تقارير التحصيل والتحليل',
      desc: 'لوحة CFO تفاعلية تستعرض نسب التحصيل، التدفقات النقدية، وأعمار الذمم بدقة متناهية.'
    },
    {
      icon: Users,
      title: 'صلاحيات الفرق والأدوار',
      desc: 'توزيع العمل بين المحاسب والمدير المالي والمدير العام بنظام صلاحيات صارم ومنفصل.'
    }
  ];

  const plans = [
    {
      code: 'basic',
      label: 'الباقة الأساسية',
      price: 99,
      marketing: 'تنظيم فواتير العملاء ومراجعتها واعتمادها.',
      limits: [
        '100 فاتورة شهرياً',
        '2 مستخدمين نشطين',
        'بدون تذكيرات واتساب',
        'بدون مطابقة بنكية تلقائية',
        'تقارير أساسية فقط'
      ]
    },
    {
      code: 'growth',
      label: 'باقة النمو (المستحسنة)',
      price: 249,
      marketing: 'تسريع التحصيل والمتابعة وإرسال الواتساب والربط البنكي.',
      limits: [
        '400 فاتورة شهرياً',
        '5 مستخدمين نشطين',
        'تذكيرات واتساب معتمدة',
        'مطابقة بنكية ذكية وتلقائية',
        'لوحة تقارير تحصيل CFO كاملة'
      ],
      featured: true
    },
    {
      code: 'professional',
      label: 'الباقة الاحترافية',
      price: 499,
      marketing: 'للشركات الكبرى التي تحتاج سعة فواتير عالية ومقاعد متعددة للفرق.',
      limits: [
        '1,200 فاتورة شهرياً',
        '15 مستخدم نشط',
        'قوالب واتساب متعددة اللغات',
        'مطابقة بنكية مع الدعم الفني المباشر',
        'تقارير متقدمة وتصدير PDF/Excel'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col font-sans select-none antialiased">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 bg-surface-1/80 backdrop-blur-md border-b border-border transition-all">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">س</span>
            </div>
            <div>
              <h2 className="text-md font-extrabold text-content-primary">سند ذكي</h2>
              <p className="text-[10px] text-content-tertiary">طبقة التحكم والتحصيل الذكي للفواتير</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-sm font-medium text-content-secondary hover:text-content-primary transition-colors">
              الشروط والسياسات
            </Link>
            <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>
              دخول النظام
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/signup')}>
              ابدأ مجاناً
            </Button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative py-20 lg:py-28 overflow-hidden bg-gradient-to-b from-surface-1 to-surface-0 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 flex flex-col gap-6 text-start">
            <Badge variant="info" className="w-fit">النسخة v15.8 — جاهز للإنتاج</Badge>
            <h1 className="text-4xl lg:text-5xl font-black text-content-primary leading-tight tracking-tight">
              اضبط فواتير العملاء والتحصيل <br className="hidden md:inline" />
              <span className="text-primary-600">بدون فوضى الإكسل والواتساب اليدوي</span>
            </h1>
            <p className="text-lg text-content-secondary leading-relaxed max-w-xl">
              سند ذكي ينظم إدخال الفاتورة، ومراجعتها، واعتمادها، ثم يرسل تذكيرات الدفع الرسمية عبر واتساب تلقائياً ويطابقها مع كشوف الحسابات البنكية في مسار واحد خفيف وآمن.
            </p>
            <div className="flex items-center gap-3.5 mt-2">
              <Button size="lg" onClick={() => navigate('/signup')} variant="primary">
                ابدأ التجربة المجانية الآن
                <ChevronLeft className="ms-1.5 w-5 h-5 rtl:rotate-0" />
              </Button>
              <a href="#pricing">
                <Button size="lg" variant="outline">
                  عرض خطط الاشتراك
                </Button>
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 relative">
            <div className="absolute inset-0 bg-primary-600/10 rounded-2xl blur-3xl -z-10" />
            <Card className="border border-border/80 shadow-xl bg-surface-1 max-w-md mx-auto">
              <CardContent className="p-6 flex flex-col gap-5">
                <h3 className="text-lg font-bold text-content-primary border-b border-border pb-3 flex items-center gap-2">
                  <Zap className="text-primary-600 w-5 h-5" />
                  المسار المختصر لضبط التحصيل
                </h3>
                <ul className="flex flex-col gap-4">
                  {[
                    { step: '1', label: 'المحاسب يرفع الفاتورة ويستخرج بياناتها (OCR)' },
                    { step: '2', label: 'المدير المالي يراجع الفاتورة ويعتمد الدفع' },
                    { step: '3', label: 'بوابة واتساب ترسل تنبيه الدفع آلياً بعد الاعتماد' },
                    { step: '4', label: 'مطابقة عمليات السداد مع البنك تلقائياً' },
                    { step: '5', label: 'تحليل التدفق النقدي ونسب التحصيل في التقارير' }
                  ].map((s) => (
                    <li key={s.step} className="flex items-start gap-3 text-sm text-content-secondary">
                      <span className="w-6 h-6 rounded-full bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-400 font-bold flex items-center justify-center shrink-0">
                        {s.step}
                      </span>
                      <span className="mt-0.5">{s.label}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="py-20 bg-surface-1 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="max-w-2xl mx-auto flex flex-col gap-3 mb-16">
            <h2 className="text-3xl font-bold text-content-primary">كيف يساعدك سند ذكي؟</h2>
            <p className="text-sm text-content-secondary">دورة تحصيل متكاملة تبدأ من رفع الملف وتمر بالاعتمادات المالية والربط والاتصال بالعملاء</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6 text-start flex flex-col gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-content-primary mb-1.5">{f.title}</h3>
                      <p className="text-xs text-content-secondary leading-relaxed">{f.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section className="py-20 bg-surface-0 border-b border-border" id="pricing">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="max-w-2xl mx-auto flex flex-col gap-3 mb-16">
            <h2 className="text-3xl font-bold text-content-primary">باقات الاشتراك والأسعار</h2>
            <p className="text-sm text-content-secondary">اختر الباقة المناسبة لحجم فواتير منشأتك وعمليات التحصيل الخاصة بك</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((p) => (
              <Card
                key={p.code}
                className={`relative flex flex-col justify-between transition-all ${
                  p.featured
                    ? 'border-2 border-primary-500 shadow-lg ring-1 ring-primary-500/20'
                    : 'hover:border-content-tertiary'
                }`}
              >
                {p.featured && (
                  <span className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                    الأكثر طلباً
                  </span>
                )}

                <CardContent className="p-6 text-start flex flex-col gap-6">
                  <div>
                    <h3 className="text-lg font-bold text-content-primary">{p.label}</h3>
                    <p className="text-xs text-content-secondary mt-1 min-h-[36px]">{p.marketing}</p>
                  </div>

                  <div className="flex items-baseline gap-1.5 py-4 border-y border-border">
                    <span className="text-4xl font-extrabold text-content-primary">{p.price}</span>
                    <span className="text-sm text-content-tertiary">ريال سعودي</span>
                    <span className="text-xs text-content-tertiary ms-1">/ شهرياً</span>
                  </div>

                  <ul className="flex flex-col gap-3 text-xs text-content-secondary">
                    {p.limits.map((l, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <div className="p-6 pt-0">
                  <Button
                    onClick={() => navigate('/signup')}
                    className="w-full"
                    variant={p.featured ? 'primary' : 'secondary'}
                  >
                    بدء التجربة الحرة
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <p className="text-[11px] text-content-tertiary mt-8">
            * الفواتير غير المستهلكة تنتهي بنهاية الشهر ولا تدوّر. الأسعار النهائية والضريبة تخضع لعقد الخدمة.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-surface-1 border-t border-border mt-auto py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">س</span>
            </div>
            <span className="text-xs font-semibold text-content-secondary">© {new Date().getFullYear()} سند ذكي. جميع الحقوق محفوظة.</span>
          </div>

          <div className="flex items-center gap-6 text-xs text-content-secondary">
            <Link to="/terms" className="hover:text-content-primary transition-colors">
              الشروط والسياسات
            </Link>
            <span className="text-content-tertiary">|</span>
            <span className="text-content-tertiary">منصة تحصيل وإدارة فواتير العملاء قبل المحاسبة</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
