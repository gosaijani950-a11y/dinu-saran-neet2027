import type {
  AppSettings,
  DifficultyLevel,
  LanguageMode,
  MCQQuestion,
  PYQItem,
  ProcessedFilePage,
  QuizConfig,
  ShortNote,
  SpecialCategory,
  SpecialItem,
  StudyNote,
  SubjectName,
} from '../types';
import {
  resolveThinkingLevel,
  safeParseGeminiJson,
  sanitizeOptionText,
} from '../utils/quizLogic';

export const PRESET_GEMINI_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (Default • Fast & High Quota)' },
  { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Balanced Multimodal)' },
  { id: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen (Deep Reasoning & XHigh)' },
];

export class GeminiApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = status;
    this.code = code;
  }
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiCallParams {
  settings: AppSettings;
  systemInstruction: string;
  parts: GeminiPart[];
  jsonMode?: boolean;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  overrideModel?: string;
}

interface RawGeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

function supportsThinkingConfig(modelId: string): boolean {
  const m = (modelId || '').toLowerCase();
  return (
    m.includes('gemini-3') ||
    m.includes('gemini-4') ||
    m.includes('gemini-2.5') ||
    m.includes('thinking')
  );
}

function extractTextFromGeminiPayload(data: RawGeminiResponse): {
  text: string;
  finishReason?: string;
} {
  const finishReason = data?.candidates?.[0]?.finishReason;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  // Filter out internal thought parts if any are returned alongside output text
  const textParts = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text ?? '');
  const joined = textParts.join('\n').trim();
  if (!joined) {
    throw new GeminiApiError(
      `Gemini returned empty content${finishReason ? ` (finishReason: ${finishReason})` : ''}.`,
      502
    );
  }
  return { text: joined, finishReason };
}

async function rawGenerateContent(params: {
  apiKey: string;
  modelId: string;
  thinkingLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'XHIGH';
  systemInstruction: string;
  parts: GeminiPart[];
  jsonMode?: boolean;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<{ text: string; latencyMs: number; finishReason?: string }> {
  const {
    apiKey,
    modelId,
    thinkingLevel,
    systemInstruction,
    parts,
    jsonMode,
    responseSchema,
    temperature,
    maxOutputTokens,
    signal,
  } = params;

  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new GeminiApiError(
      'No Gemini API key configured. Open Settings (⚙️) and save your Gemini API key first.',
      401,
      'NO_API_KEY'
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelId.trim()
  )}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : 8192,
  };

  if (typeof temperature === 'number') {
    generationConfig.temperature = temperature;
  }

  if (supportsThinkingConfig(modelId)) {
    generationConfig.thinkingConfig = {
      thinkingLevel,
    };
  }

  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
    if (responseSchema) {
      generationConfig.responseSchema = responseSchema;
    }
  }

  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig,
  };

  if (systemInstruction.trim()) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new GeminiApiError('Request stopped by user.', 499, 'ABORTED');
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new GeminiApiError(`Network error contacting Gemini API: ${msg}`, 0, 'NETWORK_ERROR');
  }

  const latencyMs = Math.round(performance.now() - startedAt);
  let payload: RawGeminiResponse;
  try {
    payload = (await response.json()) as RawGeminiResponse;
  } catch {
    throw new GeminiApiError(
      `HTTP ${response.status}: Failed to read Gemini API response body.`,
      response.status
    );
  }

  if (!response.ok) {
    const apiMsg = payload?.error?.message || response.statusText || 'Unknown API failure';
    const statusLabel = payload?.error?.status || `HTTP_${response.status}`;
    throw new GeminiApiError(`${response.status} (${statusLabel}): ${apiMsg}`, response.status, statusLabel);
  }

  const extracted = extractTextFromGeminiPayload(payload);
  return {
    text: extracted.text,
    finishReason: extracted.finishReason,
    latencyMs,
  };
}

/**
 * Calls Gemini with automatic 1-pass fallback to Backup API Key on 429 Rate Limit.
 * Never infinite-loops.
 */
