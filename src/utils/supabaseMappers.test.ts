import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canPerformAdminAction,
  fromModuleRow,
  fromNoteRow,
  fromPyqRow,
  fromQuestionReportRow,
  fromQuestionRow,
  fromShortNoteRow,
  fromSpecialRow,
  fromSuggestionRow,
  isValidSupabaseConfig,
  resolveSupabaseConfig,
  toModuleRow,
  toNoteRow,
  toPyqRow,
  toQuestionReportRow,
  toQuestionRow,
  toShortNoteRow,
  toSpecialRow,
  toSuggestionRow,
  validateQuestionPatchInput,
  validateQuestionReportInput,
  validateSuggestionInput,
} from './supabaseMappers.ts';

test('resolveSupabaseConfig prefers browser settings over env vars and trims trailing slash', () => {
  const cfg = resolveSupabaseConfig(
    { supabaseUrl: 'https://abc.supabase.co/', supabaseAnonKey: 'anon-browser' },
    'https://env.supabase.co',
    'anon-env'
  );
  assert.equal(cfg.url, 'https://abc.supabase.co');
  assert.equal(cfg.anonKey, 'anon-browser');
  assert.equal(isValidSupabaseConfig(cfg), true);

  const fallback = resolveSupabaseConfig(
    { supabaseUrl: '', supabaseAnonKey: '' },
    'https://env.supabase.co/',
    'anon-env'
  );
  assert.equal(fallback.url, 'https://env.supabase.co');
  assert.equal(fallback.anonKey, 'anon-env');
  assert.equal(isValidSupabaseConfig({ url: 'ftp://bad', anonKey: 'k' }), false);
});

test('canPerformAdminAction strictly gates admin actions to admin role only', () => {
  assert.equal(canPerformAdminAction('student'), false);
  assert.equal(canPerformAdminAction('admin'), true);
});

test('validateSuggestionInput validates length, defaults blank name, and sanitizes category', () => {
  assert.equal(validateSuggestionInput({ category: 'Feedback', message: 'hi' }).ok, false);
  const res = validateSuggestionInput({
    studentName: '  ',
    category: 'Chapter / Notes Request',
    message: '  Please add Electrostatics short notes in Hindi!  ',
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.studentName, 'Anonymous Student');
    assert.equal(res.category, 'Chapter / Notes Request');
    assert.equal(res.message, 'Please add Electrostatics short notes in Hindi!');
  }
});

