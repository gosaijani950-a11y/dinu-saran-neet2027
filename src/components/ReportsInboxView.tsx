import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Eye,
  Flag,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AppSettings,
  DifficultyLevel,
  MCQQuestion,
  PYQItem,
  QuestionReport,
  ReportReason,
  ReportStatus,
  UnifiedQuestionItem,
} from '../types';
import {
  ALLOWED_REPORT_REASONS,
  validateQuestionPatchInput,
} from '../utils/supabaseMappers';
import {
  deleteCloudPyq,
  deleteCloudQuestion,
  deleteCloudQuestionReport,
  isSupabaseConfigured,
  updateCloudQuestionReport,
  upsertCloudPyqs,
  upsertCloudQuestions,
} from '../services/supabaseService';
import { db } from '../db/database';
import { MathText } from './MathText';

interface ReportsInboxViewProps {
  settings: AppSettings;
  reports: QuestionReport[];
  unifiedQuestionsMap: Record<string, UnifiedQuestionItem>;
  onRefreshReports: () => Promise<void>;
  onRefreshAllData: () => Promise<void>;
  onBackHome: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;
const DIFFICULTIES: Array<Exclude<DifficultyLevel, 'Mixed'>> = [
  'Easy',
  'Medium',
  'Hard',
  'Advanced',
];

const INPUT_CLASS =
  'w-full px-2.5 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60';

export const ReportsInboxView: React.FC<ReportsInboxViewProps> = ({
  settings,
  reports,
  unifiedQuestionsMap,
  onRefreshReports,
  onRefreshAllData,
  onBackHome,
  onToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [reasonFilter, setReasonFilter] = useState<'All' | ReportReason>('All');
  const [refreshing, setRefreshing] = useState(false);

  // One-click patcher state
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [patchStem, setPatchStem] = useState('');
  const [patchOptions, setPatchOptions] = useState<[string, string, string, string]>([
    '',
    '',
    '',
    '',
  ]);
  const [patchCorrectIndex, setPatchCorrectIndex] = useState<0 | 1 | 2 | 3>(0);
  const [patchExplanation, setPatchExplanation] = useState('');
  const [patchDifficulty, setPatchDifficulty] =
    useState<Exclude<DifficultyLevel, 'Mixed'>>('Medium');
  const [patchAdminNote, setPatchAdminNote] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [savingPatch, setSavingPatch] = useState(false);

  // Two-step confirmation for deleting an invalid underlying question
  const [confirmDeleteQuestionReportId, setConfirmDeleteQuestionReportId] = useState<
    string | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    let open = 0;
    let resolved = 0;
    let dismissed = 0;
    for (const r of reports) {
      if (r.status === 'open') open++;
      else if (r.status === 'resolved') resolved++;
      else if (r.status === 'dismissed') dismissed++;
    }
    return { open, resolved, dismissed, total: reports.length };
  }, [reports]);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>(['Physics', 'Chemistry', 'Botany', 'Zoology']);
    for (const r of reports) {
      if (r.subject) set.add(r.subject);
    }
    return ['All', ...Array.from(set)];
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (subjectFilter !== 'All' && r.subject !== subjectFilter) return false;
      if (reasonFilter !== 'All' && r.reason !== reasonFilter) return false;
      return true;
    });
  }, [reports, statusFilter, subjectFilter, reasonFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshReports();
      onToast('Reported Questions queue refreshed.', 'info');
    } finally {
      setRefreshing(false);
    }
  };

  const openPatchEditor = (report: QuestionReport) => {
    if (editingReportId === report.id) {
      setEditingReportId(null);
      return;
    }
    const target = unifiedQuestionsMap[report.questionId];
    if (!target) {
      onToast('Question is no longer in the local bank (may already be deleted).', 'info');
      return;
    }
    setEditingReportId(report.id);
    setPatchStem(target.question_hi);
    setPatchOptions([
      target.options_hi[0] ?? '',
      target.options_hi[1] ?? '',
      target.options_hi[2] ?? '',
      target.options_hi[3] ?? '',
    ]);
    setPatchCorrectIndex(target.correct_index);
    setPatchExplanation(target.explanation_hi);
    setPatchDifficulty(
      target.difficulty === 'Easy' ||
        target.difficulty === 'Medium' ||
        target.difficulty === 'Hard' ||
        target.difficulty === 'Advanced'
        ? target.difficulty
        : 'Medium'
    );
    setPatchAdminNote(report.adminNote ?? '');
    setShowPreview(false);
    setConfirmDeleteQuestionReportId(null);
  };

  const handleSavePatchAndResolve = async (report: QuestionReport) => {
    const validated = validateQuestionPatchInput({
      question_hi: patchStem,
      options_hi: patchOptions,
      correct_index: patchCorrectIndex,
      explanation_hi: patchExplanation,
      difficulty: patchDifficulty,
    });
    if (!validated.ok) {
      onToast(validated.error, 'error');
      return;
    }

    setSavingPatch(true);
    try {
      const target = unifiedQuestionsMap[report.questionId];
      const usePyqs =
        report.sourceTable === 'pyqs' || target?.sourceTable === 'pyqs';

      if (usePyqs) {
        const existingPyq = await db.pyqs.get(report.questionId);
        if (!existingPyq) {
          throw new Error('PYQ record not found locally.');
        }
        const updatedPyq: PYQItem = {
          ...existingPyq,
          question_hi: validated.question_hi,
          options_hi: validated.options_hi,
          correct_index: validated.correct_index,
          explanation_hi: validated.explanation_hi,
        };
        if (isSupabaseConfigured(settings)) {
          await upsertCloudPyqs(settings, [updatedPyq]);
        }
        await db.pyqs.put(updatedPyq);
      } else {
        const existingQ = await db.questions.get(report.questionId);
        if (!existingQ) {
          throw new Error('Question record not found locally.');
        }
        const updatedQ: MCQQuestion = {
          ...existingQ,
          question_hi: validated.question_hi,
          options_hi: validated.options_hi,
          correct_index: validated.correct_index,
          explanation_hi: validated.explanation_hi,
          difficulty: validated.difficulty,
        };
        if (isSupabaseConfigured(settings)) {
          await upsertCloudQuestions(settings, [updatedQ]);
        }
        await db.questions.put(updatedQ);
      }

      const resolvedAt = Date.now();
      const cleanNote = patchAdminNote.trim() || 'Patched question and verified KaTeX/answer.';

      if (isSupabaseConfigured(settings)) {
        await updateCloudQuestionReport(settings, report.id, {
          status: 'resolved',
          adminNote: cleanNote,
          resolvedAt,
        });
      }
      await db.questionReports.update(report.id, {
        status: 'resolved',
        adminNote: cleanNote,
        resolvedAt,
        questionSnapshot: validated.question_hi.slice(0, 600),
      });

      setEditingReportId(null);
      await Promise.all([onRefreshAllData(), onRefreshReports()]);
      onToast('Question patched & report marked Resolved!', 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Failed to save question patch.',
        'error'
      );
    } finally {
      setSavingPatch(false);
    }
  };

  const handleUpdateReportStatus = async (
    report: QuestionReport,
    nextStatus: ReportStatus
  ) => {
    setBusyId(report.id);
    try {
      const resolvedAt = nextStatus === 'open' ? null : Date.now();
      if (isSupabaseConfigured(settings)) {
        await updateCloudQuestionReport(settings, report.id, {
          status: nextStatus,
          adminNote: report.adminNote,
          resolvedAt,
        });
      }
      await db.questionReports.update(report.id, {
        status: nextStatus,
        resolvedAt: resolvedAt ?? undefined,
      });
      await onRefreshReports();
      onToast(
        nextStatus === 'dismissed'
          ? 'Report dismissed.'
          : nextStatus === 'resolved'
          ? 'Report marked Resolved.'
          : 'Report reopened.',
        'info'
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Failed to update report status.',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUnderlyingQuestion = async (report: QuestionReport) => {
    setBusyId(report.id);
    try {
      const target = unifiedQuestionsMap[report.questionId];
      const usePyqs =
        report.sourceTable === 'pyqs' || target?.sourceTable === 'pyqs';

      if (usePyqs) {
        if (isSupabaseConfigured(settings)) {
          await deleteCloudPyq(settings, report.questionId);
        }
        await db.pyqs.delete(report.questionId);
      } else {
        if (isSupabaseConfigured(settings)) {
          await deleteCloudQuestion(settings, report.questionId);
        }
        await db.questions.delete(report.questionId);
      }

      const resolvedAt = Date.now();
      const adminNote = 'Invalid question deleted from bank by Admin.';
      if (isSupabaseConfigured(settings)) {
        await updateCloudQuestionReport(settings, report.id, {
          status: 'resolved',
          adminNote,
          resolvedAt,
        });
      }
      await db.questionReports.update(report.id, {
        status: 'resolved',
        adminNote,
        resolvedAt,
      });

      setConfirmDeleteQuestionReportId(null);
      setEditingReportId(null);
      await Promise.all([onRefreshAllData(), onRefreshReports()]);
      onToast('Invalid question deleted & report resolved.', 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Failed to delete question.',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteReportRecord = async (reportId: string) => {
    setBusyId(reportId);
    try {
      if (isSupabaseConfigured(settings)) {
        await deleteCloudQuestionReport(settings, reportId);
      }
      await db.questionReports.delete(reportId);
      await onRefreshReports();
      onToast('Report record removed.', 'info');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Failed to remove report.',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3.5 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to Home Hub"
            className="w-8 h-8 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">
              Reported Questions Queue{' '}
              <span className="font-mono-num text-[#F43F5E]">({counts.open} open)</span>
            </h1>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Admin patcher · Edit &amp; fix reported MCQs/PYQs directly to live bank
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.05]">
          {(
            [
              ['all', `All (${counts.total})`],
              ['open', `Open (${counts.open})`],
              ['resolved', `Resolved (${counts.resolved})`],
              ['dismissed', `Dismissed (${counts.dismissed})`],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                statusFilter === val
                  ? 'bg-white dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                  : 'text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <select
            aria-label="Filter reports by subject"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9]"
          >
            {subjectOptions.map((s) => (
              <option key={s} value={s} className="bg-white dark:bg-[#141923]">
                {s === 'All' ? 'All Subjects' : s}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter reports by reason"
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value as 'All' | ReportReason)}
            className="px-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] text-[#0F172A] dark:text-[#F1F5F9]"
          >
            <option value="All" className="bg-white dark:bg-[#141923]">
              All Reasons
            </option>
            {ALLOWED_REPORT_REASONS.map((r) => (
              <option key={r} value={r} className="bg-white dark:bg-[#141923]">
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reports List */}
      {filteredReports.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-8 text-center space-y-1.5">
          <Flag className="w-6 h-6 text-[#F43F5E] mx-auto opacity-80" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            No reported questions in this view
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            Student flags submitted from active tests, answer keys, or PYQs appear here for one-click patching.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => {
            const liveQuestion = unifiedQuestionsMap[report.questionId];
            const isEditing = editingReportId === report.id;
            const isConfirmingDeleteQ = confirmDeleteQuestionReportId === report.id;
            const isBusy = busyId === report.id;

            return (
              <article
                key={report.id}
                className={`rounded-2xl bg-white dark:bg-[#141923] border p-4 space-y-3 ${
                  report.status === 'resolved'
                    ? 'border-emerald-500/25'
                    : report.status === 'dismissed'
                    ? 'border-[#E2E8F0] dark:border-white/[0.05] opacity-75'
                    : 'border-rose-500/30'
                }`}
              >
                {/* Metadata & Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold ${
                        report.status === 'resolved'
                          ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
                          : report.status === 'dismissed'
                          ? 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                          : 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                      }`}
                    >
                      {report.status === 'resolved'
                        ? 'Resolved'
                        : report.status === 'dismissed'
                        ? 'Dismissed'
                        : 'Open'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/12 text-amber-700 dark:text-amber-300 font-semibold">
                      {report.reason}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-[#F4F6FA] dark:bg-[#1C2331] font-mono-num text-[10px] text-[#475569] dark:text-[#94A3B8]">
                      {report.sourceTable === 'pyqs' ? 'PYQ' : 'MCQ'}
                    </span>
                    <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {report.subject} · {report.chapter}
                    </span>
                    <span className="text-[#64748B] font-mono-num">
                      {new Date(report.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {liveQuestion && (
                      <button
                        type="button"
                        onClick={() => openPatchEditor(report)}
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                          isEditing
                            ? 'bg-[#6366F1] text-white'
                            : 'bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25'
                        }`}
                      >
                        <Edit3 className="w-3 h-3" />
                        {isEditing ? 'Close Editor' : 'Edit & Fix Question'}
                      </button>
                    )}

                    {report.status === 'open' ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleUpdateReportStatus(report, 'dismissed')}
                        className="h-7 px-2.5 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" />
                        Dismiss
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleUpdateReportStatus(report, 'open')}
                        className="h-7 px-2.5 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reopen
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleDeleteReportRecord(report.id)}
                      aria-label={`Delete report ${report.id}`}
                      title="Delete report entry"
                      className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Student Comment */}
                {report.comment && (
                  <div className="rounded-xl px-3 py-2 bg-rose-500/[0.06] border border-rose-500/20 text-xs text-[#0F172A] dark:text-[#F1F5F9]">
                    <span className="font-semibold text-rose-600 dark:text-rose-300">
                      Student note:{' '}
                    </span>
                    {report.comment}
                  </div>
                )}

                {/* Underlying Question Preview (from live bank if present, else snapshot) */}
                {!isEditing && (
                  <div className="rounded-xl p-3 bg-[#F4F6FA] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.06] space-y-2">
                    <div className="font-hindi text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] leading-relaxed">
                      <MathText
                        text={liveQuestion?.question_hi || report.questionSnapshot}
                      />
                    </div>
                    {liveQuestion ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                        {liveQuestion.options_hi.map((opt, i) => {
                          const isCorrect = i === liveQuestion.correct_index;
                          return (
                            <div
                              key={i}
                              className={`px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 font-hindi ${
                                isCorrect
                                  ? 'bg-[#10B981]/10 border-[#10B981]/35 text-[#065F46] dark:text-[#A7F3D0] font-semibold'
                                  : 'bg-white dark:bg-[#141923] border-[#E2E8F0] dark:border-white/[0.06] text-[#475569] dark:text-[#CBD5E1]'
                              }`}
                            >
                              <span className="font-mono-num font-bold shrink-0">
                                {OPTION_LABELS[i]}.
                              </span>
                              <span className="flex-1">
                                <MathText text={opt} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-600 dark:text-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Original question ID <code className="font-mono-num">{report.questionId}</code> is no longer in the local bank.
                      </p>
                    )}
                  </div>
                )}

                {report.adminNote && !isEditing && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      <strong>Admin resolution:</strong> {report.adminNote}
                      {report.resolvedAt
                        ? ` · ${new Date(report.resolvedAt).toLocaleString()}`
                        : ''}
                    </span>
                  </p>
                )}

                {/* One-Click Question Patcher Form */}
                {isEditing && liveQuestion && (
                  <div className="rounded-xl p-3.5 bg-[#F4F6FA] dark:bg-[#0E121B] border border-indigo-500/35 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#6366F1] dark:text-indigo-400">
                        One-Click Question Patcher ({report.sourceTable === 'pyqs' ? 'PYQ' : 'MCQ'})
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowPreview((p) => !p)}
                        className="h-6.5 px-2 rounded-md bg-white dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        {showPreview ? 'Hide KaTeX Preview' : 'Live KaTeX Preview'}
                      </button>
                    </div>

                    {showPreview && (
                      <div className="rounded-xl p-3 bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] space-y-2">
                        <div className="font-hindi text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                          <MathText text={patchStem} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                          {patchOptions.map((opt, idx) => (
                            <div
                              key={idx}
                              className={`px-2.5 py-1.5 rounded-lg border font-hindi ${
                                patchCorrectIndex === idx
                                  ? 'bg-[#10B981]/10 border-[#10B981]/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                                  : 'bg-[#F4F6FA] dark:bg-[#1C2331] border-[#E2E8F0] dark:border-white/[0.06]'
                              }`}
                            >
                              {OPTION_LABELS[idx]}. <MathText text={opt} />
                            </div>
                          ))}
                        </div>
                        {patchExplanation.trim() && (
                          <div className="text-[11px] font-hindi text-[#475569] dark:text-[#94A3B8] pt-1 border-t border-[#E2E8F0] dark:border-white/[0.06]">
                            <MathText text={patchExplanation} />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label
                        htmlFor={`patch-stem-${report.id}`}
                        className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                      >
                        Question Stem (Hindi + KaTeX)
                      </label>
                      <textarea
                        id={`patch-stem-${report.id}`}
                        rows={3}
                        value={patchStem}
                        onChange={(e) => setPatchStem(e.target.value)}
                        className={`${INPUT_CLASS} font-hindi`}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {patchOptions.map((optVal, idx) => {
                        const isCorrect = patchCorrectIndex === idx;
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label
                                htmlFor={`patch-opt-${report.id}-${idx}`}
                                className="text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                              >
                                Option {OPTION_LABELS[idx]}
                              </label>
                              <button
                                type="button"
                                onClick={() => setPatchCorrectIndex(idx as 0 | 1 | 2 | 3)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                  isCorrect
                                    ? 'bg-[#10B981] text-white'
                                    : 'bg-white dark:bg-[#1C2331] text-[#64748B] border border-[#E2E8F0] dark:border-white/[0.08]'
                                }`}
                              >
                                {isCorrect ? '✓ Correct Answer' : 'Mark Correct'}
                              </button>
                            </div>
                            <input
                              id={`patch-opt-${report.id}-${idx}`}
                              type="text"
                              value={optVal}
                              onChange={(e) => {
                                const next: [string, string, string, string] = [
                                  ...patchOptions,
                                ] as [string, string, string, string];
                                next[idx] = e.target.value;
                                setPatchOptions(next);
                              }}
                              className={`${INPUT_CLASS} font-hindi`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2 space-y-1">
                        <label
                          htmlFor={`patch-exp-${report.id}`}
                          className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                        >
                          NCERT Hindi Explanation
                        </label>
                        <textarea
                          id={`patch-exp-${report.id}`}
                          rows={2}
                          value={patchExplanation}
                          onChange={(e) => setPatchExplanation(e.target.value)}
                          className={`${INPUT_CLASS} font-hindi`}
                        />
                      </div>

                      <div className="space-y-2">
                        {report.sourceTable !== 'pyqs' && (
                          <div className="space-y-1">
                            <label
                              htmlFor={`patch-diff-${report.id}`}
                              className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                            >
                              Difficulty
                            </label>
                            <select
                              id={`patch-diff-${report.id}`}
                              value={patchDifficulty}
                              onChange={(e) =>
                                setPatchDifficulty(
                                  e.target.value as Exclude<DifficultyLevel, 'Mixed'>
                                )
                              }
                              className={INPUT_CLASS}
                            >
                              {DIFFICULTIES.map((d) => (
                                <option
                                  key={d}
                                  value={d}
                                  className="bg-white dark:bg-[#141923]"
                                >
                                  {d}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="space-y-1">
                          <label
                            htmlFor={`patch-note-${report.id}`}
                            className="block text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]"
                          >
                            Resolution Note
                          </label>
                          <input
                            id={`patch-note-${report.id}`}
                            type="text"
                            maxLength={200}
                            value={patchAdminNote}
                            onChange={(e) => setPatchAdminNote(e.target.value)}
                            placeholder="Fixed answer key / KaTeX"
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Patcher Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0] dark:border-white/[0.06]">
                      <div>
                        {isConfirmingDeleteQ ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy || savingPatch}
                              onClick={() => void handleDeleteUnderlyingQuestion(report)}
                              className="h-8 px-2.5 rounded-lg bg-[#F43F5E] hover:bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Confirm Delete Question
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteQuestionReportId(null)}
                              className="h-8 px-2 rounded-lg text-[11px] font-semibold text-[#64748B] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteQuestionReportId(report.id)}
                            className="h-8 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/25 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete Invalid Question
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingReportId(null)}
                          className="h-8 px-3 rounded-lg bg-white dark:bg-[#1C2331] text-xs font-semibold text-[#475569] dark:text-[#94A3B8] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={savingPatch || isBusy}
                          onClick={() => void handleSavePatchAndResolve(report)}
                          className="h-8 px-3.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          {savingPatch ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          Save Patch &amp; Mark Resolved
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
