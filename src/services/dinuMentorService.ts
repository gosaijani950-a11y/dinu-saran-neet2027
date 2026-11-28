import type { MCQQuestion } from '../types';

export type NeetDifficultyLevel =
  | 'Easy'
  | 'Medium'
  | 'Hard'
  | 'Advanced'
  | 'Ultra';

export type NeetQuestionBasis =
  | 'NCERT Line-by-Line'
  | 'Core Concept & Mechanism'
  | 'Assertion-Reason'
  | 'Statement I & II'
  | 'Multi-Statement (How many correct)'
  | 'Match the Column (List I & II)'
  | 'Multi-Concept Numerical'
  | 'NCERT Traps & Exceptions';

export interface PublishedQuizRecord {
  id: string;
  title: string;
  subject: 'Physics' | 'Chemistry' | 'Botany' | 'Zoology' | 'Full Mock';
  chapter: string;
  difficulty: NeetDifficultyLevel;
  questionBasis: NeetQuestionBasis;
  durationMins: number;
  questions: MCQQuestion[];
  createdAt: number;
  createdBy: string;
}

const LOCAL_PUBLISHED_QUIZZES_KEY = 'neet2027_global_published_quizzes_v1';
const LOCAL_ADMIN_BANK_KEY = 'neet2027_admin_persistent_bank_v1';
const SYNC_CHANNEL_NAME = 'neet2027_realtime_bank_sync';

function broadcastBankUpdate(questions: MCQQuestion[], quizzes: PublishedQuizRecord[]) {
  try {
    window.dispatchEvent(
      new CustomEvent('neet-published-quizzes-updated', {
        detail: { quizzes, questions },
      })
    );
    window.dispatchEvent(
      new CustomEvent('neet-questions-bank-synced', {
        detail: { questions },
      })
    );
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(SYNC_CHANNEL_NAME);
      bc.postMessage({ type: 'SYNC_ALL', questions, quizzes });
      bc.close();
    }
  } catch {}
}

export function getStoredApiKey(): string {
  try {
    const direct =
      localStorage.getItem('gemini_api_key') ||
      localStorage.getItem('neet_gemini_api_key');
    if (direct && direct.trim().length > 10) return direct.trim();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const val = localStorage.getItem(k) || '';
      const match = val.match(/AIzaSy[0-9A-Za-z_-]{30,}/);
      if (match) return match[0];
    }
  } catch {}
  return '';
}

/**
 * Deterministic ID generator from question text + subject so the SAME question
 * ALWAYS produces the EXACT same ID (0 duplicates ever, even across 1,000 syncs!)
 */
export function buildDeterministicQuestionId(raw: any): string {
  if (raw?.id !== undefined && raw?.id !== null && String(raw.id).trim().length > 0) {
    const existing = String(raw.id).trim();
    if (!existing.startsWith('admin_sync_')) {
      return existing;
    }
  }
  const stem = `${String(raw?.subject || '')}|${String(raw?.chapter || '')}|${String(
    raw?.question_hi || raw?.question_en || ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')}`;

  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < stem.length; i++) {
    const ch = stem.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashHex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  return `neet_q_${hashHex}`;
}

export function getQuestionContentFingerprint(q: any): string {
  return `${String(q?.subject || '').trim().toLowerCase()}::${String(
    q?.question_hi || q?.question_en || ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 180)}`;
}

export function deduplicateQuestionsList(list: MCQQuestion[]): MCQQuestion[] {
  const seenFingerprints = new Set<string>();
  const unique: MCQQuestion[] = [];
  for (const q of list) {
    if (!q) continue;
    const fp = getQuestionContentFingerprint(q);
    if (!fp || seenFingerprints.has(fp)) continue;
    seenFingerprints.add(fp);
    unique.push(q);
  }
  return unique;
}

