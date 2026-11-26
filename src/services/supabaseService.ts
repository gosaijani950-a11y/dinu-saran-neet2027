import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppSettings,
  MCQQuestion,
  PYQItem,
  QuestionReport,
  ReportStatus,
  ShortNote,
  SpecialItem,
  StudentSuggestion,
  StudyNote,
  UploadedModule,
} from '../types';
import {
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
  validateQuestionReportInput,
  validateSuggestionInput,
} from '../utils/supabaseMappers';

export const SUPABASE_SETUP_SQL = `-- DINU SARAN NEET 2027 — Supabase Schema & Strict RLS Setup
-- Paste into Supabase SQL Editor and run once.

-- 1. Admins allowlist table (verified against Supabase Auth auth.uid())
CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. SECURITY DEFINER helper for strict RLS checks
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  );
$$;

-- 3. Study Content Tables (Public SELECT for Students, Admin-only WRITE)
CREATE TABLE IF NOT EXISTS public.questions (
  id text PRIMARY KEY,
  question_hi text NOT NULL,
  options_hi jsonb NOT NULL,
  correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation_hi text NOT NULL DEFAULT '',
  subject text NOT NULL,
  chapter text NOT NULL,
  difficulty text NOT NULL DEFAULT 'Medium',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  concept_key text NOT NULL,
  is_starter_sample boolean NOT NULL DEFAULT false,
  source_module_id text,
  year integer,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notes (
  id text PRIMARY KEY,
  title text NOT NULL,
  subject text NOT NULL,
  chapter text NOT NULL,
  content_hi text NOT NULL,
  key_points_hi jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_module_id text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.short_notes (
  id text PRIMARY KEY,
  title text NOT NULL,
  subject text NOT NULL,
  chapter text NOT NULL,
  formulas_hi jsonb NOT NULL DEFAULT '[]'::jsonb,
  quick_points_hi jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_module_id text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pyqs (
  id text PRIMARY KEY,
  year integer NOT NULL,
  exam_tag text NOT NULL,
  subject text NOT NULL,
  chapter text NOT NULL,
  question_hi text NOT NULL,
  options_hi jsonb NOT NULL,
  correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation_hi text NOT NULL DEFAULT '',
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.specials (
  id text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  chapter text NOT NULL,
  content_hi text NOT NULL,
  memory_trick_hi text,
  source_module_id text,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.modules (
  id text PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL,
  chapter text NOT NULL,
  file_type text NOT NULL DEFAULT 'pdf',
  page_count integer NOT NULL DEFAULT 0,
  extracted_chars integer NOT NULL DEFAULT 0,
  image_page_count integer NOT NULL DEFAULT 0,
  extracted_summary text,
  generated_counts jsonb NOT NULL DEFAULT '{"mcqs":0,"notes":0,"shortNotes":0,"specials":0}'::jsonb,
  created_at bigint NOT NULL
);

-- 4. Student Suggestions & Feedback Box (Public INSERT ONLY; Admin-only READ/UPDATE/DELETE)
CREATE TABLE IF NOT EXISTS public.suggestions (
  id text PRIMARY KEY,
  student_name text NOT NULL DEFAULT 'Anonymous Student',
  category text NOT NULL CHECK (category IN ('Feedback', 'Chapter / Notes Request', 'Bug', 'Other')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at bigint NOT NULL
);

-- 4b. Student Question Reports (Public INSERT ONLY; Admin-only READ/UPDATE/DELETE)
CREATE TABLE IF NOT EXISTS public.question_reports (
  id text PRIMARY KEY,
  question_id text NOT NULL,
  source_table text NOT NULL DEFAULT 'questions' CHECK (source_table IN ('questions', 'pyqs')),
  subject text NOT NULL,
  chapter text NOT NULL,
  question_snapshot text NOT NULL DEFAULT '',
  reason text NOT NULL CHECK (reason IN ('Wrong Answer', 'Formula / LaTeX / Typo', 'Ambiguous / Out of Scope', 'Explanation Issue', 'Other')),
  comment text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  admin_note text,
  resolved_at bigint,
  created_at bigint NOT NULL
);

-- 5. Enable Row-Level Security (RLS)
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pyqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;

-- 6. Policies: Admins table
DROP POLICY IF EXISTS "admins_select_self" ON public.admins;
CREATE POLICY "admins_select_self" ON public.admins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- 7. Policies: Study tables (Public read, Admin-only write)
DROP POLICY IF EXISTS "questions_public_select" ON public.questions;
CREATE POLICY "questions_public_select" ON public.questions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "questions_admin_insert" ON public.questions;
CREATE POLICY "questions_admin_insert" ON public.questions FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "questions_admin_update" ON public.questions;
CREATE POLICY "questions_admin_update" ON public.questions FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "questions_admin_delete" ON public.questions;
CREATE POLICY "questions_admin_delete" ON public.questions FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "notes_public_select" ON public.notes;
CREATE POLICY "notes_public_select" ON public.notes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "notes_admin_insert" ON public.notes;
CREATE POLICY "notes_admin_insert" ON public.notes FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "notes_admin_update" ON public.notes;
CREATE POLICY "notes_admin_update" ON public.notes FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "notes_admin_delete" ON public.notes;
CREATE POLICY "notes_admin_delete" ON public.notes FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "short_notes_public_select" ON public.short_notes;
CREATE POLICY "short_notes_public_select" ON public.short_notes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "short_notes_admin_insert" ON public.short_notes;
CREATE POLICY "short_notes_admin_insert" ON public.short_notes FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "short_notes_admin_update" ON public.short_notes;
CREATE POLICY "short_notes_admin_update" ON public.short_notes FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "short_notes_admin_delete" ON public.short_notes;
CREATE POLICY "short_notes_admin_delete" ON public.short_notes FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "pyqs_public_select" ON public.pyqs;
CREATE POLICY "pyqs_public_select" ON public.pyqs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pyqs_admin_insert" ON public.pyqs;
CREATE POLICY "pyqs_admin_insert" ON public.pyqs FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "pyqs_admin_update" ON public.pyqs;
CREATE POLICY "pyqs_admin_update" ON public.pyqs FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "pyqs_admin_delete" ON public.pyqs;
CREATE POLICY "pyqs_admin_delete" ON public.pyqs FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "specials_public_select" ON public.specials;
CREATE POLICY "specials_public_select" ON public.specials FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "specials_admin_insert" ON public.specials;
CREATE POLICY "specials_admin_insert" ON public.specials FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "specials_admin_update" ON public.specials;
CREATE POLICY "specials_admin_update" ON public.specials FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "specials_admin_delete" ON public.specials;
CREATE POLICY "specials_admin_delete" ON public.specials FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "modules_public_select" ON public.modules;
CREATE POLICY "modules_public_select" ON public.modules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "modules_admin_insert" ON public.modules;
CREATE POLICY "modules_admin_insert" ON public.modules FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "modules_admin_update" ON public.modules;
CREATE POLICY "modules_admin_update" ON public.modules FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "modules_admin_delete" ON public.modules;
CREATE POLICY "modules_admin_delete" ON public.modules FOR DELETE TO authenticated USING (public.is_admin());

-- 8. Policies: Suggestions table (Public INSERT ONLY; Admin-only SELECT/UPDATE/DELETE)
DROP POLICY IF EXISTS "suggestions_public_insert" ON public.suggestions;
CREATE POLICY "suggestions_public_insert" ON public.suggestions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "suggestions_admin_select" ON public.suggestions;
CREATE POLICY "suggestions_admin_select" ON public.suggestions FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "suggestions_admin_update" ON public.suggestions;
CREATE POLICY "suggestions_admin_update" ON public.suggestions FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "suggestions_admin_delete" ON public.suggestions;
CREATE POLICY "suggestions_admin_delete" ON public.suggestions FOR DELETE TO authenticated USING (public.is_admin());

-- 8b. Policies: Question Reports table (Public INSERT ONLY; Admin-only SELECT/UPDATE/DELETE)
DROP POLICY IF EXISTS "question_reports_public_insert" ON public.question_reports;
CREATE POLICY "question_reports_public_insert" ON public.question_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'open' AND resolved_at IS NULL AND admin_note IS NULL);
DROP POLICY IF EXISTS "question_reports_admin_select" ON public.question_reports;
CREATE POLICY "question_reports_admin_select" ON public.question_reports
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "question_reports_admin_update" ON public.question_reports;
CREATE POLICY "question_reports_admin_update" ON public.question_reports
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "question_reports_admin_delete" ON public.question_reports;
CREATE POLICY "question_reports_admin_delete" ON public.question_reports
  FOR DELETE TO authenticated USING (public.is_admin());

-- 9. Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.questions, public.notes, public.short_notes, public.pyqs, public.specials, public.modules TO anon, authenticated;
GRANT INSERT ON public.suggestions, public.question_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions, public.notes, public.short_notes, public.pyqs, public.specials, public.modules, public.suggestions, public.question_reports TO authenticated;
GRANT SELECT ON public.admins TO authenticated;

-- 10. NEXT STEP: Create your Admin user in Authentication -> Users, then run:
-- INSERT INTO public.admins (user_id, email)
-- SELECT id, email FROM auth.users WHERE email = 'your-admin@example.com'
-- ON CONFLICT (user_id) DO NOTHING;
`;

