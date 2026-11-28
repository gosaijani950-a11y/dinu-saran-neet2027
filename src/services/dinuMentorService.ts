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

  return {
    id: String(
      raw?.id ||
        `neet_pro_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`
    ),
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

/**
 * Generates Ultra-High-Level NEET / AIR-1 MCQs using Gemini 2.5 Flash
 */
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
      'Gemini API Key नहीं मिली। कृपया Settings (⚙️) में अपनी Gemini API Key सेव करें ताकि Ultra-Level NEET प्रश्न जनरेट हो सकें।'
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

  return parsed.slice(0, count).map((item, idx) =>
    normalizeStrictNeetQuestion(item, idx, {
      subject,
      chapter,
      difficulty,
      questionBasis,
    })
  );
}

/**
 * Dual-Sync Persistence: Saves Admin Quizzes to Supabase (if configured) + LocalStorage so neither Admin nor Users ever lose them
 */
export async function publishAndPersistAdminQuiz(
  quiz: PublishedQuizRecord,
  supabaseClient?: any
): Promise<{ syncedToCloud: boolean; totalSaved: number }> {
  let syncedToCloud = false;

  // 1. Persist locally in both Admin Bank & Global Published Quizzes
  try {
    const existingRaw = localStorage.getItem(LOCAL_PUBLISHED_QUIZZES_KEY);
    const existingList: PublishedQuizRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
    const updatedList = [
      quiz,
      ...existingList.filter((item) => item.id !== quiz.id),
    ].slice(0, 100);
    localStorage.setItem(LOCAL_PUBLISHED_QUIZZES_KEY, JSON.stringify(updatedList));

    const bankRaw = localStorage.getItem(LOCAL_ADMIN_BANK_KEY);
    const bankList: MCQQuestion[] = bankRaw ? JSON.parse(bankRaw) : [];
    const mergedBank = [...quiz.questions, ...bankList].slice(0, 2000);
    localStorage.setItem(LOCAL_ADMIN_BANK_KEY, JSON.stringify(mergedBank));

    // Notify open tabs immediately
    window.dispatchEvent(
      new CustomEvent('neet-published-quizzes-updated', { detail: updatedList })
    );
  } catch (e) {
    console.error('Local persistence warning:', e);
  }

  // 2. Sync to Supabase so ALL student devices receive the quiz immediately
  if (supabaseClient) {
    try {
      // Try inserting into 'published_quizzes' table if present
      const { error: quizErr } = await supabaseClient.from('published_quizzes').upsert({
        id: quiz.id,
        title: quiz.title,
        subject: quiz.subject,
        chapter: quiz.chapter,
        difficulty: quiz.difficulty,
        question_basis: quiz.questionBasis,
        duration_mins: quiz.durationMins,
        questions: quiz.questions,
        created_at: new Date(quiz.createdAt).toISOString(),
        created_by: quiz.createdBy,
      });

      // Also upsert individual questions into 'questions' table for global bank sync
      const rows = quiz.questions.map((q) => ({
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
        tags: q.tags,
      }));
      const { error: qTableErr } = await supabaseClient.from('questions').upsert(rows);

      if (!quizErr || !qTableErr) {
        syncedToCloud = true;
      }
    } catch (cloudErr) {
      console.warn('Supabase cloud sync fallback active:', cloudErr);
    }
  }

  const allLocal = getAllPublishedQuizzesLocal();
  return { syncedToCloud, totalSaved: allLocal.length };
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Community @dinu AI Mentor Responder
 */
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
