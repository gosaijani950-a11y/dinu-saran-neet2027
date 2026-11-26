import type {
  ChapterPerformance,
  MCQQuestion,
  PYQItem,
  QuizConfig,
  QuizResultSummary,
  ThinkingLevelOption,
  UnifiedQuestionItem,
} from '../types';

export const MAX_SINGLE_RUN_QUESTIONS = 2000;
export const MCQ_BATCH_SIZE = 10;

/**
 * Converts a PYQItem into a unified MCQQuestion-compatible object for quizzes,
 * Mistake Bank, Save Vault, and checkpoint resume flows.
 */
export function pyqToUnifiedQuestion(p: PYQItem): UnifiedQuestionItem {
  return {
    id: p.id,
    question_hi: p.question_hi,
    options_hi: p.options_hi,
    correct_index: p.correct_index,
    explanation_hi: p.explanation_hi,
    subject: p.subject,
    chapter: p.chapter,
    difficulty: 'Medium',
    tags: ['PYQ', p.examTag].filter(Boolean),
    concept_key: `pyq-${p.id}`,
    isStarred: p.isStarred,
    isSaved: p.isSaved,
    year: p.year,
    createdAt: p.createdAt,
    sourceTable: 'pyqs',
    examTag: p.examTag,
  };
}

/**
 * Merges db.questions and db.pyqs into a single unified lookup dictionary.
 */
export function buildUnifiedQuestionMap(
  questions: MCQQuestion[],
  pyqs: PYQItem[]
): Record<string, UnifiedQuestionItem> {
  const map: Record<string, UnifiedQuestionItem> = {};
  for (const p of pyqs) {
    map[p.id] = pyqToUnifiedQuestion(p);
  }
  for (const q of questions) {
    map[q.id] = { ...q, sourceTable: 'questions' };
  }
  return map;
}

const PATTERN_TAG_MATCHERS: Record<keyof QuizConfig['patterns'], string[]> = {
  ncertLine: ['ncert line', 'ncert'],
  exception: ['exception', 'exam trap', 'trend'],
  assertionReason: ['assertion-reason', 'assertion reason'],
  statementType: ['statement i & ii', 'statement'],
  numerical: ['numerical', 'calculation'],
  diagramConcept: ['diagram/concept', 'diagram', 'concept'],
};

/**
 * Filters local bank questions using active Step 4 NEET Pattern toggles.
 * If at least one pattern pill is ON, keeps questions matching any active pattern tag.
 * If all pattern pills are OFF, returns all questions unfiltered.
 */
export function filterQuestionsByPatterns<T extends Pick<MCQQuestion, 'tags'>>(
  questions: T[],
  patterns: QuizConfig['patterns']
): T[] {
  const activeKeys = (Object.keys(patterns) as Array<keyof QuizConfig['patterns']>).filter(
    (k) => patterns[k]
  );
  if (activeKeys.length === 0) return questions;

  const allowedTags = activeKeys.flatMap((k) => PATTERN_TAG_MATCHERS[k]);
  return questions.filter((q) => {
    const qTags = (q.tags ?? []).map((t) => t.trim().toLowerCase());
    return qTags.some((tag) =>
      allowedTags.some((matcher) => tag === matcher || tag.includes(matcher))
    );
  });
}

/**
 * Strictly strips clumsy option prefixes, numbering, or Hindi/English bracketed tags
 * such as "(विकल्प क)", "(क)", "A)", "(a)", "Option A:", "1.", etc.
 */
export function sanitizeOptionText(raw: string): string {
  if (!raw) return '';
  let text = String(raw).trim();
  // Repeatedly strip leading option markers cleanly
  const patterns: RegExp[] = [
    /^\s*\(\s*(?:विकल्प|option|opt\.?)\s*[A-Da-dकखगघ1-4]\s*\)\s*[:.\-–—]?\s*/i,
    /^\s*(?:विकल्प|option|opt\.?)\s*[A-Da-dकखगघ1-4]\s*[:.)\-–—]\s*/i,
    /^\s*\(\s*[A-Da-dकखगघ1-4]\s*\)\s*[:.\-–—]?\s*/,
    /^\s*[A-Da-dकखगघ]\s*[).:\-–—]\s+/,
    /^\s*[1-4]\s*[).]\s+/,
  ];

  let changed = true;
  let guard = 0;
  while (changed && guard < 4) {
    changed = false;
    guard++;
    for (const regex of patterns) {
      const next = text.replace(regex, '');
      if (next !== text) {
        text = next.trim();
        changed = true;
      }
    }
  }
  return text;
}

