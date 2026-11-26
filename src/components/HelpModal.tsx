import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  KeyRound,
  Lightbulb,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

const SUPPORT_PHONE_DISPLAY = '+223 79778524';
const SUPPORT_PHONE_DIGITS = '22379778524';
const SUPPORT_EMAIL = '';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onOpenSuggestion?: () => void;
  onToast?: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  isAdmin = false,
  onOpenSuggestion,
  onToast,
}) => {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_PHONE_DISPLAY);
      setCopiedPhone(true);
      onToast?.(`Copied ${SUPPORT_PHONE_DISPLAY}`, 'success');
      window.setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      onToast?.(`Support number: ${SUPPORT_PHONE_DISPLAY}`, 'info');
    }
  };

  const handleCopyEmail = async () => {
    if (!SUPPORT_EMAIL) return;
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopiedEmail(true);
      onToast?.(`Copied ${SUPPORT_EMAIL}`, 'success');
      window.setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      onToast?.(`Support email: ${SUPPORT_EMAIL}`, 'info');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Help and Contact Us"
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
            className="relative z-10 w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-[#E2E8F0] dark:border-white/[0.08] shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 px-4 py-3 bg-white/95 dark:bg-[#141923]/95 backdrop-blur-xl border-b border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandLogo size="md" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                    Help &amp; Contact Us
                  </h2>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    DINU SARAN • NEET 2027 Support
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Help Modal"
                className="w-7 h-7 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Primary Highlight: Contact Us Card */}
              <section className="rounded-xl p-3.5 bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4F46E5] dark:text-[#818CF8]">
                    Direct Support Line
                  </span>
                  <span className="text-[11px] font-medium text-[#10B981]">WhatsApp · Call</span>
                </div>

                <div className="text-xl font-bold font-mono-num tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
                  {SUPPORT_PHONE_DISPLAY}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <a
                    href={`https://wa.me/${SUPPORT_PHONE_DIGITS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-80 shrink-0" />
                  </a>

                  <a
                    href={`tel:${SUPPORT_PHONE_DISPLAY.replace(/\s+/g, '')}`}
                    className="h-8 px-2.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#6366F1] dark:hover:bg-[#5558E8] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>Call Now</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => void handleCopyPhone()}
                    className="h-8 px-2.5 rounded-lg bg-white dark:bg-[#141923] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                        <span className="text-[#10B981]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {onOpenSuggestion && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSuggestion();
                    }}
                    className="w-full h-9 px-3 rounded-lg bg-amber-500/14 hover:bg-amber-500/22 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                    Suggestion &amp; Chapter Request
                  </button>
                )}

                {SUPPORT_EMAIL && (
                  <div className="pt-2.5 border-t border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
                    <a
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="text-xs font-medium text-[#4F46E5] dark:text-[#818CF8] hover:underline flex items-center gap-1.5 truncate"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{SUPPORT_EMAIL}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleCopyEmail()}
                      className="px-2 py-1 rounded-md bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.08] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] shrink-0 cursor-pointer"
                    >
                      {copiedEmail ? '✓ Copied' : 'Copy Email'}
                    </button>
                  </div>
                )}
              </section>

              {/* Quick Tablet Help Tips */}
              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                  Quick Tablet Help Tips
                </h3>
                <div className="rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331]/60 border border-[#E2E8F0] dark:border-white/[0.06] divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                  {isAdmin ? (
                    <div className="p-3 flex items-start gap-2.5">
                      <KeyRound className="w-4 h-4 text-[#6366F1] shrink-0 mt-0.5" />
                      <div className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                        <strong className="text-[#0F172A] dark:text-[#F1F5F9]">Gemini API Key:</strong>{' '}
                        Tap the ⚙️ Settings icon in the top bar to manage your Gemini API key and
                        sync newly created chapters to Supabase.
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-[#6366F1] shrink-0 mt-0.5" />
                      <div className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                        <strong className="text-[#0F172A] dark:text-[#F1F5F9]">Private Practice Vault:</strong>{' '}
                        Your starred items, saved questions, and Mistake Bank stay privately inside
                        this browser without affecting other students.
                      </div>
                    </div>
                  )}
                  <div className="p-3 flex items-start gap-2.5">
                    <Smartphone className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      <strong className="text-[#0F172A] dark:text-[#F1F5F9]">
                        Install as Tablet App:
                      </strong>{' '}
                      Open Chrome Menu <span className="font-mono-num">⋮</span> →{' '}
                      <em>Add to Home Screen</em> to pin the Lion Crest icon directly on your
                      Samsung Tablet or phone.
                    </div>
                  </div>
                  <div className="p-3 flex items-start gap-2.5">
                    <Database className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      <strong className="text-[#0F172A] dark:text-[#F1F5F9]">
                        Safe Backup (.json):
                      </strong>{' '}
                      Export your personal progress backup from Menu →{' '}
                      <em>Study Data &amp; Backup</em> before clearing browser site data.
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
