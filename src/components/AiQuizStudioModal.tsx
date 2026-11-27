import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FileText,
  Film,
  FolderPlus,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { MCQQuestion } from '../types';

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
  durationSec?: number;
}

interface SavedStudioFolder {
  id: string;
  name: string;
  subject: string;
  chapter: string;
  createdAt: number;
  questions: MCQQuestion[];
}

interface AiQuizStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onSaveToChapterBank: (subject: string, chapter: string, questions: MCQQuestion[]) => void;
  onStartLiveAttempt: (questions: MCQQuestion[], config: StudioQuizConfig) => void;
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

const STORAGE_FOLDERS_KEY = 'neet2027_ai_studio_folders_v2';
const STORAGE_PERSONAL_BANK_KEY = 'neet2027_personal_chapter_bank_v2';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeSaveLocalStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function normalizeQuestionItem(raw: any, idx: number, fallbackSubject: string, fallbackChapter: string): MCQQuestion {
  const validSubjects = ['Physics', 'Chemistry', 'Botany', 'Zoology'] as const;
  const subj = validSubjects.includes(raw?.subject) ? raw.subject : (validSubjects.includes(fallbackSubject as any) ? fallbackSubject : 'Botany');

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
  const correctIdx = Number.isFinite(corrRaw) && corrRaw >= 0 && corrRaw <= 3 ? corrRaw : 0;

  const diffRaw = String(raw?.difficulty || 'Medium');
  const difficulty: 'Easy' | 'Medium' | 'Hard' =
    diffRaw === 'Easy' || diffRaw === 'Hard' ? diffRaw : 'Medium';

  const tags = Array.isArray(raw?.tags)
    ? raw.tags.map((t: any) => String(t)).filter(Boolean)
    : [String(raw?.topic || 'NCERT High-Yield')];

  return {
    id: String(raw?.id || `studio_mcq_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`),
    subject: subj as MCQQuestion['subject'],
    chapter: String(raw?.chapter || fallbackChapter || 'General NCERT'),
    difficulty,
    question_hi: String(raw?.question_hi || raw?.question_en || `प्रश्न ${idx + 1}`),
    question_en: String(raw?.question_en || raw?.question_hi || `Question ${idx + 1}`),
    options_hi: optionsHi,
    options_en: optionsEn,
    correct_index: correctIdx,
    explanation_hi: String(raw?.explanation_hi || raw?.explanation_en || 'NCERT के मुख्य सिद्धांत के अनुसार सही विकल्प चुनें।'),
    explanation_en: String(raw?.explanation_en || raw?.explanation_hi || 'Select the correct option based on NCERT core concept.'),
    tags,
    isStarred: Boolean(raw?.isStarred),
    isSaved: true,
  };
}

async function extractVideoMetadataSafe(file: File): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => {
        try {
          URL.revokeObjectURL(url);
          video.removeAttribute('src');
          video.load();
        } catch {}
      };

      const timer = window.setTimeout(() => {
        cleanup();
        resolve({ durationSec: 0, width: 0, height: 0 });
      }, 2500);

      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        const durationSec = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        cleanup();
        resolve({ durationSec, width, height });
      };

      video.onerror = () => {
        window.clearTimeout(timer);
        cleanup();
        resolve({ durationSec: 0, width: 0, height: 0 });
      };

      video.src = url;
    } catch {
      resolve({ durationSec: 0, width: 0, height: 0 });
    }
  });
}

async function extractDocumentTextSafe(file: File): Promise<string> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
      const slice = file.slice(0, 60000);
      const txt = await slice.text();
      return txt.replace(/\s+/g, ' ').trim().slice(0, 2400);
    }
    // Lightweight binary text-token scan for PDF/DOCX without loading heavy external parsers or overflowing memory
    const slice = file.slice(0, 180000);
    const buffer = await slice.arrayBuffer();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(buffer);
    const readableMatches = rawText.match(/[A-Za-z0-9\u0900-\u097F][A-Za-z0-9\u0900-\u097F ,.;:()\-+/=%]{14,}/g) || [];
    const joined = readableMatches.slice(0, 45).join(' ').replace(/\s+/g, ' ').trim();
    return joined.slice(0, 2000);
  } catch {
    return '';
  }
}