export function normalizeStrictNeetQuestion(
  raw: any,
  idx: number,
  defaults: {
    subject?: string;
    chapter?: string;
    difficulty?: NeetDifficultyLevel;
    questionBasis?: NeetQuestionBasis;
  }
): MCQQuestion {
  const validSubjects = ['Physics', 'Chemistry', 'Botany', 'Zoology'] as const;
  const subj = validSubjects.includes(raw?.subject)
    ? raw.subject
    : validSubjects.includes(defaults.subject as any)
    ? defaults.subject
    : 'Botany';

  const rawOptsHi = Array.isArray(raw?.options_hi) ? raw.options_hi : [];
  const optionsHi = [0, 1, 2, 3].map((i) =>
    String(rawOptsHi[i] ?? raw?.options_en?.[i] ?? `विकल्प ${['A', 'B', 'C', 'D'][i]}`)
  );

  const rawOptsEn = Array.isArray(raw?.options_en) ? raw.options_en : [];
  const optionsEn = [0, 1, 2, 3].map((i) =>
    String(rawOptsEn[i] ?? optionsHi[i] ?? `Option ${['A', 'B', 'C', 'D'][i]}`)
  );

  const corrRaw =
    typeof raw?.correct_index === 'number'
      ? raw.correct_index
      : typeof raw?.correctIndex === 'number'
      ? raw.correctIndex
      : 0;
  const safeCorrect =
    Number.isFinite(corrRaw) && corrRaw >= 0 && corrRaw <= 3 ? corrRaw : 0;

  const diffInput = String(raw?.difficulty || defaults.difficulty || 'Hard');
  const mappedDiff: 'Easy' | 'Medium' | 'Hard' =
    diffInput === 'Easy' ? 'Easy' : diffInput === 'Medium' ? 'Medium' : 'Hard';

  const tags = Array.from(
    new Set(
      [
        ...(Array.isArray(raw?.tags) ? raw.tags.map(String) : []),
        defaults.difficulty || '',
        defaults.questionBasis || '',
      ].filter(Boolean)
    )
  );

  const stableId = buildDeterministicQuestionId({
    ...raw,
    subject: subj,
    chapter: raw?.chapter || defaults.chapter || 'NCERT High-Yield',
  });

  return {
    id: stableId,
    subject: subj as MCQQuestion['subject'],
    chapter: String(raw?.chapter || defaults.chapter || 'NCERT High-Yield'),
    difficulty: mappedDiff,
    question_hi: String(raw?.question_hi || raw?.question_en || `प्रश्न ${idx + 1}`),
    question_en: String(raw?.question_en || raw?.question_hi || `Question ${idx + 1}`),
    options_hi: optionsHi,
    options_en: optionsEn,
    correct_index: safeCorrect,
    explanation_hi: String(
      raw?.explanation_hi ||
        raw?.explanation_en ||
        'NCERT के सिद्धांत और अवधारणा के अनुसार सही विकल्प चुनें।'
    ),
    explanation_en: String(
      raw?.explanation_en ||
        raw?.explanation_hi ||
        'Select the correct option based on NCERT principle.'
    ),
    tags,
    isStarred: Boolean(raw?.isStarred),
    isSaved: true,
  };
}

