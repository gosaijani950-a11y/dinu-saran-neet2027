import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  BackupPayload,
  MCQQuestion,
  MistakeRecord,
  ModuleBundleRecord,
  PYQItem,
  PendingBatchJob,
  ProcessedUploadBundle,
  QuestionReport,
  QuizCheckpoint,
  QuizResultSummary,
  ShortNote,
  SpecialItem,
  StudentSuggestion,
  StudyNote,
  UnifiedQuestionItem,
  UploadedModule,
} from '../types';
import { STARTER_SAMPLE_QUESTIONS } from '../data/starterData';
import { buildUnifiedQuestionMap } from '../utils/quizLogic';

const SETTINGS_STORAGE_KEY = 'dinu_saran_neet_2027_settings_v1';
const SEEDED_FLAG_KEY = 'dinu_saran_neet_2027_seeded_v1';
const PENDING_BATCH_STORAGE_KEY = 'dinu_saran_neet_2027_pending_batch_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  backupApiKey: '',
  modelId: 'gemini-3.5-flash-lite',
  thinkingLevel: 'high',
  batchCooldownSec: 2.5,
  customRules:
    'Strictly follow latest rationalized NCERT 2026–27 NEET syllabus. Use crisp, natural Devanagari Hindi terminology matching NCERT Hindi medium textbooks.',
  theme: 'dark',
  fontScale: 100,
  creatorName: 'DINU SARAN',
  supabaseUrl: '',
  supabaseAnonKey: '',
};

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      fontScale:
        typeof parsed.fontScale === 'number'
          ? Math.min(130, Math.max(85, parsed.fontScale))
          : DEFAULT_SETTINGS.fontScale,
      batchCooldownSec:
        typeof parsed.batchCooldownSec === 'number'
          ? Math.min(30, Math.max(0.5, parsed.batchCooldownSec))
          : DEFAULT_SETTINGS.batchCooldownSec,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors for lightweight prefs
  }
}

