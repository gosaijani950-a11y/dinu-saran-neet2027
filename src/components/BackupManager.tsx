import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  Download,
  HardDrive,
  Trash2,
  Upload,
} from 'lucide-react';
import type { BackupPayload, UserRole } from '../types';
import {
  clearDatabaseSection,
  exportDatabasePayload,
  importDatabasePayload,
  type DatabaseStats,
} from '../db/database';
import { useSubjects } from '../utils/subjects';
import { SegmentedControl } from './SegmentedControl';

export type ClearTarget =
  | 'questions'
  | 'notes'
  | 'shortNotes'
  | 'pyqs'
  | 'specials'
  | 'modules'
  | 'mistakes'
  | 'quizHistory'
  | 'ALL';

interface BackupManagerProps {
  role: UserRole;
  creatorName: string;
  stats: DatabaseStats;
  customSubjects: string[];
  onRefreshData: () => Promise<void>;
  onClearCloud?: (target: ClearTarget) => Promise<void>;
  onBackHome: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const BackupManager: React.FC<BackupManagerProps> = ({
  role,
  creatorName,
  stats,
  customSubjects,
  onRefreshData,
  onClearCloud,
  onBackHome,
  onToast,
}) => {
  const isAdmin = role === 'admin';
  const [exportSubject, setExportSubject] = useState('Physics');
  const [includeModuleBundles, setIncludeModuleBundles] = useState(true);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [confirmClear, setConfirmClear] = useState<{ target: ClearTarget; label: string } | null>(
    null
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  const downloadJson = (payload: BackupPayload, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFullExport = async () => {
    const payload = await exportDatabasePayload(creatorName, 'ALL', { includeModuleBundles });
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadJson(payload, `dinu-saran-neet2027-full-backup-${dateTag}.json`);
    onToast('Full IndexedDB JSON backup downloaded.', 'success');
  };

  const handleSubjectExport = async () => {
    const payload = await exportDatabasePayload(creatorName, exportSubject, {
      includeModuleBundles,
    });
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadJson(
      payload,
      `dinu-saran-neet2027-${exportSubject.toLowerCase().replace(/\s+/g, '-')}-${dateTag}.json`
    );
    onToast(`${exportSubject} subject pack exported as JSON.`, 'success');
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      const { importedCounts } = await importDatabasePayload(parsed, importMode);
      await onRefreshData();
      const scanSuffix =
        importedCounts.moduleBundles > 0
          ? `, ${importedCounts.moduleBundles} Module Scans`
          : '';
      onToast(
        `Restore complete (${importMode}): ${importedCounts.questions} MCQs, ${importedCounts.notes} Notes, ${importedCounts.pyqs} PYQs${scanSuffix}.`,
        'success'
      );
    } catch (err) {
      onToast(
        `Restore failed: ${err instanceof Error ? err.message : 'Invalid JSON file.'}`,
        'error'
      );
    }
  };

  const handleConfirmedClear = async () => {
    if (!confirmClear) return;
    if (!isAdmin && confirmClear.target !== 'mistakes' && confirmClear.target !== 'quizHistory') {
      setConfirmClear(null);
      return;
    }
    await clearDatabaseSection(confirmClear.target);
    if (isAdmin && onClearCloud) {
      await onClearCloud(confirmClear.target);
    }
    await onRefreshData();
    onToast(`Cleared ${confirmClear.label}.`, 'info');
    setConfirmClear(null);
  };

  const statItems = [
    { label: 'MCQs', value: stats.totalQuestions },
    { label: 'Notes', value: stats.notesCount },
    { label: 'Short Notes', value: stats.shortNotesCount },
    { label: 'PYQs', value: stats.pyqsCount },
    { label: 'Special', value: stats.specialsCount },
    { label: 'Mistakes', value: stats.mistakesCount },
    { label: 'Saved', value: stats.savedQuestionsCount },
    { label: 'Storage', value: `${stats.approxMb} MB` },
  ];

  const { subjects: subjectList } = useSubjects(customSubjects);

  const clearButtons: Array<[ClearTarget, string]> = isAdmin
    ? [
        ['questions', 'MCQs'],
        ['notes', 'Notes'],
        ['shortNotes', 'Short Notes'],
        ['pyqs', 'PYQs'],
        ['specials', 'Special'],
        ['modules', 'Modules'],
        ['mistakes', 'Mistakes'],
        ['quizHistory', 'History'],
      ]
    : [
        ['mistakes', 'My Mistakes'],
        ['quizHistory', 'My Quiz History'],
      ];

  return (
    <div className="space-y-4 pb-10">
      {/* Slim Header */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBackHome}
          aria-label="Back to Home Hub"
          className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            Study Data &amp; Backup
          </h1>
          <p className="text-[11px] text-[#64748B]">
            100% local IndexedDB · Export JSON backups or restore personal progress
          </p>
        </div>
      </div>

      {/* Unified Storage & Export/Import Card */}
      <section className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200 dark:border-white/[0.06] shadow-xs divide-y divide-slate-200/80 dark:divide-white/[0.06] overflow-hidden">
        {/* Live Storage Grid */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            <HardDrive className="w-3.5 h-3.5 text-[#6366F1]" />
            <span>IndexedDB Storage</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {statItems.map((it) => (
              <div
                key={it.label}
                className="rounded-xl px-3 py-2 bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200/70 dark:border-white/[0.05] flex items-center justify-between gap-2"
              >
                <span className="text-[11px] text-[#64748B]">{it.label}</span>
                <span className="text-xs font-bold font-mono-num text-[#0F172A] dark:text-[#F1F5F9]">
                  {it.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Export & Restore Side-by-Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80 dark:divide-white/[0.06]">
          {/* Export */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              <Download className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Export Backups (.json)</span>
            </div>

            <button
              type="button"
              onClick={() => void handleFullExport()}
              className="w-full h-9 px-3.5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              Download Full Backup (.json)
            </button>

            <label className="flex items-center gap-2 text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeModuleBundles}
                onChange={(e) => setIncludeModuleBundles(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-[#6366F1]"
              />
              <span>Include uploaded PDF/Photo scans in backup</span>
            </label>

            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="subject-export-select"
                className="block text-[11px] font-medium text-[#64748B]"
              >
                Subject-Wise Pack Export
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="subject-export-select"
                  value={exportSubject}
                  onChange={(e) => setExportSubject(e.target.value)}
                  className="flex-1 h-8 px-2.5 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9]"
                >
                  {subjectList.map((s) => (
                    <option key={s} value={s} className="bg-white dark:bg-[#141923]">
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleSubjectExport()}
                  className="h-8 px-3 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Export Pack
                </button>
              </div>
            </div>
          </div>

          {/* Restore */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
              <Upload className="w-3.5 h-3.5 text-[#6366F1]" />
              <span>Restore Import (.json)</span>
            </div>

            <SegmentedControl<'merge' | 'overwrite'>
              ariaLabel="Import restore mode"
              layoutId="backup-import-mode"
              size="xs"
              fullWidth
              value={importMode}
              onChange={setImportMode}
              options={[
                { value: 'merge', label: 'Merge with Existing' },
                { value: 'overwrite', label: 'Overwrite All' },
              ]}
            />

            <p className="text-[11px] text-[#64748B] leading-relaxed">
              {importMode === 'merge'
                ? 'Keeps existing records and merges items from the backup file.'
                : 'Replaces your local browser IndexedDB with the backup file.'}
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-9 px-3.5 rounded-xl bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Choose Backup JSON File
            </button>
          </div>
        </div>

        {/* Danger Zone — Full Control for Admin, Personal-Only Reset for Student */}
        <div className="p-4 space-y-2.5 bg-rose-500/[0.03]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F43F5E]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              {isAdmin
                ? 'Danger Zone — Clear Local & Cloud Data'
                : 'Personal Practice Reset (This Browser Only)'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {clearButtons.map(([target, label]) => (
              <button
                key={target}
                type="button"
                onClick={() => setConfirmClear({ target, label })}
                className="h-7 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/18 text-rose-700 dark:text-rose-300 border border-rose-500/25 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                {label}
              </button>
            ))}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmClear({ target: 'ALL', label: 'ENTIRE Study Database' })}
                className="h-7 px-3 rounded-lg bg-[#F43F5E] hover:bg-rose-600 text-white text-[11px] font-semibold inline-flex items-center gap-1 ml-auto cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Factory Reset
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmClear && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Data Clear"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmClear(null)}
              className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              className="relative z-10 w-full max-w-sm rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-slate-200 dark:border-white/[0.08] p-5 shadow-2xl space-y-3.5"
            >
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                Confirm Deletion
              </h2>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Permanently clear{' '}
                <strong className="text-[#F43F5E]">{confirmClear.label}</strong>? This cannot be undone without a JSON backup.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClear(null)}
                  className="h-8 px-3 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmedClear()}
                  className="h-8 px-3.5 rounded-lg bg-[#F43F5E] hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