export async function generateUltraNeetQuestions(params: {
  subject: string;
  chapter: string;
  count: number;
  difficulty: NeetDifficultyLevel;
  questionBasis: NeetQuestionBasis;
  customPrompt?: string;
  sourceContext?: string;
}): Promise<MCQQuestion[]> {
  const apiKey = getStoredApiKey();
  const {
    subject,
    chapter,
    count,
    difficulty,
    questionBasis,
    customPrompt = '',
    sourceContext = '',
  } = params;

  const difficultyDirective: Record<NeetDifficultyLevel, string> = {
    Easy: 'Direct foundational NCERT Class 11/12 concept check with clear unambiguous options.',
    Medium: 'Standard NEET-UG level conceptual application requiring solid NCERT understanding.',
    Hard: 'Tricky NEET-UG rank-decider level with close distractors, subtle NCERT exceptions, and 2-step logic.',
    Advanced:
      'NEET Top-500 / JEE-Main crossover level: multi-concept synthesis, deep NCERT line-by-line traps, experimental reasoning, and quantitative precision.',
    Ultra:
      'AIR-1 / Olympiad-grade NEET Masterclass level: combine 3+ sub-concepts from the chapter, include multi-statement evaluation ("How many of the above statements are correct?"), hidden edge-case exceptions from NCERT tables/diagrams/summary, and elimination-proof distractors.',
  };

  const basisDirective: Record<NeetQuestionBasis, string> = {
    'NCERT Line-by-Line':
      'Extract exact statements, numerical values, examples, and subtle wording directly from NCERT Class 11/12 textbook lines.',
    'Core Concept & Mechanism':
      'Test deep physiological, chemical, or physical mechanisms ("Why/How" behind processes, rate-limiting steps, sign conventions, graph interpretations).',
    'Assertion-Reason':
      'Format every question strictly as Assertion (A) and Reason (R) with standard 4 NEET A/R options.',
    'Statement I & II':
      'Format every question strictly with Statement I and Statement II and standard 4 NEET statement-evaluation options.',
    'Multi-Statement (How many correct)':
      'Present 4 to 5 statements (A, B, C, D, E) and ask "How many of the above statements are correct/incorrect?" with options like "Only two", "Only three", "All four", "None".',
    'Match the Column (List I & II)':
      'Format as Match List-I with List-II (4 pairs) and provide coded combinations (A-III, B-I, C-IV, D-II) as options.',
    'Multi-Concept Numerical':
      'Include multi-step numerical problems with realistic NEET physical constants, unit conversions, and trap intermediate values in distractors.',
    'NCERT Traps & Exceptions':
      'Focus specifically on biological/chemical exceptions, "incorrect/except" stems, and commonly confused NCERT pairs.',
  };

  if (!apiKey) {
    throw new Error(
      'Gemini API Key नहीं मिली। कृपया Settings (⚙️) में अपनी Gemini API Key सेव करें।'
    );
  }

  const promptText = `You are India's #1 NTA NEET-UG Senior Paper Setter and Kota Head Faculty.
Generate ${count} ultra-authentic, error-free, exam-ready NEET MCQs in Hindi (with complete English version too).

PARAMETERS:
- Subject: ${subject}
- Chapter: ${chapter}
- Difficulty Tier: ${difficulty} -> ${difficultyDirective[difficulty]}
- Question Basis / Pattern: ${questionBasis} -> ${basisDirective[questionBasis]}
${customPrompt ? `- Admin Special Instruction: ${customPrompt}` : ''}
${sourceContext ? `- Uploaded Reference Material:\n${sourceContext.slice(0, 3500)}` : ''}

STRICT QUALITY RULES:
1. NEVER write "(NCERT Line-by-Line #1)" or "[Chapter Name]" inside question_hi or question_en. Write clean, real NTA paper questions directly.
2. Every numerical calculation and factual answer MUST be 100% scientifically verified before setting correct_index (0, 1, 2, or 3).
3. Provide a crystal-clear step-by-step Hindi & English explanation citing the exact NCERT concept/formula.
4. Output ONLY a valid JSON array with exact schema:
[
  {
    "question_hi": "...",
    "question_en": "...",
    "options_hi": ["...", "...", "...", "..."],
    "options_en": ["...", "...", "...", "..."],
    "correct_index": 0,
    "explanation_hi": "...",
    "explanation_en": "...",
    "tags": ["${difficulty}", "${questionBasis}"]
  }
]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Gemini API Error (${response.status}): ${errBody.slice(0, 160)}`);
  }

  const json = await response.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AI से वैध प्रश्न प्राप्त नहीं हुए, कृपया पुनः प्रयास करें।');
  }

  return deduplicateQuestionsList(
    parsed.slice(0, count).map((item, idx) =>
      normalizeStrictNeetQuestion(item, idx, {
        subject,
        chapter,
        difficulty,
        questionBasis,
      })
    )
  );
}

/**
 * Duplicate-Free Persistent Local Storage + Schema-Adaptive Supabase Cloud Insert
 */
