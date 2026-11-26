import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Flag, Loader2, Send, X } from 'lucide-react';
import type {
  AppSettings,
  QuestionReport,
  ReportReason,
  UnifiedQuestionItem,
} from '../types';
import { ALLOWED_REPORT_REASONS } from '../utils/supabaseMappers';
import { submitQuestionReportToCloud } from '../services/supabaseService';
import { db } from '../db/database';
import { MathText } from './MathText';

interface ReportQuestionModalProps {
  question: UnifiedQuestionItem | null;
  onClose: () => void;
  settings: AppSettings;
  onSubmitted?: (report: QuestionReport, savedToCloud: boolean) => Promise<void> | void;
  onToast?: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const ReportQuestionModal: React.FC<ReportQuestionModalProps> = ({
  question,
  onClose,
  settings,
  onSubmitted,
  onToast,
}) => {
  const [reason, setReason] = useState<ReportReason>('Wrong Answer');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedState, setSubmittedState] = useState<{
    savedToCloud: boolean;
  } | null>(null);

  useEffect(() => {
    if (question) {
      setReason('Wrong Answer');
      setComment('');
      setSubmittedState(null);
    }
  }, [question?.id]);

  const handleClose = () => {
    setSubmittedState(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question) return;

    setSubmitting(true);
    try {
      const sourceTable =
        question.sourceTable === 'pyqs' || question.tags.includes('PYQ')
          ? 'pyqs'
          : 'questions';

      const { report, savedToCloud } = await submitQuestionReportToCloud(settings, {
        questionId: question.id,
        sourceTable,
        subject: question.subject,
        chapter: question.chapter,
        questionSnapshot: question.question_hi,
        reason,
        comment,
      });

      // Persist in local fallback queue whenever offline/unconfigured (or for local admin testing)
      if (!savedToCloud) {
        await db.questionReports.put(report);
      }

      await onSubmitted?.(report, savedToCloud);
      setSubmittedState({ savedToCloud });
      onToast?.(
        savedToCloud
          ? 'Question report sent directly to Admin review queue.'
          : 'Report saved safely in local queue (will sync when cloud is connected).',
        'success'
      );
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : 'Failed to submit question report.',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {question && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Report Question"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-[#E2E8F0] dark:border-white/[0.08] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-rose-500/14 text-[#F43F5E] flex items-center justify-center shrink-0">
                  <Flag className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                    Report Question Issue
                  </h2>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    {question.subject} · {question.chapter}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close Report Modal"
                className="w-7 h-7 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {submittedState ? (
              <div className="p-6 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-[#10B981] mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                    Report Submitted for Review
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                    {submittedState.savedToCloud
                      ? 'Thank you! Your report has been sent securely to the Admin review queue.'
                      : 'Thank you! Saved in your local queue so it is never lost while offline.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-8.5 px-5 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold cursor-pointer"
                >
                  Back to Study
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3">
                {/* Compact Question Preview */}
                <div className="rounded-xl p-2.5 bg-[#F4F6FA] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.06] max-h-24 overflow-y-auto">
                  <div className="font-hindi text-xs text-[#0F172A] dark:text-[#F1F5F9]/90 leading-relaxed line-clamp-3">
                    <MathText text={question.question_hi} />
                  </div>
                </div>

                {/* Reason Selector */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    Select Issue Reason
                  </span>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Report reason"
                  >
                    {ALLOWED_REPORT_REASONS.map((item) => {
                      const active = reason === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setReason(item)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#F43F5E] border-[#F43F5E] text-white'
                              : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-[#E2E8F0] dark:border-white/[0.08] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Comment */}
                <div className="space-y-1">
                  <label
                    htmlFor="report-question-comment"
                    className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                  >
                    Details <span className="font-normal text-[#64748B]">(Optional)</span>
                  </label>
                  <textarea
                    id="report-question-comment"
                    rows={3}
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="e.g., Correct option should be B according to NCERT page 42, or LaTeX formula is broken..."
                    className="w-full px-3 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#F43F5E]/50"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="h-8.5 px-3 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-8.5 px-4 rounded-lg bg-[#F43F5E] hover:bg-rose-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