/**
 * Clamps thinkingLevel for Gemini models:
 * Auto-clamps 'xhigh' to 'high' on Flash / Flash-Lite models to prevent API 400 rejection.
 */
export function resolveThinkingLevel(
  modelId: string,
  requested: ThinkingLevelOption
): 'HIGH' | 'MEDIUM' | 'LOW' | 'XHIGH' {
  const normalizedModel = (modelId || '').toLowerCase();
  const isFlash =
    normalizedModel.includes('flash') ||
    normalizedModel.includes('lite') ||
    normalizedModel.includes('gemini-3');

  if (requested === 'xhigh' && isFlash) {
    return 'HIGH';
  }
  return requested.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW' | 'XHIGH';
}

export function isThinkingLevelClamped(
  modelId: string,
  requested: ThinkingLevelOption
): boolean {
  return requested === 'xhigh' && resolveThinkingLevel(modelId, requested) === 'HIGH';
}

/**
 * Robust JSON parser and sanitizer that repairs markdown code fences,
 * trailing commas, and unescaped LaTeX backslashes (e.g. \alpha, \frac, \ce)
 * so Gemini structured JSON never crashes JSON.parse().
 */
export function safeParseGeminiJson<T = unknown>(rawText: string): T {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response received from Gemini.');
  }

  let cleaned = rawText.trim();

  // Strip ```json ... ``` fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // Extract outermost JSON object or array
  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');
  let start = -1;
  let end = -1;

  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    start = firstObj;
    end = cleaned.lastIndexOf('}');
  } else if (firstArr !== -1) {
    start = firstArr;
    end = cleaned.lastIndexOf(']');
  }

  if (start !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  // Direct parse first
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt repair pass
  }

  // Repair 1: remove trailing commas before } or ]
  let repaired = cleaned.replace(/,\s*([}\]])/g, '$1');

  // Repair 2: escape stray single backslashes inside JSON strings (LaTeX like \frac, \ce, \theta, \sqrt, \times, \beta, \rho, \newline)
  repaired = repairLatexBackslashesInJson(repaired);

  // Repair 3: replace raw unescaped control newlines inside strings
  repaired = escapeControlCharsInsideStrings(repaired);

  try {
    return JSON.parse(repaired) as T;
  } catch (err) {
    // Repair 4: Partial-object salvage using a balanced-brace scanner inside questions/pyqs/items arrays
    const salvaged = salvagePartialArrayPayload(repaired) ?? salvagePartialArrayPayload(cleaned);
    if (salvaged) {
      return salvaged as T;
    }
    const msg = err instanceof Error ? err.message : 'Malformed JSON';
    throw new Error(`JSON parse error: ${msg}`);
  }
}

function salvagePartialArrayPayload(text: string): Record<string, unknown> | null {
  const keys = ['questions', 'pyqs', 'items'] as const;
  for (const key of keys) {
    const keyRegex = new RegExp(`"${key}"\\s*:\\s*\\[`, 'i');
    const match = keyRegex.exec(text);
    if (!match) continue;
    const arrStart = match.index + match[0].length;
    const objects = extractBalancedObjectsFromArraySlice(text.slice(arrStart));
    if (objects.length > 0) {
      return { [key]: objects };
    }
  }

  // Fallback: if payload starts with an array `[`
  const firstBracket = text.indexOf('[');
  if (firstBracket !== -1 && (text.indexOf('{') === -1 || firstBracket < text.indexOf('{'))) {
    const objects = extractBalancedObjectsFromArraySlice(text.slice(firstBracket + 1));
    if (objects.length > 0) {
      return { questions: objects };
    }
  }
  return null;
}

