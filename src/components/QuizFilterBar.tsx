import React from 'react';
import type { NeetDifficultyLevel, NeetQuestionBasis } from '../services/dinuMentorService';

export const DIFFICULTY_OPTIONS: Array<{
  value: NeetDifficultyLevel;
  label: string;
  badge: string;
}> = [
  { value: 'Easy', label: 'Easy (Foundation)', badge: 'NCERT Basic' },
  { value: 'Medium', label: 'Medium (NEET Standard)', badge: 'Moderate' },
  { value: 'Hard', label: 'Hard (Rank Decider)', badge: 'Tricky' },
  { value: 'Advanced', label: 'Advanced (Top-500)', badge: 'Multi-Concept' },
  { value: 'Ultra', label: 'Ultra (AIR-1 / Olympiad)', badge: 'Extreme' },
];

export const QUESTION_BASIS_OPTIONS: NeetQuestionBasis[] = [
  'NCERT Line-by-Line',
  'Core Concept & Mechanism',
  'Assertion-Reason',
  'Statement I & II',
  'Multi-Statement (How many correct)',
  'Match the Column (List I & II)',
  'Multi-Concept Numerical',
  'NCERT Traps & Exceptions',
];

interface QuizFilterBarProps {
  questionCount: number;
  onQuestionCountChange: (n: number) => void;
  durationMins: number;
  onDurationMinsChange: (m: number) => void;
  difficulty: NeetDifficultyLevel;
  onDifficultyChange: (d: NeetDifficultyLevel) => void;
  questionBasis: NeetQuestionBasis;
  onQuestionBasisChange: (b: NeetQuestionBasis) => void;
  isAdmin?: boolean;
}

export const QuizFilterBar: React.FC<QuizFilterBarProps> = ({
  questionCount,
  onQuestionCountChange,
  durationMins,
  onDurationMinsChange,
  difficulty,
  onDifficultyChange,
  questionBasis,
  onQuestionBasisChange,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div>
        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
          Number of Questions
        </label>
        <select
          value={questionCount}
          onChange={(e) => onQuestionCountChange(Number(e.target.value) || 15)}
          className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
        >
          {[5, 10, 15, 20, 30, 45, 60, 90, 180].map((n) => (
            <option key={n} value={n}>
              {n} Questions
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
          Timer Duration
        </label>
        <select
          value={durationMins}
          onChange={(e) => onDurationMinsChange(Number(e.target.value) || 20)}
          className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
        >
          {[10, 15, 20, 30, 45, 60, 90, 120, 180].map((m) => (
            <option key={m} value={m}>
              {m} Minutes
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
          Difficulty Tier (Easy → Ultra)
        </label>
        <select
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value as NeetDifficultyLevel)}
          className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
        >
          {DIFFICULTY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
          Question Basis / Pattern
        </label>
        <select
          value={questionBasis}
          onChange={(e) => onQuestionBasisChange(e.target.value as NeetQuestionBasis)}
          className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
        >
          {QUESTION_BASIS_OPTIONS.map((basis) => (
            <option key={basis} value={basis}>
              {basis}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
