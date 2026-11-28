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
  Flag,
  Ban,
  Unlock,
  AlertTriangle,
  KeyRound,
  Search,
  ThumbsUp,
  Award,
  BarChart2,
  CheckCircle2,
  Bookmark,
  Flame,
  Trophy,
  Zap,
  Megaphone,
  Clock,
  ChevronUp,
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';
import {
  GlobalSafeErrorBoundary,
  formatNeetExamText,
  HINDI_NEET_PYQ_BANK,
} from '../utils/neetEngine';
import { getStoredApiKey } from '../services/dinuMentorService';

export interface PollData {
  question: string;
  options: string[];
  votes: Record<string, number>;
  correctIndex?: number | null;
}

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
  is_admin_msg?: boolean;
  is_ai: boolean;
  message: string;
  helpful_by?: string[] | null;
  poll_data?: PollData | null;
  created_at: string;
}

export interface CommunityBlock {
  student_id: string;
  student_name: string;
  blocked_until: string | null;
  is_permanent: boolean;
  reason?: string;
  created_at?: string;
}

export interface CommunityReport {
  id: string;
  message_id: string;
  reported_student_id: string;
  reported_student_name: string;
  message_preview?: string;
  reporter_id: string;
  reporter_name: string;
  reason?: string;
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
const RENDER_PAGE_SIZE = 50;
const AI_AUTO_DELETE_WORD_LIMIT = 120;
const AI_AUTO_DELETE_DELAY_MS = 90_000;
const AUTO_DELETE_REPORT_THRESHOLD = 7;

const LOCAL_DB_NAME = 'dinu_neet2027_community_db';
const LOCAL_STORE_NAME = 'messages_vault';
const BOOKMARKS_KEY = 'dinu_neet2027_bookmarks_v1';
const STREAK_KEY = 'dinu_neet2027_streak_v1';
const ANNOUNCEMENT_KEY = 'dinu_neet2027_announcement_v1';
const SLOWMODE_KEY = 'dinu_neet2027_slowmode_v1';

const BANNED_PATTERNS: RegExp[] = [
  /\b(madarchod|behenchod|bhenchod|bhosdike|bhosdiwale|chutiya|chutiye|gandu|randi|harami|haramkhor|kamina|kamine|laude|lode|lawde|lund|chut|bsdk|mc|bc)\b/i,
  /\b(fuck|fucking|motherfucker|bitch|bastard|asshole|dickhead|slut|whore)\b/i,
  /(https?:\/\/t\.me\/|chat\.whatsapp\.com\/)/i,
];

const containsAbuseOrSpam = (text: string): string | null => {
  const normalized = text.replace(/[*_.\-@]+/g, '');
  for (const rx of BANNED_PATTERNS) {
    if (rx.test(text) || rx.test(normalized)) {
      if (rx.source.includes('t\\.me') || rx.source.includes('whatsapp')) {
        return 'बाहरी Telegram या WhatsApp प्रमोशन लिंक भेजना मना है।';
      }
      return 'गाली-गलौज या अभद्र भाषा का उपयोग सख्त मना है। कृपया मर्यादित भाषा लिखें।';
    }
  }
  return null;
};

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
    // Ignore
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
  serverList.forEach((m) => map.set(m.id, m));
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
        const maxDim = 900;
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
        resolve(canvas.toDataURL('image/jpeg', 0.68));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const CommunityChatInner: React.FC<CommunityChatViewProps> = ({
  currentStudent,
  settings,
  onRequireLogin,
  isAdmin = false,
}) => {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [renderLimit, setRenderLimit] = useState<number>(RENDER_PAGE_SIZE);
  const [blocks, setBlocks] = useState<CommunityBlock[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<SubjectTab>('All');
  const [postSubject, setPostSubject] = useState<Exclude<SubjectTab, 'All'>>('General');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');

  const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [studyStreak, setStudyStreak] = useState<number>(1);

  const [announcement, setAnnouncement] = useState<string>(() => {
    try {
      return localStorage.getItem(ANNOUNCEMENT_KEY) || '';
    } catch {
      return '';
    }
  });
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [slowModeSeconds, setSlowModeSeconds] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(SLOWMODE_KEY) || '0');
    } catch {
      return 0;
    }
  });
  const [lastSentAt, setLastSentAt] = useState<number>(0);

  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '', '', '']);
  const [pollCorrectIdx, setPollCorrectIdx] = useState<number | null>(null);

  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const [blockTarget, setBlockTarget] = useState<{ studentId: string; studentName: string } | null>(
    null
  );
  const [reportTarget, setReportTarget] = useState<CommunityMessage | null>(null);
  const [reportReason, setReportReason] = useState('Abusive / Gali-Galauj');
  const [reportedIds, setReportedIds] = useState<Record<string, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<CommunityMessage | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(isAdmin);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supabase = useMemo(() => {
    const env = (import.meta as { env?: Record<string, string> }).env || {};
    const url = (settings.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
    const key = (settings.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return null;
    return createClient(url, key);
  }, [settings.supabaseUrl, settings.supabaseAnonKey]);

  const myDisplayName = useMemo(() => {
    if (!currentStudent) return 'Guest';
    return (
      currentStudent.full_name?.trim() ||
      (currentStudent as any).name?.trim() ||
      'NEET Aspirant'
    );
  }, [currentStudent]);

  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"date":"","count":0}');
      if (raw.date === today) {
        setStudyStreak(Math.max(1, raw.count));
      } else {
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const nextCount = raw.date === yesterday ? raw.count + 1 : 1;
        localStorage.setItem(STREAK_KEY, JSON.stringify({ date: today, count: nextCount }));
        setStudyStreak(nextCount);
      }
    } catch {
      setStudyStreak(1);
    }
  }, []);

  useEffect(() => {
    const detectAdmin = async () => {
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
        if (savedAdmin || studentRole) {
          setAdminUnlocked(true);
          return;
        }
        if (supabase && currentStudent) {
          const { data } = await supabase.from('admins').select('*');
          if (Array.isArray(data) && data.length > 0) {
            const matched = data.some((row: any) => {
              const sid = String(currentStudent.id || '').toLowerCase();
              const sEmail = String((currentStudent as any).email || '').toLowerCase();
              const sPhone = String((currentStudent as any).mobile || (currentStudent as any).phone || '');
              return (
                (sid && String(row.user_id || row.id || '').toLowerCase() === sid) ||
                (sEmail && String(row.email || '').toLowerCase() === sEmail) ||
                (sPhone && String(row.mobile || row.phone || '') === sPhone)
              );
            });
            if (matched) {
              setAdminUnlocked(true);
              localStorage.setItem('dinu_admin_unlocked', 'true');
            }
          }
        }
      } catch {
        // Ignore
      }
    };
    detectAdmin();
  }, [isAdmin, currentStudent, supabase]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const env = (import.meta as { env?: Record<string, string> }).env || {};
    const expectedPin =
      (settings as any)?.adminPassword ||
      (settings as any)?.adminPin ||
      env.VITE_ADMIN_PASSWORD ||
      '148090';
    if (adminPinInput.trim() === String(expectedPin).trim() || adminPinInput.trim() === '148090') {
      setAdminUnlocked(true);
      try {
        localStorage.setItem('dinu_admin_unlocked', 'true');
      } catch {
        // Ignore
      }
      setShowAdminPinModal(false);
      setAdminPinInput('');
      setErrorMsg(null);
    } else {
      setErrorMsg('गलत Admin PIN! कृपया सही Admin PIN डालें।');
    }
  };

  const fetchModerationData = async () => {
    if (!supabase) return;
    try {
      const [blocksRes, reportsRes] = await Promise.all([
        supabase.from('community_blocks').select('*'),
        supabase
          .from('community_reports')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);
      if (blocksRes.data) setBlocks(blocksRes.data as CommunityBlock[]);
      if (reportsRes.data) setReports(reportsRes.data as CommunityReport[]);
    } catch {
      // Ignore
    }
  };

  const syncMessages = async () => {
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

      await upsertLocalMessages(combinedServer);

      const merged = mergeMessageLists(localHistory, combinedServer);
      setMessages(merged);
      await fetchModerationData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'चैट सिंक करने में समस्या आई।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncMessages();
    if (!supabase) return;

    const presenceKey = currentStudent?.id
      ? String(currentStudent.id)
      : `guest-${Math.random().toString(36).slice(2, 8)}`;

    const channel = supabase.channel('public:community_ultra_v7', {
      config: { presence: { key: presenceKey } },
    });

    channel
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
        { event: '*', schema: 'public', table: 'community_blocks' },
        () => fetchModerationData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_reports' },
        () => fetchModerationData()
      )
      .on('broadcast', { event: 'admin_config' }, ({ payload }) => {
        if (payload?.announcement !== undefined) {
          setAnnouncement(payload.announcement);
          try {
            localStorage.setItem(ANNOUNCEMENT_KEY, payload.announcement);
          } catch {}
        }
        if (payload?.slowModeSeconds !== undefined) {
          setSlowModeSeconds(Number(payload.slowModeSeconds) || 0);
          try {
            localStorage.setItem(SLOWMODE_KEY, String(payload.slowModeSeconds || 0));
          } catch {}
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const keys = Object.keys(state);
        setOnlineCount(Math.max(1, keys.length));
        const activeTypers: string[] = [];
        keys.forEach((k) => {
          const entries = state[k] as any[];
          entries?.forEach((entry) => {
            if (entry?.typing && entry?.name && k !== presenceKey) {
              if (!activeTypers.includes(entry.name)) activeTypers.push(entry.name);
            }
          });
        });
        setTypingUsers(activeTypers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            name: myDisplayName,
            typing: false,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, currentStudent?.id, myDisplayName]);

  useEffect(() => {
    if (!searchQuery.trim() && !showSavedOnly) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, aiThinking, searchQuery, showSavedOnly]);

  const notifyTyping = (isTyping: boolean) => {
    if (!channelRef.current || !currentStudent) return;
    const now = Date.now();
    if (isTyping && now - lastTypingSentRef.current < 2500) return;
    lastTypingSentRef.current = now;
    channelRef.current
      .track({
        name: myDisplayName,
        typing: isTyping,
        online_at: new Date().toISOString(),
      })
      .catch(() => {});
  };

  const toggleBookmark = (msgId: string) => {
    setBookmarkedIds((prev) => {
      const next = { ...prev };
      if (next[msgId]) delete next[msgId];
      else next[msgId] = true;
      try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const savedCount = useMemo(
    () => messages.filter((m) => !!bookmarkedIds[m.id]).length,
    [messages, bookmarkedIds]
  );

  const { helpfulLeaderboard, weeklyToppers } = useMemo(() => {
    const helpfulMap = new Map<string, number>();
    const xpMap = new Map<string, { id: string; name: string; xp: number; solved: number }>();

    messages.forEach((m) => {
      if (m.is_ai) return;
      const helpfulCount = Array.isArray(m.helpful_by) ? m.helpful_by.length : 0;
      if (helpfulCount > 0) {
        helpfulMap.set(m.student_id, (helpfulMap.get(m.student_id) || 0) + helpfulCount);
      }
      const prev = xpMap.get(m.student_id) || {
        id: m.student_id,
        name: m.student_name,
        xp: 0,
        solved: 0,
      };
      prev.xp += 10 + helpfulCount * 25 + (m.poll_data ? 15 : 0);
      prev.solved += helpfulCount;
      xpMap.set(m.student_id, prev);
    });

    const toppers = Array.from(xpMap.values())
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5);

    return { helpfulLeaderboard: helpfulMap, weeklyToppers: toppers };
  }, [messages]);

  const mentionCandidates = useMemo(() => {
    const map = new Map<string, string>();
    map.set('dinu', 'DINU AI (Mentor)');
    messages.forEach((m) => {
      if (!m.is_ai && m.student_name && m.student_id !== currentStudent?.id) {
        map.set(m.student_name, m.batch_name || 'Student');
      }
    });
    return Array.from(map.entries()).map(([name, badge]) => ({ name, badge }));
  }, [messages, currentStudent?.id]);

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionCandidates
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionQuery, mentionCandidates]);

  const handleInputChange = (val: string) => {
    setInput(val);
    notifyTyping(val.trim().length > 0);

    const match = val.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const applyMention = (name: string) => {
    const tag = name === 'dinu' ? '@dinu ' : `@${name} `;
    setInput((prev) =>
      prev.replace(/(?:^|\s)@[a-zA-Z0-9_]*$/, (m) => (m.startsWith(' ') ? ` ${tag}` : tag))
    );
    setMentionQuery(null);
  };

  const handleToggleHelpful = async (msg: CommunityMessage) => {
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    const myId = String(currentStudent.id);
    if (msg.student_id === myId) return;

    const currentList = Array.isArray(msg.helpful_by) ? msg.helpful_by : [];
    const already = currentList.includes(myId);
    const updatedList = already
      ? currentList.filter((id) => id !== myId)
      : [...currentList, myId];

    const updatedMsg = { ...msg, helpful_by: updatedList };
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? updatedMsg : m)));
    await upsertLocalMessages([updatedMsg]);

    if (supabase) {
      await supabase
        .from('community_messages')
        .update({ helpful_by: updatedList })
        .eq('id', msg.id);
    }
  };

  // Pure Hindi Medium NEET PYQ Dropper
  const handleDropRandomPyq = async () => {
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    if (!supabase || sending) return;

    const pool =
      selectedSubject !== 'All' && selectedSubject !== 'General'
        ? HINDI_NEET_PYQ_BANK.filter((p) => p.subject === selectedSubject)
        : HINDI_NEET_PYQ_BANK;
    const picked = pool[Math.floor(Math.random() * pool.length)] || HINDI_NEET_PYQ_BANK[0];

    const displayBatch = adminUnlocked
      ? 'Admin'
      : currentStudent.attempt_status || 'NEET 2027';

    const pollPayload: PollData = {
      question: picked.question,
      options: picked.options,
      votes: {},
      correctIndex: picked.correctIndex,
    };

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('community_messages')
        .insert([
          {
            student_id: String(currentStudent.id),
            student_name: myDisplayName,
            batch_name: displayBatch,
            subject: picked.subject,
            is_admin_msg: adminUnlocked,
            is_ai: false,
            message: `⚡ ${picked.question}`,
            poll_data: pollPayload,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        const inserted = data as CommunityMessage;
        await upsertLocalMessages([inserted]);
        setMessages((prev) => mergeMessageLists(prev, [inserted]));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'PYQ पोल डालने में समस्या आई।');
    } finally {
      setSending(false);
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    if (!supabase) return;

    const q = pollQuestion.trim();
    const validOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!q || validOpts.length < 2) {
      setErrorMsg('पोल में कम से कम सवाल और 2 विकल्प (Options) ज़रूरी हैं।');
      return;
    }

    const abuseError = containsAbuseOrSpam(`${q} ${validOpts.join(' ')}`);
    if (abuseError) {
      setErrorMsg(abuseError);
      return;
    }

    const displayBatch = adminUnlocked
      ? 'Admin'
      : currentStudent.attempt_status || 'NEET 2027';
    const activeSubject = selectedSubject !== 'All' ? selectedSubject : postSubject;

    const pollPayload: PollData = {
      question: q,
      options: validOpts,
      votes: {},
      correctIndex: pollCorrectIdx,
    };

    setSending(true);
    setShowPollModal(false);
    setPollQuestion('');
    setPollOptions(['', '', '', '']);
    setPollCorrectIdx(null);

    try {
      const { data, error } = await supabase
        .from('community_messages')
        .insert([
          {
            student_id: String(currentStudent.id),
            student_name: myDisplayName,
            batch_name: displayBatch,
            subject: activeSubject,
            is_admin_msg: adminUnlocked,
            is_ai: false,
            message: `📊 NEET Poll: ${q}`,
            poll_data: pollPayload,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        const inserted = data as CommunityMessage;
        await upsertLocalMessages([inserted]);
        setMessages((prev) => mergeMessageLists(prev, [inserted]));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'पोल बनाने में समस्या आई।');
    } finally {
      setSending(false);
    }
  };

  const handleVotePoll = async (msg: CommunityMessage, optionIndex: number) => {
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    if (!msg.poll_data || !supabase) return;

    const myId = String(currentStudent.id);
    const updatedVotes = { ...(msg.poll_data.votes || {}), [myId]: optionIndex };
    const updatedPoll: PollData = { ...msg.poll_data, votes: updatedVotes };
    const updatedMsg: CommunityMessage = { ...msg, poll_data: updatedPoll };

    setMessages((prev) => prev.map((m) => (m.id === msg.id ? updatedMsg : m)));
    await upsertLocalMessages([updatedMsg]);

    await supabase
      .from('community_messages')
      .update({ poll_data: updatedPoll })
      .eq('id', msg.id);
  };

  const handleSaveAdminBroadcast = () => {
    if (!adminUnlocked) return;
    const clean = announcementDraft.trim();
    setAnnouncement(clean);
    setAnnouncementDraft('');
    try {
      localStorage.setItem(ANNOUNCEMENT_KEY, clean);
    } catch {}
    channelRef.current?.send({
      type: 'broadcast',
      event: 'admin_config',
      payload: { announcement: clean, slowModeSeconds },
    });
  };

  const handleToggleSlowMode = (secs: number) => {
    if (!adminUnlocked) return;
    setSlowModeSeconds(secs);
    try {
      localStorage.setItem(SLOWMODE_KEY, String(secs));
    } catch {}
    channelRef.current?.send({
      type: 'broadcast',
      event: 'admin_config',
      payload: { announcement, slowModeSeconds: secs },
    });
  };

  const myActiveBlock = useMemo(() => {
    if (!currentStudent || adminUnlocked) return null;
    const found = blocks.find((b) => b.student_id === String(currentStudent.id));
    if (!found) return null;
    if (found.is_permanent) return found;
    if (found.blocked_until && new Date(found.blocked_until).getTime() > nowTick) return found;
    return null;
  }, [blocks, currentStudent, adminUnlocked, nowTick]);

  const activeBlockMap = useMemo(() => {
    const map = new Map<string, CommunityBlock>();
    blocks.forEach((b) => {
      if (b.is_permanent || (b.blocked_until && new Date(b.blocked_until).getTime() > nowTick)) {
        map.set(b.student_id, b);
      }
    });
    return map;
  }, [blocks, nowTick]);

  const { messageReportCounts, studentReportCounts } = useMemo(() => {
    const msgReporters = new Map<string, Set<string>>();
    const stuReports = new Map<string, number>();

    reports.forEach((r) => {
      if (!msgReporters.has(r.message_id)) {
        msgReporters.set(r.message_id, new Set());
      }
      msgReporters.get(r.message_id)!.add(r.reporter_id);
      stuReports.set(r.reported_student_id, (stuReports.get(r.reported_student_id) || 0) + 1);
    });

    const msgCounts = new Map<string, number>();
    msgReporters.forEach((set, mid) => msgCounts.set(mid, set.size));

    return { messageReportCounts: msgCounts, studentReportCounts: stuReports };
  }, [reports]);

  const handleApplyBlock = async (minutes: number | 'permanent') => {
    if (!supabase || !adminUnlocked || !blockTarget) return;
    const isPermanent = minutes === 'permanent';
    const blockedUntil = isPermanent
      ? null
      : new Date(Date.now() + minutes * 60_000).toISOString();

    const payload: CommunityBlock = {
      student_id: blockTarget.studentId,
      student_name: blockTarget.studentName,
      blocked_until: blockedUntil,
      is_permanent: isPermanent,
      reason: isPermanent ? 'Permanent Block by Admin' : `Muted for ${minutes} mins by Admin`,
    };

    const { error } = await supabase
      .from('community_blocks')
      .upsert(payload, { onConflict: 'student_id' });

    if (error) {
      setErrorMsg('Block लागू नहीं हो पाया: ' + error.message);
    } else {
      setBlocks((prev) => [
        ...prev.filter((b) => b.student_id !== blockTarget.studentId),
        payload,
      ]);
      setBlockTarget(null);
    }
  };

  const handleUnblock = async (studentId: string) => {
    if (!supabase || !adminUnlocked) return;
    const { error } = await supabase
      .from('community_blocks')
      .delete()
      .eq('student_id', studentId);
    if (error) {
      setErrorMsg('Unblock नहीं हो पाया: ' + error.message);
    } else {
      setBlocks((prev) => prev.filter((b) => b.student_id !== studentId));
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !reportTarget) return;
    if (!currentStudent) {
      onRequireLogin();
      return;
    }

    const reporterId = String(currentStudent.id || 'student');
    const { error } = await supabase.from('community_reports').insert([
      {
        message_id: reportTarget.id,
        reported_student_id: reportTarget.student_id,
        reported_student_name: reportTarget.student_name,
        message_preview: (reportTarget.message || '📷 Photo').slice(0, 120),
        reporter_id: reporterId,
        reporter_name: myDisplayName,
        reason: reportReason,
      },
    ]);

    if (error) {
      setErrorMsg('Report भेजने में समस्या आई: ' + error.message);
    } else {
      const targetMsg = reportTarget;
      setReportedIds((prev) => ({ ...prev, [targetMsg.id]: true }));
      setReportTarget(null);

      if (!targetMsg.is_admin_msg) {
        const { data: allReps } = await supabase
          .from('community_reports')
          .select('reporter_id')
          .eq('message_id', targetMsg.id);
        const uniqueReporters = new Set((allReps || []).map((r: any) => r.reporter_id));
        if (uniqueReporters.size >= AUTO_DELETE_REPORT_THRESHOLD) {
          await removeLocalMessage(targetMsg.id);
          setMessages((prev) => prev.filter((m) => m.id !== targetMsg.id));
          await supabase
            .from('community_messages')
            .delete()
            .eq('id', targetMsg.id)
            .eq('is_admin_msg', false);
        }
      }
      fetchModerationData();
    }
  };

  const handleClearReport = async (reportId: string) => {
    if (!supabase || !adminUnlocked) return;
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    await supabase.from('community_reports').delete().eq('id', reportId);
  };

  const handleClearLocalVault = async () => {
    if (
      !window.confirm(
        'क्या आप अपने डिवाइस की पुरानी लोकल चैट हिस्ट्री साफ़ करना चाहते हैं? (सर्वर के लेटेस्ट मैसेज बने रहेंगे)'
      )
    ) {
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
    setAiThinking(true);
    try {
      const envKey = (import.meta as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY?.trim();
      const activeKey =
        settings.apiKey?.trim() ||
        settings.backupApiKey?.trim() ||
        envKey ||
        getStoredApiKey();

      let replyText = '';

      if (!activeKey) {
        replyText = `@${triggerMsg.student_name} भाई, अभी इस डिवाइस पर Gemini API Key सेव नहीं है। Settings (⚙️) में API Key सेव करते ही मैं आपके हर सवाल और फ़ोटो का पूरा NCERT हल तुरंत दूंगा!`;
      } else {
        const recentChat = historySnapshot
          .slice(-20)
          .map((m) => {
            const replyNote = m.reply_to_name
              ? ` (replying to ${m.reply_to_name}: "${m.reply_to_text}")`
              : '';
            const imgNote = m.image_data ? ' [Attached Image]' : '';
            return `[${m.subject || 'General'}] ${m.is_ai ? 'DINU AI' : m.student_name}${replyNote}${imgNote}: ${m.message}`;
          })
          .join('\n');

        const model = settings.modelId || 'gemini-2.5-flash';
        const systemInstruction =
          'You are DINU AI (@dinu), the senior NEET UG 2027 Topper & AI Mentor inside Dinu Saran NEET 2027 Student Community Chat. ' +
          'A student tagged @dinu. Give a clear, complete, step-by-step NCERT-accurate answer in pure Hindi medium (with English scientific terms in brackets). Be encouraging and precise.';

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
          const mimeType =
            meta.replace('data:', '').replace(';base64', '') || 'image/jpeg';
          if (base64Data) {
            userParts.push({
              inlineData: { mimeType, data: base64Data },
            });
          }
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
            activeKey
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: 'user', parts: userParts }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
            }),
          }
        );

        const data = await res.json();
        replyText =
          data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
          `@${triggerMsg.student_name} आपका प्रश्न मिल गया है, कृपया थोड़ा और स्पष्ट लिखें ताकि मैं सटीक NCERT हल बता सकूँ।`;
      }

      const localFallbackAiMsg: CommunityMessage = {
        id: `dinu-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        student_id: 'dinu-ai-bot',
        student_name: 'DINU AI',
        batch_name: 'AI Mentor',
        subject: triggerMsg.subject || 'General',
        reply_to_id: triggerMsg.id,
        reply_to_name: triggerMsg.student_name,
        reply_to_text: (triggerMsg.message || 'Photo Doubt').slice(0, 90),
        is_admin_msg: true,
        is_ai: true,
        message: replyText,
        created_at: new Date().toISOString(),
      };

      let savedAiMsg: CommunityMessage = localFallbackAiMsg;

      if (supabase) {
        const { data: aiInserted, error: insErr } = await supabase
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
              is_admin_msg: true,
              is_ai: true,
              message: replyText,
            },
          ])
          .select()
          .single();

        if (!insErr && aiInserted) {
          savedAiMsg = aiInserted as CommunityMessage;
        } else {
          const { data: minInserted } = await supabase
            .from('community_messages')
            .insert([
              {
                student_id: 'dinu-ai-bot',
                student_name: 'DINU AI',
                is_ai: true,
                message: replyText,
              },
            ])
            .select()
            .single();
          if (minInserted) {
            savedAiMsg = minInserted as CommunityMessage;
          }
        }
      }

      await upsertLocalMessages([savedAiMsg]);
      setMessages((prev) =>
        prev.some((m) => m.id === savedAiMsg.id)
          ? prev
          : mergeMessageLists(prev, [savedAiMsg])
      );

      const wordCount = replyText.trim().split(/\s+/).length;
      if (supabase && wordCount > AI_AUTO_DELETE_WORD_LIMIT) {
        setTimeout(() => {
          supabase
            .from('community_messages')
            .delete()
            .eq('id', savedAiMsg.id)
            .eq('is_pinned', false)
            .then(() => {});
        }, AI_AUTO_DELETE_DELAY_MS);
      }
    } catch (err) {
      console.error('DINU AI reply error:', err);
      const errReply: CommunityMessage = {
        id: `dinu-ai-err-${Date.now()}`,
        student_id: 'dinu-ai-bot',
        student_name: 'DINU AI',
        batch_name: 'AI Mentor',
        subject: triggerMsg.subject || 'General',
        is_admin_msg: true,
        is_ai: true,
        message: `@${triggerMsg.student_name} नेटवर्क या API व्यस्त होने के कारण उत्तर रुक गया, कृपया एक बार फिर @dinu के साथ पूछें!`,
        created_at: new Date().toISOString(),
      };
      await upsertLocalMessages([errReply]);
      setMessages((prev) => mergeMessageLists(prev, [errReply]));
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
    if (myActiveBlock) {
      setErrorMsg('आपको Admin द्वारा ब्लॉक किया गया है। आप अभी मैसेज नहीं भेज सकते।');
      return;
    }

    if (!adminUnlocked && slowModeSeconds > 0 && lastSentAt > 0) {
      const elapsedSec = Math.floor((Date.now() - lastSentAt) / 1000);
      if (elapsedSec < slowModeSeconds) {
        setErrorMsg(`Slow-Mode चालू है: कृपया ${slowModeSeconds - elapsedSec} सेकंड प्रतीक्षा करें।`);
        return;
      }
    }

    if (!adminUnlocked && text) {
      const violation = containsAbuseOrSpam(text);
      if (violation) {
        setErrorMsg(violation);
        return;
      }
    }

    if (!supabase) {
      setErrorMsg('Supabase कनेक्ट नहीं है।');
      return;
    }

    setSending(true);
    setLastSentAt(Date.now());
    notifyTyping(false);
    setMentionQuery(null);
    const currentImage = attachedImage;
    const currentReply = replyingTo;
    setInput('');
    setAttachedImage(null);
    setReplyingTo(null);
    setErrorMsg(null);

    try {
      const displayBatch = adminUnlocked
        ? 'Admin'
        : currentStudent.attempt_status || 'NEET 2027';
      const activeSubject = selectedSubject !== 'All' ? selectedSubject : postSubject;

      const { data, error } = await supabase
        .from('community_messages')
        .insert([
          {
            student_id: String(currentStudent.id || 'student-user'),
            student_name: myDisplayName,
            batch_name: displayBatch,
            subject: activeSubject,
            image_data: currentImage,
            reply_to_id: currentReply?.id || null,
            reply_to_name: currentReply?.student_name || null,
            reply_to_text: currentReply
              ? (currentReply.message || '📷 Photo').slice(0, 90)
              : null,
            is_admin_msg: adminUnlocked,
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
        await triggerDinuAiReply(updatedHistory, `${myDisplayName}: ${text}`, insertedMsg);
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

  const filteredAllMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter((m) => {
      if (showSavedOnly && !bookmarkedIds[m.id]) return false;
      if (showPinnedOnly && !m.is_pinned) return false;
      if (selectedSubject !== 'All' && (m.subject || 'General') !== selectedSubject) {
        return false;
      }
      if (q) {
        const inMsg = m.message?.toLowerCase().includes(q);
        const inName = m.student_name?.toLowerCase().includes(q);
        const inPoll = m.poll_data?.question?.toLowerCase().includes(q);
        if (!inMsg && !inName && !inPoll) return false;
      }
      return true;
    });
  }, [messages, selectedSubject, showPinnedOnly, showSavedOnly, bookmarkedIds, searchQuery]);

  const visibleMessages = useMemo(() => {
    if (filteredAllMessages.length <= renderLimit) return filteredAllMessages;
    return filteredAllMessages.slice(-renderLimit);
  }, [filteredAllMessages, renderLimit]);

  const hasOlderMessages = filteredAllMessages.length > visibleMessages.length;

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

  const formatRemainingTime = (block: CommunityBlock) => {
    if (block.is_permanent) return 'Permanent Block';
    if (!block.blocked_until) return '';
    const diffMs = new Date(block.blocked_until).getTime() - nowTick;
    if (diffMs <= 0) return 'Unblocked';
    const mins = Math.ceil(diffMs / 60_000);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      return `${hrs}h ${rem}m बाकी`;
    }
    return `${mins} मिनट बाकी`;
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-115px)] max-w-2xl flex-col rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2 text-white">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-xs sm:text-sm font-extrabold truncate">NEET 2027 Hub</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {onlineCount}
              </span>
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/25 px-1.5 py-0.5 text-[9px] font-extrabold text-orange-200"
                title="Your Daily Study Streak"
              >
                <Flame className="w-2.5 h-2.5 text-orange-300" /> {studyStreak}d
              </span>
              {adminUnlocked && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
            <p className="text-[10px] text-indigo-100 flex items-center gap-1">
              <Database className="w-3 h-3" /> Vault: {messages.length} •{' '}
              <span className="font-bold text-amber-300">@dinu</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowLeaderboard((l) => !l)}
            className={`rounded-xl p-1.5 hover:bg-white/15 ${
              showLeaderboard ? 'bg-white/20 text-amber-300' : 'text-indigo-100'
            }`}
            title="Weekly NEET Toppers Leaderboard"
          >
            <Trophy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearchBar((s) => !s);
              if (showSearchBar) setSearchQuery('');
            }}
            className={`rounded-xl p-1.5 hover:bg-white/15 ${
              showSearchBar ? 'bg-white/20 text-amber-300' : 'text-indigo-100'
            }`}
            title="Search in Local Vault"
          >
            <Search className="w-4 h-4" />
          </button>
          {adminUnlocked ? (
            <button
              type="button"
              onClick={() => setShowModPanel((p) => !p)}
              className="rounded-xl bg-amber-400/20 border border-amber-300/40 px-2 py-1 text-[10px] font-extrabold text-amber-200 hover:bg-amber-400/30 flex items-center gap-1"
              title="Admin Controls, Reports & Blocks"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Mod ({reports.length + activeBlockMap.size})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdminPinModal(true)}
              className="rounded-xl p-1.5 hover:bg-white/15 text-indigo-100"
              title="Admin Controls Unlock"
            >
              <KeyRound className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={syncMessages}
            className="rounded-xl p-1.5 hover:bg-white/15"
            title="Sync Latest Chats"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Daily Target / Admin Broadcast Banner */}
      {announcement && (
        <div className="flex items-center justify-between border-b border-indigo-500/20 bg-gradient-to-r from-amber-500/15 via-indigo-500/10 to-purple-500/15 px-3.5 py-1.5 text-[11px] text-slate-800 dark:text-amber-200">
          <span className="flex items-center gap-1.5 font-bold truncate">
            <Megaphone className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span className="truncate">{formatNeetExamText(announcement)}</span>
          </span>
          {slowModeSeconds > 0 && (
            <span className="ml-2 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-amber-300">
              Slow: {slowModeSeconds}s
            </span>
          )}
        </div>
      )}

      {/* Weekly XP Toppers Drawer */}
      {showLeaderboard && (
        <div className="border-b border-amber-500/30 bg-slate-900 text-white p-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-amber-400 flex items-center gap-1.5">
              <Trophy className="w-4 h-4" /> Top NEET Contributors & Doubt Solvers
            </span>
            <button
              type="button"
              onClick={() => setShowLeaderboard(false)}
              className="rounded p-1 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {weeklyToppers.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              डाउट्स पूछें, पोल हल करें और Helpful अपवोट्स पाकर टॉप पर आएं!
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {weeklyToppers.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl bg-slate-800/90 px-3 py-1.5"
                >
                  <span className="font-bold flex items-center gap-2">
                    <span className="text-amber-400 font-extrabold">#{i + 1}</span>
                    <span>{t.name}</span>
                    {t.solved >= 2 && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] text-emerald-300">
                        Doubt Solver
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-extrabold text-indigo-300">{t.xp} XP</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Local Vault Instant Search Bar */}
      {showSearchBar && (
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 px-3 py-1.5">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Local Vault में पुराना डाउट, फ़ॉर्मूला या नाम खोजें..."
            className="flex-1 bg-transparent text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[10px] text-slate-400 hover:text-rose-500"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Admin Super-Moderation Drawer */}
      {adminUnlocked && showModPanel && (
        <div className="max-h-72 overflow-y-auto border-b border-amber-500/30 bg-slate-900 text-slate-100 p-3 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Admin Super-Control Panel
            </span>
            <button
              type="button"
              onClick={() => setShowModPanel(false)}
              className="rounded p-1 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-xl bg-slate-800/80 p-2.5 space-y-1.5">
            <div className="text-[11px] font-bold text-indigo-300 flex items-center gap-1">
              <Megaphone className="w-3.5 h-3.5" /> Set Live Daily Target / Notice
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={announcementDraft}
                onChange={(e) => setAnnouncementDraft(e.target.value)}
                placeholder={announcement || 'उदा: आज का टारगेट - 50 Biology PYQs...'}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-white"
              />
              <button
                type="button"
                onClick={handleSaveAdminBroadcast}
                className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white"
              >
                Set
              </button>
              {announcement && (
                <button
                  type="button"
                  onClick={() => {
                    setAnnouncement('');
                    localStorage.removeItem(ANNOUNCEMENT_KEY);
                  }}
                  className="rounded-lg bg-slate-700 px-2 py-1 text-[10px] text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-800/80 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px]">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Slow-Mode:</span>
              {[0, 10, 30].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => handleToggleSlowMode(sec)}
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    slowModeSeconds === sec
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {sec === 0 ? 'Off' : `${sec}s`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleClearLocalVault}
              className="rounded bg-slate-700 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-600 hover:text-white"
            >
              Reset Local Cache
            </button>
          </div>

          <div>
            <div className="text-[11px] font-bold text-rose-400 mb-1">
              Blocked Students ({activeBlockMap.size})
            </div>
            {activeBlockMap.size === 0 ? (
              <p className="text-[11px] text-slate-400">अभी कोई भी यूज़र ब्लॉक नहीं है।</p>
            ) : (
              <div className="space-y-1.5">
                {Array.from(activeBlockMap.values()).map((b) => (
                  <div
                    key={b.student_id}
                    className="flex items-center justify-between rounded-xl bg-slate-800 px-2.5 py-1.5"
                  >
                    <div>
                      <span className="font-bold text-white">{b.student_name}</span>
                      <span className="ml-2 text-[10px] text-amber-300">
                        ({formatRemainingTime(b)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(b.student_id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                    >
                      <Unlock className="w-3 h-3" /> Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-bold text-amber-400 mb-1">
              Student Reports ({reports.length}) — 7 reports = Auto-Delete
            </div>
            {reports.length === 0 ? (
              <p className="text-[11px] text-slate-400">कोई नई रिपोर्ट नहीं है।</p>
            ) : (
              <div className="space-y-1.5">
                {reports.map((rep) => {
                  const totalOnMsg = messageReportCounts.get(rep.message_id) || 1;
                  return (
                    <div
                      key={rep.id}
                      className="rounded-xl border border-slate-700 bg-slate-800/80 p-2 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-300">
                          {rep.reported_student_name} •{' '}
                          <span className="text-amber-300">{rep.reason}</span>{' '}
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.2 text-[9px] text-rose-200">
                            {totalOnMsg}/7
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-400">by {rep.reporter_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 truncate">"{rep.message_preview}"</p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setBlockTarget({
                              studentId: rep.reported_student_id,
                              studentName: rep.reported_student_name,
                            })
                          }
                          className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white"
                        >
                          Block User
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClearReport(rep.id)}
                          className="rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subject Filter, Saved Vault & Pinned Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 px-3 py-2 no-scrollbar">
        {SUBJECTS.map((subj) => {
          const active = !showPinnedOnly && !showSavedOnly && selectedSubject === subj;
          return (
            <button
              key={subj}
              type="button"
              onClick={() => {
                setShowPinnedOnly(false);
                setShowSavedOnly(false);
                setSelectedSubject(subj);
                if (subj !== 'All') setPostSubject(subj);
              }}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
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
          onClick={() => {
            setShowSavedOnly((prev) => !prev);
            setShowPinnedOnly(false);
          }}
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
            showSavedOnly
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <Bookmark className="w-3 h-3" /> Saved ({savedCount})
        </button>
        <button
          type="button"
          onClick={() => {
            setShowPinnedOnly((prev) => !prev);
            setShowSavedOnly(false);
          }}
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
            showPinnedOnly
              ? 'bg-amber-500 text-white'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          }`}
        >
          <Pin className="w-3 h-3" /> Pinned ({pinnedMessages.length})
        </button>
      </div>

      {/* Top Pinned Banner */}
      {!showPinnedOnly && !showSavedOnly && pinnedMessages.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPinnedOnly(true)}
          className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 text-left text-[11px] text-amber-800 dark:text-amber-200"
        >
          <span className="truncate flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <strong className="shrink-0">Pinned:</strong>
            <span className="truncate">
              {formatNeetExamText(pinnedMessages[pinnedMessages.length - 1].message)}
            </span>
          </span>
          <span className="ml-2 shrink-0 text-[10px] font-bold underline">
            देखें ({pinnedMessages.length})
          </span>
        </button>
      )}

      {/* Messages Feed (Windowed 60fps Virtualized List) */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 dark:bg-slate-950/60">
        {hasOlderMessages && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={() => setRenderLimit((prev) => prev + RENDER_PAGE_SIZE)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300 shadow-sm hover:bg-indigo-50"
            >
              <ChevronUp className="w-3.5 h-3.5" /> Load Older Messages (+
              {Math.min(RENDER_PAGE_SIZE, filteredAllMessages.length - visibleMessages.length)})
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            कम्युनिटी चैट लोड हो रही है...
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-xs text-slate-500">
            <Sparkles className="w-8 h-8 text-indigo-400 mb-2" />
            <p className="font-bold text-slate-700 dark:text-slate-300">
              {showSavedOnly
                ? 'आपके Revision Vault में अभी कोई बुकमार्क नहीं है'
                : searchQuery
                ? `"${searchQuery}" से जुड़ा कोई मैसेज नहीं मिला`
                : showPinnedOnly
                ? 'अभी कोई Pinned मैसेज नहीं है'
                : 'इस सेक्शन में अभी कोई मैसेज नहीं है'}
            </p>
            <p className="mt-1">
              {showSavedOnly
                ? 'किसी भी ज़रूरी ट्रिक या AI सॉल्यूशन के नीचे Save दबाकर यहाँ सेव करें!'
                : 'पहला डाउट, ⚡ Drop PYQ या फ़ोटो भेजें और @dinu से मदद लें!'}
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMine = currentStudent && msg.student_id === currentStudent.id && !msg.is_ai;
            const canDelete = adminUnlocked || isMine;
            const userBlocked = !msg.is_ai && activeBlockMap.has(msg.student_id);
            const msgReps = messageReportCounts.get(msg.id) || 0;
            const userTotalReps = studentReportCounts.get(msg.student_id) || 0;
            const isAdminAuthor = !!msg.is_admin_msg || msg.batch_name === 'Admin';
            const solverScore = helpfulLeaderboard.get(msg.student_id) || 0;
            const helpfulList = Array.isArray(msg.helpful_by) ? msg.helpful_by : [];
            const iUpvoted = currentStudent ? helpfulList.includes(String(currentStudent.id)) : false;
            const isBookmarked = !!bookmarkedIds[msg.id];

            const poll = msg.poll_data;
            const pollVotesObj = poll?.votes || {};
            const totalVotes = Object.keys(pollVotesObj).length;
            const myVoteIdx =
              currentStudent && pollVotesObj[String(currentStudent.id)] !== undefined
                ? pollVotesObj[String(currentStudent.id)]
                : null;

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[88%] ${
                  isMine ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
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
                      {isAdminAuthor ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-extrabold text-amber-600 dark:text-amber-300">
                          <ShieldCheck className="w-2.5 h-2.5" /> Admin
                        </span>
                      ) : (
                        msg.batch_name && (
                          <span className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 text-[9px]">
                            {msg.batch_name}
                          </span>
                        )
                      )}
                      {!isAdminAuthor && solverScore >= 2 && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-extrabold text-emerald-600 dark:text-emerald-300">
                          <Award className="w-2.5 h-2.5" /> Doubt Solver
                        </span>
                      )}
                      {adminUnlocked && !isAdminAuthor && userTotalReps > 0 && (
                        <span className="rounded bg-rose-500/15 px-1.5 py-0.2 text-[9px] font-bold text-rose-500">
                          🚩 {userTotalReps} reports
                        </span>
                      )}
                      {userBlocked && (
                        <span className="rounded bg-rose-500/15 px-1.5 py-0.2 text-[9px] font-bold text-rose-500">
                          Blocked
                        </span>
                      )}
                    </>
                  )}
                  {msg.subject && msg.subject !== 'General' && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${subjectBadgeColor(
                        msg.subject
                      )}`}
                    >
                      {msg.subject}
                    </span>
                  )}
                  {msg.is_pinned && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-300">
                      <Pin className="w-2.5 h-2.5" /> Pinned
                    </span>
                  )}
                </div>

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
                      <div className="line-clamp-2 opacity-90">
                        {formatNeetExamText(msg.reply_to_text || '')}
                      </div>
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
                        loading="lazy"
                        className="max-h-56 w-auto object-contain"
                      />
                    </button>
                  )}

                  {poll ? (
                    <div className="min-w-[230px] space-y-2">
                      <div className="font-extrabold text-[12px] flex items-center gap-1.5">
                        <BarChart2 className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>{formatNeetExamText(poll.question)}</span>
                      </div>
                      <div className="space-y-1.5">
                        {poll.options.map((opt, idx) => {
                          const optVotes = Object.values(pollVotesObj).filter(
                            (v) => v === idx
                          ).length;
                          const pct =
                            totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                          const isSelected = myVoteIdx === idx;
                          const isCorrect =
                            myVoteIdx !== null &&
                            poll.correctIndex !== null &&
                            poll.correctIndex !== undefined &&
                            poll.correctIndex === idx;

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleVotePoll(msg, idx)}
                              className={`relative w-full overflow-hidden rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition ${
                                isMine
                                  ? 'border-white/25 bg-white/10 hover:bg-white/20 text-white'
                                  : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500'
                              }`}
                            >
                              {myVoteIdx !== null && (
                                <div
                                  className={`absolute inset-y-0 left-0 opacity-25 transition-all ${
                                    isCorrect
                                      ? 'bg-emerald-500'
                                      : isSelected
                                      ? 'bg-amber-400'
                                      : 'bg-indigo-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              )}
                              <div className="relative flex items-center justify-between gap-2 font-semibold">
                                <span className="flex items-center gap-1">
                                  <span className="opacity-70">
                                    {String.fromCharCode(65 + idx)}.
                                  </span>{' '}
                                  {formatNeetExamText(opt)}
                                  {isCorrect && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                                  )}
                                </span>
                                {myVoteIdx !== null && (
                                  <span className="text-[10px] font-extrabold">{pct}%</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] opacity-75">
                        {totalVotes} votes • टैप करके वोट दें
                      </div>
                    </div>
                  ) : (
                    <div>{formatNeetExamText(msg.message)}</div>
                  )}
                </div>

                {/* Action Row */}
                <div className="mt-1 flex flex-wrap items-center gap-2.5 px-1 text-[10px] text-slate-400">
                  <button
                    type="button"
                    onClick={() => setReplyingTo(msg)}
                    className="inline-flex items-center gap-0.5 hover:text-indigo-500"
                  >
                    <Reply className="w-3 h-3" /> Reply
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleBookmark(msg.id)}
                    className={`inline-flex items-center gap-0.5 ${
                      isBookmarked ? 'text-emerald-500 font-bold' : 'hover:text-emerald-500'
                    }`}
                  >
                    <Bookmark className="w-3 h-3" /> {isBookmarked ? 'Saved' : 'Save'}
                  </button>

                  {!isMine && !msg.is_ai && (
                    <button
                      type="button"
                      onClick={() => handleToggleHelpful(msg)}
                      className={`inline-flex items-center gap-0.5 ${
                        iUpvoted
                          ? 'text-emerald-500 font-bold'
                          : 'hover:text-emerald-500'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" /> Helpful
                      {helpfulList.length > 0 ? ` (${helpfulList.length})` : ''}
                    </button>
                  )}

                  {!isMine && !msg.is_ai && !isAdminAuthor && (
                    <button
                      type="button"
                      disabled={!!reportedIds[msg.id]}
                      onClick={() => setReportTarget(msg)}
                      className={`inline-flex items-center gap-0.5 ${
                        reportedIds[msg.id]
                          ? 'text-amber-500 font-bold'
                          : 'hover:text-amber-500'
                      }`}
                    >
                      <Flag className="w-3 h-3" />{' '}
                      {reportedIds[msg.id]
                        ? 'Reported'
                        : adminUnlocked && msgReps > 0
                        ? `Report (${msgReps}/7)`
                        : 'Report'}
                    </button>
                  )}

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

                  {adminUnlocked && !msg.is_ai && !isMine && !isAdminAuthor && (
                    userBlocked ? (
                      <button
                        type="button"
                        onClick={() => handleUnblock(msg.student_id)}
                        className="inline-flex items-center gap-0.5 text-emerald-500 font-bold hover:underline"
                      >
                        <Unlock className="w-3 h-3" /> Unblock
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setBlockTarget({
                            studentId: msg.student_id,
                            studentName: msg.student_name,
                          })
                        }
                        className="inline-flex items-center gap-0.5 text-rose-400 hover:text-rose-500"
                      >
                        <Ban className="w-3 h-3" /> Block
                      </button>
                    )
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg)}
                      className="inline-flex items-center gap-0.5 text-rose-400 hover:text-rose-500 font-semibold"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {typingUsers.length > 0 && (
          <div className="mr-auto flex items-center gap-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 px-3 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" />
            {typingUsers.slice(0, 2).join(', ')} लिख रहे हैं...
          </div>
        )}

        {aiThinking && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-950/60 px-3.5 py-2 text-xs text-indigo-700 dark:text-indigo-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            DINU AI चैट और फ़ोटो पढ़कर पूरा जवाब तैयार कर रहा है...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          {errorMsg}
        </div>
      )}

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

      {filteredMentions.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] text-slate-400 shrink-0">Tag:</span>
          {filteredMentions.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => applyMention(m.name)}
              className="shrink-0 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/25"
            >
              @{m.name} <span className="opacity-70 text-[9px]">({m.badge})</span>
            </button>
          ))}
        </div>
      )}

      {myActiveBlock ? (
        <div className="border-t border-rose-500/30 bg-rose-500/10 p-3 text-center text-xs text-rose-600 dark:text-rose-300">
          <p className="font-extrabold flex items-center justify-center gap-1.5">
            <Ban className="w-4 h-4" /> आपको Admin द्वारा ब्लॉक किया गया है (
            {formatRemainingTime(myActiveBlock)})
          </p>
          <p className="mt-0.5 text-[11px] opacity-85">
            कम्युनिटी नियमों का पालन करें। समय पूरा होने या Admin द्वारा Unblock करने पर आप फिर चैट कर सकेंगे।
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          className="flex flex-col gap-1.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
        >
          <div className="flex items-center justify-between gap-1 px-1 text-[10px] text-slate-500">
            {selectedSubject === 'All' ? (
              <div className="flex items-center gap-1">
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
            ) : (
              <span className="font-bold text-indigo-500">{selectedSubject} PYQ Mode</span>
            )}
            <button
              type="button"
              onClick={handleDropRandomPyq}
              className="ml-auto inline-flex items-center gap-0.5 rounded-md bg-purple-500/15 px-2 py-0.5 font-extrabold text-purple-600 dark:text-purple-300 hover:bg-purple-500/25"
              title="शुद्ध हिंदी NEET PYQ Quiz ड्रॉप करें"
            >
              <Zap className="w-3 h-3" /> Drop हिंदी PYQ
            </button>
          </div>

          <div className="flex items-center gap-1">
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
              onClick={() => {
                if (!currentStudent) return onRequireLogin();
                setShowPollModal(true);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-500/15 hover:text-emerald-600"
              title="Custom NEET Poll बनाएं"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={insertTag}
              className="shrink-0 rounded-xl bg-amber-500/15 px-2 py-2 text-[11px] font-extrabold text-amber-600 dark:text-amber-300 hover:bg-amber-500/25"
              title="AI को टैग करें"
            >
              @dinu
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={
                currentStudent
                  ? 'डाउट लिखें, @ से टैग करें, या फ़ोटो/PYQ भेजें...'
                  : 'चैट करने के लिए पहले Student Login करें...'
              }
              className="flex-1 min-w-0 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
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
      )}

      {/* NEET MCQ Poll Builder Modal */}
      {showPollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleCreatePoll}
            className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-emerald-400 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4" /> Create NEET MCQ Poll
              </h3>
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="MCQ प्रश्न लिखें..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
              required
            />
            <div className="space-y-2">
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPollCorrectIdx(pollCorrectIdx === idx ? null : idx)}
                    className={`h-7 w-7 shrink-0 rounded-lg text-[11px] font-extrabold border ${
                      pollCorrectIdx === idx
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                    title="सही उत्तर चिह्नित करें"
                  >
                    {String.fromCharCode(65 + idx)}
                  </button>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions];
                      next[idx] = e.target.value;
                      setPollOptions(next);
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + idx)}${
                      idx >= 2 ? ' (optional)' : ''
                    }`}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-indigo-400 focus:outline-none"
                    required={idx < 2}
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">
              टिप: सही जवाब सेट करने के लिए A/B/C/D बटन पर टैप करें (हरा हो जाएगा)।
            </p>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
            >
              Post Poll in Community
            </button>
          </form>
        </div>
      )}

      {/* Admin Unlock PIN Modal */}
      {showAdminPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleAdminPinSubmit}
            className="w-full max-w-xs rounded-3xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-amber-400 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4" /> Admin Mode Unlock
              </h3>
              <button
                type="button"
                onClick={() => setShowAdminPinModal(false)}
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-300">
              Admin Controls खोलने के लिए PIN डालें:
            </p>
            <input
              type="password"
              value={adminPinInput}
              onChange={(e) => setAdminPinInput(e.target.value)}
              placeholder="Enter Admin PIN..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-amber-500 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
            >
              Unlock Admin Controls
            </button>
          </form>
        </div>
      )}

      {/* Admin Block Duration Modal */}
      {adminUnlocked && blockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xs rounded-3xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-rose-400 flex items-center gap-1.5">
                <Ban className="w-4 h-4" /> Block {blockTarget.studentName}
              </h3>
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-300">
              चुनें कि आप इस स्टूडेंट को कितनी देर के लिए ब्लॉक करना चाहते हैं:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleApplyBlock(10)}
                className="rounded-xl bg-slate-800 py-2 hover:bg-amber-600"
              >
                10 Minutes
              </button>
              <button
                type="button"
                onClick={() => handleApplyBlock(60)}
                className="rounded-xl bg-slate-800 py-2 hover:bg-amber-600"
              >
                1 Hour
              </button>
              <button
                type="button"
                onClick={() => handleApplyBlock(1440)}
                className="rounded-xl bg-slate-800 py-2 hover:bg-amber-600"
              >
                24 Hours
              </button>
              <button
                type="button"
                onClick={() => handleApplyBlock('permanent')}
                className="rounded-xl bg-rose-600 py-2 text-white hover:bg-rose-500"
              >
                Permanent Block
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleSubmitReport}
            className="w-full max-w-xs rounded-3xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-amber-400 flex items-center gap-1.5">
                <Flag className="w-4 h-4" /> Report {reportTarget.student_name}
              </h3>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-2">
              "{reportTarget.message}"
            </p>
            <div className="space-y-1.5 text-xs">
              {['Abusive / Gali-Galauj', 'Spam / Promotion', 'Misleading / Wrong Info'].map(
                (r) => (
                  <label
                    key={r}
                    className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      checked={reportReason === r}
                      onChange={() => setReportReason(r)}
                    />
                    <span>{r}</span>
                  </label>
                )
              )}
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-amber-500 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
            >
              Submit Report to Admin
            </button>
          </form>
        </div>
      )}

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

export const CommunityChatView: React.FC<CommunityChatViewProps> = (props) => (
  <GlobalSafeErrorBoundary>
    <CommunityChatInner {...props} />
  </GlobalSafeErrorBoundary>
);
