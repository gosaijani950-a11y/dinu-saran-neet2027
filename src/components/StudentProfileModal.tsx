import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  User, X, Flame, ShieldCheck, Lock, RefreshCw, CheckCircle2, AlertCircle
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  student: StudentProfile | null;
  streak: number;
  settings: AppSettings;
}

const REGISTRY_LOCAL_KEY = 'dinu_neet2027_full_profile_v2';

export const StudentProfileModal: React.FC<Props> = ({
  isOpen, onClose, student, streak, settings
}) => {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [resetTarget, setResetTarget] = useState<'security' | 'secret' | null>(null);

  // Verification Inputs
  const [vName, setVName] = useState('');
  const [vUser, setVUser] = useState('');
  const [vMobile, setVMobile] = useState('');
  const [vGender, setVGender] = useState('Male');
  const [vDob, setVDob] = useState('');
  const [vOtherCode, setVOtherCode] = useState('');

  // Verified state & New PIN inputs
  const [verified, setVerified] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [confirmNewCode, setConfirmNewCode] = useState('');
  const [msg, setMsg] = useState<{ type: 'err' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setResetTarget(null);
    setVerified(false);
    setMsg(null);
    try {
      const saved = JSON.parse(localStorage.getItem(REGISTRY_LOCAL_KEY) || '{}');
      setProfile({
        full_name: saved.full_name || student?.full_name || 'NEET Aspirant',
        username: saved.username || (student as any)?.username || '@aspirant',
        mobile: saved.mobile || (student as any)?.mobile || '',
        gender: saved.gender || (student as any)?.gender || 'Male',
        dob: saved.dob || (student as any)?.dob || '',
        security_code: saved.security_code || localStorage.getItem('dinu_neet2027_app_security_pin_v1') || '',
        secret_code: saved.secret_code || localStorage.getItem('dinu_neet2027_secret_pin_v1') || '',
      });
    } catch {}
  }, [isOpen, student]);

  if (!isOpen) return null;

  const startReset = (target: 'security' | 'secret') => {
    setResetTarget(target);
    setVerified(false);
    setVName('');
    setVUser('');
    setVMobile('');
    setVGender('Male');
    setVDob('');
    setVOtherCode('');
    setNewCode('');
    setConfirmNewCode('');
    setMsg(null);
  };

  const handleVerifyIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    const normHandle = '@' + vUser.trim().toLowerCase().replace(/^@+/, '');
    const requiredCode = resetTarget === 'security' ? profile.secret_code : profile.security_code;

    const isMatch =
      vName.trim().toLowerCase() === profile.full_name.trim().toLowerCase() &&
      normHandle === profile.username.trim().toLowerCase() &&
      vMobile.replace(/\D/g, '') === profile.mobile.replace(/\D/g, '') &&
      vGender === profile.gender &&
      vDob === profile.dob &&
      vOtherCode.trim() === requiredCode;

    if (!isMatch) {
      setMsg({
        type: 'err',
        text: `जानकारी मैच नहीं हुई! सभी फ़ील्ड और ${resetTarget === 'security' ? 'Secret Code' : 'Security Code'} सही भरें।`,
      });
      return;
    }
    setVerified(true);
    setMsg(null);
  };

  const handleSaveNewCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(newCode)) return setMsg({ type: 'err', text: '4 से 6 अंकों का नंबर कोड डालें।' });
    if (newCode !== confirmNewCode) return setMsg({ type: 'err', text: 'Confirm Code मैच नहीं हुआ!' });

    const updated = {
      ...profile,
      ...(resetTarget === 'security' ? { security_code: newCode } : { secret_code: newCode }),
    };
    setProfile(updated);

    try {
      localStorage.setItem(REGISTRY_LOCAL_KEY, JSON.stringify(updated));
      if (resetTarget === 'security') {
        localStorage.setItem('dinu_neet2027_app_security_pin_v1', newCode);
      } else {
        localStorage.setItem('dinu_neet2027_secret_pin_v1', newCode);
      }

      const env = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
      const u = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
      const k = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (u && k && updated.username) {
        const sb = createClient(u, k);
        await sb
          .from('student_registry')
          .update(resetTarget === 'security' ? { security_code: newCode } : { secret_code: newCode })
          .eq('username', updated.username);
      }
    } catch {}

    setResetTarget(null);
    setVerified(false);
    setMsg({ type: 'ok', text: `${resetTarget === 'security' ? 'Security Code' : 'Secret Code'} सफलतापूर्वक अपडेट हो गया!` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-extrabold text-white">My Student Profile</h3>
              <p className="text-[10px] text-amber-300 font-bold">{profile.username}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
          {/* Streak Banner */}
          <div className="flex items-center justify-between rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
            <div>
              <p className="text-[11px] font-bold text-orange-300">Active Study Streak</p>
              <p className="text-lg font-extrabold text-white">{streak} Days 🔥</p>
            </div>
            <Flame className="w-8 h-8 text-orange-400" />
          </div>

          {/* Personal Info Card */}
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">Name:</span><span className="font-bold">{profile.full_name}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Username:</span><span className="font-bold text-amber-300">{profile.username}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Mobile:</span><span className="font-bold">{profile.mobile || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Gender:</span><span className="font-bold">{profile.gender}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">DOB:</span><span className="font-bold">{profile.dob || '—'}</span></div>
          </div>

          {/* Reset Buttons */}
          {!resetTarget && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => startReset('security')}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/20 py-2.5 text-[11px] font-extrabold text-indigo-300 hover:bg-indigo-600/30"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Security Code
              </button>
              <button
                type="button"
                onClick={() => startReset('secret')}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/20 py-2.5 text-[11px] font-extrabold text-amber-300 hover:bg-amber-500/30"
              >
                <Lock className="w-3.5 h-3.5" /> Reset Secret Code
              </button>
            </div>
          )}

          {/* Cross-Verification Reset Panel */}
          {resetTarget && !verified && (
            <form onSubmit={handleVerifyIdentity} className="space-y-2.5 rounded-2xl border border-slate-700 bg-slate-950 p-3.5">
              <p className="text-xs font-extrabold text-amber-300">
                Verify Identity to Reset {resetTarget === 'security' ? 'Security Code' : 'Secret Code'}
              </p>
              <input type="text" required value={vName} onChange={(e) => setVName(e.target.value)} placeholder="पूरा नाम (Full Name)" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs" />
              <input type="text" required value={vUser} onChange={(e) => setVUser(e.target.value)} placeholder="@username" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs" />
              <input type="tel" required maxLength={10} value={vMobile} onChange={(e) => setVMobile(e.target.value)} placeholder="10-Digit Mobile Number" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <select value={vGender} onChange={(e) => setVGender(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs">
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                <input type="date" required value={vDob} onChange={(e) => setVDob(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs" />
              </div>
              <input
                type="password"
                inputMode="numeric"
                required
                value={vOtherCode}
                onChange={(e) => setVOtherCode(e.target.value)}
                placeholder={resetTarget === 'security' ? 'अपना पुराना Secret Code डालें *' : 'अपना पुराना Security Code डालें *'}
                className="w-full rounded-xl border border-amber-500/40 bg-slate-900 px-3 py-2 text-xs text-amber-300"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetTarget(null)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-extrabold text-white">Verify & Continue</button>
              </div>
            </form>
          )}

          {resetTarget && verified && (
            <form onSubmit={handleSaveNewCode} className="space-y-2.5 rounded-2xl border border-emerald-500/40 bg-slate-950 p-3.5">
              <p className="flex items-center gap-1 text-xs font-extrabold text-emerald-400">
                <ShieldCheck className="w-4 h-4" /> Verified! Set New {resetTarget === 'security' ? 'Security Code' : 'Secret Code'}
              </p>
              <input type="password" inputMode="numeric" maxLength={6} required value={newCode} onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ''))} placeholder="New 4-6 Digit Code" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs tracking-widest" />
              <input type="password" inputMode="numeric" maxLength={6} required value={confirmNewCode} onChange={(e) => setConfirmNewCode(e.target.value.replace(/\D/g, ''))} placeholder="Confirm New Code" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs tracking-widest" />
              <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-extrabold text-white">Save New Code</button>
            </form>
          )}

          {msg && (
            <p className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${msg.type === 'err' ? 'bg-rose-950/80 text-rose-300' : 'bg-emerald-950/80 text-emerald-300'}`}>
              {msg.type === 'err' ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