test('Supabase row mappers round-trip MCQs, Notes, ShortNotes, PYQs, Specials, Modules, and Suggestions', () => {
  const mcq = fromQuestionRow(
    toQuestionRow({
      id: 'q-1',
      question_hi: 'प्रश्न 1',
      options_hi: ['A', 'B', 'C', 'D'],
      correct_index: 2,
      explanation_hi: 'व्याख्या',
      subject: 'Physics',
      chapter: 'Laws of Motion',
      difficulty: 'Hard',
      tags: ['NCERT Line', 'Numerical'],
      concept_key: 'newton-2',
      isStarred: true,
      isSaved: true,
      createdAt: 1700000000000,
    })
  );
  assert.equal(mcq.correct_index, 2);
  assert.equal(mcq.isStarred, false);
  assert.equal(mcq.isSaved, false);

  const note = fromNoteRow(
    toNoteRow({
      id: 'n-1',
      title: 'नोट्स',
      subject: 'Botany',
      chapter: 'The Living World',
      content_hi: 'सामग्री',
      keyPoints_hi: ['बिंदु 1'],
      isStarred: true,
      createdAt: 100,
      updatedAt: 200,
    })
  );
  assert.deepEqual(note.keyPoints_hi, ['बिंदु 1']);

  const sn = fromShortNoteRow(
    toShortNoteRow({
      id: 'sn-1',
      title: 'सूत्र',
      subject: 'Physics',
      chapter: 'Work, Energy and Power',
      formulas_hi: ['$K = \\frac{1}{2}mv^2$'],
      quickPoints_hi: ['त्वरित बिंदु'],
      isStarred: false,
      createdAt: 100,
      updatedAt: 200,
    })
  );
  assert.equal(sn.formulas_hi.length, 1);

  const pyq = fromPyqRow(
    toPyqRow({
      id: 'pyq-1',
      year: 2023,
      examTag: 'NEET 2023',
      subject: 'Chemistry',
      chapter: 'Equilibrium',
      question_hi: 'PYQ प्रश्न',
      options_hi: ['1', '2', '3', '4'],
      correct_index: 1,
      explanation_hi: 'हल',
      isStarred: false,
      isSaved: false,
      createdAt: 300,
    })
  );
  assert.equal(pyq.examTag, 'NEET 2023');

  const sp = fromSpecialRow(
    toSpecialRow({
      id: 'sp-1',
      title: 'अपवाद',
      category: 'Exception',
      subject: 'Chemistry',
      chapter: 'Chemical Bonding and Molecular Structure',
      content_hi: 'विवरण',
      memoryTrick_hi: 'ट्रिक',
      isStarred: false,
      createdAt: 400,
    })
  );
  assert.equal(sp.memoryTrick_hi, 'ट्रिक');

  const mod = fromModuleRow(
    toModuleRow({
      id: 'mod-1',
      name: 'ncert-ch1.pdf',
      subject: 'Zoology',
      chapter: 'Animal Kingdom',
      fileType: 'pdf',
      pageCount: 12,
      extractedChars: 5400,
      imagePageCount: 2,
      isStarred: false,
      extractedSummary: 'Summary text',
      generatedCounts: { mcqs: 20, notes: 1, shortNotes: 1, specials: 3 },
      createdAt: 500,
    })
  );
  assert.equal(mod.generatedCounts.mcqs, 20);
  assert.equal(mod.extractedSummary, 'Summary text');

  const sug = fromSuggestionRow(
    toSuggestionRow({
      id: 'sug-1',
      studentName: 'Aarav',
      category: 'Bug',
      message: 'Timer check',
      status: 'resolved',
      createdAt: 600,
    })
  );
  assert.equal(sug.status, 'resolved');
  assert.equal(sug.studentName, 'Aarav');

  const rep = fromQuestionReportRow(
    toQuestionReportRow({
      id: 'rep-1',
      questionId: 'q-1',
      sourceTable: 'questions',
      subject: 'Physics',
      chapter: 'Laws of Motion',
      questionSnapshot: 'F = ma ?',
      reason: 'Formula / LaTeX / Typo',
      comment: 'Subscript typo in option B',
      status: 'resolved',
      adminNote: 'Fixed LaTeX braces',
      resolvedAt: 750,
      createdAt: 700,
    })
  );
  assert.equal(rep.questionId, 'q-1');
  assert.equal(rep.reason, 'Formula / LaTeX / Typo');
  assert.equal(rep.status, 'resolved');
  assert.equal(rep.adminNote, 'Fixed LaTeX braces');
  assert.equal(rep.resolvedAt, 750);
});

test('validateQuestionReportInput and validateQuestionPatchInput enforce strict schemas', () => {
  assert.equal(validateQuestionReportInput({ questionId: ' ', reason: 'Wrong Answer' }).ok, false);
  const validReport = validateQuestionReportInput({
    questionId: 'q-42',
    reason: 'Wrong Answer',
    comment: '  Option C should be correct per NCERT p. 112  ',
  });
  assert.equal(validReport.ok, true);
  if (validReport.ok) {
    assert.equal(validReport.reason, 'Wrong Answer');
    assert.equal(validReport.comment, 'Option C should be correct per NCERT p. 112');
  }

  assert.equal(
    validateQuestionPatchInput({
      question_hi: 'प्रश्न',
      options_hi: ['A', '', 'C', 'D'],
      correct_index: 1,
      explanation_hi: 'Exp',
      difficulty: 'Hard',
    }).ok,
    false
  );

  const validPatch = validateQuestionPatchInput({
    question_hi: '  नया प्रश्न $F=ma$  ',
    options_hi: [' 1 ', ' 2 ', ' 3 ', ' 4 '],
    correct_index: 2,
    explanation_hi: '  NCERT पृष्ठ 94  ',
    difficulty: 'Hard',
  });
  assert.equal(validPatch.ok, true);
  if (validPatch.ok) {
    assert.equal(validPatch.correct_index, 2);
    assert.deepEqual(validPatch.options_hi, ['1', '2', '3', '4']);
    assert.equal(validPatch.difficulty, 'Hard');
  }
});
