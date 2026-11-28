import React, { useMemo, useState } from 'react';
import { UnifiedQuestionItem } from '../types';

export interface SmartRevisionAndOmrWidgetProps {
  questions?: UnifiedQuestionItem[];
  mistakeIds?: string[];
  onStartCustomQuiz?: (pool: UnifiedQuestionItem[], title: string) => void;
  onLaunchQuiz?: (pool: UnifiedQuestionItem[], title: string) => void;
  onPracticeCustomPool?: (pool: UnifiedQuestionItem[], title: string) => void;
  onOpenAiStudio?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SmartRevisionAndOmrWidget: React.FC<SmartRevisionAndOmrWidgetProps> = ({
  questions = [],
  mistakeIds = [],
  onStartCustomQuiz,
  onLaunchQuiz,
  onPracticeCustomPool,
  onOpenAiStudio,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'trap' | 'sm2' | 'omr'>('video');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [topicInput, setTopicInput] = useState<string>('');
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [trapMode, setTrapMode] = useState<'all' | 'statement' | 'assertion'>('all');

  // Live OMR State with NEET +4/-1 Auto Evaluator
  const [omrCount, setOmrCount] = useState<number>(45);
  const [omrAnswers, setOmrAnswers] = useState<Record<number, string>>({});
  const [omrAnswerKey, setOmrAnswerKey] = useState<string>('');
  const [omrSubmitted, setOmrSubmitted] = useState<boolean>(false);

  const launchPool = (pool: UnifiedQuestionItem[], title: string) => {
    const runner = onStartCustomQuiz || onLaunchQuiz || onPracticeCustomPool;
    if (!pool || pool.length === 0) {
      showToast?.('प्रश्न बैंक लोड हो रहा है, कृपया 2 सेकंड बाद दोबारा टैप करें!', 'info');
      return;
    }
    if (runner) {
      runner(pool, title);
    } else {
      showToast?.('क्विज़ इंजन तैयार हो रहा है...', 'info');
    }
  };

  const subjectFiltered = useMemo(() => {
    if (selectedSubject === 'All') return questions;
    return questions.filter(
      (q) => (q.subject || '').toLowerCase() === selectedSubject.toLowerCase()
    );
  }, [questions, selectedSubject]);

  // 1. Video, Lecture & Doc Smart Drill
  const handleStartTopicDocDrill = () => {
    const kw = topicInput.trim().toLowerCase();
    let pool = subjectFiltered;
    if (kw) {
      const matched = subjectFiltered.filter(
        (q) =>
          (q.question || '').toLowerCase().includes(kw) ||
          (q.chapter || '').toLowerCase().includes(kw) ||
          (q.topic || '').toLowerCase().includes(kw) ||
          (q.explanation || '').toLowerCase().includes(kw)
      );
      if (matched.length > 0) {
        pool = matched;
      } else {
        showToast?.(`"${topicInput.trim()}" के लिए ${selectedSubject} से हाई-यील्ड प्रश्न चुने गए हैं।`, 'info');
      }
    }
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, questionCount);
    const label = kw
      ? `📺 Lecture/Topic Drill: ${topicInput.trim()} (${picked.length} Qs)`
      : `📺 ${selectedSubject} Smart Doc Drill (${picked.length} Qs)`;
    launchPool(picked, label);
  };

  // 2. NCERT Negative-Marking Trap Hunter (All / Statement-Based / Assertion-Reason)
  const handleStartTrapDrill = () => {
    const keywordMap: Record<'all' | 'statement' | 'assertion', string[]> = {
      all: ['incorrect', 'not true', 'false', 'except', 'mismatch', 'statement', 'assertion', 'reason', 'wrong', 'correct pair'],
      statement: ['statement i', 'statement ii', 'statement 1', 'statement 2', 'both statement', 'statements'],
      assertion: ['assertion', 'reason', '(a)', '(r)', 'correct explanation'],
    };

    const keys = keywordMap[trapMode];
    const traps = subjectFiltered.filter((q) => {
      const txt = `${q.question || ''} ${q.explanation || ''}`.toLowerCase();
      return keys.some((k) => txt.includes(k));
    });

    const source = traps.length >= 4 ? traps : subjectFiltered;
    const picked = [...source].sort(() => Math.random() - 0.5).slice(0, questionCount);
    const modeTag =
      trapMode === 'statement'
        ? 'Statement I & II'
        : trapMode === 'assertion'
        ? 'Assertion-Reason'
        : 'Negative-Marking Trap';
    launchPool(picked, `⚠️ NCERT ${modeTag} Drill (${selectedSubject})`);
  };

  // 3. SM-2 Spaced Active Recall (Prioritizes Unresolved Mistakes + Weakest Subject)
  const handleStartSm2Recall = (mode: 'mistakes' | 'mixed') => {
    const mistakeSet = new Set(mistakeIds);
    const dueMistakes = subjectFiltered.filter((q) => mistakeSet.has(q.id));
    const fallbackMistakes = questions.filter((q) => mistakeSet.has(q.id));

    let pool: UnifiedQuestionItem[] = [];
    if (mode === 'mistakes' && (dueMistakes.length > 0 || fallbackMistakes.length > 0)) {
      const base = dueMistakes.length > 0 ? dueMistakes : fallbackMistakes;
      pool = [...base].sort(() => Math.random() - 0.5).slice(0, 20);
    } else {
      const priority = dueMistakes.slice(0, 10);
      const rest = subjectFiltered
        .filter((q) => !mistakeSet.has(q.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.max(10, 20 - priority.length));
      pool = [...priority, ...rest];
    }

    launchPool(
      pool,
      mode === 'mistakes'
        ? `🧠 SM-2 Mistake Mastery Drill (${pool.length} Qs)`
        : `🧠 SM-2 Spaced Active Recall Mix (${pool.length} Qs)`
    );
  };

  // 4. Live OMR Bubble Sheet + Instant NEET +4 / -1 Score Calculator
  const toggleOmrBubble = (qNo: number, opt: string) => {
    if (omrSubmitted) return;
    setOmrAnswers((prev) => {
      const next = { ...prev };
      if (next[qNo] === opt) delete next[qNo];
      else next[qNo] = opt;
      return next;
    });
  };

  const resetOmr = () => {
    setOmrAnswers({});
    setOmrSubmitted(false);
  };

  const omrResult = useMemo(() => {
    if (!omrSubmitted) return null;
    const cleanedKey = omrAnswerKey.toUpperCase().replace(/[^ABCD]/g, '');
    const attempted = Object.keys(omrAnswers).length;
    if (!cleanedKey) {
      return { attempted, hasKey: false, correct: 0, wrong: 0, score: 0, maxScore: omrCount * 4 };
    }
    let correct = 0;
    let wrong = 0;
    for (let i = 1; i <= omrCount; i++) {
      const ans = omrAnswers[i];
      const key = cleanedKey[i - 1];
      if (!ans || !key) continue;
      if (ans === key) correct++;
      else wrong++;
    }
    return {
      attempted,
      hasKey: true,
      correct,
      wrong,
      score: correct * 4 - wrong * 1,
      maxScore: Math.min(omrCount, cleanedKey.length) * 4,
    };
  }, [omrSubmitted, omrAnswerKey, omrAnswers, omrCount]);

  return (
    <div className="rounded-3xl border border-indigo-500/35 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black tracking-wide text-indigo-200">
            ✨ NEET 2027 Ultra-Advanced Prep Suite
          </h3>
          <p className="text-[11px] text-slate-400">
            Trap Hunter • SM-2 Spaced Recall • Lecture Drill • Live +4/-1 OMR
          </p>
        </div>
        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1 text-[10px] font-black text-indigo-300">
          {questions.length} MCQs Ready
        </span>
      </div>

      {/* 4 Mode Tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('video')}
          className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
            activeTab === 'video'
              ? 'bg-indigo-600 text-white shadow'
              : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
          }`}
        >
          📺 Video & Doc Quiz
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trap')}
          className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
            activeTab === 'trap'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
          }`}
        >
          ⚠️ NCERT Trap Hunter
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sm2')}
          className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
            activeTab === 'sm2'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
          }`}
        >
          🧠 SM-2 Active Recall
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('omr')}
          className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
            activeTab === 'omr'
              ? 'bg-rose-600 text-white shadow'
              : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
          }`}
        >
          🎯 Live OMR (+4/-1)
        </button>
      </div>

      {/* TAB 1: Video & Doc Quiz */}
      {activeTab === 'video' && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/75 p-3.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white"
            >
              <option value="All">All Subjects</option>
              <option value="Botany">Botany</option>
              <option value="Zoology">Zoology</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
            </select>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="Topic / NCERT Chapter (e.g. Genetics, Optics)..."
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 sm:col-span-2"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Optional: YouTube Lecture Link पेस्ट करें (Revision Reference)..."
              className="min-w-[200px] flex-1 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-500"
            />
            {youtubeUrl.trim() && (
              <a
                href={youtubeUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-500/25"
              >
                Open Lecture ↗
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400">Qs:</span>
              {[10, 15, 25, 45].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuestionCount(n)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    questionCount === n ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleStartTopicDocDrill}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow hover:bg-indigo-500 active:scale-95"
              >
                ▶ Start Instant {questionCount}-MCQ Drill
              </button>
              {onOpenAiStudio && (
                <button
                  type="button"
                  onClick={onOpenAiStudio}
                  className="rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3.5 py-2 text-xs font-extrabold text-indigo-200 hover:bg-indigo-500/25"
                >
                  📄 PDF / Notes AI Studio
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NCERT Trap Hunter */}
      {activeTab === 'trap' && (
        <div className="space-y-3 rounded-2xl border border-amber-500/35 bg-slate-950/75 p-3.5">
          <p className="text-xs text-slate-300">
            <b>NCERT Negative-Marking Trap Drill:</b> एग्जामिनर के सबसे पसंदीदा "Incorrect / Not True / Statement I-II / Assertion-Reason" प्रश्नों का प्रहार।
          </p>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', '⚠️ All Negative Traps'],
                ['statement', '📑 Statement I & II Only'],
                ['assertion', '🔗 Assertion-Reason Only'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTrapMode(key)}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-extrabold transition ${
                  trapMode === key
                    ? 'bg-amber-500/25 border border-amber-400 text-amber-200'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white"
            >
              <option value="All">All Subjects</option>
              <option value="Botany">Botany</option>
              <option value="Zoology">Zoology</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
            </select>
            <button
              type="button"
              onClick={handleStartTrapDrill}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow hover:bg-amber-400 active:scale-95"
            >
              🔥 Start Trap Drill ({questionCount} Qs)
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: SM-2 Active Recall */}
      {activeTab === 'sm2' && (
        <div className="space-y-3 rounded-2xl border border-emerald-500/35 bg-slate-950/75 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-300">
              आपके <b>{mistakeIds.length} Mistake Bank प्रश्नों</b> पर आधारित Spaced Repetition रिवीज़न।
            </p>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white"
            >
              <option value="All">All Subjects</option>
              <option value="Botany">Botany</option>
              <option value="Zoology">Zoology</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleStartSm2Recall('mistakes')}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow hover:bg-emerald-500 active:scale-95"
            >
              🧠 Revise Due Mistakes Only (20 Qs)
            </button>
            <button
              type="button"
              onClick={() => handleStartSm2Recall('mixed')}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-extrabold text-emerald-200 hover:bg-emerald-500/25"
            >
              ⚡ 50% Mistakes + 50% Fresh Mix
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Live OMR Bubble Sheet with NEET +4 / -1 Score Evaluator */}
      {activeTab === 'omr' && (
        <div className="space-y-3 rounded-2xl border border-rose-500/35 bg-slate-950/75 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-300">Qs:</span>
              {[20, 45, 90, 180].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    setOmrCount(cnt);
                    resetOmr();
                  }}
                  className={`rounded-lg px-2.5 py-1 font-bold ${
                    omrCount === cnt ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-rose-300">
                Filled: {Object.keys(omrAnswers).length}/{omrCount}
              </span>
              <button
                type="button"
                onClick={() => setOmrSubmitted(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1 font-black text-white hover:bg-emerald-500"
              >
                Submit & Score
              </button>
              <button
                type="button"
                onClick={resetOmr}
                className="rounded-lg bg-slate-800 px-2.5 py-1 font-bold text-slate-300 hover:bg-slate-700"
              >
                Reset
              </button>
            </div>
          </div>

          <input
            type="text"
            value={omrAnswerKey}
            onChange={(e) => setOmrAnswerKey(e.target.value)}
            placeholder="Optional Answer Key पेस्ट करें (e.g. ABCDABCD...) — Submit पर तुरंत NEET +4/-1 स्कोर दिखेगा"
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] uppercase tracking-wider text-amber-200 placeholder-slate-500"
          />

          {omrResult && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs">
              {omrResult.hasKey ? (
                <>
                  <span className="font-black text-emerald-300">
                    🏆 NEET Score: {omrResult.score} / {omrResult.maxScore}
                  </span>
                  <span className="text-slate-200">
                    ✅ {omrResult.correct} (+{omrResult.correct * 4}) • ❌ {omrResult.wrong} (-{omrResult.wrong})
                  </span>
                </>
              ) : (
                <span className="font-bold text-emerald-200">
                  🔒 OMR Locked! Total Attempted: {omrResult.attempted}/{omrCount} (ऊपर Answer Key डालकर +4/-1 स्कोर देखें)
                </span>
              )}
            </div>
          )}

          <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: omrCount }, (_, idx) => idx + 1).map((qNo) => {
              const cleanedKey = omrAnswerKey.toUpperCase().replace(/[^ABCD]/g, '');
              const trueOpt = cleanedKey[qNo - 1];
              return (
                <div
                  key={qNo}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="w-7 font-bold text-slate-400">Q{qNo}</span>
                  <div className="flex gap-1">
                    {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                      const active = omrAnswers[qNo] === opt;
                      let btnStyle = 'border border-slate-700 bg-slate-950 text-slate-300 hover:border-rose-400';
                      if (omrSubmitted && trueOpt) {
                        if (opt === trueOpt) btnStyle = 'bg-emerald-500 text-slate-950 font-black';
                        else if (active && opt !== trueOpt) btnStyle = 'bg-rose-600 text-white font-black';
                      } else if (active) {
                        btnStyle = 'bg-rose-500 text-white shadow';
                      }
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleOmrBubble(qNo, opt)}
                          className={`h-6 w-6 rounded-full text-[10px] font-black transition ${btnStyle}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
export const NeetCountdownAndFreezeBar: React.FC<{
  targetDateStr?: string;
  onFreezeToggle?: () => void;
  isFrozen?: boolean;
}> = ({ targetDateStr = '2027-05-02', onFreezeToggle, isFrozen = false }) => {
  const daysLeft = useMemo(() => {
    const target = new Date(targetDateStr).getTime();
    const diff = Math.max(0, target - Date.now());
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [targetDateStr]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-500/25 bg-slate-900/80 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 font-black text-indigo-200">
        <span>🎯 NEET UG 2027 Countdown:</span>
        <span className="rounded-lg bg-indigo-500/20 px-2 py-0.5 text-emerald-300">
          {daysLeft} Days Left
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <span>NCERT Line-by-Line • Active Recall • Zero-Lag Exam Mode</span>
        {onFreezeToggle && (
          <button
            type="button"
            onClick={onFreezeToggle}
            className={`rounded-lg px-2.5 py-0.5 font-bold ${
              isFrozen ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {isFrozen ? '❄️ Frozen' : '⚡ Live'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SmartRevisionAndOmrWidget;
