import React, { useState, useEffect, useRef } from 'react';
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

interface SecretMessageItem {
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

const getSavedPin = (student: StudentProfile | null): string => {
  try {
    const profilePin = (student as any)?.security_pin;
    if (typeof profilePin === 'string' && profilePin.trim()) return profilePin.trim();
    return (localStorage.getItem(PIN_KEY) || '').trim();
  } catch {
    return '';
  }
};

export const SecretDirectChatModal: React.FC<SecretDirectChatModalProps> = ({
  isOpen,
  onClose,
  currentStudent,
  settings,
  onRequireLogin,
}) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [savedPin, setSavedPin] = useState('');

  const [activeTab, setActiveTab] = useState<'dm' | 'group' | 'ncert' | 'blocked'>('dm');
  const [peerHandle, setPeerHandle] = useState('');
  const [activeDmChannel, setActiveDmChannel] = useState('');

  const [myGroup, setMyGroup] = useState<{ code: string; name: string } | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [messages, setMessages] = useState<SecretMessageItem[]>([]);
  const [outboxQueue, setOutboxQueue] = useState<SecretMessageItem[]>([]);
  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsUnlocked(false);
      setPinInput('');
      setPinError('');
      setSavedPin(getSavedPin(currentStudent));
      try {
        const g = localStorage.getItem(MY_GROUP_KEY);
        if (g) setMyGroup(JSON.parse(g));
        const b = localStorage.getItem(BLOCKED_USERS_KEY);
        if (b) setBlockedUsers(JSON.parse(b));
        const q = localStorage.getItem(SECRET_QUEUE_KEY);
        if (q) setOutboxQueue(JSON.parse(q));
      } catch {}
    }
  }, [isOpen, currentStudent]);

  const safeStudentId = String(currentStudent?.id || 'guest_user');
  const safeStudentName = String(
    currentStudent?.full_name || (currentStudent as any)?.name || 'NEET Aspirant'
  );
  const cleanHandle = String(
    (currentStudent as any)?.username ||
      safeStudentName.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      'aspirant'
  ).replace(/^@+/, '');
  const safeUsername = `@${cleanHandle}`;

  const activeChannelKey =
    activeTab === 'dm'
      ? activeDmChannel
      : activeTab === 'group' && myGroup?.code
      ? `grp_${myGroup.code}`
      : '';

  const getClient = () => {
    try {
      const env = (import.meta as any)?.env || {};
      const url = String(settings?.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
      const key = String(settings?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (!url || !key) return null;
      return createClient(url, key);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!isOpen || !isUnlocked || !activeChannelKey) return;
    let active = true;
    const localStuck = outboxQueue.filter((m) => m.channel_key === activeChannelKey);
    const client = getClient();

    if (!client) {
      setMessages(localStuck);
      return;
    }

    client
      .from('secret_messages')
      .select('*')
      .eq('channel_key', activeChannelKey)
      .order('created_at', { ascending: true })
      .limit(60)
      .then(({ data }) => {
        if (!active) return;
        const rows = Array.isArray(data) ? data : [];
        setMessages([
          ...rows.map((r: any) => ({ ...r, status: 'sent' as const })),
          ...localStuck,
        ]);
      })
      .catch(() => {
        if (active) setMessages(localStuck);
      });

    return () => {
      active = false;
    };
  }, [isOpen, isUnlocked, activeChannelKey, outboxQueue]);

  if (!isOpen) return null;

  const handlePinSubmit = (e: React.FormEvent) => {
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
      setSavedPin(clean);
      setIsUnlocked(true);
      setPinError('');
      return;
    }
    if (clean === savedPin) {
      setIsUnlocked(true);
      setPinError('');
    } else {
      setPinError('गलत Security PIN! कृपया सही PIN डालें।');
    }
  };

  const handleStartDm = (e: React.FormEvent) => {
    e.preventDefault();
    const peer = peerHandle.trim().toLowerCase().replace(/^@+/, '');
    if (!peer) return;
    if (blockedUsers.includes(`@${peer}`)) {
      setPinError(`@${peer} को आपने ब्लॉक किया हुआ है।`);
      return;
    }
    const pair = [cleanHandle.toLowerCase(), peer].sort().join('__');
    setActiveDmChannel(`dm_${pair}`);
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (myGroup) return;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const name = newGroupName.trim() || `${safeStudentName}'s NEET Study Group`;
    const created = { code, name };
    setMyGroup(created);
    try {
      localStorage.setItem(MY_GROUP_KEY, JSON.stringify(created));
    } catch {}
    setNewGroupName('');
  };

  const handleJoinGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return;
    const joined = { code, name: `Private Group #${code}` };
    setMyGroup(joined);
    try {
      localStorage.setItem(MY_GROUP_KEY, JSON.stringify(joined));
    } catch {}
    setJoinCodeInput('');
  };

  const sendDraftMessage = async (draft: SecretMessageItem) => {
    const client = getClient();
    if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      const stuck: SecretMessageItem = { ...draft, status: 'stuck' };
      const nextQ = [...outboxQueue.filter((q) => q.id !== draft.id), stuck];
      setOutboxQueue(nextQ);
      try {
        localStorage.setItem(SECRET_QUEUE_KEY, JSON.stringify(nextQ));
      } catch {}
      setMessages((prev) => [...prev.filter((m) => m.id !== draft.id), stuck]);
      return;
    }

    try {
      const { error } = await client.from('secret_messages').insert([
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

      const sent: SecretMessageItem = { ...draft, status: 'sent' };
      const nextQ = outboxQueue.filter((q) => q.id !== draft.id);
      setOutboxQueue(nextQ);
      try {
        localStorage.setItem(SECRET_QUEUE_KEY, JSON.stringify(nextQ));
      } catch {}
      setMessages((prev) => [...prev.filter((m) => m.id !== draft.id), sent]);
    } catch {
      const stuck: SecretMessageItem = { ...draft, status: 'stuck' };
      const nextQ = [...outboxQueue.filter((q) => q.id !== draft.id), stuck];
      setOutboxQueue(nextQ);
      try {
        localStorage.setItem(SECRET_QUEUE_KEY, JSON.stringify(nextQ));
      } catch {}
      setMessages((prev) => [...prev.filter((m) => m.id !== draft.id), stuck]);
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
    await sendDraftMessage({
      id: `sec_${Date.now()}`,
      channel_key: activeChannelKey,
      sender_id: safeStudentId,
      sender_name: safeStudentName,
      sender_username: safeUsername,
      text: clean,
      status: 'sent',
      created_at: new Date().toISOString(),
    });
    setSending(false);
  };

  const stopRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
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
          await sendDraftMessage({
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
          });
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
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setPinError('Microphone की अनुमति दें ताकि 15s Voice Note रिकॉर्ड हो सके।');
    }
  };

  const toggleBlockUser = (handle: string) => {
    const norm = `@${handle.replace(/^@+/, '').toLowerCase()}`;
    const next = blockedUsers.includes(norm)
      ? blockedUsers.filter((u) => u !== norm)
      : [...blockedUsers, norm];
    setBlockedUsers(next);
    try {
      localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <MessageSquareLock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white">
                DINU SARAN • Secret Vault
              </h3>
              <p className="text-[10px] text-slate-400">{safeUsername} • PIN Protected</p>
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

        {/* PIN Screen */}
        {!isUnlocked ? (
          <form
            onSubmit={handlePinSubmit}
            className="flex flex-1 flex-col items-center justify-center space-y-4 p-6 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/15 text-amber-400">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-white">
                {savedPin ? 'Enter Private Security PIN' : 'Create Private Security PIN'}
              </h4>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                {savedPin
                  ? 'अपनी निजी Direct Chat, Voice Notes और Study Group खोलने के लिए PIN डालें।'
                  : 'पहली बार अपना 4-6 अंकों का Security PIN सेट करें।'}
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
            />
            {pinError && (
              <p className="flex items-center gap-1 text-xs font-semibold text-rose-400">
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
            {/* Tabs */}
            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('dm')}
                className={`rounded-xl px-2.5 py-1.5 ${
                  activeTab === 'dm' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                Direct Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('group')}
                className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${
                  activeTab === 'group' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Users className="w-3 h-3" /> Private Group
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ncert')}
                className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 ${
                  activeTab === 'ncert' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <BookOpen className="w-3 h-3" /> NCERT Recall
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('blocked')}
                className={`ml-auto rounded-xl px-2 py-1.5 ${
                  activeTab === 'blocked' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeTab === 'ncert' ? (
              <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                {NCERT_ACTIVE_RECALL_CARDS.map((card) => {
                  const shown = !!revealedCards[card.id];
                  return (
                    <div
                      key={card.id}
                      className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-3"
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
                          <span className="text-[11px] text-slate-500">उत्तर छिपा है</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedCards((p) => ({ ...p, [card.id]: !p[card.id] }))
                          }
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-indigo-300"
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
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                <h4 className="text-xs font-extrabold text-rose-400">
                  Blocked Users ({blockedUsers.length})
                </h4>
                {blockedUsers.length === 0 ? (
                  <p className="text-xs text-slate-400">कोई यूज़र ब्लॉक नहीं है।</p>
                ) : (
                  blockedUsers.map((u) => (
                    <div
                      key={u}
                      className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-xs"
                    >
                      <span className="font-bold">{u}</span>
                      <button
                        type="button"
                        onClick={() => toggleBlockUser(u)}
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
                {activeTab === 'dm' ? (
                  <form
                    onSubmit={handleStartDm}
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
                        onClick={() => toggleBlockUser(peerHandle)}
                        className="rounded-xl bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-300"
                      >
                        Block
                      </button>
                    )}
                  </form>
                ) : !myGroup ? (
                  <div className="space-y-2.5 border-b border-slate-800 bg-slate-950/40 p-3.5">
                    <form onSubmit={handleCreateGroup} className="space-y-1.5">
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
                    <form onSubmit={handleJoinGroup} className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={6}
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value)}
                        placeholder="6-अंकों का कोड डालें..."
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
                        try {
                          localStorage.removeItem(MY_GROUP_KEY);
                        } catch {}
                      }}
                      className="text-[10px] text-rose-400 hover:underline"
                    >
                      Leave
                    </button>
                  </div>
                )}

                <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                  {!activeChannelKey ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                      ऊपर दोस्त का @username डालें या अपना 6-Digit Private Study Group खोलें।
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                      पहला संदेश या 15-सेकंड का Voice Note भेजें!
                    </div>
                  ) : (
                    messages.map((m) => {
                      const mine = m.sender_id === safeStudentId;
                      return (
                        <div
                          key={m.id}
                          className={`flex max-w-[84%] flex-col ${
                            mine ? 'ml-auto items-end' : 'mr-auto items-start'
                          }`}
                        >
                          <span className="mb-0.5 px-1 text-[10px] text-slate-400">
                            {mine ? 'You' : `${m.sender_name} (${m.sender_username})`}
                          </span>
                          <div
                            className={`rounded-2xl px-3 py-2 text-xs ${
                              mine
                                ? 'rounded-tr-sm bg-indigo-600 text-white'
                                : 'rounded-tl-sm bg-slate-800 text-slate-100'
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
                                onClick={() => sendDraftMessage(m)}
                                className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-bold"
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

                {activeChannelKey && (
                  <form
                    onSubmit={handleSendText}
                    className="flex items-center gap-1.5 border-t border-slate-800 bg-slate-950 p-2.5"
                  >
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isRecording
                          ? 'animate-pulse bg-rose-600 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
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
