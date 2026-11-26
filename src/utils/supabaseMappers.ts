import type {
  AppSettings,
  DifficultyLevel,
  MCQQuestion,
  PYQItem,
  QuestionReport,
  ReportReason,
  ReportStatus,
  ShortNote,
  SpecialCategory,
  SpecialItem,
  StudentSuggestion,
  StudyNote,
  SuggestionCategory,
  UploadedModule,
  UserRole,
} from '../types';

export const ALLOWED_SUGGESTION_CATEGORIES: SuggestionCategory[] = [
  'Feedback',
  'Chapter / Notes Request',
  'Bug',
  'Other',
];

export const ALLOWED_REPORT_REASONS: ReportReason[] = [
  'Wrong Answer',
  'Formula / LaTeX / Typo',
  'Ambiguous / Out of Scope',
  'Explanation Issue',
  'Other',
];

export const ALLOWED_REPORT_STATUSES: ReportStatus[] = ['open', 'resolved', 'dismissed'];

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function resolveSupabaseConfig(
  settings: Pick<AppSettings, 'supabaseUrl' | 'supabaseAnonKey'>,
  envUrl?: string,
  envAnonKey?: string
): SupabaseConfig {
  const url = (settings.supabaseUrl?.trim() || envUrl?.trim() || '').replace(/\/+$/, '');
  const anonKey = settings.supabaseAnonKey?.trim() || envAnonKey?.trim() || '';
  return { url, anonKey };
}

