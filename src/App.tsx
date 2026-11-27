import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  Lock,
  X,
  Send,
  Mic,
  Square,
  RotateCcw,
  Users,
  UserPlus,
  MessageSquareLock,
  Ban,
  Unlock,
  BookOpen,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Copy,
  Check,
  Wifi,
  WifiOff,
  KeyRound,
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';
import { formatNeetExamText, NCERT_ACTIVE_RECALL_CARDS } from '../utils/neetEngine';

interface SecretVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStudent: StudentProfile | null;
  settings: AppSettings;
  onRequireLogin: () => void;
}

interface SecretMsg {
  id: string;
  channel_key: string;
  sender_id: string;
  sender_name: string;
  sender_username: string;
  text: string;
  audio_data?: string | null;
  status: 'sent' | 'stuck';
  created_at?: string;
}

interface PrivateGroup {
  code: string;
  name: string;
}

const PIN_KEY = 'dinu_neet2027_secret_pin_v1';
const GRP_KEY = 'dinu_neet2027_my_private_group_v1';
const BLK_KEY = 'dinu_neet2027_personal_blocks_v1';
const QUE_KEY = 'dinu_neet2027_secret_outbox_v1';

const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeStorage = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/private mode errors safely
  }
};

const readPinSafely = (student: StudentProfile | null): string => {
  try {
    const profilePin = (student as Record<string, unknown> | null)?.security_pin;
    if (typeof profilePin === 'string' && profilePin.trim().length >= 4) {
      return profilePin.trim();
    }
    if (typeof window !== 'undefined') {
      return (window.localStorage.getItem(PIN_KEY) || '').trim();
    }
  } catch {
    // Fallback
  }
  return '';
};

const safeFormatText = (raw: unknown): React.ReactNode => {
  const str = String(raw ?? '');
  try {
    return formatNeetExamText(str);
  } catch {
    return str;
  }
};