export async function callGemini(
  params: GeminiCallParams
): Promise<{ text: string; latencyMs: number; finishReason?: string; usedBackupKey: boolean }> {
  const modelId = params.overrideModel || params.settings.modelId || 'gemini-3.5-flash-lite';
  const resolvedLevel = resolveThinkingLevel(modelId, params.settings.thinkingLevel);

  try {
    const res = await rawGenerateContent({
      apiKey: params.settings.apiKey,
      modelId,
      thinkingLevel: resolvedLevel,
      systemInstruction: params.systemInstruction,
      parts: params.parts,
      jsonMode: params.jsonMode,
      responseSchema: params.responseSchema,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      signal: params.signal,
    });
    return { ...res, usedBackupKey: false };
  } catch (err) {
    const isRateLimit = err instanceof GeminiApiError && err.status === 429;
    const hasBackup = Boolean(params.settings.backupApiKey?.trim());

    if (isRateLimit && hasBackup && !params.signal?.aborted) {
      const backupRes = await rawGenerateContent({
        apiKey: params.settings.backupApiKey,
        modelId,
        thinkingLevel: resolvedLevel,
        systemInstruction: params.systemInstruction,
        parts: params.parts,
        jsonMode: params.jsonMode,
        responseSchema: params.responseSchema,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        signal: params.signal,
      });
      return { ...backupRes, usedBackupKey: true };
    }

    throw err;
  }
}

/**
 * Sends a minimal 1-token ping to the selected Gemini model and returns live latency + status.
 */
export async function testGeminiConnection(
  apiKey: string,
  modelId: string,
  thinkingLevel: AppSettings['thinkingLevel']
): Promise<{ ok: boolean; latencyMs: number; message: string; resolvedLevel: string }> {
  const resolvedLevel = resolveThinkingLevel(modelId, thinkingLevel);
  try {
    const res = await rawGenerateContent({
      apiKey,
      modelId: modelId || 'gemini-3.5-flash-lite',
      thinkingLevel: resolvedLevel,
      systemInstruction: 'Reply with OK.',
      parts: [{ text: 'Ping. Reply OK.' }],
      maxOutputTokens: 16,
    });
    return {
      ok: true,
      latencyMs: res.latencyMs,
      message: `Connected to ${modelId} (${res.latencyMs}ms)`,
      resolvedLevel,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    return {
      ok: false,
      latencyMs: 0,
      message: msg,
      resolvedLevel,
    };
  }
}

const FOCUS_ANGLES = [
  'Direct NCERT Line-by-Line Facts, Definitions & Exact Numerical Values',
  'NCERT Exceptions, Anomalous Trends, Special Cases & High-Yield Exam Traps',
  'Statement I & Statement II Evaluation and True/False Conceptual Pairs',
  'Assertion-Reason (अभिकथन और कारण) Analytical Reasoning',
  'Application-Based Numericals, Formula Derivations & Comparative Analysis',
];

function buildPartsFromPages(pages: ProcessedFilePage[], promptText: string): GeminiPart[] {
  const parts: GeminiPart[] = [];
  for (const page of pages) {
    if (page.text.trim()) {
      parts.push({
        text: `[Source: ${page.fileName} — Page ${page.pageNumber}]\n${page.text.slice(0, 7500)}`,
      });
    }
    if (page.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: page.mimeType || 'image/jpeg',
          data: page.imageBase64,
        },
      });
    }
  }
  parts.push({ text: promptText });
  return parts;
}

const MCQ_BATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question_hi: { type: 'STRING' },
          options_hi: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          correct_index: { type: 'INTEGER' },
          explanation_hi: { type: 'STRING' },
          subject: { type: 'STRING' },
          chapter: { type: 'STRING' },
          difficulty: { type: 'STRING' },
          tags: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          concept_key: { type: 'STRING' },
        },
        required: [
          'question_hi',
          'options_hi',
          'correct_index',
          'explanation_hi',
          'subject',
          'chapter',
          'difficulty',
          'tags',
          'concept_key',
        ],
      },
    },
  },
  required: ['questions'],
};

/**
 * Generates a single rolling batch of authentic Hindi NCERT NEET MCQs
 * with strict responseSchema, partial-object salvage, and 1x silent retry.
 */