export function isValidSupabaseConfig(cfg: SupabaseConfig): boolean {
  if (!cfg.url || !cfg.anonKey) return false;
  try {
    const parsed = new URL(cfg.url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function canPerformAdminAction(role: UserRole): boolean {
  return role === 'admin';
}

export function validateSuggestionInput(input: {
  studentName?: string;
  category: string;
  message: string;
}):
  | { ok: true; studentName: string; category: SuggestionCategory; message: string }
  | { ok: false; error: string } {
  const cleanMsg = (input.message || '').trim();
  if (cleanMsg.length < 3) {
    return { ok: false, error: 'Please enter at least 3 characters in your message.' };
  }
  if (cleanMsg.length > 2000) {
    return { ok: false, error: 'Message must be 2,000 characters or fewer.' };
  }
  const cleanName = (input.studentName || '').trim().slice(0, 60) || 'Anonymous Student';
  const category = ALLOWED_SUGGESTION_CATEGORIES.includes(input.category as SuggestionCategory)
    ? (input.category as SuggestionCategory)
    : 'Feedback';
  return { ok: true, studentName: cleanName, category, message: cleanMsg };
}

export function validateQuestionReportInput(input: {
  questionId: string;
  reason: string;
  comment?: string;
}):
  | { ok: true; questionId: string; reason: ReportReason; comment: string }
  | { ok: false; error: string } {
  const cleanQid = (input.questionId || '').trim();
  if (!cleanQid) {
    return { ok: false, error: 'Missing question identifier for report.' };
  }
  const reason: ReportReason = ALLOWED_REPORT_REASONS.includes(input.reason as ReportReason)
    ? (input.reason as ReportReason)
    : 'Other';
  const cleanComment = (input.comment || '').trim();
  if (cleanComment.length > 1000) {
    return { ok: false, error: 'Comment must be 1,000 characters or fewer.' };
  }
  return { ok: true, questionId: cleanQid, reason, comment: cleanComment };
}

export function validateQuestionPatchInput(input: {
  question_hi: string;
  options_hi: string[];
  correct_index: number;
  explanation_hi: string;
  difficulty: string;
}):
  | {
      ok: true;
      question_hi: string;
      options_hi: [string, string, string, string];
      correct_index: 0 | 1 | 2 | 3;
      explanation_hi: string;
      difficulty: Exclude<DifficultyLevel, 'Mixed'>;
    }
  | { ok: false; error: string } {
  const qText = (input.question_hi || '').trim();
  if (qText.length < 3) {
    return { ok: false, error: 'Question stem cannot be empty.' };
  }
  if (!Array.isArray(input.options_hi) || input.options_hi.length !== 4) {
    return { ok: false, error: 'Exactly 4 options are required.' };
  }
  const opts = input.options_hi.map((o) => (o || '').trim());
  if (opts.some((o) => !o)) {
    return { ok: false, error: 'All 4 options (A, B, C, D) must be non-empty.' };
  }
  const ci = Number(input.correct_index);
  if (ci !== 0 && ci !== 1 && ci !== 2 && ci !== 3) {
    return { ok: false, error: 'Correct answer index must be A, B, C, or D.' };
  }
  const diff: Exclude<DifficultyLevel, 'Mixed'> =
    input.difficulty === 'Easy' ||
    input.difficulty === 'Medium' ||
    input.difficulty === 'Hard' ||
    input.difficulty === 'Advanced'
      ? input.difficulty
      : 'Medium';

  return {
    ok: true,
    question_hi: qText,
    options_hi: [opts[0], opts[1], opts[2], opts[3]],
    correct_index: ci,
    explanation_hi: (input.explanation_hi || '').trim(),
    difficulty: diff,
  };
}

/* ==================== ROW MAPPERS (TS <-> POSTGRES) ==================== */

export function toQuestionRow(q: MCQQuestion): Record<string, unknown> {
  return {
    id: q.id,
    question_hi: q.question_hi,
    options_hi: q.options_hi,
    correct_index: q.correct_index,
    explanation_hi: q.explanation_hi,
    subject: q.subject,
    chapter: q.chapter,
    difficulty: q.difficulty,
    tags: q.tags,
    concept_key: q.concept_key,
    is_starter_sample: Boolean(q.isStarterSample),
    source_module_id: q.sourceModuleId ?? null,
    year: q.year ?? null,
    created_at: q.createdAt,
  };
}

export function fromQuestionRow(r: Record<string, unknown>): MCQQuestion {
  const rawOpts = Array.isArray(r.options_hi) ? r.options_hi.map(String) : ['', '', '', ''];
  const options_hi: [string, string, string, string] = [
    rawOpts[0] ?? '',
    rawOpts[1] ?? '',
    rawOpts[2] ?? '',
    rawOpts[3] ?? '',
  ];
  const ci = Number(r.correct_index);
  const correct_index: 0 | 1 | 2 | 3 =
    ci === 1 || ci === 2 || ci === 3 ? ci : 0;
  const diff = String(r.difficulty || 'Medium');
  const difficulty: MCQQuestion['difficulty'] =
    diff === 'Easy' || diff === 'Medium' || diff === 'Hard' || diff === 'Advanced'
      ? diff
      : 'Medium';

  return {
    id: String(r.id),
    question_hi: String(r.question_hi ?? ''),
    options_hi,
    correct_index,
    explanation_hi: String(r.explanation_hi ?? ''),
    subject: String(r.subject ?? 'Physics'),
    chapter: String(r.chapter ?? 'General'),
    difficulty,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : ['NCERT Line'],
    concept_key: String(r.concept_key ?? r.id),
    isStarred: false,
    isSaved: false,
    isStarterSample: Boolean(r.is_starter_sample),
    sourceModuleId: r.source_module_id ? String(r.source_module_id) : undefined,
    year: typeof r.year === 'number' ? r.year : undefined,
    createdAt: Number(r.created_at) || Date.now(),
  };
}

export function toNoteRow(n: StudyNote): Record<string, unknown> {
  return {
    id: n.id,
    title: n.title,
    subject: n.subject,
    chapter: n.chapter,
    content_hi: n.content_hi,
    key_points_hi: n.keyPoints_hi,
    source_module_id: n.sourceModuleId ?? null,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  };
}

export function fromNoteRow(r: Record<string, unknown>): StudyNote {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    subject: String(r.subject ?? 'Botany'),
    chapter: String(r.chapter ?? 'General'),
    content_hi: String(r.content_hi ?? ''),
    keyPoints_hi: Array.isArray(r.key_points_hi) ? r.key_points_hi.map(String) : [],
    isStarred: false,
    sourceModuleId: r.source_module_id ? String(r.source_module_id) : undefined,
    createdAt: Number(r.created_at) || Date.now(),
    updatedAt: Number(r.updated_at) || Date.now(),
  };
}

export function toShortNoteRow(s: ShortNote): Record<string, unknown> {
  return {
    id: s.id,
    title: s.title,
    subject: s.subject,
    chapter: s.chapter,
    formulas_hi: s.formulas_hi,
    quick_points_hi: s.quickPoints_hi,
    source_module_id: s.sourceModuleId ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

export function fromShortNoteRow(r: Record<string, unknown>): ShortNote {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    subject: String(r.subject ?? 'Physics'),
    chapter: String(r.chapter ?? 'General'),
    formulas_hi: Array.isArray(r.formulas_hi) ? r.formulas_hi.map(String) : [],
    quickPoints_hi: Array.isArray(r.quick_points_hi) ? r.quick_points_hi.map(String) : [],
    isStarred: false,
    sourceModuleId: r.source_module_id ? String(r.source_module_id) : undefined,
    createdAt: Number(r.created_at) || Date.now(),
    updatedAt: Number(r.updated_at) || Date.now(),
  };
}

export function toPyqRow(p: PYQItem): Record<string, unknown> {
  return {
    id: p.id,
    year: p.year,
    exam_tag: p.examTag,
    subject: p.subject,
    chapter: p.chapter,
    question_hi: p.question_hi,
    options_hi: p.options_hi,
    correct_index: p.correct_index,
    explanation_hi: p.explanation_hi,
    created_at: p.createdAt,
  };
}

export function fromPyqRow(r: Record<string, unknown>): PYQItem {
  const rawOpts = Array.isArray(r.options_hi) ? r.options_hi.map(String) : ['', '', '', ''];
  const options_hi: [string, string, string, string] = [
    rawOpts[0] ?? '',
    rawOpts[1] ?? '',
    rawOpts[2] ?? '',
    rawOpts[3] ?? '',
  ];
  const ci = Number(r.correct_index);
  const correct_index: 0 | 1 | 2 | 3 =
    ci === 1 || ci === 2 || ci === 3 ? ci : 0;

  return {
    id: String(r.id),
    year: Number(r.year) || 2024,
    examTag: String(r.exam_tag ?? `NEET ${Number(r.year) || 2024}`),
    subject: String(r.subject ?? 'Physics'),
    chapter: String(r.chapter ?? 'General'),
    question_hi: String(r.question_hi ?? ''),
    options_hi,
    correct_index,
    explanation_hi: String(r.explanation_hi ?? ''),
    isStarred: false,
    isSaved: false,
    createdAt: Number(r.created_at) || Date.now(),
  };
}

export function toSpecialRow(sp: SpecialItem): Record<string, unknown> {
  return {
    id: sp.id,
    title: sp.title,
    category: sp.category,
    subject: sp.subject,
    chapter: sp.chapter,
    content_hi: sp.content_hi,
    memory_trick_hi: sp.memoryTrick_hi ?? null,
    source_module_id: sp.sourceModuleId ?? null,
    created_at: sp.createdAt,
  };
}

export function fromSpecialRow(r: Record<string, unknown>): SpecialItem {
  const cat = String(r.category || 'Exception');
  const category: SpecialCategory =
    cat === 'Exception' ||
    cat === 'Trend' ||
    cat === 'Reaction' ||
    cat === 'Mnemonic' ||
    cat === 'Exam Trap'
      ? cat
      : 'Exception';

  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    category,
    subject: String(r.subject ?? 'Chemistry'),
    chapter: String(r.chapter ?? 'General'),
    content_hi: String(r.content_hi ?? ''),
    memoryTrick_hi: r.memory_trick_hi ? String(r.memory_trick_hi) : undefined,
    isStarred: false,
    sourceModuleId: r.source_module_id ? String(r.source_module_id) : undefined,
    createdAt: Number(r.created_at) || Date.now(),
  };
}

export function toModuleRow(m: UploadedModule): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    subject: m.subject,
    chapter: m.chapter,
    file_type: m.fileType,
    page_count: m.pageCount,
    extracted_chars: m.extractedChars,
    image_page_count: m.imagePageCount,
    extracted_summary: m.extractedSummary ?? null,
    generated_counts: m.generatedCounts,
    created_at: m.createdAt,
  };
}