export const SecretVaultModal: React.FC<SecretVaultModalProps> = ({
  isOpen,
  onClose,
  currentStudent,
  settings,
  onRequireLogin,
}) => {
  // All hooks unconditionally at the top (Zero React Hook violation risk)
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [savedPin, setSavedPin] = useState('');
  const [isResettingPin, setIsResettingPin] = useState(false);

  const [tab, setTab] = useState<'dm' | 'group' | 'ncert' | 'blocked'>('dm');
  const [peerInput, setPeerInput] = useState('');
  const [dmChannel, setDmChannel] = useState('');

  const [group, setGroup] = useState<PrivateGroup | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const [blocked, setBlocked] = useState<string[]>([]);
  const [messages, setMessages] = useState<SecretMsg[]>([]);
  const [queue, setQueue] = useState<SecretMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Memoized Supabase client so it is never recreated unnecessarily
  const supabaseClient: SupabaseClient | null = useMemo(() => {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
      const url = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
      const key = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (!url || !key || !url.startsWith('http')) return null;
      return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch {
      return null;
    }
  }, [settings?.supabaseUrl, settings?.supabaseAnonKey]);

  // Network status listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Reset & hydrate safely whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setUnlocked(false);
    setPinInput('');
    setErrorMsg('');
    setIsResettingPin(false);
    setSavedPin(readPinSafely(currentStudent));
    setGroup(readStorage<PrivateGroup | null>(GRP_KEY, null));
    setBlocked(readStorage<string[]>(BLK_KEY, []));
    setQueue(readStorage<SecretMsg[]>(QUE_KEY, []));
  }, [isOpen, currentStudent]);

  // Cleanup active mic/timers when modal closes or unmounts
  useEffect(() => {
    if (isOpen) return;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  }, [isOpen]);

  const uid = String(currentStudent?.id || 'guest_student');
  const uname = String(
    currentStudent?.full_name ||
      (currentStudent as Record<string, unknown> | null)?.name ||
      'NEET Aspirant'
  );
  const cleanHandle = String(
    (currentStudent as Record<string, unknown> | null)?.username ||
      uname.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      'aspirant'
  ).replace(/^@+/, '');
  const handle = `@${cleanHandle}`;

  const activeChannel =
    tab === 'dm'
      ? dmChannel
      : tab === 'group' && group?.code
      ? `grp_${group.code}`
      : '';

  // Load channel history + offline stuck items
  useEffect(() => {
    if (!isOpen || !unlocked || !activeChannel) return;
    let cancelled = false;
    const localStuck = queue.filter((m) => m.channel_key === activeChannel);

    if (!supabaseClient || !isOnline) {
      setMessages(localStuck);
      return;
    }

    supabaseClient
      .from('secret_messages')
      .select('*')
      .eq('channel_key', activeChannel)
      .order('created_at', { ascending: true })
      .limit(60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setMessages(localStuck);
          return;
        }
        const remoteMsgs: SecretMsg[] = data.map((row: Record<string, unknown>) => ({
          id: String(row.id || `rem_${Math.random()}`),
          channel_key: String(row.channel_key || activeChannel),
          sender_id: String(row.sender_id || ''),
          sender_name: String(row.sender_name || 'Student'),
          sender_username: String(row.sender_username || '@student'),
          text: String(row.text || ''),
          audio_data: row.audio_data ? String(row.audio_data) : null,
          status: 'sent',
          created_at: row.created_at ? String(row.created_at) : undefined,
        }));
        setMessages([...remoteMsgs, ...localStuck]);
      })
      .catch(() => {
        if (!cancelled) setMessages(localStuck);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, unlocked, activeChannel, supabaseClient, isOnline, queue]);

  // Safe auto-scroll
  useEffect(() => {
    if (!isOpen || !unlocked) return;
    const id = window.setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [messages.length, isOpen, unlocked]);

  if (!isOpen) return null;

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.trim();
    if (!/^\d{4,8}$/.test(clean)) {
      setErrorMsg('कृपया 4 से 8 अंकों का नंबर PIN डालें।');
      return;
    }
    if (!savedPin || isResettingPin) {
      try {
        window.localStorage.setItem(PIN_KEY, clean);
      } catch {}
      setSavedPin(clean);
      setIsResettingPin(false);
      setUnlocked(true);
      setErrorMsg('');
      return;
    }
    if (clean === savedPin) {
      setUnlocked(true);
      setErrorMsg('');
    } else {
      setErrorMsg('गलत Security PIN! सही PIN डालें या नया सेट करें।');
    }
  };

  const handleOpenDm = (e: React.FormEvent) => {
    e.preventDefault();
    const p = peerInput.trim().toLowerCase().replace(/^@+/, '');
    if (!p) return;
    if (blocked.includes(`@${p}`)) {
      setErrorMsg(`@${p} को आपने ब्लॉक किया हुआ है। पहले Unblock करें।`);
      return;
    }
    setErrorMsg('');
    const pair = [cleanHandle.toLowerCase(), p].sort().join('__');
    setDmChannel(`dm_${pair}`);
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (group) return;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const created: PrivateGroup = {
      code,
      name: groupName.trim() || `${uname}'s NEET Group`,
    };
    setGroup(created);
    writeStorage(GRP_KEY, created);
    setGroupName('');
  };

  const handleJoinGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setErrorMsg('कृपया 6-अंकों का ग्रुप कोड डालें।');
      return;
    }
    setErrorMsg('');
    const joined: PrivateGroup = { code, name: `Private Study Group #${code}` };
    setGroup(joined);
    writeStorage(GRP_KEY, joined);
    setJoinCode('');
  };

  const copyGroupCode = () => {
    if (!group?.code) return;
    try {
      navigator.clipboard?.writeText(group.code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {}
  };

  const dispatchMessage = async (draft: SecretMsg) => {
    const saveOfflineStuck = () => {
      const stuckItem: SecretMsg = { ...draft, status: 'stuck' };
      const nextQueue = [...queue.filter((x) => x.id !== draft.id), stuckItem];
      setQueue(nextQueue);
      writeStorage(QUE_KEY, nextQueue);
      setMessages((prev) => [...prev.filter((x) => x.id !== draft.id), stuckItem]);
    };

    if (!supabaseClient || !isOnline) {
      saveOfflineStuck();
      return;
    }

    try {
      const { error } = await supabaseClient.from('secret_messages').insert([
        {
          channel_key: draft.channel_key,
          sender_id: draft.sender_id,
          sender_name: draft.sender_name,
          sender_username: draft.sender_username,
          text: draft.text,
          audio_data: draft.audio_data || null,
        },
      ]);
      if (error) throw error;

      const nextQueue = queue.filter((x) => x.id !== draft.id);
      setQueue(nextQueue);
      writeStorage(QUE_KEY, nextQueue);
      setMessages((prev) => [
        ...prev.filter((x) => x.id !== draft.id),
        { ...draft, status: 'sent' },
      ]);
    } catch {
      saveOfflineStuck();
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !activeChannel || sending) return;
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    setSending(true);
    setText('');
    await dispatchMessage({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      channel_key: activeChannel,
      sender_id: uid,
      sender_name: uname,
      sender_username: handle,
      text: trimmed,
      status: 'sent',
      created_at: new Date().toISOString(),
    });
    setSending(false);
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    setRecording(false);
  };

  const startRecording = async () => {
    if (!activeChannel || recording) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('आपके ब्राउज़र में Voice Note सपोर्ट उपलब्ध नहीं है।');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = String(reader.result || '');
          if (!dataUrl) return;
          dispatchMessage({
            id: `aud_${Date.now()}`,
            channel_key: activeChannel,
            sender_id: uid,
            sender_name: uname,
            sender_username: handle,
            text: `🎙️ Voice Note (${seconds || 1}s)`,
            audio_data: dataUrl,
            status: 'sent',
            created_at: new Date().toISOString(),
          });
        };
        reader.readAsDataURL(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(1);
      setErrorMsg('');

      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          if (prev >= 15) {
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setErrorMsg('Microphone की अनुमति दें ताकि 15s Voice Note भेजा जा सके।');
    }
  };

  const toggleBlock = (rawHandle: string) => {
    const norm = `@${rawHandle.replace(/^@+/, '').toLowerCase()}`;
    const updated = blocked.includes(norm)
      ? blocked.filter((x) => x !== norm)
      : [...blocked, norm];
    setBlocked(updated);
    writeStorage(BLK_KEY, updated);
  };

  const safeRecallCards = Array.isArray(NCERT_ACTIVE_RECALL_CARDS)
    ? NCERT_ACTIVE_RECALL_CARDS
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-[84vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <MessageSquareLock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white">
                DINU SARAN • Secret Vault
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>{handle}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  {isOnline ? (
                    <>
                      <Wifi className="w-2.5 h-2.5 text-emerald-400" /> Online
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-2.5 h-2.5 text-amber-400" /> Offline Safe
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close Secret Vault"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Security PIN Gate */}
        {!unlocked ? (
          <form
            onSubmit={handlePinSubmit}
            className="flex flex-1 flex-col items-center justify-center space-y-4 p-6 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/15 text-amber-400">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-white">
                {savedPin && !isResettingPin
                  ? 'Enter Private Security PIN'
                  : 'Set Private Security PIN'}
              </h4>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                {savedPin && !isResettingPin
                  ? 'Direct Chat, 15s Voice Notes और Private Study Group खोलने के लिए PIN डालें।'
                  : 'अपना नया 4 से 8 अंकों का निजी Security PIN सेट करें।'}
              </p>
            </div>

            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-44 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-center text-lg font-extrabold tracking-widest text-amber-300 focus:border-amber-400 focus:outline-none"
            />

            {errorMsg && (
              <p className="flex items-center gap-1 text-xs font-semibold text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMsg}
              </p>
            )}

            <button
              type="submit"
              className="rounded-2xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-slate-950 transition hover:bg-amber-400"
            >
              {savedPin && !isResettingPin ? 'Unlock Vault' : 'Save PIN & Enter'}
            </button>

            {savedPin && !isResettingPin && (
              <button
                type="button"
                onClick={() => {
                  setIsResettingPin(true);
                  setPinInput('');
                  setErrorMsg('');
                }}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300"
              >
                <KeyRound className="w-3 h-3" /> PIN भूल गए? नया PIN सेट करें
              </button>
            )}
          </form>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setTab('dm')}
                className={`rounded-xl px-2.5 py-1.5 ${
                  tab === 'dm' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                Direct Chat
              </button>
              <button
                type="button"
                onClick={() => setTab('group')}
                className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${
                  tab === 'group' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Users className="w-3 h-3" /> Group
              </button>
              <button
                type="button"
                onClick={() => setTab('ncert')}
                className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${
                  tab === 'ncert' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <BookOpen className="w-3 h-3" /> NCERT
              </button>
              <button
                type="button"
                onClick={() => setTab('blocked')}
                className={`ml-auto rounded-xl px-2 py-1.5 ${
                  tab === 'blocked' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
                title="Blocked Users"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            </div>

            {errorMsg && (
              <div className="flex items-center justify-between bg-rose-950/80 px-3 py-1.5 text-[11px] text-rose-300">
                <span>{errorMsg}</span>
                <button type="button" onClick={() => setErrorMsg('')} className="font-bold">
                  ✕
                </button>
              </div>
            )}

            {/* Tab 3: NCERT Active Recall */}
            {tab === 'ncert' ? (
              <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                {safeRecallCards.map((c) => {
                  const isShown = !!revealedCards[c.id];
                  return (
                    <div
                      key={c.id}
                      className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-3"
                    >
                      <div className="flex justify-between text-[10px]">
                        <span className="font-bold text-emerald-400">{c.subject}</span>
                        <span className="text-slate-400">{c.chapter}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-100">
                        {safeFormatText(c.statementWithBlank)}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        {isShown ? (
                          <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 text-xs font-extrabold text-emerald-300">
                            उत्तर: {safeFormatText(c.answer)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">उत्तर छिपा है</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedCards((p) => ({ ...p, [c.id]: !p[c.id] }))
                          }
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-indigo-300"
                        >
                          {isShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {isShown ? 'छिपाएं' : 'उत्तर देखें'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : tab === 'blocked' ? (
              /* Tab 4: User-Level Block List */
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                <h4 className="text-xs font-extrabold text-rose-400">
                  Blocked Users ({blocked.length})
                </h4>
                {blocked.length === 0 ? (
                  <p className="text-xs text-slate-400">अभी आपने किसी को ब्लॉक नहीं किया है।</p>
                ) : (
                  blocked.map((u) => (
                    <div
                      key={u}
                      className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-xs"
                    >
                      <span className="font-bold">{u}</span>
                      <button
                        type="button"
                        onClick={() => toggleBlock(u)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                      >
                        <Unlock className="w-3 h-3" /> Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Tab 1 & 2: Direct Chat & Private Group */
              <div className="flex flex-1 flex-col overflow-hidden">
                {tab === 'dm' ? (
                  <form
                    onSubmit={handleOpenDm}
                    className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/40 px-3 py-2"
                  >
                    <input
                      type="text"
                      value={peerInput}
                      onChange={(e) => setPeerInput(e.target.value)}
                      placeholder="दोस्त का @username लिखें..."
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Open
                    </button>
                    {peerInput.trim() && (
                      <button
                        type="button"
                        onClick={() => toggleBlock(peerInput)}
                        className="rounded-xl bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-300"
                      >
                        Block
                      </button>
                    )}
                  </form>
                ) : !group ? (
                  <div className="space-y-2 border-b border-slate-800 bg-slate-950/40 p-3">
                    <form onSubmit={handleCreateGroup} className="flex gap-1.5">
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="1 User = 1 Private Group नाम..."
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Create
                      </button>
                    </form>
                    <form onSubmit={handleJoinGroup} className="flex gap-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-Digit कोड से जुड़ें..."
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Join
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-b border-slate-800 bg-indigo-950/30 px-3.5 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white">{group.name}</span>
                      <button
                        type="button"
                        onClick={copyGroupCode}
                        className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-300"
                        title="Copy 6-Digit Secret Code"
                      >
                        Code: {group.code}
                        {copiedCode ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGroup(null);
                        try {
                          window.localStorage.removeItem(GRP_KEY);
                        } catch {}
                      }}
                      className="text-[10px] text-rose-400 hover:underline"
                    >
                      Leave
                    </button>
                  </div>
                )}

                {/* Messages Feed */}
                <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                  {!activeChannel ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                      ऊपर दोस्त का @username लिखकर Open दबाएं या 6-Digit Private Study Group बनाएं।
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                      यह एन्क्रिप्टेड प्राइवेट चैट खाली है। पहला संदेश या 15s Voice Note भेजें!
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isMine = m.sender_id === uid;
                      return (
                        <div
                          key={m.id}
                          className={`flex max-w-[84%] flex-col ${
                            isMine ? 'ml-auto items-end' : 'mr-auto items-start'
                          }`}
                        >
                          <span className="mb-0.5 text-[10px] text-slate-400">
                            {isMine ? 'You' : `${m.sender_name} (${m.sender_username})`}
                          </span>
                          <div
                            className={`rounded-2xl px-3 py-2 text-xs ${
                              isMine
                                ? 'rounded-tr-sm bg-indigo-600 text-white'
                                : 'rounded-tl-sm bg-slate-800 text-slate-100'
                            }`}
                          >
                            {m.audio_data ? (
                              <div className="space-y-1">
                                <div className="text-[11px] font-bold">{m.text}</div>
                                <audio controls src={m.audio_data} className="h-8 w-48" />
                              </div>
                            ) : (
                              safeFormatText(m.text)
                            )}
                          </div>
                          {m.status === 'stuck' && (
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-400">
                              <ShieldAlert className="w-3 h-3" />
                              <span>⏳ Stuck (Offline)</span>
                              <button
                                type="button"
                                onClick={() => dispatchMessage(m)}
                                className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-bold hover:bg-amber-500/30"
                              >
                                <RotateCcw className="w-2.5 h-2.5" /> Retry Send
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                {/* Message Composer */}
                {activeChannel && (
                  <form
                    onSubmit={handleSendText}
                    className="flex items-center gap-1.5 border-t border-slate-800 bg-slate-950 p-2.5"
                  >
                    <button
                      type="button"
                      onClick={recording ? stopRecording : startRecording}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        recording
                          ? 'animate-pulse bg-rose-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:text-amber-400'
                      }`}
                      title={recording ? 'Stop Recording' : 'Record 15s Voice Note'}
                    >
                      {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={
                        recording ? `Recording ${seconds}s / 15s...` : 'प्राइवेट संदेश लिखें...'
                      }
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !text.trim()}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
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