export async function publishAndPersistAdminQuiz(
  quiz: PublishedQuizRecord,
  supabaseClient?: any
): Promise<{ syncedToCloud: boolean; totalSaved: number; cloudCount: number }> {
  let syncedToCloud = false;
  let cloudCount = 0;

  const cleanNewQuestions = deduplicateQuestionsList(quiz.questions);
  const existingBank = getPersistentAdminQuestions();
  const mergedBank = deduplicateQuestionsList([...cleanNewQuestions, ...existingBank]);

  const existingQuizzes = getAllPublishedQuizzesLocal();
  const updatedQuizzes = [
    { ...quiz, questions: cleanNewQuestions },
    ...existingQuizzes.filter((item) => item.id !== quiz.id),
  ].slice(0, 150);

  try {
    localStorage.setItem(LOCAL_ADMIN_BANK_KEY, JSON.stringify(mergedBank));
    localStorage.setItem(LOCAL_PUBLISHED_QUIZZES_KEY, JSON.stringify(updatedQuizzes));
  } catch (e) {
    console.warn('LocalStorage quota warning:', e);
  }

  broadcastBankUpdate(mergedBank, updatedQuizzes);

  if (supabaseClient && cleanNewQuestions.length > 0) {
    try {
      const fullRows = cleanNewQuestions.map((q) => ({
        id: q.id,
        subject: q.subject,
        chapter: q.chapter,
        difficulty: q.difficulty,
        question_hi: q.question_hi,
        question_en: q.question_en,
        options_hi: q.options_hi,
        options_en: q.options_en,
        correct_index: q.correct_index,
        explanation_hi: q.explanation_hi,
        explanation_en: q.explanation_en,
        tags: Array.isArray(q.tags) ? q.tags : [],
      }));

      const { error: tierAErr } = await supabaseClient
        .from('questions')
        .upsert(fullRows, { onConflict: 'id' });

      if (!tierAErr) {
        syncedToCloud = true;
        cloudCount = fullRows.length;
      } else {
        const noIdRows = fullRows.map(({ id, ...rest }) => rest);
        const { error: tierBErr } = await supabaseClient
          .from('questions')
          .insert(noIdRows);

        if (!tierBErr) {
          syncedToCloud = true;
          cloudCount = noIdRows.length;
        } else {
          const minimalRows = cleanNewQuestions.map((q) => ({
            subject: q.subject,
            chapter: q.chapter,
            difficulty: q.difficulty,
            question_hi: q.question_hi,
            options_hi: q.options_hi,
            correct_index: q.correct_index,
            explanation_hi: q.explanation_hi,
          }));
          const { error: tierCErr } = await supabaseClient
            .from('questions')
            .insert(minimalRows);

          if (!tierCErr) {
            syncedToCloud = true;
            cloudCount = minimalRows.length;
          }
        }
      }

      await supabaseClient
        .from('published_quizzes')
        .upsert({
          id: quiz.id,
          title: quiz.title,
          subject: quiz.subject,
          chapter: quiz.chapter,
          difficulty: quiz.difficulty,
          question_basis: quiz.questionBasis,
          duration_mins: quiz.durationMins,
          questions: cleanNewQuestions,
          created_at: new Date(quiz.createdAt).toISOString(),
          created_by: quiz.createdBy,
        })
        .catch(() => {});
    } catch (cloudErr) {
      console.warn('Cloud push exception:', cloudErr);
    }
  }

  return { syncedToCloud, totalSaved: mergedBank.length, cloudCount };
}

/**
 * Pulls latest cloud questions cleanly with 0 duplicates
 */
