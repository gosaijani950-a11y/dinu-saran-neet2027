import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileUp,
  FolderOpen,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Star,
  Target,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  ProcessedUploadBundle,
  SubjectName,
  UploadedModule,
  UserRole,
  ViewRoute,
} from '../types';
import { getChaptersBySubject } from '../data/syllabus';
import { processUploadedFiles } from '../services/fileProcessor';
import {
  generateDetailedNotes,
  generateShortNotes,
  generateSpecialExceptions,
} from '../services/geminiService';
import {
  deleteCloudModule,
  upsertCloudModule,
  upsertCloudNote,
  upsertCloudShortNote,
  upsertCloudSpecials,
} from '../services/supabaseService';
import { db, loadModuleBundle, saveModuleBundle } from '../db/database';
import { getSourceDensityEstimate } from '../utils/quizLogic';
import { useSubjects } from '../utils/subjects';
import { MathText } from './MathText';

const LAST_ACTIVE_MODULE_KEY = 'dinu_saran_neet_2027_active_module_id';

interface ModulesStudioProps {
  role: UserRole;
  settings: AppSettings;
  modules: UploadedModule[];
  customSubjects: string[];
  onRefreshData: () => Promise<void>;
  onLaunchMcqGenerationFromModule: (params: {
    subject: SubjectName;
    chapter: string;
    count: number;
    bundle: ProcessedUploadBundle;
    moduleId: string;
  }) => void;
  onNavigate?: (route: ViewRoute) => void;
  onOpenSettings: () => void;
  onBackHome: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const ModulesStudio: React.FC<ModulesStudioProps> = ({
  role,
  settings,
  modules,
  customSubjects,
  onRefreshData,
  onLaunchMcqGenerationFromModule,
  onNavigate,
  onOpenSettings,
  onBackHome,
  onToast,
}) => {
  const isAdmin = role === 'admin';
  const { subjects, subjectsWithAll } = useSubjects(customSubjects);

  const [subject, setSubject] = useState<SubjectName>('Botany');
  const chapters = useMemo(() => getChaptersBySubject(subject), [subject]);
  const [chapter, setChapter] = useState<string>(chapters[0]?.name || 'General');
  const [customChapter, setCustomChapter] = useState('');
  const [mcqCount, setMcqCount] = useState(50);

  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('All');
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  const [bundle, setBundle] = useState<ProcessedUploadBundle | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_ACTIVE_MODULE_KEY);
    } catch {
      return null;
    }
  });
  const [storedBundleIds, setStoredBundleIds] = useState<Set<string>>(new Set());
  const [loadingBundleId, setLoadingBundleId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [busyAction, setBusyAction] = useState<'notes' | 'short' | 'special' | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const effectiveChapter = customChapter.trim() || chapter;
  const density = bundle ? getSourceDensityEstimate(bundle.totalPages) : null;

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter((m) => {
      if (filterSubject !== 'All' && m.subject !== filterSubject) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.chapter.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        (m.extractedSummary && m.extractedSummary.toLowerCase().includes(q))
      );
    });
  }, [modules, filterSubject, search]);

  // Hydrate persisted module bundle availability and auto-load active/latest module from IndexedDB (Admin only)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      const keys = await db.moduleBundles.toCollection().primaryKeys();
      if (cancelled) return;
      const keySet = new Set(keys.map(String));
      setStoredBundleIds(keySet);

      const preferredId =
        (activeModuleId && keySet.has(activeModuleId) ? activeModuleId : null) ||
        modules.find((m) => keySet.has(m.id))?.id ||
        null;

      if (preferredId && !bundle) {
        const persisted = await loadModuleBundle(preferredId);
        if (!cancelled && persisted) {
          setBundle(persisted);
          setActiveModuleId(preferredId);
          const matchedMod = modules.find((m) => m.id === preferredId);
          if (matchedMod) {
            setSubject(matchedMod.subject);
            setChapter(matchedMod.chapter);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, isAdmin]);

  const handleLoadStoredModule = async (mod: UploadedModule) => {
    if (!isAdmin) return;
    setLoadingBundleId(mod.id);
    try {
      const persisted = await loadModuleBundle(mod.id);
      if (!persisted || persisted.pages.length === 0) {
        onToast('No stored page data found for this module. Re-upload its PDF/photo once.', 'info');
        return;
      }
      setBundle(persisted);
      setActiveModuleId(mod.id);
      setSubject(mod.subject);
      setChapter(mod.chapter);
      setCustomChapter('');
      try {
        localStorage.setItem(LAST_ACTIVE_MODULE_KEY, mod.id);
      } catch {
        // ignore
      }
      onToast(`Loaded "${mod.name}" (${persisted.totalPages} pages) from IndexedDB.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load module from IndexedDB.', 'error');
    } finally {
      setLoadingBundleId(null);
    }
  };

  const handleSubjectChange = (nextSubj: string) => {
    setSubject(nextSubj);
    const list = getChaptersBySubject(nextSubj);
    setChapter(list[0]?.name || 'General');
  };

  const handleUpload = async (fileList: FileList | File[]) => {
    if (!isAdmin) return;
    const files = Array.from(fileList);
    if (!files.length) return;
    setProcessing(true);
    setProcessingText('Extracting text & optimizing scans locally...');
    try {
      const processed = await processUploadedFiles(files, setProcessingText);
      setBundle(processed);

      const modId = `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const hasPdf = processed.files.some((f) => f.type === 'pdf');
      const hasImg = processed.files.some((f) => f.type === 'image');
      const rawSnippet = processed.pages
        .map((p) => p.text.trim())
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 1600);

      const record: UploadedModule = {
        id: modId,
        name:
          processed.files.length === 1
            ? processed.files[0].name
            : `${processed.files[0].name} + ${processed.files.length - 1} more`,
        subject,
        chapter: effectiveChapter,
        fileType: hasPdf && hasImg ? 'mixed' : hasPdf ? 'pdf' : 'images',
        pageCount: processed.totalPages,
        extractedChars: processed.totalTextChars,
        imagePageCount: processed.imagePageCount,
        extractedSummary:
          rawSnippet ||
          `${processed.totalPages} page scan module (${processed.imagePageCount} high-res image page(s)).`,
        isStarred: false,
        generatedCounts: { mcqs: 0, notes: 0, shortNotes: 0, specials: 0 },
        createdAt: Date.now(),
      };

      await Promise.all([db.modules.put(record), saveModuleBundle(modId, processed)]);
      await upsertCloudModule(settings, record).catch(() => false);
      setActiveModuleId(modId);
      setStoredBundleIds((prev) => new Set(prev).add(modId));
      try {
        localStorage.setItem(LAST_ACTIVE_MODULE_KEY, modId);
      } catch {
        // ignore
      }
      await onRefreshData();
      onToast(`Uploaded & saved ${processed.totalPages} page(s) to IndexedDB.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'File upload failed.', 'error');
    } finally {
      setProcessing(false);
      setProcessingText('');
    }
  };

  const ensureApiReady = (): boolean => {
    if (!isAdmin) return false;
    if (!settings.apiKey.trim()) {
      onToast('Configure your Gemini API key in Settings (⚙️) first.', 'error');
      onOpenSettings();
      return false;
    }
    if (!bundle || bundle.pages.length === 0) {
      onToast('Upload a PDF, book scan, or handwritten notes photo first.', 'error');
      return false;
    }
    return true;
  };

  const incrementModuleCount = async (key: keyof UploadedModule['generatedCounts'], delta: number) => {
    if (!activeModuleId) return;
    const mod = await db.modules.get(activeModuleId);
    if (!mod) return;
    mod.generatedCounts[key] += delta;
    await db.modules.put(mod);
    await upsertCloudModule(settings, mod).catch(() => false);
  };

  const handleGenerateNotes = async () => {
    if (!ensureApiReady()) return;
    setBusyAction('notes');
    try {
      const note = await generateDetailedNotes({
        settings,
        subject,
        chapter: effectiveChapter,
        pages: bundle!.pages,
        sourceModuleId: activeModuleId || undefined,
      });
      await db.notes.put(note);
      await upsertCloudNote(settings, note).catch(() => false);
      await incrementModuleCount('notes', 1);
      await onRefreshData();
      onToast('Detailed Hindi Notes generated and saved to NOTES!', 'success');
    } catch (err) {
      onToast(`API Error: ${err instanceof Error ? err.message : 'Failed to generate notes'}`, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateShortNotes = async () => {
    if (!ensureApiReady()) return;
    setBusyAction('short');
    try {
      const sn = await generateShortNotes({
        settings,
        subject,
        chapter: effectiveChapter,
        pages: bundle!.pages,
        sourceModuleId: activeModuleId || undefined,
      });
      await db.shortNotes.put(sn);
      await upsertCloudShortNote(settings, sn).catch(() => false);
      await incrementModuleCount('shortNotes', 1);
      await onRefreshData();
      onToast('1-Page Short Notes & Formulas saved to SHORT NOTES!', 'success');
    } catch (err) {
      onToast(`API Error: ${err instanceof Error ? err.message : 'Failed to generate short notes'}`, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateSpecials = async () => {
    if (!ensureApiReady()) return;
    setBusyAction('special');
    try {
      const items = await generateSpecialExceptions({
        settings,
        subject,
        chapter: effectiveChapter,
        pages: bundle!.pages,
        sourceModuleId: activeModuleId || undefined,
      });
      await db.specials.bulkPut(items);
      await upsertCloudSpecials(settings, items).catch(() => false);
      await incrementModuleCount('specials', items.length);
      await onRefreshData();
      onToast(`${items.length} NCERT Exceptions & Tricks saved to SPECIAL!`, 'success');
    } catch (err) {
      onToast(`API Error: ${err instanceof Error ? err.message : 'Failed to extract exceptions'}`, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateMCQs = () => {
    if (!ensureApiReady()) return;
    onLaunchMcqGenerationFromModule({
      subject,
      chapter: effectiveChapter,
      count: mcqCount,
      bundle: bundle!,
      moduleId: activeModuleId || `mod-${Date.now()}`,
    });
  };

  const handleToggleModuleStar = async (mod: UploadedModule) => {
    await db.modules.update(mod.id, { isStarred: !mod.isStarred });
    await onRefreshData();
  };

  const handleDeleteModule = async (id: string) => {
    if (!isAdmin) return;
    await Promise.all([db.modules.delete(id), db.moduleBundles.delete(id)]);
    await deleteCloudModule(settings, id).catch(() => false);
    setStoredBundleIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeModuleId === id) {
      setActiveModuleId(null);
      setBundle(null);
      try {
        localStorage.removeItem(LAST_ACTIVE_MODULE_KEY);
      } catch {
        // ignore
      }
    }
    await onRefreshData();
    onToast('Module and stored pages deleted.', 'info');
  };

  return (
    <div className="space-y-4 pb-10">
      {/* Slim Header */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBackHome}
          aria-label="Back to Home Hub"
          className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] truncate">
            {isAdmin ? 'AI Upload & Modules Studio' : 'Study Modules & Materials'}
          </h1>
          <p className="text-[11px] text-[#64748B] truncate">
            {isAdmin
              ? 'PDFs & handwritten scans persisted in IndexedDB → 1-click MCQs, Notes & Traps'
              : 'Read-only published NCERT chapter modules · Star favorites privately'}
          </p>
        </div>
      </div>

      {/* Admin-only Unified Upload & Generator Card */}
      {isAdmin && (
        <section className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] shadow-xs divide-y divide-slate-200/80 dark:divide-white/[0.06] overflow-hidden">
          {/* Assignment Row */}
          <div className="p-3.5 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                id="mod-subject"
                aria-label="Assign Subject"
                value={subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="h-8.5 px-2.5 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9]"
              >
                {subjects.map((s) => (
                  <option key={s} value={s} className="bg-white dark:bg-[#141923]">
                    {s}
                  </option>
                ))}
              </select>

              <select
                id="mod-chapter"
                aria-label="Assign NEET 2027 Chapter"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="h-8.5 px-2.5 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9]"
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

              <input
                type="text"
                value={customChapter}
                onChange={(e) => setCustomChapter(e.target.value)}
                placeholder="Optional custom topic..."
                aria-label="Optional custom chapter title"
                className="h-8.5 px-2.5 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#64748B]"
              />
            </div>

            {/* Compact Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) void handleUpload(e.dataTransfer.files);
              }}
              className="rounded-xl border border-dashed border-indigo-500/35 bg-[#F4F6FA] dark:bg-[#0E121B] px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3"
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files?.length) void handleUpload(e.target.files);
                }}
                className="hidden"
              />
              {processing ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-[#6366F1]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{processingText}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-indigo-500/12 text-[#6366F1] flex items-center justify-center shrink-0">
                      <Upload className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 text-center sm:text-left">
                      <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                        Drop PDFs, coaching modules, or handwritten notes
                      </p>
                      <p className="text-[11px] text-[#64748B]">
                        Client-side PDF.js extraction + JPEG canvas optimization · saved &amp; synced
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="h-8 px-3 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    Choose Files
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Active Bundle 1-Click Generators */}
          {bundle && density && (
            <div className="p-3.5 space-y-3 bg-[#F4F6FA]/60 dark:bg-[#0E121B]/50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#10B981] font-mono-num">
                    Ready · {bundle.totalPages} page(s) · {bundle.imagePageCount} scan(s)
                  </p>
                  <p className="text-[11px] text-[#64748B] truncate">{density.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBundle(null)}
                  aria-label="Remove uploaded bundle"
                  className="w-7 h-7 rounded-lg text-[#64748B] hover:text-[#F43F5E] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-indigo-500/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-[#6366F1]" />
                      Real MCQs
                    </span>
                    <select
                      aria-label="MCQ generation count"
                      value={mcqCount}
                      onChange={(e) => setMcqCount(Number(e.target.value))}
                      className="h-6.5 px-2 rounded-md text-[11px] font-mono-num bg-[#EEF2F7] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9]"
                    >
                      {[20, 40, 60, 100, 200, 500].map((n) => (
                        <option key={n} value={n}>
                          {n} MCQs
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateMCQs}
                    className="w-full h-8 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold cursor-pointer"
                  >
                    Generate {mcqCount} MCQs →
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between gap-2">
                  <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-sky-500" />
                    Detailed Hindi Notes
                  </span>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleGenerateNotes()}
                    className="w-full h-8 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {busyAction === 'notes' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Generate Notes
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between gap-2">
                  <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
                    1-Page Short Notes
                  </span>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleGenerateShortNotes()}
                    className="w-full h-8 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {busyAction === 'short' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Generate 1-Page Sheet
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between gap-2">
                  <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-500" />
                    Special Exceptions &amp; Traps
                  </span>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleGenerateSpecials()}
                    className="w-full h-8 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {busyAction === 'special' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Extract Exceptions
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Search & Subject Filter Track */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules by chapter or topic..."
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

      {/* Persisted Modules Library */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8] inline-flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#6366F1]" />
            {isAdmin ? `Saved Modules (${filteredModules.length})` : `Published Modules (${filteredModules.length})`}
          </h2>
        </div>

        {filteredModules.length === 0 ? (
          <div className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-7 text-center text-xs text-[#64748B]">
            {isAdmin
              ? 'No modules uploaded yet. Drop any NCERT chapter PDF or handwritten notes above.'
              : 'No published modules match your search filter yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredModules.map((mod) => {
              const isLoaded = activeModuleId === mod.id && Boolean(bundle);
              const hasStoredBundle = storedBundleIds.has(mod.id);
              const isExpanded = expandedModuleId === mod.id;
              return (
                <div
                  key={mod.id}
                  className={`bg-white dark:bg-[#141923] rounded-xl border p-3 space-y-2 transition-colors ${
                    isLoaded
                      ? 'border-indigo-500/45'
                      : 'border-slate-200 dark:border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                        {mod.name}
                      </h3>
                      <p className="text-[11px] text-[#64748B] truncate font-mono-num">
                        {mod.subject} · {mod.chapter} · {mod.pageCount}p
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleModuleStar(mod)}
                        aria-label={`Star module ${mod.name}`}
                        className={`p-1 rounded-md cursor-pointer ${
                          mod.isStarred ? 'text-[#F59E0B]' : 'text-[#64748B] hover:text-[#F59E0B]'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${mod.isStarred ? 'fill-current' : ''}`} />
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteModule(mod.id)}
                          aria-label={`Delete module ${mod.name}`}
                          className="p-1 rounded-md text-[#64748B] hover:text-[#F43F5E] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-mono-num text-[#64748B]">
                      {mod.generatedCounts.mcqs} Q · {mod.generatedCounts.notes} N ·{' '}
                      {mod.generatedCounts.shortNotes} SN
                    </p>
                    <div className="flex items-center gap-1.5">
                      {mod.extractedSummary && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedModuleId((prev) => (prev === mod.id ? null : mod.id))
                          }
                          className="h-6.5 px-2 rounded-md bg-[#EEF2F7] dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-indigo-500/15 cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              Read
                            </>
                          )}
                        </button>
                      )}
                      {isAdmin && hasStoredBundle && (
                        <button
                          type="button"
                          disabled={loadingBundleId === mod.id}
                          onClick={() => void handleLoadStoredModule(mod)}
                          className={`h-6.5 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                            isLoaded
                              ? 'bg-emerald-500/12 text-emerald-700 dark:text-[#10B981] border border-emerald-500/30'
                              : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] hover:bg-indigo-500/15'
                          }`}
                        >
                          {loadingBundleId === mod.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isLoaded ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <FolderOpen className="w-3 h-3" />
                          )}
                          {isLoaded ? 'Loaded' : 'Load'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.06] space-y-2">
                      {mod.extractedSummary && (
                        <div className="text-xs font-hindi leading-relaxed text-[#334155] dark:text-[#CBD5E1] whitespace-pre-line max-h-48 overflow-y-auto">
                          <MathText text={mod.extractedSummary} />
                        </div>
                      )}
                      {onNavigate && (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => onNavigate('notes')}
                            className="px-2 py-1 rounded-md bg-sky-500/12 text-sky-700 dark:text-sky-300 text-[11px] font-semibold cursor-pointer"
                          >
                            Open Notes
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate('quiz-setup')}
                            className="px-2 py-1 rounded-md bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold cursor-pointer"
                          >
                            Practice MCQs
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
