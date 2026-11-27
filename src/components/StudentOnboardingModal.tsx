import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  UserCheck, ShieldCheck, Lock, CheckCircle2, AlertCircle,
  Loader2, Sparkles, ArrowRight, ArrowLeft
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
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [dob, setDob] = useState('');

  const [securityCode, setSecurityCode] = useState('');
  const [confirmSecurityCode, setConfirmSecurityCode] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [confirmSecretCode, setConfirmSecretCode] = useState('');

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const getSb = () => {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
      const u = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || 'https://twcpuqcgowjwmkruohqw.supabase.co').trim();
      const k = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
      return u && k && u.startsWith('http') ? createClient(u, k) : null;
    } catch {
      return null;
    }
  };

  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const cleanMob = mobile.replace(/\D/g, '').slice(0, 10);

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
          return setError(`@${cleanUser} पहले से किसी यूज़र ने ले लिया है, कोई दूसरा यूनिक नाम चुनें।`);
        }
        const { data: mHit } = await sb
          .from('student_registry')
          .select('mobile')
          .eq('mobile', cleanMob)
          .maybeSingle();
        if (mHit) {
          setChecking(false);
          return setError('यह मोबाइल नंबर पहले से रजिस्टर्ड है।');
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
        // Supabase में केवल 4 आवश्यक फ़ील्ड सेव होंगे
        await sb.from('student_registry').upsert([
          {
            username: formattedHandle,
            mobile: cleanMob,
            security_code: securityCode,
            secret_code: secretCode,
          },
        ]);
      }

      const fullLocalData = {
        id: `stu_${cleanUser}_${cleanMob.slice(-4)}`,
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
            <span className="text-[11px] font-bold text-slate-400">Step {step} of 2</span>
          </div>
          <h2 className="mt-2 text-base font-extrabold text-white">
            {step === 1 ? 'Student Profile Registration' : 'Dual Security & Secret PIN Setup'}
          </h2>
          <p className="text-[11px] text-slate-400">
            {step === 1
              ? 'आगे बढ़ने के लिए अपनी सभी जानकारी भरें (सभी फ़ील्ड अनिवार्य हैं)।'
              : 'अपना App Security Code और Secret Chat Code अलग-अलग सेट व कन्फ़र्म करें।'}
          </p>
        </div>

        {step === 1 ? (
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
                disabled={checking || securityCode !== confirmSecurityCode || secretCode !== confirmSecretCode || securityCode.length < 4 || secretCode.length < 4}
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
