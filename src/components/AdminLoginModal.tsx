import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CloudCog, Loader2, Lock, Mail, ShieldCheck, X } from 'lucide-react';
import type { AppSettings } from '../types';
import { isSupabaseConfigured, signInAsAdmin } from '../services/supabaseService';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onOpenCloudSetup: () => void;
  onLoginSuccess: (email: string) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  settings,
  onOpenCloudSetup,
  onLoginSuccess,
  onToast,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const configured = isSupabaseConfigured(settings);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await signInAsAdmin(settings, email, password);
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }
      setPassword('');
      await onLoginSuccess(res.email);
      onClose();
      onToast(`Admin Mode unlocked (${res.email}).`, 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Admin Login"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-[#E2E8F0] dark:border-white/[0.08] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#10B981]/14 text-[#10B981] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                    Admin Authentication
                  </h2>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    Verified via Supabase Auth &amp; public.admins
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Admin Login"
                className="w-7 h-7 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3">
              {!configured && (
                <div className="rounded-xl p-3 bg-amber-500/12 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      Link your Supabase URL &amp; Anon Key first under{' '}
                      <strong>Cloud &amp; Admin Setup</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCloudSetup();
                    }}
                    className="w-full h-8 rounded-lg bg-[#F59E0B] hover:bg-amber-600 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CloudCog className="w-3.5 h-3.5" />
                    Open Cloud &amp; SQL Setup
                  </button>
                </div>
              )}

              <div className="space-y-1">
                <label
                  htmlFor="admin-login-email"
                  className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                >
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                    className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#10B981]/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="admin-login-password"
                  className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#10B981]/50"
                  />
                </div>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-lg px-3 py-2 bg-rose-500/12 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="pt-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCloudSetup();
                  }}
                  className="text-[11px] font-semibold text-[#64748B] hover:text-[#6366F1] inline-flex items-center gap-1 cursor-pointer"
                >
                  <CloudCog className="w-3.5 h-3.5" />
                  Cloud &amp; SQL Setup
                </button>
                <button
                  type="submit"
                  disabled={loading || !configured}
                  className="h-8.5 px-4 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Verify &amp; Unlock
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