export async function syncCloudQuestionsToAllPanels(
  supabaseClient?: any
): Promise<MCQQuestion[]> {
  const localPersistent = deduplicateQuestionsList(getPersistentAdminQuestions());
  const combined: MCQQuestion[] = [...localPersistent];

  if (supabaseClient) {
    try {
      const { data: cloudQuestions, error } = await supabaseClient
        .from('questions')
        .select('*')
        .limit(5000);

      if (!error && Array.isArray(cloudQuestions)) {
        cloudQuestions.forEach((raw: any, i: number) => {
          const norm = normalizeStrictNeetQuestion(raw, i, {
            subject: raw.subject,
            chapter: raw.chapter,
          });
          combined.push(norm);
        });
      }

      const { data: cloudQuizzes } = await supabaseClient
        .from('published_quizzes')
        .select('*')
        .limit(100);

      if (Array.isArray(cloudQuizzes) && cloudQuizzes.length > 0) {
        const localQuizzes = getAllPublishedQuizzesLocal();
        const qMap = new Map<string, PublishedQuizRecord>();
        for (const cq of cloudQuizzes) {
          qMap.set(String(cq.id), {
            id: String(cq.id),
            title: String(cq.title || 'NEET Test'),
            subject: cq.subject || 'Botany',
            chapter: String(cq.chapter || 'NCERT'),
            difficulty: cq.difficulty || 'Hard',
            questionBasis: cq.question_basis || 'NCERT Line-by-Line',
            durationMins: Number(cq.duration_mins) || 20,
            questions: Array.isArray(cq.questions) ? cq.questions : [],
            createdAt: cq.created_at ? new Date(cq.created_at).getTime() : Date.now(),
            createdBy: String(cq.created_by || 'Admin'),
          });
        }
        for (const lq of localQuizzes) {
          if (!qMap.has(lq.id)) qMap.set(lq.id, lq);
        }
        try {
          localStorage.setItem(
            LOCAL_PUBLISHED_QUIZZES_KEY,
            JSON.stringify(Array.from(qMap.values()).slice(0, 150))
          );
        } catch {}
      }
    } catch {}
  }

  const cleanMerged = deduplicateQuestionsList(combined);
  try {
    localStorage.setItem(LOCAL_ADMIN_BANK_KEY, JSON.stringify(cleanMerged));
  } catch {}
  return cleanMerged;
}

export function getAllPublishedQuizzesLocal(): PublishedQuizRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_PUBLISHED_QUIZZES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getPersistentAdminQuestions(): MCQQuestion[] {
  try {
    const raw = localStorage.getItem(LOCAL_ADMIN_BANK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? deduplicateQuestionsList(parsed) : [];
  } catch {
    return [];
  }
}

export function hasDinuMention(messageText: string): boolean {
  return /(^|\s)@dinu\b/i.test(String(messageText || ''));
}

export async function askDinuMentorReply(params: {
  userMessage: string;
  senderName?: string;
  recentContext?: string[];
}): Promise<string> {
  const cleanQuestion = params.userMessage.replace(/@dinu/gi, '').trim();
  const apiKey = getStoredApiKey();

  if (!apiKey) {
    return `@${params.senderName || 'Student'} भाई, मेरी AI सर्विस के लिए अभी Settings (⚙️) में Gemini API Key एक्टिव नहीं है। जैसे ही API Key सेव होगी, मैं आपके हर NEET डाउट, NCERT लाइन और न्यूमेरिकल का तुरंत सटीक जवाब दूँगा!`;
  }

  const prompt = `You are "@dinu", an ultra-smart, friendly, elder-brother NEET-UG 2027 Topper & AI Mentor in a student study community.
A student (${params.senderName || 'Aspirant'}) tagged @dinu and asked:
"${cleanQuestion || 'मुझे NEET की तैयारी में मदद चाहिए'}"

${
  params.recentContext && params.recentContext.length > 0
    ? `Recent chat context:\n${params.recentContext.slice(-4).join('\n')}`
    : ''
}

INSTRUCTIONS:
1. Reply in natural, warm Hinglish / Hindi (matching the student's language) starting with a direct, accurate answer.
2. Cite exact NCERT Class 11/12 concepts, formulas, or memory tricks where relevant.
3. Keep it crisp, structured with bullet points if needed, and zero fluff.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.45 },
      }),
    }
  );

  if (!res.ok) {
    throw new Error('Dinu AI response failed');
  }

  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return (
    reply ||
    'इस प्रश्न को थोड़ा और स्पष्ट लिखें, मैं तुरंत NCERT के अनुसार हल बताता हूँ!'
  );
}
