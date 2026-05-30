import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sparkles, UserPlus, LogIn, Mail, ChevronRight, X } from 'lucide-react';

interface GoogleAuthButtonProps {
  onSuccess: (token: string, email: string, name: string) => void;
  onError: (error: string) => void;
  label?: string;
  loading?: boolean;
}

export function GoogleAuthButton({ onSuccess, onError, label = 'الدخول بواسطة جوجل', loading = false }: GoogleAuthButtonProps) {
  const [showSimModal, setShowSimModal] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  const handleTriggerAuth = () => {
    if (loading) return;

    if (googleClientId) {
      // Real Google Identity Services Flow
      try {
        const client = window.google?.accounts?.oauth2?.initTokenClient({
          client_id: googleClientId,
          scope: 'email profile openid',
          callback: (response: any) => {
            if (response.error) {
              onError(response.error_description || 'فشل تسجيل الدخول من جوجل');
              return;
            }
            if (response.id_token) {
              onSuccess(response.id_token, '', '');
            } else if (response.access_token) {
              // Standard OAuth Token Info verification (if ID token is not direct)
              onSuccess(response.access_token, '', '');
            } else {
              onError('لا يوجد رمز تعريف JWT من خدمات جوجل');
            }
          },
        });
        if (client) {
          client.requestAccessToken();
        } else {
          // If library not fully loaded, fallback to OneTap or direct popup
          onError('جاري تحميل مكتبة جوجل للتحقق، يرجى المحاولة بعد قليل.');
        }
      } catch (err) {
        console.error('Google OAuth init error:', err);
        onError('حدث خطأ أثناء الاتصال بخدمة Google Identity.');
      }
    } else {
      // Simulation flow (For Developer environment wow-factor)
      setShowSimModal(true);
    }
  };

  const handleSelectMock = (email: string, name: string) => {
    const mockPayload = { email, name };
    // Prefix the mock token with mock-google-token- and encode payload in Base64
    const token = 'mock-google-token-' + btoa(JSON.stringify(mockPayload));
    setShowSimModal(false);
    onSuccess(token, email, name);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    const finalName = customName.trim() || customEmail.split('@')[0];
    handleSelectMock(customEmail.trim().toLowerCase(), finalName);
  };

  const mockUsers = [
    { email: 'platform-admin@sanad.local', name: 'مدير المنصة (SANAD_ADMIN)', role: 'Platform Admin', desc: 'صلاحيات تشغيل وإدارة المنصة والشركات' },
    { email: 'admin@company.local', name: 'مدير المنشأة (ADMIN)', role: 'Company Owner', desc: 'إدارة الفواتير والتحقق والمطابقة بالكامل' },
    { email: 'cfo@company.local', name: 'المدير المالي (CFO)', role: 'Finance Manager', desc: 'مراجعة التقارير ومطابقة البنك والتحصيل' },
    { email: 'accountant@company.local', name: 'المحاسب (ACCOUNTANT)', role: 'Accountant', desc: 'رفع الفواتير، التحقق الذكي وإدارة الحسابات' },
  ];

  return (
    <>
      <ButtonGoogle onClick={handleTriggerAuth} label={label} loading={loading} />

      {/* Developer Sandbox simulation modal */}
      <AnimatePresence>
        {showSimModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSimModal(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg bg-surface-elevation border border-border rounded-3xl shadow-2xl overflow-hidden text-start dir-rtl font-sans"
            >
              {/* Header */}
              <div className="p-6 border-b border-border bg-gradient-to-l from-primary-900/10 via-transparent to-transparent flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-950/30 flex items-center justify-center">
                    <Sparkles className="text-primary-600 dark:text-primary-400 w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-content-primary">
                      محاكاة تسجيل الدخول بجوجل
                    </h3>
                    <p className="text-xs text-content-tertiary">
                      بيئة تجريبية معزولة لمحاكاة التدفق الحقيقي لـ Google OAuth
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSimModal(false)}
                  className="p-1.5 hover:bg-surface-hover rounded-full transition-colors text-content-tertiary hover:text-content-primary"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[380px] overflow-y-auto space-y-4">
                {!showCustomInput ? (
                  <>
                    <div className="text-xs text-content-secondary bg-primary-50 dark:bg-primary-950/20 border border-primary-100 dark:border-primary-900/40 p-3.5 rounded-2xl flex items-center gap-2.5">
                      <Shield className="text-primary-600 shrink-0" size={16} />
                      <span>
                        اختر أحد الحسابات المهيأة مسبقاً لتجربة فورية للأدوار والصلاحيات:
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {mockUsers.map((user) => (
                        <button
                          key={user.email}
                          onClick={() => handleSelectMock(user.email, user.name.split(' (')[0])}
                          className="w-full p-4 rounded-2xl border border-border hover:border-primary-500 bg-surface-card hover:bg-primary-50/10 dark:hover:bg-primary-950/10 transition-all flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-primary-600">
                              {user.name[0]}
                            </div>
                            <div className="text-start">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-content-primary">
                                  {user.name}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-medium text-content-secondary">
                                  {user.role}
                                </span>
                              </div>
                              <span className="text-xs text-content-tertiary block mt-0.5">
                                {user.desc}
                              </span>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-content-tertiary group-hover:text-primary-600 group-hover:translate-x-[-4px] transition-all" />
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setShowCustomInput(true)}
                      className="w-full py-3.5 border border-dashed border-border hover:border-primary-500 rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-content-secondary hover:text-primary-600 transition-colors"
                    >
                      <UserPlus size={16} />
                      <span>استخدام بريد إلكتروني جديد (تجربة التسجيل والـ Provisioning)</span>
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleCustomSubmit} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-content-primary">
                        التسجيل بحساب جديد
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowCustomInput(false)}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        العودة للحسابات الافتراضية
                      </button>
                    </div>

                    <div className="space-y-3.5">
                      <div>
                        <label className="text-xs text-content-secondary block mb-1.5 font-medium">
                          البريد الإلكتروني المهني
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            required
                            placeholder="user@gmail.com"
                            value={customEmail}
                            onChange={(e) => setCustomEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl border border-border bg-surface-card focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm text-content-primary"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-content-secondary block mb-1.5 font-medium">
                          الاسم الكامل للمستخدم
                        </label>
                        <input
                          type="text"
                          placeholder="فيصل العنزي"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl border border-border bg-surface-card focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm text-content-primary"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"
                    >
                      <LogIn size={16} />
                      <span>تسجيل ومتابعة عملية إنشاء المنشأة</span>
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function ButtonGoogle({ onClick, label, loading }: { onClick: () => void; label: string; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full h-12 border border-border hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600 bg-surface-card hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl flex items-center justify-center gap-3 text-sm font-semibold text-content-secondary hover:text-content-primary shadow-sm hover:shadow transition-all relative overflow-hidden active:scale-[0.98]"
    >
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
      </svg>
      <span>{label}</span>
      {loading && (
        <span className="absolute inset-0 bg-white/20 dark:bg-black/20 flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 text-content-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </span>
      )}
    </button>
  );
}

// Google accounts configuration interface helper declarations
declare global {
  interface Window {
    google: any;
  }
}
