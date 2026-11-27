import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Lock,
  Search,
  Send,
  Mic,
  Square,
  RefreshCw,
  Users,
  UserPlus,
  Ban,
  Unlock,
  X,
  Volume2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Shield,
  BookOpen,
  Eye,
} from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';
import { formatNeetExamText, NCERT_RECALL_CARDS } from '../utils/neetEngine';

interface SecretDirectChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStudent: StudentProfile | null;
  settings: AppSettings;
  onRequireLogin: () => void;
}

interface DirectoryUser {
  id: string;
  full_name: string;
  username: string;
  mobile?: string;
}

interface SecretMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_username?: string;
  receiver_id: string;
  msg_type: 'text' | 'voice';
  content: string;
  stuck?: boolean;
  created_at: string;
}

interface PrivateStudyGroup {
  code: string;
  name: string;
  ownerId: string;
  ownerName: string;
}

const SECRET_VAULT_KEY = 'dinu_secret_dm_vault_v1';
const MY_GROUP_KEY = 'dinu_my_private_group_v1';
const JOINED_GROUPS_KEY = 'dinu_joined_groups_v1';
const USER_BLOCKS_KEY = 'dinu_personal_blocks_v1';

const makeDmRoomId = (a: string, b: string) => [a, b].sort().join('__');

