import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { AppSettings, StudentSuggestion } from '../types';
import {
  deleteCloudSuggestion,
  isSupabaseConfigured,
  updateCloudSuggestionStatus,
} from '../services/supabaseService';
import { db } from '../db/database';

interface SuggestionsInboxViewProps {
  settings: AppSettings;
  suggestions: StudentSuggestion[];
  onRefreshSuggestions: () => Promise<void>;
  onBackHome: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const SuggestionsInboxView: React.FC<SuggestionsInboxViewProps> = ({
  settings,
  suggestions,
  onRefreshSuggestions,
  onBackHome,
  onToast,
}) => {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const openCount = useMemo(
    () => suggestions.filter((s) => s.status === 'open').length,
    [suggestions]
  );

  const filtered = useMemo(() => {
    return suggestions.filter((s) => filter === 'all' || s.status === filter);
  }, [suggestions, filter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshSuggestions();
      onToast('Suggestions Inbox refreshed.', 'info');
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleResolve = async (item: StudentSuggestion) => {
    const nextStatus = item.status === 'open' ? 'resolved' : 'open';
    try {
      if (isSupabaseConfigured(settings)) {
        await updateCloudSuggestionStatus(settings, item.id, nextStatus);
      }
      await db.suggestions.update(item.id, { status: nextStatus });
      await onRefreshSuggestions();
      onToast(
        nextStatus === 'resolved' ? 'Marked as Resolved.' : 'Reopened suggestion.',
        'success'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update suggestion.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (isSupabaseConfigured(settings)) {
        await deleteCloudSuggestion(settings, id);
      }
      await db.suggestions.delete(id);
      await onRefreshSuggestions();
      onToast('Suggestion deleted.', 'info');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to delete suggestion.', 'error');
    }
  };

  return (
    <div className="space-y-3.5 pb-10">
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
              Student Suggestions Inbox{' '}
              <span className="font-mono-num text-[#10B981]">({openCount} open)</span>
            </h1>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Admin-only inbox · Feedback, chapter requests &amp; bug reports from students
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
      <div className="flex gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#0E121B] border border-[#E2E8F0] dark:border-white/[0.05] w-fit">
        {(
          [
            ['all', `All (${suggestions.length})`],
            ['open', `Open (${openCount})`],
            ['resolved', `Resolved (${suggestions.length - openCount})`],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilter(val)}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              filter === val
                ? 'bg-white dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                : 'text-[#64748B] dark:text-[#94A3B8]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141923] border border-[#E2E8F0] dark:border-white/[0.06] p-8 text-center space-y-1.5">
          <Inbox className="w-6 h-6 text-[#6366F1] mx-auto opacity-80" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
            No suggestions in this view
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            Student feedback and chapter requests submitted via Suggestion &amp; Feedback appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl bg-white dark:bg-[#141923] border p-4 space-y-2 ${
                item.status === 'resolved'
                  ? 'border-emerald-500/25 opacity-80'
                  : 'border-[#E2E8F0] dark:border-white/[0.06]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 font-semibold">
                    {item.category}
                  </span>
                  <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    {item.studentName}
                  </span>
                  <span className="text-[#64748B] font-mono-num">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-semibold ${
                      item.status === 'resolved'
                        ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
                        : 'bg-amber-500/12 text-amber-600 dark:text-amber-300'
                    }`}
                  >
                    {item.status === 'resolved' ? 'Resolved' : 'Open'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleToggleResolve(item)}
                    className="h-7 px-2.5 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] text-[11px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1 cursor-pointer"
                  >
                    {item.status === 'resolved' ? (
                      <>
                        <RotateCcw className="w-3 h-3" />
                        Reopen
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-[#10B981]" />
                        Mark Resolved
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    aria-label={`Delete suggestion from ${item.studentName}`}
                    className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-[#0F172A] dark:text-[#E2E8F0] whitespace-pre-wrap leading-relaxed">
                {item.message}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
