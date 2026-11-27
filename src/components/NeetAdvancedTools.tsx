import React, { useState, useEffect } from 'react';
import {
  Clock, ShieldCheck, BrainCircuit, CheckCircle2, XCircle,
  Play, CircleDot, Award, Wind, Focus
} from 'lucide-react';
import type { MCQQuestion, MistakeRecord } from '../types';

const FREEZE_KEY = 'dinu_neet2027_streak_freeze_v1';
const SM2_KEY = 'dinu_neet2027_sm2_schedule_v1';

interface Sm2Entry {
  questionId: string;
  intervalDays: number;
  nextDueTs: number;
}

const PANIC_RESET_MCQS = [
  {
    q: 'मानव हृदय में कुल कितने कक्ष (Chambers) होते हैं?',
    opts: ['2', '3', '4', '6'],
    ans: 2,
  },
  {
    q: 'DNA की संरचना में एडीनिन किसके साथ जुड़ता है?',
    opts: ['ग्वानीन', 'थायमिन', 'साइटोसिन', 'यूरेसिल'],
    ans: 1,
  },
  {
    q: 'SI इकाई में विद्युत धारा (Electric Current) का मात्रक क्या है?',
    opts: ['वोल्ट', 'ओम', 'एम्पियर', 'कूलॉम'],
    ans: 2,
  },
];

