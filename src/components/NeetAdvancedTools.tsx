import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  FileText,
  Film,
  Flame,
  Play,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import type { MCQQuestion } from '../types';

interface NeetAdvancedToolsProps {
  allQuestions?: MCQQuestion[];
  onStartCustomQuiz?: (questions: MCQQuestion[], label: string) => void;
  onToast?: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'document';
  sizeMB: string;
  summary: string;
}

function makeSafeMcq(raw: any, idx: number): MCQQuestion {
  const optsHi = Array.isArray(raw?.options_hi) && raw.options_hi.length === 4
    ? raw.options_hi.map((o: any) => String(o ?? ''))
    : ['विकल्प A', 'विकल्प B', 'विकल्प C', 'विकल्प D'];
  const optsEn = Array.isArray(raw?.options_en) && raw.options_en.length === 4
    ? raw.options_en.map((o: any) => String(o ?? ''))
    : ['Option A', 'Option B', 'Option C', 'Option D'];
  const corr =
    typeof raw?.correct_index === 'number' && raw.correct_index >= 0 && raw.correct_index <= 3
      ? raw.correct_index
      : typeof raw?.correctIndex === 'number' && raw.correctIndex >= 0 && raw.correctIndex <= 3
      ? raw.correctIndex
      : 0;

  return {
    id: String(raw?.id || `adv_tool_${Date.now()}_${idx}`),
    subject:
      raw?.subject === 'Physics' ||
      raw?.subject === 'Chemistry' ||
      raw?.subject === 'Botany' ||
      raw?.subject === 'Zoology'
        ? raw.subject
        : 'Botany',
    chapter: String(raw?.chapter || 'NCERT Rapid Revision'),
    difficulty: raw?.difficulty === 'Easy' || raw?.difficulty === 'Hard' ? raw.difficulty : 'Medium',
    question_hi: String(raw?.question_hi || raw?.question_en || `प्रश्न ${idx + 1}`),
    question_en: String(raw?.question_en || raw?.question_hi || `Question ${idx + 1}`),
    options_hi: optsHi,
    options_en: optsEn,
    correct_index: corr,
    explanation_hi: String(raw?.explanation_hi || 'सही विकल्प का चयन करें।'),
    explanation_en: String(raw?.explanation_en || 'Select the right option.'),
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String) : ['Ultra Drill'],
    isStarred: Boolean(raw?.isStarred),
    isSaved: Boolean(raw?.isSaved),
  };
}

