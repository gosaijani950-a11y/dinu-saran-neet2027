import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Bookmark,
  Check,
  Cloud,
  Database,
  Edit3,
  Flag,
  HelpCircle,
  Home,
  Inbox,
  Info,
  Lightbulb,
  Lock,
  LogOut,
  MessageSquare,
  Phone,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { AppSettings, UserRole, ViewRoute } from '../types';
import type { DatabaseStats } from '../db/database';
import { NEET_2027_SYLLABUS } from '../data/syllabus';
import { BrandLogo } from './BrandLogo';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoute: ViewRoute;
  stats: DatabaseStats;
  settings: AppSettings;
  role: UserRole;
  adminEmail: string | null;
  openSuggestionsCount: number;
  openReportsCount: number;
  onNavigate: (route: ViewRoute) => void;
  onOpenSettings: () => void;
  onOpenCloudSetup: () => void;
  onOpenHelp: () => void;
  onOpenSuggestion: () => void;
  onOpenAdminLogin: () => void;
  onAdminLogout: () => void;
  onUpdateCreatorName: (name: string) => void;
  onAdjustFont: (delta: number) => void;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  currentRoute,
  stats,
  settings,
  role,
  adminEmail,
  openSuggestionsCount,
  openReportsCount,
  onNavigate,
  onOpenSettings,
  onOpenCloudSetup,
  onOpenHelp,
  onOpenSuggestion,
  onOpenAdminLogin,
  onAdminLogout,
  onUpdateCreatorName,
  onAdjustFont,
}) => {
  const isAdmin = role === 'admin';
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(settings.creatorName);

  const handleSaveName = () => {
    const trimmed = draftName.trim() || 'DINU SARAN';
    onUpdateCreatorName(trimmed);
    setDraftName(trimmed);
    setEditingName(false);
  };

  const navItems: Array<{
    label: string;
    route?: ViewRoute;
    action?: () => void;
    icon: React.ReactNode;
    count?: number;
  }> = [
    {
      label: 'Home',
      route: 'home',
      icon: <Home className="w-4 h-4 text-[#6366F1]" />,
    },
    {
      label: 'Saved Questions',
      route: 'save',
      count: stats.savedQuestionsCount,
      icon: <Bookmark className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />,
    },
    {
      label: 'Mistake & Revision Bank',
      route: 'mistakes',
      count: stats.mistakesCount,
      icon: <AlertCircle className="w-4 h-4 text-[#F43F5E]" />,
    },
    {
      label: 'Study Data & Backup',
      route: 'backup',
      icon: <Database className="w-4 h-4 text-[#10B981]" />,
    },
    ...(isAdmin
      ? [
          {
            label: 'Reported Questions',
            route: 'reports' as ViewRoute,
            count: openReportsCount,
            icon: <Flag className="w-4 h-4 text-[#F43F5E]" />,
          },
          {
            label: 'Student Suggestions Inbox',
            route: 'suggestions' as ViewRoute,
            count: openSuggestionsCount,
            icon: <Inbox className="w-4 h-4 text-amber-500" />,
          },
          {
            label: 'Gemini API Settings',
            action: () => {
              onClose();
              onOpenSettings();
            },
            icon: <Settings className="w-4 h-4 text-[#F59E0B]" />,
          },
          {
            label: 'Cloud & Supabase Setup',
            action: () => {
              onClose();
              onOpenCloudSetup();
            },
            icon: <Cloud className="w-4 h-4 text-sky-500" />,
          },
        ]
      : [
          {
            label: 'Suggestion & Feedback',
            action: () => {
              onClose();
              onOpenSuggestion();
            },
            icon: <Lightbulb className="w-4 h-4 text-amber-500" />,
          },
        ]),
    {
      label: 'Help & Contact Us',
      action: () => {
        onClose();
        onOpenHelp();
      },
      icon: <HelpCircle className="w-4 h-4 text-[#10B981]" />,
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[330px] bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border-l border-[#E2E8F0] dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="h-12 px-4 border-b border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <BrandLogo size="sm" />
                <span className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight truncate">
                  {settings.creatorName || 'DINU SARAN'}
                </span>
                {isAdmin ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/14 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shrink-0">
                    Admin
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 text-[10px] font-semibold shrink-0">
                    Student
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Menu"
                className="w-7 h-7 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* Mobile Font Scale Strip */}
              <div className="sm:hidden flex items-center justify-between px-3 py-2 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.06]">
                <span className="text-xs font-medium text-[#475569] dark:text-[#94A3B8]">
                  Text Size <span className="font-mono-num">({settings.fontScale}%)</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onAdjustFont(-5)}
                    className="px-2 py-1 rounded-md bg-white dark:bg-[#242D3F] text-[11px] font-bold text-[#0F172A] dark:text-[#F1F5F9] border border-[#E2E8F0] dark:border-white/[0.08]"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdjustFont(5)}
                    className="px-2 py-1 rounded-md bg-white dark:bg-[#242D3F] text-[11px] font-bold text-[#0F172A] dark:text-[#F1F5F9] border border-[#E2E8F0] dark:border-white/[0.08]"
                  >
                    A+
                  </button>
                </div>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1" aria-label="Main Drawer Navigation">
                {navItems.map((item) => {
                  const active = item.route && currentRoute === item.route;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        if (item.action) {
                          item.action();
                        } else if (item.route) {
                          onNavigate(item.route);
                          onClose();
                        }
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#4F46E5] dark:bg-[#6366F1] text-white shadow-sm'
                          : 'text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={active ? 'brightness-200' : ''}>{item.icon}</span>
                        <span>{item.label}</span>
                      </span>
                      {typeof item.count === 'number' && (
                        <span
                          className={`font-mono-num text-[11px] px-1.5 py-0.5 rounded-md font-semibold ${
                            active
                              ? 'bg-white/20 text-white'
                              : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Admin Auth Card */}
              <div className="rounded-xl p-3 bg-[#F4F6FA] dark:bg-[#1C2331]/80 border border-[#E2E8F0] dark:border-white/[0.06] flex items-center justify-between gap-2">
                {isAdmin ? (
                  <>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        Admin Mode Active
                      </p>
                      <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] truncate">
                        {adminEmail || 'Authenticated Publisher'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onAdminLogout();
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/12 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                        Student Practice Mode
                      </p>
                      <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] truncate">
                        Read-only content · Private saves
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAdminLogin();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#141923] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] border border-[#E2E8F0] dark:border-white/[0.08] text-[#475569] dark:text-[#CBD5E1] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Lock className="w-3 h-3 text-[#6366F1]" />
                      Admin Login
                    </button>
                  </>
                )}
              </div>

              <div className="h-px bg-[#E2E8F0] dark:bg-white/[0.06]" />

              {/* Compact Info Group */}
              <div className="rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331]/70 border border-[#E2E8F0] dark:border-white/[0.06] divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                {/* Latest Updates */}
                <section className="p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4F46E5] dark:text-[#818CF8]">
                    <Sparkles className="w-3 h-3" />
                    <span>Latest Updates</span>
                  </div>
                  <ul className="text-[11px] text-[#475569] dark:text-[#94A3B8] space-y-1 leading-relaxed list-disc pl-3.5">
                    <li>
                      Full NEET 2027 Rationalized NCERT PCBZ syllabus ({NEET_2027_SYLLABUS.length}{' '}
                      chapters).
                    </li>
                    <li>Practice Mode lock + Instant &amp; Exam Mock Test engines.</li>
                    <li>Private per-student Save Vault, Star Vault &amp; Mistake Bank.</li>
                    <li>Direct Student Suggestion &amp; Chapter Request inbox.</li>
                  </ul>
                </section>

                {/* About Us */}
                <section className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <BrandLogo size="sm" />
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                      <Info className="w-3 h-3" />
                      <span>About Us</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                    NEET 2027 study &amp; test hub crafted by{' '}
                    <strong className="text-[#0F172A] dark:text-[#F1F5F9]">
                      {settings.creatorName}
                    </strong>{' '}
                    — clean English UI with pure NCERT Hindi study content and KaTeX formulas.
                  </p>
                </section>

                {/* Contact & Display Name */}
                <section className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                      <MessageSquare className="w-3 h-3" />
                      <span>Contact &amp; Feedback</span>
                    </div>
                    {isAdmin && !editingName && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftName(settings.creatorName);
                          setEditingName(true);
                        }}
                        className="text-[11px] font-semibold text-[#4F46E5] dark:text-[#818CF8] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit Name
                      </button>
                    )}
                  </div>

                  {isAdmin && editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        aria-label="Workspace display name"
                        maxLength={32}
                        className="flex-1 px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
                      />
                      <button
                        type="button"
                        onClick={handleSaveName}
                        aria-label="Save workspace display name"
                        className="px-2.5 py-1.5 rounded-lg bg-[#4F46E5] dark:bg-[#6366F1] text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Creator:{' '}
                      <strong className="text-[#0F172A] dark:text-[#F1F5F9]">
                        {settings.creatorName}
                      </strong>
                    </p>
                  )}

                  <div className="pt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono-num font-semibold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1">
                      <Phone className="w-3 h-3 text-[#10B981]" />
                      +223 79778524
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenHelp();
                      }}
                      className="px-2 py-1 rounded-md bg-[#10B981]/12 text-[#059669] dark:text-[#34D399] text-[11px] font-semibold hover:bg-[#10B981]/20 cursor-pointer"
                    >
                      Open Help
                    </button>
                  </div>

                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                    Export personal progress backups from{' '}
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('backup');
                        onClose();
                      }}
                      className="text-[#4F46E5] dark:text-[#818CF8] font-semibold hover:underline cursor-pointer"
                    >
                      Study Data &amp; Backup
                    </button>{' '}
                    anytime.
                  </p>
                </section>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
