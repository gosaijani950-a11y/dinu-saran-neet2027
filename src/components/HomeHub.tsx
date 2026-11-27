import React from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bookmark,
  ExternalLink,
  FileClock,
  FileUp,
  Flag,
  FolderKanban,
  Inbox,
  Layers,
  Lightbulb,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { DatabaseStats } from '../db/database';
import type { QuizCheckpoint, UserRole, ViewRoute } from '../types';

interface HomeHubProps {
  creatorName: string;
  role: UserRole;
  stats: DatabaseStats;
  checkpoint: QuizCheckpoint | null;
  openSuggestionsCount: number;
  openReportsCount: number;
  onNavigate: (route: ViewRoute) => void;
  onOpenSuggestion: () => void;
  onResumeCheckpoint: () => void;
  onDiscardCheckpoint: () => void;
}

interface CoreTile {
  id: ViewRoute;
  label: string;
  count: number;
  icon: React.ReactNode;
  iconTint: string;
}

export const HomeHub: React.FC<HomeHubProps> = ({
  role,
  stats,
  checkpoint,
  openSuggestionsCount,
  openReportsCount,
  onNavigate,
  onOpenSuggestion,
  onResumeCheckpoint,
  onDiscardCheckpoint,
}) => {
  const isAdmin = role === 'admin';

  const studyTiles: CoreTile[] = [
    {
      id: 'notes',
      label: 'Notes',
      count: stats.notesCount,
      icon: <BookOpen className="w-4 h-4 text-sky-500 dark:text-sky-400" />,
      iconTint: 'bg-sky-500/12',
    },
    {
      id: 'short-notes',
      label: 'Short Notes',
      count: stats.shortNotesCount,
      icon: <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />,
      iconTint: 'bg-amber-500/12',
    },
    {
      id: 'pyqs',
      label: 'PYQs',
      count: stats.pyqsCount,
      icon: <FileClock className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />,
      iconTint: 'bg-emerald-500/12',
    },
    {
      id: 'modules',
      label: 'Modules',
      count: stats.modulesCount,
      icon: <Layers className="w-4 h-4 text-violet-500 dark:text-violet-400" />,
      iconTint: 'bg-violet-500/12',
    },
  ];

  const utilityStrips: CoreTile[] = [
    {
      id: 'star',
      label: 'Star',
      count: stats.starredTotalCount,
      icon: <Star className="w-3.5 h-3.5 text-[#F59E0B]" />,
      iconTint: 'bg-amber-500/12',
    },
    {
      id: 'save',
      label: 'Save',
      count: stats.savedQuestionsCount,
      icon: <Bookmark className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />,
      iconTint: 'bg-cyan-500/12',
    },
    {
      id: 'special',
      label: 'Special',
      count: stats.specialsCount,
      icon: <Sparkles className="w-3.5 h-3.5 text-fuchsia-500 dark:text-fuchsia-400" />,
      iconTint: 'bg-fuchsia-500/12',
    },
  ];

  return (
    <div className="space-y-3 pb-6">
      {/* Unfinished Quiz Resume Strip */}
      {checkpoint && checkpoint.questionIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="rounded-xl px-3 py-2 bg-amber-500/10 dark:bg-[#141923] border border-amber-500/30 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <RotateCcw className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
              Resume Unfinished Quiz{' '}
              <span className="font-mono-num text-[#475569] dark:text-[#94A3B8] font-medium">
                (Q {Object.keys(checkpoint.answers).length}/{checkpoint.questionIds.length} ·{' '}
                {checkpoint.config.subject})
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={onResumeCheckpoint}
              className="h-7 px-2.5 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Play className="w-3 h-3 fill-current" /> Resume
            </motion.button>
            <button
              type="button"
              onClick={onDiscardCheckpoint}
              aria-label="Discard unfinished quiz checkpoint"
              className="w-7 h-7 rounded-lg bg-slate-200/70 dark:bg-[#1C2331] hover:bg-rose-500/15 text-[#64748B] hover:text-[#F43F5E] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Admin-only quick Inboxes strip */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.99 }}
            onClick={() => onNavigate('suggestions')}
            className="w-full rounded-xl px-3.5 py-2.5 bg-white dark:bg-[#141923] border border-amber-500/30 hover:border-amber-500/55 flex items-center justify-between gap-2 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-6.5 h-6.5 rounded-lg bg-amber-500/14 text-amber-500 flex items-center justify-center shrink-0">
                <Inbox className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                Suggestions Inbox
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono-num text-[11px] font-bold">
                {openSuggestionsCount} open
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#64748B]" />
            </span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.99 }}
            onClick={() => onNavigate('reports')}
            className="w-full rounded-xl px-3.5 py-2.5 bg-white dark:bg-[#141923] border border-rose-500/30 hover:border-rose-500/55 flex items-center justify-between gap-2 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-6.5 h-6.5 rounded-lg bg-rose-500/14 text-[#F43F5E] flex items-center justify-center shrink-0">
                <Flag className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                Reported Questions
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 font-mono-num text-[11px] font-bold">
                {openReportsCount} open
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#64748B]" />
            </span>
          </motion.button>
        </div>
      )}

      {/* BENTO TRAY */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* ROW 1: 2 Primary Hero Cells */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={() => onNavigate('quiz-setup')}
            className="relative overflow-hidden text-left rounded-2xl p-4 bg-white dark:bg-[#141923] border border-indigo-500/35 dark:border-indigo-500/30 shadow-xs hover:border-indigo-500/60 transition-colors group cursor-pointer flex flex-col justify-between min-h-[124px]"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.18),transparent_68%)]" />
            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#6366F1] text-white flex items-center justify-center shadow-sm shadow-indigo-500/25">
                <Zap className="w-4.5 h-4.5 fill-current" />
              </div>
              <span className="font-mono-num text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                {stats.totalQuestions} MCQs
              </span>
            </div>
            <div className="relative z-10 mt-3 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
                  Start Quiz
                </h2>
                <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5 truncate">
                  {isAdmin ? 'Chapterwise · 500+ AI MCQs' : 'Chapterwise · Practice & Mock Tests'}
                </p>
              </div>
              <span className="w-7 h-7 rounded-lg bg-[#6366F1] group-hover:bg-[#4F46E5] text-white flex items-center justify-center shrink-0 transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </motion.button>

          {isAdmin ? (
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={() => onNavigate('modules')}
              className="relative overflow-hidden text-left rounded-2xl p-4 bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] shadow-xs hover:border-emerald-500/40 transition-colors group cursor-pointer flex flex-col justify-between min-h-[124px]"
            >
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.14),transparent_68%)]" />
              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/14 text-[#10B981] flex items-center justify-center">
                  <FileUp className="w-4.5 h-4.5" />
                </div>
                <span className="font-mono-num text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8]">
                  {stats.modulesCount} saved
                </span>
              </div>
              <div className="relative z-10 mt-3 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
                    AI Upload Studio
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5 truncate">
                    PDF / Photo → MCQs &amp; Notes
                  </p>
                </div>
                <span className="w-7 h-7 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] flex items-center justify-center shrink-0">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={() => onNavigate('mistakes')}
              className="relative overflow-hidden text-left rounded-2xl p-4 bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] shadow-xs hover:border-rose-500/40 transition-colors group cursor-pointer flex flex-col justify-between min-h-[124px]"
            >
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(244,63,94,0.14),transparent_68%)]" />
              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-500/14 text-[#F43F5E] flex items-center justify-center">
                  <AlertCircle className="w-4.5 h-4.5" />
                </div>
                <span className="font-mono-num text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8]">
                  {stats.mistakesCount} logged
                </span>
              </div>
              <div className="relative z-10 mt-3 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
                    Mistake &amp; Revision Bank
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5 truncate">
                    Private Weak-Concept Re-Practice
                  </p>
                </div>
                <span className="w-7 h-7 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] flex items-center justify-center shrink-0">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </motion.button>
          )}
        </div>

        {/* NEW ROW: Leaderboard & Study Vault */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={() => onNavigate('leaderboard')}
            className="text-left rounded-2xl p-3.5 bg-white dark:bg-[#141923] border border-amber-500/30 shadow-xs hover:border-amber-500/60 transition-colors cursor-pointer flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8.5 h-8.5 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                  Leaderboard
                </div>
                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                  Accuracy + Speed
                </div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={() => onNavigate('study-vault')}
            className="text-left rounded-2xl p-3.5 bg-white dark:bg-[#141923] border border-emerald-500/30 shadow-xs hover:border-emerald-500/60 transition-colors cursor-pointer flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8.5 h-8.5 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <FolderKanban className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                  Study Vault
                </div>
                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                  Folders &amp; Links
                </div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          </motion.button>
        </div>
        {/* NEW ROW: Student Community Chat */}
<motion.button
  type="button"
  whileHover={{ y: -1 }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.16 }}
  onClick={() => onNavigate('community')}
  className="w-full text-left rounded-2xl p-3.5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:bg-[#141923] border border-indigo-500/35 shadow-xs hover:border-indigo-500/60 transition-colors cursor-pointer flex items-center justify-between gap-2"