export function fromModuleRow(r: Record<string, unknown>): UploadedModule {
  const ft = String(r.file_type || 'pdf');
  const fileType: UploadedModule['fileType'] =
    ft === 'images' || ft === 'mixed' ? ft : 'pdf';
  const counts = (r.generated_counts as Record<string, unknown>) || {};

  return {
    id: String(r.id),
    name: String(r.name ?? 'Module'),
    subject: String(r.subject ?? 'Botany'),
    chapter: String(r.chapter ?? 'General'),
    fileType,
    pageCount: Number(r.page_count) || 0,
    extractedChars: Number(r.extracted_chars) || 0,
    imagePageCount: Number(r.image_page_count) || 0,
    isStarred: false,
    extractedSummary: r.extracted_summary ? String(r.extracted_summary) : undefined,
    generatedCounts: {
      mcqs: Number(counts.mcqs) || 0,
      notes: Number(counts.notes) || 0,
      shortNotes: Number(counts.shortNotes) || 0,
      specials: Number(counts.specials) || 0,
    },
    createdAt: Number(r.created_at) || Date.now(),
  };
}

export function toSuggestionRow(s: StudentSuggestion): Record<string, unknown> {
  return {
    id: s.id,
    student_name: s.studentName,
    category: s.category,
    message: s.message,
    status: s.status,
    created_at: s.createdAt,
  };
}