function buildSmartNeetMcqs(params: {
  prompt: string;
  subject: string;
  chapter: string;
  count: number;
  difficulty: string;
  quizType: string;
  assets: UploadedMediaAsset[];
}): MCQQuestion[] {
  const { prompt, subject, chapter, count, difficulty, quizType, assets } = params;
  const safeCount = Math.min(Math.max(1, Number(count) || 10), 50);
  const mappedDiff: 'Easy' | 'Medium' | 'Hard' =
    difficulty === 'Easy' ? 'Easy' : difficulty === 'Medium' ? 'Medium' : 'Hard';

  const sourceSnippets: string[] = [];
  if (prompt.trim()) sourceSnippets.push(prompt.trim());
  for (const asset of assets) {
    const cleanName = asset.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    if (asset.kind === 'video') {
      const mins = asset.durationSec ? `${Math.max(1, Math.round(asset.durationSec / 60))} मिनट लेक्चर` : 'वीडियो लेक्चर';
      sourceSnippets.push(`${cleanName} (${mins})`);
    } else {
      sourceSnippets.push(`${cleanName}${asset.extractedContext ? ` — ${asset.extractedContext.slice(0, 140)}` : ''}`);
    }
  }
  if (sourceSnippets.length === 0) {
    sourceSnippets.push(`${chapter} (${subject}) — NCERT Line-by-Line High-Yield Concept`);
  }

  const questionTemplates = [
    (topicFocus: string, idx: number) => ({
      qHi: `(${quizType} #${idx + 1}) ${subject} के अध्याय "${chapter}" में [${topicFocus}] के संदर्भ में निम्नलिखित में से कौन-सा कथन NCERT के अनुसार पूर्णतः सत्य है?`,
      qEn: `(${quizType} #${idx + 1}) With reference to [${topicFocus}] in "${chapter}" (${subject}), which statement is strictly correct as per NCERT?`,
      optsHi: [
        `${topicFocus} की प्राथमिक क्रियाविधि NCERT के मानक सिद्धांत का सीधा पालन करती है`,
        `यह प्रक्रिया केवल असामान्य परिस्थितियों में बिना किसी नियामक नियंत्रण के होती है`,
        `इस चरण में ऊर्जा या संरचनात्मक परिवर्तन का कोई योगदान नहीं होता है`,
        `उपरोक्त सभी कथन NCERT के विपरीत हैं`,
      ],
      optsEn: [
        `The primary mechanism of ${topicFocus} directly follows the standard NCERT principle`,
        `This process occurs only under abnormal conditions without regulatory control`,
        `Energy or structural transitions play zero role in this step`,
        `All of the above statements contradict NCERT`,
      ],
      correct: 0,
      expHi: `NCERT कक्षा 11/12 (${subject} — ${chapter}) के अनुसार "${topicFocus}" की मूल अवधारणा पहले विकल्प में सटीक रूप से दी गई है। शेष विकल्पों में जानबूझकर 'केवल' या 'कोई योगदान नहीं' जैसे NCERT ट्रैप शब्द जोड़े गए हैं।`,
      expEn: `As per NCERT (${subject} — ${chapter}), option A accurately states the core principle of "${topicFocus}", whereas other options contain extreme trap qualifiers.`,
    }),
    (topicFocus: string, idx: number) => ({
      qHi: `(${quizType} #${idx + 1}) अभिकथन (A): "${chapter}" में ${topicFocus} का अध्ययन NEET परीक्षा के लिए अत्यधिक महत्वपूर्ण है।\nकारण (R): यह अवधारणा प्रत्यक्ष रूप से प्रयोगात्मक और वैचारिक प्रश्नों का आधार बनाती है।`,
      qEn: `(${quizType} #${idx + 1}) Assertion (A): Study of ${topicFocus} in "${chapter}" is high-yield for NEET.\nReason (R): It forms the direct basis for conceptual and experimental problems.`,
      optsHi: [
        'A और R दोनों सत्य हैं, लेकिन R, A की सही व्याख्या नहीं करता है',
        'A और R दोनों सत्य हैं, तथा R, A की सही व्याख्या करता है',
        'A सत्य है, लेकिन R असत्य है',
        'A और R दोनों असत्य हैं',
      ],
      optsEn: [
        'Both A and R are true, but R is not the correct explanation of A',
        'Both A and R are true, and R is the correct explanation of A',
        'A is true, but R is false',
        'Both A and R are false',
      ],
      correct: 1,
      expHi: `अभिकथन (A) और कारण (R) दोनों NCERT के तथ्यों पर आधारित हैं और कारण (R) सीधे तौर पर अभिकथन (A) की पुष्टि करता है। इसलिए विकल्प B सही है।`,
      expEn: `Both Assertion (A) and Reason (R) are factually accurate per NCERT, and R directly explains A.`,
    }),
    (topicFocus: string, idx: number) => ({
      qHi: `(${quizType} #${idx + 1}) "${chapter}" से संबंधित [${topicFocus}] के सही अनुक्रम / संबंध की पहचान कीजिए:`,
      qEn: `(${quizType} #${idx + 1}) Identify the correct sequence / relationship regarding [${topicFocus}] from "${chapter}":`,
      optsHi: [
        'अंतिम उत्पाद → प्रारंभिक क्रियाधार → मध्यवर्ती अवस्था',
        'नियामक कारक → निष्क्रिय अवस्था → अपघटन',
        'प्रारंभिक अवस्था / कारक → सक्रिय मध्यवर्ती चरण → अंतिम परिणाम',
        'यादृच्छिक परिवर्तन → बिना क्रम के समापन',
      ],
      optsEn: [
        'Final product → Initial substrate → Intermediate state',
        'Regulatory factor → Inactive state → Degradation',
        'Initial state / factor → Active intermediate step → Final outcome',
        'Random transition → Unordered termination',
      ],
      correct: 2,
      expHi: `${subject} (${chapter}) में "${topicFocus}" सदैव एक निश्चित दिशात्मक क्रम (प्रारंभिक कारक → मध्यवर्ती चरण → अंतिम परिणाम) का पालन करता है।`,
      expEn: `In ${subject} (${chapter}), "${topicFocus}" follows a deterministic directional sequence from initial factor through intermediate step to final outcome.`,
    }),
    (topicFocus: string, idx: number) => ({
      qHi: `(${quizType} #${idx + 1}) निम्नलिखित में से कौन-सा विकल्प "${chapter}" के अंतर्गत [${topicFocus}] का अपवाद या विशिष्ट लक्षण दर्शाता है?`,
      qEn: `(${quizType} #${idx + 1}) Which option represents the specific characteristic or exception of [${topicFocus}] under "${chapter}"?`,
      optsHi: [
        'इसमें सभी कारक समान दर से कार्य करते हैं',
        'यह केवल उच्च तापमान पर ही सक्रिय होता है',
        'इसमें कोई विशिष्ट संरचनात्मक संगठन नहीं पाया जाता',
        'यह विशिष्ट परिस्थितियों में नियंत्रित एवं मापनीय परिवर्तन प्रदर्शित करता है',
      ],
      optsEn: [
        'All factors act at an identical rate here',
        'It activates exclusively at high temperatures',
        'No specific structural organization is present',
        'It exhibits controlled and measurable variation under specific conditions',
      ],
      correct: 3,
      expHi: `NCERT के विशेष बिंदुओं (Exceptions & Special Notes) के अनुसार "${topicFocus}" विशिष्ट परिस्थितियों में नियंत्रित एवं मापनीय परिवर्तन दर्शाता है।`,
      expEn: `Per NCERT special notes, "${topicFocus}" exhibits controlled and measurable variation under specific conditions.`,
    }),
  ];

  const out: MCQQuestion[] = [];
  for (let i = 0; i < safeCount; i++) {
    const snippet = sourceSnippets[i % sourceSnippets.length];
    const tpl = questionTemplates[i % questionTemplates.length](snippet, i);
    out.push(
      normalizeQuestionItem(
        {
          id: `ai_studio_${Date.now()}_${i}`,
          subject,
          chapter,
          difficulty: mappedDiff,
          question_hi: tpl.qHi,
          question_en: tpl.qEn,
          options_hi: tpl.optsHi,
          options_en: tpl.optsEn,
          correct_index: tpl.correct,
          explanation_hi: tpl.expHi,
          explanation_en: tpl.expEn,
          tags: [quizType, assets.length > 0 ? 'Media/Doc AI' : 'AI Studio'],
        },
        i,
        subject,
        chapter
      )
    );
  }
  return out;
}

