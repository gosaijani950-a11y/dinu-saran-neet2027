import React, { useEffect, useRef, useState } from 'react';

export interface VaultMediaItem {
  id: string;
  name: string;
  category: 'pdf' | 'video' | 'photo' | 'voice' | 'note';
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
  blob?: Blob;
  textContent?: string;
}

const VAULT_DB_NAME = 'neet2027_personal_local_vault_db';
const VAULT_STORE_NAME = 'vault_items';

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VAULT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
        db.createObjectStore(VAULT_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllVaultItems(): Promise<VaultMediaItem[]> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
      const req = tx.objectStore(VAULT_STORE_NAME).getAll();
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? req.result : [];
        resolve(list.sort((a, b) => b.createdAt - a.createdAt));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function saveVaultItem(item: VaultMediaItem): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
    tx.objectStore(VAULT_STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteVaultItem(id: string): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
    tx.objectStore(VAULT_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Text Note';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PersonalMediaVaultModal: React.FC<{
  open: boolean;
  onClose: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ open, onClose, showToast }) => {
  const [items, setItems] = useState<VaultMediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'pdf' | 'video' | 'photo' | 'voice' | 'note'>('all');
  const [previewItem, setPreviewItem] = useState<VaultMediaItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  // Live Voice Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const loadItems = async () => {
    const all = await getAllVaultItems();
    setItems(all);
  };

  useEffect(() => {
    if (open) {
      void loadItems();
    } else {
      setPreviewItem(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
  }, [open]);

  useEffect(() => {
    if (!previewItem?.blob) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(previewItem.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewItem]);

  if (!open) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      const mime = file.type.toLowerCase();
      let category: VaultMediaItem['category'] = 'pdf';
      if (mime.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
        category = 'pdf';
      } else if (mime.startsWith('video/')) {
        category = 'video';
      } else if (mime.startsWith('image/')) {
        category = 'photo';
      } else if (mime.startsWith('audio/')) {
        category = 'voice';
      }

      const item: VaultMediaItem = {
        id: `vault_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        category,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        createdAt: Date.now(),
        blob: file,
      };
      await saveVaultItem(item);
    }

    e.target.value = '';
    await loadItems();
    showToast?.(`${files.length} फ़ाइलें आपके Private Local Vault में सेव हो गईं!`, 'success');
  };

  const handleSaveQuickNote = async () => {
    if (!noteTitle.trim() && !noteBody.trim()) return;
    await saveVaultItem({
      id: `vault_note_${Date.now()}`,
      name: noteTitle.trim() || `Personal Study Note (${new Date().toLocaleDateString()})`,
      category: 'note',
      mimeType: 'text/plain',
      sizeBytes: noteBody.length,
      createdAt: Date.now(),
      textContent: noteBody,
    });
    setNoteTitle('');
    setNoteBody('');
    setShowNoteEditor(false);
    await loadItems();
    showToast?.('Personal Note लोकल वॉल्ट में सुरक्षित सेव हो गया!', 'success');
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await saveVaultItem({
          id: `vault_voice_${Date.now()}`,
          name: `Voice Memo (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
          category: 'voice',
          mimeType: 'audio/webm',
          sizeBytes: blob.size,
          createdAt: Date.now(),
          blob,
        });
        await loadItems();
        showToast?.('Voice Note आपके लोकल वॉल्ट में सेव हो गई!', 'success');
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSecs((s) => s + 1);
      }, 1000);
    } catch {
      showToast?.('माइक परमिशन नहीं मिली—कृपया ब्राउज़र में Mic Allow करें।', 'error');
    }
  };

  const stopVoiceRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleDelete = async (id: string) => {
    await deleteVaultItem(id);
    if (previewItem?.id === id) setPreviewItem(null);
    await loadItems();
    showToast?.('फ़ाइल लोकल वॉल्ट से हटा दी गई।', 'info');
  };

  const filteredItems =
    activeTab === 'all' ? items : items.filter((it) => it.category === activeTab);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-purple-500/40 bg-slate-950 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-purple-950/60 to-slate-900 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-purple-200">
              🔐 Personal Local Media Vault (100% Private)
            </h2>
            <p className="text-[11px] text-slate-400">
              PDFs, Videos, Photos, Voice Memos & Personal Notes — केवल आपके डिवाइस के Local Storage में सेव
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            ✕ Close
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 bg-slate-900/70 px-4 py-3">
          <label className="cursor-pointer rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-black text-white shadow hover:bg-purple-500">
            + Upload PDF / Video / Photo / Audio
            <input
              type="file"
              multiple
              accept=".pdf,video/*,image/*,audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {!isRecording ? (
            <button
              type="button"
              onClick={startVoiceRecording}
              className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs font-extrabold text-rose-200 hover:bg-rose-500/25"
            >
              🎙️ Record Voice Note
            </button>
          ) : (
            <button
              type="button"
              onClick={stopVoiceRecording}
              className="animate-pulse rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-black text-white"
            >
              ⏹️ Stop & Save ({recordSecs}s)
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNoteEditor((v) => !v)}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-extrabold text-emerald-200 hover:bg-emerald-500/25"
          >
            📝 New Secret Note
          </button>
        </div>

        {/* Quick Note Editor */}
        {showNoteEditor && (
          <div className="border-b border-slate-800 bg-slate-900/90 p-4 space-y-2">
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note Title (e.g. Organic Named Reactions Formula)..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <textarea
              rows={3}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="अपना पर्सनल नोट या रिवीज़न पॉइंट लिखें..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNoteEditor(false)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuickNote}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white"
              >
                Save to Local Vault
              </button>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-800 px-4 py-2.5 text-xs">
          {(
            [
              ['all', `All (${items.length})`],
              ['pdf', '📄 PDFs'],
              ['video', '🎬 Videos'],
              ['photo', '🖼️ Photos'],
              ['voice', '🎙️ Voices'],
              ['note', '📝 Notes'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-xl px-3 py-1.5 font-bold whitespace-nowrap transition ${
                activeTab === key
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {previewItem && (
            <div className="rounded-2xl border border-purple-500/40 bg-slate-900 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-purple-200 truncate">
                  Viewing: {previewItem.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300"
                >
                  Close Preview
                </button>
              </div>
              {previewItem.category === 'note' && (
                <pre className="whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                  {previewItem.textContent}
                </pre>
              )}
              {previewItem.category === 'photo' && previewUrl && (
                <img
                  src={previewUrl}
                  alt={previewItem.name}
                  className="max-h-80 w-auto mx-auto rounded-xl object-contain"
                />
              )}
              {previewItem.category === 'video' && previewUrl && (
                <video
                  src={previewUrl}
                  controls
                  className="max-h-80 w-full rounded-xl bg-black"
                />
              )}
              {previewItem.category === 'voice' && previewUrl && (
                <audio src={previewUrl} controls className="w-full" />
              )}
              {previewItem.category === 'pdf' && previewUrl && (
                <iframe
                  src={previewUrl}
                  title={previewItem.name}
                  className="h-96 w-full rounded-xl bg-white"
                />
              )}
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 py-12 text-center text-xs text-slate-400">
              अभी इस सेक्शन में कोई पर्सनल फ़ाइल नहीं है। ऊपर <b>Upload</b> या <b>Record Voice Note</b> दबाकर सेव करें।
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-3"
                >
                  <div className="min-w-0 pr-2">
                    <div className="truncate text-xs font-bold text-slate-100">
                      {item.category === 'pdf'
                        ? '📄 '
                        : item.category === 'video'
                        ? '🎬 '
                        : item.category === 'photo'
                        ? '🖼️ '
                        : item.category === 'voice'
                        ? '🎙️ '
                        : '📝 '}
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {formatBytes(item.sizeBytes)} • {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="rounded-lg bg-purple-600/25 px-2.5 py-1 text-[11px] font-bold text-purple-200 hover:bg-purple-600/40"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="rounded-lg bg-rose-600/20 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-600/35"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Fullscreen Interactive DND Deep Focus Mode Overlay (25m / 45m / 60m / Custom Minutes + Live Countdown)
 */
export const DndFocusFullscreenOverlay: React.FC<{
  open: boolean;
  initialMinutes?: number;
  onClose: () => void;
}> = ({ open, initialMinutes = 25, onClose }) => {
  const [selectedMins, setSelectedMins] = useState<number>(initialMinutes);
  const [customMinsInput, setCustomMinsInput] = useState<string>(String(initialMinutes));
  const [secondsLeft, setSecondsLeft] = useState<number>(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [focusGoal, setFocusGoal] = useState<string>('NCERT Line-by-Line + 50 PYQ Target');

  useEffect(() => {
    if (!open) return;
    setSelectedMins(initialMinutes);
    setCustomMinsInput(String(initialMinutes));
    setSecondsLeft(initialMinutes * 60);
    setIsRunning(true);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  }, [open, initialMinutes]);

  useEffect(() => {
    if (!open || !isRunning) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, isRunning]);

  if (!open) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const totalSecs = Math.max(1, selectedMins * 60);
  const progressPct = Math.min(100, Math.max(0, ((totalSecs - secondsLeft) / totalSecs) * 100));

  const applyMinutes = (m: number) => {
    const clamped = Math.max(1, Math.min(240, m));
    setSelectedMins(clamped);
    setCustomMinsInput(String(clamped));
    setSecondsLeft(clamped * 60);
    setIsRunning(true);
  };

  const handleExitDnd = () => {
    if (secondsLeft > 0 && isRunning) {
      const ok = window.confirm('क्या आप वाकई DND Deep Focus सत्र बीच में समाप्त करना चाहते हैं?');
      if (!ok) return;
    }
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
    } catch {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-between bg-slate-950 px-5 py-8 text-white">
      {/* Top Bar */}
      <div className="flex w-full max-w-2xl items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3.5 py-1.5 text-xs font-black text-amber-300">
          🔕 DND DEEP FOCUS LOCK ACTIVE
        </div>
        <button
          type="button"
          onClick={handleExitDnd}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
        >
          Exit DND
        </button>
      </div>

      {/* Center Live Countdown Clock */}
      <div className="flex flex-col items-center text-center max-w-lg w-full">
        <input
          type="text"
          value={focusGoal}
          onChange={(e) => setFocusGoal(e.target.value)}
          className="mb-5 w-full rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-2 text-center text-xs font-bold text-amber-200 focus:border-amber-500 focus:outline-none"
          placeholder="अपना Focus Target लिखें..."
        />

        <div className="relative flex h-60 w-60 flex-col items-center justify-center rounded-full border-4 border-amber-500/40 bg-slate-900/80 shadow-[0_0_60px_rgba(245,158,11,0.2)]">
          <span className="text-5xl font-black tracking-wider text-amber-300 tabular-nums">
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
          <span className="mt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            {secondsLeft === 0 ? '🎉 Session Complete!' : isRunning ? 'Stay Focused • No Distractions' : 'Paused'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Preset & Custom Duration Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {[15, 25, 45, 60, 90].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyMinutes(preset)}
              className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                selectedMins === preset
                  ? 'bg-amber-500 text-slate-950'
                  : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              {preset}m
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={240}
              value={customMinsInput}
              onChange={(e) => setCustomMinsInput(e.target.value)}
              className="w-16 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-center text-xs font-bold text-white"
            />
            <button
              type="button"
              onClick={() => applyMinutes(Number(customMinsInput) || 25)}
              className="rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/30"
            >
              Set Custom
            </button>
          </div>
        </div>

        {/* Play / Pause / Reset */}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsRunning((r) => !r)}
            className="rounded-2xl bg-amber-500 px-6 py-2.5 text-xs font-black text-slate-950 shadow-lg hover:bg-amber-400"
          >
            {isRunning ? '⏸️ Pause Timer' : '▶️ Resume Focus'}
          </button>
          <button
            type="button"
            onClick={() => applyMinutes(selectedMins)}
            className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        NEET-UG 2027 Deep Focus Mode • हर एक मिनट आपकी AIR रैंक तय करता है
      </p>
    </div>
  );
};
