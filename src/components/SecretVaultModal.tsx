import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Lock, X, Send, Mic, Square, RotateCcw, Users, UserPlus,
  MessageSquareLock, Ban, Unlock, Search, UserCheck,
  AlertCircle, Loader2, ShieldAlert, Flame, Swords
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';

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
  sender_username: string;
  text: string;
  audio_data?: string | null;
  status: 'sent' | 'stuck';
}

const DUEL_BANK = [
  { q: '70S राइबोसोम की दो उप-इकाइयाँ कौन-सी हैं?', opts: ['50S & 30S', '60S & 40S', '40S & 30S', '50S & 20S'], ans: 0 },
  { q: 'SF6 में संकरण (Hybridisation) क्या होता है?', opts: ['sp3', 'sp3d', 'sp3d2', 'dsp2'], ans: 2 },
  { q: 'मानव शुक्राणु के शीर्ष पर कौन-सी टोपी होती है?', opts: ['सेंट्रिओल', 'एक्रोसोम', 'माइटोकॉन्ड्रिया', 'नेबेनकर्न'], ans: 1 },
];

const PIN_K = 'dinu_neet2027_secret_pin_v1';
const GRP_K = 'dinu_neet2027_my_private_group_v1';
const BLK_K = 'dinu_neet2027_personal_blocks_v1';
const QUE_K = 'dinu_neet2027_secret_outbox_v1';
const LOCAL_CHAT_CACHE = 'dinu_neet2027_local_chats_v1';

