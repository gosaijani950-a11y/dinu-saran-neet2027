import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SINGLE_RUN_QUESTIONS,
  MCQ_BATCH_SIZE,
  buildUnifiedQuestionMap,
  deduplicateQuestions,
  evaluateQuizPerformance,
  filterQuestionsByPatterns,
  formatTimer,
  getSourceDensityEstimate,
  isThinkingLevelClamped,
  resolveThinkingLevel,
  safeParseGeminiJson,
  sanitizeOptionText,
} from './quizLogic.ts';
import type { MCQQuestion, PYQItem, QuizConfig } from '../types/index.ts';

test('sanitizeOptionText strips Hindi and English option prefixes cleanly', () => {
  assert.equal(sanitizeOptionText('(विकल्प क) माइटोकॉन्ड्रिया'), 'माइटोकॉन्ड्रिया');
  assert.equal(sanitizeOptionText('(क) राइबोसोम'), 'राइबोसोम');
  assert.equal(sanitizeOptionText('A) न्यूटन का द्वितीय नियम'), 'न्यूटन का द्वितीय नियम');
  assert.equal(sanitizeOptionText('Option B: $9.8\\ \\text{m/s}^2$'), '$9.8\\ \\text{m/s}^2$');
  assert.equal(sanitizeOptionText('3. क्लोरोप्लास्ट'), 'क्लोरोप्लास्ट');
  assert.equal(sanitizeOptionText('ATP संश्लेषण'), 'ATP संश्लेषण');
});

test('resolveThinkingLevel clamps xhigh to HIGH on Flash and Flash-Lite models', () => {
  assert.equal(resolveThinkingLevel('gemini-3.5-flash-lite', 'xhigh'), 'HIGH');
  assert.equal(isThinkingLevelClamped('gemini-3.5-flash-lite', 'xhigh'), true);
  assert.equal(resolveThinkingLevel('gemini-3.8-flash', 'xhigh'), 'HIGH');
  assert.equal(resolveThinkingLevel('gemini-4-hydrogen', 'xhigh'), 'XHIGH');
  assert.equal(isThinkingLevelClamped('gemini-4-hydrogen', 'xhigh'), false);
  assert.equal(resolveThinkingLevel('gemini-3.5-flash-lite', 'medium'), 'MEDIUM');
});

test('safeParseGeminiJson handles code fences, trailing commas, and unescaped LaTeX backslashes', () => {
  const messyJson = `\`\`\`json
  {
    "questions": [
      {
        "question_hi": "वेग $\\frac{dx}{dt}$ तथा $\\theta$ के बीच संबंध क्या है?",
        "options_hi": ["\\ce{H2O}", "\\sqrt{2gh}", "\\beta क्षय", "\\rho g h",],
        "correct_index": 0,
      }
    ]
  }
  \`\`\``;

  const parsed = safeParseGeminiJson<{
    questions: Array<{ question_hi: string; options_hi: string[]; correct_index: number }>;
  }>(messyJson);

  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].correct_index, 0);
  assert.ok(parsed.questions[0].options_hi[0].includes('\\ce{H2O}'));
  assert.ok(parsed.questions[0].options_hi[2].includes('\\beta'));
});

test('evaluateQuizPerformance computes Official NEET +4/-1 score, level, and weak/strong chapters', () => {
  const config: QuizConfig = {
    subject: 'All',
    chapters: ['Laws of Motion', 'Cell: The Unit of Life'],
    sourceMode: 'bank',
    questionCount: 4,
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
    layoutMode: 'single',
    scoringMode: 'neet',
    languageMode: 'hindi_only',
    timerMinutes: 10,
    untimed: false,
    deepNcertExpansion: false,
  };

  const makeQ = (id: string, subject: string, chapter: string, correct: 0 | 1 | 2 | 3): MCQQuestion => ({
    id,
    question_hi: `प्रश्न ${id}`,
    options_hi: ['A', 'B', 'C', 'D'],
    correct_index: correct,
    explanation_hi: 'व्याख्या',
    subject,
    chapter,
    difficulty: 'Medium',
    tags: ['NCERT Line'],
    concept_key: `key-${id}`,
    isStarred: false,
    isSaved: false,
    createdAt: Date.now(),
  });

  const questions: MCQQuestion[] = [
    makeQ('q1', 'Physics', 'Laws of Motion', 0),
    makeQ('q2', 'Physics', 'Laws of Motion', 1),
    makeQ('q3', 'Botany', 'Cell: The Unit of Life', 2),
    makeQ('q4', 'Botany', 'Cell: The Unit of Life', 3),
  ];

  // q1 correct (+4), q2 wrong (-1), q3 correct (+4), q4 skipped (0) -> NEET score = 7, accuracy = 50%
  const result = evaluateQuizPerformance({
    id: 'res-1',
    config,
    questions,
    answers: { q1: 0, q2: 3, q3: 2 },
    submissionType: 'manual',
    submittedAt: 1700000000000,
  });

  assert.equal(result.correctCount, 2);
  assert.equal(result.wrongCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.neetScore, 7);
  assert.equal(result.maxNeetScore, 16);
  assert.equal(result.accuracyPercent, 50);
  assert.equal(result.levelTitle, 'Building Grip');
  assert.equal(result.weakChapters.length, 2);
  assert.equal(result.strongChapters.length, 0);
});

