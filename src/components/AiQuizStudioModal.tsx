import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CloudUpload,
  FileText,
  Film,
  FolderPlus,
  Globe,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { MCQQuestion } from '../types';
import {
  generateUltraNeetQuestions,
  getAllPublishedQuizzesLocal,
  getPersistentAdminQuestions,
  normalizeStrictNeetQuestion,
  publishAndPersistAdminQuiz,
  type NeetDifficultyLevel,
  type NeetQuestionBasis,
  type PublishedQuizRecord,
} from '../services/dinuMentorService';
import { QuizFilterBar } from './QuizFilterBar';

export interface StudioQuizConfig {
  title: string;
  quizType: string;
  durationMins: number;
  subject: string;
  chapter: string;
}

interface UploadedMediaAsset {
  id: string;
  name: string;
  kind: 'video' | 'pdf' | 'document' | 'image';
  sizeLabel: string;
  extractedContext: string;
}

interface SavedStudioFolder {
  id: string;
  name: string;
  subject: string;
  chapter: string;
  difficulty: NeetDifficultyLevel;
  questionBasis: NeetQuestionBasis;
  createdAt: number;
  questions: MCQQuestion[];
}

interface AiQuizStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onSaveToChapterBank: (subject: string, chapter: string, questions: MCQQuestion[]) => void;
  onStartLiveAttempt: (questions: MCQQuestion[], config: StudioQuizConfig) => void;
  isAdmin?: boolean;
  supabaseClient?: any;
}

const SUBJECT_CHAPTERS: Record<string, string[]> = {
  Physics: [
    'Units & Measurements',
    'Kinematics & Laws of Motion',
    'Work, Energy & Power',
    'Rotational Motion',
    'Gravitation',
    'Thermodynamics & KTG',
    'Electrostatics & Current Electricity',
    'Magnetism & EMI',
    'Optics (Ray & Wave)',
    'Modern Physics & Semiconductors',
  ],
  Chemistry: [
    'Some Basic Concepts & Atomic Structure',
    'Chemical Bonding & Molecular Structure',
    'Thermodynamics & Equilibrium',
    'Electrochemistry & Chemical Kinetics',
    'Coordination Compounds & d-Block',
    'GOC & Hydrocarbons',
    'Haloalkanes, Alcohols, Phenols & Ethers',
    'Aldehydes, Ketones, Carboxylic Acids & Amines',
    'Biomolecules',
  ],
  Botany: [
    'The Living World & Biological Classification',
    'Plant Kingdom',
    'Morphology & Anatomy of Flowering Plants',
    'Cell: The Unit of Life & Cell Cycle',
    'Photosynthesis in Higher Plants',
    'Respiration in Plants & Plant Growth',
    'Sexual Reproduction in Flowering Plants',
    'Molecular Basis of Inheritance',
    'Ecology & Environment',
  ],
  Zoology: [
    'Animal Kingdom',
    'Structural Organisation in Animals',
    'Biomolecules & Digestion',
    'Breathing, Body Fluids & Circulation',
    'Excretory, Locomotion & Neural Control',
    'Chemical Coordination & Integration',
    'Human Reproduction & Reproductive Health',
    'Principles of Inheritance & Evolution',
    'Human Health, Disease & Biotechnology',
  ],
};

const STORAGE_FOLDERS_KEY = 'neet2027_ai_studio_folders_v3';
const STORAGE_PERSONAL_BANK_KEY = 'neet2027_personal_chapter_bank_v3';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function extractDocumentTextSafe(file: File): Promise<string> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
      const txt = await file.slice(0, 60000).text();
      return txt.replace(/\s+/g, ' ').trim().slice(0, 2600);
    }
    const buffer = await file.slice(0, 200000).arrayBuffer();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(buffer);
    const readableMatches =
      rawText.match(/[A-Za-z0-9\u0900-\u097F][A-Za-z0-9\u0900-\u097F ,.;:()\-+/=%]{14,}/g) || [];
    return readableMatches.slice(0, 50).join(' ').replace(/\s+/g, ' ').trim().slice(0, 2200);
  } catch {
    return '';
  }
}

