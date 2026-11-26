import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  Bookmark,
  CheckCircle2,
  Flag,
  Home,
  Loader2,
  RotateCcw,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { AppSettings, MCQQuestion, QuizResultSummary } from '../types';
import { formatISTTimestamp } from '../utils/quizLogic';
import { MathText } from './MathText';
import { explainQuestionDeeper } from '../services/geminiService';

interface QuizResultProps {
  result: QuizResultSummary;
  questions: MCQQuestion[];
  settings: AppSettings;
  onReattempt: () => void;
  onFinishHome: () => void;
  onToggleStar: (questionId: string) => void;
  onToggleSave: (questionId: string) => void;
  onReportQuestion?: (question: MCQQuestion) => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export const QuizResult: React.FC<QuizResultProps> = ({
  result,
  questions,
  settings,
  onReattempt,
  onFinishHome,
  onToggleStar,
  onToggleSave,
  onReportQuestion,
  onToast,
}) => {
  const [filter, setFilter] = useState<'all' | 'wrong' | 'correct' | 'skipped' | 'saved' | 'starred'>('all');
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [loadingExplainId, setLoadingExplainId] = useState<string | null>(null);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const chosen = result.answers[q.id];
      const isSkipped = chosen === undefined;
      const isCorrect = !isSkipped && chosen === q.correct_index;
      const isWrong = !isSkipped && chosen !== q.correct_index;

      if (filter === 'wrong') return isWrong;
      if (filter === 'correct') return isCorrect;
      if (filter === 'skipped') return isSkipped;
      if (filter === 'saved') return q.isSaved;
      if (filter === 'starred') return q.isStarred;
      return true;
    });
  }, [questions, result.answers, filter]);

  const handleExplainWithAI = async (q: MCQQuestion) => {
    if (!settings.apiKey.trim()) {
      onToast('Configure your Gemini API key in Settings (⚙️) to use AI Explain.', 'error');
      return;
    }
    setLoadingExplainId(q.id);
    try {
      const text = await explainQuestionDeeper({
        settings,
        question: q,
        chosenIndex: result.answers[q.id],
      });
      setAiExplanations((prev) => ({ ...prev, [q.id]: text }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI explanation failed.';
      onToast(msg, 'error');
    } finally {
      setLoadingExplainId(null);
    }
  };

  // Compact circular accuracy ring geometry
  const ringRadius = 36;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (result.accuracyPercent / 100) * ringCircumference;

  return (
    <div className="space-y-4 pb-10">
      {/* Slim Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            Quiz Performance &amp; Answer Key
          </h1>
          <p className="text-[11px] text-[#64748B] font-mono-num">
            {result.submissionType === 'auto' ? 'Auto-submitted' : 'Submitted'} ·{' '}
            {formatISTTimestamp(result.submittedAt)} · Wrong &amp; skipped synced to Mistake Bank
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onReattempt}
            className="h-8.5 px-3 rounded-lg bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#EEF2F7] dark:hover:bg-[#1C2331] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reattempt
          </button>
          <button
            type="button"
            onClick={onFinishHome}
            className="h-8.5 px-3.5 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </button>
        </div>
      </div>

      {/* Unified Summary Strip: Animated Accuracy Ring + 4-Column Metric Strip + Level */}
      <section className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] shadow-xs divide-y divide-slate-200/80 dark:divide-white/[0.06] overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row items-center gap-4">
          {/* Compact Accuracy Ring */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative w-22 h-22">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
                <circle
                  cx="44"
                  cy="44"
                  r={ringRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="7"
                  className="text-slate-200 dark:text-white/[0.08]"
                />
                <motion.circle
                  cx="44"
                  cy="44"
                  r={ringRadius}
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  stroke={result.accuracyPercent >= 70 ? '#10B981' : result.accuracyPercent >= 50 ? '#F59E0B' : '#F43F5E'}
                  strokeDasharray={ringCircumference}
                  initial={{ strokeDashoffset: ringCircumference }}
                  animate={{ strokeDashoffset: ringOffset }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold font-mono-num text-[#0F172A] dark:text-[#F1F5F9]">
                  {result.accuracyPercent}%
                </span>
                <span className="text-[10px] text-[#64748B]">Accuracy</span>
              </div>
            </div>
          </div>

          {/* 4-Column Sleek Metric Strip */}
          <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-4 gap-2">
            {result.config.scoringMode === 'neet' ? (
              <div className="rounded-xl p-2.5 bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200/70 dark:border-white/[0.05]">
                <p className="text-[11px] text-[#64748B]">NEET Score</p>
                <p className="mt-0.5 text-base font-bold font-mono-num text-[#6366F1] dark:text-indigo-400">
                  {result.neetScore}
                  <span className="text-[11px] font-normal text-[#64748B]">/{result.maxNeetScore}</span>
                </p>
              </div>
            ) : (
              <div className="rounded-xl p-2.5 bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200/70 dark:border-white/[0.05]">
                <p className="text-[11px] text-[#64748B]">Attempted</p>
                <p className="mt-0.5 text-base font-bold font-mono-num text-[#0F172A] dark:text-[#F1F5F9]">
                  {result.answeredCount}/{result.totalQuestions}
                </p>
              </div>
            )}

            <div className="rounded-xl p-2.5 bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200/70 dark:border-white/[0.05]">
              <p className="text-[11px] text-[#64748B]">Correct</p>
              <p className="mt-0.5 text-base font-bold font-mono-num text-[#10B981]">
                {result.correctCount}
              </p>
            </div>

            <div className="rounded-xl p-2.5 bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200/70 dark:border-white/[0.05]">
              <p className="text-[11px] text-[#64748B]">Wrong</p>
              <p className="mt-0.5 text-base font-bold font-mono-num text-[#F43F5E]">
                {result.wrongCount}
              </p>
            </div>

            <div className="rounded-xl p-2.5 bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200/70 dark:border-white/[0.05]">
              <p className="text-[11px] text-[#64748B]">Skipped</p>
              <p className="mt-0.5 text-base font-bold font-mono-num text-[#F59E0B]">
                {result.skippedCount}
              </p>
            </div>
          </div>
        </div>

        {/* Diagnostic Level Strip */}
        <div className="px-4 py-3 flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg bg-indigo-500/12 text-[#6366F1] dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
            <Award className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
              {result.levelTitle}
            </p>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed mt-0.5">
              {result.levelGuidance}
            </p>
          </div>
        </div>

        {/* Weak vs Strong Split + Slim Chapterwise Strength Bars */}
        {result.chapterBreakdown.length > 0 && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <p className="font-semibold text-[#F43F5E] flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Needs Work (&lt;70%) · {result.weakChapters.length}
                </p>
                {result.weakChapters.length === 0 ? (
                  <p className="text-[#64748B]">No chapters fell below 70%.</p>
                ) : (
                  <p className="text-[#475569] dark:text-[#94A3B8] truncate">
                    {result.weakChapters.map((c) => c.chapter).join(', ')}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-[#10B981] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Strong (≥70%) · {result.strongChapters.length}
                </p>
                {result.strongChapters.length === 0 ? (
                  <p className="text-[#64748B]">Revise the answer key below to improve.</p>
                ) : (
                  <p className="text-[#475569] dark:text-[#94A3B8] truncate">
                    {result.strongChapters.map((c) => c.chapter).join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-white/[0.06]">
              <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                Chapterwise Strength Map
              </p>
              {result.chapterBreakdown.map((ch) => {
                const barColor =
                  ch.accuracy >= 70
                    ? 'bg-[#10B981]'
                    : ch.accuracy >= 45
                    ? 'bg-[#F59E0B]'
                    : 'bg-[#F43F5E]';
                return (
                  <div key={`${ch.subject}-${ch.chapter}`} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#0F172A] dark:text-[#F1F5F9] truncate">
                        {ch.chapter}{' '}
                        <span className="text-[#64748B] font-normal">· {ch.subject}</span>
                      </span>
                      <span className="font-mono-num font-semibold text-[#475569] dark:text-[#94A3B8] shrink-0">
                        {ch.accuracy}% ({ch.correct}/{ch.total})
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#EEF2F7] dark:bg-[#0E121B] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(3, ch.accuracy)}%` }}
                        transition={{ duration: 0.5 }}
                        className={`h-full rounded-full ${barColor}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Answer Key Filter Bar + Compact Cards */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9]">
            Answer Key ({filteredQuestions.length})
          </h2>

          <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200/70 dark:border-white/[0.05]">
            {(
              [
                ['all', `All (${questions.length})`],
                ['wrong', `Wrong (${result.wrongCount})`],
                ['correct', `Correct (${result.correctCount})`],
                ['skipped', `Skipped (${result.skippedCount})`],
                ['saved', 'Saved'],
                ['starred', 'Starred'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`h-6.5 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  filter === key
                    ? 'bg-[#6366F1] text-white'
                    : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredQuestions.map((q) => {
            const globalIndex = questions.findIndex((item) => item.id === q.id);
            const chosen = result.answers[q.id];
            const isSkipped = chosen === undefined;
            const isCorrect = !isSkipped && chosen === q.correct_index;

            return (
              <article
                key={q.id}
                className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] shadow-xs p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-mono-num font-bold text-[#6366F1] dark:text-indigo-400">
                      Q{globalIndex + 1}
                    </span>
                    <span className="text-[#64748B]">·</span>
                    <span
                      className={`font-semibold inline-flex items-center gap-1 ${
                        isCorrect
                          ? 'text-[#10B981]'
                          : isSkipped
                          ? 'text-[#F59E0B]'
                          : 'text-[#F43F5E]'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : !isSkipped ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : null}
                      {isCorrect ? 'Correct (+4)' : isSkipped ? 'Skipped (0)' : 'Wrong (-1)'}
                    </span>
                    <span className="text-[#64748B]">·</span>
                    <span className="text-[#475569] dark:text-[#94A3B8]">
                      {q.subject} · {q.chapter}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleStar(q.id)}
                      aria-label={`Star Q${globalIndex + 1}`}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer ${
                        q.isStarred
                          ? 'bg-amber-500/12 border-amber-500/35 text-[#F59E0B]'
                          : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#64748B]'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${q.isStarred ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleSave(q.id)}
                      aria-label={`Save Q${globalIndex + 1}`}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer ${
                        q.isSaved
                          ? 'bg-amber-500/12 border-amber-500/35 text-[#F59E0B]'
                          : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#64748B]'
                      }`}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${q.isSaved ? 'fill-current' : ''}`} />
                    </button>
                    {onReportQuestion && (
                      <button
                        type="button"
                        onClick={() => onReportQuestion(q)}
                        aria-label={`Report Q${globalIndex + 1}`}
                        title="Report Question"
                        className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#64748B] hover:text-[#F43F5E] hover:border-rose-500/35"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="font-hindi text-[15px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] leading-[1.65]">
                  <MathText text={q.question_hi} />
                </div>

                <div className="space-y-1.5">
                  {q.options_hi.map((opt, idx) => {
                    const isRight = idx === q.correct_index;
                    const isUserWrong = chosen === idx && !isRight;
                    return (
                      <div
                        key={idx}
                        className={`py-2 px-3 rounded-xl border flex items-start gap-2.5 text-xs sm:text-sm ${
                          isRight
                            ? 'bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100'
                            : isUserWrong
                            ? 'bg-rose-500/12 border-rose-500/45 text-rose-950 dark:text-rose-100'
                            : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200/70 dark:border-white/[0.05] text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        <span
                          className={`w-5.5 h-5.5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                            isRight
                              ? 'bg-[#10B981] text-white'
                              : isUserWrong
                              ? 'bg-[#F43F5E] text-white'
                              : 'bg-white dark:bg-[#141923] text-[#475569] dark:text-[#94A3B8]'
                          }`}
                        >
                          {OPTION_LABELS[idx]}
                        </span>
                        <span className="flex-1 font-hindi">
                          <MathText text={opt} />
                        </span>
                        {isRight && (
                          <span className="text-[#10B981] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Correct
                          </span>
                        )}
                        {isUserWrong && (
                          <span className="text-[#F43F5E] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0">
                            <XCircle className="w-3.5 h-3.5" />
                            Yours
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation + Compact AI Explain */}
                <div className="rounded-xl p-3 bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200/80 dark:border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                      NCERT Hindi Explanation
                    </span>
                    <button
                      type="button"
                      disabled={loadingExplainId === q.id}
                      onClick={() => void handleExplainWithAI(q)}
                      className="h-7 px-2.5 rounded-lg bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                    >
                      {loadingExplainId === q.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      AI Explain
                    </button>
                  </div>

                  <div className="font-hindi text-[13px] sm:text-sm text-[#0F172A] dark:text-[#F1F5F9]/90 leading-[1.65]">
                    <MathText text={q.explanation_hi} />
                  </div>

                  {aiExplanations[q.id] && (
                    <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] space-y-1">
                      <p className="text-[11px] font-semibold text-[#6366F1] dark:text-indigo-400">
                        AI Tutor (3 Simple Hindi Points + Memory Trick)
                      </p>
                      <div className="font-hindi text-[13px] sm:text-sm text-[#0F172A] dark:text-[#F1F5F9] leading-[1.65]">
                        <MathText text={aiExplanations[q.id]} />
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}

          {filteredQuestions.length === 0 && (
            <div className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-8 text-center text-xs text-[#64748B]">
              No questions found under the selected filter.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