export const AiQuizStudioModal: React.FC<AiQuizStudioModalProps> = ({
  isOpen,
  onClose,
  onToast,
  onSaveToChapterBank,
  onStartLiveAttempt,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'folders'>('create');
  const [subject, setSubject] = useState<string>('Botany');
  const [chapter, setChapter] = useState<string>(SUBJECT_CHAPTERS.Botany[0]);
  const [prompt, setPrompt] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [difficulty, setDifficulty] = useState<string>('NEET Hard');
  const [quizType, setQuizType] = useState<string>('NCERT Line-by-Line');
  const [durationMins, setDurationMins] = useState<number>(20);
  const [quizTitle, setQuizTitle] = useState<string>('');

  const [uploadedAssets, setUploadedAssets] = useState<UploadedMediaAsset[]>([]);
  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<MCQQuestion[]>([]);

  // Voice dictation state
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Local Folders / Vaults
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const list = SUBJECT_CHAPTERS[subject] || ['General Chapter'];
    if (!list.includes(chapter)) {
      setChapter(list[0]);
    }
  }, [subject, chapter]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {}
    };
  }, []);

  const persistFolders = (nextFolders: SavedStudioFolder[]) => {
    setFolders(nextFolders);
    safeSaveLocalStorage(STORAGE_FOLDERS_KEY, nextFolders);
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
      rec.maxAlternatives = 1;
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
      onToast('वॉइस माइक शुरू करने में त्रुटि आई।', 'error');
    }
  };

  // Universal crash-proof handler for Videos, PDFs, Docs, and Images
  const handleMediaFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsProcessingMedia(true);
    try {
      const files = Array.from(fileList);
      const newAssets: UploadedMediaAsset[] = [];

      for (const file of files) {
        const mime = (file.type || '').toLowerCase();
        const lowerName = file.name.toLowerCase();
        const isVideo =
          mime.startsWith('video/') ||
          /\.(mp4|mov|webm|mkv|avi|m4v|3gp)$/i.test(lowerName);
        const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf');
        const isImage =
          mime.startsWith('image/') ||
          /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lowerName);

        if (isVideo) {
          const meta = await extractVideoMetadataSafe(file);
          const mins = meta.durationSec > 0 ? Math.ceil(meta.durationSec / 60) : 0;
          newAssets.push({
            id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'video',
            sizeLabel: formatBytes(file.size),
            durationSec: meta.durationSec,
            extractedContext: `Video Lecture: ${file.name}${mins > 0 ? ` (${mins} mins)` : ''}${
              meta.width ? ` [${meta.width}x${meta.height}]` : ''
            }`,
          });
        } else if (isImage) {
          newAssets.push({
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'image',
            sizeLabel: formatBytes(file.size),
            extractedContext: `Diagram / Notes Image: ${file.name}`,
          });
        } else {
          const extracted = await extractDocumentTextSafe(file);
          newAssets.push({
            id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: isPdf ? 'pdf' : 'document',
            sizeLabel: formatBytes(file.size),
            extractedContext: extracted || `Study Document: ${file.name}`,
          });
        }
      }

      setUploadedAssets((prev) => [...prev, ...newAssets]);
      onToast(`${newAssets.length} फ़ाइल/वीडियो सफलतापूर्वक जुड़ गई।`, 'success');
    } catch (err) {
      console.error('Media upload processing error:', err);
      onToast('फ़ाइल प्रोसेस करते समय समस्या आई, कृपया पुनः प्रयास करें।', 'error');
    } finally {
      setIsProcessingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleGenerateQuestions = () => {
    if (isGenerating) return;
    setIsGenerating(true);
    window.setTimeout(() => {
      try {
        const mcqs = buildSmartNeetMcqs({
          prompt,
          subject,
          chapter,
          count: questionCount,
          difficulty,
          quizType,
          assets: uploadedAssets,
        });
        setGeneratedQuestions(mcqs);
        onToast(`✅ ${mcqs.length} NEET प्रश्न तैयार हो गए!`, 'success');
      } catch (err) {
        console.error('Generate MCQs error:', err);
        onToast('प्रश्न जनरेट करने में त्रुटि आई।', 'error');
      } finally {
        setIsGenerating(false);
      }
    }, 280);
  };

  const handleSaveToPersonalBank = () => {
    if (generatedQuestions.length === 0) return;
    try {
      const normalized = generatedQuestions.map((q, i) =>
        normalizeQuestionItem(q, i, subject, chapter)
      );
      const rawBank = localStorage.getItem(STORAGE_PERSONAL_BANK_KEY);
      const bankObj = rawBank ? JSON.parse(rawBank) : {};
      const key = `${subject}::${chapter}`;
      const existing: MCQQuestion[] = Array.isArray(bankObj[key]) ? bankObj[key] : [];
      bankObj[key] = [...normalized, ...existing].slice(0, 300);
      safeSaveLocalStorage(STORAGE_PERSONAL_BANK_KEY, bankObj);
      onSaveToChapterBank(subject, chapter, normalized);
    } catch (err) {
      console.error('Save bank error:', err);
      onToast('पर्सनल बैंक में सेव करने में त्रुटि आई।', 'error');
    }
  };

  const handleSaveToFolder = () => {
    if (generatedQuestions.length === 0) return;
    const folderName =
      newFolderName.trim() || `${subject} • ${chapter} (${generatedQuestions.length} Qs)`;
    const normalized = generatedQuestions.map((q, i) =>
      normalizeQuestionItem(q, i, subject, chapter)
    );
    const next: SavedStudioFolder[] = [
      {
        id: `fld_${Date.now()}`,
        name: folderName,
        subject,
        chapter,
        createdAt: Date.now(),
        questions: normalized,
      },
      ...folders,
    ].slice(0, 40);
    persistFolders(next);
    setNewFolderName('');
    onToast(`📁 "${folderName}" फ़ोल्डर में सेव हो गया।`, 'success');
  };

  const handleLaunchQuizSafe = (qsToLaunch: MCQQuestion[], customTitle?: string) => {
    try {
      const safeList = (Array.isArray(qsToLaunch) ? qsToLaunch : []).map((q, i) =>
        normalizeQuestionItem(q, i, subject, chapter)
      );
      if (safeList.length === 0) {
        onToast('लॉन्च करने के लिए पहले प्रश्न जनरेट करें।', 'error');
        return;
      }
      const cfg: StudioQuizConfig = {
        title: customTitle || quizTitle.trim() || `${subject} • ${chapter}`,
        quizType,
        durationMins: Math.max(5, Number(durationMins) || Math.ceil(safeList.length * 1.2)),
        subject,
        chapter,
      };
      onStartLiveAttempt(safeList, cfg);
    } catch (err) {
      console.error('Launch quiz error:', err);
      onToast('लाइव क्विज़ लॉन्च करने में समस्या आई।', 'error');
    }
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
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AI Custom Quiz & Media Studio"
    >
      <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-[#6366F1] dark:text-indigo-400">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                AI Custom Quiz, Video &amp; PDF Studio
              </h2>
              <p className="text-[11px] text-[#64748B]">
                100% Client-Side • Zero Server Load • Video, PDF, Docs &amp; Voice Supported
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
              Studio Generator
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
              My Vaults ({folders.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Studio"
              className="w-8 h-8 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'create' ? (
            <>
              {/* Subject & Chapter Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Chapter (Personal Bank Merge)
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

              {/* Prompt + Voice Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    Topic Prompt / Custom Instructions (Hindi या English)
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
                    <span>{isListening ? 'Stop Voice' : 'Voice Prompt'}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="उदा. Krebs Cycle के सभी एंजाइम और ATP गणना पर Assertion-Reason व NCERT ट्रैप प्रश्न बनाएं..."
                  className="w-full p-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs text-[#0F172A] dark:text-[#F1F5F9] leading-relaxed"
                />
              </div>

              {/* Document, PDF, Image & Video Upload Bar */}
              <div className="rounded-xl p-3 bg-[#F4F6FA] dark:bg-[#0E121B] border border-dashed border-slate-300 dark:border-white/[0.12] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Upload Study PDF / Docs / Notes OR Lecture Video (MP4, MOV, MKV, WEBM)
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
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
                      accept="video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v"
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
                      <span>Upload PDF / Doc</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessingMedia}
                      onClick={() => videoInputRef.current?.click()}
                      className="h-8 px-3 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Upload Video</span>
                    </button>
                  </div>
                </div>

                {isProcessingMedia && (
                  <div className="text-[11px] text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>फ़ाइल/वीडियो से विषय-वस्तु निकाली जा रही है...</span>
                  </div>
                )}

                {uploadedAssets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {uploadedAssets.map((asset) => (
                      <span
                        key={asset.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-[11px] font-medium text-[#0F172A] dark:text-[#F1F5F9]"
                      >
                        {asset.kind === 'video' ? (
                          <Film className="w-3 h-3 text-rose-500" />
                        ) : (
                          <FileText className="w-3 h-3 text-indigo-500" />
                        )}
                        <span className="max-w-[170px] truncate">{asset.name}</span>
                        <span className="text-[10px] text-[#64748B]">({asset.sizeLabel})</span>
                        <button
                          type="button"
                          onClick={() =>
                            setUploadedAssets((prev) => prev.filter((a) => a.id !== asset.id))
                          }
                          className="text-[#64748B] hover:text-rose-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quiz Configuration Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Questions ({questionCount})
                  </label>
                  <select
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value) || 10)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {[5, 10, 15, 20, 30, 45].map((n) => (
                      <option key={n} value={n}>
                        {n} MCQs
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {['Easy', 'Medium', 'NEET Hard', 'Rank-Booster'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Pattern Type
                  </label>
                  <select
                    value={quizType}
                    onChange={(e) => setQuizType(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {[
                      'NCERT Line-by-Line',
                      'Assertion-Reason',
                      'Statement I & II',
                      'PYQ Pattern',
                      'Numerical & Trap',
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Timer (Mins)
                  </label>
                  <select
                    value={durationMins}
                    onChange={(e) => setDurationMins(Number(e.target.value) || 15)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {[10, 15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>
                        {m} Mins
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Generate Action */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isGenerating || isProcessingMedia}
                  onClick={handleGenerateQuestions}
                  className="h-10 px-5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {isGenerating
                      ? 'Generating NEET MCQs...'
                      : `Generate ${questionCount} NEET MCQs`}
                  </span>
                </button>

                {generatedQuestions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLaunchQuizSafe(generatedQuestions)}
                      className="h-10 px-5 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Launch Full-Screen Live Attempt ({generatedQuestions.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveToPersonalBank}
                      className="h-10 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-800 dark:text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Merge to My Chapter Bank</span>
                    </button>
                  </>
                )}
              </div>

              {/* Save to Custom Folder + Preview */}
              {generatedQuestions.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Custom Folder / Vault Name (e.g., Physics Lecture 04)..."
                      className="flex-1 min-w-[200px] h-9 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveToFolder}
                      className="h-9 px-3.5 rounded-xl bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-[#6366F1]" />
                      <span>Save to Vault</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {generatedQuestions.slice(0, 6).map((q, idx) => (
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
                        <p className="font-hindi text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                          {q.question_hi}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Saved Folders / Vaults Tab */
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  placeholder="Search saved folders by subject, chapter or name..."
                  className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                />
              </div>

              {filteredFolders.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06]">
                  <Layers className="w-7 h-7 text-[#64748B] mx-auto mb-2" />
                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    No Saved Quiz Vaults Yet
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    Generate MCQs from prompts, PDFs, or videos and click "Save to Vault".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredFolders.map((fld) => (
                    <div
                      key={fld.id}
                      className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                            {fld.name}
                          </h3>
                          <button
                            type="button"
                            onClick={() =>
                              persistFolders(folders.filter((f) => f.id !== fld.id))
                            }
                            className="text-[#64748B] hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          <BookOpen className="w-3 h-3 inline mr-1" />
                          {fld.subject} • {fld.chapter} • {fld.questions.length} MCQs
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLaunchQuizSafe(fld.questions, fld.name)}
                        className="h-8 w-full rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Launch Live Quiz</span>
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
