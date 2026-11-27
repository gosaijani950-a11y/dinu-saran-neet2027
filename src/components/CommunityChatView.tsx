import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Send, Bot, Sparkles, Users, Loader2, RefreshCw } from 'lucide-react';
import type { AppSettings, StudentProfile } from '../types';

export interface CommunityMessage {
  id: string;
  student_id: string;
  student_name: string;
  batch_name?: string;
  is_ai: boolean;
  message: string;
  created_at: string;
}

interface CommunityChatViewProps {
  currentStudent: StudentProfile | null;
  settings: AppSettings;
  onRequireLogin: () => void;
}

export const CommunityChatView: React.FC<CommunityChatViewProps> = ({
  currentStudent,
  settings,
  onRequireLogin,
}) => {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const supabase = useMemo(() => {
    const env = (import.meta as { env?: Record<string, string> }).env || {};
    const url = (settings.supabaseUrl || env.VITE_SUPABASE_URL || '').trim();
    const key = (settings.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return null;
    return createClient(url, key);
  }, [settings.supabaseUrl, settings.supabaseAnonKey]);

  const fetchMessages = async () => {
    if (!supabase) {
      setErrorMsg('Supabase URL या Anon Key सेट नहीं है। कृपया Settings में जांचें।');
      setLoading(false);
      return;
    }
    try {
      setErrorMsg(null);
      const { data, error } = await supabase
        .from('community_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      if (data) {
        setMessages((data as CommunityMessage[]).reverse());
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'चैट लोड करने में समस्या आई।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    if (!supabase) return;

    const channel = supabase
      .channel('public:community_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_messages' },
        (payload) => {
          const incoming = payload.new as CommunityMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiThinking]);

  const triggerDinuAiReply = async (historySnapshot: CommunityMessage[], latestPrompt: string) => {
    if (!supabase) return;
    const envKey = (import.meta as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY?.trim();
    const activeKey = settings.apiKey?.trim() || settings.backupApiKey?.trim() || envKey;
    if (!activeKey) return;

    setAiThinking(true);
    try {
      const recentChat = historySnapshot
        .slice(-25)
        .map((m) => `${m.is_ai ? 'DINU AI' : m.student_name}: ${m.message}`)
        .join('\n');

      const model = settings.modelId || 'gemini-2.5-flash';
      const systemInstruction =
        'You are DINU AI, the smart NEET UG mentor inside Dinu Saran NEET 2027 Student Community Chat. ' +
        'You have read the entire recent group conversation below so you understand full context, earlier questions, options, and discussions. ' +
        'Reply ONLY because a student tagged @dinu. Address the student naturally in clear Hindi + English NCERT terms, concise and accurate.';

      const fullPrompt = `Recent Community Chat Context:\n${recentChat}\n\nLatest Tagged Request:\n${latestPrompt}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          }),
        }
      );

      const data = await res.json();
      const replyText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        'माफ़ करें, अभी जवाब जनरेट नहीं हो पाया। कृपया @dinu के साथ दोबारा पूछें।';

      await supabase.from('community_messages').insert([
        {
          student_id: 'dinu-ai-bot',
          student_name: 'DINU AI',
          batch_name: 'AI Mentor',
          is_ai: true,
          message: replyText,
        },
      ]);
    } catch {
      // Silent fail so student chat remains uninterrupted
    } finally {
      setAiThinking(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    if (!currentStudent) {
      onRequireLogin();
      return;
    }
    if (!supabase) {
      setErrorMsg('Supabase कनेक्ट नहीं है।');
      return;
    }

    setSending(true);
    setInput('');
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('community_messages')
        .insert([
          {
            student_id: currentStudent.id,
            student_name: currentStudent.name,
            batch_name: currentStudent.batch || 'NEET 2027',
            is_ai: false,
            message: text,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      const insertedMsg = data as CommunityMessage;
      const updatedHistory = messages.some((m) => m.id === insertedMsg.id)
        ? messages
        : [...messages, insertedMsg];
      setMessages(updatedHistory);

      if (/@dinu\b/i.test(text)) {
        await triggerDinuAiReply(updatedHistory, `${currentStudent.name}: ${text}`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'मैसेज भेजने में त्रुटि हुई।');
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const insertTag = () => {
    if (!input.toLowerCase().includes('@dinu')) {
      setInput((prev) => (prev ? `${prev} @dinu ` : '@dinu '));
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-125px)] max-w-2xl flex-col rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold">NEET 2027 Student Community</h2>
            <p className="text-[11px] text-indigo-100">
              AI से जवाब पाने के लिए मैसेज में <span className="font-bold text-amber-300">@dinu</span> लिखें
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchMessages}
          className="rounded-xl p-2 hover:bg-white/15"
          title="Refresh Chat"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 dark:bg-slate-950/60">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            कम्युनिटी चैट लोड हो रही है...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-xs text-slate-500">
            <Sparkles className="w-8 h-8 text-indigo-400 mb-2" />
            <p className="font-bold text-slate-700 dark:text-slate-300">अभी कोई मैसेज नहीं है</p>
            <p className="mt-1">
              पहला डाउट पूछें या <span className="font-bold text-indigo-500">@dinu</span> लिखकर AI से मदद लें!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = currentStudent && msg.student_id === currentStudent.id && !msg.is_ai;
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  isMine ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] text-slate-500">
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
                  {msg.message}
                </div>
              </div>
            );
          })
        )}

        {aiThinking && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-950/60 px-3.5 py-2 text-xs text-indigo-700 dark:text-indigo-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            DINU AI पूरी चैट पढ़कर जवाब तैयार कर रहा है...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          {errorMsg}
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
      >
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
              ? 'डाउट लिखें (AI के लिए @dinu लगाएं)...'
              : 'चैट करने के लिए पहले Student Login करें...'
          }
          className="flex-1 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