let cachedKey = '';
let cachedClient: SupabaseClient | null = null;

export function getEffectiveSupabaseConfig(settings: AppSettings) {
  return resolveSupabaseConfig(
    settings,
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  );
}

export function isSupabaseConfigured(settings: AppSettings): boolean {
  return isValidSupabaseConfig(getEffectiveSupabaseConfig(settings));
}

export function getSupabaseClient(settings: AppSettings): SupabaseClient | null {
  const cfg = getEffectiveSupabaseConfig(settings);
  if (!isValidSupabaseConfig(cfg)) return null;
  const cacheId = `${cfg.url}::${cfg.anonKey}`;
  if (cachedClient && cachedKey === cacheId) {
    return cachedClient;
  }
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  cachedKey = cacheId;
  return cachedClient;
}

export async function verifyAdminStatus(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.user_id);
}

export async function checkCurrentAdminSession(
  settings: AppSettings
): Promise<{ isAdmin: boolean; email: string | null; userId: string | null }> {
  const client = getSupabaseClient(settings);
  if (!client) return { isAdmin: false, email: null, userId: null };
  try {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (!user) return { isAdmin: false, email: null, userId: null };
    const isAdmin = await verifyAdminStatus(client, user.id);
    if (!isAdmin) {
      return { isAdmin: false, email: user.email ?? null, userId: user.id };
    }
    return { isAdmin: true, email: user.email ?? null, userId: user.id };
  } catch {
    return { isAdmin: false, email: null, userId: null };
  }
}

