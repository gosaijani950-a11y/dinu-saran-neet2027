import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import type {
  AppSettings,
  BatchGenerationProgress,
  CloudSyncStatus,
  MCQQuestion,
  MistakeRecord,
  PYQItem,
  PendingBatchJob,
  ProcessedUploadBundle,
  QuestionReport,
  QuizCheckpoint,
  QuizConfig,
  QuizResultSummary,
  ShortNote,
  SpecialItem,
  StudentSuggestion,
  StudyNote,
  SubjectName,
  UnifiedQuestionItem,
  UploadedModule,
  UserRole,
  ViewRoute,
} from './types';
import {
  applyCloudSyncSnapshot,
  db,
  ensureStarterSeeded,
  getDatabaseStats,
  getUnifiedQuestionMap,
  loadAppSettings,
  loadModuleBundle,
  loadPendingBatchJob,
  recordQuizMistakes,
  saveAppSettings,
  savePendingBatchJob,
  type DatabaseStats,
} from './db/database';
import { generateMCQBatch } from './services/geminiService';
import {
  checkCurrentAdminSession,
  clearCloudStudySection,
  fetchQuestionReportsFromCloud,
  fetchSuggestionsFromCloud,
  getSupabaseClient,
  isSupabaseConfigured,
  pullPublishedStudyData,
  pushFullLocalLibraryToCloud,
  pushQueuedQuestionReportsToCloud,
  signOutAdmin,
  upsertCloudModule,
  upsertCloudQuestions,
} from './services/supabaseService';
import {
  MAX_SINGLE_RUN_QUESTIONS,
  MCQ_BATCH_SIZE,
  buildUnifiedQuestionMap,
  deduplicateQuestions,
  evaluateQuizPerformance,
} from './utils/quizLogic';
import { mergeCustomSubjectsIntoStorage } from './utils/subjects';
import { TopBar } from './components/TopBar';
import { SideDrawer } from './components/SideDrawer';
import { SettingsModal } from './components/SettingsModal';
import { RulesModal } from './components/RulesModal';
import { HelpModal } from './components/HelpModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { SuggestionModal } from './components/SuggestionModal';
import { SuggestionsInboxView } from './components/SuggestionsInboxView';
import { ReportQuestionModal } from './components/ReportQuestionModal';
import { ReportsInboxView } from './components/ReportsInboxView';
import { HomeHub } from './components/HomeHub';
import { QuizSetup } from './components/QuizSetup';
import { ActiveQuiz } from './components/ActiveQuiz';
import { QuizResult } from './components/QuizResult';
import { ModulesStudio } from './components/ModulesStudio';
import {
  NotesView,
  PYQsView,
  SaveVaultView,
  ShortNotesView,
  SpecialView,
  StarVaultView,
} from './components/StudyVaults';
import { MistakeBank } from './components/MistakeBank';
import { BackupManager, type ClearTarget } from './components/BackupManager';
import { useStudentFeatures } from './hooks/useStudentFeatures';
import { StudentOnboardingModal } from './components/StudentOnboardingModal';
import { LeaderboardView } from './components/LeaderboardView';
import { StudyVaultView } from './components/StudyVaultView';
import { FloatingAiAssistant } from './components/FloatingAiAssistant';
import { CommunityChatView } from './components/CommunityChatView';
import { Flame, ArrowLeft } from 'lucide-react';
import { GlobalSafeErrorBoundary, formatNeetExamText } from './utils/neetEngine';
import { SecretVaultModal } from './components/SecretVaultModal';
import { StudentProfileModal } from './components/StudentProfileModal';
import { NeetCountdownAndFreezeBar, SmartRevisionAndOmrWidget } from './components/NeetAdvancedTools';
import { AiQuizStudioModal } from './components/AiQuizStudioModal';
import { getPersistentAdminQuestions, syncCloudQuestionsToAllPanels, deduplicateQuestionsList, buildDeterministicQuestionId } from './services/dinuMentorService';
import { getPersistentAdminQuestions, syncCloudQuestionsToAllPanels, deduplicateQuestionsList, buildDeterministicQuestionId, syncSharedApiKeyBridge } from './services/dinuMentorService';



const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  subject: 'All',
  chapters: [],
  sourceMode: 'bank',
  questionCount: 20,
  difficulty: 'Mixed',
  patterns: {
    ncertLine: true,
    exception: false,
    assertionReason: false,
    statementType: false,
    numerical: false,
    diagramConcept: false,
  },
  revealMode: 'practice',
  layoutMode: 'scroll',
  scoringMode: 'neet',
  languageMode: 'hindi_only',
  timerMinutes: 30,
  untimed: false,
  deepNcertExpansion: false,
};

const INITIAL_BATCH_PROGRESS: BatchGenerationProgress = {
  status: 'idle',
  targetCount: 0,
  generatedCount: 0,
  currentBatch: 0,
  totalBatches: 0,
  generatedQuestionIds: [],
  coveredConcepts: [],
  failedBatchIndex: null,
  errorMessage: null,
  activeNotice: null,
};

const EMPTY_STATS: DatabaseStats = {
  totalQuestions: 0,
  notesCount: 0,
  shortNotesCount: 0,
  pyqsCount: 0,
  specialsCount: 0,
  modulesCount: 0,
  mistakesCount: 0,
  savedQuestionsCount: 0,
  starredTotalCount: 0,
  quizHistoryCount: 0,
  approxMb: 0,
};

interface ToastItem {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface RollingJobContext {
  config: QuizConfig;
  bundle: ProcessedUploadBundle | null;
  moduleId?: string;
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [route, setRoute] = useState<ViewRoute>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'gemini' | 'cloud'>('gemini');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Strict Role-Based Access Control (Default public link is ALWAYS locked student mode)
  const [role, setRole] = useState<UserRole>('student');
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('local');

  // IndexedDB React Mirrors
  const [stats, setStats] = useState<DatabaseStats>(EMPTY_STATS);
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [shortNotes, setShortNotes] = useState<ShortNote[]>([]);
  const [pyqs, setPyqs] = useState<PYQItem[]>([]);
  const [specials, setSpecials] = useState<SpecialItem[]>([]);
  const [modules, setModules] = useState<UploadedModule[]>([]);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [suggestions, setSuggestions] = useState<StudentSuggestion[]>([]);
  const [questionReports, setQuestionReports] = useState<QuestionReport[]>([]);
  const [reportTargetQuestion, setReportTargetQuestion] = useState<UnifiedQuestionItem | null>(null);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [checkpoint, setCheckpoint] = useState<QuizCheckpoint | null>(null);

  // Quiz Workflow State (default bank mode for Students)
  const [quizConfig, setQuizConfig] = useState<QuizConfig>(() => ({
    ...DEFAULT_QUIZ_CONFIG,
    sourceMode: 'bank',
  }));
  const [activeQuizIds, setActiveQuizIds] = useState<string[]>([]);
  const [activeQuizQuestionsOverride, setActiveQuizQuestionsOverride] = useState<MCQQuestion[] | null>(null);
  const [activeQuizConfig, setActiveQuizConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);
  const [activeInitialAnswers, setActiveInitialAnswers] = useState<Record<string, number>>({});
  const [activeInitialIndex, setActiveInitialIndex] = useState(0);
  const [activeInitialSeconds, setActiveInitialSeconds] = useState(1800);
  const [activeSessionUsesBatch, setActiveSessionUsesBatch] = useState(false);
  const [latestResult, setLatestResult] = useState<QuizResultSummary | null>(null);
  const [latestResultQuestions, setLatestResultQuestions] = useState<MCQQuestion[]>([]);

  // Rolling Batch Engine State + Refs
  const [batchProgress, setBatchProgress] = useState<BatchGenerationProgress>(INITIAL_BATCH_PROGRESS);
  const [pendingBatchJob, setPendingBatchJob] = useState<PendingBatchJob | null>(() =>
    loadPendingBatchJob()
  );
  const batchJobRef = useRef<RollingJobContext | null>(null);
  const batchPausedRef = useRef(false);
  const batchStoppedRef = useRef(false);
  const batchAbortRef = useRef<AbortController | null>(null);
  const batchGeneratedIdsRef = useRef<string[]>([]);
  const batchCoveredRef = useRef<string[]>([]);
  const batchStemsRef = useRef<Set<string>>(new Set());
  const [showSecretHub, setShowSecretHub] = useState(false);
    const [showMyProfile, setShowMyProfile] = useState(false);
    const [showAiStudio, setShowAiStudio] = useState(false);
  const [needsFullOnboarding, setNeedsFullOnboarding] = useState<boolean>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dinu_neet2027_full_profile_v2') || '{}');
      return !(saved.username && saved.mobile && saved.security_code && saved.secret_code);
    } catch {
      return true;
    }
  });

