import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Lock, X, Send, Mic, Square, RotateCcw, Users, UserPlus,
  MessageSquareLock, Ban, Unlock, BookOpen, Eye, EyeOff,
  AlertCircle, Loader2, ShieldAlert
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';
import { formatNeetExamText, NCERT_ACTIVE_RECALL_CARDS } from '../utils/neetEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentStudent: StudentProfile | null;
  settings: AppSettings;
  onRequireLogin: () => void;
}

interface Msg {
  id: string;
  channel_key: string;
  sender_id: string;
  sender_name: string;
  sender_username: string;
  text: string;
  audio_data?: string | null;
  status: 'sent' | 'stuck';
}

const PIN_K = 'dinu_neet2027_secret_pin_v1';
const GRP_K = 'dinu_neet2027_my_private_group_v1';
const BLK_K = 'dinu_neet2027_personal_blocks_v1';
const QUE_K = 'dinu_neet2027_secret_outbox_v1';

export const SecretVaultModal: React.FC<Props> = ({
  isOpen, onClose, currentStudent, settings, onRequireLogin
}) => {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [savedPin, setSavedPin] = useState('');
  const [tab, setTab] = useState<'dm' | 'group' | 'ncert' | 'blocked'>('dm');
  const [peer, setPeer] = useState('');
  const [dmChannel, setDmChannel] = useState('');
  const [group, setGroup] = useState<{ code: string; name: string } | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [blocked, setBlocked] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [queue, setQueue] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const [shown, setShown] = useState<Record<string, boolean>>({});

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUnlocked(false);
    setPin('');
    setErr('');
    try {
      const pPin = (currentStudent as any)?.security_pin;
      setSavedPin(typeof pPin === 'string' && pPin.trim() ? pPin.trim() : (localStorage.getItem(PIN_K) || '').trim());
      const g = localStorage.getItem(GRP_K); if (g) setGroup(JSON.parse(g));
      const b = localStorage.getItem(BLK_K); if (b) setBlocked(JSON.parse(b));
      const q = localStorage.getItem(QUE_K); if (q) setQueue(JSON.parse(q));
    } catch {}
  }, [isOpen, currentStudent]);

  const uid = String(currentStudent?.id || 'guest');
  const uname = String(currentStudent?.full_name || (currentStudent as any)?.name || 'NEET Student');
  const handle = '@' + String((currentStudent as any)?.username || uname.toLowerCase().replace(/[^a-z0-9]/g, '') || 'aspirant').replace(/^@+/, '');
  const channel = tab === 'dm' ? dmChannel : tab === 'group' && group?.code ? `grp_${group.code}` : '';

  const sb = () => {
    try {
      const env = (import.meta as any)?.env || {};
      const u = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
      const k = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
      return u && k ? createClient(u, k) : null;
    } catch { return null; }
  };

  useEffect(() => {
    if (!isOpen || !unlocked || !channel) return;
    const localStuck = queue.filter((m) => m.channel_key === channel);
    const client = sb();
    if (!client) { setMsgs(localStuck); return; }
    client.from('secret_messages').select('*').eq('channel_key', channel).order('created_at', { ascending: true }).limit(50)
      .then(({ data }) => setMsgs([...(Array.isArray(data) ? data.map((r: any) => ({ ...r, status: 'sent' as const })) : []), ...localStuck]))
      .catch(() => setMsgs(localStuck));
  }, [isOpen, unlocked, channel, queue]);

  if (!isOpen) return null;

  const checkPin = (e: React.FormEvent) => {
    e.preventDefault();
    const c = pin.trim();
    if (c.length < 4) return setErr('कम से कम 4 अंकों का PIN डालें।');
    if (!savedPin) {
      try { localStorage.setItem(PIN_K, c); } catch {}
      setSavedPin(c); setUnlocked(true); setErr(''); return;
    }
    if (c === savedPin) { setUnlocked(true); setErr(''); }
    else setErr('गलत PIN! सही PIN डालें।');
  };

  const openDm = (e: React.FormEvent) => {
    e.preventDefault();
    const p = peer.trim().toLowerCase().replace(/^@+/, '');
    if (!p) return;
    if (blocked.includes(`@${p}`)) return setErr(`@${p} ब्लॉक है।`);
    setDmChannel(`dm_${[handle.slice(1).toLowerCase(), p].sort().join('__')}`);
  };

  const createGrp = (e: React.FormEvent) => {
    e.preventDefault();
    if (group) return;
    const g = { code: Math.floor(100000 + Math.random() * 900000).toString(), name: groupName.trim() || `${uname}'s Group` };
    setGroup(g); try { localStorage.setItem(GRP_K, JSON.stringify(g)); } catch {} setGroupName('');
  };

  const joinGrp = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return;
    const g = { code, name: `Private Group #${code}` };
    setGroup(g); try { localStorage.setItem(GRP_K, JSON.stringify(g)); } catch {} setJoinCode('');
  };

  const pushMsg = async (draft: Msg) => {
    const client = sb();
    const saveStuck = () => {
      const stuck: Msg = { ...draft, status: 'stuck' };
      const nq = [...queue.filter((x) => x.id !== draft.id), stuck];
      setQueue(nq); try { localStorage.setItem(QUE_K, JSON.stringify(nq)); } catch {}
      setMsgs((p) => [...p.filter((x) => x.id !== draft.id), stuck]);
    };
    if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) return saveStuck();
    try {
      const { error } = await client.from('secret_messages').insert([{
        channel_key: draft.channel_key, sender_id: draft.sender_id, sender_name: draft.sender_name,
        sender_username: draft.sender_username, text: draft.text, audio_data: draft.audio_data || null
      }]);
      if (error) throw error;
      const nq = queue.filter((x) => x.id !== draft.id);
      setQueue(nq); try { localStorage.setItem(QUE_K, JSON.stringify(nq)); } catch {}
      setMsgs((p) => [...p.filter((x) => x.id !== draft.id), { ...draft, status: 'sent' }]);
    } catch { saveStuck(); }
  };

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !channel || sending) return;
    if (!currentStudent) return onRequireLogin();
    setSending(true);
    const t = text.trim(); setText('');
    await pushMsg({ id: `m_${Date.now()}`, channel_key: channel, sender_id: uid, sender_name: uname, sender_username: handle, text: t, status: 'sent' });
    setSending(false);
  };

  const stopAudio = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    setRec(false);
  };

  const startAudio = async () => {
    if (!channel || rec) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const r = new FileReader();
        r.onloadend = () => pushMsg({
          id: `a_${Date.now()}`, channel_key: channel, sender_id: uid, sender_name: uname, sender_username: handle,
          text: `🎙️ Voice Note (${sec || 1}s)`, audio_data: String(r.result || ''), status: 'sent'
        });
        r.readAsDataURL(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recRef.current = mr; mr.start(); setRec(true); setSec(1);
      timerRef.current = window.setInterval(() => setSec((s) => { if (s >= 15) { stopAudio(); return 15; } return s + 1; }), 1000);
    } catch { setErr('माइक की अनुमति दें।'); }
  };

  const toggleBlk = (h: string) => {
    const n = '@' + h.replace(/^@+/, '').toLowerCase();
    const next = blocked.includes(n) ? blocked.filter((x) => x !== n) : [...blocked, n];
    setBlocked(next); try { localStorage.setItem(BLK_K, JSON.stringify(next)); } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquareLock className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-xs font-extrabold text-white">DINU SARAN • Secret Vault</h3>
              <p className="text-[10px] text-slate-400">{handle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {!unlocked ? (
          <form onSubmit={checkPin} className="flex flex-1 flex-col items-center justify-center space-y-4 p-6 text-center">
            <Lock className="w-10 h-10 text-amber-400" />
            <h4 className="text-base font-extrabold">{savedPin ? 'Enter Security PIN' : 'Set Security PIN'}</h4>
            <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••"
              className="w-44 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-center text-lg font-extrabold tracking-widest text-amber-300" />
            {err && <p className="text-xs text-rose-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {err}</p>}
            <button type="submit" className="rounded-2xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-slate-950">
              {savedPin ? 'Unlock Vault' : 'Save & Enter'}
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] font-bold">
              <button type="button" onClick={() => setTab('dm')} className={`rounded-xl px-2.5 py-1.5 ${tab === 'dm' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Direct Chat</button>
              <button type="button" onClick={() => setTab('group')} className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${tab === 'group' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}><Users className="w-3 h-3" /> Group</button>
              <button type="button" onClick={() => setTab('ncert')} className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${tab === 'ncert' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}><BookOpen className="w-3 h-3" /> NCERT</button>
              <button type="button" onClick={() => setTab('blocked')} className={`ml-auto rounded-xl px-2 py-1.5 ${tab === 'blocked' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Ban className="w-3.5 h-3.5" /></button>
            </div>

            {tab === 'ncert' ? (
              <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                {NCERT_ACTIVE_RECALL_CARDS.map((c) => (
                  <div key={c.id} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex justify-between text-[10px]"><span className="font-bold text-emerald-400">{c.subject}</span><span className="text-slate-400">{c.chapter}</span></div>
                    <p className="text-xs text-slate-100">{formatNeetExamText(c.statementWithBlank)}</p>
                    <div className="flex items-center justify-between">
                      {shown[c.id] ? <span className="text-xs font-extrabold text-emerald-300">उत्तर: {formatNeetExamText(c.answer)}</span> : <span className="text-[11px] text-slate-500">उत्तर छिपा है</span>}
                      <button type="button" onClick={() => setShown((p) => ({ ...p, [c.id]: !p[c.id] }))} className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-indigo-300">
                        {shown[c.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {shown[c.id] ? 'छिपाएं' : 'उत्तर देखें'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : tab === 'blocked' ? (
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                <h4 className="text-xs font-extrabold text-rose-400">Blocked ({blocked.length})</h4>
                {blocked.map((u) => (
                  <div key={u} className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-xs">
                    <span>{u}</span>
                    <button type="button" onClick={() => toggleBlk(u)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold"><Unlock className="w-3 h-3" /> Unblock</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                {tab === 'dm' ? (
                  <form onSubmit={openDm} className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/40 px-3 py-2">
                    <input type="text" value={peer} onChange={(e) => setPeer(e.target.value)} placeholder="@username लिखें..." className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white" />
                    <button type="submit" className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold">Open</button>
                    {peer.trim() && <button type="button" onClick={() => toggleBlk(peer)} className="rounded-xl bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-300">Block</button>}
                  </form>
                ) : !group ? (
                  <div className="space-y-2 border-b border-slate-800 bg-slate-950/40 p-3">
                    <form onSubmit={createGrp} className="flex gap-1.5">
                      <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="1 User = 1 Private Group नाम..." className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white" />
                      <button type="submit" className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold">Create</button>
                    </form>
                    <form onSubmit={joinGrp} className="flex gap-1.5">
                      <input type="text" maxLength={6} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="6-Digit कोड..." className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white" />
                      <button type="submit" className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold"><UserPlus className="w-3.5 h-3.5" /> Join</button>
                    </form>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-b border-slate-800 bg-indigo-950/30 px-3.5 py-2 text-xs">
                    <div><span className="font-extrabold">{group.name}</span> <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">Code: {group.code}</span></div>
                    <button type="button" onClick={() => { setGroup(null); try { localStorage.removeItem(GRP_K); } catch {} }} className="text-[10px] text-rose-400">Leave</button>
                  </div>
                )}

                <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                  {msgs.map((m) => (
                    <div key={m.id} className={`flex max-w-[84%] flex-col ${m.sender_id === uid ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                      <span className="mb-0.5 text-[10px] text-slate-400">{m.sender_id === uid ? 'You' : `${m.sender_name} (${m.sender_username})`}</span>
                      <div className={`rounded-2xl px-3 py-2 text-xs ${m.sender_id === uid ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
                        {m.audio_data ? <audio controls src={m.audio_data} className="h-8 w-48" /> : formatNeetExamText(m.text)}
                      </div>
                      {m.status === 'stuck' && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-400">
                          <ShieldAlert className="w-3 h-3" /> <span>⏳ Stuck (Offline)</span>
                          <button type="button" onClick={() => pushMsg(m)} className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-bold"><RotateCcw className="w-2.5 h-2.5" /> Retry</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {channel && (
                  <form onSubmit={sendText} className="flex items-center gap-1.5 border-t border-slate-800 bg-slate-950 p-2.5">
                    <button type="button" onClick={rec ? stopAudio : startAudio} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${rec ? 'animate-pulse bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      {rec ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={rec ? `Recording ${sec}s/15s...` : 'संदेश लिखें...'} className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
                    <button type="submit" disabled={sending || !text.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
