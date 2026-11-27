import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Send,
  Bot,
  Sparkles,
  Users,
  Loader2,
  RefreshCw,
  Reply,
  X,
  Pin,
  Trash2,
  ImagePlus,
  ShieldCheck,
  Database,
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';

export interface CommunityMessage {
  id: string;
  student_id: string;
  student_name: string;
  batch_name?: string;
  subject?: string;
  image_data?: string | null;
  reply_to_id?: string | null;
  reply_to_name?: string | null;
  reply_to_text?: string | null;
  is_pinned?: boolean;
  is_ai: boolean;
  message: string;
  created_at: string;
}

interface CommunityChatViewProps {
  currentStudent: StudentProfile | null;
  settings: AppSettings;
  onRequireLogin: () => void;
  isAdmin?: boolean;
}

const SUBJECTS = ['All', 'Physics', 'Chemistry', 'Biology', 'General'] as const;
type SubjectTab = (typeof SUBJECTS)[number];

const SERVER_FETCH_LIMIT = 50;
const LOCAL_DB_NAME = 'dinu_neet2027_community_db';
const LOCAL_STORE_NAME = 'messages_vault';

// --- Local IndexedDB Helpers (Stores unlimited full history on user's device) ---
const openLocalVault = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
        db.createObjectStore(LOCAL_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const readAllLocalMessages = async (): Promise<CommunityMessage[]> => {
  try {
    const db = await openLocalVault();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as CommunityMessage[]) || [];
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
};

const upsertLocalMessages = async (msgs: CommunityMessage[]): Promise<void> => {
  if (!msgs.length) return;
  try {
    const db = await openLocalVault();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      msgs.forEach((m) => store.put(m));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage quota issues silently
  }
};

const removeLocalMessage = async (id: string): Promise<void> => {
  try {
    const db = await openLocalVault();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      tx.objectStore(LOCAL_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
    });
  } catch {
    // Ignore
  }
};

const clearAllLocalMessages = async (): Promise<void> => {
  try {
    const db = await openLocalVault();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      tx.objectStore(LOCAL_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
    });
  } catch {
    // Ignore
  }
};

const mergeMessageLists = (
  localList: CommunityMessage[],
  serverList: CommunityMessage[]
): CommunityMessage[] => {
  const map = new Map<string, CommunityMessage>();
  localList.forEach((m) => map.set(m.id, m));
  serverList.forEach((m) => map.set(m.id, m)); // Server has freshest pin/update state
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
};

const compressImageToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas error'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const CommunityChatView: React.FC<CommunityChatViewProps> = ({
  currentStudent,
  settings,
  onRequireLogin,
  isAdmin = false,
}) => {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<SubjectTab>('All');
  const [postSubject, setPostSubject] = useState<Exclude<SubjectTab, 'All'>>('General');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommunityMessage | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(isAdmin);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isAdmin) {
      setAdminUnlocked(true);
      return;
    }
    try {
      const savedAdmin =
        localStorage.getItem('dinu_admin_unlocked') === 'true' ||
        sessionStorage.getItem('dinu_admin_unlocked') === 'true';
      const studentRole =
        (currentStudent as any)?.role === 'admin' || (currentStudent as any)?.is_admin === true;
      if (savedAdmin || studentRole) setAdminUnlocked(true);
    } catch {
      // Ignore
    }
  }, [isAdmin, currentStudent]);

  const supabase = useMemo(() => {
    const env = (import.meta as { env?: Record<string, string> }).env || {};
    const url = (settings.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
    const key = (settings.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return null;
    return createClient(url, key);
  }, [settings.supabaseUrl, settings.supabaseAnonKey]);

  const syncMessages = async () => {
    // 1. Load user's full local history immediately so old messages never vanish
    const localHistory = await readAllLocalMessages();
    if (localHistory.length > 0) {
      setMessages(localHistory);
      setLoading(false);
    }

    if (!supabase) {
      setErrorMsg('Supabase URL या Anon Key सेट नहीं है। कृपया Settings में जांचें।');
      setLoading(false);
      return;
    }

    try {
      setErrorMsg(null);
      // 2. Fetch latest rolling window + pinned messages from Supabase server
      const [latestRes, pinnedRes] = await Promise.all([
        supabase
          .from('community_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(SERVER_FETCH_LIMIT),
        supabase
          .from('community_messages')
          .select('*')
          .eq('is_pinned', true)
          .order('created_at', { ascending: true }),
      ]);

      if (latestRes.error) throw latestRes.error;

      const serverLatest = ((latestRes.data as CommunityMessage[]) || []).reverse();
      const serverPinned = (pinnedRes.data as CommunityMessage[]) || [];
      const combinedServer = mergeMessageLists(serverLatest, serverPinned);

      // Save newly fetched server messages into user's permanent local DB
      await upsertLocalMessages(combinedServer);

      // Merge user's full local DB with server's latest rolling messages
      const merged = mergeMessageLists(localHistory, combinedServer);
      setMessages(merged);
    } catch (err: any) {
      setErrorMsg(err?.message || 'चैट सिंक करने में समस्या आई।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncMessages();
    if (!supabase) return;

    const channel = supabase
      .channel('public:community_messages_hybrid')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_messages' },
        async (payload) => {
          const incoming = payload.new as CommunityMessage;
          await upsertLocalMessages([incoming]);
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : mergeMessageLists(prev, [incoming])
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'community_messages' },
        async (payload) => {
          const updated = payload.new as CommunityMessage;
          await upsertLocalMessages([updated]);
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'community_messages' },
        async (payload) => {
          // Note: Auto-trim deletions from server are NOT deleted from user's local vault!
          // Only explicit user/admin deletes inside the app remove from local DB.
          void payload;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, aiThinking]);

  const handleClearLocalVault = async () => {
    if (!window.confirm('क्या आप अपने डिवाइस की पुरानी लोकल चैट हिस्ट्री साफ़ करना चाहते हैं? (सर्वर के लेटेस्ट 50 मैसेज बने रहेंगे)')) {
      return;
    }
    await clearAllLocalMessages();
    setMessages([]);
    setLoading(true);
    await syncMessages();
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file);
      setAttachedImage(compressed);
    } catch {
      setErrorMsg('फ़ोटो प्रोसेस करने में समस्या आई। कृपया दूसरी फ़ोटो चुनें।');
    } finally {
      e.target.value = '';
    }
  };

  const handleTogglePin = async (msg: CommunityMessage) => {
    if (!supabase || !adminUnlocked) return;
    const nextPin = !msg.is_pinned;
    const updatedMsg = { ...msg, is_pinned: nextPin };
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? updatedMsg : m)));
    await upsertLocalMessages([updatedMsg]);

    const { error } = await supabase
      .from('community_messages')
      .update({ is_pinned: nextPin })
      .eq('id', msg.id);
    if (error) {
      setErrorMsg('Pin अपडेट नहीं हो पाया: ' + error.message);
    }
  };

  const handleDeleteMessage = async (msg: CommunityMessage) => {
    const isOwner = currentStudent && msg.student_id === currentStudent.id && !msg.is_ai;
    if (!adminUnlocked && !isOwner) return;

    // Remove from both user's local DB and Supabase server
    await removeLocalMessage(msg.id);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));

    if (supabase) {
      await supabase.from('community_messages').delete().eq('id', msg.id);
    }
  };

  const triggerDinuAiReply = async (
    historySnapshot: CommunityMessage[],
    latestPrompt: string,
    triggerMsg: CommunityMessage
  ) => {
    if (!supabase) return;
    const envKey = (import.meta as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY?.trim();
    const activeKey = settings.apiKey?.trim() || settings.backupApiKey?.trim() || envKey;
    if (!activeKey) return;

    setAiThinking(true);
    try {
      const recentChat = historySnapshot
        .slice(-25)
        .map((m) => {
          const replyNote = m.reply_to_name ? ` (replying to ${m.reply_to_name}: "${m.reply_to_text}")` : '';
          const imgNote = m.image_data ? ' [Attached Image]' : '';
          return `[${m.subject || 'General'}] ${m.is_ai ? 'DINU AI' : m.student_name}${replyNote}${imgNote}: ${m.message}`;
        })
        .join('\n');

      const model = settings.modelId || 'gemini-2.5-flash';
      const systemInstruction =
        'You are DINU AI, the smart NEET UG mentor inside Dinu Saran NEET 2027 Student Community Chat. ' +
        'You have read the recent group conversation and any attached doubt image. ' +
        'Reply ONLY because a student tagged @dinu. Give a clear, step-by-step NCERT-accurate answer in Hindi + English terms.';

      const replyContext = triggerMsg.reply_to_name
        ? `\nReplied-to Message (${triggerMsg.reply_to_name}): ${triggerMsg.reply_to_text}`
        : '';
      const fullPrompt = `Recent Community Chat Context:\n${recentChat}${replyContext}\n\nLatest Tagged Request:\n${latestPrompt}`;

      const userParts: any[] = [{ text: fullPrompt }];

      const visionImage =
        triggerMsg.image_data ||
        (triggerMsg.reply_to_id
          ? historySnapshot.find((m) => m.id === triggerMsg.reply_to_id)?.image_data
          : null);

      if (visionImage && visionImage.startsWith('data:image/')) {
        const [meta, base64Data] = visionImage.split(',');
        const mimeType = meta.replace('data:', '').replace(';base64', '') || 'image/jpeg';
        if (base64Data) {
          userParts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: userParts }],
          }),
        }
      );

      const data = await res.json();
      const replyText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        'माफ़ करें, अभी जवाब जनरेट नहीं हो पाया। कृपया @dinu के साथ दोबारा पूछें।';

      const { data: aiInserted } = await supabase
        .from('community_messages')
        .insert([
          {
            student_id: 'dinu-ai-bot',
            student_name: 'DINU AI',
            batch_name: 'AI Mentor',
            subject: triggerMsg.subject || 'General',
            reply_to_id: triggerMsg.id,
            reply_to_name: triggerMsg.student_name,
            reply_to_text: (triggerMsg.message || 'Photo Doubt').slice(0, 90),
            is_ai: true,
            message: replyText,
          },
        ])
        .select()
        .single();

      if (aiInserted) {
        await upsertLocalMessages([aiInserted as CommunityMessage]);
      }
    } catch {
      // Silent fail
    } finally {
      setAiThinking(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !attachedImage) || sending) return;
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    if (!supabase) {
      setErrorMsg('Supabase कनेक्ट नहीं है।');
      return;
    }

    setSending(true);
    const currentImage = attachedImage;
    const currentReply = replyingTo;
    setInput('');
    setAttachedImage(null);
    setReplyingTo(null);
    setErrorMsg(null);

    try {
      const displayName =
        currentStudent.full_name?.trim() ||
        (currentStudent as any).name?.trim() ||
        'NEET Aspirant';
      const displayBatch = currentStudent.attempt_status || 'NEET 2027';
      const activeSubject = selectedSubject !== 'All' ? selectedSubject : postSubject;

      const { data, error } = await supabase
        .from('community_messages')
        .insert([
          {
            student_id: String(currentStudent.id || 'student-user'),
            student_name: displayName,
            batch_name: displayBatch,
            subject: activeSubject,
            image_data: currentImage,
            reply_to_id: currentReply?.id || null,
            reply_to_name: currentReply?.student_name || null,
            reply_to_text: currentReply
              ? (currentReply.message || '📷 Photo').slice(0, 90)
              : null,
            is_ai: false,
            message: text || '📷 Photo Doubt',
          },
        ])
        .select()
        .single();

      if (error) throw error;

      const insertedMsg = data as CommunityMessage;
      await upsertLocalMessages([insertedMsg]);

      const updatedHistory = messages.some((m) => m.id === insertedMsg.id)
        ? messages
        : mergeMessageLists(messages, [insertedMsg]);
      setMessages(updatedHistory);

      if (/@dinu\b/i.test(text)) {
        await triggerDinuAiReply(updatedHistory, `${displayName}: ${text}`, insertedMsg);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'मैसेज भेजने में त्रुटि हुई।');
      setInput(text);
      setAttachedImage(currentImage);
      setReplyingTo(currentReply);
    } finally {
      setSending(false);
    }
  };

  const insertTag = () => {
    if (!input.toLowerCase().includes('@dinu')) {
      setInput((prev) => (prev ? `${prev} @dinu ` : '@dinu '));
    }
  };

  const pinnedMessages = useMemo(() => messages.filter((m) => m.is_pinned), [messages]);

  const visibleMessages = useMemo(() => {
    return messages.filter((m) => {
      if (showPinnedOnly && !m.is_pinned) return false;
      if (selectedSubject !== 'All' && (m.subject || 'General') !== selectedSubject) {
        return false;
      }
      return true;
    });
  }, [messages, selectedSubject, showPinnedOnly]);

  const subjectBadgeColor = (subj?: string) => {
    switch (subj) {
      case 'Physics':
        return 'bg-sky-500/15 text-sky-600 dark:text-sky-300';
      case 'Chemistry':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300';
      case 'Biology':
        return 'bg-rose-500/15 text-rose-600 dark:text-rose-300';
      default:
        return 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-115px)] max-w-2xl flex-col rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-extrabold">NEET 2027 Student Community</h2>
              {adminUnlocked && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
            <p className="text-[10px] text-indigo-100 flex items-center gap-1">
              <Database className="w-3 h-3" /> Local Saved: {messages.length} msgs • AI के लिए{' '}
              <span className="font-bold text-amber-300">@dinu</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClearLocalVault}
            className="rounded-xl p-2 hover:bg-white/15 text-indigo-100"
            title="Clear Local Device Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={syncMessages}
            className="rounded-xl p-2 hover:bg-white/15"
            title="Sync Latest Chats"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Subject Filter & Pinned Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 px-3 py-2 no-scrollbar">
        {SUBJECTS.map((subj) => {
          const active = !showPinnedOnly && selectedSubject === subj;
          return (
            <button
              key={subj}
              type="button"
              onClick={() => {
                setShowPinnedOnly(false);
                setSelectedSubject(subj);
                if (subj !== 'All') setPostSubject(subj);
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {subj}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowPinnedOnly((prev) => !prev)}
          className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition ${
            showPinnedOnly
              ? 'bg-amber-500 text-white'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          }`}
        >
          <Pin className="w-3 h-3" /> Pinned ({pinnedMessages.length})
        </button>
      </div>

      {/* Top Pinned Banner */}
      {!showPinnedOnly && pinnedMessages.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPinnedOnly(true)}
          className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 text-left text-[11px] text-amber-800 dark:text-amber-200"
        >
          <span className="truncate flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <strong className="shrink-0">Pinned:</strong>
            <span className="truncate">{pinnedMessages[pinnedMessages.length - 1].message}</span>
          </span>
          <span className="ml-2 shrink-0 text-[10px] font-bold underline">
            देखें ({pinnedMessages.length})
          </span>
        </button>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 dark:bg-slate-950/60">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            कम्युनिटी चैट लोड हो रही है...
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-xs text-slate-500">
            <Sparkles className="w-8 h-8 text-indigo-400 mb-2" />
            <p className="font-bold text-slate-700 dark:text-slate-300">
              {showPinnedOnly ? 'अभी कोई Pinned मैसेज नहीं है' : 'इस सेक्शन में अभी कोई मैसेज नहीं है'}
            </p>
            <p className="mt-1">
              पहला डाउट या फ़ोटो भेजें और <span className="font-bold text-indigo-500">@dinu</span> से मदद लें!
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMine = currentStudent && msg.student_id === currentStudent.id && !msg.is_ai;
            const canDelete = adminUnlocked || isMine;
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[88%] ${
                  isMine ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                {/* Header Row */}
                <div className="mb-1 flex flex-wrap items-center gap-1.5 px-1 text-[10px] text-slate-500">
                  {msg.is_ai ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-extrabold text-amber-600 dark:text-amber-300">
                      <Bot className="w-3 h-3" /> DINU AI
                    </span>
                  ) : (
                    <>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {isMine ? 'You' : msg.student_name}
                      </span>
                      {msg.batch_name && (
                        <span className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 text-[9px]">
                          {msg.batch_name}
                        </span>
                      )}
                    </>
                  )}
                  {msg.subject && msg.subject !== 'General' && (
                    <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${subjectBadgeColor(msg.subject)}`}>
                      {msg.subject}
                    </span>
                  )}
                  {msg.is_pinned && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-300">
                      <Pin className="w-2.5 h-2.5" /> Pinned
                    </span>
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-xs whitespace-pre-wrap leading-relaxed shadow-sm ${
                    msg.is_ai
                      ? 'bg-gradient-to-br from-amber-50 to-indigo-50 dark:from-indigo-950/80 dark:to-slate-900 border border-indigo-500/30 text-slate-900 dark:text-slate-100 rounded-tl-sm'
                      : isMine
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-tl-sm'
                  }`}
                >
                  {msg.reply_to_name && (
                    <div
                      className={`mb-2 rounded-xl border-l-2 px-2.5 py-1.5 text-[11px] ${
                        isMine
                          ? 'border-amber-300 bg-white/15 text-indigo-100'
                          : 'border-indigo-500 bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-bold text-[10px]">{msg.reply_to_name}</div>
                      <div className="line-clamp-2 opacity-90">{msg.reply_to_text}</div>
                    </div>
                  )}

                  {msg.image_data && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(msg.image_data || null)}
                      className="mb-2 block overflow-hidden rounded-xl border border-black/10"
                    >
                      <img
                        src={msg.image_data}
                        alt="Doubt attachment"
                        className="max-h-56 w-auto object-contain"
                      />
                    </button>
                  )}

                  <div>{msg.message}</div>
                </div>

                {/* Quick Actions */}
                <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-slate-400">
                  <button
                    type="button"
                    onClick={() => setReplyingTo(msg)}
                    className="inline-flex items-center gap-0.5 hover:text-indigo-500"
                  >
                    <Reply className="w-3 h-3" /> Reply
                  </button>
                  {adminUnlocked && (
                    <button
                      type="button"
                      onClick={() => handleTogglePin(msg)}
                      className={`inline-flex items-center gap-0.5 ${
                        msg.is_pinned ? 'text-amber-500 font-bold' : 'hover:text-amber-500'
                      }`}
                    >
                      <Pin className="w-3 h-3" /> {msg.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg)}
                      className="inline-flex items-center gap-0.5 hover:text-rose-500"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {aiThinking && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-950/60 px-3.5 py-2 text-xs text-indigo-700 dark:text-indigo-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            DINU AI चैट और फ़ोटो पढ़कर जवाब तैयार कर रहा है...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          {errorMsg}
        </div>
      )}

      {/* Reply Preview Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-indigo-50/80 dark:bg-indigo-950/50 px-3.5 py-1.5 text-[11px]">
          <div className="truncate">
            <span className="font-bold text-indigo-600 dark:text-indigo-300">
              Replying to {replyingTo.student_name}:{' '}
            </span>
            <span className="text-slate-600 dark:text-slate-300">{replyingTo.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="ml-2 rounded p-0.5 text-slate-500 hover:text-rose-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attached Photo Preview Banner */}
      {attachedImage && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <img
              src={attachedImage}
              alt="Selected"
              className="h-11 w-11 rounded-lg object-cover border border-slate-300"
            />
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              फ़ोटो तैयार है (AI से हल करवाने के लिए <span className="text-amber-500">@dinu</span> लिखें)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAttachedImage(null)}
            className="rounded-lg p-1 text-slate-500 hover:text-rose-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={handleSend}
        className="flex flex-col gap-1.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
      >
        {selectedSubject === 'All' && (
          <div className="flex items-center gap-1 px-1 text-[10px] text-slate-500">
            <span>Subject:</span>
            {(['General', 'Physics', 'Chemistry', 'Biology'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPostSubject(s)}
                className={`rounded-md px-2 py-0.5 font-bold ${
                  postSubject === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImagePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-500/15 hover:text-indigo-600"
            title="Doubt Photo अपलोड करें"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={insertTag}
            className="shrink-0 rounded-xl bg-amber-500/15 px-2.5 py-2 text-[11px] font-extrabold text-amber-600 dark:text-amber-300 hover:bg-amber-500/25"
            title="AI को टैग करें"
          >
            @dinu
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              currentStudent
                ? 'डाउट लिखें या फ़ोटो भेजें (@dinu से AI पूछें)...'
                : 'चैट करने के लिए पहले Student Login करें...'
            }
            className="flex-1 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={sending || (!input.trim() && !attachedImage)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Fullscreen Image Lightbox */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <img
            src={previewImage}
            alt="Full preview"
            className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
