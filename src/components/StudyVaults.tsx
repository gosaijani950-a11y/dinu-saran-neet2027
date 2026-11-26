import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileClock,
  FileUp,
  Flag,
  Loader2,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  MCQQuestion,
  PYQItem,
  ShortNote,
  SpecialCategory,
  SpecialItem,
  StudyNote,
  SubjectName,
  UnifiedQuestionItem,
  UploadedModule,
  UserRole,
} from '../types';
import { getChaptersBySubject } from '../data/syllabus';
import { MathText } from './MathText';
import { db } from '../db/database';
import { processUploadedFiles } from '../services/fileProcessor';
import { pyqToUnifiedQuestion } from '../utils/quizLogic';
import { useSubjects } from '../utils/subjects';
import {
  extractPYQsFromUpload,
  generateDetailedNotes,
  generateShortNotes,
  generateSpecialExceptions,
} from '../services/geminiService';
import {
  deleteCloudNote,
  deleteCloudPyq,
  deleteCloudShortNote,
  deleteCloudSpecial,
  upsertCloudNote,
  upsertCloudPyqs,
  upsertCloudShortNote,
  upsertCloudSpecials,
} from '../services/supabaseService';

interface CommonVaultProps {
  role: UserRole;
  settings: AppSettings;
  customSubjects: string[];
  onRefreshData: () => Promise<void>;
  onOpenSettings: () => void;
  onBackHome: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

const INPUT_CLASS =
  'px-2.5 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60';

const PRIMARY_BTN_CLASS =
  'px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#6366F1] dark:hover:bg-[#5558E8] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm cursor-pointer';

const SECONDARY_BTN_CLASS =
  'px-3.5 py-2 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer';

/* ============================================================================
 * 1. NOTES VIEW (Chapterwise Hindi NCERT Notes)
 * ==========================================================================*/
interface NotesViewProps extends CommonVaultProps {
  notes: StudyNote[];
}

export const NotesView: React.FC<NotesViewProps> = ({
  role,
  settings,
  customSubjects,
  notes,
  onRefreshData,
  onOpenSettings,
  onBackHome,
  onToast,
}) => {
  const isAdmin = role === 'admin';
  const { subjects: selectableSubjects, subjectsWithAll } = useSubjects(customSubjects);
  const [filterSubject, setFilterSubject] = useState('All');
  const [search, setSearch] = useState('');
  const [genSubject, setGenSubject] = useState<SubjectName>('Botany');
  const genChapters = useMemo(() => getChaptersBySubject(genSubject), [genSubject]);
  const [genChapter, setGenChapter] = useState(genChapters[0]?.name || 'The Living World');
  const [generating, setGenerating] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualBody, setManualBody] = useState('');
  const [manualBullets, setManualBullets] = useState('');

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editBullets, setEditBullets] = useState('');

  const fileRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (filterSubject !== 'All' && n.subject !== filterSubject) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.chapter.toLowerCase().includes(q) ||
        n.content_hi.toLowerCase().includes(q)
      );
    });
  }, [notes, filterSubject, search]);

  const handleAIGenerate = async (files?: FileList | null) => {
    if (!isAdmin) return;
    if (!settings.apiKey.trim()) {
      onToast('Configure your Gemini API key in Settings (⚙️) to generate Hindi notes.', 'error');
      onOpenSettings();
      return;
    }
    setGenerating(true);
    try {
      let pages;
      if (files && files.length > 0) {
        const bundle = await processUploadedFiles(Array.from(files));
        pages = bundle.pages;
      }
      const note = await generateDetailedNotes({
        settings,
        subject: genSubject,
        chapter: genChapter,
        pages,
      });
      await db.notes.put(note);
      await upsertCloudNote(settings, note).catch(() => false);
      await onRefreshData();
      onToast(`Generated Hindi notes for ${genChapter}.`, 'success');
    } catch (err) {
      onToast(`API Error: ${err instanceof Error ? err.message : 'Failed'}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveManual = async () => {
    if (!isAdmin) return;
    if (!manualTitle.trim() || !manualBody.trim()) {
      onToast('Please enter both a title and Hindi note content.', 'error');
      return;
    }
    const now = Date.now();
    const record: StudyNote = {
      id: `note-man-${now}`,
      title: manualTitle.trim(),
      subject: genSubject,
      chapter: genChapter,
      content_hi: manualBody.trim(),
      keyPoints_hi: manualBullets
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      isStarred: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.notes.put(record);
    await upsertCloudNote(settings, record).catch(() => false);
    setManualTitle('');
    setManualBody('');
    setManualBullets('');
    setManualOpen(false);
    await onRefreshData();
    onToast('Note saved and synced.', 'success');
  };

  const handleSaveEdit = async (note: StudyNote) => {
    if (!isAdmin) return;
    if (!editTitle.trim() || !editBody.trim()) {
      onToast('Title and content cannot be empty.', 'error');
      return;
    }
    const updated: StudyNote = {
      ...note,
      title: editTitle.trim(),
      content_hi: editBody.trim(),
      keyPoints_hi: editBullets
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      updatedAt: Date.now(),
    };
    await db.notes.put(updated);
    await upsertCloudNote(settings, updated).catch(() => false);
    setEditingNoteId(null);
    await onRefreshData();
    onToast('Note updated.', 'success');
  };

  return (
    <div className="space-y-3.5 pb-10">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home Hub"
            className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">
              Chapterwise Hindi Notes
            </h1>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono-num">
              {notes.length} published NCERT note{notes.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            className={SECONDARY_BTN_CLASS}
          >
            <Plus className="w-3.5 h-3.5" />
            Write Note
          </button>
        )}
      </div>

      {/* Admin-only Unified AI Generator Card */}
      {isAdmin && (
        <section className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-3.5 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              aria-label="Select subject for notes"
              value={genSubject}
              onChange={(e) => {
                setGenSubject(e.target.value);
                const list = getChaptersBySubject(e.target.value);
                setGenChapter(list[0]?.name || 'General');
              }}
              className={INPUT_CLASS}
            >
              {selectableSubjects.map((s) => (
                <option key={s} value={s} className="bg-white dark:bg-[#141923]">
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="Select chapter for notes"
              value={genChapter}
              onChange={(e) => setGenChapter(e.target.value)}
              className={INPUT_CLASS}
            >
              {genChapters.length > 0 ? (
                genChapters.map((c) => (
                  <option key={c.id} value={c.name} className="bg-white dark:bg-[#141923]">
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="General" className="bg-white dark:bg-[#141923]">
                  General
                </option>
              )}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => void handleAIGenerate(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleAIGenerate(null)}
              className={PRIMARY_BTN_CLASS}
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Generate from Chapter Syllabus
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={() => fileRef.current?.click()}
              className={SECONDARY_BTN_CLASS}
            >
              <FileUp className="w-3.5 h-3.5" />
              Generate from PDF / Photo
            </button>
          </div>
        </section>
      )}

      {/* Admin-only Manual Note Composer */}
      {isAdmin && manualOpen && (
        <section className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-3.5 space-y-2.5">
          <h2 className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            Add Hindi Note ({genSubject} · {genChapter})
          </h2>
          <input
            type="text"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Note title..."
            className={`w-full ${INPUT_CLASS}`}
          />
          <textarea
            rows={4}
            value={manualBody}
            onChange={(e) => setManualBody(e.target.value)}
            placeholder="Detailed Hindi notes (supports $LaTeX$ and \ce{H2O})..."
            className={`w-full font-hindi ${INPUT_CLASS}`}
          />
          <textarea
            rows={2}
            value={manualBullets}
            onChange={(e) => setManualBullets(e.target.value)}
            placeholder="Optional key NCERT bullet points (one per line)..."
            className={`w-full font-hindi ${INPUT_CLASS}`}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] cursor-pointer"
            >
              Cancel
            </button>
            <button type="button" onClick={() => void handleSaveManual()} className={PRIMARY_BTN_CLASS}>
              Save Note
            </button>
          </div>
        </section>
      )}

      {/* Compact Search & Subject Filter Track */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes by chapter or Hindi keyword..."
            className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.05] overflow-x-auto">
          {subjectsWithAll.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterSubject(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                filterSubject === s
                  ? 'bg-white dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-7 text-center space-y-1.5">
          <BookOpen className="w-6 h-6 text-[#6366F1] mx-auto opacity-80" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">No notes yet</p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            {isAdmin
              ? 'Generate NCERT Hindi notes from any chapter or uploaded PDF/Photo, or click Write Note.'
              : 'No published notes match your filter yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((n) => {
            const isEditing = isAdmin && editingNoteId === n.id;
            return (
              <article
                key={n.id}
                className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      {n.subject} · {n.chapter}
                    </p>
                    {!isEditing && (
                      <h2 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F1F5F9] font-hindi">
                        <MathText text={n.title} />
                      </h2>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await db.notes.update(n.id, { isStarred: !n.isStarred });
                        await onRefreshData();
                      }}
                      aria-label="Star note"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        n.isStarred
                          ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                          : 'text-[#64748B] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331]'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${n.isStarred ? 'fill-current' : ''}`} />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingNoteId(null);
                            } else {
                              setEditingNoteId(n.id);
                              setEditTitle(n.title);
                              setEditBody(n.content_hi);
                              setEditBullets(n.keyPoints_hi.join('\n'));
                            }
                          }}
                          aria-label="Edit note"
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#6366F1] hover:bg-[#6366F1]/10 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await db.notes.delete(n.id);
                            await deleteCloudNote(settings, n.id).catch(() => false);
                            await onRefreshData();
                          }}
                          aria-label="Delete note"
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      aria-label="Edit note title"
                      className={`w-full ${INPUT_CLASS}`}
                    />
                    <textarea
                      rows={4}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      aria-label="Edit note body"
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <textarea
                      rows={2}
                      value={editBullets}
                      onChange={(e) => setEditBullets(e.target.value)}
                      aria-label="Edit key points"
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoteId(null)}
                        className="px-2.5 py-1.5 rounded-lg text-xs text-[#64748B] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(n)}
                        className={PRIMARY_BTN_CLASS}
                      >
                        <Save className="w-3 h-3" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-hindi leading-[1.65] text-[#0F172A] dark:text-[#F1F5F9]">
                      <MathText text={n.content_hi} />
                    </div>
                    {n.keyPoints_hi.length > 0 && (
                      <div className="pt-2.5 border-t border-[#E2E8F0] dark:border-white/[0.06] space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4F46E5] dark:text-[#818CF8]">
                          High-Yield NCERT Points
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-xs sm:text-sm font-hindi leading-[1.6] text-[#475569] dark:text-[#CBD5E1]">
                          {n.keyPoints_hi.map((pt, i) => (
                            <li key={i}>
                              <MathText text={pt} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 2. SHORT NOTES VIEW (1-Page Revision Sheets & Formulas)
 * ==========================================================================*/
interface ShortNotesViewProps extends CommonVaultProps {
  shortNotes: ShortNote[];
}

export const ShortNotesView: React.FC<ShortNotesViewProps> = ({
  role,
  settings,
  customSubjects,
  shortNotes,
  onRefreshData,
  onOpenSettings,
  onBackHome,
  onToast,
}) => {
  const isAdmin = role === 'admin';
  const { subjects: selectableSubjects } = useSubjects(customSubjects);
  const [subject, setSubject] = useState<SubjectName>('Physics');
  const chapters = useMemo(() => getChaptersBySubject(subject), [subject]);
  const [chapter, setChapter] = useState(chapters[0]?.name || 'Laws of Motion');
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFormulas, setEditFormulas] = useState('');
  const [editPoints, setEditPoints] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shortNotes;
    return shortNotes.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.chapter.toLowerCase().includes(q) ||
        s.subject.toLowerCase().includes(q)
    );
  }, [shortNotes, search]);

  const handleGenerate = async (files?: FileList | null) => {
    if (!isAdmin) return;
    if (!settings.apiKey.trim()) {
      onToast('Configure your Gemini API key in Settings (⚙️) first.', 'error');
      onOpenSettings();
      return;
    }
    setGenerating(true);
    try {
      let pages;
      if (files && files.length > 0) {
        const bundle = await processUploadedFiles(Array.from(files));
        pages = bundle.pages;
      }
      const sn = await generateShortNotes({ settings, subject, chapter, pages });
      await db.shortNotes.put(sn);
      await upsertCloudShortNote(settings, sn).catch(() => false);
      await onRefreshData();
      onToast(`1-Page Short Note saved for ${chapter}.`, 'success');
    } catch (err) {
      onToast(`API Error: ${err instanceof Error ? err.message : 'Failed'}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEdit = async (sheet: ShortNote) => {
    if (!isAdmin) return;
    const updated: ShortNote = {
      ...sheet,
      title: editTitle.trim() || sheet.title,
      formulas_hi: editFormulas
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      quickPoints_hi: editPoints
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    };
    await db.shortNotes.put(updated);
    await upsertCloudShortNote(settings, updated).catch(() => false);
    setEditingId(null);
    await onRefreshData();
    onToast('Short note updated.', 'success');
  };

  return (
    <div className="space-y-3.5 pb-10">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBackHome}
          aria-label="Back to Home Hub"
          className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">
            1-Page Short Notes &amp; Formulas
          </h1>
          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            Rapid Hindi formula cheatsheets &amp; NCERT recall cards
          </p>
        </div>
      </div>

      {isAdmin && (
        <section className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-3.5 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              aria-label="Select subject for short notes"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                const list = getChaptersBySubject(e.target.value);
                setChapter(list[0]?.name || 'General');
              }}
              className={INPUT_CLASS}
            >
              {selectableSubjects.map((s) => (
                <option key={s} value={s} className="bg-white dark:bg-[#141923]">
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="Select chapter for short notes"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className={INPUT_CLASS}
            >
              {chapters.length > 0 ? (
                chapters.map((c) => (
                  <option key={c.id} value={c.name} className="bg-white dark:bg-[#141923]">
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="General" className="bg-white dark:bg-[#141923]">
                  General
                </option>
              )}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => void handleGenerate(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerate(null)}
              className={PRIMARY_BTN_CLASS}
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              Generate 1-Page Sheet
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={() => fileRef.current?.click()}
              className={SECONDARY_BTN_CLASS}
            >
              <FileUp className="w-3.5 h-3.5" />
              From Uploaded PDF / Photo
            </button>
          </div>
        </section>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search formula sheets..."
          className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-7 text-center space-y-1.5">
          <Zap className="w-6 h-6 text-[#F59E0B] mx-auto opacity-85" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">No short notes yet</p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            {isAdmin
              ? 'Pick a chapter or upload pages above to generate a crisp 1-page Hindi formula cheatsheet.'
              : 'No published formula sheets match your search yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((sheet) => {
            const isEditing = isAdmin && editingId === sheet.id;
            return (
              <article
                key={sheet.id}
                className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      {sheet.subject} · {sheet.chapter}
                    </p>
                    {!isEditing && (
                      <h2 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F1F5F9] font-hindi">
                        <MathText text={sheet.title} />
                      </h2>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await db.shortNotes.update(sheet.id, { isStarred: !sheet.isStarred });
                        await onRefreshData();
                      }}
                      aria-label="Star short note"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        sheet.isStarred
                          ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                          : 'text-[#64748B] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331]'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${sheet.isStarred ? 'fill-current' : ''}`} />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null);
                            } else {
                              setEditingId(sheet.id);
                              setEditTitle(sheet.title);
                              setEditFormulas(sheet.formulas_hi.join('\n'));
                              setEditPoints(sheet.quickPoints_hi.join('\n'));
                            }
                          }}
                          aria-label="Edit short note"
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#6366F1] hover:bg-[#6366F1]/10 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await db.shortNotes.delete(sheet.id);
                            await deleteCloudShortNote(settings, sheet.id).catch(() => false);
                            await onRefreshData();
                          }}
                          aria-label="Delete short note"
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={`w-full ${INPUT_CLASS}`}
                    />
                    <textarea
                      rows={3}
                      value={editFormulas}
                      onChange={(e) => setEditFormulas(e.target.value)}
                      placeholder="Formulas (one per line)..."
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <textarea
                      rows={3}
                      value={editPoints}
                      onChange={(e) => setEditPoints(e.target.value)}
                      placeholder="Quick points (one per line)..."
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1.5 rounded-lg text-xs text-[#64748B] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(sheet)}
                        className={PRIMARY_BTN_CLASS}
                      >
                        <Save className="w-3 h-3" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {sheet.formulas_hi.length > 0 && (
                      <div className="rounded-xl p-3 bg-[#F59E0B]/[0.07] border border-[#F59E0B]/20 space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B45309] dark:text-[#FBBF24]">
                          Key Formulas &amp; Reactions
                        </p>
                        <ul className="space-y-1 text-xs sm:text-sm font-hindi leading-[1.6] text-[#0F172A] dark:text-[#F1F5F9]">
                          {sheet.formulas_hi.map((f, i) => (
                            <li key={i}>
                              <MathText text={f} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {sheet.quickPoints_hi.length > 0 && (
                      <ul className="list-disc pl-4 space-y-1 text-xs sm:text-sm font-hindi leading-[1.6] text-[#475569] dark:text-[#CBD5E1]">
                        {sheet.quickPoints_hi.map((pt, i) => (
                          <li key={i}>
                            <MathText text={pt} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. PYQS VIEW (Previous Year Questions + Upload PYQ Paper Extractor)
 * ==========================================================================*/
interface PYQsViewProps extends CommonVaultProps {
  pyqs: PYQItem[];
  onPracticeQuestions: (questions: MCQQuestion[], label: string) => void;
  onReportQuestion?: (question: UnifiedQuestionItem) => void;
}

export const PYQsView: React.FC<PYQsViewProps> = ({
  role,
  settings,
  customSubjects,
  pyqs,
  onRefreshData,
  onPracticeQuestions,
  onReportQuestion,
  onOpenSettings,
  onBackHome,
  onToast,
}) => {
  const isAdmin = role === 'admin';
  const { subjects: selectableSubjects, subjectsWithAll } = useSubjects(customSubjects);
  const [filterSubject, setFilterSubject] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [genSubject, setGenSubject] = useState<SubjectName>('Physics');
  const genChapters = useMemo(() => getChaptersBySubject(genSubject), [genSubject]);
  const [genChapter, setGenChapter] = useState(genChapters[0]?.name || 'Laws of Motion');
  const [defaultYear, setDefaultYear] = useState(2024);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState('');
  const [editExp, setEditExp] = useState('');
  const [editTag, setEditTag] = useState('');

  const fileRef = useRef<HTMLInputElement | null>(null);

  const years = useMemo(() => {
    const set = new Set(pyqs.map((p) => String(p.year)));
    return ['All', ...Array.from(set).sort((a, b) => Number(b) - Number(a))];
  }, [pyqs]);

  const filtered = useMemo(() => {
    return pyqs.filter((p) => {
      if (filterSubject !== 'All' && p.subject !== filterSubject) return false;
      if (filterYear !== 'All' && String(p.year) !== filterYear) return false;
      return true;
    });
  }, [pyqs, filterSubject, filterYear]);

  const handleExtractOrGenerate = async (files?: FileList | null) => {
    if (!isAdmin) return;
    if (!settings.apiKey.trim()) {
      onToast('Configure your Gemini API key in Settings (⚙️) first.', 'error');
      onOpenSettings();
      return;
    }
    setLoading(true);
    try {
      let pages;
      if (files && files.length > 0) {
        const bundle = await processUploadedFiles(Array.from(files));
        pages = bundle.pages;
      }
      const items = await extractPYQsFromUpload({
        settings,
        subject: genSubject,
        chapter: genChapter,
        defaultYear,
        pages,
      });
      await db.pyqs.bulkPut(items);
      await upsertCloudPyqs(settings, items).catch(() => false);
      await onRefreshData();
      onToast(`Extracted & verified ${items.length} Hindi PYQ(s)!`, 'success');
    } catch (err) {
      onToast(`API Error: ${err instanceof Error ? err.message : 'Failed'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (p: PYQItem) => {
    if (!isAdmin) return;
    const updated: PYQItem = {
      ...p,
      question_hi: editQ.trim() || p.question_hi,
      explanation_hi: editExp.trim(),
      examTag: editTag.trim() || p.examTag,
    };
    await db.pyqs.put(updated);
    await upsertCloudPyqs(settings, [updated]).catch(() => false);
    setEditingId(null);
    await onRefreshData();
    onToast('PYQ updated.', 'success');
  };

  const handleLaunchPYQQuiz = () => {
    if (filtered.length === 0) return;
    const converted: MCQQuestion[] = filtered.map((p) => ({
      id: p.id,
      question_hi: p.question_hi,
      options_hi: p.options_hi,
      correct_index: p.correct_index,
      explanation_hi: p.explanation_hi,
      subject: p.subject,
      chapter: p.chapter,
      difficulty: 'Medium',
      tags: ['PYQ', p.examTag],
      concept_key: `pyq-${p.id}`,
      isStarred: p.isStarred,
      isSaved: p.isSaved,
      year: p.year,
      createdAt: p.createdAt,
    }));
    onPracticeQuestions(converted, 'PYQ Drill');
  };

  return (
    <div className="space-y-3.5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home Hub"
            className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">
              Previous Year Questions (PYQs)
            </h1>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              {isAdmin
                ? 'Upload PYQ papers or generate verified Hindi explanations'
                : 'Practice official NEET PYQs with verified Hindi NCERT solutions'}
            </p>
          </div>
        </div>

        {filtered.length > 0 && (
          <button type="button" onClick={handleLaunchPYQQuiz} className={PRIMARY_BTN_CLASS}>
            <Play className="w-3.5 h-3.5 fill-current" />
            Practice <span className="font-mono-num">{filtered.length}</span> PYQs
          </button>
        )}
      </div>

      {/* Admin-only PYQ Extractor Card */}
      {isAdmin && (
        <section className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-3.5 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              aria-label="PYQ subject"
              value={genSubject}
              onChange={(e) => {
                setGenSubject(e.target.value);
                const list = getChaptersBySubject(e.target.value);
                setGenChapter(list[0]?.name || 'General');
              }}
              className={INPUT_CLASS}
            >
              {selectableSubjects.map((s) => (
                <option key={s} value={s} className="bg-white dark:bg-[#141923]">
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="PYQ chapter"
              value={genChapter}
              onChange={(e) => setGenChapter(e.target.value)}
              className={INPUT_CLASS}
            >
              {genChapters.length > 0 ? (
                genChapters.map((c) => (
                  <option key={c.id} value={c.name} className="bg-white dark:bg-[#141923]">
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="General" className="bg-white dark:bg-[#141923]">
                  General
                </option>
              )}
            </select>
            <input
              type="number"
              min={2005}
              max={2027}
              value={defaultYear}
              onChange={(e) => setDefaultYear(Number(e.target.value) || 2024)}
              aria-label="Default PYQ exam year"
              className={`font-mono-num ${INPUT_CLASS}`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => void handleExtractOrGenerate(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
              className={filtered.length === 0 ? PRIMARY_BTN_CLASS : SECONDARY_BTN_CLASS}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileUp className="w-3.5 h-3.5" />
              )}
              Upload PYQ Paper (PDF / Photo)
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleExtractOrGenerate(null)}
              className={SECONDARY_BTN_CLASS}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate Chapter PYQs via AI
            </button>
          </div>
        </section>
      )}

      {/* Filter Track */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.05] overflow-x-auto">
          {subjectsWithAll.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterSubject(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                filterSubject === s
                  ? 'bg-white dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter PYQs by year"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="px-2.5 py-1.5 rounded-xl text-xs font-mono-num bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9]"
        >
          {years.map((y) => (
            <option key={y} value={y} className="bg-white dark:bg-[#141923]">
              {y === 'All' ? 'All Years' : `NEET ${y}`}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-7 text-center space-y-1.5">
          <FileClock className="w-6 h-6 text-[#10B981] mx-auto opacity-85" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">No PYQs stored yet</p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            {isAdmin
              ? 'Upload a NEET PYQ PDF/Photo or generate verified chapter PYQs above.'
              : 'No published PYQs match the selected subject and year.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p, idx) => {
            const isEditing = isAdmin && editingId === p.id;
            return (
              <article
                key={p.id}
                className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  <span className="truncate">
                    <strong className="text-[#059669] dark:text-[#34D399] font-mono-num">
                      {p.examTag}
                    </strong>{' '}
                    · {p.subject} · {p.chapter}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await db.pyqs.update(p.id, { isSaved: !p.isSaved });
                        await onRefreshData();
                      }}
                      aria-label={p.isSaved ? `Unsave PYQ ${idx + 1}` : `Save PYQ ${idx + 1}`}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition-colors cursor-pointer ${
                        p.isSaved
                          ? 'bg-cyan-500/12 border-cyan-500/35 text-cyan-700 dark:text-cyan-300'
                          : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-[#E2E8F0] dark:border-white/[0.08] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
                      }`}
                    >
                      <Bookmark className={`w-3 h-3 ${p.isSaved ? 'fill-current' : ''}`} />
                      <span>{p.isSaved ? 'Saved' : 'Save'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await db.pyqs.update(p.id, { isStarred: !p.isStarred });
                        await onRefreshData();
                      }}
                      aria-label={`Star PYQ ${idx + 1}`}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        p.isStarred
                          ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                          : 'text-[#64748B] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331]'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${p.isStarred ? 'fill-current' : ''}`} />
                    </button>
                    {onReportQuestion && (
                      <button
                        type="button"
                        onClick={() => onReportQuestion(pyqToUnifiedQuestion(p))}
                        aria-label={`Report PYQ ${idx + 1}`}
                        title="Report PYQ"
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-colors cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null);
                            } else {
                              setEditingId(p.id);
                              setEditQ(p.question_hi);
                              setEditExp(p.explanation_hi);
                              setEditTag(p.examTag);
                            }
                          }}
                          aria-label={`Edit PYQ ${idx + 1}`}
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#6366F1] hover:bg-[#6366F1]/10 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await db.pyqs.delete(p.id);
                            await deleteCloudPyq(settings, p.id).catch(() => false);
                            await onRefreshData();
                          }}
                          aria-label={`Delete PYQ ${idx + 1}`}
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value)}
                      placeholder="Exam Tag (e.g., NEET 2024)"
                      className={`w-full ${INPUT_CLASS}`}
                    />
                    <textarea
                      rows={3}
                      value={editQ}
                      onChange={(e) => setEditQ(e.target.value)}
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <textarea
                      rows={2}
                      value={editExp}
                      onChange={(e) => setEditExp(e.target.value)}
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1.5 rounded-lg text-xs text-[#64748B] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(p)}
                        className={PRIMARY_BTN_CLASS}
                      >
                        <Save className="w-3 h-3" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold font-hindi leading-[1.65] text-[#0F172A] dark:text-[#F1F5F9]">
                      <MathText text={p.question_hi} />
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                      {p.options_hi.map((opt, i) => {
                        const isCorrect = i === p.correct_index;
                        return (
                          <div
                            key={i}
                            className={`px-3 py-2 rounded-xl border flex items-start gap-2 font-hindi leading-[1.55] ${
                              isCorrect
                                ? 'bg-[#10B981]/10 border-[#10B981]/35 text-[#065F46] dark:text-[#A7F3D0] font-semibold'
                                : 'bg-[#F4F6FA] dark:bg-[#1C2331]/70 border-[#E2E8F0] dark:border-white/[0.06] text-[#475569] dark:text-[#CBD5E1]'
                            }`}
                          >
                            <span className="font-mono-num font-bold shrink-0">
                              {['A', 'B', 'C', 'D'][i]}.
                            </span>
                            <span className="flex-1">
                              <MathText text={opt} />
                            </span>
                            {isCorrect && <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0 mt-0.5" />}
                          </div>
                        );
                      })}
                    </div>

                    {p.explanation_hi && (
                      <div className="px-3 py-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.05] text-xs font-hindi leading-[1.6] text-[#475569] dark:text-[#94A3B8]">
                        <MathText text={p.explanation_hi} />
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 4. SPECIAL VIEW (NCERT Exceptions, Trends, Reactions, Mnemonics, Exam Traps)
 * ==========================================================================*/
interface SpecialViewProps extends CommonVaultProps {
  specials: SpecialItem[];
}

const SPECIAL_CATS: Array<'All' | SpecialCategory> = [
  'All',
  'Exception',
  'Trend',
  'Reaction',
  'Mnemonic',
  'Exam Trap',
];

export const SpecialView: React.FC<SpecialViewProps> = ({
  role,
  settings,
  customSubjects,
  specials,
  onRefreshData,
  onOpenSettings,
  onBackHome,
  onToast,
}) => {
  const isAdmin = role === 'admin';
  const { subjects: selectableSubjects } = useSubjects(customSubjects);
  const [catFilter, setCatFilter] = useState<'All' | SpecialCategory>('All');
  const [subject, setSubject] = useState<SubjectName>('Chemistry');
  const chapters = useMemo(() => getChaptersBySubject(subject), [subject]);
  const [chapter, setChapter] = useState(
    chapters[0]?.name || 'Chemical Bonding and Molecular Structure'
  );
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTrick, setEditTrick] = useState('');

  const filtered = useMemo(() => {
    return specials.filter((sp) => catFilter === 'All' || sp.category === catFilter);
  }, [specials, catFilter]);

  const handleGenerate = async () => {
    if (!isAdmin) return;
    if (!settings.apiKey.trim()) {
      onToast('Configure your Gemini API key in Settings (⚙️) first.', 'error');
      onOpenSettings();
      return;
    }
    setLoading(true);
    try {
      const items = await generateSpecialExceptions({ settings, subject, chapter });
      await db.specials.bulkPut(items);
      await upsertCloudSpecials(settings, items).catch(() => false);
      await onRefreshData();
      onToast(`Extracted ${items.length} high-yield NCERT Exceptions & Traps!`, 'success');
    } catch (err) {
      onToast(`API Error: ${err instanceof Error ? err.message : 'Failed'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (item: SpecialItem) => {
    if (!isAdmin) return;
    const updated: SpecialItem = {
      ...item,
      title: editTitle.trim() || item.title,
      content_hi: editContent.trim() || item.content_hi,
      memoryTrick_hi: editTrick.trim() || undefined,
    };
    await db.specials.put(updated);
    await upsertCloudSpecials(settings, [updated]).catch(() => false);
    setEditingId(null);
    await onRefreshData();
    onToast('Special card updated.', 'success');
  };

  return (
    <div className="space-y-3.5 pb-10">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBackHome}
          aria-label="Back to Home Hub"
          className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">
            Exceptions, Trends &amp; Exam Traps
          </h1>
          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            High-yield NCERT exceptions, anomalous trends &amp; Hindi mnemonics
          </p>
        </div>
      </div>

      {isAdmin && (
        <section className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-3.5 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              aria-label="Special item subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                const list = getChaptersBySubject(e.target.value);
                setChapter(list[0]?.name || 'General');
              }}
              className={INPUT_CLASS}
            >
              {selectableSubjects.map((s) => (
                <option key={s} value={s} className="bg-white dark:bg-[#141923]">
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="Special item chapter"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className={INPUT_CLASS}
            >
              {chapters.length > 0 ? (
                chapters.map((c) => (
                  <option key={c.id} value={c.name} className="bg-white dark:bg-[#141923]">
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="General" className="bg-white dark:bg-[#141923]">
                  General
                </option>
              )}
            </select>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGenerate()}
            className={PRIMARY_BTN_CLASS}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Extract Chapter Exceptions &amp; Tricks via AI
          </button>
        </section>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.05] overflow-x-auto">
        {SPECIAL_CATS.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCatFilter(cat)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              catFilter === cat
                ? 'bg-white dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-7 text-center space-y-1.5">
          <Sparkles className="w-6 h-6 text-[#6366F1] mx-auto opacity-85" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            No special exceptions yet
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            {isAdmin
              ? 'Generate high-yield NCERT exceptions, reactions, or traps from any chapter or uploaded module.'
              : 'No published special cards match this category yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filtered.map((item) => {
            const isEditing = isAdmin && editingId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[#4F46E5] dark:text-[#818CF8]">
                      {item.category} · {item.subject}
                    </p>
                    {!isEditing && (
                      <>
                        <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] font-hindi">
                          <MathText text={item.title} />
                        </h2>
                        <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">{item.chapter}</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await db.specials.update(item.id, { isStarred: !item.isStarred });
                        await onRefreshData();
                      }}
                      aria-label="Star special item"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        item.isStarred
                          ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                          : 'text-[#64748B] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331]'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${item.isStarred ? 'fill-current' : ''}`} />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null);
                            } else {
                              setEditingId(item.id);
                              setEditTitle(item.title);
                              setEditContent(item.content_hi);
                              setEditTrick(item.memoryTrick_hi || '');
                            }
                          }}
                          aria-label="Edit special item"
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#6366F1] hover:bg-[#6366F1]/10 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await db.specials.delete(item.id);
                            await deleteCloudSpecial(settings, item.id).catch(() => false);
                            await onRefreshData();
                          }}
                          aria-label="Delete special item"
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={`w-full ${INPUT_CLASS}`}
                    />
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <input
                      type="text"
                      value={editTrick}
                      onChange={(e) => setEditTrick(e.target.value)}
                      placeholder="Memory trick (optional)"
                      className={`w-full font-hindi ${INPUT_CLASS}`}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1.5 rounded-lg text-xs text-[#64748B] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(item)}
                        className={PRIMARY_BTN_CLASS}
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs sm:text-sm font-hindi leading-[1.6] text-[#0F172A] dark:text-[#E2E8F0]">
                      <MathText text={item.content_hi} />
                    </div>
                    {item.memoryTrick_hi && (
                      <div className="p-2.5 rounded-xl bg-[#6366F1]/[0.08] border border-[#6366F1]/20 text-xs font-hindi text-[#3730A3] dark:text-[#C7D2FE]">
                        <strong>Trick:</strong> <MathText text={item.memoryTrick_hi} />
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 5. STAR VAULT VIEW (Centralized Starred Items + Practice Starred MCQs)
 * ==========================================================================*/
interface StarVaultViewProps {
  questions: MCQQuestion[];
  notes: StudyNote[];
  shortNotes: ShortNote[];
  pyqs: PYQItem[];
  specials: SpecialItem[];
  modules: UploadedModule[];
  onPracticeQuestions: (questions: MCQQuestion[], label: string) => void;
  onToggleQuestionStar: (id: string) => void;
  onRefreshData: () => Promise<void>;
  onBackHome: () => void;
}

export const StarVaultView: React.FC<StarVaultViewProps> = ({
  questions,
  notes,
  shortNotes,
  pyqs,
  specials,
  modules,
  onPracticeQuestions,
  onToggleQuestionStar,
  onRefreshData,
  onBackHome,
}) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const starredMCQs = useMemo(() => questions.filter((q) => q.isStarred), [questions]);
  const starredNotes = useMemo(() => notes.filter((n) => n.isStarred), [notes]);
  const starredShort = useMemo(() => shortNotes.filter((s) => s.isStarred), [shortNotes]);
  const starredPYQs = useMemo(() => pyqs.filter((p) => p.isStarred), [pyqs]);
  const starredSpecial = useMemo(() => specials.filter((sp) => sp.isStarred), [specials]);
  const starredModules = useMemo(() => modules.filter((m) => m.isStarred), [modules]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUnstarRecord = async (
    table: 'notes' | 'shortNotes' | 'pyqs' | 'specials' | 'modules',
    id: string
  ) => {
    if (table === 'notes') await db.notes.update(id, { isStarred: false });
    else if (table === 'shortNotes') await db.shortNotes.update(id, { isStarred: false });
    else if (table === 'pyqs') await db.pyqs.update(id, { isStarred: false });
    else if (table === 'specials') await db.specials.update(id, { isStarred: false });
    else if (table === 'modules') await db.modules.update(id, { isStarred: false });
    await onRefreshData();
  };

  const total =
    starredMCQs.length +
    starredNotes.length +
    starredShort.length +
    starredPYQs.length +
    starredSpecial.length +
    starredModules.length;

  return (
    <div className="space-y-3.5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home Hub"
            className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">
              Starred Study Vault <span className="font-mono-num text-[#64748B]">({total})</span>
            </h1>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Pinned MCQs, Notes, Short Notes, PYQs, Modules &amp; Exceptions
            </p>
          </div>
        </div>

        {starredMCQs.length > 0 && (
          <button
            type="button"
            onClick={() => onPracticeQuestions(starredMCQs, 'Starred MCQs')}
            className={PRIMARY_BTN_CLASS}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Practice Starred (<span className="font-mono-num">{starredMCQs.length}</span>)
          </button>
        )}
      </div>

      {total === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-7 text-center space-y-1.5">
          <Star className="w-6 h-6 text-[#F59E0B] mx-auto opacity-85" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            Your Star Vault is empty
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            Tap Star on any question during a quiz, or on any Note, PYQ, or Exception to pin it here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {starredMCQs.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Starred MCQs ({starredMCQs.length})
              </h2>
              <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                {starredMCQs.map((q) => (
                  <article key={q.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      <span>
                        {q.subject} · {q.chapter}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleQuestionStar(q.id)}
                        className="text-[#F59E0B] hover:opacity-80 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Star className="w-3 h-3 fill-current" />
                        Unstar
                      </button>
                    </div>
                    <p className="text-sm font-semibold font-hindi leading-[1.6] text-[#0F172A] dark:text-[#F1F5F9]">
                      <MathText text={q.question_hi} />
                    </p>
                    <p className="text-xs text-[#059669] dark:text-[#34D399] font-medium font-hindi flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <MathText text={q.options_hi[q.correct_index]} />
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {starredNotes.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Starred Notes ({starredNotes.length})
              </h2>
              <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                {starredNotes.map((n) => {
                  const isOpen = Boolean(expandedIds[n.id]);
                  return (
                    <div key={n.id} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            {n.subject} · {n.chapter}
                          </p>
                          <p className="text-sm font-semibold font-hindi text-[#0F172A] dark:text-[#F1F5F9]">
                            <MathText text={n.title} />
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleExpand(n.id)}
                            aria-expanded={isOpen}
                            className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#6366F1] flex items-center gap-0.5 cursor-pointer"
                          >
                            {isOpen ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                Hide
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                Preview
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUnstarRecord('notes', n.id)}
                            className="text-[#F59E0B] hover:opacity-80 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Star className="w-3 h-3 fill-current" />
                            Unstar
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.06] space-y-2 text-xs font-hindi leading-[1.6] text-[#334155] dark:text-[#CBD5E1]">
                          <div className="whitespace-pre-line">
                            <MathText text={n.content_hi} />
                          </div>
                          {n.keyPoints_hi.length > 0 && (
                            <ul className="list-disc pl-4 space-y-1 text-[#0F172A] dark:text-[#E2E8F0]">
                              {n.keyPoints_hi.map((kp, i) => (
                                <li key={i}>
                                  <MathText text={kp} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {starredShort.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Starred Short Notes ({starredShort.length})
              </h2>
              <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                {starredShort.map((s) => {
                  const isOpen = Boolean(expandedIds[s.id]);
                  return (
                    <div key={s.id} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            {s.subject} · {s.chapter}
                          </p>
                          <p className="text-sm font-semibold font-hindi text-[#0F172A] dark:text-[#F1F5F9]">
                            <MathText text={s.title} />
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleExpand(s.id)}
                            aria-expanded={isOpen}
                            className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#6366F1] flex items-center gap-0.5 cursor-pointer"
                          >
                            {isOpen ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                Hide
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                Preview
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUnstarRecord('shortNotes', s.id)}
                            className="text-[#F59E0B] hover:opacity-80 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Star className="w-3 h-3 fill-current" />
                            Unstar
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.06] space-y-2 text-xs font-hindi leading-[1.6] text-[#334155] dark:text-[#CBD5E1]">
                          {s.formulas_hi.length > 0 && (
                            <div className="space-y-1">
                              {s.formulas_hi.map((f, i) => (
                                <div
                                  key={i}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#F4F6FA] dark:bg-[#0E121B]"
                                >
                                  <MathText text={f} />
                                </div>
                              ))}
                            </div>
                          )}
                          {s.quickPoints_hi.length > 0 && (
                            <ul className="list-disc pl-4 space-y-1 text-[#0F172A] dark:text-[#E2E8F0]">
                              {s.quickPoints_hi.map((qp, i) => (
                                <li key={i}>
                                  <MathText text={qp} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(starredPYQs.length > 0 || starredSpecial.length > 0 || starredModules.length > 0) && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Other Starred Items (
                {starredPYQs.length + starredSpecial.length + starredModules.length})
              </h2>
              <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                {starredPYQs.map((p) => (
                  <div key={p.id} className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-[#059669] dark:text-[#34D399] font-semibold">
                        {p.examTag} · {p.chapter}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleUnstarRecord('pyqs', p.id)}
                        className="text-[#F59E0B] hover:opacity-80 text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Star className="w-3 h-3 fill-current" />
                        Unstar
                      </button>
                    </div>
                    <p className="text-sm font-hindi text-[#0F172A] dark:text-[#F1F5F9]">
                      <MathText text={p.question_hi} />
                    </p>
                  </div>
                ))}
                {starredSpecial.map((sp) => {
                  const isOpen = Boolean(expandedIds[sp.id]);
                  return (
                    <div key={sp.id} className="p-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-[#4F46E5] dark:text-[#818CF8] font-semibold">
                            {sp.category} · {sp.chapter}
                          </p>
                          <p className="text-sm font-semibold font-hindi text-[#0F172A] dark:text-[#F1F5F9]">
                            <MathText text={sp.title} />
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleExpand(sp.id)}
                            aria-expanded={isOpen}
                            className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#6366F1] flex items-center gap-0.5 cursor-pointer"
                          >
                            {isOpen ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                Hide
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                Preview
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUnstarRecord('specials', sp.id)}
                            className="text-[#F59E0B] hover:opacity-80 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Star className="w-3 h-3 fill-current" />
                            Unstar
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.06] space-y-1.5 text-xs font-hindi leading-[1.6] text-[#334155] dark:text-[#CBD5E1]">
                          <div>
                            <MathText text={sp.content_hi} />
                          </div>
                          {sp.memoryTrick_hi && (
                            <div className="p-2 rounded-lg bg-[#6366F1]/[0.08] border border-[#6366F1]/20 text-[#3730A3] dark:text-[#C7D2FE]">
                              <strong>Trick:</strong> <MathText text={sp.memoryTrick_hi} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {starredModules.map((m) => (
                  <div key={m.id} className="p-3.5 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-semibold">
                        Module · {m.subject}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleUnstarRecord('modules', m.id)}
                        className="text-[#F59E0B] hover:opacity-80 text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Star className="w-3 h-3 fill-current" />
                        Unstar
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {m.name}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 6. SAVE VAULT VIEW (Saved Questions & Saved PYQs Revision Hub)
 * ==========================================================================*/
interface SaveVaultViewProps {
  questions: MCQQuestion[];
  pyqs: PYQItem[];
  onPracticeQuestions: (questions: MCQQuestion[], label: string) => void;
  onToggleQuestionSave: (id: string) => void;
  onBackHome: () => void;
}

export const SaveVaultView: React.FC<SaveVaultViewProps> = ({
  questions,
  pyqs,
  onPracticeQuestions,
  onToggleQuestionSave,
  onBackHome,
}) => {
  const savedQuestions = useMemo(() => {
    const savedMcqs = questions.filter((q) => q.isSaved);
    const savedPyqs = pyqs.filter((p) => p.isSaved).map(pyqToUnifiedQuestion);
    return [...savedMcqs, ...savedPyqs].sort((a, b) => b.createdAt - a.createdAt);
  }, [questions, pyqs]);

  return (
    <div className="space-y-3.5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home Hub"
            className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">
              Saved Questions{' '}
              <span className="font-mono-num text-[#64748B]">({savedQuestions.length})</span>
            </h1>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Saved MCQs and PYQs queued for targeted re-solving
            </p>
          </div>
        </div>

        {savedQuestions.length > 0 && (
          <button
            type="button"
            onClick={() => onPracticeQuestions(savedQuestions, 'Saved Questions Test')}
            className={PRIMARY_BTN_CLASS}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Solve Saved (<span className="font-mono-num">{savedQuestions.length}</span>)
          </button>
        )}
      </div>

      {savedQuestions.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-7 text-center space-y-1.5">
          <Bookmark className="w-6 h-6 text-cyan-500 mx-auto opacity-85" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            No saved questions yet
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            Click Save on any question while taking a quiz, reviewing an answer key, or browsing PYQs.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
          {savedQuestions.map((q) => (
            <article key={q.id} className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                <span className="truncate">
                  {q.year ? (
                    <strong className="text-[#059669] dark:text-[#34D399] font-mono-num mr-1">
                      NEET {q.year} PYQ ·
                    </strong>
                  ) : null}
                  {q.subject} · {q.chapter} · {q.difficulty}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleQuestionSave(q.id)}
                  className="text-cyan-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1 shrink-0"
                >
                  <Bookmark className="w-3 h-3 fill-current" />
                  Remove
                </button>
              </div>
              <p className="text-sm font-semibold font-hindi leading-[1.6] text-[#0F172A] dark:text-[#F1F5F9]">
                <MathText text={q.question_hi} />
              </p>
              <p className="text-xs text-[#059669] dark:text-[#34D399] font-medium font-hindi flex items-center gap-1">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>
                  ({['A', 'B', 'C', 'D'][q.correct_index]}){' '}
                  <MathText text={q.options_hi[q.correct_index]} />
                </span>
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
