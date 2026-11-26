import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { MCQQuestion, MistakeRecord, UnifiedQuestionItem } from '../types';
import { getUnifiedQuestionMap } from '../db/database';
import { useSubjects } from '../utils/subjects';
import { MathText } from './MathText';
import { SegmentedControl } from './SegmentedControl';

interface MistakeBankProps {
  mistakes: MistakeRecord[];
  unifiedQuestionsMap: Record<string, UnifiedQuestionItem>;
  onMarkMastered: (questionId: string, mastered: boolean) => Promise<void>;
  onLaunchMistakeQuiz: (questions: MCQQuestion[]) => void;
  onBackHome: () => void;
}

export const MistakeBank: React.FC<MistakeBankProps> = ({
  mistakes,
  unifiedQuestionsMap,
  onMarkMastered,
  onLaunchMistakeQuiz,
  onBackHome,
}) => {
  const { subjectsWithAll } = useSubjects();
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [showMastered, setShowMastered] = useState(false);
  const [liveMap, setLiveMap] = useState<Record<string, UnifiedQuestionItem>>(unifiedQuestionsMap);

  useEffect(() => {
    setLiveMap(unifiedQuestionsMap);
  }, [unifiedQuestionsMap]);

  useEffect(() => {
    let cancelled = false;
    void getUnifiedQuestionMap().then((freshMap) => {
      if (!cancelled) setLiveMap(freshMap);
    });
    return () => {
      cancelled = true;
    };
  }, [mistakes]);

  const enriched = useMemo(() => {
    return mistakes
      .filter((m) => (showMastered ? m.mastered : !m.mastered))
      .filter((m) => subjectFilter === 'All' || m.subject === subjectFilter)
      .map((m) => ({ record: m, question: liveMap[m.questionId] }))
      .filter((pair): pair is { record: MistakeRecord; question: UnifiedQuestionItem } =>
        Boolean(pair.question)
      )
      .sort((a, b) => b.record.mistakeCount - a.record.mistakeCount || b.record.updatedAt - a.record.updatedAt);
  }, [mistakes, liveMap, subjectFilter, showMastered]);

  const activeMistakeQuestions = useMemo(
    () =>
      mistakes
        .filter((m) => !m.mastered)
        .map((m) => liveMap[m.questionId])
        .filter((q): q is UnifiedQuestionItem => Boolean(q)),
    [mistakes, liveMap]
  );

  return (
    <div className="space-y-3.5 pb-10">
      {/* Slim Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home Hub"
            className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] truncate">
              Mistake &amp; Revision Bank
            </h1>
            <p className="text-[11px] font-mono-num text-[#64748B]">
              {activeMistakeQuestions.length} active mistake{activeMistakeQuestions.length === 1 ? '' : 's'} awaiting mastery
            </p>
          </div>
        </div>

        {activeMistakeQuestions.length > 0 && (
          <button
            type="button"
            onClick={() => onLaunchMistakeQuiz(activeMistakeQuestions)}
            className="h-8.5 px-3.5 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Revise Mistakes ({activeMistakeQuestions.length})
          </button>
        )}
      </div>

      {/* Inline Segmented Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200/70 dark:border-white/[0.05]">
          {subjectsWithAll.map((subj) => (
            <button
              key={subj}
              type="button"
              onClick={() => setSubjectFilter(subj)}
              className={`h-6.5 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                subjectFilter === subj
                  ? 'bg-[#6366F1] text-white'
                  : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
              }`}
            >
              {subj}
            </button>
          ))}
        </div>

        <SegmentedControl<'revision' | 'mastered'>
          ariaLabel="Mistake status filter"
          layoutId="mistake-status-pill"
          size="xs"
          value={showMastered ? 'mastered' : 'revision'}
          onChange={(v) => setShowMastered(v === 'mastered')}
          options={[
            { value: 'revision', label: 'Needs Work' },
            { value: 'mastered', label: 'Mastered' },
          ]}
        />
      </div>

      {enriched.length === 0 ? (
        <div className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-7 text-center space-y-1.5">
          <AlertCircle className="w-6 h-6 text-[#10B981] mx-auto" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            {showMastered ? 'No mastered mistakes archived yet' : 'Zero active mistakes in this view'}
          </p>
          <p className="text-xs text-[#64748B]">
            Questions you miss or skip in a quiz or PYQ drill appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {enriched.map(({ record, question }) => (
            <article
              key={record.questionId}
              className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] shadow-xs p-3.5 sm:p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5 text-[#64748B]">
                  <span className="font-mono-num font-semibold text-[#F43F5E]">
                    Missed {record.mistakeCount}× ({record.wasSkipped ? 'Skipped' : 'Wrong'})
                  </span>
                  <span>·</span>
                  <span className="font-medium text-[#0F172A] dark:text-[#F1F5F9]">
                    {question.subject}
                  </span>
                  <span>·</span>
                  <span>{question.chapter}</span>
                </div>

                {!record.mastered ? (
                  <button
                    type="button"
                    onClick={() => void onMarkMastered(record.questionId, true)}
                    className="h-7 px-2.5 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-700 dark:text-[#10B981] border border-emerald-500/30 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Mastered
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onMarkMastered(record.questionId, false)}
                    className="h-7 px-2.5 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Move Back
                  </button>
                )}
              </div>

              <div className="font-hindi text-[14px] sm:text-[15px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] leading-[1.65]">
                <MathText text={question.question_hi} />
              </div>

              <div className="py-2 px-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-xs sm:text-sm text-emerald-950 dark:text-emerald-100 font-hindi">
                <strong className="font-sans">Correct ({['A', 'B', 'C', 'D'][question.correct_index]}): </strong>
                <MathText text={question.options_hi[question.correct_index]} />
              </div>

              <div className="font-hindi text-xs sm:text-[13px] text-[#475569] dark:text-[#94A3B8] leading-[1.65]">
                <MathText text={question.explanation_hi} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
