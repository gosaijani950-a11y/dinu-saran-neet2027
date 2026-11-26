import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw, Save, Shield, X } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../db/database';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: string;
  onSaveRules: (rules: string) => void;
}

const RULE_PRESETS = [
  'Strictly follow latest rationalized NCERT 2026–27 NEET syllabus (exclude deleted chapters).',
  'Highlight NCERT tables, bold terms, and numerical exceptions in explanations.',
  'Include at least 30% Statement I & II and Assertion-Reason pattern questions.',
  'Keep Physics numericals calculable in under 60 seconds without a calculator.',
];

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  rules,
  onSaveRules,
}) => {
  const [draft, setDraft] = useState(rules);

  useEffect(() => {
    if (isOpen) setDraft(rules);
  }, [isOpen, rules]);

  const appendPreset = (preset: string) => {
    setDraft((prev) => {
      if (prev.includes(preset)) return prev;
      return prev.trim() ? `${prev.trim()}\n${preset}` : preset;
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Custom AI Rules"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative z-10 w-full max-w-lg rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-[#E2E8F0] dark:border-white/[0.08] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#6366F1]/12 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center shrink-0">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                    Custom AI Rules
                  </h2>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    Injected automatically into every Gemini prompt
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Custom AI Rules"
                className="w-7 h-7 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="custom-ai-rules-textarea"
                  className="block text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                >
                  Active Prompt Rules
                </label>
                <textarea
                  id="custom-ai-rules-textarea"
                  rows={5}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Enter custom instructions for Gemini..."
                  className="w-full p-3 rounded-xl text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60 leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                  Quick NEET 2027 Presets
                </span>
                <div className="flex flex-col gap-1">
                  {RULE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => appendPreset(preset)}
                      className="text-left px-2.5 py-1.5 rounded-lg text-[11px] bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#6366F1]/12 text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] border border-[#E2E8F0] dark:border-white/[0.06] transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(DEFAULT_SETTINGS.customRules)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Default
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSaveRules(draft.trim());
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#6366F1] dark:hover:bg-[#5558E8] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Rules
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
