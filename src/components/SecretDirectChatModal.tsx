import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
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
  Copy,
  Check,
  Ban,
  Unlock,
  BookOpen,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';
import { formatNeetExamText, NCERT_ACTIVE_RECALL_CARDS } from '../utils/neetEngine';

interface SecretDirectChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStudent: StudentProfile | null;
  settings: AppSettings;
  onRequireLogin: () => void;
}

export interface SecretMessageItem {
  id: string;
  channel_key: string;
  sender_id: string;
  sender_name: string;
  sender_username: string;
  text: string;
  audio_data?: string | null;
  audio_duration?: number;
  status: 'sent' | 'stuck';
  created_at: string;
}

const PIN_KEY = 'dinu_neet2027_secret_pin_v1';
const MY_GROUP_KEY = 'dinu_neet2027_my_private_group_v1';
const BLOCKED_USERS_KEY = 'dinu_neet2027_personal_blocks_v1';
const SECRET_QUEUE_KEY = 'dinu_neet2027_secret_outbox_v1';

const safeReadJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeWriteJson = (key: string, val: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

const generateSixDigitCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const SecretDirectChatModal: React.FC<SecretDirectChatModalProps> = ({
  isOpen,
  onClose,
  currentStudent,
  settings,
  onRequireLogin,
}) => {
  const safeStudentId = String(currentStudent?.id || 'guest_student');
  const safeStudentName = String(
    currentStudent?.full_name || (currentStudent as any)?.name || 'NEET Aspirant'
  );
  const safeUsername = useMemo(() => {
    const raw =
      (currentStudent as any)?.username ||
      safeStudentName.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      'aspirant';
    return `@${String(raw).replace(/^@+/, '')}`;
  }, [currentStudent, safeStudentName]);

  const savedPin = useMemo(() => {
    const fromProfile = String((currentStudent as any)?.security_pin || '').trim();
    if (fromProfile) return fromProfile;
    try {
      return (localStorage.getItem(PIN_KEY) || '').trim();
    } catch {
      return '';
    }
  }, [currentStudent]);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [activeTab, setActiveTab] = useState<'dm' | 'group' | 'ncert' | 'blocked'>('dm');
  const [peerHandle, setPeerHandle] = useState('');
  const [activeDmChannel, setActiveDmChannel] = useState<string>('');

  const [myGroup, setMyGroup] = useState<{ code: string; name: string } | null>(() =>
    safeReadJson(MY_GROUP_KEY, null)
  );
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const [blockedUsers, setBlockedUsers] = useState<string[]>(() =>
    safeReadJson(BLOCKED_USERS_KEY, [])
  );

  const [messages, setMessages] = useState<SecretMessageItem[]>([]);
  const [outboxQueue, setOutboxQueue] = useState<SecretMessageItem[]>(() =>
    safeReadJson(SECRET_QUEUE_KEY, [])
  );
  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const supabase = useMemo(() => {
    const env = (import.meta as { env?: Record<string, string> }).env || {};
    const url = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
    const key = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return null;
    try {
      return createClient(url, key);
    } catch {
      return null;
    }
  }, [settings?.supabaseUrl, settings?.supabaseAnonKey]);

  useEffect(() => {
    if (!isOpen) {
      setIsUnlocked(false);
      setPinInput('');
      setPinError('');
    }
  }, [isOpen]);

  const activeChannelKey = useMemo(() => {
    if (activeTab === 'dm') return activeDmChannel;
    if (activeTab === 'group' && myGroup?.code) return `grp_${myGroup.code}`;
    return '';
  }, [activeTab, activeDmChannel, myGroup]);

  useEffect(() => {
    if (!isOpen || !isUnlocked || !activeChannelKey) return;
    let cancelled = false;

    const loadChannel = async () => {
      const localStuck = outboxQueue.filter((m) => m.channel_key === activeChannelKey);
      if (!supabase) {
        if (!cancelled) setMessages(localStuck);
        return;
      }
      try {
        const { data } = await supabase
          .from('secret_messages')
          .select('*')
          .eq('channel_key', activeChannelKey)
          .order('created_at', { ascending: true })
          .limit(60);
        if (!cancelled) {
          const serverMsgs = (Array.isArray(data) ? data : []).map((m: any) => ({
            ...m,
            status: 'sent' as const,
          }));
          setMessages([...serverMsgs, ...localStuck]);
        }
      } catch {
        if (!cancelled) setMessages(localStuck);
      }
    };

    loadChannel();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isUnlocked, activeChannelKey, supabase, outboxQueue]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!isOpen) return null;

  const handleVerifyOrCreatePin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.trim();
    if (clean.length < 4) {
      setPinError('कम से कम 4 अंकों का Security PIN डालें।');
      return;
    }
    if (!savedPin) {
      try {
        localStorage.setItem(PIN_KEY, clean);
      } catch {}
      setIsUnlocked(true);
      setPinError('');
      return;
    }
    if (clean === savedPin) {
      setIsUnlocked(true);
      setPinError('');
    } else {
      setPinError('गलत Security PIN! कृपया अपना निजी PIN डालें।');
    }
  };

  const handleStartDirectChat = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = peerHandle.trim().toLowerCase().replace(/^@+/, '');
    if (!clean) return;
    if (blockedUsers.includes(`@${clean}`)) {
      setPinError(`@${clean} को आपने ब्लॉक किया हुआ है। पहले Unblock करें।`);
      return;
    }
    const me = safeUsername.replace(/^@+/, '').toLowerCase();
    const pair = [me, clean].sort().join('__');
    setActiveDmChannel(`dm_${pair}`);
  };

  const handleCreatePrivateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (myGroup) return;
    const name = newGroupName.trim() || `${safeStudentName}'s NEET Study Group`;
    const created = { code: generateSixDigitCode(), name };
    setMyGroup(created);
    safeWriteJson(MY_GROUP_KEY, created);
    setNewGroupName('');
  };

  const handleJoinPrivateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return;
    const joined = { code, name: `Private Group #${code}` };
    setMyGroup(joined);
    safeWriteJson(MY_GROUP_KEY, joined);
    setJoinCodeInput('');
  };

  const dispatchMessage = async (draft: SecretMessageItem) => {
    if (!supabase || !navigator.onLine) {
      const stuckItem: SecretMessageItem = { ...draft, status: 'stuck' };
      const nextQueue = [...outboxQueue.filter((q) => q.id !== draft.id), stuckItem];
      setOutboxQueue(nextQueue);
      safeWriteJson(SECRET_QUEUE_KEY, nextQueue);
      setMessages((prev) => [...prev.filter((m) => m.id !== draft.id), stuckItem]);
      return;
    }

    try {
      const { error } = await supabase.from('secret_messages').insert([
        {
          channel_key: draft.channel_key,
          sender_id: draft.sender_id,
          sender_name: draft.sender_name,
          sender_username: draft.sender_username,
          text: draft.text,
          audio_data: draft.audio_data || null,
          audio_duration: draft.audio_duration || 0,
        },
      ]);
      if (error) throw error;

      const sentItem: SecretMessageItem = { ...draft, status: 'sent' };
      const nextQueue = outboxQueue.filter((q) => q.id !== draft.id);
      setOutboxQueue(nextQueue);
      safeWriteJson(SECRET_QUEUE_KEY, nextQueue);
      setMessages((prev) => [...prev.filter((m) => m.id !== draft.id), sentItem]);
    } catch {
      const stuckItem: SecretMessageItem = { ...draft, status: 'stuck' };
      const nextQueue = [...outboxQueue.filter((q) => q.id !== draft.id), stuckItem];
      setOutboxQueue(nextQueue);
      safeWriteJson(SECRET_QUEUE_KEY, nextQueue);
      setMessages((prev) => [...prev.filter((m) => m.id !== draft.id), stuckItem]);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = textInput.trim();
    if (!clean || !activeChannelKey || sending) return;
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    setSending(true);
    setTextInput('');
    const draft: SecretMessageItem = {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      channel_key: activeChannelKey,
      sender_id: safeStudentId,
      sender_name: safeStudentName,
      sender_username: safeUsername,
      text: clean,
      status: 'sent',
      created_at: new Date().toISOString(),
    };
    await dispatchMessage(draft);
    setSending(false);
  };

  const startVoiceRecording = async () => {
    if (!activeChannelKey || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = String(reader.result || '');
          if (!base64Audio) return;
          const draft: SecretMessageItem = {
            id: `aud_${Date.now()}`,
            channel_key: activeChannelKey,
            sender_id: safeStudentId,
            sender_name: safeStudentName,
            sender_username: safeUsername,
            text: `🎙️ Voice Note (${recordSeconds || 1}s)`,
            audio_data: base64Audio,
            audio_duration: recordSeconds || 1,
            status: 'sent',
            created_at: new Date().toISOString(),
          };
          await dispatchMessage(draft);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(1);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 15) {
            stopVoiceRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setPinError('माइक की अनुमति नहीं मिली। कृपया ब्राउज़र में Microphone Allow करें।');
    }
  };

  const stopVoiceRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleBlockHandle = (handle: string) => {
    const normalized = `@${handle.replace(/^@+/, '').toLowerCase()}`;
    const next = blockedUsers.includes(normalized)
      ? blockedUsers.filter((u) => u !== normalized)
      : [...blockedUsers, normalized];
    setBlockedUsers(next);
    safeWriteJson(BLOCKED_USERS_KEY, next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex h-[84vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <MessageSquareLock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white">
                DINU SARAN • Secret Vault
              </h3>
              <p className="text-[10px] text-slate-400">{safeUsername} • End-to-End PIN Locked</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PIN Lock Screen */}
        {!isUnlocked ? (
          <form
            onSubmit={handleVerifyOrCreatePin}
            className="flex flex-1 flex-col items-center justify-center p-6 text-center space-y-4"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-400">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-white">
                {savedPin ? 'Enter Private Security PIN' : 'Set Your Private Security PIN'}
              </h4>
              <p className="mt-1 text-xs text-slate-400 max-w-xs">
                {savedPin
                  ? 'Direct Chat, Voice Notes और Private Study Group खोलने के लिए अपना PIN डालें।'
                  : 'पहली बार अपना 4-6 अंकों का निजी PIN सेट करें।'}
              </p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              className="w-44 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-center text-lg font-extrabold tracking-widest text-amber-300 focus:border-amber-400 focus:outline-none"
              autoFocus
            />
            {pinError && (
              <p className="text-xs font-semibold text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {pinError}
              </p>
            )}
            <button
              type="submit"
              className="rounded-2xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
            >
              {savedPin ? 'Unlock Secret Vault' : 'Save PIN & Enter'}
            </button>
          </form>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('dm')}
                className={`rounded-xl px-2.5 py-1.5 ${
                  activeTab === 'dm'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                Direct Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('group')}
                className={`rounded-xl px-2.5 py-1.5 flex items-center gap-1 ${
                  activeTab === 'group'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Users className="w-3 h-3" /> Private Group
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ncert')}
                className={`rounded-xl px-2.5 py-1.5 flex items-center gap-1 ${
                  activeTab === 'ncert'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                <BookOpen className="w-3 h-3" /> NCERT Recall
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('blocked')}
                className={`ml-auto rounded-xl px-2 py-1.5 ${
                  activeTab === 'blocked'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
                title="Blocked Users"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'ncert' ? (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                <p className="text-[11px] text-slate-400">
                  NCERT की महत्वपूर्ण पंक्तियों के रिक्त स्थान याद करें और टैप करके उत्तर जांचें:
                </p>
                {NCERT_ACTIVE_RECALL_CARDS.map((card) => {
                  const shown = !!revealedCards[card.id];
                  return (
                    <div
                      key={card.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-emerald-400">{card.subject}</span>
                        <span className="text-slate-400">{card.chapter}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-100">
                        {formatNeetExamText(card.statementWithBlank)}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        {shown ? (
                          <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-extrabold text-emerald-300">
                            उत्तर: {formatNeetExamText(card.answer)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">उत्तर छिपा हुआ है</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedCards((p) => ({ ...p, [card.id]: !p[card.id] }))
                          }
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-indigo-300 hover:bg-slate-700"
                        >
                          {shown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {shown ? 'छिपाएं' : 'उत्तर देखें'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : activeTab === 'blocked' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <h4 className="text-xs font-extrabold text-rose-400">
                  आपके द्वारा ब्लॉक किए गए यूज़र्स ({blockedUsers.length})
                </h4>
                {blockedUsers.length === 0 ? (
                  <p className="text-xs text-slate-400">अभी आपने किसी को ब्लॉक नहीं किया है।</p>
                ) : (
                  blockedUsers.map((u) => (
                    <div
                      key={u}
                      className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-xs"
                    >
                      <span className="font-bold">{u}</span>
                      <button
                        type="button"
                        onClick={() => toggleBlockHandle(u)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                      >
                        <Unlock className="w-3 h-3" /> Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Channel Selector */}
                {activeTab === 'dm' ? (
                  <form
                    onSubmit={handleStartDirectChat}
                    className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/40 px-3 py-2"
                  >
                    <input
                      type="text"
                      value={peerHandle}
                      onChange={(e) => setPeerHandle(e.target.value)}
                      placeholder="दोस्त का @username लिखें..."
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Open
                    </button>
                    {peerHandle.trim() && (
                      <button
                        type="button"
                        onClick={() => toggleBlockHandle(peerHandle)}
                        className="rounded-xl bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-300"
                        title="Block/Unblock this user"
                      >
                        Block
                      </button>
                    )}
                  </form>
                ) : !myGroup ? (
                  <div className="p-4 space-y-3 border-b border-slate-800 bg-slate-950/40">
                    <form onSubmit={handleCreatePrivateGroup} className="space-y-2">
                      <p className="text-[11px] font-bold text-amber-300">
                        1 User = 1 Private Study Group (6-Digit Secret Code)
                      </p>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="ग्रुप का नाम लिखें..."
                          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                        />
                        <button
                          type="submit"
                          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Create
                        </button>
                      </div>
                    </form>
                    <form onSubmit={handleJoinPrivateGroup} className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={6}
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value)}
                        placeholder="6-अंकों का कोड डालकर जुड़ें..."
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
                    <div>
                      <span className="font-extrabold text-white">{myGroup.name}</span>
                      <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">
                        Code: {myGroup.code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMyGroup(null);
                        localStorage.removeItem(MY_GROUP_KEY);
                      }}
                      className="text-[10px] text-rose-400 hover:underline"
                    >
                      Leave
                    </button>
                  </div>
                )}

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                  {!activeChannelKey ? (
                    <div className="flex h-full items-center justify-center text-center text-xs text-slate-400 p-4">
                      ऊपर दोस्त का @username डालें या अपना 6-Digit Private Study Group खोलें।
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center text-xs text-slate-400 p-4">
                      यह एन्क्रिप्टेड प्राइवेट चैट खाली है। पहला संदेश या 15-सेकंड का Voice Note भेजें!
                    </div>
                  ) : (
                    messages.map((m) => {
                      const mine = m.sender_id === safeStudentId;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col max-w-[84%] ${
                            mine ? 'ml-auto items-end' : 'mr-auto items-start'
                          }`}
                        >
                          <span className="mb-0.5 px-1 text-[10px] text-slate-400">
                            {mine ? 'You' : `${m.sender_name} (${m.sender_username})`}
                          </span>
                          <div
                            className={`rounded-2xl px-3 py-2 text-xs ${
                              mine
                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                : 'bg-slate-800 text-slate-100 rounded-tl-sm'
                            }`}
                          >
                            {m.audio_data ? (
                              <div className="space-y-1">
                                <div className="text-[11px] font-bold">{m.text}</div>
                                <audio controls src={m.audio_data} className="h-8 w-52" />
                              </div>
                            ) : (
                              formatNeetExamText(m.text)
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
                  <div ref={bottomRef} />
                </div>

                {/* Input Bar */}
                {activeChannelKey && (
                  <form
                    onSubmit={handleSendText}
                    className="flex items-center gap-1.5 border-t border-slate-800 bg-slate-950 p-2.5"
                  >
                    <button
                      type="button"
                      onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isRecording
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-slate-800 text-slate-300 hover:text-amber-400'
                      }`}
                      title={isRecording ? 'Stop Voice Note' : 'Record 15s Voice Note'}
                    >
                      {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder={
                        isRecording
                          ? `Recording... ${recordSeconds}s / 15s`
                          : 'प्राइवेट संदेश लिखें...'
                      }
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !textInput.trim()}
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