const [globalStreak, setGlobalStreak] = useState<number>(() => {
  try {
    const raw = JSON.parse(localStorage.getItem('dinu_neet2027_streak_v1') || '{"count":1}');
    return Math.max(1, Number(raw.count) || 1);
  } catch {
    return 1;
  }
});

  


  const showToast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);
  const studentFeatures = useStudentFeatures(settings, showToast);

  // Sync Theme and Global Font Scale on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.fontSize = `${settings.fontScale}%`;
    saveAppSettings(settings);
     if (settings.apiKey) syncSharedApiKeyBridge(settings.apiKey);
  }, [settings]);

  const refreshAllData = useCallback(async () => {
    const [
      qList,
      nList,
      snList,
      pList,
      spList,
      modList,
      mList,
      sugList,
      repList,
      csList,
      cp,
      dbStats,
    ] = await Promise.all([
      db.questions.orderBy('createdAt').reverse().toArray(),
      db.notes.orderBy('createdAt').reverse().toArray(),
      db.shortNotes.orderBy('createdAt').reverse().toArray(),
      db.pyqs.orderBy('createdAt').reverse().toArray(),
      db.specials.orderBy('createdAt').reverse().toArray(),
      db.modules.orderBy('createdAt').reverse().toArray(),
      db.mistakes.toArray(),
      db.suggestions.orderBy('createdAt').reverse().toArray(),
      db.questionReports.orderBy('createdAt').reverse().toArray(),
      db.customSubjects.toArray(),
      db.quizCheckpoints.get('active'),
      getDatabaseStats(),
    ]);

    setQuestions(qList);
    setNotes(nList);
    setShortNotes(snList);
    setPyqs(pList);
    setSpecials(spList);
    setModules(modList);
    setMistakes(mList);
    setSuggestions(sugList);
    setQuestionReports(repList);
    const mergedSubjects = mergeCustomSubjectsIntoStorage(csList.map((c) => c.name));
    setCustomSubjects(mergedSubjects);
    setCheckpoint(cp ?? null);
    setStats(dbStats);
  }, []);

  const refreshSuggestions = useCallback(async () => {
    if (role === 'admin' && isSupabaseConfigured(settings)) {
      try {
        const cloudSugs = await fetchSuggestionsFromCloud(settings);
        await db.transaction('rw', db.suggestions, async () => {
          await db.suggestions.clear();
          if (cloudSugs.length > 0) {
            await db.suggestions.bulkPut(cloudSugs);
          }
        });
      } catch {
        // Keep local suggestions cache if offline
      }
    }
    const localSugs = await db.suggestions.orderBy('createdAt').reverse().toArray();
    setSuggestions(localSugs);
  }, [role, settings]);

  const syncAdminReportsWithCloud = useCallback(
    async (activeSettings: AppSettings) => {
      const localReps = await db.questionReports.orderBy('createdAt').reverse().toArray();
      if (!isSupabaseConfigured(activeSettings)) {
        setQuestionReports(localReps);
        return;
      }
      try {
        const cloudReps = await fetchQuestionReportsFromCloud(activeSettings);
        const cloudIds = new Set(cloudReps.map((r) => r.id));
        const unsyncedLocal = localReps.filter((r) => !cloudIds.has(r.id));
        if (unsyncedLocal.length > 0) {
          await pushQueuedQuestionReportsToCloud(activeSettings, unsyncedLocal).catch(() => {});
        }
        const merged = [...unsyncedLocal, ...cloudReps].sort(
          (a, b) => b.createdAt - a.createdAt
        );
        await db.transaction('rw', db.questionReports, async () => {
          await db.questionReports.clear();
          if (merged.length > 0) {
            await db.questionReports.bulkPut(merged);
          }
        });
        setQuestionReports(merged);
      } catch {
        setQuestionReports(localReps);
      }
    },
    []
  );

  const refreshQuestionReports = useCallback(async () => {
    if (role === 'admin' && isSupabaseConfigured(settings)) {
      await syncAdminReportsWithCloud(settings);
      return;
    }
    const localReps = await db.questionReports.orderBy('createdAt').reverse().toArray();
    setQuestionReports(localReps);
  }, [role, settings, syncAdminReportsWithCloud]);

  const syncFromCloudAndCheckAdmin = useCallback(async () => {
    if (!isSupabaseConfigured(settings)) {
      setCloudSyncStatus('local');
      setRole('student');
      setAdminEmail(null);
      return;
    }

    setCloudSyncStatus('syncing');
    try {
      const cloudSnapshot = await pullPublishedStudyData(settings);
      if (cloudSnapshot) {
        await applyCloudSyncSnapshot(cloudSnapshot);
        await refreshAllData();
      }
      setCloudSyncStatus('synced');
    } catch {
      setCloudSyncStatus('error');
    }

    const session = await checkCurrentAdminSession(settings);
    if (session.isAdmin) {
      setRole('admin');
      setAdminEmail(session.email);
      try {
        const cloudSugs = await fetchSuggestionsFromCloud(settings);
        await db.transaction('rw', db.suggestions, async () => {
          await db.suggestions.clear();
          if (cloudSugs.length > 0) {
            await db.suggestions.bulkPut(cloudSugs);
          }
        });
        setSuggestions(cloudSugs);
      } catch {
        // Ignore suggestions fetch error on initial boot
      }
      await syncAdminReportsWithCloud(settings);
    } else {
      setRole('student');
      setAdminEmail(null);
    }
  }, [settings, refreshAllData, syncAdminReportsWithCloud]);

  // Initial Boot, Starter Seed, and Cloud Hydration
  useEffect(() => {
    void (async () => {
      await ensureStarterSeeded();
      await refreshAllData();
      await syncFromCloudAndCheckAdmin();
    })();
    // Intentionally run once on boot; manual re-sync is triggered after Cloud Setup save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Sync Admin-generated & Cloud-published MCQs cleanly with automatic duplicate cleanup
  useEffect(() => {
    const cleanAndSyncBank = async (incoming: MCQQuestion[]) => {
      const existingAll = await db.questions.toArray();
      const mergedUnique = deduplicateQuestionsList([...existingAll, ...incoming]);

      const now = Date.now();
      const formatted: MCQQuestion[] = mergedUnique.map((q, idx) => ({
        ...q,
        id: buildDeterministicQuestionId(q),
        correctIndex:
          typeof (q as any).correctIndex === 'number'
            ? (q as any).correctIndex
            : typeof (q as any).correct_index === 'number'
            ? (q as any).correct_index
            : 0,
        createdAt: typeof q.createdAt === 'number' ? q.createdAt : now - idx,
      }));

      if (existingAll.length !== formatted.length || incoming.length > 0) {
        await db.questions.clear();
        await db.questions.bulkPut(formatted);
        await refreshAllData();
      }
    };

    void cleanAndSyncBank(getPersistentAdminQuestions());

    const onBankSynced = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (Array.isArray(detail?.questions)) {
        void cleanAndSyncBank(detail.questions);
      }
    };
    window.addEventListener('neet-questions-bank-synced', onBankSynced);

    let active = true;
    const pullFromSupabase = async () => {
      const client = getSupabaseClient(settings);
      if (!client) return;
      const cloudMerged = await syncCloudQuestionsToAllPanels(client);
      if (active && cloudMerged.length > 0) {
        await cleanAndSyncBank(cloudMerged);
      }
    };
    void pullFromSupabase();
    const timer = window.setInterval(() => void pullFromSupabase(), 60000);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('neet-questions-bank-synced', onBankSynced);
    };
  }, [settings, refreshAllData]);


  // Keep Supabase auth state synchronized
  useEffect(() => {
    const client = getSupabaseClient(settings);
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setRole('student');
        setAdminEmail(null);
        setQuizConfig((prev) => ({ ...prev, sourceMode: 'bank' }));
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [settings]);

  const openSuggestionsCount = useMemo(
    () => suggestions.filter((s) => s.status === 'open').length,
    [suggestions]
  );

  const openReportsCount = useMemo(
    () => questionReports.filter((r) => r.status === 'open').length,
    [questionReports]
  );

  const unifiedQuestionsMap = useMemo<Record<string, UnifiedQuestionItem>>(
    () => buildUnifiedQuestionMap(questions, pyqs),
    [questions, pyqs]
  );

  const activeQuizQuestions = useMemo(() => {
    if (activeQuizQuestionsOverride) {
      // Keep Star/Save flags synced across both db.questions and db.pyqs
      return activeQuizQuestionsOverride.map((q) => unifiedQuestionsMap[q.id] ?? q);
    }
    const ids = activeSessionUsesBatch
      ? Array.from(new Set([...activeQuizIds, ...batchProgress.generatedQuestionIds]))
      : activeQuizIds;
    return ids
      .map((id) => unifiedQuestionsMap[id])
      .filter((q): q is UnifiedQuestionItem => Boolean(q));
  }, [
    activeQuizQuestionsOverride,
    activeSessionUsesBatch,
    activeQuizIds,
    batchProgress.generatedQuestionIds,
    unifiedQuestionsMap,
  ]);

  const updateSettings = useCallback(
    (partial: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
      if (role === 'admin' && partial.apiKey !== undefined && partial.apiKey.trim()) {
        setQuizConfig((prev) =>
          prev.sourceMode === 'bank' ? { ...prev, sourceMode: 'syllabus' } : prev
        );
      }
    },
    [role]
  );

  const handleAdjustFont = useCallback((delta: number) => {
    setSettings((prev) => ({
      ...prev,
      fontScale: Math.min(130, Math.max(85, prev.fontScale + delta)),
    }));
  }, []);

  const handleAdminAuthenticated = useCallback(
    async (email: string) => {
      setRole('admin');
      setAdminEmail(email);
      if (isSupabaseConfigured(settings)) {
        try {
          const cloudSugs = await fetchSuggestionsFromCloud(settings);
          await db.transaction('rw', db.suggestions, async () => {
            await db.suggestions.clear();
            if (cloudSugs.length > 0) {
              await db.suggestions.bulkPut(cloudSugs);
            }
          });
          setSuggestions(cloudSugs);
        } catch {
          // Ignore cloud inbox load failures
        }
        await syncAdminReportsWithCloud(settings);
      }
    },
    [settings, syncAdminReportsWithCloud]
  );

  const handleAdminLogout = useCallback(async () => {
    await signOutAdmin(settings);
    setRole('student');
    setAdminEmail(null);
    setSettingsOpen(false);
    setRulesOpen(false);
    setQuizConfig((prev) => ({ ...prev, sourceMode: 'bank' }));
    if (route === 'suggestions' || route === 'reports') {
      setRoute('home');
    }
    showToast('Switched to Locked Student Mode.', 'info');
  }, [settings, route, showToast]);

  const handlePushLibraryToCloud = useCallback(async () => {
    if (role !== 'admin') return;
    if (!isSupabaseConfigured(settings)) {
      showToast('Configure your Supabase URL and Anon Key first.', 'error');
      return;
    }
    try {
      setCloudSyncStatus('syncing');
      const [allQs, allNotes, allShort, allPyqs, allSpec, allMods] = await Promise.all([
        db.questions.toArray(),
        db.notes.toArray(),
        db.shortNotes.toArray(),
        db.pyqs.toArray(),
        db.specials.toArray(),
        db.modules.toArray(),
      ]);
      await pushFullLocalLibraryToCloud(settings, {
        questions: allQs,
        notes: allNotes,
        shortNotes: allShort,
        pyqs: allPyqs,
        specials: allSpec,
        modules: allMods,
      });
      setCloudSyncStatus('synced');
      showToast(
        `Synced to Supabase: ${allQs.length} MCQs, ${allNotes.length} Notes, ${allShort.length} Short Notes, ${allPyqs.length} PYQs.`,
        'success'
      );
    } catch (err) {
      setCloudSyncStatus('error');
      showToast(err instanceof Error ? err.message : 'Cloud sync failed.', 'error');
    }
  }, [role, settings, showToast]);

  const handleClearCloud = useCallback(
    async (target: ClearTarget) => {
      if (role !== 'admin') return;
      if (target === 'mistakes' || target === 'quizHistory') return;
      if (!isSupabaseConfigured(settings)) return;
      try {
        await clearCloudStudySection(settings, target);
      } catch (err) {
        showToast(
          `Cleared locally, but cloud clear reported: ${err instanceof Error ? err.message : 'Error'}`,
          'error'
        );
      }
    },
    [role, settings, showToast]
  );

  const handleToggleQuestionStar = useCallback(
    async (questionId: string) => {
      const existing = await db.questions.get(questionId);
      if (existing) {
        await db.questions.update(questionId, { isStarred: !existing.isStarred });
        await refreshAllData();
      } else {
        // Check if it was a PYQ
        const existingPyq = await db.pyqs.get(questionId);
        if (existingPyq) {
          await db.pyqs.update(questionId, { isStarred: !existingPyq.isStarred });
          await refreshAllData();
        }
      }
    },
    [refreshAllData]
  );

  const handleToggleQuestionSave = useCallback(
    async (questionId: string) => {
      const existing = await db.questions.get(questionId);
      if (existing) {
        await db.questions.update(questionId, { isSaved: !existing.isSaved });
        await refreshAllData();
      } else {
        const existingPyq = await db.pyqs.get(questionId);
        if (existingPyq) {
          await db.pyqs.update(questionId, { isSaved: !existingPyq.isSaved });
          await refreshAllData();
        }
      }
    },
    [refreshAllData]
  );

  const handleAddCustomSubject = useCallback(
    async (name: string) => {
      if (role !== 'admin') return;
      await db.customSubjects.put({ name, createdAt: Date.now() });
      await refreshAllData();
    },
    [role, refreshAllData]
  );

  /* ==================== QUIZ LAUNCHERS ==================== */
  const launchQuizSession = useCallback(
    (
      sessionQuestions: MCQQuestion[],
      config: QuizConfig,
      options?: {
        initialAnswers?: Record<string, number>;
        initialIndex?: number;
        remainingSeconds?: number;
        usesBatchStream?: boolean;
        overrideList?: boolean;
      }
    ) => {
      setActiveQuizConfig(config);
      setActiveQuizIds(sessionQuestions.map((q) => q.id));
      setActiveQuizQuestionsOverride(options?.overrideList ? sessionQuestions : null);
      setActiveInitialAnswers(options?.initialAnswers ?? {});
      setActiveInitialIndex(options?.initialIndex ?? 0);
      setActiveInitialSeconds(
        options?.remainingSeconds ?? Math.max(60, (config.timerMinutes || 30) * 60)
      );
      setActiveSessionUsesBatch(Boolean(options?.usesBatchStream));
      setRoute('quiz-active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const handlePracticeCustomPool = useCallback(
    (pool: MCQQuestion[], label: string) => {
           try {
        const cleanedPool = (Array.isArray(pool) ? pool : [])
          .filter((q) => Boolean(q))
          .map((q, idx) => ({
            ...q,
            id: String(q.id || `custom_q_${Date.now()}_${idx}`),
            subject:
              q.subject === 'Physics' ||
              q.subject === 'Chemistry' ||
              q.subject === 'Botany' ||
              q.subject === 'Zoology'
                ? q.subject
                : 'Botany',
            chapter: String(q.chapter || label || 'Custom Chapter'),
            topic: String(q.topic || 'AI Studio'),
            difficulty:
              q.difficulty === 'Easy' || q.difficulty === 'Medium' || q.difficulty === 'Hard'
                ? q.difficulty
                : 'Medium',
            question_hi: String(q.question_hi || q.question_en || `प्रश्न ${idx + 1}`),
            question_en: String(q.question_en || q.question_hi || `Question ${idx + 1}`),
            options_hi:
              Array.isArray(q.options_hi) && q.options_hi.length === 4
                ? q.options_hi.map((o) => String(o || ''))
                : ['विकल्प 1', 'विकल्प 2', 'विकल्प 3', 'विकल्प 4'],
            options_en:
              Array.isArray(q.options_en) && q.options_en.length === 4
                ? q.options_en.map((o) => String(o || ''))
                : ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
            correctIndex:
              typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
                ? q.correctIndex
                : 0,
            explanation_hi: String(q.explanation_hi || 'स्पष्टीकरण उपलब्ध नहीं है।'),
            explanation_en: String(q.explanation_en || 'Explanation not available.'),
            isStarred: Boolean(q.isStarred),
            isSaved: Boolean(q.isSaved),
            createdAt: typeof q.createdAt === 'number' ? q.createdAt : Date.now(),
          }));

        if (cleanedPool.length === 0) {
          try {
            if (typeof showToast === 'function') showToast('चलाने के लिए कोई प्रश्न उपलब्ध नहीं है।', 'error');
          } catch {}
          return;
        }

        const drillConfig: QuizConfig = {
          ...DEFAULT_QUIZ_CONFIG,
          subject: 'All',
          chapters: [String(label || 'Custom Pool')],
          sourceMode: 'bank',
          questionCount: cleanedPool.length,
          revealMode: 'practice',
          layoutMode: 'scroll',
          scoringMode: 'neet',
          languageMode: 'hindi_only',
          timerMinutes: Math.max(5, Math.ceil(cleanedPool.length * 1.2)),
          untimed: false,
        };

        const allInUnified = cleanedPool.every((q) => Boolean(unifiedQuestionsMap[q.id]));
        launchQuizSession(cleanedPool, drillConfig, { overrideList: !allInUnified });
      } catch (err) {
        console.error('Custom pool launch error:', err);
        try {
          if (typeof showToast === 'function') {
            showToast('लाइव क्विज़ शुरू करने में दिक्कत आई, कृपया दोबारा प्रयास करें।', 'error');
          }
        } catch {}
      }
    },
    [launchQuizSession, unifiedQuestionsMap, showToast]
  );
 

  const handleCheckpointUpdate = useCallback(
    (answers: Record<string, number>, currentIndex: number, remainingSeconds: number) => {
      if (activeQuizQuestions.length === 0) return;
      const cp: QuizCheckpoint = {
        id: 'active',
        config: activeQuizConfig,
        questionIds: activeQuizQuestions.map((q) => q.id),
        answers,
        currentIndex,
        remainingSeconds,
        startedAt: checkpoint?.startedAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      void db.quizCheckpoints.put(cp).then(() => setCheckpoint(cp));
    },
    [activeQuizQuestions, activeQuizConfig, checkpoint?.startedAt]
  );

  const handleResumeCheckpoint = useCallback(async () => {
    if (!checkpoint) return;
    const unifiedMap = await getUnifiedQuestionMap();
    const resolved = checkpoint.questionIds
      .map((id) => unifiedMap[id])
      .filter((q): q is UnifiedQuestionItem => Boolean(q));
    if (resolved.length === 0) {
      await db.quizCheckpoints.delete('active');
      setCheckpoint(null);
      showToast('Saved quiz questions are no longer in database.', 'info');
      return;
    }
    launchQuizSession(resolved, checkpoint.config, {
      initialAnswers: checkpoint.answers,
      initialIndex: checkpoint.currentIndex,
      remainingSeconds: checkpoint.remainingSeconds,
    });
  }, [checkpoint, launchQuizSession, showToast]);

  const handleDiscardCheckpoint = useCallback(async () => {
    await db.quizCheckpoints.delete('active');
    setCheckpoint(null);
    showToast('Unfinished quiz checkpoint discarded.', 'info');
  }, [showToast]);

    const handleSubmitQuiz = useCallback(
    async (answers: Record<string, number>, submissionType: 'manual' | 'auto') => {
      try {
        const rawQs =
          activeQuizQuestions.length > 0
            ? activeQuizQuestions
            : activeQuizQuestionsOverride || [];

        if (rawQs.length === 0) {
          showToast('सबमिट करने के लिए कोई सक्रिय प्रश्न नहीं मिला।', 'error');
          return;
        }

        const safeQs: MCQQuestion[] = rawQs.map((q: any, idx: number) => ({
          ...q,
          id: String(q?.id || `sub_q_${Date.now()}_${idx}`),
          subject:
            q?.subject === 'Physics' ||
            q?.subject === 'Chemistry' ||
            q?.subject === 'Botany' ||
            q?.subject === 'Zoology'
              ? q.subject
              : 'Botany',
          chapter: String(q?.chapter || 'NCERT Practice'),
          topic: String(q?.topic || q?.chapter || 'General'),
          difficulty:
            q?.difficulty === 'Easy' ||
            q?.difficulty === 'Medium' ||
            q?.difficulty === 'Hard'
              ? q.difficulty
              : 'Medium',
          question_hi: String(q?.question_hi || q?.question_en || `प्रश्न ${idx + 1}`),
          question_en: String(q?.question_en || q?.question_hi || `Question ${idx + 1}`),
          options_hi:
            Array.isArray(q?.options_hi) && q.options_hi.length === 4
              ? q.options_hi.map((o: any) => String(o ?? ''))
              : ['विकल्प A', 'विकल्प B', 'विकल्प C', 'विकल्प D'],
          options_en:
            Array.isArray(q?.options_en) && q.options_en.length === 4
              ? q.options_en.map((o: any) => String(o ?? ''))
              : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctIndex:
            typeof q?.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
              ? q.correctIndex
              : typeof q?.correct_index === 'number' &&
                q.correct_index >= 0 &&
                q.correct_index <= 3
              ? q.correct_index
              : 0,
          explanation_hi: String(q?.explanation_hi || 'NCERT के अनुसार सही उत्तर देखें।'),
          explanation_en: String(q?.explanation_en || 'Check the correct NCERT explanation.'),
          isStarred: Boolean(q?.isStarred),
          isSaved: Boolean(q?.isSaved),
          createdAt: typeof q?.createdAt === 'number' ? q.createdAt : Date.now(),
        }));

        const summary = evaluateQuizPerformance({
          id: `res-${Date.now()}`,
          config: activeQuizConfig,
          questions: safeQs,
          answers: answers || {},
          submissionType,
        });

        setLatestResult(summary);
        setLatestResultQuestions(safeQs);
        setRoute('quiz-result');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        void (async () => {
          try {
            await db.quizHistory.put(summary);
          } catch {}
          try {
            await recordQuizMistakes(safeQs, answers || {});
          } catch {}
          try {
            await db.quizCheckpoints.delete('active');
            setCheckpoint(null);
          } catch {}
          try {
            await refreshAllData();
          } catch {}
          try {
            void studentFeatures.recordQuizInLeaderboard(summary);
          } catch {}
        })();
      } catch (err) {
        console.error('Submit quiz crash prevented:', err);
        showToast('परिणाम तैयार करने में त्रुटि आई, कृपया पुनः सबमिट दबाएं।', 'error');
      }
    },
    [
      activeQuizQuestions,
      activeQuizQuestionsOverride,
      activeQuizConfig,
      refreshAllData,
      showToast,
      studentFeatures,
    ]
  );

  

  const handleReattemptLatest = useCallback(() => {
    if (!latestResult || latestResultQuestions.length === 0) return;
    const allInUnified = latestResultQuestions.every((q) => Boolean(unifiedQuestionsMap[q.id]));
    launchQuizSession(latestResultQuestions, latestResult.config, {
      overrideList: !allInUnified,
    });
  }, [latestResult, latestResultQuestions, unifiedQuestionsMap, launchQuizSession]);

  /* ==================== ROLLING 500+ MCQ BATCH ENGINE (ADMIN ONLY) ==================== */
  const persistPendingJobState = useCallback(
    (
      job: RollingJobContext,
      targetCount: number,
      batchSize: number,
      nextBatchIndex: number,
      totalBatches: number
    ) => {
      const pending: PendingBatchJob = {
        config: job.config,
        targetCount,
        batchSize,
        nextBatchIndex,
        totalBatches,
        generatedQuestionIds: [...batchGeneratedIdsRef.current],
        coveredConcepts: [...batchCoveredRef.current],
        moduleId: job.moduleId,
        updatedAt: Date.now(),
      };
      savePendingBatchJob(pending);
      setPendingBatchJob(pending);
    },
    []
  );

  const runBatchLoop = useCallback(
    async (startBatchIndex: number) => {
      if (role !== 'admin') return;
      const job = batchJobRef.current;
      if (!job) return;

      const targetCount = Math.min(MAX_SINGLE_RUN_QUESTIONS, Math.max(1, job.config.questionCount));
      const batchSize = Math.min(MCQ_BATCH_SIZE, targetCount);
      const totalBatches = Math.max(1, Math.ceil(targetCount / batchSize));

      batchStoppedRef.current = false;
      batchPausedRef.current = false;

      const existingConceptSet = new Set(batchCoveredRef.current.map((c) => c.toLowerCase()));
      const existingStems = batchStemsRef.current;

      setBatchProgress((prev) => ({
        ...prev,
        status: 'running',
        targetCount,
        totalBatches,
        generatedCount: batchGeneratedIdsRef.current.length,
        generatedQuestionIds: [...batchGeneratedIdsRef.current],
        coveredConcepts: [...batchCoveredRef.current],
        failedBatchIndex: null,
        errorMessage: null,
        activeNotice: `Using ${settings.modelId} (${settings.thinkingLevel.toUpperCase()} thinking · ${batchSize}/batch)`,
      }));

      persistPendingJobState(job, targetCount, batchSize, startBatchIndex, totalBatches);

      for (let b = startBatchIndex; b < totalBatches; b++) {
        // Wait while paused
        while (batchPausedRef.current && !batchStoppedRef.current) {
          await new Promise((r) => window.setTimeout(r, 250));
        }
        if (batchStoppedRef.current) {
          persistPendingJobState(job, targetCount, batchSize, b, totalBatches);
          setBatchProgress((prev) => ({
            ...prev,
            status: 'stopped',
            activeNotice: `Stopped safely with ${prev.generatedCount} MCQs preserved in IndexedDB.`,
          }));
          return;
        }

        const remainingNeeded = targetCount - batchGeneratedIdsRef.current.length;
        if (remainingNeeded <= 0) break;

        const currentRequestCount = Math.min(batchSize, remainingNeeded);

        // Slice uploaded PDF/image pages into chunks of 3–5 pages per call
        let chunkPages = undefined;
        if (job.bundle && job.bundle.pages.length > 0) {
          const pagesPerChunk = 4;
          const totalChunks = Math.max(1, Math.ceil(job.bundle.pages.length / pagesPerChunk));
          const chunkIdx = b % totalChunks;
          chunkPages = job.bundle.pages.slice(
            chunkIdx * pagesPerChunk,
            (chunkIdx + 1) * pagesPerChunk
          );
        }

        setBatchProgress((prev) => ({
          ...prev,
          status: 'running',
          currentBatch: b + 1,
          totalBatches,
          activeNotice: chunkPages
            ? `Batch ${b + 1}/${totalBatches}: Analyzing pages ${chunkPages[0]?.pageNumber}–${chunkPages[chunkPages.length - 1]?.pageNumber}...`
            : `Batch ${b + 1}/${totalBatches}: Generating ${currentRequestCount} unique Hindi NCERT MCQs...`,
        }));

        const controller = new AbortController();
        batchAbortRef.current = controller;

        try {
          const { questions: batchQs, usedBackupKey } = await generateMCQBatch({
            settings,
            config: job.config,
            batchIndex: b,
            batchSize: currentRequestCount,
            coveredConcepts: batchCoveredRef.current,
            chunkPages,
            sourceModuleId: job.moduleId,
            signal: controller.signal,
          });

          const uniqueBatch = deduplicateQuestions(batchQs, existingConceptSet, existingStems);
          if (uniqueBatch.length > 0) {
            await db.questions.bulkPut(uniqueBatch);
            if (isSupabaseConfigured(settings)) {
              void upsertCloudQuestions(settings, uniqueBatch).catch(() => {});
            }
            if (job.moduleId) {
              const mod = await db.modules.get(job.moduleId);
              if (mod) {
                mod.generatedCounts.mcqs += uniqueBatch.length;
                await db.modules.put(mod);
                if (isSupabaseConfigured(settings)) {
                  void upsertCloudModule(settings, mod).catch(() => {});
                }
              }
            }
            for (const q of uniqueBatch) {
              batchGeneratedIdsRef.current.push(q.id);
              if (q.concept_key) batchCoveredRef.current.push(q.concept_key);
            }
            await refreshAllData();
          }

          persistPendingJobState(job, targetCount, batchSize, b + 1, totalBatches);

          setBatchProgress((prev) => ({
            ...prev,
            generatedCount: batchGeneratedIdsRef.current.length,
            generatedQuestionIds: [...batchGeneratedIdsRef.current],
            coveredConcepts: [...batchCoveredRef.current],
            activeNotice: usedBackupKey
              ? `Batch ${b + 1} succeeded via Backup API Key (429 fallback).`
              : `Saved ${batchGeneratedIdsRef.current.length} / ${targetCount} unique Hindi MCQs.`,
          }));

          // Cooldown guard between batches to avoid free-tier RPM spikes
          if (b < totalBatches - 1 && !batchStoppedRef.current) {
            const cooldownMs = Math.max(500, Math.round(settings.batchCooldownSec * 1000));
            setBatchProgress((prev) => ({
              ...prev,
              activeNotice: `Quota guard cooldown (${settings.batchCooldownSec}s) before Batch ${b + 2}...`,
            }));
            await new Promise((r) => window.setTimeout(r, cooldownMs));
          }
        } catch (err) {
          if (batchStoppedRef.current) {
            persistPendingJobState(job, targetCount, batchSize, b, totalBatches);
            setBatchProgress((prev) => ({
              ...prev,
              status: 'stopped',
              activeNotice: `Stopped safely with ${batchGeneratedIdsRef.current.length} MCQs saved.`,
            }));
            return;
          }
          persistPendingJobState(job, targetCount, batchSize, b, totalBatches);
          const msg = err instanceof Error ? err.message : 'Unknown Gemini API error';
          setBatchProgress((prev) => ({
            ...prev,
            status: 'error',
            failedBatchIndex: b,
            errorMessage: msg,
            activeNotice: null,
          }));
          return;
        }
      }

      savePendingBatchJob(null);
      setPendingBatchJob(null);
      setBatchProgress((prev) => ({
        ...prev,
        status: 'completed',
        activeNotice: `All ${batchGeneratedIdsRef.current.length} unique Hindi NCERT MCQs saved to IndexedDB!`,
      }));
      showToast(
        `Generation complete: ${batchGeneratedIdsRef.current.length} Hindi NCERT MCQs ready!`,
        'success'
      );
    },
    [role, settings, refreshAllData, showToast, persistPendingJobState]
  );

  const handleStartRollingGeneration = useCallback(
    (config: QuizConfig, uploadBundle: ProcessedUploadBundle | null, moduleId?: string) => {
      if (role !== 'admin') return;
      const clampedTarget = Math.min(MAX_SINGLE_RUN_QUESTIONS, Math.max(1, config.questionCount));
      const safeConfig: QuizConfig = { ...config, questionCount: clampedTarget };
      const batchSize = Math.min(MCQ_BATCH_SIZE, clampedTarget);

      batchJobRef.current = { config: safeConfig, bundle: uploadBundle, moduleId };
      batchGeneratedIdsRef.current = [];
      batchCoveredRef.current = [];
      batchStemsRef.current = new Set(
        questions.map((q) => q.question_hi.trim().replace(/\s+/g, ' ').toLowerCase())
      );

      setBatchProgress({
        ...INITIAL_BATCH_PROGRESS,
        status: 'running',
        targetCount: clampedTarget,
        totalBatches: Math.max(1, Math.ceil(clampedTarget / batchSize)),
      });

      void runBatchLoop(0);
    },
    [role, questions, runBatchLoop]
  );

  const handleResumePendingBatchJob = useCallback(async () => {
    if (role !== 'admin' || !pendingBatchJob) return;
    if (!settings.apiKey.trim()) {
      showToast('Configure your Gemini API key in Settings (⚙️) to resume generation.', 'error');
      setSettingsInitialTab('gemini');
      setSettingsOpen(true);
      return;
    }

    let restoredBundle: ProcessedUploadBundle | null = null;
    if (pendingBatchJob.moduleId) {
      restoredBundle = await loadModuleBundle(pendingBatchJob.moduleId);
    }

    batchJobRef.current = {
      config: pendingBatchJob.config,
      bundle: restoredBundle,
      moduleId: pendingBatchJob.moduleId,
    };
    batchGeneratedIdsRef.current = [...pendingBatchJob.generatedQuestionIds];
    batchCoveredRef.current = [...pendingBatchJob.coveredConcepts];
    batchStemsRef.current = new Set(
      questions.map((q) => q.question_hi.trim().replace(/\s+/g, ' ').toLowerCase())
    );

    setQuizConfig(pendingBatchJob.config);
    setBatchProgress({
      ...INITIAL_BATCH_PROGRESS,
      status: 'running',
      targetCount: pendingBatchJob.targetCount,
      generatedCount: pendingBatchJob.generatedQuestionIds.length,
      currentBatch: pendingBatchJob.nextBatchIndex + 1,
      totalBatches: pendingBatchJob.totalBatches,
      generatedQuestionIds: [...pendingBatchJob.generatedQuestionIds],
      coveredConcepts: [...pendingBatchJob.coveredConcepts],
    });

    void runBatchLoop(pendingBatchJob.nextBatchIndex);
  }, [role, pendingBatchJob, settings.apiKey, questions, runBatchLoop, showToast]);

  const handleDismissPendingBatchJob = useCallback(() => {
    savePendingBatchJob(null);
    setPendingBatchJob(null);
    showToast('Dismissed interrupted generation banner. Saved MCQs remain in IndexedDB.', 'info');
  }, [showToast]);

  const handleLaunchEarlyGeneratedQuiz = useCallback(() => {
    const job = batchJobRef.current;
    const ids = batchGeneratedIdsRef.current;
    const readyQs = ids
      .map((id) => unifiedQuestionsMap[id])
      .filter((q): q is UnifiedQuestionItem => Boolean(q));
    if (readyQs.length === 0) return;

    launchQuizSession(readyQs, job?.config ?? quizConfig, {
      usesBatchStream: true,
    });
  }, [unifiedQuestionsMap, quizConfig, launchQuizSession]);

  const handleLaunchMcqGenerationFromModule = useCallback(
    (params: {
      subject: SubjectName;
      chapter: string;
      count: number;
      bundle: ProcessedUploadBundle;
      moduleId: string;
    }) => {
      if (role !== 'admin') return;
      const nextCfg: QuizConfig = {
        ...quizConfig,
        subject: params.subject,
        chapters: [params.chapter],
        sourceMode: 'upload',
        questionCount: params.count,
        deepNcertExpansion: params.count >= 200,
      };
      setQuizConfig(nextCfg);
      setRoute('quiz-setup');
      handleStartRollingGeneration(nextCfg, params.bundle, params.moduleId);
    },
    [role, quizConfig, handleStartRollingGeneration]
  );

  const handleMarkMistakeMastered = useCallback(
    async (questionId: string, mastered: boolean) => {
      await db.mistakes.update(questionId, { mastered, updatedAt: Date.now() });
      await refreshAllData();
      showToast(
        mastered
          ? 'Marked as ✅ Mastered and cleared from active mistakes.'
          : 'Moved back to Mistake Bank.',
        'success'
      );
    },
    [refreshAllData, showToast]
  );

  const openGeminiSettingsGuarded = useCallback(() => {
    if (role !== 'admin') return;
    setSettingsInitialTab('gemini');
    setSettingsOpen(true);
  }, [role]);

  const openCloudSetup = useCallback(() => {
    setSettingsInitialTab('cloud');
    setSettingsOpen(true);
  }, []);

  const openRulesGuarded = useCallback(() => {
    if (role !== 'admin') return;
    setRulesOpen(true);
  }, [role]);

  return (
    <GlobalSafeErrorBoundary>

    <div className="min-h-screen obsidian-backdrop bg-[#F4F6FA] dark:bg-[#0B0E14] text-[#0F172A] dark:text-[#F1F5F9] transition-colors duration-150 flex flex-col">
      {/* Persistent Top Header Bar */}
      <TopBar
        settings={settings}
        role={role}
        adminEmail={adminEmail}
        cloudSyncStatus={cloudSyncStatus}
        mistakeCount={stats.mistakesCount}
        currentRoute={route}
        onNavigateHome={() => setRoute('home')}
        onOpenMistakes={() => setRoute('mistakes')}
        onOpenSettings={openGeminiSettingsGuarded}
        onOpenRules={openRulesGuarded}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenDrawer={() => setDrawerOpen(true)}
        onAdminLogout={() => void handleAdminLogout()}
        onToggleTheme={() =>
          updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
        }
        onAdjustFont={handleAdjustFont}
        onLogoTap={() => setShowSecretHub(true)}

      />
{route !== 'home' && (
  <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-3 pt-2.5 sm:px-4">
    <button
      type="button"
      onClick={() => setRoute('home')}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:bg-indigo-600 hover:text-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Home
    </button>

    <div className="flex items-center gap-2">
      
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/15 px-2.5 py-1 text-xs font-extrabold text-orange-600 dark:text-orange-300">
        <Flame className="w-3.5 h-3.5 text-orange-500" /> {globalStreak}d
      </span>
    </div>
  </div>
)}

      {/* Main Centered Compact Container */}
      <main className="flex-1 w-full mx-auto max-w-3xl px-3 sm:px-4 pt-3.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={route}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {route === 'home' && (
            <>
                                <div className="mb-2.5 flex items-center justify-between rounded-2xl border border-indigo-500/30 bg-indigo-950/40 px-3.5 py-2">
                    <div className="text-xs font-extrabold text-indigo-200">
                      ✨ AI Custom Quiz & PDF Folder Studio (100% Local)
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAiStudio(true)}
                      className="rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow hover:opacity-95"
                    >
                      Open AI Studio
                    </button>
                  </div>

            <NeetCountdownAndFreezeBar streak={globalStreak} onToast={showToast} />
                              {/* Pro Student & Admin Quick Command Bar: DND Focus Timer + Relax 4-Q Booster + Instant Mock Drill */}
                <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* 1. DND 25m / Custom Focus Timer */}
                  <button
                    type="button"
                    onClick={() => {
                      const raw = window.prompt(
                        '🔕 DND Deep Focus Timer (मिनट डालें: 25, 45, 60 या कोई भी Custom समय):',
                        '25'
                      );
                      if (!raw) return;
                      const mins = Math.max(1, Math.min(240, Number(raw) || 25));
                      try {
                        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                          void document.documentElement.requestFullscreen().catch(() => {});
                        }
                      } catch {}
                      const endAt = Date.now() + mins * 60 * 1000;
                      localStorage.setItem('neet2027_dnd_end_at', String(endAt));
                      showToast(
                        `🔕 DND Focus Mode सक्रिय (${mins} मिनट)! Fullscreen चालू है—अब पूरे फोकस से पढ़ाई करें।`,
                        'success'
                      );
                    }}
                    className="flex flex-col justify-between rounded-2xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-left transition hover:bg-amber-500/20 active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-300">🔕 DND Focus</span>
                      <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-200">
                        25m+
                      </span>
                    </div>
                    <span className="mt-1 text-[10px] text-amber-100/80">
                      Custom Timer + Fullscreen
                    </span>
                  </button>

                  {/* 2. Relax & Motivate Mode (4 Quick Confidence Booster MCQs) */}
                  <button
                    type="button"
                    onClick={async () => {
                      let pool = questions.length > 0 ? questions : await db.questions.toArray();
                      if (pool.length === 0) {
                        await ensureStarterSeeded();
                        pool = await db.questions.toArray();
                      }
                      const easyFirst = pool.filter((q) => q.difficulty === 'Easy');
                      const source = easyFirst.length >= 4 ? easyFirst : pool;
                      const fourQs = [...source].sort(() => Math.random() - 0.5).slice(0, 4);
                      if (fourQs.length === 0) {
                        showToast('प्रश्न बैंक तैयार हो रहा है, 2 सेकंड बाद पुनः दबाएं।', 'info');
                        return;
                      }
                      handlePracticeCustomPool(fourQs, '🌿 Relax & Motivate Booster (4 MCQs)');
                    }}
                    className="flex flex-col justify-between rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-2.5 text-left transition hover:bg-emerald-500/20 active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-300">🌿 Relax Boost</span>
                      <span className="rounded bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-200">
                        4 Qs ⚡
                      </span>
                    </div>
                    <span className="mt-1 text-[10px] text-emerald-100/80">
                      Instant Confidence Drill
                    </span>
                  </button>

                  {/* 3. Instant 1-Click Mock Drill (Zero No-Response Guarantee) */}
                  <button
                    type="button"
                    onClick={async () => {
                      let pool = questions.length > 0 ? questions : await db.questions.toArray();
                      if (pool.length === 0) {
                        await ensureStarterSeeded();
                        pool = await db.questions.toArray();
                      }
                      const drillQs = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(20, pool.length));
                      if (drillQs.length === 0) {
                        setRoute('quiz-setup');
                        return;
                      }
                      handlePracticeCustomPool(drillQs, `⚡ Instant NEET Mock Drill (${drillQs.length} MCQs)`);
                    }}
                    className="flex flex-col justify-between rounded-2xl border border-sky-500/35 bg-sky-500/10 p-2.5 text-left transition hover:bg-sky-500/20 active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-sky-300">⚡ Mock Drill</span>
                      <span className="rounded bg-sky-500/25 px-1.5 py-0.5 text-[9px] font-extrabold text-sky-200">
                        Live
                      </span>
                    </div>
                    <span className="mt-1 text-[10px] text-sky-100/80">
                      1-Tap 20 MCQ Rapid Test
                    </span>
                  </button>

                  {/* 4. Secret Pro Vault */}
                  <button
                    type="button"
                    onClick={() => setShowSecretHub(true)}
                    className="flex flex-col justify-between rounded-2xl border border-purple-500/35 bg-purple-500/10 p-2.5 text-left transition hover:bg-purple-500/20 active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-purple-300">🔐 Pro Vault</span>
                      <span className="rounded bg-purple-500/25 px-1.5 py-0.5 text-[9px] font-extrabold text-purple-200">
                        VIP
                      </span>
                    </div>
                    <span className="mt-1 text-[10px] text-purple-100/80">
                      Secret Tools & Modes
                    </span>
                  </button>
                </div>

<SmartRevisionAndOmrWidget
  mistakes={mistakes}
  unifiedQuestionsMap={unifiedQuestionsMap}
  onLaunchPool={(qs, label) => handlePracticeCustomPool(qs, label)}
/>

              <HomeHub
                creatorName={settings.creatorName}
                role={role}
                stats={stats}
                checkpoint={checkpoint}
                openSuggestionsCount={openSuggestionsCount}
                openReportsCount={openReportsCount}
                onNavigate={(r) => setRoute(r)}
                onOpenSuggestion={() => setSuggestionModalOpen(true)}
                onResumeCheckpoint={() => void handleResumeCheckpoint()}
                onDiscardCheckpoint={() => void handleDiscardCheckpoint()}
              />
              </>
            )}

            {route === 'quiz-setup' && (
              <QuizSetup
                role={role}
                settings={settings}
                allQuestions={questions}
                customSubjects={customSubjects}
                config={quizConfig}
                onChangeConfig={setQuizConfig}
                onAddCustomSubject={handleAddCustomSubject}
                onStartFromBank={(selectedQs, cfg) => launchQuizSession(selectedQs, cfg)}
                onStartRollingGeneration={(cfg, bundle, moduleId) =>
                  handleStartRollingGeneration(cfg, bundle, moduleId)
                }
                batchProgress={batchProgress}
                pendingBatchJob={pendingBatchJob}
                onResumePendingBatchJob={() => void handleResumePendingBatchJob()}
                onDismissPendingBatchJob={handleDismissPendingBatchJob}
                onPauseBatch={() => {
                  batchPausedRef.current = true;
                  setBatchProgress((p) => ({ ...p, status: 'paused' }));
                }}
                onResumeBatch={() => {
                  batchPausedRef.current = false;
                  setBatchProgress((p) => ({ ...p, status: 'running' }));
                }}
                onStopBatch={() => {
                  batchStoppedRef.current = true;
                  batchPausedRef.current = false;
                  batchAbortRef.current?.abort();
                }}
                onRetryFailedBatch={() => {
                  if (batchProgress.failedBatchIndex !== null) {
                    void runBatchLoop(batchProgress.failedBatchIndex);
                  }
                }}
                onLaunchEarlyGeneratedQuiz={handleLaunchEarlyGeneratedQuiz}
                onOpenSettings={openGeminiSettingsGuarded}
                onBackHome={() => setRoute('home')}
                onToast={showToast}
              />
            )}

            {route === 'quiz-active' && (
              <ActiveQuiz
                questions={activeQuizQuestions}
                config={activeQuizConfig}
                initialAnswers={activeInitialAnswers}
                initialIndex={activeInitialIndex}
                initialRemainingSeconds={activeInitialSeconds}
                settings={settings}
                batchProgress={batchProgress}
                onCheckpointUpdate={handleCheckpointUpdate}
                onToggleStar={(id) => void handleToggleQuestionStar(id)}
                onToggleSave={(id) => void handleToggleQuestionSave(id)}
                onReportQuestion={(q) => setReportTargetQuestion(q)}
                onSubmitQuiz={(ans, type) => void handleSubmitQuiz(ans, type)}
                onToast={showToast}
              />
            )}

            {route === 'quiz-result' && latestResult && (
              <QuizResult
                result={latestResult}
                questions={latestResultQuestions.map((q) => unifiedQuestionsMap[q.id] ?? q)}
                settings={settings}
                onReattempt={handleReattemptLatest}
                onFinishHome={() => setRoute('home')}
                onToggleStar={(id) => void handleToggleQuestionStar(id)}
                onToggleSave={(id) => void handleToggleQuestionSave(id)}
                onReportQuestion={(q) => setReportTargetQuestion(q)}
                onToast={showToast}
              />
            )}

            {route === 'notes' && (
              <NotesView
                role={role}
                settings={settings}
                customSubjects={customSubjects}
                notes={notes}
                onRefreshData={refreshAllData}
                onOpenSettings={openGeminiSettingsGuarded}
                onBackHome={() => setRoute('home')}
                onToast={showToast}
              />
            )}

            {route === 'short-notes' && (
              <ShortNotesView
                role={role}
                settings={settings}
                customSubjects={customSubjects}
                shortNotes={shortNotes}
                onRefreshData={refreshAllData}
                onOpenSettings={openGeminiSettingsGuarded}
                onBackHome={() => setRoute('home')}
                onToast={showToast}
              />
            )}

            {route === 'pyqs' && (
              <PYQsView
                role={role}
                settings={settings}
                customSubjects={customSubjects}
                pyqs={pyqs}
                onRefreshData={refreshAllData}
                onPracticeQuestions={handlePracticeCustomPool}
                onReportQuestion={(q) => setReportTargetQuestion(q)}
                onOpenSettings={openGeminiSettingsGuarded}
                onBackHome={() => setRoute('home')}
                onToast={showToast}
              />
            )}

            {route === 'special' && (
              <SpecialView
                role={role}
                settings={settings}
                customSubjects={customSubjects}
                specials={specials}
                onRefreshData={refreshAllData}
                onOpenSettings={openGeminiSettingsGuarded}
                onBackHome={() => setRoute('home')}
                onToast={showToast}
              />
            )}

            {route === 'modules' && (
              <ModulesStudio
                role={role}
                settings={settings}
                modules={modules}
                customSubjects={customSubjects}
                onRefreshData={refreshAllData}
                onLaunchMcqGenerationFromModule={handleLaunchMcqGenerationFromModule}
                onNavigate={(r) => setRoute(r)}
                onOpenSettings={openGeminiSettingsGuarded}
                onBackHome={() => setRoute('home')}
                onToast={showToast}
              />
            )}

            {route === 'star' && (
              <StarVaultView
                questions={questions}
                notes={notes}
                shortNotes={shortNotes}
                pyqs={pyqs}
                specials={specials}
                modules={modules}
                onPracticeQuestions={handlePracticeCustomPool}
                onToggleQuestionStar={(id) => void handleToggleQuestionStar(id)}
                onRefreshData={refreshAllData}
                onBackHome={() => setRoute('home')}
              />
            )}

            {route === 'save' && (
              <SaveVaultView
                questions={questions}
                pyqs={pyqs}
                onPracticeQuestions={handlePracticeCustomPool}
                onToggleQuestionSave={(id) => void handleToggleQuestionSave(id)}
                onBackHome={() => setRoute('home')}
              />
            )}

            {route === 'mistakes' && (
              <MistakeBank
                mistakes={mistakes}
                unifiedQuestionsMap={unifiedQuestionsMap}
                onMarkMastered={handleMarkMistakeMastered}
                onLaunchMistakeQuiz={(qs) => handlePracticeCustomPool(qs, 'Mistake Revision')}
                onBackHome={() => setRoute('home')}
              />
            )}

            {route === 'backup' && (
              <BackupManager
                role={role}
                creatorName={settings.creatorName}
                stats={stats}
                customSubjects={customSubjects}
                onRefreshData={refreshAllData}
                onClearCloud={handleClearCloud}
                onBackHome={() => setRoute('home')}
                onToast={showToast}
              />
            )}

            {route === 'suggestions' &&
              (role === 'admin' ? (
                <SuggestionsInboxView
                  settings={settings}
                  suggestions={suggestions}
                  onRefreshSuggestions={refreshSuggestions}
                  onBackHome={() => setRoute('home')}
                  onToast={showToast}
                />
              ) : (
                <HomeHub
                  creatorName={settings.creatorName}
                  role={role}
                  stats={stats}
                  checkpoint={checkpoint}
                  openSuggestionsCount={openSuggestionsCount}
                  openReportsCount={openReportsCount}
                  onNavigate={(r) => setRoute(r)}
                  onOpenSuggestion={() => setSuggestionModalOpen(true)}
                  onResumeCheckpoint={() => void handleResumeCheckpoint()}
                  onDiscardCheckpoint={() => void handleDiscardCheckpoint()}
                />
              ))}

            {route === 'reports' &&
              (role === 'admin' ? (
                <ReportsInboxView
                  settings={settings}
                  reports={questionReports}
                  unifiedQuestionsMap={unifiedQuestionsMap}
                  onRefreshReports={refreshQuestionReports}
                  onRefreshAllData={refreshAllData}
                  onBackHome={() => setRoute('home')}
                  onToast={showToast}
                />
              ) : (
                <HomeHub
                  creatorName={settings.creatorName}
                  role={role}
                  stats={stats}
                  checkpoint={checkpoint}
                  openSuggestionsCount={openSuggestionsCount}
                  openReportsCount={openReportsCount}
                  onNavigate={(r) => setRoute(r)}
                  onOpenSuggestion={() => setSuggestionModalOpen(true)}
                  onResumeCheckpoint={() => void handleResumeCheckpoint()}
                  onDiscardCheckpoint={() => void handleDiscardCheckpoint()}
                />
              ))}
                                  {route === 'leaderboard' && (
              <LeaderboardView
                currentStudent={studentFeatures.studentProfile}
                fetchLeaderboard={studentFeatures.fetchLeaderboardList}
                fetchGroupLeaderboard={studentFeatures.fetchGroupLeaderboard}
                createOrJoinGroup={studentFeatures.createOrJoinGroup}
              />
            )}


          {route === 'study-vault' && (
            <StudyVaultView
              isAdmin={role === 'admin'}
              loadVault={studentFeatures.loadStudyVaultData}
              onCreateFolder={studentFeatures.createVaultFolder}
              onDeleteFolder={studentFeatures.deleteVaultFolder}
              onCreateLink={studentFeatures.createVaultLink}
              onDeleteLink={studentFeatures.deleteVaultLink}
              onBack={() => setRoute('home')}
            />
          )}
            {route === 'community' && (
  <CommunityChatView
    currentStudent={studentFeatures.studentProfile}
    settings={settings}
    onRequireLogin={() => showToast('चैट करने के लिए पहले अपना Student Profile सेव करें।', 'info')}
  />
)}