function extractBalancedObjectsFromArraySlice(slice: string): unknown[] {
  const results: unknown[] = [];
  let inString = false;
  let depth = 0;
  let objStart = -1;

  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];

    if (ch === '"' && !isEscapedQuote(slice, i)) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === ']' && depth === 0) {
      break;
    }

    if (ch === '{') {
      if (depth === 0) {
        objStart = i;
      }
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && objStart !== -1) {
          const candidate = slice.slice(objStart, i + 1);
          const parsedObj = tryParseSingleObjectWithRepair(candidate);
          if (parsedObj) {
            results.push(parsedObj);
          }
          objStart = -1;
        }
      }
    }
  }

  return results;
}

function tryParseSingleObjectWithRepair(candidate: string): Record<string, unknown> | null {
  const attempts = [
    candidate,
    escapeControlCharsInsideStrings(
      repairLatexBackslashesInJson(candidate.replace(/,\s*([}\]])/g, '$1'))
    ),
  ];
  for (const attempt of attempts) {
    try {
      const val = JSON.parse(attempt);
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return val as Record<string, unknown>;
      }
    } catch {
      // Skip malformed individual object cleanly
    }
  }
  return null;
}

function repairLatexBackslashesInJson(input: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '"' && !isEscapedQuote(input, i)) {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString && ch === '\\') {
      const next = input[i + 1];
      if (!next) {
        out += '\\\\';
        continue;
      }

      // Already escaped backslash
      if (next === '\\') {
        out += '\\\\';
        i++;
        continue;
      }

      // Valid quote or slash or unicode escape \uXXXX
      if (next === '"' || next === '/') {
        out += '\\' + next;
        i++;
        continue;
      }

      if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(input.slice(i + 2, i + 6))) {
        out += input.slice(i, i + 6);
        i += 5;
        continue;
      }

      // Ambiguous escapes (\b, \f, \n, \r, \t) — check if followed by a letter making a LaTeX macro like \frac, \theta, \beta, \rho, \neq
      if (next === 'f' || next === 't' || next === 'b' || next === 'r') {
        const afterNext = input[i + 2] || '';
        if (/[a-zA-Z]/.test(afterNext)) {
          // Clearly a LaTeX command (\frac, \times, \theta, \beta, \rho, \rightarrow)
          out += '\\\\' + next;
          i++;
          continue;
        }
        out += '\\' + next;
        i++;
        continue;
      }

      if (next === 'n') {
        const rest = input.slice(i + 1, i + 8);
        if (/^n(?:eq|u\b|abla|ot|ewline|i\b)/.test(rest)) {
          out += '\\\\n';
          i++;
          continue;
        }
        out += '\\n';
        i++;
        continue;
      }

      // Any other backslash inside a JSON string (e.g. \alpha, \ce, \sqrt, \Delta, \_, \{, \})
      out += '\\\\' + next;
      i++;
      continue;
    }

    out += ch;
  }

  return out;
}