export const SecretVaultModal: React.FC<Props> = ({
  isOpen, onClose, currentStudent, settings, onRequireLogin
}) => {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [savedPin, setSavedPin] = useState('');

  const [tab, setTab] = useState<'dm' | 'group' | 'blocked'>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState('');
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

  // Feature #2: Burn-After-Reading Toggle (0 = Normal, 15 = 15s Self-Destruct)
  const [burnSeconds, setBurnSeconds] = useState<0 | 15>(0);

  // Feature #1: 1v1 NCERT Quiz Duel State
  const [duelOpen, setDuelOpen] = useState(false);
  const [duelAnswers, setDuelAnswers] = useState<Record<number, number>>({});

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const getSb = () => {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
      const u = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
      const k = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
      return u && k && u.startsWith('http') ? createClient(u, k) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setUnlocked(false);
    setPin('');
    setErr('');
    setDuelOpen(false);
    try {
      const fullProf = JSON.parse(localStorage.getItem('dinu_neet2027_full_profile_v2') || '{}');
      setSavedPin((fullProf.secret_code || localStorage.getItem(PIN_K) || '').trim());
      const g = localStorage.getItem(GRP_K); if (g) setGroup(JSON.parse(g));
      const b = localStorage.getItem(BLK_K); if (b) setBlocked(JSON.parse(b));
      const q = localStorage.getItem(QUE_K); if (q) setQueue(JSON.parse(q));
    } catch {}
  }, [isOpen, currentStudent]);

  const myHandle = (() => {
    try {
      const fullProf = JSON.parse(localStorage.getItem('dinu_neet2027_full_profile_v2') || '{}');
      return String(fullProf.username || (currentStudent as any)?.username || '@aspirant').toLowerCase();
    } catch {
      return '@aspirant';
    }
  })();

  // Instagram-Style Live User Search
  useEffect(() => {
    if (!isOpen || !unlocked || tab !== 'dm') return;
    const cleanQ = searchQuery.trim().toLowerCase().replace(/^@+/, '');
    if (!cleanQ) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const sb = getSb();
        if (sb) {
          const { data } = await sb
            .from('student_registry')
            .select('username')
            .ilike('username', `@${cleanQ}%`)
            .limit(8);
          const list = Array.isArray(data)
            ? data.map((r: any) => String(r.username)).filter((u) => u !== myHandle && !blocked.includes(u))
            : [];
          setSearchResults(list);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery, isOpen, unlocked, tab, myHandle, blocked]);

  const channel = tab === 'dm' ? dmChannel : tab === 'group' && group?.code ? `grp_${group.code}` : '';

  useEffect(() => {
    if (!isOpen || !unlocked || !channel) return;
    const localStuck = queue.filter((m) => m.channel_key === channel);
    const sb = getSb();
    if (!sb) {
      setMsgs(localStuck);
      return;
    }
    sb.from('secret_messages')
      .select('*')
      .eq('channel_key', channel)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const latest20 = Array.isArray(data)
          ? data.reverse().map((r: any) => ({
              id: String(r.id),
              channel_key: String(r.channel_key),
              sender_username: String(r.sender_username),
              text: String(r.text),
              audio_data: r.voice_payload || null,
              status: 'sent' as const,
            }))
          : [];
        try {
          const cache = JSON.parse(localStorage.getItem(LOCAL_CHAT_CACHE) || '{}');
          cache[channel] = latest20;
          localStorage.setItem(LOCAL_CHAT_CACHE, JSON.stringify(cache));
        } catch {}
        setMsgs([...latest20, ...localStuck]);

        // Auto-burn any incoming [BURN15] message after 15 seconds
        latest20.forEach((m) => {
          if (m.sender_username !== myHandle && m.text.startsWith('🔥[BURN15]')) {
            window.setTimeout(async () => {
              setMsgs((prev) => prev.filter((x) => x.id !== m.id));
              await sb.from('secret_messages').delete().eq('id', m.id);
            }, 15000);
          }
        });
      })
      .catch(() => setMsgs(localStuck));
  }, [isOpen, unlocked, channel, queue, myHandle]);

  if (!isOpen) return null;

  const checkPin = (e: React.FormEvent) => {
    e.preventDefault();
    const c = pin.trim();
    if (!savedPin) return setErr('पहले Profile सेटअप में Secret Code सेट करें।');
    if (c === savedPin) {
      setUnlocked(true);
      setErr('');
    } else {
      setErr('गलत Secret Code! सही कोड डालें।');
    }
  };

  const selectRegisteredUser = (targetUsername: string) => {
    setSelectedPeer(targetUsername);
    setSearchQuery('');
    setSearchResults([]);
    const pair = [myHandle.replace('@', ''), targetUsername.replace('@', '')].sort().join('__');
    setDmChannel(`dm_${pair}`);
  };

  const pushMsg = async (draft: Msg) => {
    const sb = getSb();
    const saveStuck = () => {
      const stuck: Msg = { ...draft, status: 'stuck' };
      const nq = [...queue.filter((x) => x.id !== draft.id), stuck];
      setQueue(nq);
      try { localStorage.setItem(QUE_K, JSON.stringify(nq)); } catch {}
      setMsgs((p) => [...p.filter((x) => x.id !== draft.id), stuck]);
    };

    if (!sb || (typeof navigator !== 'undefined' && !navigator.onLine)) return saveStuck();
    try {
      const { error } = await sb.from('secret_messages').insert([{
        id: draft.id,
        channel_key: draft.channel_key,
        sender_username: draft.sender_username,
        text: draft.text,
        is_voice_signal: Boolean(draft.audio_data),
        voice_payload: draft.audio_data || null,
      }]);
      if (error) throw error;

      const { data: allIds } = await sb
        .from('secret_messages')
        .select('id')
        .eq('channel_key', draft.channel_key)
        .order('created_at', { ascending: false });
      if (Array.isArray(allIds) && allIds.length > 20) {
        const oldIds = allIds.slice(20).map((r: any) => r.id);
        await sb.from('secret_messages').delete().in('id', oldIds);
      }

      const nq = queue.filter((x) => x.id !== draft.id);
      setQueue(nq);
      try { localStorage.setItem(QUE_K, JSON.stringify(nq)); } catch {}
      setMsgs((p) => [...p.filter((x) => x.id !== draft.id), { ...draft, status: 'sent' }]);
    } catch {
      saveStuck();
    }
  };

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !channel || sending) return;
    if (!currentStudent) return onRequireLogin();
    setSending(true);
    const raw = text.trim();
    const finalPayload = burnSeconds === 15 ? `🔥[BURN15] ${raw}` : raw;
    setText('');
    await pushMsg({
      id: `m_${Date.now()}`,
      channel_key: channel,
      sender_username: myHandle,
      text: finalPayload,
      status: 'sent',
    });
    setSending(false);
  };

  const submitDuelChallenge = async () => {
    let score = 0;
    DUEL_BANK.forEach((item, idx) => {
      if (duelAnswers[idx] === item.ans) score += 4;
      else if (duelAnswers[idx] !== undefined) score -= 1;
    });
    setDuelOpen(false);
    setDuelAnswers({});
    await pushMsg({
      id: `duel_${Date.now()}`,
      channel_key: channel,
      sender_username: myHandle,
      text: `⚔️ 1v1 NCERT Quiz Duel Score: ${score} / 12 (+4/-1)! क्या आप इसे बीट कर सकते हैं?`,
      status: 'sent',
    });
  };

  const stopAudio = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== 'inactive') {
      try { recRef.current.stop(); } catch {}
    }
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
        r.onloadend = () => {
          pushMsg({
            id: `a_${Date.now()}`,
            channel_key: channel,
            sender_username: myHandle,
            text: `🎙️ Voice Note (${sec || 1}s)`,
            audio_data: String(r.result || ''),
            status: 'sent',
          });
        };
        r.readAsDataURL(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recRef.current = mr;
      mr.start();
      setRec(true);
      setSec(1);
      timerRef.current = window.setInterval(() => {
        setSec((s) => {
          if (s >= 15) { stopAudio(); return 15; }
          return s + 1;
        });
      }, 1000);
    } catch {
      setErr('माइक की अनुमति दें।');
    }
  };

  const toggleBlk = (h: string) => {
    const n = '@' + h.replace(/^@+/, '').toLowerCase();
    const next = blocked.includes(n) ? blocked.filter((x) => x !== n) : [...blocked, n];
    setBlocked(next);
    try { localStorage.setItem(BLK_K, JSON.stringify(next)); } catch {}
    if (selectedPeer === n) {
      setSelectedPeer('');
      setDmChannel('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquareLock className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-xs font-extrabold text-white">DINU SARAN • Secret Chat</h3>
              <p className="text-[10px] text-slate-400">{myHandle} • Registered Users Only</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!unlocked ? (
          <form onSubmit={checkPin} className="flex flex-1 flex-col items-center justify-center space-y-4 p-6 text-center">
            <Lock className="w-10 h-10 text-amber-400" />
            <h4 className="text-base font-extrabold">Enter Secret Chat Code</h4>
            <p className="text-xs text-slate-400">रजिस्ट्रेशन के समय बनाया गया अपना Secret Code डालें</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-44 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-center text-lg font-extrabold tracking-widest text-amber-300"
            />
            {err && (
              <p className="flex items-center gap-1 text-xs text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" /> {err}
              </p>
            )}
            <button type="submit" className="rounded-2xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-slate-950">
              Unlock Secret Chat
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] font-bold">
              <button type="button" onClick={() => setTab('dm')} className={`rounded-xl px-2.5 py-1.5 ${tab === 'dm' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Direct Search</button>
              <button type="button" onClick={() => setTab('group')} className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${tab === 'group' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}><Users className="w-3 h-3" /> Private Group</button>
              {channel && (
                <button
                  type="button"
                  onClick={() => setDuelOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-xl bg-amber-500/20 px-2.5 py-1.5 text-amber-300 hover:bg-amber-500/30"
                >
                  <Swords className="w-3 h-3" /> 1v1 Duel
                </button>
              )}
              <button type="button" onClick={() => setTab('blocked')} className={`ml-auto rounded-xl px-2 py-1.5 ${tab === 'blocked' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Ban className="w-3.5 h-3.5" /></button>
            </div>

            {tab === 'blocked' ? (
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                <h4 className="text-xs font-extrabold text-rose-400">Blocked Users ({blocked.length})</h4>
                {blocked.map((u) => (
                  <div key={u} className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-xs">
                    <span>{u}</span>
                    <button type="button" onClick={() => toggleBlk(u)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold">
                      <Unlock className="w-3 h-3" /> Unblock
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                {tab === 'dm' ? (
                  <div className="relative border-b border-slate-800 bg-slate-950/50 p-2.5">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Instagram की तरह @username सर्च करें..."
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                      />
                      {searchingUsers && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
                    </div>

                    {searchQuery.trim() && (
                      <div className="mt-1.5 max-h-40 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
                        {searchResults.length === 0 && !searchingUsers ? (
                          <p className="px-3 py-2.5 text-[11px] text-slate-400">
                            कोई रजिस्टर्ड यूज़र नहीं मिला (केवल मौजूद IDs से ही चैट हो सकती है)।
                          </p>
                        ) : (
                          searchResults.map((u) => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => selectRegisteredUser(u)}
                              className="flex w-full items-center justify-between border-b border-slate-800/70 px-3 py-2 text-left text-xs hover:bg-indigo-600/20"
                            >
                              <span className="flex items-center gap-1.5 font-bold text-amber-300">
                                <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> {u}
                              </span>
                              <span className="text-[10px] text-indigo-300">Tap to Chat →</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {selectedPeer && (
                      <div className="mt-2 flex items-center justify-between rounded-xl bg-indigo-950/50 px-3 py-1.5 text-xs">
                        <span className="font-extrabold text-white">Chatting with {selectedPeer}</span>
                        <button type="button" onClick={() => toggleBlk(selectedPeer)} className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                          Block User
                        </button>
                      </div>
                    )}
                  </div>
                ) : !group ? (
                  <div className="space-y-2 border-b border-slate-800 bg-slate-950/40 p-3">
                    <form onSubmit={(e) => { e.preventDefault(); const g = { code: Math.floor(100000 + Math.random() * 900000).toString(), name: groupName.trim() || 'NEET Study Group' }; setGroup(g); try { localStorage.setItem(GRP_K, JSON.stringify(g)); } catch {} setGroupName(''); }} className="flex gap-1.5">
                      <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="1 User = 1 Private Group नाम..." className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white" />
                      <button type="submit" className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold">Create</button>
                    </form>
                    <form onSubmit={(e) => { e.preventDefault(); const c = joinCode.replace(/\D/g, '').slice(0, 6); if (c.length === 6) { const g = { code: c, name: `Group #${c}` }; setGroup(g); try { localStorage.setItem(GRP_K, JSON.stringify(g)); } catch {} setJoinCode(''); } }} className="flex gap-1.5">
                      <input type="text" maxLength={6} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="6-Digit कोड..." className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white" />
                      <button type="submit" className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold"><UserPlus className="w-3.5 h-3.5" /> Join</button>
                    </form>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-b border-slate-800 bg-indigo-950/30 px-3.5 py-2 text-xs">
                    <div>
                      <span className="font-extrabold">{group.name}</span>
                      <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">Code: {group.code}</span>
                    </div>
                    <button type="button" onClick={() => { setGroup(null); try { localStorage.removeItem(GRP_K); } catch {} }} className="text-[10px] text-rose-400">Leave</button>
                  </div>
                )}

                {/* 1v1 NCERT Quiz Duel Mini-Overlay */}
                {duelOpen && channel && (
                  <div className="border-b border-amber-500/30 bg-amber-950/30 p-3 space-y-2 text-xs">
                    <p className="font-extrabold text-amber-300">⚔️ 1v1 NCERT Quiz Duel (+4 / -1)</p>
                    {DUEL_BANK.map((d, i) => (
                      <div key={i} className="space-y-1">
                        <p className="text-[11px] font-bold">{i + 1}. {d.q}</p>
                        <div className="grid grid-cols-2 gap-1">
                          {d.opts.map((o, oi) => (
                            <button
                              key={oi}
                              type="button"
                              onClick={() => setDuelAnswers((p) => ({ ...p, [i]: oi }))}
                              className={`rounded-lg px-2 py-1 text-left text-[10px] font-bold ${duelAnswers[i] === oi ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200'}`}
                            >
                              {o}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={submitDuelChallenge} className="w-full rounded-xl bg-amber-500 py-1.5 text-xs font-extrabold text-slate-950">
                      Send Duel Score to Chat
                    </button>
                  </div>
                )}

                <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                  {!channel ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                      ऊपर सर्च बार में रजिस्टर्ड @username चुनें या Private Study Group खोलें।
                    </div>
                  ) : (
                    msgs.map((m) => (
                      <div key={m.id} className={`flex max-w-[84%] flex-col ${m.sender_username === myHandle ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                        <span className="mb-0.5 text-[10px] text-slate-400">{m.sender_username === myHandle ? 'You' : m.sender_username}</span>
                        <div className={`rounded-2xl px-3 py-2 text-xs ${m.sender_username === myHandle ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
                          {m.audio_data ? <audio controls src={m.audio_data} className="h-8 w-48" /> : m.text}
                        </div>
                        {m.status === 'stuck' && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-400">
                            <ShieldAlert className="w-3 h-3" /> <span>⏳ Stuck (Offline)</span>
                            <button type="button" onClick={() => pushMsg(m)} className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-bold"><RotateCcw className="w-2.5 h-2.5" /> Retry</button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {channel && (
                  <form onSubmit={sendText} className="flex items-center gap-1.5 border-t border-slate-800 bg-slate-950 p-2.5">
                    <button
                      type="button"
                      onClick={() => setBurnSeconds((b) => (b === 15 ? 0 : 15))}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${burnSeconds === 15 ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                      title="Burn-After-Reading (15s Self-Destruct)"
                    >
                      <Flame className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={rec ? stopAudio : startAudio} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${rec ? 'animate-pulse bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      {rec ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={rec ? `Recording ${sec}s/15s...` : burnSeconds === 15 ? '🔥 15s Self-Destruct संदेश...' : 'संदेश लिखें...'} className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
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