</motion.div>
        </AnimatePresence>
      </main>

      {/* Slide-Out Side Drawer */}
      <SideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute={route}
        stats={stats}
        settings={settings}
        role={role}
        adminEmail={adminEmail}
        openSuggestionsCount={openSuggestionsCount}
        openReportsCount={openReportsCount}
        onNavigate={(r) => setRoute(r)}
        onOpenSettings={openGeminiSettingsGuarded}
        onOpenCloudSetup={openCloudSetup}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSuggestion={() => setSuggestionModalOpen(true)}
        onOpenAdminLogin={() => setAdminLoginOpen(true)}
        onAdminLogout={() => void handleAdminLogout()}
        onUpdateCreatorName={(name) => {
          if (role !== 'admin') return;
          updateSettings({ creatorName: name });
          showToast(`Workspace name updated to ${name}.`, 'success');
        }}
        onAdjustFont={handleAdjustFont}
        onOpenProfile={() => setShowMyProfile(true)}

      />

      {/* Settings & Cloud Sync Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        isAdmin={role === 'admin'}
        initialTab={settingsInitialTab}
        onUpdateSettings={updateSettings}
        onCloudConfigSaved={syncFromCloudAndCheckAdmin}
        onPushLibraryToCloud={handlePushLibraryToCloud}
        onToast={showToast}
      />

      {/* Admin-Only Custom AI Rules Modal */}
      {role === 'admin' && (
        <RulesModal
          isOpen={rulesOpen}
          onClose={() => setRulesOpen(false)}
          rules={settings.customRules}
          onSaveRules={(nextRules) => {
            updateSettings({ customRules: nextRules });
            showToast('Custom AI Rules saved and active for all Gemini calls.', 'success');
          }}
        />
      )}

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={adminLoginOpen}
        onClose={() => setAdminLoginOpen(false)}
        settings={settings}
        onOpenCloudSetup={openCloudSetup}
        onLoginSuccess={handleAdminAuthenticated}
        onToast={showToast}
      />

      {/* Student Suggestion & Feedback Modal */}
      <SuggestionModal
        isOpen={suggestionModalOpen}
        onClose={() => setSuggestionModalOpen(false)}
        settings={settings}
        onSubmitted={async () => {
          await refreshSuggestions();
        }}
        onToast={showToast}
      />

      {/* Question Report Modal (Students & Practice) */}
      <ReportQuestionModal
        question={reportTargetQuestion}
        onClose={() => setReportTargetQuestion(null)}
        settings={settings}
        onSubmitted={async (_report, savedToCloud) => {
          if (!savedToCloud || role === 'admin') {
            await refreshQuestionReports();
          }
        }}
        onToast={showToast}
      />

      {/* Help & Contact Us Modal */}
      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        isAdmin={role === 'admin'}
        onOpenSuggestion={() => setSuggestionModalOpen(true)}
        onToast={showToast}
      />
      {!studentFeatures.studentProfile && role !== 'admin' && (
        <StudentOnboardingModal
  isOpen={needsFullOnboarding}
  settings={settings}
  onComplete={(prof) => {
    studentFeatures.saveStudentProfile(prof);
    setNeedsFullOnboarding(false);
  }}
/>

      )}