export async function signInAsAdmin(
  settings: AppSettings,
  email: string,
  password: string
): Promise<{ ok: true; email: string; userId: string } | { ok: false; error: string }> {
  const client = getSupabaseClient(settings);
  if (!client) {
    return {
      ok: false,
      error: 'Supabase URL and Anon Key are not configured yet. Open Cloud & Admin Setup first.',
    };
  }
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) {
    return { ok: false, error: 'Enter both Admin Email and Password.' };
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message || 'Invalid Supabase login credentials.' };
  }

  const isAdmin = await verifyAdminStatus(client, data.user.id);
  if (!isAdmin) {
    await client.auth.signOut();
    return {
      ok: false,
      error: 'Access denied: this user ID is not registered in public.admins.',
    };
  }

  return { ok: true, email: data.user.email || cleanEmail, userId: data.user.id };
}

export async function signOutAdmin(settings: AppSettings): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // ignore signOut failures
  }
}

export async function testSupabaseConnection(
  settings: AppSettings
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient(settings);
  if (!client) {
    return { ok: false, message: 'Enter a valid Supabase Project URL (https://...) and Anon Key.' };
  }
  const { error } = await client.from('questions').select('id').limit(1);
  if (error) {
    return {
      ok: false,
      message: `Connected to Supabase, but table check returned: ${error.message}. Run the SQL Setup Script in Supabase SQL Editor first.`,
    };
  }
  return { ok: true, message: 'Supabase connected & public.questions RLS verified!' };
}

