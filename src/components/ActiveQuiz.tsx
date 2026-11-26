import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Flag,
  Grid,
  Loader2,
  Pause,
  Play,
  Send,
  Sparkles,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AppSettings,
  BatchGenerationProgress,
  MCQQuestion,
  QuizConfig,
  QuizLayoutMode,
} from '../types';
import { MathText } from './MathText';
import { formatTimer } from '../utils/quizLogic';
import { explainQuestionDeeper } from '../services/geminiService';
import { SegmentedControl } from './SegmentedControl';

interface ActiveQuizProps {
  questions: MCQQuestion[];
  config: QuizConfig;
  initialAnswers: Record<string, number>;
  initialIndex: number;
  initialRemainingSeconds: number;
  settings: AppSettings;
  batchProgress: BatchGenerationProgress;
  onCheckpointUpdate: (
    answers: Record<string, number>,
    currentIndex: number,
    remainingSeconds: number
  ) => void;
  onToggleStar: (questionId: string) => void;
  onToggleSave: (questionId: string) => void;
  onReportQuestion?: (question: MCQQuestion) => void;
  onSubmitQuiz: (answers: Record<string, number>, submissionType: 'manual' | 'auto') => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

const PAGE_SIZE = 50;
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export const ActiveQuiz: React.FC<ActiveQuizProps> = ({
  questions,
  config,
  initialAnswers,
  initialIndex,
  initialRemainingSeconds,
  settings,
  batchProgress,
  onCheckpointUpdate,
  onToggleStar,
  onToggleSave,
  onReportQuestion,
  onSubmitQuiz,
  onToast,
}) => {
  const [answers, setAnswers] = useState<Record<string, number>>(initialAnswers);
  const [lockedQuestions, setLockedQuestions] = useState<Record<string, boolean>>(() => {
    if (config.revealMode !== 'practice') return {};
    const initialLocked: Record<string, boolean> = {};
    for (const qId of Object.keys(initialAnswers)) {
      initialLocked[qId] = true;
    }
    return initialLocked;
  });
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, questions.length - 1))
  );
  const [layoutMode, setLayoutMode] = useState<QuizLayoutMode>(config.layoutMode);
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);
  const [paused, setPaused] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [navFilter, setNavFilter] = useState<'all' | 'answered' | 'unanswered' | 'saved' | 'starred'>('all');
  const [scrollPage, setScrollPage] = useState(Math.floor(initialIndex / PAGE_SIZE));
  const [navPage, setNavPage] = useState(0);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  // Per-question deeper AI explanation state
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [loadingExplainId, setLoadingExplainId] = useState<string | null>(null);
  const [wrongShakeId, setWrongShakeId] = useState<string | null>(null);

  // Refs to prevent timer interval teardown on answer clicks & avoid stale closures
  const answersRef = useRef(answers);
  const currentIndexRef = useRef(currentIndex);
  const remainingSecondsRef = useRef(remainingSeconds);
  const submitRef = useRef(onSubmitQuiz);
  const checkpointRef = useRef(onCheckpointUpdate);
  const autoSubmittedRef = useRef(false);

  answersRef.current = answers;
  currentIndexRef.current = currentIndex;
  remainingSecondsRef.current = remainingSeconds;
  submitRef.current = onSubmitQuiz;
  checkpointRef.current = onCheckpointUpdate;

  const isRunning = questions.length > 0 && !hasSubmitted;
  const isPaused = paused;
  const isUntimed = config.untimed;

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const totalPages = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
  const progressPercent =
    questions.length > 0 ? Math.min(100, Math.round((answeredCount / questions.length) * 100)) : 0;

  // Countdown timer: depends ONLY on [isRunning, isPaused, isUntimed] — never resets on answer clicks
  useEffect(() => {
    if (!isRunning || isPaused || isUntimed) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, isPaused, isUntimed]);

  // Clean auto-submit side effect when timer reaches 00:00
  useEffect(() => {
    if (!isUntimed && isRunning && remainingSeconds === 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      setHasSubmitted(true);
      submitRef.current(answersRef.current, 'auto');
    }
  }, [remainingSeconds, isUntimed, isRunning]);

  // Auto-checkpoint immediately on answer, index, or pause state changes
  useEffect(() => {
    if (hasSubmitted || questions.length === 0) return;
    checkpointRef.current(answers, currentIndex, remainingSecondsRef.current);
  }, [answers, currentIndex, paused, hasSubmitted, questions.length]);

  // Periodic checkpoint every 5 seconds during active timed countdown to prevent timer drift on reload
  useEffect(() => {
    if (!isRunning || isPaused || isUntimed) return;
    const checkpointInterval = window.setInterval(() => {
      checkpointRef.current(
        answersRef.current,
        currentIndexRef.current,
        remainingSecondsRef.current
      );
    }, 5000);
    return () => window.clearInterval(checkpointInterval);
  }, [isRunning, isPaused, isUntimed]);

  const handleSelectOption = (question: MCQQuestion, optIndex: number) => {
    if (paused || hasSubmitted) return;
    // In Practice (Instant) Mode, lock immediately after first answer so user cannot change wrong to green
    if (config.revealMode === 'practice') {
      if (lockedQuestions[question.id] || answers[question.id] !== undefined) {
        return;
      }
      setLockedQuestions((prev) => ({ ...prev, [question.id]: true }));
    }

    setAnswers((prev) => ({ ...prev, [question.id]: optIndex }));

    if (config.revealMode === 'practice' && optIndex !== question.correct_index) {
      setWrongShakeId(`${question.id}-${optIndex}`);
      window.setTimeout(() => setWrongShakeId(null), 320);
    }
  };

  const handleClearChoice = (questionId: string) => {
    // Only allow clearing choice in Exam Mode (never in Practice Mode once locked)
    if (config.revealMode === 'practice' || lockedQuestions[questionId]) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleJumpToQuestion = (index: number) => {
    setCurrentIndex(index);
    const targetPage = Math.floor(index / PAGE_SIZE);
    setScrollPage(targetPage);
    setNavOpen(false);
    if (layoutMode === 'scroll') {
      window.setTimeout(() => {
        const el = document.getElementById(`quiz-card-${index}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const handleAskDeeperAI = async (question: MCQQuestion) => {
    if (!settings.apiKey.trim()) {
      onToast('Add your Gemini API key in Settings (⚙️) to use Ask AI Deeper Explanation.', 'error');
      return;
    }
    setLoadingExplainId(question.id);
    try {
      const text = await explainQuestionDeeper({
        settings,
        question,
        chosenIndex: answers[question.id],
      });
      setAiExplanations((prev) => ({ ...prev, [question.id]: text }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch AI explanation.';
      onToast(msg, 'error');
    } finally {
      setLoadingExplainId(null);
    }
  };

  const filteredNavIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const isAns = answers[q.id] !== undefined;
      if (navFilter === 'answered' && !isAns) continue;
      if (navFilter === 'unanswered' && isAns) continue;
      if (navFilter === 'saved' && !q.isSaved) continue;
      if (navFilter === 'starred' && !q.isStarred) continue;
      out.push(i);
    }
    return out;
  }, [questions, answers, navFilter]);

  const scrollSliceStart = scrollPage * PAGE_SIZE;
  const scrollSlice = useMemo(
    () => questions.slice(scrollSliceStart, scrollSliceStart + PAGE_SIZE),
    [questions, scrollSliceStart]
  );

  const activeSingleQuestion = questions[currentIndex] ?? questions[0];
  const singleQuestionAnswered = activeSingleQuestion
    ? answers[activeSingleQuestion.id] !== undefined
    : false;
  const singleQuestionLocked = activeSingleQuestion
    ? config.revealMode === 'practice' &&
      (Boolean(lockedQuestions[activeSingleQuestion.id]) || singleQuestionAnswered)
    : false;

  const renderQuestionCard = (q: MCQQuestion, globalIdx: number) => {
    const selected = answers[q.id];
    const hasAnswered = selected !== undefined;
    const isPracticeLocked =
      config.revealMode === 'practice' && (Boolean(lockedQuestions[q.id]) || hasAnswered);
    const isPracticeRevealed = isPracticeLocked;
    const deeperText = aiExplanations[q.id];

    return (
      <article
        key={q.id}
        id={`quiz-card-${globalIdx}`}
        className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] shadow-xs p-4 sm:p-5 space-y-3 scroll-mt-26"
      >
        {/* Micro Metadata Strip + Compact Star / Save Icon Buttons */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#64748B] dark:text-[#94A3B8] min-w-0">
            <span className="font-mono-num font-bold text-[#6366F1] dark:text-indigo-400">
              Q{globalIdx + 1}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{q.subject}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate max-w-[180px] sm:max-w-[260px]">{q.chapter}</span>
            <span aria-hidden="true">·</span>
            <span>{q.difficulty}</span>
            {q.tags.slice(0, 1).map((tag) => (
              <React.Fragment key={tag}>
                <span aria-hidden="true">·</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">{tag}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onToggleStar(q.id)}
              aria-label={q.isStarred ? `Unstar question ${globalIdx + 1}` : `Star question ${globalIdx + 1}`}
              title={q.isStarred ? 'Unstar' : 'Star'}
              className={`w-7.5 h-7.5 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                q.isStarred
                  ? 'bg-amber-500/12 border-amber-500/35 text-[#F59E0B]'
                  : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#64748B] hover:text-[#F59E0B]'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${q.isStarred ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => onToggleSave(q.id)}
              aria-label={q.isSaved ? `Unsave question ${globalIdx + 1}` : `Save question ${globalIdx + 1}`}
              title={q.isSaved ? 'Remove from Save' : 'Save'}
              className={`w-7.5 h-7.5 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                q.isSaved
                  ? 'bg-amber-500/12 border-amber-500/35 text-[#F59E0B]'
                  : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#64748B] hover:text-[#F59E0B]'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${q.isSaved ? 'fill-current' : ''}`} />
            </button>

            {onReportQuestion && (
              <button
                type="button"
                onClick={() => onReportQuestion(q)}
                aria-label={`Report question ${globalIdx + 1}`}
                title="Report Question"
                className="w-7.5 h-7.5 rounded-lg border flex items-center justify-center transition-colors cursor-pointer bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#64748B] hover:text-[#F43F5E] hover:border-rose-500/35"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Crisp Hindi Question Stem (WCAG AAA #F1F5F9 on #141923, leading-[1.65]) */}
        <div className="font-hindi text-[15px] sm:text-[16px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] leading-[1.65]">
          <MathText text={q.question_hi} />
        </div>

        {/* 4 Compact Option Rows (Single-Viewport Fit) */}
        <div className="space-y-2 mt-3">
          {q.options_hi.map((opt, optIdx) => {
            const isSelected = selected === optIdx;
            const isCorrect = q.correct_index === optIdx;
            const isShaking = wrongShakeId === `${q.id}-${optIdx}`;

            let stateClass =
              'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9] hover:border-indigo-500/35 dark:hover:bg-[#242D3F]';
            let badgeClass =
              'bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.08] text-[#475569] dark:text-[#94A3B8]';

            if (isPracticeRevealed) {
              if (isCorrect) {
                stateClass =
                  'bg-emerald-500/12 border-emerald-500/50 text-emerald-950 dark:text-emerald-100';
                badgeClass = 'bg-[#10B981] border-[#10B981] text-white';
              } else if (isSelected && !isCorrect) {
                stateClass =
                  'bg-rose-500/12 border-rose-500/50 text-rose-950 dark:text-rose-100';
                badgeClass = 'bg-[#F43F5E] border-[#F43F5E] text-white';
              }
            } else if (isSelected) {
              stateClass =
                'bg-indigo-500/12 border-[#6366F1] text-[#0F172A] dark:text-[#F1F5F9]';
              badgeClass = 'bg-[#6366F1] border-[#6366F1] text-white';
            }

            return (
              <motion.button
                key={optIdx}
                type="button"
                disabled={isPracticeLocked}
                whileTap={isPracticeLocked ? undefined : { scale: 0.985 }}
                transition={{ duration: 0.14 }}
                onClick={() => handleSelectOption(q, optIdx)}
                className={`w-full text-left py-2.5 px-3.5 rounded-xl border flex items-start gap-2.5 transition-colors ${stateClass} ${
                  isPracticeLocked ? 'cursor-default' : 'cursor-pointer'
                } ${isShaking ? 'animate-shake-gentle' : ''}`}
              >
                <span
                  className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${badgeClass}`}
                >
                  {OPTION_LABELS[optIdx]}
                </span>
                <span className="flex-1 font-hindi text-[14px] sm:text-[15px] leading-[1.6]">
                  <MathText text={opt} />
                </span>
                {isPracticeRevealed && isCorrect && (
                  <motion.span
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                    className="text-[#10B981] shrink-0 mt-0.5"
                    aria-label="Correct option"
                  >
                    <CheckCircle2 className="w-4.5 h-4.5" />
                  </motion.span>
                )}
                {isPracticeRevealed && isSelected && !isCorrect && (
                  <span className="text-[#F43F5E] shrink-0 mt-0.5" aria-label="Wrong option">
                    <XCircle className="w-4.5 h-4.5" />
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Instant Mode Explanation Box */}
        <AnimatePresence>
          {isPracticeRevealed && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-xl p-3 bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-xs font-semibold inline-flex items-center gap-1.5 ${
                    selected === q.correct_index
                      ? 'text-emerald-700 dark:text-[#10B981]'
                      : 'text-rose-700 dark:text-[#F43F5E]'
                  }`}
                >
                  {selected === q.correct_index ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Correct Answer</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Wrong · Correct Option: {OPTION_LABELS[q.correct_index]}</span>
                    </>
                  )}
                </span>

                <button
                  type="button"
                  disabled={loadingExplainId === q.id}
                  onClick={() => void handleAskDeeperAI(q)}
                  className="h-7 px-2.5 rounded-lg bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  {loadingExplainId === q.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>AI Explain</span>
                </button>
              </div>

              <div className="font-hindi text-[13px] sm:text-sm text-[#0F172A] dark:text-[#F1F5F9]/90 leading-[1.65]">
                <MathText text={q.explanation_hi} />
              </div>

              {deeperText && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] space-y-1">
                  <p className="text-[11px] font-semibold text-[#6366F1] dark:text-indigo-400">
                    AI Deeper Explanation &amp; Memory Trick
                  </p>
                  <div className="font-hindi text-[13px] sm:text-sm text-[#0F172A] dark:text-[#F1F5F9] leading-[1.65]">
                    <MathText text={deeperText} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll-View Exam Mode Clear Choice Row */}
        {layoutMode === 'scroll' && hasAnswered && config.revealMode === 'exam' && !isPracticeLocked && (
          <div className="flex items-center justify-end pt-0.5">
            <button
              type="button"
              onClick={() => handleClearChoice(q.id)}
              className="h-7 px-2.5 rounded-lg text-[11px] font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] inline-flex items-center gap-1 cursor-pointer"
            >
              <Eraser className="w-3 h-3" />
              Clear Choice
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-3 pb-6">
      {/* 44px SLIM STICKY TOP HUD + Animated Bottom Progress Edge */}
      <div className="sticky top-[54px] z-30 rounded-xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-xl border border-slate-200 dark:border-white/[0.06] shadow-xs overflow-hidden">
        <div className="min-h-[44px] px-2.5 sm:px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          {/* Left: Question Counter + Live Tabular Timer */}
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="font-mono-num text-[#6366F1] dark:text-indigo-400">
              Q {layoutMode === 'single' ? currentIndex + 1 : `${scrollSliceStart + 1}–${Math.min(questions.length, scrollSliceStart + PAGE_SIZE)}`}/{questions.length}
            </span>
            <span className="text-slate-300 dark:text-white/10 hidden xs:inline">|</span>
            <span className="font-mono-num text-[#475569] dark:text-[#94A3B8] hidden xs:inline">
              {answeredCount}/{questions.length}
            </span>
            {!config.untimed && (
              <span
                className={`font-mono-num inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                  remainingSeconds <= 60
                    ? 'bg-rose-500/15 text-[#F43F5E]'
                    : 'bg-[#EEF2F7] dark:bg-[#0E121B] text-[#0F172A] dark:text-[#F1F5F9]'
                }`}
              >
                <Clock className="w-3 h-3" />
                {formatTimer(remainingSeconds)}
              </span>
            )}
          </div>

          {/* Right: Pause, Layout Segmented Toggle, Grid, Subtle Rose Submit */}
          <div className="flex items-center gap-1.5">
            {!config.untimed && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Resume timer' : 'Pause timer'}
                title={paused ? 'Resume' : 'Pause'}
                className="h-7 px-2 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{paused ? 'Resume' : 'Pause'}</span>
              </button>
            )}

            <SegmentedControl<QuizLayoutMode>
              ariaLabel="Quiz view layout"
              layoutId="active-quiz-layout-pill"
              size="xs"
              value={layoutMode}
              onChange={setLayoutMode}
              options={[
                { value: 'scroll', label: 'Scroll' },
                { value: 'single', label: '1-Q' },
              ]}
            />

            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open Question Navigator"
              title="Question Grid"
              className="h-7 px-2 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>

            <button
              type="button"
              onClick={() => setSubmitModalOpen(true)}
              className="h-7 px-2.5 rounded-lg bg-rose-500/15 hover:bg-[#F43F5E] text-rose-700 dark:text-rose-300 hover:text-white border border-rose-500/30 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Submit</span>
            </button>
          </div>
        </div>

        {/* Thin 1px/4px Animated Progress Edge */}
        <div className="h-1 w-full bg-[#EEF2F7] dark:bg-[#0E121B]">
          <motion.div
            className="h-full bg-[#6366F1]"
            initial={false}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>

      {/* Background Streaming Indicator */}
      {batchProgress.status === 'running' && (
        <div className="px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-xs font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="font-mono-num">
            Background AI generation active: {batchProgress.generatedCount}/{batchProgress.targetCount} MCQs saved...
          </span>
        </div>
      )}

      {/* Pause State */}
      {paused && (
        <div className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-8 text-center space-y-3">
          <p className="text-base font-bold text-[#0F172A] dark:text-[#F1F5F9]">Quiz Paused</p>
          <p className="text-xs text-[#64748B]">
            Timer is paused and your progress is auto-saved in IndexedDB.
          </p>
          <button
            type="button"
            onClick={() => setPaused(false)}
            className="h-9 px-4 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Resume Quiz
          </button>
        </div>
      )}

      {/* Main Question Body */}
      {!paused && questions.length > 0 && (
        <>
          {layoutMode === 'single' ? (
            <>
              {renderQuestionCard(activeSingleQuestion, currentIndex)}

              {/* Sticky Bottom Action Bar (Single-Question View — Fitts's Law Thumb Zone) */}
              <div className="sticky bottom-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2.5 backdrop-blur-xl bg-[#F4F6FA]/92 dark:bg-[#0B0E14]/92 border-t border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  className="h-9 px-3.5 rounded-xl bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-35 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>

                <button
                  type="button"
                  disabled={
                    !activeSingleQuestion ||
                    !singleQuestionAnswered ||
                    config.revealMode === 'practice' ||
                    singleQuestionLocked
                  }
                  onClick={() => activeSingleQuestion && handleClearChoice(activeSingleQuestion.id)}
                  className="h-9 px-3 rounded-xl text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] hover:bg-[#EEF2F7] dark:hover:bg-[#1C2331] text-xs font-medium inline-flex items-center gap-1 disabled:opacity-30 cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Clear
                </button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  disabled={currentIndex >= questions.length - 1}
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                  className="h-9 px-4 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-35 cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {/* Paginated Chunks for 60fps Scrolling (50 per page) */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {Array.from({ length: totalPages }).map((_, pIdx) => {
                    const start = pIdx * PAGE_SIZE + 1;
                    const end = Math.min(questions.length, (pIdx + 1) * PAGE_SIZE);
                    return (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => {
                          setScrollPage(pIdx);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`h-7 px-2.5 rounded-lg text-xs font-mono-num font-semibold whitespace-nowrap border cursor-pointer ${
                          scrollPage === pIdx
                            ? 'bg-[#6366F1] text-white border-[#6366F1]'
                            : 'bg-white dark:bg-[#141923] text-[#475569] dark:text-[#94A3B8] border-slate-200 dark:border-white/[0.06]'
                        }`}
                      >
                        {start}–{end}
                      </button>
                    );
                  })}
                </div>
              )}

              {scrollSlice.map((q, idx) => renderQuestionCard(q, scrollSliceStart + idx))}

              {scrollPage < totalPages - 1 && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setScrollPage((p) => p + 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="h-9 px-4 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold cursor-pointer"
                  >
                    Load Next 50 Questions ({(scrollPage + 1) * PAGE_SIZE + 1}–{Math.min(questions.length, (scrollPage + 2) * PAGE_SIZE)}) →
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Compact Paginated Question Navigator Drawer */}
      <AnimatePresence>
        {navOpen && (
          <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Question Navigator">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="relative z-10 w-full max-w-md bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border-l border-slate-200 dark:border-white/[0.08] h-full flex flex-col"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                    Question Navigator
                  </h2>
                  <p className="text-[11px] font-mono-num text-[#64748B]">
                    {answeredCount} of {questions.length} answered
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Close Question Navigator"
                  className="w-8 h-8 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 space-y-2.5 border-b border-slate-200 dark:border-white/[0.06]">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['all', 'All'],
                      ['answered', 'Answered'],
                      ['unanswered', 'Unanswered'],
                      ['saved', 'Saved'],
                      ['starred', 'Starred'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setNavFilter(id);
                        setNavPage(0);
                      }}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                        navFilter === id
                          ? 'bg-[#6366F1] text-white'
                          : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {filteredNavIndices.length > PAGE_SIZE && (
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                    {Array.from({ length: Math.ceil(filteredNavIndices.length / PAGE_SIZE) }).map(
                      (_, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => setNavPage(pIdx)}
                          className={`h-6.5 px-2 rounded-md text-[11px] font-mono-num font-semibold cursor-pointer ${
                            navPage === pIdx
                              ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/35'
                              : 'bg-[#EEF2F7] dark:bg-[#0E121B] text-[#64748B]'
                          }`}
                        >
                          {pIdx * PAGE_SIZE + 1}–{Math.min(filteredNavIndices.length, (pIdx + 1) * PAGE_SIZE)}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                  {filteredNavIndices
                    .slice(navPage * PAGE_SIZE, (navPage + 1) * PAGE_SIZE)
                    .map((qIdx) => {
                      const q = questions[qIdx];
                      const isAns = answers[q.id] !== undefined;
                      const isCurr = qIdx === currentIndex;
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => handleJumpToQuestion(qIdx)}
                          className={`h-9 rounded-lg text-xs font-mono-num font-semibold border relative transition-colors cursor-pointer ${
                            isCurr
                              ? 'border-[#6366F1] bg-[#6366F1] text-white'
                              : isAns
                              ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-700 dark:text-[#10B981]'
                              : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#475569] dark:text-[#94A3B8]'
                          }`}
                        >
                          {qIdx + 1}
                          {q.isStarred && (
                            <span className="absolute top-0.5 right-0.5 text-[8px] text-[#F59E0B]">★</span>
                          )}
                        </button>
                      );
                    })}
                </div>
                {filteredNavIndices.length === 0 && (
                  <p className="py-8 text-center text-xs text-[#64748B]">
                    No questions match this filter.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submit Confirmation Modal */}
      <AnimatePresence>
        {submitModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Submit Quiz Confirmation"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSubmitModalOpen(false)}
              className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              className="relative z-10 w-full max-w-sm rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-slate-200 dark:border-white/[0.08] p-5 shadow-2xl space-y-3.5"
            >
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                Submit Quiz?
              </h2>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                You have answered <strong className="font-mono-num text-[#0F172A] dark:text-[#F1F5F9]">{answeredCount}</strong> of{' '}
                <strong className="font-mono-num text-[#0F172A] dark:text-[#F1F5F9]">{questions.length}</strong> questions. Submit now to view your performance &amp; answer key?
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSubmitModalOpen(false)}
                  className="h-8.5 px-3.5 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitModalOpen(false);
                    setHasSubmitted(true);
                    onSubmitQuiz(answers, 'manual');
                  }}
                  className="h-8.5 px-4 rounded-lg bg-[#F43F5E] hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm Submit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
