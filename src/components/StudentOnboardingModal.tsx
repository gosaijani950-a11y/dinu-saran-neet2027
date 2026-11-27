import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  UserCheck, ShieldCheck, Lock, CheckCircle2, AlertCircle,
  Loader2, Sparkles, ArrowRight, ArrowLeft, LogIn, UserPlus
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';

interface Props {
  isOpen: boolean;
  onComplete: (profile: StudentProfile) => void;
  settings?: AppSettings;
}

const REGISTRY_LOCAL_KEY = 'dinu_neet2027_full_profile_v2';

export const StudentOnboardingModal: React.FC<Props> = ({
  isOpen,
  onComplete,
  settings,
}) => {
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [step, setStep] = useState<1 | 2>(1);

  // Registration states
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [dob, setDob] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [confirmSecurityCode, setConfirmSecurityCode] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [confirmSecretCode, setConfirmSecretCode] = useState('');

  // Existing User Login states
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginSecurityPin, setLoginSecurityPin] = useState('');

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const getSb = () => {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
      const u = String(
        settings?.supabaseUrl || env.VITE_SUPABASE_URL || 'https://twcpuqcgowjwmkruohqw.supabase.co'
      ).trim();
      const k = String(
        settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_5JxNjgYP025of9f0LTusBw_FqHHrzmn'
      ).trim();
      return u && k && u.startsWith('http') ? createClient(u, k) : null;
    } catch {
      return null;
    }
  };

  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const cleanMob = mobile.replace(/\D/g, '').slice(0, 10);

  /* ==================== EXISTING USER LOGIN (ANY DEVICE) ==================== */
  const handleExistingLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const rawId = loginIdentifier.trim().toLowerCase();
    const pin = loginSecurityPin.trim();
    if (!rawId) return setError('अपना @username या 10-अंकों का मोबाइल नंबर डालें।');
    if (!/^\d{4,6}$/.test(pin)) return setError('4 से 6 अंकों का Security Code डालें।');

    setChecking(true);
    try {
      const sb = getSb();
      if (!sb) {
        setChecking(false);
        return setError('इंटरनेट कनेक्शन जांचें और पुनः प्रयास करें।');
      }

      const isMobile = /^\d{10}$/.test(rawId.replace(/\D/g, ''));
      const queryCol = isMobile ? 'mobile' : 'username';
      const queryVal = isMobile
        ? rawId.replace(/\D/g, '')
        : rawId.startsWith('@')
        ? rawId
        : `@${rawId.replace(/[^a-z0-9_]/g, '')}`;

      const { data: userRow, error: fetchErr } = await sb
        .from('student_registry')
        .select('*')
        .eq(queryCol, queryVal)
        .maybeSingle();

      if (fetchErr || !userRow) {
        setChecking(false);
        return setError('यह @username या मोबाइल नंबर रजिस्टर्ड नहीं है।');
      }

      if (String(userRow.security_code) !== pin) {
        setChecking(false);
        return setError('गलत Security Code! अपना सही कोड डालें।');
      }

      const restoredHandle = String(userRow.username);
      const restoredMob = String(userRow.mobile);
      const restoredSecCode = String(userRow.security_code);
      const restoredSecretCode = String(userRow.secret_code);
      const restoredName = String(userRow.full_name || restoredHandle.replace('@', '').toUpperCase());

      const restoredProfile = {
        id: `stu_${restoredHandle.replace('@', '')}_${restoredMob.slice(-4)}`,
        name: restoredName,
        full_name: restoredName,
        username: restoredHandle,
        mobile: restoredMob,
        gender: 'Other',
        dob: '',
        security_code: restoredSecCode,
        secret_code: restoredSecretCode,
        created_at: new Date().toISOString(),
      };

      try {
        localStorage.setItem(REGISTRY_LOCAL_KEY, JSON.stringify(restoredProfile));
        localStorage.setItem('dinu_neet2027_secret_pin_v1', restoredSecretCode);
        localStorage.setItem('dinu_neet2027_app_security_pin_v1', restoredSecCode);
      } catch {}

      onComplete(restoredProfile as unknown as StudentProfile);
    } catch {
      setError('लॉगिन में समस्या आई, कृपया दोबारा प्रयास करें।');
    } finally {
      setChecking(false);
    }
  };

  /* ==================== NEW USER REGISTRATION ==================== */
  const handleStep1Next = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (fullName.trim().length < 2) return setError('कृपया अपना पूरा नाम लिखें।');
    if (cleanUser.length < 3) return setError('कम से कम 3 अक्षरों का Unique @username चुनें।');
    if (!/^[6-9]\d{9}$/.test(cleanMob)) return setError('सही 10-अंकों का मोबाइल नंबर डालें।');
    if (!dob) return setError('कृपया अपनी जन्मतिथि (DOB) चुनें।');

    setChecking(true);
    try {
      const sb = getSb();
      if (sb) {
        const { data: uHit } = await sb
          .from('student_registry')
          .select('username')
          .eq('username', `@${cleanUser}`)
          .maybeSingle();
        if (uHit) {
          setChecking(false);
          return setError(`@${cleanUser} पहले से बना हुआ है! यदि यह आपकी ID है, तो ऊपर "Existing Login" टैब से लॉगिन करें।`);
        }

        const { data: mHit } = await sb
          .from('student_registry')
          .select('mobile')
          .eq('mobile', cleanMob)
          .maybeSingle();
        if (mHit) {
          setChecking(false);
          return setError('यह मोबाइल नंबर पहले से रजिस्टर्ड है! ऊपर "Existing Login" टैब से लॉगिन करें।');
        }
      }
      setStep(2);
    } catch {
      setStep(2);
    } finally {
      setChecking(false);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,6}$/.test(securityCode)) {
      return setError('App Security Code 4 से 6 अंकों का नंबर होना चाहिए।');
    }
    if (securityCode !== confirmSecurityCode) {
      return setError('Confirm Security Code मैच नहीं हुआ!');
    }
    if (!/^\d{4,6}$/.test(secretCode)) {
      return setError('Secret Chat Code 4 से 6 अंकों का नंबर होना चाहिए।');
    }
    if (secretCode !== confirmSecretCode) {
      return setError('Confirm Secret Code मैच नहीं हुआ!');
    }

    setChecking(true);
    const formattedHandle = `@${cleanUser}`;
    try {
      const sb = getSb();
      if (sb) {
        await sb.from('student_registry').upsert([
          {
            username: formattedHandle,
            full_name: fullName.trim(),
            mobile: cleanMob,
            security_code: securityCode,
            secret_code: secretCode,
          },
        ]);
      }

      const fullLocalData = {
        id: `stu_${cleanUser}_${cleanMob.slice(-4)}`,
        name: fullName.trim(),
        full_name: fullName.trim(),
        username: formattedHandle,
        mobile: cleanMob,
        gender,
        dob,
        security_code: securityCode,
        secret_code: secretCode,
        created_at: new Date().toISOString(),
      };

      try {
        localStorage.setItem(REGISTRY_LOCAL_KEY, JSON.stringify(fullLocalData));
        localStorage.setItem('dinu_neet2027_secret_pin_v1', secretCode);
        localStorage.setItem('dinu_neet2027_app_security_pin_v1', securityCode);
      } catch {}

      onComplete(fullLocalData as unknown as StudentProfile);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-md">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="border-b border-slate-800 bg-slate-950 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-extrabold text-amber-300">
              <Sparkles className="w-3 h-3" /> DINU SARAN • NEET 2027
            </span>
            {authMode === 'register' && (
              <span className="text-[11px] font-bold text-slate-400">Step {step} of 2</span>
            )}
          </div>

          {/* Mode Switcher: New Registration vs Existing User Login */}
          <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition ${
                authMode === 'register'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> New Registration
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setError(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition ${
                authMode === 'login'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" /> Existing Login
            </button>
          </div>
        </div>

        {authMode === 'login' ? (
          <form onSubmit={handleExistingLogin} className="space-y-3.5 p-5">
            <p className="text-[11px] text-slate-400">
              किसी भी फ़ोन में लॉगिन करने के लिए अपना रजिस्टर्ड <strong className="text-amber-300">@username</strong> (या मोबाइल नंबर) और <strong className="text-indigo-300">Security Code</strong> डालें।
            </p>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-300">
                Registered @username or 10-Digit Mobile *
              </label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="@dinu_neet27 या 98XXXXXXXX"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-300">
                App Security Code (4-6 Digits) *
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={loginSecurityPin}
                onChange={(e) => setLoginSecurityPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-center text-sm font-extrabold tracking-widest text-emerald-300 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {error && (
              <p className="flex items-center gap-1.5 rounded-xl bg-rose-950/70 px-3 py-2 text-[11px] font-semibold text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={checking}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserCheck className="w-4 h-4" /> Login to My Account</>}
            </button>
          </form>
        ) : step === 1 ? (
          <form onSubmit={handleStep1Next} className="space-y-3 p-5">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-300">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="जैसे: Dinu Saran"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-300">
                Unique Username (@id) *
              </label>
              <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950 px-3">
                <span className="text-xs font-extrabold text-amber-400">@</span>
                <input
                  type="text"
                  required
                  value={cleanUser}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="dinu_neet27"
                  className="w-full bg-transparent px-1.5 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-300">
                10-Digit Mobile Number *
              </label>
              <input
                type="tel"
                inputMode="numeric"
                required
                maxLength={10}
                value={cleanMob}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="98XXXXXXXX"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-300">Gender *</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-300">Date of Birth *</label>
                <input
                  type="date"
                  required
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-1.5 rounded-xl bg-rose-950/70 px-3 py-2 text-[11px] font-semibold text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={checking}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Next: Set Security Codes <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleFinalSubmit} className="space-y-3 p-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <p className="flex items-center gap-1 text-[11px] font-extrabold text-indigo-300">
                <ShieldCheck className="w-3.5 h-3.5" /> 1. Profile Security Code (4-6 Digits)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={securityCode}
                  onChange={(e) => setSecurityCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="New Code"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs font-bold tracking-widest text-white"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={confirmSecurityCode}
                  onChange={(e) => setConfirmSecurityCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Confirm Code"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs font-bold tracking-widest text-white"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/25 bg-slate-950/60 p-3 space-y-2">
              <p className="flex items-center gap-1 text-[11px] font-extrabold text-amber-300">
                <Lock className="w-3.5 h-3.5" /> 2. Secret Chat Vault Code (अलग या सेम रख सकते हैं)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={secretCode}
                  onChange={(e) => setSecretCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Secret Code"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs font-bold tracking-widest text-amber-300"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={confirmSecretCode}
                  onChange={(e) => setConfirmSecretCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Confirm Secret"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs font-bold tracking-widest text-amber-300"
                />
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-1.5 rounded-xl bg-rose-950/70 px-3 py-2 text-[11px] font-semibold text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setStep(1); setError(''); }}
                className="inline-flex items-center justify-center gap-1 rounded-2xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-300"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="submit"
                disabled={
                  checking ||
                  securityCode !== confirmSecurityCode ||
                  secretCode !== confirmSecretCode ||
                  securityCode.length < 4 ||
                  secretCode.length < 4
                }
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Complete & Enter App</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