/* ==================== 1. NEET 2027 COUNTDOWN, FOCUS LOCK & STREAK FREEZE ==================== */
export const NeetCountdownAndFreezeBar: React.FC<{
  streak: number;
  onToast?: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}> = ({ streak, onToast }) => {
  const [daysLeft, setDaysLeft] = useState(0);
  const [hoursLeft, setHoursLeft] = useState(0);
  const [freezeAvailable, setFreezeAvailable] = useState(true);
  const [freezeActiveToday, setFreezeActiveToday] = useState(false);

  // Silent Study Lock (25m Focus Timer)
  const [focusSecLeft, setFocusSecLeft] = useState(0);

  // Exam-Pressure Panic Reset Modal
  const [panicOpen, setPanicOpen] = useState(false);
  const [breathSec, setBreathSec] = useState(60);
  const [panicScore, setPanicScore] = useState<number | null>(null);
  const [panicPicked, setPanicPicked] = useState<Record<number, number>>({});

  useEffect(() => {
    const calc = () => {
      const target = new Date('2027-05-02T14:00:00+05:30').getTime();
      const diff = Math.max(0, target - Date.now());
      setDaysLeft(Math.floor(diff / (1000 * 60 * 60 * 24)));
      setHoursLeft(Math.floor((diff / (1000 * 60 * 60)) % 24));
    };
    calc();
    const t = window.setInterval(calc, 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const monthTag = new Date().toISOString().slice(0, 7);
      const todayTag = new Date().toISOString().slice(0, 10);
      const saved = JSON.parse(localStorage.getItem(FREEZE_KEY) || '{}');
      setFreezeAvailable(saved.usedMonth !== monthTag);
      setFreezeActiveToday(saved.activeDate === todayTag);
    } catch {}
  }, []);

  useEffect(() => {
    if (focusSecLeft <= 0) return;
    const t = window.setInterval(() => {
      setFocusSecLeft((s) => {
        if (s <= 1) {
          onToast?.('🎯 25-मिनट Silent Study Lock पूरा हुआ! शानदार फोकस।', 'success');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [focusSecLeft, onToast]);

  useEffect(() => {
    if (!panicOpen) return;
    setBreathSec(60);
    setPanicScore(null);
    setPanicPicked({});
    const t = window.setInterval(() => {
      setBreathSec((b) => (b > 0 ? b - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [panicOpen]);

  const activateFreeze = () => {
    if (!freezeAvailable) return;
    const monthTag = new Date().toISOString().slice(0, 7);
    const todayTag = new Date().toISOString().slice(0, 10);
    try {
      localStorage.setItem(
        FREEZE_KEY,
        JSON.stringify({ usedMonth: monthTag, activeDate: todayTag })
      );
    } catch {}
    setFreezeAvailable(false);
    setFreezeActiveToday(true);
    onToast?.('🛡️ Streak Freeze Shield सक्रिय! आज आपकी स्ट्रीक सुरक्षित रहेगी।', 'success');
  };

  const finishPanicDrill = () => {
    let sc = 0;
    PANIC_RESET_MCQS.forEach((item, i) => {
      if (panicPicked[i] === item.ans) sc += 4;
    });
    setPanicScore(sc);
  };

  const mins = Math.floor(focusSecLeft / 60);
  const secs = focusSecLeft % 60;

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-500/25 bg-gradient-to-r from-indigo-950/90 via-slate-900 to-amber-950/40 px-3.5 py-2.5 text-white shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              NTA NEET UG 2027 Countdown
            </p>
            <p className="text-xs sm:text-sm font-extrabold">
              {daysLeft} Days, {hoursLeft} Hrs Left •{' '}
              <span className="text-orange-400">{streak}d Streak 🔥</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFocusSecLeft((f) => (f > 0 ? 0 : 25 * 60))}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold transition ${
              focusSecLeft > 0
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
            }`}
          >
            <Focus className="w-3.5 h-3.5" />
            {focusSecLeft > 0 ? `Focus ${mins}:${String(secs).padStart(2, '0')}` : '25m Focus Lock'}
          </button>

          <button
            type="button"
            onClick={() => setPanicOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl bg-rose-500/20 border border-rose-400/30 px-2.5 py-1.5 text-[11px] font-extrabold text-rose-200 hover:bg-rose-500/30"
          >
            <Wind className="w-3.5 h-3.5" /> Panic Reset
          </button>

          <button
            type="button"
            disabled={!freezeAvailable}
            onClick={activateFreeze}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold transition ${
              freezeActiveToday
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                : freezeAvailable
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {freezeActiveToday ? 'Freeze Active' : freezeAvailable ? 'Freeze (1/1)' : 'Used (0/1)'}
          </button>
        </div>
      </div>

      {/* Exam-Pressure Panic Reset Drawer */}
      {panicOpen && (
        <div className="rounded-2xl border border-rose-500/35 bg-slate-950 p-3.5 text-white shadow-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-rose-300">
              🧘 Calm Mind Reset • Breath Timer: {breathSec}s
            </span>
            <button type="button" onClick={() => setPanicOpen(false)} className="text-[11px] font-bold text-slate-400 hover:text-white">
              Close
            </button>
          </div>
          <p className="text-[11px] text-slate-300">
            4 सेकंड सांस लें → 4 सेकंड रोकें → 4 सेकंड छोड़ें। नीचे 3 आसान सवाल हल करके कॉन्फिडेंस रिसेट करें:
          </p>
          {PANIC_RESET_MCQS.map((item, idx) => (
            <div key={idx} className="rounded-xl bg-slate-900 p-2.5 text-xs">
              <p className="font-bold">{idx + 1}. {item.q}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {item.opts.map((o, oi) => (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => setPanicPicked((p) => ({ ...p, [idx]: oi }))}
                    className={`rounded-lg px-2 py-1 text-left text-[11px] font-bold ${
                      panicPicked[idx] === oi ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={finishPanicDrill}
              className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-white"
            >
              Check Confidence Boost
            </button>
            {panicScore !== null && (
              <span className="text-xs font-extrabold text-amber-300">
                Score: +{panicScore}/12 • अब आप तैयार हैं! 💪
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ==================== 2. SM-2 SPACED REPETITION & NTA OMR SIMULATOR ==================== */
export const SmartRevisionAndOmrWidget: React.FC<{
  mistakes: MistakeRecord[];
  unifiedQuestionsMap: Record<string, MCQQuestion>;
  onLaunchPool: (qs: MCQQuestion[], title: string) => void;
}> = ({ mistakes, unifiedQuestionsMap, onLaunchPool }) => {
  const [omrOpen, setOmrOpen] = useState(false);
  const [omrAnswers, setOmrAnswers] = useState<Record<string, number>>({});
  const [omrSubmitted, setOmrSubmitted] = useState(false);

  const activeMistakeQs = mistakes
    .filter((m) => !m.mastered && unifiedQuestionsMap[m.questionId])
    .map((m) => unifiedQuestionsMap[m.questionId]);

  const dueQuestions = (() => {
    try {
      const sched: Record<string, Sm2Entry> = JSON.parse(localStorage.getItem(SM2_KEY) || '{}');
      const now = Date.now();
      return activeMistakeQs.filter((q) => {
        const entry = sched[q.id];
        return !entry || entry.nextDueTs <= now;
      });
    } catch {
      return activeMistakeQs;
    }
  })().slice(0, 10);

  const advanceSm2Interval = (qId: string, wasCorrect: boolean) => {
    try {
      const sched: Record<string, Sm2Entry> = JSON.parse(localStorage.getItem(SM2_KEY) || '{}');
      const prev = sched[qId]?.intervalDays || 0;
      const nextDays = !wasCorrect ? 1 : prev === 0 ? 1 : prev === 1 ? 3 : prev === 3 ? 7 : 21;
      sched[qId] = {
        questionId: qId,
        intervalDays: nextDays,
        nextDueTs: Date.now() + nextDays * 24 * 60 * 60 * 1000,
      };
      localStorage.setItem(SM2_KEY, JSON.stringify(sched));
    } catch {}
  };

  const fillBubble = (qId: string, optIdx: number) => {
    if (omrSubmitted || omrAnswers[qId] !== undefined) return;
    setOmrAnswers((prev) => ({ ...prev, [qId]: optIdx }));
  };

  const evaluateOmr = () => {
    setOmrSubmitted(true);
    dueQuestions.forEach((q) => {
      const chosen = omrAnswers[q.id];
      if (chosen !== undefined) {
        advanceSm2Interval(q.id, chosen === q.correctIndex);
      }
    });
  };

  const omrStats = (() => {
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    dueQuestions.forEach((q) => {
      const ans = omrAnswers[q.id];
      if (ans === undefined) unattempted++;
      else if (ans === q.correctIndex) correct++;
      else wrong++;
    });
    const positiveMarks = correct * 4;
    const negativeMarks = wrong * 1;
    return {
      correct,
      wrong,
      unattempted,
      positiveMarks,
      negativeMarks,
      netScore: positiveMarks - negativeMarks,
    };
  })();

  if (dueQuestions.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-white p-3.5 shadow-sm dark:border-emerald-500/25 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
              SM-2 Smart Revision • {dueQuestions.length} Due Today
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              1d → 3d → 7d → 21d वैज्ञानिक अंतराल पर गलत प्रश्नों का दोहराव
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOmrOpen((v) => !v);
              setOmrAnswers({});
              setOmrSubmitted(false);
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300"
          >
            <CircleDot className="w-3.5 h-3.5" /> {omrOpen ? 'Close OMR' : 'NTA OMR Mode'}
          </button>
          <button
            type="button"
            onClick={() => onLaunchPool(dueQuestions, 'SM-2 Today Revision')}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-extrabold text-white hover:bg-emerald-500"
          >
            <Play className="w-3 h-3" /> Start Drill
          </button>
        </div>
      </div>

      {omrOpen && (
        <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="text-[11px] font-bold text-amber-600 dark:text-amber-300">
            ⚠️ असली NTA OMR नियम: एक बार गोला (A/B/C/D) भरने के बाद बदला नहीं जा सकेगा!
          </p>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {dueQuestions.map((q, idx) => {
              const lockedChoice = omrAnswers[q.id];
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/70"
                >
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    <span className="mr-1.5 font-extrabold text-indigo-500">Q{idx + 1}.</span>
                    {q.question_hi}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {q.options_hi.map((opt, oIdx) => (
                      <div key={oIdx} className="text-[11px] text-slate-600 dark:text-slate-300">
                        <strong className="mr-1">({['A', 'B', 'C', 'D'][oIdx]})</strong> {opt}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400">OMR Bubble:</span>
                    {['A', 'B', 'C', 'D'].map((letter, bIdx) => {
                      const isChosen = lockedChoice === bIdx;
                      const isRight = omrSubmitted && q.correctIndex === bIdx;
                      const isWrongChoice = omrSubmitted && isChosen && q.correctIndex !== bIdx;
                      return (
                        <button
                          key={letter}
                          type="button"
                          disabled={lockedChoice !== undefined || omrSubmitted}
                          onClick={() => fillBubble(q.id, bIdx)}
                          className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-extrabold transition ${
                            isRight
                              ? 'border-emerald-500 bg-emerald-600 text-white'
                              : isWrongChoice
                              ? 'border-rose-500 bg-rose-600 text-white'
                              : isChosen
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-slate-400 text-slate-700 hover:border-indigo-500 dark:border-slate-600 dark:text-slate-200'
                          }`}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {!omrSubmitted ? (
            <button
              type="button"
              onClick={evaluateOmr}
              className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-extrabold text-white hover:bg-indigo-500"
            >
              Submit OMR Sheet & View Negative Marking Analytics
            </button>
          ) : (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/90 p-3 text-xs text-white">
              <div className="flex items-center justify-between font-extrabold">
                <span className="flex items-center gap-1 text-amber-300">
                  <Award className="w-4 h-4" /> NTA Net Score: {omrStats.netScore} / {dueQuestions.length * 4}
                </span>
                <span className="text-[11px] text-slate-300">Unattempted: {omrStats.unattempted}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Positive: +{omrStats.positiveMarks} ({omrStats.correct} सही)
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-rose-300">
                  <XCircle className="w-3.5 h-3.5" /> Negative Loss: -{omrStats.negativeMarks} ({omrStats.wrong} गलत)
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
