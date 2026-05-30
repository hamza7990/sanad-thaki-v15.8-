import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Building, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { useAuthStore } from '@/store/authStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/services/api';
import loginHero from '@/assets/login_branding_hero.png';

export default function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signup } = useAuth();
  const notify = useNotification();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Page title
  useEffect(() => {
    document.title = 'إنشاء حساب جديد | سند ذكي';
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!companyName.trim()) {
      setError('يرجى إدخال اسم الشركة');
      return;
    }
    if (!name.trim()) {
      setError('يرجى إدخال اسم المستخدم');
      return;
    }
    if (!email.trim()) {
      setError('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (password.length < 12) {
      setError('يجب أن تكون كلمة المرور 12 حرفاً على الأقل');
      return;
    }

    setLoading(true);

    try {
      await signup(companyName.trim(), name.trim(), email.trim(), password);
      notify.success('تم تسجيل الحساب بنجاح', 'مرحباً بك في سند ذكي');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'فشل التسجيل. يرجى التحقق من البيانات والمحاولة لاحقاً.';
      setError(message);
      notify.error('خطأ في التسجيل', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface-0">
      {/* LEFT BRANDING PANEL */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center p-12"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary-950) 0%, var(--color-primary-800) 100%)',
        }}
      >
        {/* Background Image Hero */}
        <img
          src={loginHero}
          alt="Branding Hero"
          className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-overlay pointer-events-none select-none"
        />
        <div
          className="absolute -top-24 -end-24 w-96 h-96 rounded-full opacity-[0.07]"
          style={{ backgroundColor: 'var(--color-primary-400)' }}
        />
        <div
          className="absolute -bottom-32 -start-32 w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{ backgroundColor: 'var(--color-primary-300)' }}
        />
        <div
          className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.03]"
          style={{ backgroundColor: 'var(--color-primary-200)' }}
        />

        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-8 shadow-lg border border-white/10">
            <span className="text-white text-4xl font-bold leading-none">س</span>
          </div>

          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
            {t('app.name')}
          </h1>

          <p className="text-lg text-white/70 leading-relaxed">
            ابتدئ أتمتة عملياتك المالية اليوم واحصل على حماية ذكية ومطابقة بنكية فورية.
          </p>

          <div className="mt-12 grid grid-cols-5 gap-3 opacity-20">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-white" />
            ))}
          </div>
        </div>
      </motion.div>

      {/* RIGHT SIGNUP FORM PANEL */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12"
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--color-primary-700)' }}
            >
              <span className="text-white text-2xl font-bold">س</span>
            </div>
            <h2 className="text-xl font-bold text-content-primary">
              {t('app.name')}
            </h2>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-content-primary">
              إنشاء حساب جديد
            </h2>
            <p className="text-sm text-content-secondary mt-1.5">
              انضم إلينا لتهيئة شركتك وأتمتة مراجعة الفواتير
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2.5 p-3.5 mb-6 rounded-lg bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800"
              role="alert"
            >
              <AlertCircle
                size={18}
                className="text-danger-600 shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm text-danger-700 dark:text-danger-400">
                {error}
              </p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <Input
              label="اسم الشركة"
              type="text"
              icon={Building}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="مثال: شركة الحلول البرمجية"
              required
              disabled={loading}
              aria-label="اسم الشركة"
            />

            <Input
              label="الاسم الكامل"
              type="text"
              icon={User}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد الحربي"
              required
              disabled={loading}
              aria-label="الاسم الكامل"
            />

            <Input
              label="البريد الإلكتروني للعمل"
              type="email"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
              disabled={loading}
              aria-label="البريد الإلكتروني"
            />

            <div className="relative flex flex-col gap-1.5">
              <Input
                label={t('auth.password')}
                type={showPassword ? 'text' : 'password'}
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل 12 حرفاً على الأقل"
                autoComplete="new-password"
                required
                disabled={loading}
                aria-label={t('auth.password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-3 top-[38px] text-content-tertiary hover:text-content-primary transition-colors p-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              className="mt-2"
            >
              {loading ? 'جاري تهيئة الحساب...' : 'إنشاء الحساب والبدء'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm text-content-secondary">
              لديك حساب بالفعل؟{' '}
            </span>
            <Link
              to="/login"
              className="text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
            >
              تسجيل الدخول
            </Link>
          </div>

          <div className="mt-10 pt-6 border-t border-border text-center">
            <p className="text-xs text-content-tertiary">
              © {new Date().getFullYear()} {t('app.name')}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
