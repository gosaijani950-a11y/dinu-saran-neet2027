export type CoreSubject = 'Physics' | 'Chemistry' | 'Botany' | 'Zoology';
export type SubjectName = CoreSubject | string;

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Advanced' | 'Mixed';

export type QuestionTag =
  | 'NCERT Line'
  | 'Exception'
  | 'Assertion-Reason'
  | 'Statement I & II'
  | 'Numerical'
  | 'Diagram/Concept'
  | 'Diagram'
  | 'PYQ'
  | 'Starter Sample';

export type ThinkingLevelOption = 'high' | 'medium' | 'low' | 'xhigh';

export type LanguageMode = 'hindi_only' | 'bilingual';

export type AnswerRevealMode = 'practice' | 'exam';
export type QuizLayoutMode = 'scroll' | 'single';
export type ScoringMode = 'standard' | 'neet';

export type UserRole = 'student' | 'admin';

export type CloudSyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export type SuggestionCategory = 'Feedback' | 'Chapter / Notes Request' | 'Bug' | 'Other';

export interface StudentSuggestion {
  id: string;
  studentName: string;
  category: SuggestionCategory;
  message: string;
  status: 'open' | 'resolved';
  createdAt: number;
}

export type ReportReason =
  | 'Wrong Answer'
  | 'Formula / LaTeX / Typo'
  | 'Ambiguous / Out of Scope'
  | 'Explanation Issue'
  | 'Other';

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface QuestionReport {
  id: string;
  questionId: string;
  sourceTable: 'questions' | 'pyqs';
  subject: SubjectName;
  chapter: string;
  questionSnapshot: string;
  reason: ReportReason;
  comment: string;
  status: ReportStatus;
  adminNote?: string;
  resolvedAt?: number;
  createdAt: number;
}

export type ViewRoute =
  | 'home'
  | 'notes'
  | 'quiz-setup'
  | 'quiz-active'
  | 'quiz-result'
  | 'short-notes'
  | 'pyqs'
  | 'star'
  | 'modules'
  | 'special'
  | 'save'
  | 'mistakes'
  | 'backup'
  | 'suggestions'
  | 'reports'
| 'leaderboard'
| 'study-vault'
| 'community';



export interface ChapterItem {
  id: string;
  subject: SubjectName;
  name: string;
  classLevel: 'Class 11' | 'Class 12' | 'Custom';
  unit?: string;
}

export interface MCQQuestion {
  id: string;
  question_hi: string;
  options_hi: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation_hi: string;
  subject: SubjectName;
  chapter: string;
  difficulty: Exclude<DifficultyLevel, 'Mixed'>;
  tags: string[];
  concept_key: string;
  isStarred: boolean;
  isSaved: boolean;
  isStarterSample?: boolean;
  sourceModuleId?: string;
  year?: number;
  createdAt: number;
}