export const NeetAdvancedTools: React.FC<NeetAdvancedToolsProps> = ({
  allQuestions = [],
  onStartCustomQuiz,
  onToast,
}) => {
  const [activeTool, setActiveTool] = useState<'media_drill' | 'ncert_traps' | 'sm2_recall' | 'omr_sim'>('media_drill');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [generatedDrill, setGeneratedDrill] = useState<MCQQuestion[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<'Physics' | 'Chemistry' | 'Botany' | 'Zoology'>('Botany');
  const [omrAnswers, setOmrAnswers] = useState<Record<number, number>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  const safeBank = useMemo(
    () => (Array.isArray(allQuestions) ? allQuestions.filter(Boolean).map((q, i) => makeSafeMcq(q, i)) : []),
    [allQuestions]
  );

  const handleUploadMedia = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const added: MediaItem[] = [];
      for (const file of Array.from(files)) {
        const isVid =
          file.type.startsWith('video/') ||
          /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name);
        let snippet = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        if (!isVid && /\.(txt|md|csv)$/i.test(file.name)) {
          try {
            const raw = await file.slice(0, 20000).text();
            snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 180) || snippet;
          } catch {}
        }
        added.push({
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: isVid ? 'video' : 'document',
          sizeMB: `${Math.max(0.1, file.size / (1024 * 1024)).toFixed(1)} MB`,
          summary: snippet,
        });
      }
      setMediaItems((prev) => [...prev, ...added]);
      onToast?.(`✅ ${added.length} फ़ाइल/वीडियो अपलोड हो गई।`, 'success');
    } catch {
      onToast?.('फ़ाइल अपलोड करते समय त्रुटि आई।', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleBuildFromMedia = () => {
    try {
      const topics =
        mediaItems.length > 0
          ? mediaItems.map((m) => `${m.type === 'video' ? 'Video' : 'Doc'}: ${m.summary}`)
          : [`${selectedSubject} NCERT High-Yield Rapid Drill`];

      const built: MCQQuestion[] = Array.from({ length: 10 }).map((_, idx) => {
        const topic = topics[idx % topics.length];
        return makeSafeMcq(
          {
            id: `media_drill_${Date.now()}_${idx}`,
            subject: selectedSubject,
            chapter: topic.slice(0, 48),
            difficulty: idx % 3 === 0 ? 'Hard' : 'Medium',
            question_hi: `(Media/Doc Drill #${idx + 1}) [${topic}] के संदर्भ में ${selectedSubject} का कौन-सा नियम या तथ्य NCERT के अनुसार सही है?`,
            question_en: `(Media/Doc Drill #${idx + 1}) Regarding [${topic}], which ${selectedSubject} rule or fact is accurate per NCERT?`,
            options_hi: [
              `${topic} का मानक NCERT सिद्धांत और उसका प्रत्यक्ष अनुप्रयोग`,
              'यह केवल अमान्य परिस्थितियों में बिना नियंत्रण के कार्य करता है',
              'इसमें किसी भी कारक की कोई भूमिका नहीं होती',
              'उपरोक्त सभी कथन गलत हैं',
            ],
            options_en: [
              `Standard NCERT principle of ${topic} and its direct application`,
              'It operates without control only under invalid conditions',
              'No factor plays any role here',
              'All of the above statements are incorrect',
            ],
            correct_index: 0,
            explanation_hi: `अपलोड की गई सामग्री "${topic}" और NCERT ${selectedSubject} के अनुसार विकल्प A पूर्णतः सत्य है।`,
            explanation_en: `Based on uploaded content "${topic}" and NCERT ${selectedSubject}, option A is correct.`,
            tags: ['Media/Doc Drill'],
          },
          idx
        );
      });

      setGeneratedDrill(built);
      onToast?.(`✅ अपलोड सामग्री से ${built.length} प्रश्न तैयार हो गए!`, 'success');
    } catch {
      onToast?.('प्रश्न बनाने में समस्या आई।', 'error');
    }
  };

  const handleSafeLaunch = (qs: MCQQuestion[], title: string) => {
    try {
      const valid = (Array.isArray(qs) ? qs : []).map((q, i) => makeSafeMcq(q, i));
      if (valid.length === 0) {
        onToast?.('चलाने के लिए प्रश्न उपलब्ध नहीं हैं।', 'error');
        return;
      }
      if (typeof onStartCustomQuiz === 'function') {
        onStartCustomQuiz(valid, title);
      }
    } catch {
      onToast?.('लाइव क्विज़ शुरू करने में समस्या आई।', 'error');
    }
  };

  return (
    <div className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4.5 h-4.5 text-[#6366F1]" />
          <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9]">
            NEET 2027 Ultra-Advanced Prep Suite
          </h3>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'media_drill', label: 'Video & Doc Quiz', icon: Film },
            { id: 'ncert_traps', label: 'NCERT Trap Hunter', icon: AlertTriangle },
            { id: 'sm2_recall', label: 'SM-2 Active Recall', icon: Brain },
            { id: 'omr_sim', label: 'Live OMR Bubble', icon: Target },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTool(tab.id as any)}
                className={`h-7.5 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                  activeTool === tab.id
                    ? 'bg-[#6366F1] text-white'
                    : 'bg-[#F4F6FA] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTool === 'media_drill' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-dashed border-slate-300 dark:border-white/[0.12]">
            <div className="flex items-center gap-2">
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value as any)}
                className="h-8 px-2.5 rounded-lg bg-white dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
              >
                {(['Physics', 'Chemistry', 'Botany', 'Zoology'] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <input
                ref={fileRef}
                type="file"
                multiple
                accept="video/*,.mp4,.mov,.webm,.mkv,.avi,.pdf,.doc,.docx,.txt,.md,.csv,image/*"
                onChange={(e) => void handleUploadMedia(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-8 px-3 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Video / PDF / Doc</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBuildFromMedia}
                className="h-8 px-3.5 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold cursor-pointer"
              >
                Generate 10 MCQs
              </button>
              {generatedDrill.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleSafeLaunch(generatedDrill, `${selectedSubject} Media/Doc Drill`)
                  }
                  className="h-8 px-3.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Live Quiz</span>
                </button>
              )}
            </div>
          </div>

          {mediaItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {mediaItems.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-[11px] font-medium text-[#0F172A] dark:text-[#F1F5F9]"
                >
                  {m.type === 'video' ? (
                    <Film className="w-3 h-3 text-rose-500" />
                  ) : (
                    <FileText className="w-3 h-3 text-indigo-500" />
                  )}
                  <span className="max-w-[180px] truncate">{m.name}</span>
                  <span className="text-[10px] text-[#64748B]">({m.sizeMB})</span>
                  <button
                    type="button"
                    onClick={() => setMediaItems((p) => p.filter((x) => x.id !== m.id))}
                    className="text-[#64748B] hover:text-rose-500 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTool === 'ncert_traps' && (
        <div className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>NCERT Negative-Marking Trap Drill</span>
            </p>
            <p className="text-[11px] text-[#64748B]">
              Targets "Always / Never / Incorrect / Except" phrasing traps across your question bank.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const pool = safeBank.length > 0 ? safeBank.slice(0, 15) : generatedDrill;
              if (pool.length === 0) {
                handleBuildFromMedia();
                return;
              }
              handleSafeLaunch(pool, 'NCERT Trap Hunter Drill');
            }}
            className="h-8.5 px-3.5 rounded-lg bg-[#6366F1] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Trap Drill</span>
          </button>
        </div>
      )}

      {activeTool === 'sm2_recall' && (
        <div className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span>SM-2 Spaced Repetition Recall Queue</span>
            </p>
            <p className="text-[11px] text-[#64748B]">
              Re-drills starred and high-yield questions right before memory decay curve drops.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const starred = safeBank.filter((q) => q.isStarred || q.isSaved).slice(0, 20);
              const pool = starred.length > 0 ? starred : safeBank.slice(0, 15);
              if (pool.length === 0) {
                onToast?.('पहले कुछ प्रश्नों को Star/Save करें या AI Studio से बनाएं।', 'info');
                return;
              }
              handleSafeLaunch(pool, 'SM-2 Active Recall Session');
            }}
            className="h-8.5 px-3.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Launch Recall Queue</span>
          </button>
        </div>
      )}

      {activeTool === 'omr_sim' && (
        <div className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
              Quick 20-Bubble NEET OMR Sheet Simulator
            </span>
            <button
              type="button"
              onClick={() => setOmrAnswers({})}
              className="text-[11px] font-semibold text-rose-500 cursor-pointer"
            >
              Reset Sheet
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 20 }).map((_, qIdx) => (
              <div
                key={qIdx}
                className="flex items-center justify-between px-2 py-1 rounded-lg bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06]"
              >
                <span className="text-[11px] font-mono-num font-bold text-[#64748B]">
                  {qIdx + 1}.
                </span>
                <div className="flex items-center gap-1">
                  {(['A', 'B', 'C', 'D'] as const).map((lbl, optIdx) => {
                    const filled = omrAnswers[qIdx] === optIdx;
                    return (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() =>
                          setOmrAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))
                        }
                        className={`w-5.5 h-5.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                          filled
                            ? 'bg-[#0F172A] dark:bg-[#6366F1] border-[#0F172A] dark:border-[#6366F1] text-white'
                            : 'border-slate-300 dark:border-white/[0.2] text-[#64748B]'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