<FloatingAiAssistant settings={settings} />


<SecretVaultModal
  isOpen={showSecretHub}
  onClose={() => setShowSecretHub(false)}
  currentStudent={studentFeatures.studentProfile}
  settings={settings}
    onRequireLogin={() => {
    setShowSecretHub(false);
    setRoute('home');
  }}

/>
      <StudentProfileModal
        isOpen={showMyProfile}
        onClose={() => setShowMyProfile(false)}
        student={studentFeatures.studentProfile}
        streak={globalStreak}
        settings={settings}
      />
                    {showAiStudio && (
          <AiQuizStudioModal
            isOpen={showAiStudio}
            onClose={() => setShowAiStudio(false)}
            isAdmin={role === 'admin'}
             supabaseClient={role === 'admin' ? getSupabaseClient(settings) : undefined}

            onToast={(msg, tone) => {
              try {
                if (typeof showToast === 'function') showToast(msg, tone);
              } catch {}
            }}
            onSaveToChapterBank={async (subj, chap, qs) => {
              try {
                const now = Date.now();
                const dbRows: MCQQuestion[] = qs.map((q: any, idx: number) => ({
                  ...q,
                  id: String(q.id || `studio_${now}_${idx}`),
                  subject: subj as SubjectName,
                  chapter: chap,
                  correctIndex:
                    typeof q.correctIndex === 'number'
                      ? q.correctIndex
                      : typeof q.correct_index === 'number'
                      ? q.correct_index
                      : 0,
                  createdAt: now - idx,
                }));
                await db.questions.bulkPut(dbRows);
                await refreshAllData();
                if (typeof showToast === 'function') {
                  showToast(
                    `✅ ${subj} • ${chap} के मुख्य Question Bank में ${dbRows.length} प्रश्न स्थायी रूप से जुड़ गए!`,
                    'success'
                  );
                }
              } catch {}
            }}
            onStartLiveAttempt={(qs, cfg) => {
              setShowAiStudio(false);
              window.setTimeout(() => {

              try {
                const rawList = Array.isArray(qs) ? qs : [];
                const safeQs: MCQQuestion[] = rawList.map((item: any, idx: number) => {
                  const subStr = String(item?.subject || 'Botany');
                  const validSubject: 'Physics' | 'Chemistry' | 'Botany' | 'Zoology' =
                    subStr === 'Physics' ||
                    subStr === 'Chemistry' ||
                    subStr === 'Botany' ||
                    subStr === 'Zoology'
                      ? subStr
                      : 'Botany';

                  const rawOptsHi = Array.isArray(item?.options_hi) ? item.options_hi : [];
                  const optionsHi = [0, 1, 2, 3].map((i) =>
                    String(rawOptsHi[i] ?? `विकल्प ${['A', 'B', 'C', 'D'][i]}`)
                  );

                  const rawOptsEn = Array.isArray(item?.options_en) ? item.options_en : [];
                  const optionsEn = [0, 1, 2, 3].map((i) =>
                    String(rawOptsEn[i] ?? `Option ${['A', 'B', 'C', 'D'][i]}`)
                  );

                  const corr =
                    typeof item?.correctIndex === 'number' &&
                    item.correctIndex >= 0 &&
                    item.correctIndex <= 3
                      ? item.correctIndex
                      : 0;

                  const diffStr = String(item?.difficulty || 'Medium');
                  const validDiff: 'Easy' | 'Medium' | 'Hard' =
                    diffStr === 'Easy' || diffStr === 'Medium' || diffStr === 'Hard'
                      ? diffStr
                      : 'Medium';

                  return {
                    id: String(item?.id || `local_live_${Date.now()}_${idx}`),
                    subject: validSubject,
                    chapter: String(item?.chapter || 'General Chapter'),
                    topic: String(item?.topic || 'AI Studio Custom'),
                    difficulty: validDiff,
                    question_hi: String(
                      item?.question_hi || item?.question_en || `अभ्यास प्रश्न ${idx + 1}`
                    ),
                    question_en: String(
                      item?.question_en || item?.question_hi || `Practice Question ${idx + 1}`
                    ),
                    options_hi: optionsHi,
                    options_en: optionsEn,
                    correctIndex: corr,
                    explanation_hi: String(
                      item?.explanation_hi || 'सही विकल्प का चयन करें।'
                    ),
                    explanation_en: String(
                      item?.explanation_en || 'Select the correct option.'
                    ),
                    isStarred: false,
                    isSaved: true,
                    createdAt: Date.now(),
                  };
                });

                const titleLabel = `${String(cfg?.title || 'AI Custom Quiz')} • ${String(
                  cfg?.quizType || 'Practice'
                )} (${Number(cfg?.durationMins) || 15}m)`;

                if (safeQs.length > 0 && typeof handlePracticeCustomPool === 'function') {
                  handlePracticeCustomPool(safeQs, titleLabel);
                }
              } catch (err) {
                console.error('AI Live Quiz launch error:', err);
                try {
                  if (typeof showToast === 'function') {
                    showToast('लाइव क्विज़ शुरू करते समय त्रुटि आई, कृपया पुनः प्रयास करें।', 'error');
                  }
                } catch {}
              }
            }, 30);
          }}
          

        />
      )}


      {/* Toast Notification Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className={`pointer-events-auto rounded-2xl px-4 py-3 text-xs font-semibold shadow-xl border backdrop-blur-xl flex items-start gap-2.5 ${
                t.tone === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100'
                  : t.tone === 'error'
                  ? 'bg-rose-950/90 border-rose-500/40 text-rose-100'
                  : 'bg-slate-900/90 border-white/15 text-slate-100'
              }`}
            >
              {t.tone === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : t.tone === 'error' ? (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
      </GlobalSafeErrorBoundary>

  );
  }