export function fromSuggestionRow(r: Record<string, unknown>): StudentSuggestion {
  const cat = String(r.category || 'Feedback');
  const category: SuggestionCategory = ALLOWED_SUGGESTION_CATEGORIES.includes(
    cat as SuggestionCategory
  )
    ? (cat as SuggestionCategory)
    : 'Feedback';
  return {
    id: String(r.id),
    studentName: String(r.student_name ?? 'Anonymous Student'),
    category,
    message: String(r.message ?? ''),
    status: r.status === 'resolved' ? 'resolved' : 'open',
    createdAt: Number(r.created_at) || Date.now(),
  };
}

export function toQuestionReportRow(rep: QuestionReport): Record<string, unknown> {
  return {
    id: rep.id,
    question_id: rep.questionId,
    source_table: rep.sourceTable,
    subject: rep.subject,
    chapter: rep.chapter,
    question_snapshot: rep.questionSnapshot,
    reason: rep.reason,
    comment: rep.comment,
    status: rep.status,
    admin_note: rep.adminNote ?? null,
    resolved_at: rep.resolvedAt ?? null,
    created_at: rep.createdAt,
  };
}

export function fromQuestionReportRow(r: Record<string, unknown>): QuestionReport {
  const rawReason = String(r.reason || 'Other');
  const reason: ReportReason = ALLOWED_REPORT_REASONS.includes(rawReason as ReportReason)
    ? (rawReason as ReportReason)
    : 'Other';
  const rawStatus = String(r.status || 'open');
  const status: ReportStatus = ALLOWED_REPORT_STATUSES.includes(rawStatus as ReportStatus)
    ? (rawStatus as ReportStatus)
    : 'open';

  return {
    id: String(r.id),
    questionId: String(r.question_id ?? ''),
    sourceTable: r.source_table === 'pyqs' ? 'pyqs' : 'questions',
    subject: String(r.subject ?? 'Physics'),
    chapter: String(r.chapter ?? 'General'),
    questionSnapshot: String(r.question_snapshot ?? ''),
    reason,
    comment: String(r.comment ?? ''),
    status,
    adminNote: r.admin_note ? String(r.admin_note) : undefined,
    resolvedAt:
      typeof r.resolved_at === 'number'
        ? r.resolved_at
        : r.resolved_at
        ? Number(r.resolved_at)
        : undefined,
    createdAt: Number(r.created_at) || Date.now(),
  };
}