test('deduplicateQuestions filters duplicate concept_keys and stems', () => {
  const existingConcepts = new Set(['ohm law formula']);
  const existingStems = new Set(['ओम का नियम क्या है?']);
  const base: MCQQuestion = {
    id: '1',
    question_hi: 'ओम का नियम क्या है?',
    options_hi: ['1', '2', '3', '4'],
    correct_index: 0,
    explanation_hi: 'exp',
    subject: 'Physics',
    chapter: 'Current Electricity',
    difficulty: 'Easy',
    tags: [],
    concept_key: 'new concept',
    isStarred: false,
    isSaved: false,
    createdAt: 1,
  };

  const uniqueQ: MCQQuestion = {
    ...base,
    id: '2',
    question_hi: 'किरचॉफ का प्रथम नियम किसके संरक्षण पर आधारित है?',
    concept_key: 'kirchhoff charge conservation',
  };

  const dupConceptQ: MCQQuestion = {
    ...base,
    id: '3',
    question_hi: 'प्रतिरोध का मात्रक क्या है?',
    concept_key: 'Ohm Law Formula',
  };

  const kept = deduplicateQuestions([base, uniqueQ, dupConceptQ], existingConcepts, existingStems);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, '2');
});

test('getSourceDensityEstimate and formatTimer produce accurate human output', () => {
  const est = getSourceDensityEstimate(12);
  assert.equal(est.minMcqs, 180);
  assert.equal(est.maxMcqs, 300);
  assert.ok(est.summary.includes('12 pages detected'));
  assert.equal(formatTimer(125), '02:05');
  assert.equal(formatTimer(3665), '01:01:05');
});

test('buildUnifiedQuestionMap merges MCQs and PYQs into one lookup dictionary', () => {
  const q: MCQQuestion = {
    id: 'mcq-1',
    question_hi: 'प्रश्न 1',
    options_hi: ['A', 'B', 'C', 'D'],
    correct_index: 1,
    explanation_hi: 'व्याख्या 1',
    subject: 'Physics',
    chapter: 'Laws of Motion',
    difficulty: 'Medium',
    tags: ['NCERT Line'],
    concept_key: 'c1',
    isStarred: false,
    isSaved: true,
    createdAt: 100,
  };
  const pyq: PYQItem = {
    id: 'pyq-2024-1',
    year: 2024,
    examTag: 'NEET 2024',
    subject: 'Chemistry',
    chapter: 'Equilibrium',
    question_hi: 'PYQ प्रश्न',
    options_hi: ['1', '2', '3', '4'],
    correct_index: 2,
    explanation_hi: 'PYQ व्याख्या',
    isStarred: true,
    isSaved: true,
    createdAt: 200,
  };

  const map = buildUnifiedQuestionMap([q], [pyq]);
  assert.equal(Object.keys(map).length, 2);
  assert.equal(map['mcq-1'].sourceTable, 'questions');
  assert.equal(map['pyq-2024-1'].sourceTable, 'pyqs');
  assert.equal(map['pyq-2024-1'].isSaved, true);
  assert.equal(map['pyq-2024-1'].year, 2024);
  assert.ok(map['pyq-2024-1'].tags.includes('PYQ'));
});

test('filterQuestionsByPatterns filters local bank questions by active Step 4 NEET toggles', () => {
  const pool = [
    { id: '1', tags: ['NCERT Line', 'Numerical'] },
    { id: '2', tags: ['NCERT Line', 'Exception'] },
    { id: '3', tags: ['Statement I & II'] },
    { id: '4', tags: ['Diagram/Concept'] },
  ];

  const allOff: QuizConfig['patterns'] = {
    ncertLine: false,
    exception: false,
    assertionReason: false,
    statementType: false,
    numerical: false,
    diagramConcept: false,
  };
  assert.equal(filterQuestionsByPatterns(pool, allOff).length, 4);

  const onlyException = filterQuestionsByPatterns(pool, { ...allOff, exception: true });
  assert.deepEqual(
    onlyException.map((x) => x.id),
    ['2']
  );

  const numericalOrDiagram = filterQuestionsByPatterns(pool, {
    ...allOff,
    numerical: true,
    diagramConcept: true,
  });
  assert.deepEqual(
    numericalOrDiagram.map((x) => x.id),
    ['1', '4']
  );

  assert.equal(MAX_SINGLE_RUN_QUESTIONS, 2000);
  assert.equal(MCQ_BATCH_SIZE, 10);
});

test('safeParseGeminiJson salvages complete MCQ objects when trailing item is truncated or malformed', () => {
  const truncatedJson = `{
    "questions": [
      {
        "question_hi": "माइटोकॉन्ड्रिया को कोशिका का ऊर्जा घर क्यों कहा जाता है?",
        "options_hi": ["ATP संश्लेषण", "प्रोटीन पाचन", "डीएनए प्रतिकृति", "प्रकाश संश्लेषण"],
        "correct_index": 0,
        "explanation_hi": "यह ऑक्सीकरणी फॉस्फोरिलीकरण द्वारा ATP बनाता है।",
        "subject": "Botany",
        "chapter": "Cell: The Unit of Life",
        "difficulty": "Easy",
        "tags": ["NCERT Line"],
        "concept_key": "mitochondria atp synthesis"
      },
      {
        "question_hi": "राइबोसोम किसके संश्लेषण का स्थल है?",
        "options_hi": ["प्रोटीन", "लिपिड", "ग्लूकोज", "स्टार्च"],
        "correct_index": 0,
        "explanation_hi": "राइबोसोम प्रोटीन संश्लेषण की फैक्ट्री है।",
        "subject": "Botany",
        "chapter": "Cell: The Unit of Life",
        "difficulty": "Easy",
        "tags": ["NCERT Line"],
        "concept_key": "ribosome protein factory"
      },
      {
        "question_hi": "यह अधूरा प्रश्न बीच में कट गया...`;

  const parsed = safeParseGeminiJson<{
    questions: Array<{ question_hi: string; correct_index: number }>;
  }>(truncatedJson);

  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.questions[0].correct_index, 0);
  assert.ok(parsed.questions[1].question_hi.includes('राइबोसोम'));
});