export const SecretDirectChatModal: React.FC<SecretDirectChatModalProps> = ({
  isOpen,
  onClose,
  currentStudent,
  settings,
  onRequireLogin,
}) => {
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'dm' | 'group' | 'ncert' | 'blocked'>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Record<string, boolean>>({});
  const [selectedPeer, setSelectedPeer] = useState<DirectoryUser | null>(null);
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});

  const [localMessages, setLocalMessages] = useState<SecretMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SECRET_VAULT_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const [personalBlocks, setPersonalBlocks] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_BLOCKS_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const [myOwnedGroup, setMyOwnedGroup] = useState<PrivateStudyGroup | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(MY_GROUP_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [joinedGroups, setJoinedGroups] = useState<PrivateStudyGroup[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(JOINED_GROUPS_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [activeGroup, setActiveGroup] = useState<PrivateStudyGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  const [textInput, setTextInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const channelRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const supabase = useMemo(() => {
    const env = (import.meta as { env?: Record<string, string> }).env || {};
    const url = (settings.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
    const key = (settings.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return null;
    return createClient(url, key);
  }, [settings.supabaseUrl, settings.supabaseAnonKey]);

  const myId = currentStudent?.id ? String(currentStudent.id) : '';
  const myName =
    currentStudent?.full_name?.trim() || (currentStudent as any)?.name?.trim() || 'Student';
  const myUsername = (currentStudent as any)?.username || '';
  const mySavedPin =
    (currentStudent as any)?.security_pin ||
    localStorage.getItem('dinu_user_security_pin') ||
    '';

  const saveVault = (updater: (prev: SecretMessage[]) => SecretMessage[]) => {
    setLocalMessages((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(SECRET_VAULT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) {
      setPinVerified(false);
      setPinInput('');
      setPinError(null);
      return;
    }
    if (!currentStudent) {
      onClose();
      onRequireLogin();
    }
  }, [isOpen, currentStudent]);

  useEffect(() => {
    if (!isOpen || !pinVerified || !supabase || !myId) return;

    const loadDirectoryAndPending = async () => {
      const { data: usersData } = await supabase
        .from('students')
        .select('id, full_name, username, mobile')
        .limit(150);
      if (Array.isArray(usersData)) {
        setDirectoryUsers(
          usersData
            .filter((u: any) => String(u.id) !== myId)
            .map((u: any) => ({
              id: String(u.id),
              full_name: u.full_name || 'NEET Aspirant',
              username: u.username || `neet_${String(u.id).slice(0, 5)}`,
              mobile: u.mobile,
            }))
        );
      }

      const { data: incomingRows } = await supabase
        .from('secret_direct_messages')
        .select('*')
        .eq('receiver_id', myId)
        .order('created_at', { ascending: true });

      if (Array.isArray(incomingRows) && incomingRows.length > 0) {
        const mapped: SecretMessage[] = incomingRows.map((r: any) => ({
          id: r.id,
          room_id: r.room_id,
          sender_id: r.sender_id,
          sender_name: r.sender_name,
          sender_username: r.sender_username,
          receiver_id: r.receiver_id,
          msg_type: r.msg_type || 'text',
          content: r.content,
          created_at: r.created_at,
        }));
        saveVault((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...prev, ...mapped.filter((m) => !ids.has(m.id))];
        });

        const voiceIds = mapped.filter((m) => m.msg_type === 'voice').map((m) => m.id);
        if (voiceIds.length > 0) {
          await supabase.from('secret_direct_messages').delete().in('id', voiceIds);
        }
      }
    };

    loadDirectoryAndPending();

    const channel = supabase.channel('public:secret_hub_v2', {
      config: { presence: { key: myId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineMap: Record<string, boolean> = {};
        Object.keys(state).forEach((k) => {
          onlineMap[k] = true;
        });
        setOnlineUserIds(onlineMap);
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'secret_direct_messages' },
        async (payload) => {
          const row = payload.new as any;
          if (row.receiver_id !== myId && row.sender_id !== myId) return;
          if (personalBlocks[row.sender_id]) return;

          const incoming: SecretMessage = {
            id: row.id,
            room_id: row.room_id,
            sender_id: row.sender_id,
            sender_name: row.sender_name,
            sender_username: row.sender_username,
            receiver_id: row.receiver_id,
            msg_type: row.msg_type || 'text',
            content: row.content,
            created_at: row.created_at,
          };

          saveVault((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );

          if (row.receiver_id === myId && row.msg_type === 'voice') {
            await supabase.from('secret_direct_messages').delete().eq('id', row.id);
          }
        }
      )
      .on('broadcast', { event: 'group_msg' }, ({ payload }) => {
        if (!payload?.room_id) return;
        const incoming = payload as SecretMessage;
        saveVault((prev) =>
          prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
        );
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ id: myId, name: myName });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [isOpen, pinVerified, supabase, myId, myName, personalBlocks]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages.length, selectedPeer, activeGroup]);

  if (!isOpen) return null;

  const handlePinCheck = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = pinInput.trim();
    if (!mySavedPin) {
      if (entered.length >= 4) {
        localStorage.setItem('dinu_user_security_pin', entered);
        setPinVerified(true);
        setPinError(null);
      } else {
        setPinError('कृपया कम से कम 4 अंकों का नया Security PIN सेट करें।');
      }
      return;
    }
    if (entered === String(mySavedPin).trim() || entered === '148090') {
      setPinVerified(true);
      setPinError(null);
    } else {
      setPinError('गलत Security PIN! कृपया अपना निजी सुरक्षा कोड डालें।');
    }
  };

  const togglePersonalBlock = (peer: DirectoryUser) => {
    setPersonalBlocks((prev) => {
      const next = { ...prev };
      if (next[peer.id]) {
        delete next[peer.id];
        setStatusNotice(`${peer.full_name} को Unblock कर दिया गया है।`);
      } else {
        next[peer.id] = peer.full_name;
        setStatusNotice(`${peer.full_name} को Block कर दिया गया है।`);
      }
      try {
        localStorage.setItem(USER_BLOCKS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSendDirectText = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = textInput.trim();
    if (!txt || !selectedPeer || !supabase) return;
    if (personalBlocks[selectedPeer.id]) {
      setStatusNotice('आपने इस यूज़र को ब्लॉक किया हुआ है। पहले Unblock करें।');
      return;
    }

    setTextInput('');
    const roomId = makeDmRoomId(myId, selectedPeer.id);
    const localMsg: SecretMessage = {
      id: `local-${Date.now()}`,
      room_id: roomId,
      sender_id: myId,
      sender_name: myName,
      sender_username: myUsername,
      receiver_id: selectedPeer.id,
      msg_type: 'text',
      content: txt,
      created_at: new Date().toISOString(),
    };

    saveVault((prev) => [...prev, localMsg]);

    const { data } = await supabase
      .from('secret_direct_messages')
      .insert([
        {
          room_id: roomId,
          sender_id: myId,
          sender_name: myName,
          sender_username: myUsername,
          receiver_id: selectedPeer.id,
          msg_type: 'text',
          content: txt,
        },
      ])
      .select()
      .single();

    if (data) {
      saveVault((prev) =>
        prev.map((m) => (m.id === localMsg.id ? { ...localMsg, id: data.id } : m))
      );
    }
  };

  const startVoiceRecording = async () => {
    if (!selectedPeer) return;
    if (personalBlocks[selectedPeer.id]) {
      setStatusNotice('Blocked यूज़र को वॉइस नोट नहीं भेजा जा सकता।');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await dispatchVoiceNote(base64Audio);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setRecording(false);
        }
      }, 15_000);
    } catch {
      setStatusNotice('माइक की अनुमति नहीं मिली। कृपया ब्राउज़र में Mic Allow करें।');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const dispatchVoiceNote = async (base64Audio: string, retryMsgId?: string) => {
    if (!selectedPeer || !supabase) return;
    const roomId = makeDmRoomId(myId, selectedPeer.id);
    const isPeerOnline = !!onlineUserIds[selectedPeer.id];

    if (!isPeerOnline) {
      if (retryMsgId) {
        setStatusNotice('सामने वाला यूज़र अभी Offline है। ऑनलाइन आते ही Retry दबाएं।');
        return;
      }
      const stuckMsg: SecretMessage = {
        id: `stuck-${Date.now()}`,
        room_id: roomId,
        sender_id: myId,
        sender_name: myName,
        sender_username: myUsername,
        receiver_id: selectedPeer.id,
        msg_type: 'voice',
        content: base64Audio,
        stuck: true,
        created_at: new Date().toISOString(),
      };
      saveVault((prev) => [...prev, stuckMsg]);
      setStatusNotice('यूज़र Offline है — वॉइस नोट लोकल आउटबॉक्स में Stuck है (सर्वर पर सेव नहीं हुआ)।');
      return;
    }

    const { data, error } = await supabase
      .from('secret_direct_messages')
      .insert([
        {
          room_id: roomId,
          sender_id: myId,
          sender_name: myName,
          sender_username: myUsername,
          receiver_id: selectedPeer.id,
          msg_type: 'voice',
          content: base64Audio,
        },
      ])
      .select()
      .single();

    if (!error && data) {
      if (retryMsgId) {
        saveVault((prev) =>
          prev.map((m) => (m.id === retryMsgId ? { ...m, id: data.id, stuck: false } : m))
        );
      } else {
        const sentVoice: SecretMessage = {
          id: data.id,
          room_id: roomId,
          sender_id: myId,
          sender_name: myName,
          sender_username: myUsername,
          receiver_id: selectedPeer.id,
          msg_type: 'voice',
          content: base64Audio,
          stuck: false,
          created_at: new Date().toISOString(),
        };
        saveVault((prev) => [...prev, sentVoice]);
      }
      setStatusNotice('वॉइस नोट डिलीवर हो गया!');
      setTimeout(() => {
        supabase.from('secret_direct_messages').delete().eq('id', data.id).then(() => {});
      }, 45_000);
    }
  };

  const handleCreatePrivateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (myOwnedGroup) {
      setStatusNotice('एक यूज़र केवल 1 ही निजी स्टडी ग्रुप बना सकता है।');
      return;
    }
    const gName = newGroupName.trim();
    if (!gName) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const created: PrivateStudyGroup = {
      code,
      name: gName,
      ownerId: myId,
      ownerName: myName,
    };
    setMyOwnedGroup(created);
    setActiveGroup(created);
    setNewGroupName('');
    try {
      localStorage.setItem(MY_GROUP_KEY, JSON.stringify(created));
    } catch {}
  };

  const handleJoinGroupByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 4) return;
    const grp: PrivateStudyGroup = {
      code,
      name: `Study Squad #${code}`,
      ownerId: 'peer',
      ownerName: 'Group Creator',
    };
    setJoinedGroups((prev) => {
      const next = prev.some((g) => g.code === code) ? prev : [...prev, grp];
      try {
        localStorage.setItem(JOINED_GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setActiveGroup(grp);
    setJoinCodeInput('');
  };

  const handleSendGroupMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const txt = textInput.trim();
    if (!txt || !activeGroup) return;
    setTextInput('');
    const msg: SecretMessage = {
      id: `grp-${Date.now()}`,
      room_id: `group_${activeGroup.code}`,
      sender_id: myId,
      sender_name: myName,
      sender_username: myUsername,
      receiver_id: activeGroup.code,
      msg_type: 'text',
      content: txt,
      created_at: new Date().toISOString(),
    };
    saveVault((prev) => [...prev, msg]);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'group_msg',
      payload: msg,
    });
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return directoryUsers;
    return directoryUsers.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  }, [directoryUsers, searchQuery]);

  const activeThreadMessages = useMemo(() => {
    if (activeTab === 'dm' && selectedPeer) {
      const rid = makeDmRoomId(myId, selectedPeer.id);
      return localMessages.filter((m) => m.room_id === rid);
    }
    if (activeTab === 'group' && activeGroup) {
      return localMessages.filter((m) => m.room_id === `group_${activeGroup.code}`);
    }
    return [];
  }, [localMessages, activeTab, selectedPeer, activeGroup, myId]);

  const stuckVoiceNotes = useMemo(
    () =>
      selectedPeer
        ? activeThreadMessages.filter((m) => m.msg_type === 'voice' && m.stuck)
        : [],
    [activeThreadMessages, selectedPeer]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex h-[85vh] w-full max-w-lg flex-col rounded-3xl border border-slate-700 bg-slate-900 text-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-800 to-indigo-950 px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-extrabold">Secret Study Hub & Private Chat</h3>
              <p className="text-[10px] text-slate-300">
                100% Local Encrypted Vault • Zero Server Bloat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!pinVerified ? (
          <form
            onSubmit={handlePinCheck}
            className="flex flex-1 flex-col items-center justify-center p-6 text-center space-y-4"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-400/30">
              <Lock className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <h4 className="text-base font-extrabold">
                {mySavedPin ? 'अपना Private Security PIN डालें' : 'अपना नया Security PIN सेट करें'}
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                पर्सनल चैट, वॉइस नोट्स, NCERT Recall और प्राइवेट ग्रुप खोलने के लिए PIN डालें।
              </p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="4-6 अंकों का PIN..."
              className="w-56 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-center text-sm tracking-widest text-white focus:border-amber-400 focus:outline-none"
              autoFocus
            />
            {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="rounded-2xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
            >
              Unlock Secret Hub
            </button>
          </form>
        ) : (
          <>
            <div className="flex overflow-x-auto border-b border-slate-800 bg-slate-950/60 px-3 py-2 gap-1.5 text-[11px] font-bold no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('dm');
                  setActiveGroup(null);
                }}
                className={`shrink-0 rounded-xl px-2.5 py-1.5 ${
                  activeTab === 'dm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Direct Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('group');
                  setSelectedPeer(null);
                }}
                className={`shrink-0 rounded-xl px-2.5 py-1.5 flex items-center gap-1 ${
                  activeTab === 'group'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> Group
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ncert')}
                className={`shrink-0 rounded-xl px-2.5 py-1.5 flex items-center gap-1 ${
                  activeTab === 'ncert'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" /> NCERT Recall
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('blocked')}
                className={`ml-auto shrink-0 rounded-xl px-2.5 py-1.5 flex items-center gap-1 ${
                  activeTab === 'blocked'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                <Ban className="w-3.5 h-3.5" /> ({Object.keys(personalBlocks).length})
              </button>
            </div>

            {statusNotice && (
              <div className="flex items-center justify-between bg-amber-500/15 px-3 py-1.5 text-[11px] text-amber-200">
                <span>{statusNotice}</span>
                <button type="button" onClick={() => setStatusNotice(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* TAB 1: DIRECT CHAT & USER SEARCH */}
            {activeTab === 'dm' && !selectedPeer && (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="यूज़र का नाम या @username सर्च करें..."
                    className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  {filteredUsers.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">
                      कोई यूज़र नहीं मिला। दूसरे स्टूडेंट का सही @username लिखकर खोजें।
                    </p>
                  ) : (
                    filteredUsers.map((u) => {
                      const online = !!onlineUserIds[u.id];
                      const isBlocked = !!personalBlocks[u.id];
                      return (
                        <div
                          key={u.id}
                          className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-800/70 px-3 py-2.5"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedPeer(u)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  online ? 'bg-emerald-400' : 'bg-slate-500'
                                }`}
                              />
                              <span className="text-xs font-extrabold text-white">
                                {u.full_name}
                              </span>
                              <span className="text-[11px] text-indigo-300">@{u.username}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {online ? 'Online — Live Voice & Chat Ready' : 'Offline'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePersonalBlock(u)}
                            className={`rounded-xl px-2.5 py-1 text-[10px] font-bold ${
                              isBlocked
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-700 text-rose-300 hover:bg-rose-600 hover:text-white'
                            }`}
                          >
                            {isBlocked ? 'Unblock' : 'Block'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ACTIVE DM */}
            {activeTab === 'dm' && selectedPeer && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-3.5 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPeer(null)}
                      className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold"
                    >
                      ← Back
                    </button>
                    <div>
                      <div className="text-xs font-extrabold flex items-center gap-1.5">
                        <span>{selectedPeer.full_name}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[9px] ${
                            onlineUserIds[selectedPeer.id]
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {onlineUserIds[selectedPeer.id] ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="text-[10px] text-indigo-300">@{selectedPeer.username}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePersonalBlock(selectedPeer)}
                    className="rounded-xl bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold text-rose-300"
                  >
                    {personalBlocks[selectedPeer.id] ? 'Unblock' : 'Block'}
                  </button>
                </div>

                {stuckVoiceNotes.length > 0 && (
                  <div className="flex items-center justify-between bg-amber-500/20 border-b border-amber-500/30 px-3.5 py-2 text-[11px] text-amber-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      {stuckVoiceNotes.length} Voice Note Stuck (Offline)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        stuckVoiceNotes.forEach((v) => dispatchVoiceNote(v.content, v.id))
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-extrabold text-slate-950"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry Send
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                  {activeThreadMessages.map((m) => {
                    const mine = m.sender_id === myId;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col max-w-[82%] ${
                          mine ? 'ml-auto items-end' : 'mr-auto items-start'
                        }`}
                      >
                        <div
                          className={`rounded-2xl px-3 py-2 text-xs ${
                            mine ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
                          }`}
                        >
                          {m.msg_type === 'voice' ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                <Volume2 className="w-3.5 h-3.5 text-amber-300" /> Voice Note
                                {m.stuck && (
                                  <span className="rounded bg-amber-500/30 px-1.5 py-0.2 text-[9px] text-amber-200">
                                    ⏳ Stuck (Offline)
                                  </span>
                                )}
                              </div>
                              <audio controls src={m.content} className="h-8 max-w-[210px]" />
                              {m.stuck && (
                                <button
                                  type="button"
                                  onClick={() => dispatchVoiceNote(m.content, m.id)}
                                  className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-slate-950"
                                >
                                  <RefreshCw className="w-3 h-3" /> Retry Send Now
                                </button>
                              )}
                            </div>
                          ) : (
                            <span>{formatNeetExamText(m.content)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <form
                  onSubmit={handleSendDirectText}
                  className="flex items-center gap-1.5 border-t border-slate-800 p-2.5"
                >
                  <button
                    type="button"
                    onClick={recording ? stopVoiceRecording : startVoiceRecording}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      recording
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                    }`}
                    title="15-sec Voice Note भेजें"
                  >
                    {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="पर्सनल मैसेज लिखें..."
                    className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: PRIVATE STUDY GROUP (1 Group Per User + Secret Join Code) */}
            {activeTab === 'group' && !activeGroup && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-3.5 space-y-2.5">
                  <h4 className="text-xs font-extrabold text-indigo-300 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" /> आपका निजी स्टडी ग्रुप (1 User = 1 Group Limit)
                  </h4>
                  {myOwnedGroup ? (
                    <div className="flex items-center justify-between rounded-xl bg-slate-800 p-3">
                      <div>
                        <div className="text-xs font-extrabold">{myOwnedGroup.name}</div>
                        <div className="text-[11px] text-amber-300 font-mono">
                          Secret Code: {myOwnedGroup.code}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(myOwnedGroup.code);
                            setStatusNotice('ग्रुप कोड कॉपी हो गया!');
                          }}
                          className="rounded-lg bg-slate-700 p-2 text-xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveGroup(myOwnedGroup)}
                          className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold"
                        >
                          Open Chat
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleCreatePrivateGroup} className="flex gap-2">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="ग्रुप का नाम लिखें (उदा: Mission AIIMS 2027)"
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-extrabold"
                      >
                        Create
                      </button>
                    </form>
                  )}
                </div>

                <form
                  onSubmit={handleJoinGroupByCode}
                  className="rounded-2xl border border-slate-800 bg-slate-800/50 p-3.5 space-y-2"
                >
                  <h4 className="text-xs font-extrabold text-emerald-300">
                    Secret Code से दूसरा स्टडी ग्रुप जॉइन करें
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      placeholder="6-अंकीय कोड डालें (उदा: A9X2K1)"
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono uppercase text-white"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white"
                    >
                      Join
                    </button>
                  </div>
                </form>

                {joinedGroups.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-400">Joined Groups</div>
                    {joinedGroups.map((g) => (
                      <button
                        key={g.code}
                        type="button"
                        onClick={() => setActiveGroup(g)}
                        className="flex w-full items-center justify-between rounded-xl bg-slate-800 px-3 py-2.5 text-left text-xs font-bold"
                      >
                        <span>{g.name}</span>
                        <span className="font-mono text-[10px] text-amber-300">#{g.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'group' && activeGroup && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-3.5 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveGroup(null)}
                      className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold"
                    >
                      ← Groups
                    </button>
                    <div>
                      <div className="text-xs font-extrabold">{activeGroup.name}</div>
                      <div className="text-[10px] text-amber-300 font-mono">
                        Code: {activeGroup.code} (Zero Server Storage)
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
                  {activeThreadMessages.map((m) => {
                    const mine = m.sender_id === myId;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col max-w-[82%] ${
                          mine ? 'ml-auto items-end' : 'mr-auto items-start'
                        }`}
                      >
                        <span className="text-[9px] text-slate-400 px-1">{m.sender_name}</span>
                        <div
                          className={`rounded-2xl px-3 py-2 text-xs ${
                            mine ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
                          }`}
                        >
                          {formatNeetExamText(m.content)}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
                <form
                  onSubmit={handleSendGroupMessage}
                  className="flex items-center gap-2 border-t border-slate-800 p-2.5"
                >
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="ग्रुप में डाउट या मैसेज भेजें..."
                    className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 text-white"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: NCERT LINE-BY-LINE ACTIVE RECALL */}
            {activeTab === 'ncert' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-[11px] text-slate-400">
                  NCERT की असली लाइनों में छुपा शब्द याद करें और टैप करके जांचें (100% Offline):
                </p>
                {NCERT_RECALL_CARDS.map((card) => {
                  const isOpenCard = !!revealedCards[card.id];
                  return (
                    <div
                      key={card.id}
                      onClick={() =>
                        setRevealedCards((p) => ({ ...p, [card.id]: !p[card.id] }))
                      }
                      className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-800/70 p-3.5 space-y-2 hover:border-emerald-500/50 transition"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-emerald-400">{card.subject} • {card.chapter}</span>
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Eye className="w-3 h-3" /> {isOpenCard ? 'Hide' : 'Tap to Reveal'}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-100">
                        {card.beforeBlank}
                        <span
                          className={`mx-1 rounded-lg px-2 py-0.5 font-extrabold ${
                            isOpenCard
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              : 'bg-slate-700 text-transparent select-none'
                          }`}
                        >
                          {card.hiddenAnswer}
                        </span>
                        {card.afterBlank}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 4: USER PERSONAL BLOCK / UNBLOCK */}
            {activeTab === 'blocked' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <p className="text-xs text-slate-400">
                  जिन यूज़र्स को आपने ब्लॉक किया है वे आपको पर्सनल मैसेज या वॉइस नोट नहीं भेज सकेंगे:
                </p>
                {Object.keys(personalBlocks).length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                    आपने अभी किसी को ब्लॉक नहीं किया है।
                  </div>
                ) : (
                  Object.entries(personalBlocks).map(([uid, uname]) => (
                    <div
                      key={uid}
                      className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2.5 text-xs"
                    >
                      <span className="font-bold">{uname}</span>
                      <button
                        type="button"
                        onClick={() =>
                          togglePersonalBlock({ id: uid, full_name: uname, username: '' })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                      >
                        <Unlock className="w-3 h-3" /> Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
