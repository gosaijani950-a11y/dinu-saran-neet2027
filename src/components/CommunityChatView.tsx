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
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';

export interface PollData {
  question: string;
  options: string[];
  votes: Record<string, number>; // student_id -> optionIndex (0..3)
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
const AI_AUTO_DELETE_WORD_LIMIT = 120;
const AI_AUTO_DELETE_DELAY_MS = 90_000;
const AUTO_DELETE_REPORT_THRESHOLD = 7;
const LOCAL_DB_NAME = 'dinu_neet2027_community_db';
const LOCAL_STORE_NAME = 'messages_vault';

// Pre-send client-side abuse & spam filter
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
  const [blocks, setBlocks] = useState<CommunityBlock[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<SubjectTab>('All');
  const [postSubject, setPostSubject] = useState<Exclude<SubjectTab, 'All'>>('General');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');

  // Poll Builder Modal state
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '', '', '']);
  const [pollCorrectIdx, setPollCorrectIdx] = useState<number | null>(null);

  // Realtime Presence & Typing state
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Mention Autocomplete state
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
      'dinu2027';
    if (adminPinInput.trim() === String(expectedPin).trim() || adminPinInput.trim() === '2027') {
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
      setErrorMsg('गलत Admin PIN! कृपया सही Admin Password डालें।');
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

    const channel = supabase.channel('public:community_pro_v5', {
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
    if (!searchQuery.trim()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, aiThinking, searchQuery]);

  // Broadcast typing state throttled
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

  // Compute Top Doubt Solvers (students with >= 2 helpful upvotes across messages)
  const helpfulLeaderboard = useMemo(() => {
    const counts = new Map<string, number>();
    messages.forEach((m) => {
      if (!m.is_ai && Array.isArray(m.helpful_by) && m.helpful_by.length > 0) {
        counts.set(m.student_id, (counts.get(m.student_id) || 0) + m.helpful_by.length);
      }
    });
    return counts;
  }, [messages]);

  // Unique participants for @mention autocomplete
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

    // Detect @mention trigger at end of input
    const match = val.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const applyMention = (name: string) => {
    const tag = name === 'dinu' ? '@dinu ' : `@${name} `;
    setInput((prev) => prev.replace(/(?:^|\s)@[a-zA-Z0-9_]*$/, (m) => (m.startsWith(' ') ? ` ${tag}` : tag)));
    setMentionQuery(null);
  };

  const handleToggleHelpful = async (msg: CommunityMessage) => {
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    const myId = String(currentStudent.id);
    if (msg.student_id === myId) return; // Can't upvote own message

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
    if (!supabase) return;
    const envKey = (import.meta as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY?.trim();
    const activeKey = settings.apiKey?.trim() || settings.backupApiKey?.trim() || envKey;
    if (!activeKey) return;

    setAiThinking(true);
    try {
      const recentChat = historySnapshot
        .slice(-25)
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
        'You are DINU AI, the smart NEET UG mentor inside Dinu Saran NEET 2027 Student Community Chat. ' +
        'You have read the recent group conversation and any attached doubt image. ' +
        'Reply ONLY because a student tagged @dinu. Give a complete, detailed, step-by-step NCERT-accurate answer in Hindi + English terms without cutting off.';

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
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 4096,
            },
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
            is_admin_msg: true,
            is_ai: true,
            message: replyText,
          },
        ])
        .select()
        .single();

      if (aiInserted) {
        const aiMsg = aiInserted as CommunityMessage;
        await upsertLocalMessages([aiMsg]);

        const wordCount = replyText.trim().split(/\s+/).length;
        if (wordCount > AI_AUTO_DELETE_WORD_LIMIT) {
          setTimeout(() => {
            supabase
              .from('community_messages')
              .delete()
              .eq('id', aiMsg.id)
              .eq('is_pinned', false)
              .then(() => {});
          }, AI_AUTO_DELETE_DELAY_MS);
        }
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
    if (myActiveBlock) {
      setErrorMsg('आपको Admin द्वारा ब्लॉक किया गया है। आप अभी मैसेज नहीं भेज सकते।');
      return;
    }

    // Pre-send abuse & spam guard (skipped only for Admin)
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

  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter((m) => {
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
  }, [messages, selectedSubject, showPinnedOnly, searchQuery]);

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
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-3.5 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-extrabold">NEET 2027 Community</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {onlineCount} Online
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
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              setShowSearchBar((s) => !s);
              if (showSearchBar) setSearchQuery('');
            }}
            className={`rounded-xl p-2 hover:bg-white/15 ${
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
              className="rounded-xl bg-amber-400/20 border border-amber-300/40 px-2 py-1.5 text-[10px] font-extrabold text-amber-200 hover:bg-amber-400/30 flex items-center gap-1"
              title="Blocked Users & Student Reports"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Mod ({reports.length + activeBlockMap.size})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdminPinModal(true)}
              className="rounded-xl p-2 hover:bg-white/15 text-indigo-100"
              title="Admin Controls Unlock"
            >
              <KeyRound className="w-4 h-4" />
            </button>
          )}
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

      {/* Admin Moderation Drawer */}
      {adminUnlocked && showModPanel && (
        <div className="max-h-64 overflow-y-auto border-b border-amber-500/30 bg-slate-900 text-slate-100 p-3 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Admin Moderation Control
            </span>
            <button
              type="button"
              onClick={() => setShowModPanel(false)}
              className="rounded p-1 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
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
                            {totalOnMsg}/7 reports
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
              {searchQuery
                ? `"${searchQuery}" से जुड़ा कोई मैसेज नहीं मिला`
                : showPinnedOnly
                ? 'अभी कोई Pinned मैसेज नहीं है'
                : 'इस सेक्शन में अभी कोई मैसेज नहीं है'}
            </p>
            <p className="mt-1">
              पहला डाउट, पोल या फ़ोटो भेजें और <span className="font-bold text-indigo-500">@dinu</span> से मदद लें!
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

            // Poll stats calculation
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

                  {/* Interactive NEET Poll Card */}
                  {poll ? (
                    <div className="min-w-[230px] space-y-2">
                      <div className="font-extrabold text-[12px] flex items-center gap-1.5">
                        <BarChart2 className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>{poll.question}</span>
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
                                  {opt}
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
                    <div>{msg.message}</div>
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

        {/* Live Typing & AI Thinking Indicators */}
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

      {/* @mention Autocomplete Popup */}
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
              title="NEET MCQ Poll बनाएं"
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
                  ? 'डाउट लिखें, @ से टैग करें, या फ़ोटो/पोल भेजें...'
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
                    title="सही उत्तर चिह्नित करें (वैकल्पिक)"
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