export async function generateMCQBatch(params: {
  settings: AppSettings;
  config: QuizConfig;
  batchIndex: number;
  batchSize: number;
  coveredConcepts: string[];
  chunkPages?: ProcessedFilePage[];
  sourceModuleId?: string;
  signal?: AbortSignal;
}): Promise<{ questions: MCQQuestion[]; usedBackupKey: boolean }> {
  const {
    settings,
    config,
    batchIndex,
    batchSize,
    coveredConcepts,
    chunkPages,
    sourceModuleId,
    signal,
  } = params;

  const angle = FOCUS_ANGLES[batchIndex % FOCUS_ANGLES.length];
  const selectedPatterns: string[] = [];
  if (config.patterns.ncertLine) selectedPatterns.push('NCERT Line');
  if (config.patterns.exception) selectedPatterns.push('Exception');
  if (config.patterns.assertionReason) selectedPatterns.push('Assertion-Reason');
  if (config.patterns.statementType) selectedPatterns.push('Statement I & II');
  if (config.patterns.numerical) selectedPatterns.push('Numerical');
  if (config.patterns.diagramConcept) selectedPatterns.push('Diagram/Concept');

  const languageRule =
    config.languageMode === 'bilingual'
      ? 'Write questions, options, and explanations in natural NCERT Hindi (Devanagari), adding key English scientific terms in parentheses where helpful (e.g., परासरण (Osmosis)).'
      : 'Write ALL questions, ALL 4 options, and ALL explanations in 100% pure, natural NCERT-style Hindi (Devanagari). Keep chemical symbols, SI units, and LaTeX math formulas standard.';

  const systemInstruction = [
    'You are an elite NEET-UG 2027 Medical Entrance Exam question paper setter (NTA & NCERT expert).',
    languageRule,
    'JSON STRING HYGIENE (CRITICAL): Never use raw unescaped double quotes (") inside Hindi text strings; use single quotes (\') instead.',
    'OPTION HYGIENE (STRICT): Never include option prefixes like "(विकल्प क)", "(क)", "A)", "(a)", "Option A:", or "1." inside any option string. Output clean option text only.',
    'DIAGRAM HALLUCINATION GUARD (STRICT): NEVER write "जैसा कि चित्र में दिखाया गया है" or "as shown in the diagram/figure" or refer to any unseen figure/diagram/graph. Every single question must be 100% self-contained in text/LaTeX.',
    'MATH & CHEMISTRY FORMATTING: Wrap mathematical expressions in inline LaTeX $...$ and chemical formulas/equations in $\\ce{...}$ (e.g. $\\ce{H2SO4}$, $\\frac{1}{2}mv^2$). Double-escape all JSON backslashes properly.',
    settings.customRules.trim()
      ? `CUSTOM USER AI RULES (MUST FOLLOW): ${settings.customRules.trim()}`
      : '',
    'Return ONLY valid JSON matching the exact requested schema with no extra commentary.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const chapterList =
    config.chapters.length > 0 ? config.chapters.join(', ') : 'Full NEET 2027 PCBZ Syllabus';

  const sourceDirective =
    chunkPages && chunkPages.length > 0
      ? config.deepNcertExpansion
        ? 'Use the attached uploaded textbook/notes pages as primary anchor AND expand deeply into related NCERT 2027 concepts from these chapters to ensure fresh, non-repetitive NEET questions.'
        : 'Lock every question strictly to facts, formulas, reactions, and concepts present in the attached uploaded pages.'
      : 'Generate questions strictly aligned with authentic NEET 2027 rationalized NCERT textbook lines for the selected chapters.';

  const coveredSlice = coveredConcepts.slice(-120);

  const promptText = `Generate EXACTLY ${batchSize} unique, high-yield NEET 2027 MCQs for Batch #${batchIndex + 1}.

Subject Scope: ${config.subject}
Target Chapters: ${chapterList}
Difficulty: ${config.difficulty}
Required Question Patterns: ${selectedPatterns.length > 0 ? selectedPatterns.join(', ') : 'Balanced NCERT Mix'}
Batch Focus Angle: ${angle}
Source Directive: ${sourceDirective}
Never use raw unescaped double quotes (") inside Hindi text strings; use single quotes (') instead.

${
  coveredSlice.length > 0
    ? `ALREADY COVERED CONCEPTS (DO NOT REPEAT OR PARAPHRASE THESE):\n${coveredSlice.join(' | ')}\n`
    : ''
}
Output strictly valid JSON in this exact flat schema:
{
  "questions": [
    {
      "question_hi": "Clean Hindi question with $LaTeX$ if needed",
      "options_hi": ["option 1", "option 2", "option 3", "option 4"],
      "correct_index": 0,
      "explanation_hi": "Crisp NCERT-backed Hindi explanation",
      "subject": "Physics | Chemistry | Botany | Zoology",
      "chapter": "Exact chapter name from target list",
      "difficulty": "Easy | Medium | Hard | Advanced",
      "tags": ["NCERT Line"],
      "concept_key": "short 3-5 word unique English concept key"
    }
  ]
}`;

  const parts = buildPartsFromPages(chunkPages ?? [], promptText);

  const runOnce = async (): Promise<{ questions: MCQQuestion[]; usedBackupKey: boolean }> => {
    const { text, usedBackupKey } = await callGemini({
      settings,
      systemInstruction,
      parts,
      jsonMode: true,
      responseSchema: MCQ_BATCH_RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 16384,
      signal,
    });

    const parsed = safeParseGeminiJson<{
      questions?: Array<{
        question_hi?: string;
        options_hi?: string[];
        correct_index?: number;
        explanation_hi?: string;
        subject?: string;
        chapter?: string;
        difficulty?: string;
        tags?: string[];
        concept_key?: string;
      }>;
    }>(text);

    const rawList = Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (rawList.length === 0) {
      throw new GeminiApiError('JSON parse error: Gemini returned 0 valid questions in batch.', 502);
    }

    const now = Date.now();
    const normalized: MCQQuestion[] = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item?.question_hi || !Array.isArray(item.options_hi) || item.options_hi.length < 4) {
        continue;
      }

      const cleanOptions: [string, string, string, string] = [
        sanitizeOptionText(item.options_hi[0]),
        sanitizeOptionText(item.options_hi[1]),
        sanitizeOptionText(item.options_hi[2]),
        sanitizeOptionText(item.options_hi[3]),
      ];

      const correctIdx = Number(item.correct_index);
      const validCorrect = (
        Number.isInteger(correctIdx) && correctIdx >= 0 && correctIdx <= 3 ? correctIdx : 0
      ) as 0 | 1 | 2 | 3;

      const validDiff = (
        ['Easy', 'Medium', 'Hard', 'Advanced'].includes(String(item.difficulty))
          ? item.difficulty
          : config.difficulty === 'Mixed'
          ? 'Medium'
          : config.difficulty
      ) as Exclude<DifficultyLevel, 'Mixed'>;

      normalized.push({
        id: `mcq-${now}-${batchIndex}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        question_hi: String(item.question_hi).trim(),
        options_hi: cleanOptions,
        correct_index: validCorrect,
        explanation_hi: String(
          item.explanation_hi || 'NCERT संदर्भ के अनुसार सही विकल्प की पुष्टि करें।'
        ).trim(),
        subject:
          (item.subject && item.subject.trim()) ||
          (config.subject === 'All' ? 'Botany' : config.subject),
        chapter:
          (item.chapter && item.chapter.trim()) ||
          config.chapters[0] ||
          'General NEET 2027',
        difficulty: validDiff,
        tags:
          Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.map(String) : ['NCERT Line'],
        concept_key: String(item.concept_key || `batch-${batchIndex}-q-${i}`).trim(),
        isStarred: false,
        isSaved: false,
        sourceModuleId,
        createdAt: now + i,
      });
    }

    if (normalized.length === 0) {
      throw new GeminiApiError('JSON parse error: No questions had valid 4-option format.', 502);
    }

    return { questions: normalized, usedBackupKey };
  };

  try {
    return await runOnce();
  } catch (err) {
    const aborted = signal?.aborted || (err instanceof GeminiApiError && err.code === 'ABORTED');
    const isAuthOrQuotaError =
      err instanceof GeminiApiError && [400, 401, 403, 404, 429].includes(err.status);

    if (!aborted && !isAuthOrQuotaError) {
      // 1 automatic silent retry before surfacing batch parse/empty error
      return await runOnce();
    }
    throw err;
  }
}

/**
 * Generates Detailed Hindi Notes from Chapter Syllabus or Uploaded PDF/Photos.
 */
export async function generateDetailedNotes(params: {
  settings: AppSettings;
  subject: SubjectName;
  chapter: string;
  pages?: ProcessedFilePage[];
  languageMode?: LanguageMode;
  sourceModuleId?: string;
}): Promise<StudyNote> {
  const { settings, subject, chapter, pages, sourceModuleId } = params;
  const systemInstruction = [
    'You are an expert NEET 2027 Hindi-medium NCERT educator.',
    'Generate comprehensive, well-structured chapterwise conceptual study notes in crisp, natural Devanagari Hindi.',
    'Use inline LaTeX $...$ for Physics equations and $\\ce{...}$ for chemical formulas/reactions.',
    settings.customRules.trim() ? `CUSTOM USER RULES: ${settings.customRules.trim()}` : '',
    'Return strictly valid JSON only.',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Create detailed NCERT-aligned Hindi study notes for:
Subject: ${subject}
Chapter: ${chapter}
${pages && pages.length > 0 ? 'Base the notes directly on the attached uploaded pages/scans.' : 'Cover all core NEET 2027 high-yield concepts of this chapter.'}

Return JSON:
{
  "title": "Concise Hindi + chapter heading",
  "content_hi": "Detailed multi-section conceptual explanation in clean Hindi with clear headings and formulas ($...$, $\\ce{...}$)",
  "keyPoints_hi": ["5 to 10 high-yield NCERT bullet points in Hindi"]
}`;

  const { text } = await callGemini({
    settings,
    systemInstruction,
    parts: buildPartsFromPages((pages ?? []).slice(0, 8), prompt),
    jsonMode: true,
  });

  const parsed = safeParseGeminiJson<{
    title?: string;
    content_hi?: string;
    keyPoints_hi?: string[];
  }>(text);

  const now = Date.now();
  return {
    id: `note-${now}-${Math.random().toString(36).slice(2, 6)}`,
    title: parsed.title?.trim() || `${chapter} — विस्तृत नोट्स`,
    subject,
    chapter,
    content_hi: parsed.content_hi?.trim() || '',
    keyPoints_hi: Array.isArray(parsed.keyPoints_hi) ? parsed.keyPoints_hi.map(String) : [],
    isStarred: false,
    sourceModuleId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generates 1-Page Hindi Short Notes & Formula Cheatsheet.
 */
export async function generateShortNotes(params: {
  settings: AppSettings;
  subject: SubjectName;
  chapter: string;
  pages?: ProcessedFilePage[];
  sourceModuleId?: string;
}): Promise<ShortNote> {
  const { settings, subject, chapter, pages, sourceModuleId } = params;
  const systemInstruction = [
    'You are an expert NEET 2027 rapid-revision mentor.',
    'Generate a crisp 1-page rapid revision & formula sheet in natural Devanagari Hindi.',
    'Use $...$ for math formulas and $\\ce{...}$ for chemistry formulas.',
    settings.customRules.trim() ? `CUSTOM USER RULES: ${settings.customRules.trim()}` : '',
    'Return strictly valid JSON only.',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Create a 1-page Hindi Short Note & Formula Cheatsheet for:
Subject: ${subject}
Chapter: ${chapter}
${pages && pages.length > 0 ? 'Extract all formulas, reactions, and rapid-revision facts from the attached pages.' : 'Include every essential formula, constant, and quick-recall NCERT line.'}

Return JSON:
{
  "title": "Short revision title",
  "formulas_hi": ["Formula / equation / reaction with Hindi label"],
  "quickPoints_hi": ["8 to 14 rapid 1-line revision facts in Hindi"]
}`;

  const { text } = await callGemini({
    settings,
    systemInstruction,
    parts: buildPartsFromPages((pages ?? []).slice(0, 8), prompt),
    jsonMode: true,
  });

  const parsed = safeParseGeminiJson<{
    title?: string;
    formulas_hi?: string[];
    quickPoints_hi?: string[];
  }>(text);

  const now = Date.now();
  return {
    id: `short-${now}-${Math.random().toString(36).slice(2, 6)}`,
    title: parsed.title?.trim() || `${chapter} — 1-Page Revision`,
    subject,
    chapter,
    formulas_hi: Array.isArray(parsed.formulas_hi) ? parsed.formulas_hi.map(String) : [],
    quickPoints_hi: Array.isArray(parsed.quickPoints_hi) ? parsed.quickPoints_hi.map(String) : [],
    isStarred: false,
    sourceModuleId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generates High-Yield NCERT Special Exceptions, Trends, Reactions, Mnemonics & Exam Traps.
 */
export async function generateSpecialExceptions(params: {
  settings: AppSettings;
  subject: SubjectName;
  chapter: string;
  pages?: ProcessedFilePage[];
  sourceModuleId?: string;
}): Promise<SpecialItem[]> {
  const { settings, subject, chapter, pages, sourceModuleId } = params;
  const systemInstruction = [
    'You are a NEET 2027 NCERT Exception & Exam Trap specialist.',
    'Extract high-yield NCERT Exceptions, Anomalous Trends, Named Reactions, Mnemonics, and Common Exam Traps in pure Devanagari Hindi.',
    'Use $...$ and $\\ce{...}$ for formulas and equations.',
    settings.customRules.trim() ? `CUSTOM USER RULES: ${settings.customRules.trim()}` : '',
    'Return strictly valid JSON only.',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Extract 5 to 8 high-yield NEET Special items (Exceptions, Trends, Reactions, Mnemonics, Exam Traps) for:
Subject: ${subject}
Chapter: ${chapter}
${pages && pages.length > 0 ? 'Extract strictly from the attached uploaded material.' : 'Extract the most tested NCERT exceptions and traps for this chapter.'}

Return JSON:
{
  "items": [
    {
      "title": "Concise Hindi title",
      "category": "Exception | Trend | Reaction | Mnemonic | Exam Trap",
      "content_hi": "Clear Hindi explanation with formulas if needed",
      "memoryTrick_hi": "Short Hindi memory trick or exam tip"
    }
  ]
}`;

  const { text } = await callGemini({
    settings,
    systemInstruction,
    parts: buildPartsFromPages((pages ?? []).slice(0, 8), prompt),
    jsonMode: true,
  });

  const parsed = safeParseGeminiJson<{
    items?: Array<{
      title?: string;
      category?: string;
      content_hi?: string;
      memoryTrick_hi?: string;
    }>;
  }>(text);

  const validCategories: SpecialCategory[] = ['Exception', 'Trend', 'Reaction', 'Mnemonic', 'Exam Trap'];
  const now = Date.now();
  return (parsed.items ?? [])
    .filter((it) => it?.title && it?.content_hi)
    .map((it, idx) => ({
      id: `spec-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      title: String(it.title).trim(),
      category: validCategories.includes(it.category as SpecialCategory)
        ? (it.category as SpecialCategory)
        : 'Exception',
      subject,
      chapter,
      content_hi: String(it.content_hi).trim(),
      memoryTrick_hi: it.memoryTrick_hi ? String(it.memoryTrick_hi).trim() : undefined,
      isStarred: false,
      sourceModuleId,
      createdAt: now + idx,
    }));
}

/**
 * Extracts & verifies PYQ questions from uploaded PDF/Photo papers or chapter request.
 */
export async function extractPYQsFromUpload(params: {
  settings: AppSettings;
  subject: SubjectName;
  chapter: string;
  defaultYear: number;
  pages?: ProcessedFilePage[];
}): Promise<PYQItem[]> {
  const { settings, subject, chapter, defaultYear, pages } = params;
  const systemInstruction = [
    'You are a NEET Previous Year Question (PYQ) verification specialist.',
    'Extract or compile authentic NEET PYQs in pure Devanagari Hindi, verify the exact correct option, tag the exam year and chapter, and write a clear NCERT Hindi explanation.',
    'Never include option prefixes like A), (क), or Option A: inside options_hi.',
    'Never reference unseen diagrams or figures.',
    settings.customRules.trim() ? `CUSTOM USER RULES: ${settings.customRules.trim()}` : '',
    'Return strictly valid JSON only.',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt =
    pages && pages.length > 0
      ? `Extract all NEET PYQ questions from the attached uploaded paper pages (up to 15 per pass), translate/format into clean NCERT Hindi, detect year (fallback ${defaultYear}), verify answers, and add Hindi explanations.
Subject fallback: ${subject}
Chapter fallback: ${chapter}

Return JSON:
{
  "pyqs": [
    {
      "year": 2024,
      "examTag": "NEET 2024",
      "subject": "Physics | Chemistry | Botany | Zoology",
      "chapter": "Chapter name",
      "question_hi": "Hindi question",
      "options_hi": ["opt1", "opt2", "opt3", "opt4"],
      "correct_index": 0,
      "explanation_hi": "Verified Hindi explanation"
    }
  ]
}`
      : `Generate 8 authentic NEET Previous Year style verified PYQs (2018–2025) in pure NCERT Hindi for:
Subject: ${subject}
Chapter: ${chapter}
Return JSON:
{
  "pyqs": [
    {
      "year": 2023,
      "examTag": "NEET 2023",
      "subject": "${subject}",
      "chapter": "${chapter}",
      "question_hi": "Hindi question",
      "options_hi": ["opt1", "opt2", "opt3", "opt4"],
      "correct_index": 0,
      "explanation_hi": "Verified Hindi explanation"
    }
  ]
}`;

  const { text } = await callGemini({
    settings,
    systemInstruction,
    parts: buildPartsFromPages((pages ?? []).slice(0, 6), prompt),
    jsonMode: true,
  });

  const parsed = safeParseGeminiJson<{
    pyqs?: Array<{
      year?: number;
      examTag?: string;
      subject?: string;
      chapter?: string;
      question_hi?: string;
      options_hi?: string[];
      correct_index?: number;
      explanation_hi?: string;
    }>;
  }>(text);

  const now = Date.now();
  return (parsed.pyqs ?? [])
    .filter((p) => p?.question_hi && Array.isArray(p.options_hi) && p.options_hi.length >= 4)
    .map((p, idx) => ({
      id: `pyq-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      year: Number(p.year) || defaultYear,
      examTag: p.examTag?.trim() || `NEET ${Number(p.year) || defaultYear}`,
      subject: p.subject?.trim() || subject,
      chapter: p.chapter?.trim() || chapter,
      question_hi: String(p.question_hi).trim(),
      options_hi: [
        sanitizeOptionText(p.options_hi![0]),
        sanitizeOptionText(p.options_hi![1]),
        sanitizeOptionText(p.options_hi![2]),
        sanitizeOptionText(p.options_hi![3]),
      ],
      correct_index: (
        Number.isInteger(Number(p.correct_index)) &&
        Number(p.correct_index) >= 0 &&
        Number(p.correct_index) <= 3
          ? Number(p.correct_index)
          : 0
      ) as 0 | 1 | 2 | 3,
      explanation_hi: String(p.explanation_hi || '').trim(),
      isStarred: false,
      isSaved: false,
      createdAt: now + idx,
    }));
}

/**
 * Generates 3 simple Hindi bullet points explaining why the user's choice was wrong
 * and a crisp memory trick to remember the right answer.
 */
export async function explainQuestionDeeper(params: {
  settings: AppSettings;
  question: MCQQuestion;
  chosenIndex?: number;
}): Promise<string> {
  const { settings, question, chosenIndex } = params;
  const chosenText =
    chosenIndex !== undefined && question.options_hi[chosenIndex]
      ? `छात्र द्वारा चुना गया विकल्प: ${['A', 'B', 'C', 'D'][chosenIndex]} (${question.options_hi[chosenIndex]})`
      : 'छात्र ने यह प्रश्न छोड़ दिया (Skipped) या गहन व्याख्या माँगी है।';

  const systemInstruction = [
    'You are a warm, crystal-clear NEET 2027 Hindi tutor.',
    'Explain in EXACTLY 3 simple, crisp Hindi bullet points:',
    '• Bullet 1: Why the chosen option is wrong (or the common exam trap if skipped).',
    '• Bullet 2: Exact NCERT concept behind the right answer.',
    '• Bullet 3: A super-easy Hindi Memory Trick to never forget it.',
    'Use $...$ for math and $\\ce{...}$ for chemistry formulas.',
    settings.customRules.trim() ? `CUSTOM RULES: ${settings.customRules.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `प्रश्न: ${question.question_hi}
विकल्प:
A: ${question.options_hi[0]}
B: ${question.options_hi[1]}
C: ${question.options_hi[2]}
D: ${question.options_hi[3]}
सही उत्तर: ${['A', 'B', 'C', 'D'][question.correct_index]} (${question.options_hi[question.correct_index]})
${chosenText}
अध्याय: ${question.chapter} (${question.subject})`;

  const { text } = await callGemini({
    settings,
    systemInstruction,
    parts: [{ text: prompt }],
    jsonMode: false,
  });

  return text.trim();
}