export interface StudyNote {
  id: string;
  title: string;
  subject: SubjectName;
  chapter: string;
  content_hi: string;
  keyPoints_hi: string[];
  isStarred: boolean;
  sourceModuleId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ShortNote {
  id: string;
  title: string;
  subject: SubjectName;
  chapter: string;
  formulas_hi: string[];
  quickPoints_hi: string[];
  isStarred: boolean;
  sourceModuleId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PYQItem {
  id: string;
  year: number;
  examTag: string;
  subject: SubjectName;
  chapter: string;
  question_hi: string;
  options_hi: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation_hi: string;
  isStarred: boolean;
  isSaved: boolean;
  createdAt: number;
}

export type SpecialCategory = 'Exception' | 'Trend' | 'Reaction' | 'Mnemonic' | 'Exam Trap';

export interface SpecialItem {
  id: string;
  title: string;
  category: SpecialCategory;
  subject: SubjectName;
  chapter: string;
  content_hi: string;
  memoryTrick_hi?: string;
  isStarred: boolean;
  sourceModuleId?: string;
  createdAt: number;
}

export interface UploadedModule {
  id: string;
  name: string;
  subject: SubjectName;
  chapter: string;
  fileType: 'pdf' | 'images' | 'mixed';
  pageCount: number;
  extractedChars: number;
  imagePageCount: number;
  isStarred: boolean;
  extractedSummary?: string;
  generatedCounts: {
    mcqs: number;
    notes: number;
    shortNotes: number;
    specials: number;
  };
  createdAt: number;
}

export interface MistakeRecord {
  questionId: string;
  subject: SubjectName;
  chapter: string;
  mistakeCount: number;
  lastWrongOption: number | null; // null if skipped
  wasSkipped: boolean;
  mastered: boolean;
  updatedAt: number;
}

export interface QuizConfig {
  subject: SubjectName | 'All';
  chapters: string[];
  sourceMode: 'upload' | 'bank' | 'syllabus';
  questionCount: number;
  difficulty: DifficultyLevel;
  patterns: {
    ncertLine: boolean;
    exception: boolean;
    assertionReason: boolean;
    statementType: boolean;
    numerical: boolean;
    diagramConcept: boolean;
  };
  revealMode: AnswerRevealMode;
  layoutMode: QuizLayoutMode;
  scoringMode: ScoringMode;
  languageMode: LanguageMode;
  timerMinutes: number;
  untimed: boolean;
  deepNcertExpansion: boolean;
}

export interface QuizCheckpoint {
  id: string; // 'active'
  config: QuizConfig;
  questionIds: string[];
  answers: Record<string, number>; // questionId -> selected index (0..3)
  currentIndex: number;
  remainingSeconds: number;
  startedAt: number;
  updatedAt: number;
  label?: string;
}

export interface ChapterPerformance {
  chapter: string;
  subject: SubjectName;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
}

export interface QuizResultSummary {
  id: string;
  config: QuizConfig;
  questionIds: string[];
  answers: Record<string, number>;
  submissionType: 'manual' | 'auto';
  submittedAt: number;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  accuracyPercent: number;
  neetScore: number;
  maxNeetScore: number;
  levelTitle: string;
  levelGuidance: string;
  chapterBreakdown: ChapterPerformance[];
  weakChapters: ChapterPerformance[];
  strongChapters: ChapterPerformance[];
}

export interface AppSettings {
  apiKey: string;
  backupApiKey: string;
  modelId: string;
  thinkingLevel: ThinkingLevelOption;
  batchCooldownSec: number;
  customRules: string;
  theme: 'dark' | 'light';
  fontScale: number; // 85 to 130
  creatorName: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface ProcessedFilePage {
  fileName: string;
  pageNumber: number;
  text: string;
  imageBase64?: string; // JPEG base64 without data URL prefix
  mimeType?: 'image/jpeg';
}

export interface ProcessedUploadBundle {
  files: { name: string; type: string; pages: number }[];
  pages: ProcessedFilePage[];
  totalPages: number;
  totalTextChars: number;
  imagePageCount: number;
}

export interface BatchGenerationProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'stopped';
  targetCount: number;
  generatedCount: number;
  currentBatch: number;
  totalBatches: number;
  generatedQuestionIds: string[];
  coveredConcepts: string[];
  failedBatchIndex: number | null;
  errorMessage: string | null;
  activeNotice: string | null;
}

export interface UnifiedQuestionItem extends MCQQuestion {
  sourceTable?: 'questions' | 'pyqs';
  examTag?: string;
}

export interface ModuleBundleRecord {
  moduleId: string;
  extractedText: string;
  pageImages: Array<{
    fileName: string;
    pageNumber: number;
    imageBase64: string;
    mimeType: 'image/jpeg';
  }>;
  pageCount: number;
  fileNames: string[];
  bundle: ProcessedUploadBundle;
  updatedAt: number;
}

export interface PendingBatchJob {
  id?: string;
  config: QuizConfig;
  targetCount: number;
  batchSize: number;
  nextBatchIndex: number;
  totalBatches: number;
  generatedQuestionIds: string[];
  coveredConcepts: string[];
  moduleId?: string;
  updatedAt: number;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  creatorName: string;
  subjectFilter: string; // 'ALL' or subject name
  data: {
    questions: MCQQuestion[];
    notes: StudyNote[];
    shortNotes: ShortNote[];
    pyqs: PYQItem[];
    specials: SpecialItem[];
    modules: UploadedModule[];
    moduleBundles?: ModuleBundleRecord[];
    mistakes: MistakeRecord[];
    quizHistory: QuizResultSummary[];
    customSubjects: string[];
  };
}

  export interface StudentProfile {
  id: string;
  full_name: string;
  gender: 'Male' | 'Female' | 'Other';
  dob: string;
  attempt_status: 'Fresher (12th)' | '1st Drop' | '2nd Drop' | '3rd+ Drop';
  mobile_number?: string;
  total_attempted: number;
  total_correct: number;
  total_wrong: number;
  total_time_seconds: number;
  leaderboard_score: number;
}

export interface StudyVaultFolder {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
}

export interface StudyVaultLink {
  id: string;
  folder_id: string;
  title: string;
  url: string;
  created_at?: string;
}

