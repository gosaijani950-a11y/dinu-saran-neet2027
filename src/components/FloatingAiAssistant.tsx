import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Trash2, Bot, Loader2, GripVertical } from 'lucide-react';
import type { AppSettings } from '../types';

interface FloatingAiAssistantProps {
  settings: AppSettings;
}

interface ChatMsg {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

export const FloatingAiAssistant: React.FC<FloatingAiAssistantProps> = ({ settings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'नमस्ते! मैं DINU AI हूँ। Physics, Chemistry या Biology का कोई भी NEET 2027 डाउट पूछें।',
    },
  ]);

  // Draggable Bubble Position (saved in localStorage)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('dinu_ai_btn_pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: typeof window !== 'undefined' ? window.innerWidth - 72 : 280, y: 420 };
  });

  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const clampPos = (x: number, y: number) => {
    const maxX = Math.max(12, window.innerWidth - 68);
    const maxY = Math.max(60, window.innerHeight - 68);
    return {
      x: Math.min(Math.max(12, x), maxX),
      y: Math.min(Math.max(60, y), maxY),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    draggingRef.current = true;
    movedRef.current = false;
    offsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const next = clampPos(e.clientX - offsetRef.current.x, e.clientY - offsetRef.current.y);
    if (Math.abs(next.x - pos.x) > 4 || Math.abs(next.y - pos.y) > 4) {
      movedRef.current = true;
    }
    setPos(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    localStorage.setItem('dinu_ai_btn_pos', JSON.stringify(pos));
    if (!movedRef.current) {
      setIsOpen((prev) => !prev);
    }
  };

  const askGeminiDoubt = async (e: React.FormEvent) => {
    e.preventDefault();
    const promptText = input.trim();
    if (!promptText || loading) return;

    if (!navigator.onLine) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}`, sender: 'user', text: promptText },
        {
          id: `${Date.now() + 1}`,
          sender: 'ai',
          text: '⚠️ अभी आप Offline हैं। DINU AI Doubt Solver के लिए इंटरनेट ऑन करें (बाकी सभी क्विज़ ऑफलाइन चलते रहेंगे)।',
        },
      ]);
      setInput('');
      return;
    }

    const activeKey = settings.apiKey?.trim() || settings.backupApiKey?.trim();
    if (!activeKey) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}`, sender: 'user', text: promptText },
        {
          id: `${Date.now() + 1}`,
          sender: 'ai',
          text: '⚠️ Admin ने अभी Gemini API Key सेट नहीं की है।',
        },
      ]);
      setInput('');
      return;
    }

    const userMsg: ChatMsg = { id: `${Date.now()}`, sender: 'user', text: promptText };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const model = settings.modelId || 'gemini-2.5-flash';
      const systemInstruction =
        'You are DINU AI, an expert NEET UG (Physics, Chemistry, Biology) tutor for Dinu Saran NEET 2027. Explain concepts clearly in simple Hindi + English NCERT terms, step-by-step, concise, and exam-focused.';

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
          }),
        }
      );

      const data = await res.json();
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        data?.error?.message ||
        'माफ़ करें, अभी जवाब नहीं मिल पाया। कृपया दोबारा पूछें।';

      setMessages((prev) => [...prev, { id: `${Date.now() + 2}`, sender: 'ai', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 2}`,
          sender: 'ai',
          text: 'नेटवर्क एरर आया है। कृपया इंटरनेट चेक करके दोबारा पूछें।',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Draggable Floating Bubble named DINU */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ left: `${pos.x}px`, top: `${pos.y}px`, touchAction: 'none' }}
        title="खींचकर कहीं भी रखें या टैप करके DINU AI से डाउट पूछें"
        className="fixed z-50 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-2xl ring-2 ring-white/40 active:scale-95 select-none cursor-grab"
      >
        <Sparkles className="w-5 h-5" />
        <span className="mt-0.5 text-[10px] font-black tracking-wider text-amber-200 leading-none">
          DINU
        </span>
      </button>

      {/* DINU AI Doubt Solver Drawer */}
      {isOpen && (
        <div className="fixed inset-x-3 bottom-20 sm:inset-x-auto sm:right-5 sm:w-96 z-50 flex max-h-[72vh] flex-col rounded-3xl border border-indigo-500/30 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-amber-300" />
              <div>
                <h3 className="text-sm font-extrabold leading-tight">DINU AI Doubt Solver</h3>
                <p className="text-[10px] text-indigo-100 flex items-center gap-1">
                  <GripVertical className="w-3 h-3" /> DINU बटन को खींचकर कहीं भी रख सकते हैं
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setMessages([
                    {
                      id: 'reset',
                      sender: 'ai',
                      text: 'चैट साफ़ हो गई है। नया NEET डाउट पूछें!',
                    },
                  ])
                }
                className="rounded-xl p-1.5 hover:bg-white/20"
                title="Clear Chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl p-1.5 hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap leading-relaxed ${
                  m.sender === 'user'
                    ? 'ml-auto bg-indigo-600 text-white rounded-br-sm'
                    : 'mr-auto bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="mr-auto flex items-center gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                DINU AI सोच रहा है...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={askGeminiDoubt}
            className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50 dark:bg-slate-950"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="DINU AI से कोई भी NEET सवाल पूछें..."
              className="flex-1 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