>
  <div className="flex items-center gap-2.5 min-w-0">
    <span className="w-8.5 h-8.5 rounded-xl bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0">
      <Users className="w-4 h-4" />
    </span>
    <div className="min-w-0">
      <div className="text-[13px] font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
        NEET 2027 Student Community
      </div>
      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
        Group Doubts · Tag @dinu for AI Reply
      </div>
    </div>
  </div>
  <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
</motion.button>


        {/* ROW 2: 4 Compact 1x1 Study Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {studyTiles.map((tile) => (
            <motion.button
              key={tile.id}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={() => onNavigate(tile.id)}
              className="text-left rounded-2xl p-3 bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] shadow-xs hover:border-indigo-500/35 dark:hover:bg-[#1C2331]/70 transition-colors cursor-pointer flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 ${tile.iconTint}`}>
                  {tile.icon}
                </span>
                <span className="font-mono-num text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                  {tile.count}
                </span>
              </div>
              <span className="text-[13px] font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] truncate">
                {tile.label}
              </span>
            </motion.button>
          ))}
        </div>

        {/* ROW 3: Utility Strips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {utilityStrips.map((strip) => (
            <motion.button
              key={strip.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={() => onNavigate(strip.id)}
              className="rounded-xl py-2.5 px-3 bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] shadow-xs hover:border-indigo-500/35 dark:hover:bg-[#1C2331]/70 transition-colors cursor-pointer flex items-center justify-between gap-2 min-w-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${strip.iconTint}`}>
                  {strip.icon}
                </span>
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                  {strip.label}
                </span>
              </span>
              <span className="font-mono-num text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] shrink-0">
                {strip.count}
              </span>
            </motion.button>
          ))}

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={onOpenSuggestion}
            className="rounded-xl py-2.5 px-3 bg-white dark:bg-[#141923] border border-amber-500/25 shadow-xs hover:border-amber-500/50 dark:hover:bg-[#1C2331]/70 transition-colors cursor-pointer flex items-center justify-between gap-2 min-w-0"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-amber-500/12">
                <Lightbulb className="w-3.5 h-3.5 text-[#F59E0B]" />
              </span>
              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                Suggest
              </span>
            </span>
            <ArrowRight className="w-3 h-3 text-[#64748B] shrink-0" />
          </motion.button>
        </div>
      </div>

      {/* Updated Brand & Official WhatsApp Channel Footer */}
      <footer className="pt-6 pb-2 flex flex-col items-center gap-2.5 text-center select-none">
        <p className="text-sm font-bold tracking-wide text-[#0F172A] dark:text-[#F1F5F9]">
          DINU SARAN ❤️
        </p>
        <a
          href="https://whatsapp.com/channel/0029VbE7gX0FMqrWwudHPx31"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
        >
          <span>Official Updates • WhatsApp Channel</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </footer>
    </div>
  );
};