export async function pullPublishedStudyData(settings: AppSettings): Promise<{
  questions: MCQQuestion[];
  notes: StudyNote[];
  shortNotes: ShortNote[];
  pyqs: PYQItem[];
  specials: SpecialItem[];
  modules: UploadedModule[];
} | null> {
  const client = getSupabaseClient(settings);
  if (!client) return null;

  const [qRes, nRes, snRes, pRes, spRes, mRes] = await Promise.all([
    client.from('questions').select('*').order('created_at', { ascending: false }),
    client.from('notes').select('*').order('created_at', { ascending: false }),
    client.from('short_notes').select('*').order('created_at', { ascending: false }),
    client.from('pyqs').select('*').order('created_at', { ascending: false }),
    client.from('specials').select('*').order('created_at', { ascending: false }),
    client.from('modules').select('*').order('created_at', { ascending: false }),
  ]);

  const firstErr =
    qRes.error || nRes.error || snRes.error || pRes.error || spRes.error || mRes.error;
  if (firstErr) {
    throw new Error(firstErr.message);
  }

  return {
    questions: (qRes.data ?? []).map((r) => fromQuestionRow(r as Record<string, unknown>)),
    notes: (nRes.data ?? []).map((r) => fromNoteRow(r as Record<string, unknown>)),
    shortNotes: (snRes.data ?? []).map((r) => fromShortNoteRow(r as Record<string, unknown>)),
    pyqs: (pRes.data ?? []).map((r) => fromPyqRow(r as Record<string, unknown>)),
    specials: (spRes.data ?? []).map((r) => fromSpecialRow(r as Record<string, unknown>)),
    modules: (mRes.data ?? []).map((r) => fromModuleRow(r as Record<string, unknown>)),
  };
}

/* ==================== ADMIN CLOUD MUTATIONS ==================== */

