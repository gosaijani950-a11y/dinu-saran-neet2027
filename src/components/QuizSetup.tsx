import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  BatchGenerationProgress,
  DifficultyLevel,
  MCQQuestion,
  PendingBatchJob,
  ProcessedUploadBundle,
  QuizConfig,
  UserRole,
} from '../types';
import { NEET_2027_SYLLABUS } from '../data/syllabus';
import {
  MAX_SINGLE_RUN_QUESTIONS,
  filterQuestionsByPatterns,
  getSourceDensityEstimate,
} from '../utils/quizLogic';
import { useSubjects } from '../utils/subjects';
import { processUploadedFiles } from '../services/fileProcessor';
import { saveModuleBundle } from '../db/database';
import { SegmentedControl } from './SegmentedControl';

interface QuizSetupProps {
  role: UserRole;
  settings: AppSettings;
  allQuestions: MCQQuestion[];
  customSubjects: string[];
  config: QuizConfig;
  onChangeConfig: (next: QuizConfig) => void;
  onAddCustomSubject: (name: string) => Promise<void>;
  onStartFromBank: (questions: MCQQuestion[], config: QuizConfig) => void;
  onStartRollingGeneration: (
    config: QuizConfig,
    uploadBundle: ProcessedUploadBundle | null,
    moduleId?: string
  ) => void;
  batchProgress: BatchGenerationProgress;
  pendingBatchJob: PendingBatchJob | null;
  onResumePendingBatchJob: () => void;
  onDismissPendingBatchJob: () => void;
  onPauseBatch: () => void;
  onResumeBatch: () => void;
  onStopBatch: () => void;
  onRetryFailedBatch: () => void;
  onLaunchEarlyGeneratedQuiz: () => void;
  onOpenSettings: () => void;
  onBackHome: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

const QUESTION_PRESETS = [20, 40, 60, 100, 500];
const DIFFICULTY_OPTIONS: Array<{ value: DifficultyLevel; label: string }> = [
  { value: 'Easy', label: 'Easy' },
  { value: 'Medium', label: 'Med' },
  { value: 'Hard', label: 'Hard' },
  { value: 'Advanced', label: 'Adv' },
  { value: 'Mixed', label: 'Mix' },
];

const TIMER_PRESETS: Array<{ value: string; label: string; minutes: number | null }> = [
  { value: '15', label: '15m', minutes: 15 },
  { value: '30', label: '30m', minutes: 30 },
  { value: '60', label: '60m', minutes: 60 },
  { value: 'off', label: 'Off', minutes: null },
];

const SUBJECT_ACCENT_DOT: Record<string, string> = {
  Physics: 'text-sky-500 dark:text-sky-400',
  Chemistry: 'text-amber-500 dark:text-amber-400',
  Botany: 'text-emerald-500 dark:text-emerald-400',
  Zoology: 'text-rose-500 dark:text-rose-400',
};

export const QuizSetup: React.FC<QuizSetupProps> = ({
  role,
  settings,
  allQuestions,
  customSubjects,
  config,
  onChangeConfig,
  onAddCustomSubject,
  onStartFromBank,
  onStartRollingGeneration,
  batchProgress,
  pendingBatchJob,
  onResumePendingBatchJob,
  onDismissPendingBatchJob,
  onPauseBatch,
  onResumeBatch,
  onStopBatch,
  onRetryFailedBatch,
  onLaunchEarlyGeneratedQuiz,
  onOpenSettings,
  onBackHome,
  onToast,
}) => {
  const isAdmin = role === 'admin';
  const effectiveSourceMode: QuizConfig['sourceMode'] = isAdmin ? config.sourceMode : 'bank';
  const { subjectsWithAll: allSubjects, addSubject } = useSubjects(customSubjects);
  const [chapterSearch, setChapterSearch] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [customCountInput, setCustomCountInput] = useState(String(config.questionCount));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Inline File Upload State
  const [uploadBundle, setUploadBundle] = useState<ProcessedUploadBundle | null>(null);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const chapterReadyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of allQuestions) {
      map.set(q.chapter, (map.get(q.chapter) ?? 0) + 1);
    }
    return map;
  }, [allQuestions]);

  const visibleChapters = useMemo(() => {
    const base =
      config.subject === 'All'
        ? NEET_2027_SYLLABUS
        : NEET_2027_SYLLABUS.filter((c) => c.subject === config.subject);

    const customChapterNames = new Set(
      allQuestions
        .filter((q) => config.subject === 'All' || q.subject === config.subject)
        .map((q) => q.chapter)
    );
    const existingNames = new Set(base.map((b) => b.name));
    const extras = Array.from(customChapterNames)
      .filter((name) => !existingNames.has(name))
      .map((name) => ({
        id: `custom-${name}`,
        subject: config.subject === 'All' ? 'Custom' : config.subject,
        classLevel: 'Custom' as const,
        unit: undefined as string | undefined,
        name,
      }));

    const combined = [...base, ...extras];
    const query = chapterSearch.trim().toLowerCase();
    if (!query) return combined;
    return combined.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.subject.toLowerCase().includes(query) ||
        (c.unit && c.unit.toLowerCase().includes(query))
    );
  }, [config.subject, chapterSearch, allQuestions]);

  const matchingBankQuestions = useMemo(() => {
    const scopeFiltered = allQuestions.filter((q) => {
      if (config.subject !== 'All' && q.subject !== config.subject) return false;
      if (config.chapters.length > 0 && !config.chapters.includes(q.chapter)) return false;
      if (config.difficulty !== 'Mixed' && q.difficulty !== config.difficulty) return false;
      return true;
    });
    return filterQuestionsByPatterns(scopeFiltered, config.patterns);
  }, [allQuestions, config.subject, config.chapters, config.difficulty, config.patterns]);

  const densityInfo = useMemo(
    () => (uploadBundle ? getSourceDensityEstimate(uploadBundle.totalPages) : null),
    [uploadBundle]
  );

  const activePatternCount = useMemo(
    () => Object.values(config.patterns).filter(Boolean).length,
    [config.patterns]
  );

  const handleToggleChapter = (chapterName: string) => {
    const exists = config.chapters.includes(chapterName);
    const nextChapters = exists
      ? config.chapters.filter((c) => c !== chapterName)
      : [...config.chapters, chapterName];
    onChangeConfig({ ...config, chapters: nextChapters });
  };

  const handleCreateCustomSubject = async () => {
    if (!isAdmin) return;
    const clean = newSubjectName.trim();
    if (!clean) return;
    addSubject(clean);
    await onAddCustomSubject(clean);
    onChangeConfig({ ...config, subject: clean, chapters: [] });
    setNewSubjectName('');
    setAddingSubject(false);
    onToast(`Added custom subject "${clean}" globally across all views.`, 'success');
  };

  const handleFilesSelected = async (files: FileList | File[]) => {
    if (!isAdmin) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setProcessingFiles(true);
    setProcessingStatus('Processing files locally...');
    try {
      const processed = await processUploadedFiles(arr, (msg) => setProcessingStatus(msg));
      setUploadBundle(processed);
      onChangeConfig({ ...config, sourceMode: 'upload' });
      onToast(
        `Processed ${processed.totalPages} page(s) (${processed.imagePageCount} scan(s)).`,
        'success'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to process files.', 'error');
    } finally {
      setProcessingFiles(false);
      setProcessingStatus('');
    }
  };

  const handleCustomCountChange = (val: string) => {
    setCustomCountInput(val);
    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 1) {
      const clamped = Math.min(MAX_SINGLE_RUN_QUESTIONS, parsed);
      onChangeConfig({ ...config, questionCount: clamped });
      if (parsed > MAX_SINGLE_RUN_QUESTIONS) {
        setCustomCountInput(String(MAX_SINGLE_RUN_QUESTIONS));
        onToast(
          `Single run capped at ${MAX_SINGLE_RUN_QUESTIONS.toLocaleString()} MCQs for browser stability. Unlimited MCQs accumulate in IndexedDB across runs.`,
          'info'
        );
      }
    }
  };

  const handleQuickPracticeExisting = () => {
    if (matchingBankQuestions.length === 0) {
      onToast('No published questions match the active Subject, Chapter, and NEET Pattern filters.', 'info');
      return;
    }
    const shuffled = [...matchingBankQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(config.questionCount, shuffled.length));
    onStartFromBank(selected, { ...config, sourceMode: 'bank' });
  };

  const handleGenerateAndStart = async () => {
    if (!isAdmin) return;
    if (!settings.apiKey.trim()) {
      onToast('Configure your Gemini API key in Settings (⚙️) to generate AI MCQs.', 'error');
      onOpenSettings();
      return;
    }
    if (effectiveSourceMode === 'upload' && (!uploadBundle || uploadBundle.pages.length === 0)) {
      onToast('Upload at least one PDF or photo first, or switch to AI Gen.', 'error');
      return;
    }
    const clampedCount = Math.min(MAX_SINGLE_RUN_QUESTIONS, Math.max(1, config.questionCount));
    let inlineModuleId: string | undefined;
    if (effectiveSourceMode === 'upload' && uploadBundle) {
      inlineModuleId = `mod-quiz-${Date.now()}`;
      await saveModuleBundle(inlineModuleId, uploadBundle);
    }
    onStartRollingGeneration(
      { ...config, questionCount: clampedCount, sourceMode: effectiveSourceMode },
      effectiveSourceMode === 'upload' ? uploadBundle : null,
      inlineModuleId
    );
  };

  const handlePrimaryLaunch = () => {
    if (effectiveSourceMode === 'bank') {
      handleQuickPracticeExisting();
    } else {
      void handleGenerateAndStart();
    }
  };

  const isGenerating = isAdmin && (batchProgress.status === 'running' || batchProgress.status === 'paused');
  const progressPercent =
    batchProgress.targetCount > 0
      ? Math.min(100, Math.round((batchProgress.generatedCount / batchProgress.targetCount) * 100))
      : 0;

  const activeTimerSegment = config.untimed
    ? 'off'
    : TIMER_PRESETS.find((t) => t.minutes === config.timerMinutes)?.value ?? 'custom';

  const shortDiffLabel =
    DIFFICULTY_OPTIONS.find((d) => d.value === config.difficulty)?.label ?? config.difficulty;

  const launchCount =
    effectiveSourceMode === 'bank'
      ? Math.min(config.questionCount, matchingBankQuestions.length)
      : config.questionCount;

  const launchTimerText = config.untimed ? 'Untimed' : `${config.timerMinutes}m`;

  return (
    <div className="space-y-3 pb-2">
      {/* Slim Header Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home Hub"
            className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] shrink-0 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] truncate">
              Quiz Setup
            </h1>
            <p className="text-[11px] text-[#64748B] truncate">
              NEET 2027 NCERT · {config.subject}
              {config.chapters.length > 0 ? ` · ${config.chapters.length} chapters` : ' · All chapters'}
            </p>
          </div>
        </div>

        <span className="font-mono-num text-[11px] font-medium text-[#64748B] shrink-0">
          {matchingBankQuestions.length} ready in Bank
        </span>
      </div>

      {/* Resume Interrupted Generation Banner (Admin-only) */}
      {isAdmin && pendingBatchJob && !isGenerating && batchProgress.status !== 'error' && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-2.5 bg-amber-500/12 border border-amber-500/30 text-amber-900 dark:text-amber-100 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="min-w-0 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <p className="text-xs font-semibold truncate">
              Interrupted Batch ({pendingBatchJob.generatedQuestionIds.length}/{pendingBatchJob.targetCount} saved) · {pendingBatchJob.config.subject}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onResumePendingBatchJob}
              className="h-7 px-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-600 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Resume Interrupted Generation
            </button>
            <button
              type="button"
              onClick={onDismissPendingBatchJob}
              aria-label="Dismiss interrupted generation"
              className="h-7 px-2 rounded-lg text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}

      {/* API Error Banner (Admin-only) */}
      {isAdmin && batchProgress.status === 'error' && batchProgress.errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="rounded-xl p-3 bg-rose-500/12 border border-rose-500/30 text-rose-800 dark:text-rose-200 space-y-2"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#F43F5E] shrink-0 mt-0.5" />
            <div className="text-xs min-w-0">
              <p className="font-semibold">API Error: {batchProgress.errorMessage}</p>
              {batchProgress.generatedCount > 0 && (
                <p className="opacity-85 mt-0.5">
                  {batchProgress.generatedCount} generated MCQs are safely preserved in IndexedDB.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onRetryFailedBatch}
              className="h-7 px-2.5 rounded-lg bg-[#F43F5E] hover:bg-rose-600 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Retry Batch
            </button>
            {batchProgress.generatedCount > 0 && (
              <button
                type="button"
                onClick={onLaunchEarlyGeneratedQuiz}
                className="h-7 px-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Zap className="w-3 h-3" />
                Start with {batchProgress.generatedCount} Ready
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSettings}
              className="h-7 px-2.5 rounded-lg bg-white/60 dark:bg-[#1C2331] text-[11px] font-medium cursor-pointer"
            >
              API Settings
            </button>
          </div>
        </motion.div>
      )}

      {/* Rolling Batch Progress Strip (Admin-only) */}
      {isAdmin && (isGenerating || (batchProgress.status === 'completed' && batchProgress.generatedCount > 0)) && (
        <div className="rounded-xl p-3 bg-white dark:bg-[#141923] border border-indigo-500/30 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {batchProgress.status === 'running' ? (
                <Loader2 className="w-4 h-4 text-[#6366F1] animate-spin shrink-0" />
              ) : batchProgress.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              ) : (
                <Pause className="w-4 h-4 text-[#F59E0B] shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate font-mono-num">
                  {batchProgress.status === 'completed'
                    ? `${batchProgress.generatedCount} Hindi MCQs Saved`
                    : batchProgress.status === 'paused'
                    ? `Paused · ${batchProgress.generatedCount}/${batchProgress.targetCount}`
                    : `Generating ${batchProgress.generatedCount}/${batchProgress.targetCount} · Batch ${batchProgress.currentBatch}/${batchProgress.totalBatches}`}
                </p>
                {batchProgress.activeNotice && (
                  <p className="text-[11px] text-[#64748B] truncate">{batchProgress.activeNotice}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {batchProgress.status === 'running' && (
                <button
                  type="button"
                  onClick={onPauseBatch}
                  className="h-7 px-2 rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Pause className="w-3 h-3" />
                  Pause
                </button>
              )}
              {batchProgress.status === 'paused' && (
                <button
                  type="button"
                  onClick={onResumeBatch}
                  className="h-7 px-2 rounded-lg bg-[#6366F1] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  Resume
                </button>
              )}
              {isGenerating && (
                <button
                  type="button"
                  onClick={onStopBatch}
                  className="h-7 px-2 rounded-lg bg-rose-500/12 text-rose-700 dark:text-rose-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop
                </button>
              )}
            </div>
          </div>

          <div className="w-full h-1.5 rounded-full bg-[#EEF2F7] dark:bg-[#0E121B] overflow-hidden">
            <motion.div
              className="h-full bg-[#6366F1] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, progressPercent)}%` }}
            />
          </div>

          {batchProgress.generatedCount > 0 && (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {batchProgress.generatedCount} MCQs ready to start immediately
              </span>
              <button
                type="button"
                onClick={onLaunchEarlyGeneratedQuiz}
                className="h-7 px-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
              >
                Start Now →
              </button>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
       * SINGLE UNIFIED CONTROL CARD (Gestalt Proximity & 1px Hairlines)
       * ===================================================================*/}
      <div className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] shadow-xs divide-y divide-slate-200/80 dark:divide-white/[0.06] overflow-hidden">
        {/* SECTION 1 — Subject Segmented Bar */}
        <div className="p-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <div
              role="group"
              aria-label="Subject selector"
              className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200/70 dark:border-white/[0.05] flex-1 min-w-0 overflow-x-auto"
            >
              {allSubjects.map((subj) => {
                const active = config.subject === subj;
                return (
                  <button
                    key={subj}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChangeConfig({ ...config, subject: subj, chapters: [] })}
                    className={`relative flex-1 h-7 px-2.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-white'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="quiz-subject-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-md bg-[#6366F1]"
                      />
                    )}
                    <span className="relative z-10">{subj}</span>
                  </button>
                );
              })}
            </div>

            {isAdmin &&
              (addingSubject ? (
                <div className="inline-flex items-center gap-1 shrink-0">
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreateCustomSubject();
                    }}
                    placeholder="Subject..."
                    aria-label="New custom subject name"
                    className="h-8 w-24 px-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-indigo-500/50 text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateCustomSubject()}
                    className="h-8 px-2.5 rounded-lg bg-[#6366F1] text-white text-xs font-semibold cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingSubject(false)}
                    aria-label="Cancel custom subject"
                    className="w-7 h-8 rounded-lg text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingSubject(true)}
                  aria-label="Add Custom Subject"
                  title="Add Custom Subject"
                  className="h-9 px-2.5 rounded-lg bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200/70 dark:border-white/[0.05] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#6366F1] dark:hover:text-indigo-400 inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add</span>
                </button>
              ))}
          </div>
        </div>

        {/* SECTION 2 — Compact Chapter Selector */}
        <div className="p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              Chapters{' '}
              <span className="font-mono-num font-normal text-[#64748B]">
                ({config.chapters.length > 0 ? `${config.chapters.length} selected` : `All ${visibleChapters.length}`})
              </span>
            </span>

            <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
              <div className="relative flex-1 sm:w-52">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Search chapters..."
                  aria-label="Search NEET 2027 chapters"
                  className="w-full h-8 pl-8 pr-2.5 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#64748B] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeConfig({ ...config, chapters: visibleChapters.map((c) => c.name) })
                }
                className="text-xs font-medium text-[#475569] dark:text-[#94A3B8] hover:text-[#6366F1] dark:hover:text-indigo-400 cursor-pointer whitespace-nowrap"
              >
                All
              </button>
              <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onChangeConfig({ ...config, chapters: [] })}
                className="text-xs font-medium text-[#475569] dark:text-[#94A3B8] hover:text-[#F43F5E] cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-[175px] overflow-y-auto space-y-1 pr-1">
            {visibleChapters.map((ch) => {
              const checked = config.chapters.includes(ch.name);
              const readyCount = chapterReadyCounts.get(ch.name) ?? 0;
              const subjTint = SUBJECT_ACCENT_DOT[ch.subject] ?? 'text-indigo-400';
              return (
                <label
                  key={ch.id}
                  className={`flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-indigo-500/12 border-indigo-500/35'
                      : 'bg-transparent border-transparent hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331]/75'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleChapter(ch.name)}
                      className="w-3.5 h-3.5 rounded accent-[#6366F1] shrink-0"
                    />
                    <span className={`text-[11px] font-semibold shrink-0 w-16 truncate ${subjTint}`}>
                      {ch.subject}
                    </span>
                    <span className="text-xs font-medium text-[#0F172A] dark:text-[#F1F5F9] truncate">
                      {ch.name}
                    </span>
                  </span>
                  {readyCount > 0 && (
                    <span className="font-mono-num text-[11px] font-semibold text-emerald-600 dark:text-[#10B981] shrink-0">
                      {readyCount} Q
                    </span>
                  )}
                </label>
              );
            })}
            {visibleChapters.length === 0 && (
              <p className="py-4 text-center text-xs text-[#64748B]">
                No chapters match &ldquo;{chapterSearch}&rdquo;.
              </p>
            )}
          </div>
        </div>

        {/* SECTION 3 — Tight Key-Value Control Rows */}
        <div className="p-3 space-y-2.5">
          {/* Row: Source */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <span className="w-24 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0">
              Source
            </span>
            <div className="flex-1 flex flex-wrap items-center gap-2">
              {isAdmin ? (
                <SegmentedControl<QuizConfig['sourceMode']>
                  ariaLabel="Question source"
                  layoutId="quiz-source-pill"
                  value={effectiveSourceMode}
                  onChange={(sourceMode) => onChangeConfig({ ...config, sourceMode })}
                  options={[
                    { value: 'bank', label: 'Bank', badge: matchingBankQuestions.length },
                    { value: 'syllabus', label: 'AI Gen' },
                    { value: 'upload', label: 'Upload' },
                  ]}
                />
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  <span>Published Question Bank</span>
                  <span className="font-mono-num px-1.5 py-0.5 rounded bg-white/70 dark:bg-[#141923] text-[11px]">
                    {matchingBankQuestions.length} Qs
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Inline Upload Dropzone (only when Admin & Upload active) */}
          <AnimatePresence initial={false}>
            {isAdmin && effectiveSourceMode === 'upload' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden sm:pl-[108px]"
              >
                <div className="space-y-2 pt-0.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      if (e.target.files?.length) void handleFilesSelected(e.target.files);
                    }}
                    className="hidden"
                  />
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.length) void handleFilesSelected(e.dataTransfer.files);
                    }}
                    className={`rounded-xl border border-dashed px-3 py-2 flex flex-wrap items-center justify-between gap-2 transition-colors ${
                      dragActive
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-300 dark:border-white/15 bg-[#F4F6FA] dark:bg-[#0E121B]'
                    }`}
                  >
                    {processingFiles ? (
                      <div className="flex items-center gap-2 text-xs font-medium text-[#6366F1]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{processingStatus}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <Upload className="w-3.5 h-3.5 text-[#6366F1] shrink-0" />
                          <span className="text-xs text-[#475569] dark:text-[#94A3B8] truncate">
                            {uploadBundle
                              ? `${uploadBundle.totalPages} page(s) ready · ${uploadBundle.files.map((f) => f.name).join(', ')}`
                              : 'Drop PDF, textbook scans, or handwritten notes'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-7 px-2.5 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#0F172A] dark:text-[#F1F5F9] text-[11px] font-semibold cursor-pointer"
                          >
                            {uploadBundle ? 'Add More' : 'Choose Files'}
                          </button>
                          {uploadBundle && (
                            <button
                              type="button"
                              onClick={() => setUploadBundle(null)}
                              aria-label="Clear uploaded files"
                              className="w-7 h-7 rounded-lg text-[#64748B] hover:text-[#F43F5E] flex items-center justify-center cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {uploadBundle && densityInfo && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
                      <span>{densityInfo.summary}</span>
                      <label className="inline-flex items-center gap-1.5 font-medium text-[#0F172A] dark:text-[#F1F5F9] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.deepNcertExpansion}
                          onChange={(e) =>
                            onChangeConfig({ ...config, deepNcertExpansion: e.target.checked })
                          }
                          className="w-3.5 h-3.5 rounded accent-[#6366F1]"
                        />
                        Deep NCERT Expansion (500+)
                      </label>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Row: Count */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <span className="w-24 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0">
              Count
            </span>
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Question count presets"
                className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200/80 dark:border-white/[0.05]"
              >
                {QUESTION_PRESETS.map((num) => {
                  const active = config.questionCount === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onChangeConfig({ ...config, questionCount: num });
                        setCustomCountInput(String(num));
                      }}
                      className={`relative h-7 min-w-[38px] px-2 rounded-md text-xs font-mono-num font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'text-white'
                          : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="quiz-count-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-md bg-[#6366F1]"
                        />
                      )}
                      <span className="relative z-10">{num}</span>
                    </button>
                  );
                })}
              </div>

              <div className="inline-flex items-center gap-1.5">
                <label htmlFor="custom-q-count" className="text-[11px] text-[#64748B]">
                  Custom
                </label>
                <input
                  id="custom-q-count"
                  type="number"
                  min={1}
                  max={MAX_SINGLE_RUN_QUESTIONS}
                  value={customCountInput}
                  onChange={(e) => handleCustomCountChange(e.target.value)}
                  className="w-20 h-8 px-2 rounded-lg text-xs font-mono-num bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="hidden md:inline text-[11px] text-[#64748B]">
                  max {MAX_SINGLE_RUN_QUESTIONS.toLocaleString()}/run
                </span>
              </div>
            </div>
          </div>

          {/* Row: Difficulty */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <span className="w-24 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0">
              Difficulty
            </span>
            <div className="flex-1">
              <SegmentedControl<DifficultyLevel>
                ariaLabel="Difficulty level"
                layoutId="quiz-diff-pill"
                value={config.difficulty}
                onChange={(difficulty) => onChangeConfig({ ...config, difficulty })}
                options={DIFFICULTY_OPTIONS}
              />
            </div>
          </div>

          {/* Row: Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <span className="w-24 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0">
              Timer
            </span>
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <SegmentedControl<string>
                ariaLabel="Timer duration"
                layoutId="quiz-timer-pill"
                value={activeTimerSegment}
                onChange={(val) => {
                  const found = TIMER_PRESETS.find((t) => t.value === val);
                  if (!found) return;
                  if (found.minutes === null) {
                    onChangeConfig({ ...config, untimed: true });
                  } else {
                    onChangeConfig({ ...config, untimed: false, timerMinutes: found.minutes });
                  }
                }}
                options={TIMER_PRESETS.map((t) => ({ value: t.value, label: t.label }))}
              />

              <div className="inline-flex items-center gap-1">
                <input
                  id="quiz-timer-minutes"
                  aria-label="Custom timer minutes"
                  type="number"
                  min={1}
                  max={600}
                  disabled={config.untimed}
                  value={config.timerMinutes}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      untimed: false,
                      timerMinutes: Math.max(1, Math.min(600, Number(e.target.value) || 20)),
                    })
                  }
                  className="w-16 h-8 px-2 rounded-lg text-xs font-mono-num bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-[#64748B]">min</span>
              </div>
            </div>
          </div>

          {/* Row: Mode (Instant/Exam + Scroll/1-Q side by side) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <span className="w-24 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0">
              Mode
            </span>
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <SegmentedControl<'practice' | 'exam'>
                ariaLabel="Answer reveal mode"
                layoutId="quiz-reveal-pill"
                value={config.revealMode}
                onChange={(revealMode) => onChangeConfig({ ...config, revealMode })}
                options={[
                  { value: 'practice', label: 'Instant' },
                  { value: 'exam', label: 'Exam' },
                ]}
              />
              <SegmentedControl<'scroll' | 'single'>
                ariaLabel="Question layout mode"
                layoutId="quiz-layout-pill"
                value={config.layoutMode}
                onChange={(layoutMode) => onChangeConfig({ ...config, layoutMode })}
                options={[
                  { value: 'scroll', label: 'Scroll' },
                  { value: 'single', label: '1-Q' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* SECTION 4 — Collapsible Progressive Disclosure (Closed by Default) */}
        <div className="p-3">
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left text-xs font-medium text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  advancedOpen ? 'rotate-90 text-[#6366F1]' : ''
                }`}
              />
              <span>Advanced: NEET Patterns, +4/-1 Marking &amp; Language</span>
            </span>
            <span className="font-mono-num text-[11px] text-[#64748B] shrink-0">
              {activePatternCount} patterns · {config.scoringMode === 'neet' ? '+4/-1' : 'Std'} ·{' '}
              {config.languageMode === 'hindi_only' ? 'Hindi' : 'Bilingual'}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {advancedOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="pt-3 mt-2.5 border-t border-slate-200/70 dark:border-white/[0.06] space-y-2.5">
                  {/* NEET Pattern Toggles */}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
                    <span className="w-24 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0 sm:pt-1">
                      Patterns
                    </span>
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {(
                        [
                          ['ncertLine', 'NCERT Line'],
                          ['exception', 'Exception'],
                          ['assertionReason', 'Assertion-Reason'],
                          ['statementType', 'Statement I & II'],
                          ['numerical', 'Numerical'],
                          ['diagramConcept', 'Diagram'],
                        ] as const
                      ).map(([key, label]) => {
                        const on = config.patterns[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              onChangeConfig({
                                ...config,
                                patterns: { ...config.patterns, [key]: !on },
                              })
                            }
                            className={`h-7 px-2.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                              on
                                ? 'bg-indigo-500/15 border-indigo-500/45 text-indigo-700 dark:text-indigo-200'
                                : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-slate-200 dark:border-white/[0.06] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Marking & Language */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <span className="w-24 text-xs font-medium text-[#475569] dark:text-[#94A3B8] shrink-0">
                      Scoring
                    </span>
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <SegmentedControl<'neet' | 'standard'>
                        ariaLabel="Scoring system"
                        layoutId="quiz-scoring-pill"
                        size="xs"
                        value={config.scoringMode}
                        onChange={(scoringMode) => onChangeConfig({ ...config, scoringMode })}
                        options={[
                          { value: 'neet', label: 'NEET +4/-1' },
                          { value: 'standard', label: 'Standard' },
                        ]}
                      />
                      <SegmentedControl<'hindi_only' | 'bilingual'>
                        ariaLabel="Question language"
                        layoutId="quiz-lang-pill"
                        size="xs"
                        value={config.languageMode}
                        onChange={(languageMode) => onChangeConfig({ ...config, languageMode })}
                        options={[
                          { value: 'hindi_only', label: 'Hindi Only' },
                          { value: 'bilingual', label: 'Bilingual' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* STICKY BOTTOM LAUNCH BAR (Single High-Contrast Primary Indigo CTA) */}
      <div className="sticky bottom-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2.5 backdrop-blur-xl bg-[#F4F6FA]/92 dark:bg-[#0B0E14]/92 border-t border-slate-200/80 dark:border-white/[0.06]">
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          disabled={isGenerating || (effectiveSourceMode === 'bank' && matchingBankQuestions.length === 0)}
          onClick={handlePrimaryLaunch}
          className="w-full h-10 px-4 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs sm:text-sm font-semibold shadow-sm shadow-indigo-500/20 flex items-center justify-center gap-2 transition-colors disabled:opacity-45 cursor-pointer"
        >
          {effectiveSourceMode === 'bank' ? (
            <>
              <Zap className="w-4 h-4 fill-current shrink-0" />
              <span>
                Start Quiz — {launchCount} Qs · {launchTimerText} · {shortDiffLabel}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                Generate &amp; Start — {config.questionCount} Qs · {launchTimerText} · {shortDiffLabel}
              </span>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