export const AiQuizStudioModal: React.FC<AiQuizStudioModalProps> = ({
  isOpen,
  onClose,
  onToast,
  onSaveToChapterBank,
  onStartLiveAttempt,
  isAdmin = true,
  supabaseClient,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'published' | 'folders'>('create');
  const [subject, setSubject] = useState<string>('Botany');
  const [chapter, setChapter] = useState<string>(SUBJECT_CHAPTERS.Botany[0]);
  const [prompt, setPrompt] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [difficulty, setDifficulty] = useState<NeetDifficultyLevel>('Advanced');
  const [questionBasis, setQuestionBasis] = useState<NeetQuestionBasis>('NCERT Line-by-Line');
  const [durationMins, setDurationMins] = useState<number>(20);
  const [quizTitle, setQuizTitle] = useState<string>('');

  const [uploadedAssets, setUploadedAssets] = useState<UploadedMediaAsset[]>([]);
  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Restore last generated batch automatically so Admin never loses work on reload
  const [generatedQuestions, setGeneratedQuestions] = useState<MCQQuestion[]>(() =>
    getPersistentAdminQuestions().slice(0, 30)
  );

  const [publishedQuizzes, setPublishedQuizzes] = useState<PublishedQuizRecord[]>(() =>
    getAllPublishedQuizzesLocal()
  );

  const [folders, setFolders] = useState<SavedStudioFolder[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_FOLDERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [folderSearch, setFolderSearch] = useState<string>('');

  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const list = SUBJECT_CHAPTERS[subject] || ['General Chapter'];
    if (!list.includes(chapter)) {
      setChapter(list[0]);
    }
  }, [subject, chapter]);

  useEffect(() => {
    const syncListener = () => setPublishedQuizzes(getAllPublishedQuizzesLocal());
    window.addEventListener('neet-published-quizzes-updated', syncListener);
    return () => {
      window.removeEventListener('neet-published-quizzes-updated', syncListener);
      try {
        recognitionRef.current?.stop?.();
      } catch {}
    };
  }, []);

  const persistFolders = (nextFolders: SavedStudioFolder[]) => {
    setFolders(nextFolders);
    try {
      localStorage.setItem(STORAGE_FOLDERS_KEY, JSON.stringify(nextFolders));
    } catch {}
  };

  const handleToggleVoice = () => {
    try {
      if (isListening) {
        recognitionRef.current?.stop?.();
        setIsListening(false);
        return;
      }
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        onToast('इस ब्राउज़र में वॉइस इनपुट उपलब्ध नहीं है।', 'error');
        return;
      }
      const rec = new SpeechRec();
      rec.lang = 'hi-IN';
      rec.interimResults = false;
      rec.onresult = (e: any) => {
        const transcript = e?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  const handleMediaFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsProcessingMedia(true);
    try {
      const newAssets: UploadedMediaAsset[] = [];
      for (const file of Array.from(fileList)) {
        const mime = (file.type || '').toLowerCase();
        const lower = file.name.toLowerCase();
        const isVideo =
          mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v|3gp)$/i.test(lower);
        const isPdf = mime === 'application/pdf' || lower.endsWith('.pdf');
        const isImage =
          mime.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(lower);

        if (isVideo) {
          newAssets.push({
            id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'video',
            sizeLabel: formatBytes(file.size),
            extractedContext: `Lecture Video Topic: ${file.name.replace(/\.[^.]+$/, '')}`,
          });
        } else if (isImage) {
          newAssets.push({
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'image',
            sizeLabel: formatBytes(file.size),
            extractedContext: `NCERT Diagram / Notes: ${file.name}`,
          });
        } else {
          const text = await extractDocumentTextSafe(file);
          newAssets.push({
            id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: isPdf ? 'pdf' : 'document',
            sizeLabel: formatBytes(file.size),
            extractedContext: text || `Study Document: ${file.name}`,
          });
        }
      }
      setUploadedAssets((prev) => [...prev, ...newAssets]);
      onToast(`${newAssets.length} फ़ाइल/वीडियो प्रोसेस हो गई।`, 'success');
    } catch {
      onToast('फ़ाइल प्रोसेस करते समय समस्या आई।', 'error');
    } finally {
      setIsProcessingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleGenerateQuestions = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const sourceContext = uploadedAssets
        .map((a) => `[${a.kind.toUpperCase()}] ${a.name}: ${a.extractedContext}`)
        .join('\n');

      const mcqs = await generateUltraNeetQuestions({
        subject,
        chapter,
        count: questionCount,
        difficulty,
        questionBasis,
        customPrompt: prompt,
        sourceContext,
      });

      setGeneratedQuestions(mcqs);

      // Immediately persist locally + merge into chapter bank so questions NEVER vanish
      const titleStr =
        quizTitle.trim() || `${subject} • ${chapter} (${difficulty} • ${questionBasis})`;
      const record: PublishedQuizRecord = {
        id: `pub_quiz_${Date.now()}`,
        title: titleStr,
        subject: subject as any,
        chapter,
        difficulty,
        questionBasis,
        durationMins,
        questions: mcqs,
        createdAt: Date.now(),
        createdBy: isAdmin ? 'Dinu Admin' : 'Student Studio',
      };

      const { syncedToCloud } = await publishAndPersistAdminQuiz(record, supabaseClient);
      setPublishedQuizzes(getAllPublishedQuizzesLocal());
      onSaveToChapterBank(subject, chapter, mcqs);

      onToast(
        syncedToCloud
          ? `✨ ${mcqs.length} ${difficulty} प्रश्न बने और सभी Users के लिए Cloud में लाइव हो गए!`
          : `✅ ${mcqs.length} ${difficulty} प्रश्न बने और स्थायी रूप से सेव हो गए!`,
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'प्रश्न जनरेट करने में त्रुटि आई।';
      onToast(msg, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishToAllUsers = async () => {
    if (generatedQuestions.length === 0 || isPublishing) return;
    setIsPublishing(true);
    try {
      const titleStr =
        quizTitle.trim() || `${subject} • ${chapter} (${difficulty} • ${questionBasis})`;
      const record: PublishedQuizRecord = {
        id: `pub_quiz_${Date.now()}`,
        title: titleStr,
        subject: subject as any,
        chapter,
        difficulty,
        questionBasis,
        durationMins,
        questions: generatedQuestions,
        createdAt: Date.now(),
        createdBy: 'Dinu Admin',
      };

      const { syncedToCloud } = await publishAndPersistAdminQuiz(record, supabaseClient);
      setPublishedQuizzes(getAllPublishedQuizzesLocal());
      onSaveToChapterBank(subject, chapter, generatedQuestions);

      onToast(
        syncedToCloud
          ? '🚀 क्विज़ सफलतापूर्वक सभी Users के पैनल पर पब्लिश हो गया!'
          : '✅ क्विज़ लोकल व ग्लोबल बैंक में स्थायी सेव हो गया (Cloud के लिए Supabase कनेक्ट करें)।',
        'success'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveToFolder = () => {
    if (generatedQuestions.length === 0) return;
    const folderName =
      newFolderName.trim() || `${subject} • ${chapter} [${difficulty}]`;
    const next: SavedStudioFolder[] = [
      {
        id: `fld_${Date.now()}`,
        name: folderName,
        subject,
        chapter,
        difficulty,
        questionBasis,
        createdAt: Date.now(),
        questions: generatedQuestions,
      },
      ...folders,
    ].slice(0, 50);
    persistFolders(next);
    setNewFolderName('');
    onToast(`📁 "${folderName}" Vault में सेव हो गया।`, 'success');
  };

  const handleLaunchQuizSafe = (qsToLaunch: MCQQuestion[], customTitle?: string, mins?: number) => {
    const safeList = (Array.isArray(qsToLaunch) ? qsToLaunch : []).map((q, i) =>
      normalizeStrictNeetQuestion(q, i, { subject, chapter, difficulty, questionBasis })
    );
    if (safeList.length === 0) {
      onToast('लॉन्च करने के लिए प्रश्न उपलब्ध नहीं हैं।', 'error');
      return;
    }
    onStartLiveAttempt(safeList, {
      title: customTitle || quizTitle.trim() || `${subject} • ${chapter} (${difficulty})`,
      quizType: `${difficulty} · ${questionBasis}`,
      durationMins: Math.max(5, Number(mins || durationMins) || 20),
      subject,
      chapter,
    });
  };

  const filteredFolders = useMemo(() => {
    const q = folderSearch.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.subject.toLowerCase().includes(q) ||
        f.chapter.toLowerCase().includes(q)
    );
  }, [folders, folderSearch]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Ultra AI Quiz & Publishing Studio"
    >
      <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-[#6366F1] dark:text-indigo-400">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1.5">
                <span>AI Quiz &amp; Publishing Studio</span>
                {isAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Admin Cloud Sync
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Easy → Ultra (AIR-1) • NCERT Line-by-Line &amp; Concept Basis • Auto-Saved
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-[#6366F1] text-white'
                  : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              Generator
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('published')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                activeTab === 'published'
                  ? 'bg-[#6366F1] text-white'
                  : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              Live Quizzes ({publishedQuizzes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('folders')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                activeTab === 'folders'
                  ? 'bg-[#6366F1] text-white'
                  : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              Vaults ({folders.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Studio"
              className="w-8 h-8 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'create' && (
            <>
              {/* Quiz Title + Subject + Chapter */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Test / Quiz Title
                  </label>
                  <input
                    type="text"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    placeholder="e.g., NEET 2027 AIR-1 Ranker Test #04"
                    className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Subject
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {Object.keys(SUBJECT_CHAPTERS).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Chapter
                  </label>
                  <select
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {(SUBJECT_CHAPTERS[subject] || ['General']).map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Shared Ultra Filter Bar: Questions, Timer, Difficulty (Easy -> Ultra), Question Basis */}
              <QuizFilterBar
                questionCount={questionCount}
                onQuestionCountChange={setQuestionCount}
                durationMins={durationMins}
                onDurationMinsChange={setDurationMins}
                difficulty={difficulty}
                onDifficultyChange={setDifficulty}
                questionBasis={questionBasis}
                onQuestionBasisChange={setQuestionBasis}
                isAdmin={isAdmin}
              />

              {/* Prompt + Voice */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    Special Topic Focus / NCERT Page / Trap Instructions
                  </label>
                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      isListening
                        ? 'bg-rose-500 text-white'
                        : 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25'
                    }`}
                  >
                    {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    <span>{isListening ? 'Stop Voice' : 'Voice Dictate'}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="उदा. केवल NCERT की छिपी हुई लाइनों, तालिकाओं और अपवादों पर आधारित बहु-कथन (Multi-Statement) प्रश्न बनाएं..."
                  className="w-full p-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                />
              </div>

              {/* Admin Media Upload (PDF, Docs, Video) */}
              {isAdmin && (
                <div className="rounded-xl p-3 bg-[#F4F6FA] dark:bg-[#0E121B] border border-dashed border-slate-300 dark:border-white/[0.12] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      Upload Reference PDF / Notes / Video Lecture
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt,.md,.csv,image/*"
                        onChange={(e) => void handleMediaFilesSelected(e.target.files)}
                        className="hidden"
                      />
                      <input
                        ref={videoInputRef}
                        type="file"
                        multiple
                        accept="video/*,.mp4,.mov,.webm,.mkv,.avi"
                        onChange={(e) => void handleMediaFilesSelected(e.target.files)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={isProcessingMedia}
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 px-3 rounded-lg bg-white dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#6366F1]" />
                        <span>PDF / Doc</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProcessingMedia}
                        onClick={() => videoInputRef.current?.click()}
                        className="h-8 px-3 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Video</span>
                      </button>
                    </div>
                  </div>

                  {uploadedAssets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {uploadedAssets.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-[11px]"
                        >
                          <FileText className="w-3 h-3 text-indigo-500" />
                          <span className="max-w-[160px] truncate">{a.name}</span>
                          <span className="text-[10px] text-[#64748B]">({a.sizeLabel})</span>
                          <button
                            type="button"
                            onClick={() =>
                              setUploadedAssets((prev) => prev.filter((x) => x.id !== a.id))
                            }
                            className="text-rose-500 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Primary Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isGenerating || isProcessingMedia}
                  onClick={() => void handleGenerateQuestions()}
                  className="h-10 px-5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {isGenerating
                      ? `Generating ${difficulty} Questions...`
                      : `Generate ${questionCount} ${difficulty} MCQs`}
                  </span>
                </button>

                {generatedQuestions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLaunchQuizSafe(generatedQuestions)}
                      className="h-10 px-4 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Live Attempt ({generatedQuestions.length})</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        disabled={isPublishing}
                        onClick={() => void handlePublishToAllUsers()}
                        className="h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <CloudUpload className="w-4 h-4" />
                        <span>Publish to All Users</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Saved Preview & Vault Save */}
              {generatedQuestions.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder / Vault Name to save permanently..."
                      className="flex-1 min-w-[200px] h-9 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleSaveToFolder}
                      className="h-9 px-3.5 rounded-xl bg-[#EEF2F7] dark:bg-[#1C2331] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-[#6366F1]" />
                      <span>Save in Vault</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {generatedQuestions.slice(0, 8).map((q, idx) => (
                      <div
                        key={q.id}
                        className="p-3 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                          <span className="font-bold text-[#6366F1]">
                            Q{idx + 1} · {q.subject} · {q.chapter}
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Ans:{' '}
                            {['A', 'B', 'C', 'D'][q.correct_index] || 'A'}
                          </span>
                        </div>
                        <p className="font-hindi text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] whitespace-pre-line">
                          {q.question_hi}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'published' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-500" />
                  <span>Published Quizzes (Visible to Admin &amp; All Students)</span>
                </p>
              </div>

              {publishedQuizzes.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06]">
                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    No Published Quizzes Yet
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    Generate a quiz in the Studio tab and it will automatically appear here for all users.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {publishedQuizzes.map((pq) => (
                    <div
                      key={pq.id}
                      className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                            {pq.difficulty} · {pq.questionBasis}
                          </span>
                          <span className="text-[10px] text-[#64748B]">{pq.durationMins}m</span>
                        </div>
                        <h3 className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9] mt-1.5">
                          {pq.title}
                        </h3>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          {pq.subject} • {pq.questions.length} MCQs
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleLaunchQuizSafe(pq.questions, pq.title, pq.durationMins)
                        }
                        className="h-8 w-full rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Attempt Quiz Now</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'folders' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  placeholder="Search saved vaults..."
                  className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs"
                />
              </div>

              {filteredFolders.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[#F4F6FA] dark:bg-[#0E121B]">
                  <Layers className="w-7 h-7 text-[#64748B] mx-auto mb-2" />
                  <p className="text-xs font-semibold">No Saved Vaults</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredFolders.map((fld) => (
                    <div
                      key={fld.id}
                      className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-bold">{fld.name}</h3>
                          <button
                            type="button"
                            onClick={() =>
                              persistFolders(folders.filter((f) => f.id !== fld.id))
                            }
                            className="text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          <BookOpen className="w-3 h-3 inline mr-1" />
                          {fld.subject} • {fld.questions.length} MCQs • {fld.difficulty}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLaunchQuizSafe(fld.questions, fld.name)}
                        className="h-8 w-full rounded-lg bg-[#6366F1] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Launch Quiz</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