function isEscapedQuote(str: string, quoteIndex: number): boolean {
  let backslashes = 0;
  for (let i = quoteIndex - 1; i >= 0 && str[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function escapeControlCharsInsideStrings(input: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && !isEscapedQuote(input, i)) {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Evaluates a completed quiz into full KPIs, NEET (+4/-1) score,
 * mastery level diagnostic, and chapterwise weak (<70%) vs strong (>=70%) breakdown.
 */
export function evaluateQuizPerformance(params: {
  id: string;
  config: QuizConfig;
  questions: MCQQuestion[];
  answers: Record<string, number>;
  submissionType: 'manual' | 'auto';
  submittedAt?: number;
}): QuizResultSummary {
  const { id, config, questions, answers, submissionType } = params;
  const submittedAt = params.submittedAt ?? Date.now();

  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  const chapterMap = new Map<
    string,
    { subject: string; total: number; correct: number; wrong: number; skipped: number }
  >();

  for (const q of questions) {
    const chosen = answers[q.id];
    const key = `${q.subject}::${q.chapter}`;
    const entry = chapterMap.get(key) ?? {
      subject: q.subject,
      total: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
    };
    entry.total += 1;

    if (chosen === undefined || chosen === null) {
      skippedCount += 1;
      entry.skipped += 1;
    } else if (chosen === q.correct_index) {
      correctCount += 1;
      entry.correct += 1;
    } else {
      wrongCount += 1;
      entry.wrong += 1;
    }

    chapterMap.set(key, entry);
  }

  const totalQuestions = questions.length;
  const answeredCount = correctCount + wrongCount;
  const accuracyPercent =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const neetScore = correctCount * 4 - wrongCount * 1;
  const maxNeetScore = totalQuestions * 4;

  const chapterBreakdown: ChapterPerformance[] = Array.from(chapterMap.entries())
    .map(([key, stats]) => {
      const chapter = key.split('::')[1] ?? key;
      const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      return {
        chapter,
        subject: stats.subject,
        total: stats.total,
        correct: stats.correct,
        wrong: stats.wrong,
        skipped: stats.skipped,
        accuracy,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);

  const weakChapters = chapterBreakdown.filter((c) => c.accuracy < 70);
  const strongChapters = chapterBreakdown.filter((c) => c.accuracy >= 70);

  const { levelTitle, levelGuidance } = getMasteryLevel(accuracyPercent, weakChapters.length);

  return {
    id,
    config,
    questionIds: questions.map((q) => q.id),
    answers,
    submissionType,
    submittedAt,
    totalQuestions,
    answeredCount,
    correctCount,
    wrongCount,
    skippedCount,
    accuracyPercent,
    neetScore,
    maxNeetScore,
    levelTitle,
    levelGuidance,
    chapterBreakdown,
    weakChapters,
    strongChapters,
  };
}

export function getMasteryLevel(
  accuracyPercent: number,
  weakChapterCount: number
): { levelTitle: string; levelGuidance: string } {
  if (accuracyPercent >= 88) {
    return {
      levelTitle: 'NEET Topper Zone',
      levelGuidance:
        'Outstanding precision and NCERT recall. Push speed with mixed Advanced & Assertion-Reason drills.',
    };
  }
  if (accuracyPercent >= 72) {
    return {
      levelTitle: 'Strong Contender',
      levelGuidance:
        weakChapterCount > 0
          ? `Solid command overall. Clear the ${weakChapterCount} chapter${weakChapterCount > 1 ? 's' : ''} below 70% via your Mistake Bank to cross 650+ pace.`
          : 'Great chapter consistency. Increase difficulty to Hard/Advanced and tighten negative marking.',
    };
  }
  if (accuracyPercent >= 50) {
    return {
      levelTitle: 'Building Grip',
      levelGuidance:
        'Core concepts are forming, but NCERT lines and exceptions need targeted re-reading. Review every wrong option below.',
    };
  }
  return {
    levelTitle: 'Needs Focused Revision',
    levelGuidance:
      'Revise chapter Short Notes & NCERT Exceptions first, then reattempt your Mistake Bank before scaling question count.',
  };
}

/**
 * Estimates ideal source-locked MCQ count from uploaded page count.
 */
export function getSourceDensityEstimate(pageCount: number): {
  minMcqs: number;
  maxMcqs: number;
  summary: string;
} {
  const safePages = Math.max(1, pageCount);
  const minMcqs = Math.min(2000, safePages * 15);
  const maxMcqs = Math.min(3500, safePages * 25);
  return {
    minMcqs,
    maxMcqs,
    summary: `${safePages} page${safePages === 1 ? '' : 's'} detected — ideal for ~${minMcqs}–${maxMcqs} unique source-locked MCQs. Enable 'Deep NCERT Expansion' for 500+.`,
  };
}

/**
 * Deduplicates incoming questions against existing concept_keys and stems.
 */
export function deduplicateQuestions(
  incoming: MCQQuestion[],
  existingConceptKeys: Set<string>,
  existingStems: Set<string>
): MCQQuestion[] {
  const result: MCQQuestion[] = [];
  for (const q of incoming) {
    const normConcept = (q.concept_key || '').trim().toLowerCase();
    const normStem = (q.question_hi || '').trim().replace(/\s+/g, ' ').toLowerCase();

    if (!normStem || existingStems.has(normStem)) {
      continue;
    }
    if (normConcept && existingConceptKeys.has(normConcept)) {
      continue;
    }

    existingStems.add(normStem);
    if (normConcept) existingConceptKeys.add(normConcept);
    result.push(q);
  }
  return result;
}

/**
 * Formats timestamp in IST (Asia/Kolkata).
 */
export function formatISTTimestamp(timestamp: number): string {
  try {
    return (
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(timestamp)) + ' IST'
    );
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}