export async function upsertCloudQuestions(
  settings: AppSettings,
  items: MCQQuestion[]
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client || items.length === 0) return;
  const rows = items.map(toQuestionRow);
  const { error } = await client.from('questions').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteCloudQuestion(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertCloudNote(settings: AppSettings, note: StudyNote): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('notes').upsert(toNoteRow(note), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteCloudNote(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertCloudShortNote(
  settings: AppSettings,
  sheet: ShortNote
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client
    .from('short_notes')
    .upsert(toShortNoteRow(sheet), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteCloudShortNote(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('short_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertCloudPyqs(settings: AppSettings, items: PYQItem[]): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client || items.length === 0) return;
  const { error } = await client
    .from('pyqs')
    .upsert(items.map(toPyqRow), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteCloudPyq(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('pyqs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertCloudSpecials(
  settings: AppSettings,
  items: SpecialItem[]
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client || items.length === 0) return;
  const { error } = await client
    .from('specials')
    .upsert(items.map(toSpecialRow), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteCloudSpecial(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('specials').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertCloudModule(
  settings: AppSettings,
  mod: UploadedModule
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('modules').upsert(toModuleRow(mod), { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteCloudModule(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('modules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function pushFullLocalLibraryToCloud(
  settings: AppSettings,
  data: {
    questions: MCQQuestion[];
    notes: StudyNote[];
    shortNotes: ShortNote[];
    pyqs: PYQItem[];
    specials: SpecialItem[];
    modules: UploadedModule[];
  }
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  if (data.questions.length > 0) {
    // Chunk question upserts in batches of 200 for payload safety
    for (let i = 0; i < data.questions.length; i += 200) {
      await upsertCloudQuestions(settings, data.questions.slice(i, i + 200));
    }
  }
  if (data.notes.length > 0) {
    const { error } = await client
      .from('notes')
      .upsert(data.notes.map(toNoteRow), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
  if (data.shortNotes.length > 0) {
    const { error } = await client
      .from('short_notes')
      .upsert(data.shortNotes.map(toShortNoteRow), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
  if (data.pyqs.length > 0) {
    await upsertCloudPyqs(settings, data.pyqs);
  }
  if (data.specials.length > 0) {
    await upsertCloudSpecials(settings, data.specials);
  }
  if (data.modules.length > 0) {
    const { error } = await client
      .from('modules')
      .upsert(data.modules.map(toModuleRow), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
}

export async function clearCloudStudySection(
  settings: AppSettings,
  target: 'questions' | 'notes' | 'shortNotes' | 'pyqs' | 'specials' | 'modules' | 'ALL'
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;

  const tableMap: Record<
    Exclude<typeof target, 'ALL'>,
    'questions' | 'notes' | 'short_notes' | 'pyqs' | 'specials' | 'modules'
  > = {
    questions: 'questions',
    notes: 'notes',
    shortNotes: 'short_notes',
    pyqs: 'pyqs',
    specials: 'specials',
    modules: 'modules',
  };

  const targets =
    target === 'ALL'
      ? (Object.values(tableMap) as Array<
          'questions' | 'notes' | 'short_notes' | 'pyqs' | 'specials' | 'modules'
        >)
      : [tableMap[target]];

  for (const tbl of targets) {
    const { error } = await client.from(tbl).delete().neq('id', '');
    if (error) throw new Error(error.message);
  }
}

/* ==================== STUDENT SUGGESTIONS -> ADMIN INBOX ==================== */

export async function submitStudentSuggestionToCloud(
  settings: AppSettings,
  input: { studentName?: string; category: string; message: string }
): Promise<{ suggestion: StudentSuggestion; savedToCloud: boolean }> {
  const validated = validateSuggestionInput(input);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const suggestion: StudentSuggestion = {
    id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    studentName: validated.studentName,
    category: validated.category,
    message: validated.message,
    status: 'open',
    createdAt: Date.now(),
  };

  const client = getSupabaseClient(settings);
  if (!client) {
    return { suggestion, savedToCloud: false };
  }

  const { error } = await client.from('suggestions').insert(toSuggestionRow(suggestion));
  if (error) {
    throw new Error(error.message);
  }

  return { suggestion, savedToCloud: true };
}

export async function fetchSuggestionsFromCloud(
  settings: AppSettings
): Promise<StudentSuggestion[]> {
  const client = getSupabaseClient(settings);
  if (!client) return [];
  const { data, error } = await client
    .from('suggestions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => fromSuggestionRow(r as Record<string, unknown>));
}

export async function updateCloudSuggestionStatus(
  settings: AppSettings,
  id: string,
  status: 'open' | 'resolved'
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('suggestions').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCloudSuggestion(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('suggestions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ==================== QUESTION REPORTS -> ADMIN PATCH QUEUE ==================== */

export async function submitQuestionReportToCloud(
  settings: AppSettings,
  input: {
    questionId: string;
    sourceTable?: 'questions' | 'pyqs';
    subject: string;
    chapter: string;
    questionSnapshot: string;
    reason: string;
    comment?: string;
  }
): Promise<{ report: QuestionReport; savedToCloud: boolean; fallbackReason?: string }> {
  const validated = validateQuestionReportInput({
    questionId: input.questionId,
    reason: input.reason,
    comment: input.comment,
  });
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const report: QuestionReport = {
    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    questionId: validated.questionId,
    sourceTable: input.sourceTable === 'pyqs' ? 'pyqs' : 'questions',
    subject: (input.subject || 'Physics').trim(),
    chapter: (input.chapter || 'General').trim(),
    questionSnapshot: (input.questionSnapshot || '').trim().slice(0, 600),
    reason: validated.reason,
    comment: validated.comment,
    status: 'open',
    createdAt: Date.now(),
  };

  const client = getSupabaseClient(settings);
  if (!client) {
    return { report, savedToCloud: false };
  }

  try {
    const { error } = await client
      .from('question_reports')
      .insert(toQuestionReportRow(report));
    if (error) {
      return { report, savedToCloud: false, fallbackReason: error.message };
    }
    return { report, savedToCloud: true };
  } catch (err) {
    return {
      report,
      savedToCloud: false,
      fallbackReason: err instanceof Error ? err.message : 'Offline fallback',
    };
  }
}

export async function fetchQuestionReportsFromCloud(
  settings: AppSettings
): Promise<QuestionReport[]> {
  const client = getSupabaseClient(settings);
  if (!client) return [];
  const { data, error } = await client
    .from('question_reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => fromQuestionReportRow(r as Record<string, unknown>));
}

export async function pushQueuedQuestionReportsToCloud(
  settings: AppSettings,
  reports: QuestionReport[]
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client || reports.length === 0) return;
  const rows = reports.map(toQuestionReportRow);
  const { error } = await client
    .from('question_reports')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function updateCloudQuestionReport(
  settings: AppSettings,
  id: string,
  patch: {
    status: ReportStatus;
    adminNote?: string;
    resolvedAt?: number | null;
  }
): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client
    .from('question_reports')
    .update({
      status: patch.status,
      admin_note: patch.adminNote ?? null,
      resolved_at: patch.resolvedAt ?? null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCloudQuestionReport(settings: AppSettings, id: string): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  const { error } = await client.from('question_reports').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

