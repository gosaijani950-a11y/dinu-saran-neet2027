import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Lightbulb, Loader2, Send, X } from 'lucide-react';
import type { AppSettings, StudentSuggestion, SuggestionCategory } from '../types';
import { ALLOWED_SUGGESTION_CATEGORIES } from '../utils/supabaseMappers';
import { submitStudentSuggestionToCloud } from '../services/supabaseService';
import { db } from '../db/database';

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSubmitted?: (suggestion: StudentSuggestion) => Promise<void> | void;
  onToast?: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const SuggestionModal: React.FC<SuggestionModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSubmitted,
  onToast,
}) => {
  const [studentName, setStudentName] = useState('');
  const [category, setCategory] = useState<SuggestionCategory>('Feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 3) {
      onToast?.('Please write a short suggestion or feedback (at least 3 characters).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { suggestion, savedToCloud } = await submitStudentSuggestionToCloud(settings, {
        studentName,
        category,
        message,
      });
      await db.suggestions.put(suggestion);
      await onSubmitted?.(suggestion);
      setMessage('');
      setSubmittedOk(true);
      onToast?.(
        savedToCloud
          ? 'Suggestion sent directly to Admin Inbox!'
          : 'Suggestion saved locally (connect Supabase in Cloud Setup for live inbox sync).',
        'success'
      );
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not submit suggestion.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSubmittedOk(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Suggestion and Feedback Box"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleResetAndClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-[#E2E8F0] dark:border-white/[0.08] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/15 text-[#F59E0B] flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                    Suggestion &amp; Feedback
                  </h2>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    Request chapters, notes, or report an issue
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetAndClose}
                aria-label="Close Suggestion Box"
                className="w-7 h-7 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {submittedOk ? (
              <div className="p-6 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-[#10B981] mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                    Thank you! Suggestion Received
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    Your feedback has been sent to the Admin inbox.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSubmittedOk(false)}
                    className="h-8 px-3 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] cursor-pointer"
                  >
                    Send Another
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAndClose}
                    className="h-8 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3">
                <div className="space-y-1">
                  <label
                    htmlFor="suggestion-student-name"
                    className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                  >
                    Your Name <span className="font-normal text-[#64748B]">(Optional)</span>
                  </label>
                  <input
                    id="suggestion-student-name"
                    type="text"
                    maxLength={60}
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="e.g., Aarav / Class 12"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                    Category
                  </span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggestion category">
                    {ALLOWED_SUGGESTION_CATEGORIES.map((cat) => {
                      const active = category === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setCategory(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#6366F1] border-[#6366F1] text-white'
                              : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-[#E2E8F0] dark:border-white/[0.08] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="suggestion-message-box"
                    className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                  >
                    Message
                  </label>
                  <textarea
                    id="suggestion-message-box"
                    rows={4}
                    required
                    maxLength={2000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your suggestion, chapter notes request, or bug report..."
                    className="w-full px-3 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleResetAndClose}
                    className="h-8.5 px-3 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-8.5 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Submit Suggestion
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