export function loadPendingBatchJob(): PendingBatchJob | null {
  try {
    const raw = localStorage.getItem(PENDING_BATCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBatchJob;
    if (
      !parsed ||
      !parsed.config ||
      typeof parsed.targetCount !== 'number' ||
      !Array.isArray(parsed.generatedQuestionIds)
    ) {
      return null;
    }
    if (parsed.generatedQuestionIds.length >= parsed.targetCount) {
      localStorage.removeItem(PENDING_BATCH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingBatchJob(job: PendingBatchJob | null): void {
  try {
    if (!job) {
      localStorage.removeItem(PENDING_BATCH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(PENDING_BATCH_STORAGE_KEY, JSON.stringify(job));
  } catch {
    // Ignore storage quota errors
  }
}

export interface CustomSubjectRow {
  name: string;
  createdAt: number;
}

class DinuSaranNeetDB extends Dexie {
  questions!: Table<MCQQuestion, string>;
  notes!: Table<StudyNote, string>;
  shortNotes!: Table<ShortNote, string>;
  pyqs!: Table<PYQItem, string>;
  specials!: Table<SpecialItem, string>;
  modules!: Table<UploadedModule, string>;
  moduleBundles!: Table<ModuleBundleRecord, string>;
  mistakes!: Table<MistakeRecord, string>;
  quizCheckpoints!: Table<QuizCheckpoint, string>;
  quizHistory!: Table<QuizResultSummary, string>;
  customSubjects!: Table<CustomSubjectRow, string>;
  suggestions!: Table<StudentSuggestion, string>;
  questionReports!: Table<QuestionReport, string>;

  constructor() {
    super('DinuSaranNeet2027DB');
    this.version(1).stores({
      questions: 'id, subject, chapter, difficulty, isStarred, isSaved, createdAt, concept_key',
      notes: 'id, subject, chapter, isStarred, createdAt',
      shortNotes: 'id, subject, chapter, isStarred, createdAt',
      pyqs: 'id, subject, chapter, year, isStarred, isSaved, createdAt',
      specials: 'id, subject, chapter, category, isStarred, createdAt',
      modules: 'id, subject, chapter, isStarred, createdAt',
      mistakes: 'questionId, subject, chapter, mastered, updatedAt',
      quizCheckpoints: 'id, updatedAt',
      quizHistory: 'id, submittedAt',
      customSubjects: 'name, createdAt',
    });

    this.version(2)
      .stores({
        questions: 'id, subject, chapter, difficulty, isStarred, isSaved, createdAt, concept_key',
        notes: 'id, subject, chapter, isStarred, createdAt',
        shortNotes: 'id, subject, chapter, isStarred, createdAt',
        pyqs: 'id, subject, chapter, year, isStarred, isSaved, createdAt',
        specials: 'id, subject, chapter, category, isStarred, createdAt',
        modules: 'id, subject, chapter, isStarred, createdAt',
        moduleBundles: 'moduleId, updatedAt',
        mistakes: 'questionId, subject, chapter, mastered, updatedAt',
        quizCheckpoints: 'id, updatedAt',
        quizHistory: 'id, submittedAt',
        customSubjects: 'name, createdAt',
      })
      .upgrade(async () => {
        // Non-destructive upgrade: adds moduleBundles store while preserving all v1 study data.
      });

    this.version(3)
      .stores({
        questions: 'id, subject, chapter, difficulty, isStarred, isSaved, createdAt, concept_key',
        notes: 'id, subject, chapter, isStarred, createdAt',
        shortNotes: 'id, subject, chapter, isStarred, createdAt',
        pyqs: 'id, subject, chapter, year, isStarred, isSaved, createdAt',
        specials: 'id, subject, chapter, category, isStarred, createdAt',
        modules: 'id, subject, chapter, isStarred, createdAt',
        moduleBundles: 'moduleId, updatedAt',
        mistakes: 'questionId, subject, chapter, mastered, updatedAt',
        quizCheckpoints: 'id, updatedAt',
        quizHistory: 'id, submittedAt',
        customSubjects: 'name, createdAt',
        suggestions: 'id, status, createdAt',
      })
      .upgrade(async () => {
        // Non-destructive upgrade: adds local suggestions cache table.
      });

    this.version(4)
      .stores({
        questions: 'id, subject, chapter, difficulty, isStarred, isSaved, createdAt, concept_key',
        notes: 'id, subject, chapter, isStarred, createdAt',
        shortNotes: 'id, subject, chapter, isStarred, createdAt',
        pyqs: 'id, subject, chapter, year, isStarred, isSaved, createdAt',
        specials: 'id, subject, chapter, category, isStarred, createdAt',
        modules: 'id, subject, chapter, isStarred, createdAt',
        moduleBundles: 'moduleId, updatedAt',
        mistakes: 'questionId, subject, chapter, mastered, updatedAt',
        quizCheckpoints: 'id, updatedAt',
        quizHistory: 'id, submittedAt',
        customSubjects: 'name, createdAt',
        suggestions: 'id, status, createdAt',
        questionReports: 'id, questionId, status, subject, reason, createdAt',
      })
      .upgrade(async () => {
        // Non-destructive upgrade: adds questionReports table for offline queue & Admin inbox.
      });
  }
}

export const db = new DinuSaranNeetDB();

/**
 * Merges published Supabase data into local Dexie IndexedDB while strictly
 * preserving each student's private personal isStarred / isSaved flags and Mistake Bank.
 */
export async function applyCloudSyncSnapshot(cloud: {
  questions: MCQQuestion[];
  notes: StudyNote[];
  shortNotes: ShortNote[];
  pyqs: PYQItem[];
  specials: SpecialItem[];
  modules: UploadedModule[];
}): Promise<void> {
  await db.transaction(
    'rw',
    [db.questions, db.notes, db.shortNotes, db.pyqs, db.specials, db.modules],
    async () => {
      const [localQs, localNotes, localShort, localPyqs, localSpec, localMods] = await Promise.all([
        db.questions.toArray(),
        db.notes.toArray(),
        db.shortNotes.toArray(),
        db.pyqs.toArray(),
        db.specials.toArray(),
        db.modules.toArray(),
      ]);

      const qFlags = new Map(localQs.map((x) => [x.id, { isStarred: x.isStarred, isSaved: x.isSaved }]));
      const nFlags = new Map(localNotes.map((x) => [x.id, x.isStarred]));
      const snFlags = new Map(localShort.map((x) => [x.id, x.isStarred]));
      const pFlags = new Map(localPyqs.map((x) => [x.id, { isStarred: x.isStarred, isSaved: x.isSaved }]));
      const spFlags = new Map(localSpec.map((x) => [x.id, x.isStarred]));
      const mFlags = new Map(localMods.map((x) => [x.id, x.isStarred]));

      // Reconcile questions: keep local starter samples if cloud has none, otherwise replace synced items
      const mergedQs = cloud.questions.map((item) => {
        const prev = qFlags.get(item.id);
        return prev ? { ...item, isStarred: prev.isStarred, isSaved: prev.isSaved } : item;
      });
      if (mergedQs.length > 0) {
        const cloudQIds = new Set(mergedQs.map((x) => x.id));
        const staleNonStarterIds = localQs
          .filter((x) => !x.isStarterSample && !cloudQIds.has(x.id))
          .map((x) => x.id);
        if (staleNonStarterIds.length) await db.questions.bulkDelete(staleNonStarterIds);
        await db.questions.bulkPut(mergedQs);
      }

      const mergedNotes = cloud.notes.map((item) => ({
        ...item,
        isStarred: nFlags.get(item.id) ?? item.isStarred,
      }));
      const cloudNoteIds = new Set(mergedNotes.map((x) => x.id));
      const staleNoteIds = localNotes.filter((x) => !cloudNoteIds.has(x.id)).map((x) => x.id);
      if (staleNoteIds.length) await db.notes.bulkDelete(staleNoteIds);
      if (mergedNotes.length) await db.notes.bulkPut(mergedNotes);

      const mergedShort = cloud.shortNotes.map((item) => ({
        ...item,
        isStarred: snFlags.get(item.id) ?? item.isStarred,
      }));
      const cloudShortIds = new Set(mergedShort.map((x) => x.id));
      const staleShortIds = localShort.filter((x) => !cloudShortIds.has(x.id)).map((x) => x.id);
      if (staleShortIds.length) await db.shortNotes.bulkDelete(staleShortIds);
      if (mergedShort.length) await db.shortNotes.bulkPut(mergedShort);

      const mergedPyqs = cloud.pyqs.map((item) => {
        const prev = pFlags.get(item.id);
        return prev ? { ...item, isStarred: prev.isStarred, isSaved: prev.isSaved } : item;
      });
      const cloudPyqIds = new Set(mergedPyqs.map((x) => x.id));
      const stalePyqIds = localPyqs.filter((x) => !cloudPyqIds.has(x.id)).map((x) => x.id);
      if (stalePyqIds.length) await db.pyqs.bulkDelete(stalePyqIds);
      if (mergedPyqs.length) await db.pyqs.bulkPut(mergedPyqs);

      const mergedSpec = cloud.specials.map((item) => ({
        ...item,
        isStarred: spFlags.get(item.id) ?? item.isStarred,
      }));
      const cloudSpecIds = new Set(mergedSpec.map((x) => x.id));
      const staleSpecIds = localSpec.filter((x) => !cloudSpecIds.has(x.id)).map((x) => x.id);
      if (staleSpecIds.length) await db.specials.bulkDelete(staleSpecIds);
      if (mergedSpec.length) await db.specials.bulkPut(mergedSpec);

      const mergedMods = cloud.modules.map((item) => ({
        ...item,
        isStarred: mFlags.get(item.id) ?? item.isStarred,
      }));
      const cloudModIds = new Set(mergedMods.map((x) => x.id));
      const staleModIds = localMods.filter((x) => !cloudModIds.has(x.id)).map((x) => x.id);
      if (staleModIds.length) await db.modules.bulkDelete(staleModIds);
      if (mergedMods.length) await db.modules.bulkPut(mergedMods);
    }
  );
}

/**
 * Merges records from both db.questions and db.pyqs into a single unified lookup map.
 */
export async function getUnifiedQuestionMap(): Promise<Record<string, UnifiedQuestionItem>> {
  const [questions, pyqs] = await Promise.all([db.questions.toArray(), db.pyqs.toArray()]);
  return buildUnifiedQuestionMap(questions, pyqs);
}

/**
 * Persists a ProcessedUploadBundle (extractedText, pageImages, pageCount, fileNames) in IndexedDB.
 */
export async function saveModuleBundle(
  moduleId: string,
  bundle: ProcessedUploadBundle
): Promise<void> {
  const extractedText = bundle.pages
    .map((p) => (p.text?.trim() ? `[${p.fileName} p.${p.pageNumber}]\n${p.text}` : ''))
    .filter(Boolean)
    .join('\n\n');

  const pageImages = bundle.pages
    .filter((p): p is typeof p & { imageBase64: string } => Boolean(p.imageBase64))
    .map((p) => ({
      fileName: p.fileName,
      pageNumber: p.pageNumber,
      imageBase64: p.imageBase64,
      mimeType: (p.mimeType || 'image/jpeg') as 'image/jpeg',
    }));

  const record: ModuleBundleRecord = {
    moduleId,
    extractedText,
    pageImages,
    pageCount: bundle.totalPages,
    fileNames: bundle.files.map((f) => f.name),
    bundle,
    updatedAt: Date.now(),
  };

  await db.moduleBundles.put(record);
}

/**
 * Loads a persisted ProcessedUploadBundle from IndexedDB for a given moduleId.
 */
export async function loadModuleBundle(moduleId: string): Promise<ProcessedUploadBundle | null> {
  const rec = await db.moduleBundles.get(moduleId);
  if (!rec) return null;
  if (rec.bundle && Array.isArray(rec.bundle.pages)) {
    return rec.bundle;
  }
  return {
    files: rec.fileNames.map((name) => ({ name, type: name.endsWith('.pdf') ? 'pdf' : 'image', pages: 1 })),
    pages: rec.pageImages.map((img) => ({
      fileName: img.fileName,
      pageNumber: img.pageNumber,
      text: rec.extractedText,
      imageBase64: img.imageBase64,
      mimeType: img.mimeType,
    })),
    totalPages: rec.pageCount,
    totalTextChars: rec.extractedText.length,
    imagePageCount: rec.pageImages.length,
  };
}

/**
 * Ensures the 8 authentic Starter Sample Hindi NCERT MCQs are seeded once on fresh install.
 */
export async function ensureStarterSeeded(): Promise<void> {
  const alreadySeeded = localStorage.getItem(SEEDED_FLAG_KEY);
  const existingCount = await db.questions.count();
  if (!alreadySeeded && existingCount === 0) {
    await db.questions.bulkPut(STARTER_SAMPLE_QUESTIONS);
    localStorage.setItem(SEEDED_FLAG_KEY, '1');
  }
}

export interface DatabaseStats {
  totalQuestions: number;
  notesCount: number;
  shortNotesCount: number;
  pyqsCount: number;
  specialsCount: number;
  modulesCount: number;
  mistakesCount: number;
  savedQuestionsCount: number;
  starredTotalCount: number;
  quizHistoryCount: number;
  approxMb: number;
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const [
    questions,
    notes,
    shortNotes,
    pyqs,
    specials,
    modules,
    moduleBundles,
    mistakes,
    quizHistoryCount,
  ] = await Promise.all([
    db.questions.toArray(),
    db.notes.toArray(),
    db.shortNotes.toArray(),
    db.pyqs.toArray(),
    db.specials.toArray(),
    db.modules.toArray(),
    db.moduleBundles.toArray(),
    db.mistakes.toArray(),
    db.quizHistory.count(),
  ]);

  const unifiedMap = buildUnifiedQuestionMap(questions, pyqs);
  const activeMistakes = mistakes.filter((m) => !m.mastered && Boolean(unifiedMap[m.questionId])).length;
  const savedQuestionsCount =
    questions.filter((q) => q.isSaved).length + pyqs.filter((p) => p.isSaved).length;
  const starredTotalCount =
    questions.filter((q) => q.isStarred).length +
    notes.filter((n) => n.isStarred).length +
    shortNotes.filter((s) => s.isStarred).length +
    pyqs.filter((p) => p.isStarred).length +
    specials.filter((sp) => sp.isStarred).length +
    modules.filter((m) => m.isStarred).length;

  // Estimate JSON payload size in MB including persisted PDF/Photo scan bundles
  const approxBytes =
    JSON.stringify({
      questions,
      notes,
      shortNotes,
      pyqs,
      specials,
      modules,
      moduleBundles,
      mistakes,
    }).length * 2;
  const approxMb = Number((approxBytes / (1024 * 1024)).toFixed(2));

  return {
    totalQuestions: questions.length,
    notesCount: notes.length,
    shortNotesCount: shortNotes.length,
    pyqsCount: pyqs.length,
    specialsCount: specials.length,
    modulesCount: modules.length,
    mistakesCount: activeMistakes,
    savedQuestionsCount,
    starredTotalCount,
    quizHistoryCount,
    approxMb,
  };
}

/**
 * Logs every wrong and skipped question into Mistake Bank automatically after a quiz.
 */
export async function recordQuizMistakes(
  questions: MCQQuestion[],
  answers: Record<string, number>
): Promise<void> {
  const now = Date.now();
  const toUpsert: MistakeRecord[] = [];

  for (const q of questions) {
    const chosen = answers[q.id];
    const isCorrect = chosen !== undefined && chosen === q.correct_index;
    if (!isCorrect) {
      const existing = await db.mistakes.get(q.id);
      toUpsert.push({
        questionId: q.id,
        subject: q.subject,
        chapter: q.chapter,
        mistakeCount: (existing?.mistakeCount ?? 0) + 1,
        lastWrongOption: chosen !== undefined ? chosen : null,
        wasSkipped: chosen === undefined,
        mastered: false,
        updatedAt: now,
      });
    }
  }

  if (toUpsert.length > 0) {
    await db.mistakes.bulkPut(toUpsert);
  }
}

export async function exportDatabasePayload(
  creatorName: string,
  subjectFilter: string = 'ALL',
  options?: { includeModuleBundles?: boolean }
): Promise<BackupPayload> {
  const matchSubject = (s: string) => subjectFilter === 'ALL' || s === subjectFilter;
  const includeBundles = subjectFilter === 'ALL' && Boolean(options?.includeModuleBundles);

  const [
    questions,
    notes,
    shortNotes,
    pyqs,
    specials,
    modules,
    moduleBundles,
    mistakes,
    quizHistory,
    customSubjects,
  ] = await Promise.all([
    db.questions.toArray(),
    db.notes.toArray(),
    db.shortNotes.toArray(),
    db.pyqs.toArray(),
    db.specials.toArray(),
    db.modules.toArray(),
    includeBundles ? db.moduleBundles.toArray() : Promise.resolve([]),
    db.mistakes.toArray(),
    db.quizHistory.toArray(),
    db.customSubjects.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    creatorName,
    subjectFilter,
    data: {
      questions: questions.filter((x) => matchSubject(x.subject)),
      notes: notes.filter((x) => matchSubject(x.subject)),
      shortNotes: shortNotes.filter((x) => matchSubject(x.subject)),
      pyqs: pyqs.filter((x) => matchSubject(x.subject)),
      specials: specials.filter((x) => matchSubject(x.subject)),
      modules: modules.filter((x) => matchSubject(x.subject)),
      ...(includeBundles ? { moduleBundles } : {}),
      mistakes: mistakes.filter((x) => matchSubject(x.subject)),
      quizHistory: subjectFilter === 'ALL' ? quizHistory : [],
      customSubjects: customSubjects.map((c) => c.name),
    },
  };
}

export async function importDatabasePayload(
  payload: BackupPayload,
  mode: 'merge' | 'overwrite'
): Promise<{ importedCounts: Record<string, number> }> {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    throw new Error('Invalid backup JSON format: missing "data" field.');
  }

  const d = payload.data;

  await db.transaction(
    'rw',
    [
      db.questions,
      db.notes,
      db.shortNotes,
      db.pyqs,
      db.specials,
      db.modules,
      db.moduleBundles,
      db.mistakes,
      db.quizHistory,
      db.customSubjects,
    ],
    async () => {
      if (mode === 'overwrite') {
        await Promise.all([
          db.questions.clear(),
          db.notes.clear(),
          db.shortNotes.clear(),
          db.pyqs.clear(),
          db.specials.clear(),
          db.modules.clear(),
          db.moduleBundles.clear(),
          db.mistakes.clear(),
          db.quizHistory.clear(),
          db.customSubjects.clear(),
        ]);
      }

      if (Array.isArray(d.questions) && d.questions.length) await db.questions.bulkPut(d.questions);
      if (Array.isArray(d.notes) && d.notes.length) await db.notes.bulkPut(d.notes);
      if (Array.isArray(d.shortNotes) && d.shortNotes.length) await db.shortNotes.bulkPut(d.shortNotes);
      if (Array.isArray(d.pyqs) && d.pyqs.length) await db.pyqs.bulkPut(d.pyqs);
      if (Array.isArray(d.specials) && d.specials.length) await db.specials.bulkPut(d.specials);
      if (Array.isArray(d.modules) && d.modules.length) await db.modules.bulkPut(d.modules);
      if (Array.isArray(d.moduleBundles) && d.moduleBundles.length)
        await db.moduleBundles.bulkPut(d.moduleBundles);
      if (Array.isArray(d.mistakes) && d.mistakes.length) await db.mistakes.bulkPut(d.mistakes);
      if (Array.isArray(d.quizHistory) && d.quizHistory.length)
        await db.quizHistory.bulkPut(d.quizHistory);
      if (Array.isArray(d.customSubjects) && d.customSubjects.length) {
        await db.customSubjects.bulkPut(
          d.customSubjects.map((name) => ({ name, createdAt: Date.now() }))
        );
      }
    }
  );

  return {
    importedCounts: {
      questions: d.questions?.length ?? 0,
      notes: d.notes?.length ?? 0,
      shortNotes: d.shortNotes?.length ?? 0,
      pyqs: d.pyqs?.length ?? 0,
      specials: d.specials?.length ?? 0,
      modules: d.modules?.length ?? 0,
      moduleBundles: d.moduleBundles?.length ?? 0,
      mistakes: d.mistakes?.length ?? 0,
    },
  };
}

export async function clearDatabaseSection(
  section:
    | 'questions'
    | 'notes'
    | 'shortNotes'
    | 'pyqs'
    | 'specials'
    | 'modules'
    | 'mistakes'
    | 'quizHistory'
    | 'ALL'
): Promise<void> {
  if (section === 'ALL') {
    await Promise.all([
      db.questions.clear(),
      db.notes.clear(),
      db.shortNotes.clear(),
      db.pyqs.clear(),
      db.specials.clear(),
      db.modules.clear(),
      db.moduleBundles.clear(),
      db.mistakes.clear(),
      db.quizCheckpoints.clear(),
      db.quizHistory.clear(),
      db.customSubjects.clear(),
    ]);
    localStorage.removeItem(SEEDED_FLAG_KEY);
    localStorage.removeItem(PENDING_BATCH_STORAGE_KEY);
    return;
  }

  switch (section) {
    case 'questions':
      await db.questions.clear();
      break;
    case 'notes':
      await db.notes.clear();
      break;
    case 'shortNotes':
      await db.shortNotes.clear();
      break;
    case 'pyqs':
      await db.pyqs.clear();
      break;
    case 'specials':
      await db.specials.clear();
      break;
    case 'modules':
      await Promise.all([db.modules.clear(), db.moduleBundles.clear()]);
      break;
    case 'mistakes':
      await db.mistakes.clear();
      break;
    case 'quizHistory':
      await db.quizHistory.clear();
      break;
  }
}
