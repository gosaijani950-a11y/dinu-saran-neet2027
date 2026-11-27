import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Lock, X, Send, Mic, Square, RotateCcw, Users, UserPlus,
  MessageSquareLock, Ban, Unlock, Search, UserCheck,
  AlertCircle, Loader2, ShieldAlert, Flame, Swords, Radio, Inbox
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

interface InboxThread {
  peerUsername: string;
  channelKey: string;
  lastText: string;
  lastSender: string;
  isIncoming: boolean;
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

const FALLBACK_SB_URL = 'https://twcpuqcgowjwmkruohqw.supabase.co';
const FALLBACK_SB_KEY = 'sb_publishable_5JxNjgYP025of9f0LTusBw_FqHHrzmn';

export const SecretVaultModal: React.FC<Props> = ({
  isOpen, onClose, currentStudent, settings, onRequireLogin
}) => {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [savedPin, setSavedPin] = useState('');

  const [tab, setTab] = useState<'dm' | 'group' | 'blocked'>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ username: string; full_name?: string }[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState('');
  const [dmChannel, setDmChannel] = useState('');

  // Zero-Bloat Auto Inbox Threads (so incoming messages show up automatically without searching)
  const [inboxThreads, setInboxThreads] = useState<InboxThread[]>([]);

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
  const [liveConnected, setLiveConnected] = useState(false);

  const [burnSeconds, setBurnSeconds] = useState<0 | 15>(0);
  const [duelOpen, setDuelOpen] = useState(false);
  const [duelAnswers, setDuelAnswers] = useState<Record<number, number>>({});

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const getSb = useCallback(() => {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
      const u = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || FALLBACK_SB_URL).trim();
      const k = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || FALLBACK_SB_KEY).trim();
      return u && k && u.startsWith('http') ? createClient(u, k) : null;
    } catch {
      return null;
    }
  }, [settings?.supabaseUrl, settings?.supabaseAnonKey]);

  const myHandle = (() => {
    try {
      const fullProf = JSON.parse(localStorage.getItem('dinu_neet2027_full_profile_v2') || '{}');
      const raw = String(fullProf.username || (currentStudent as any)?.username || '@aspirant').trim().toLowerCase();
      return raw.startsWith('@') ? raw : `@${raw}`;
    } catch {
      return '@aspirant';
    }
  })();

  const myCleanId = myHandle.replace(/^@+/, '');

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

      const sb = getSb();
      if (sb && fullProf.username && fullProf.mobile && fullProf.secret_code) {
        const cleanU = String(fullProf.username).trim().toLowerCase();
        const normU = cleanU.startsWith('@') ? cleanU : `@${cleanU}`;
        sb.from('student_registry').upsert([{
          username: normU,
          full_name: String(fullProf.full_name || currentStudent?.name || ''),
          mobile: String(fullProf.mobile),
          security_code: String(fullProf.security_code || fullProf.secret_code),
          secret_code: String(fullProf.secret_code),
        }], { onConflict: 'username' }).then(() => {});
      }
    } catch {}
  }, [isOpen, currentStudent, getSb]);

  // AUTO-INBOX LOADER: Automatically discovers all incoming/outgoing DM threads for current user
  const refreshInboxThreads = useCallback(async () => {
    if (!unlocked || !myCleanId) return;
    const sb = getSb();
    if (!sb) return;
    try {
      const { data } = await sb
        .from('secret_messages')
        .select('channel_key, sender_username, text, created_at')
        .like('channel_key', 'dm_%')
        .order('created_at', { ascending: false })
        .limit(80);

      if (!Array.isArray(data)) return;

      const map = new Map<string, InboxThread>();
      for (const row of data) {
        const ch = String(row.channel_key || '');
        if (!ch.startsWith('dm_')) continue;
        const pair = ch.slice(3).split('__');
        if (pair.length !== 2 || !pair.includes(myCleanId)) continue;

        const otherClean = pair[0] === myCleanId ? pair[1] : pair[0];
        if (!otherClean) continue;
        const peerHandle = `@${otherClean}`;
        if (blocked.includes(peerHandle)) continue;

        if (!map.has(ch)) {
          const sender = String(row.sender_username || '');
          map.set(ch, {
            peerUsername: peerHandle,
            channelKey: ch,
            lastText: String(row.text || ''),
            lastSender: sender,
            isIncoming: sender.toLowerCase() !== myHandle,
          });
        }
      }
      setInboxThreads(Array.from(map.values()));
    } catch {}
  }, [unlocked, myCleanId, myHandle, blocked, getSb]);

  useEffect(() => {
    if (!isOpen || !unlocked) return;
    void refreshInboxThreads();
    const t = window.setInterval(() => {
      void refreshInboxThreads();
    }, 3000);
    return () => window.clearInterval(t);
  }, [isOpen, unlocked, refreshInboxThreads]);

  // Smart Live Search
  useEffect(() => {
    if (!isOpen || !unlocked || tab !== 'dm') return;
    if (!searchFocused && !searchQuery.trim()) return;

    const cleanQ = searchQuery.trim().toLowerCase().replace(/^@+/, '');
    const timer = window.setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const sb = getSb();
        if (sb) {
          let req = sb.from('student_registry').select('username, full_name').limit(15);
          if (cleanQ) {
            req = req.or(`username.ilike.%${cleanQ}%,full_name.ilike.%${cleanQ}%`);
          }
          const { data } = await req;
          const list = Array.isArray(data)
            ? data
                .map((r: any) => {
                  const raw = String(r.username || '').trim().toLowerCase();
                  return {
                    username: raw.startsWith('@') ? raw : `@${raw}`,
                    full_name: String(r.full_name || ''),
                  };
                })
                .filter((u) => u.username && u.username !== myHandle && !blocked.includes(u.username))
            : [];
          setSearchResults(list);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchFocused, isOpen, unlocked, tab, myHandle, blocked, getSb]);

  const channel = tab === 'dm' ? dmChannel : tab === 'group' && group?.code ? `grp_${group.code}` : '';

  const fetchLatestChannelMessages = useCallback(async () => {
    if (!channel) return;
    const localStuck = queue.filter((m) => m.channel_key === channel);
    const sb = getSb();
    if (!sb) {
      setMsgs(localStuck);
      return;
    }
    try {
      const { data } = await sb
        .from('secret_messages')
        .select('*')
        .eq('channel_key', channel)
        .order('created_at', { ascending: false })
        .limit(20);

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

      latest20.forEach((m) => {
        if (m.sender_username !== myHandle && m.text.startsWith('🔥[BURN15]')) {
          window.setTimeout(async () => {
            setMsgs((prev) => prev.filter((x) => x.id !== m.id));
            await sb.from('secret_messages').delete().eq('id', m.id);
          }, 15000);
        }
      });
    } catch {
      setMsgs(localStuck);
    }
  }, [channel, queue, getSb, myHandle]);

  useEffect(() => {
    if (!isOpen || !unlocked || !channel) {
      setLiveConnected(false);
      return;
    }

    void fetchLatestChannelMessages();

    const sb = getSb();
    let subChannel: any = null;
    if (sb) {
      subChannel = sb
        .channel(`live_${channel}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'secret_messages',
            filter: `channel_key=eq.${channel}`,
          },
          () => {
            void fetchLatestChannelMessages();
            void refreshInboxThreads();
          }
        )
        .subscribe((status: string) => {
          setLiveConnected(status === 'SUBSCRIBED');
        });
    }

    const poll = window.setInterval(() => {
      void fetchLatestChannelMessages();
    }, 2500);

    return () => {
      window.clearInterval(poll);
      if (sb && subChannel) {
        void sb.removeChannel(subChannel);
      }
    };
  }, [isOpen, unlocked, channel, fetchLatestChannelMessages, refreshInboxThreads, getSb]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

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
    setSearchFocused(false);
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

    setMsgs((p) => [...p.filter((x) => x.id !== draft.id), { ...draft, status: 'sent' }]);

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
      void refreshInboxThreads();
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
              <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                DINU SARAN • Secret Chat
                {channel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-300">
                    <Radio className="w-2.5 h-2.5 animate-pulse" /> {liveConnected ? 'LIVE' : 'SYNC'}
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-slate-400">{myHandle} • Auto Inbox & Live Sync</p>
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
              <button type="button" onClick={() => setTab('dm')} className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${tab === 'dm' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                <Inbox className="w-3 h-3" /> Inbox & Search {inboxThreads.length > 0 && `(${inboxThreads.length})`}
              </button>
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
                  <div className="relative border-b border-slate-800 bg-slate-950/50 p-2.5 space-y-2">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onFocus={() => setSearchFocused(true)}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="नया @username या नाम सर्च करें..."
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                      />
                      {searchingUsers && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
                    </div>

                    {(searchFocused || searchQuery.trim()) && (
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
                        {searchResults.length === 0 && !searchingUsers ? (
                          <p className="px-3 py-2 text-[11px] text-slate-400">
                            कोई दूसरा रजिस्टर्ड यूज़र नहीं मिला।
                          </p>
                        ) : (
                          searchResults.map((u) => (
                            <button
                              key={u.username}
                              type="button"
                              onClick={() => selectRegisteredUser(u.username)}
                              className="flex w-full items-center justify-between border-b border-slate-800/70 px-3 py-2 text-left text-xs hover:bg-indigo-600/20"
                            >
                              <div>
                                <span className="flex items-center gap-1.5 font-bold text-amber-300">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> {u.username}
                                </span>
                                {u.full_name && <p className="pl-5 text-[10px] text-slate-400">{u.full_name}</p>}
                              </div>
                              <span className="text-[10px] text-indigo-300">Chat →</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {/* AUTO-DISCOVERED INBOX CHATS (No search needed when someone messages you!) */}
                    {inboxThreads.length > 0 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {inboxThreads.map((th) => {
                          const active = selectedPeer === th.peerUsername;
                          return (
                            <button
                              key={th.channelKey}
                              type="button"
                              onClick={() => selectRegisteredUser(th.peerUsername)}
                              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition ${
                                active
                                  ? 'border-indigo-500 bg-indigo-600/30 text-white'
                                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/50'
                              }`}
                            >
                              <span className="font-extrabold text-amber-300">{th.peerUsername}</span>
                              {th.isIncoming && !active && (
                                <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[9px] font-extrabold text-slate-950">
                                  NEW
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedPeer && (
                      <div className="flex items-center justify-between rounded-xl bg-indigo-950/50 px-3 py-1.5 text-xs">
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
                    inboxThreads.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-400">
                          📩 आपके इनबॉक्स की चैट्स (खोलने के लिए टैप करें):
                        </p>
                        {inboxThreads.map((th) => (
                          <button
                            key={th.channelKey}
                            type="button"
                            onClick={() => selectRegisteredUser(th.peerUsername)}
                            className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-left hover:border-indigo-500/50"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-extrabold text-amber-300">{th.peerUsername}</p>
                              <p className="truncate text-[11px] text-slate-300">
                                {th.isIncoming ? '' : 'You: '}
                                {th.lastText}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-xl bg-indigo-600/20 px-2.5 py-1 text-[10px] font-bold text-indigo-300">
                              Open →
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                        ऊपर सर्च बार में @username चुनें या जब कोई आपको मैसेज भेजेगा तो वह सीधे यहाँ इनबॉक्स में दिख जाएगा।
                      </div>
                    )
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
                  <div ref={bottomRef} />
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
