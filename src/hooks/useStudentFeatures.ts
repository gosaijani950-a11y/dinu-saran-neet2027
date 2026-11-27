import { useCallback, useState } from 'react';
import { getSupabaseClient } from "../lib/supabase";

import type {
  AppSettings,
  QuizResultSummary,
  StudentProfile,
  StudyVaultFolder,
  StudyVaultLink,
} from '../types';

export function useStudentFeatures(
  settings: AppSettings,
  showToast: (message: string, tone?: 'success' | 'error' | 'info') => void
) {
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(() => {
    try {
      const saved = localStorage.getItem('dinu_saran_student_profile');
      return saved ? (JSON.parse(saved) as StudentProfile) : null;
    } catch {
      return null;
    }
  });

  const saveStudentProfile = useCallback(
    async (
      profileInput: Omit<
        StudentProfile,
        'id' | 'total_attempted' | 'total_correct' | 'total_wrong' | 'total_time_seconds' | 'leaderboard_score'
      >
    ) => {
      const client = getSupabaseClient(settings);
      if (client) {
        const { data, error } = await client
          .from('students')
          .insert({
            full_name: profileInput.full_name,
            gender: profileInput.gender,
            dob: profileInput.dob,
            attempt_status: profileInput.attempt_status,
            mobile_number: profileInput.mobile_number ?? null,
          })
          .select()
          .single();
        if (!error && data) {
          localStorage.setItem('dinu_saran_student_profile', JSON.stringify(data));
          setStudentProfile(data as StudentProfile);
          showToast(`स्वागत है ${data.full_name}!`, 'success');
          return;
        }
      }
      const localFallback: StudentProfile = {
        id: `local-${Date.now()}`,
        ...profileInput,
        total_attempted: 0,
        total_correct: 0,
        total_wrong: 0,
        total_time_seconds: 0,
        leaderboard_score: 0,
      };
      localStorage.setItem('dinu_saran_student_profile', JSON.stringify(localFallback));
      setStudentProfile(localFallback);
    },
    [settings, showToast]
  );

  const recordQuizInLeaderboard = useCallback(
    async (summary: QuizResultSummary) => {
      if (!studentProfile) return;
      const attemptedNow = summary.correctCount + summary.wrongCount;
      const nextAttempted = studentProfile.total_attempted + attemptedNow;
      const nextCorrect = studentProfile.total_correct + summary.correctCount;
      const nextWrong = studentProfile.total_wrong + summary.wrongCount;
      const nextTime = studentProfile.total_time_seconds + (summary.timeTakenSeconds || 0);
      const accuracyPct = nextAttempted > 0 ? (nextCorrect / nextAttempted) * 100 : 0;
      const avgSec = nextAttempted > 0 ? nextTime / nextAttempted : 60;
      const speedBonus = Math.max(0, 60 - Math.min(60, avgSec));
      const nextScore = Math.round(accuracyPct * 10 + nextAttempted * 2 + speedBonus * 3);

      const updatedStudent: StudentProfile = {
        ...studentProfile,
        total_attempted: nextAttempted,
        total_correct: nextCorrect,
        total_wrong: nextWrong,
        total_time_seconds: nextTime,
        leaderboard_score: nextScore,
      };
      setStudentProfile(updatedStudent);
      localStorage.setItem('dinu_saran_student_profile', JSON.stringify(updatedStudent));

      const client = getSupabaseClient(settings);
      if (client && !studentProfile.id.startsWith('local-')) {
        await client
          .from('students')
          .update({
            total_attempted: nextAttempted,
            total_correct: nextCorrect,
            total_wrong: nextWrong,
            total_time_seconds: nextTime,
            leaderboard_score: nextScore,
            updated_at: new Date().toISOString(),
          })
          .eq('id', studentProfile.id);
      }
    },
    [settings, studentProfile]
  );

  const fetchLeaderboardList = useCallback(async (): Promise<StudentProfile[]> => {
    const client = getSupabaseClient(settings);
    if (!client) return studentProfile ? [studentProfile] : [];
    const { data } = await client
      .from('students')
      .select('*')
      .order('leaderboard_score', { ascending: false })
      .order('total_correct', { ascending: false })
      .limit(100);
    return (data as StudentProfile[]) ?? [];
  }, [settings, studentProfile]);

  const loadStudyVaultData = useCallback(async (): Promise<{
    folders: StudyVaultFolder[];
    links: StudyVaultLink[];
  }> => {
    const client = getSupabaseClient(settings);
    if (!client) return { folders: [], links: [] };
    const [fRes, lRes] = await Promise.all([
      client.from('study_vault_folders').select('*').order('created_at', { ascending: false }),
      client.from('study_vault_links').select('*').order('created_at', { ascending: false }),
    ]);
    return {
      folders: (fRes.data as StudyVaultFolder[]) ?? [],
      links: (lRes.data as StudyVaultLink[]) ?? [],
    };
  }, [settings]);

  const createVaultFolder = useCallback(
    async (name: string, description: string) => {
      const client = getSupabaseClient(settings);
      if (!client) return;
      await client.from('study_vault_folders').insert({ name, description: description || null });
      showToast('फ़ोल्डर बन गया!', 'success');
    },
    [settings, showToast]
  );

  const deleteVaultFolder = useCallback(
    async (id: string) => {
      const client = getSupabaseClient(settings);
      if (!client) return;
      await client.from('study_vault_folders').delete().eq('id', id);
      showToast('फ़ोल्डर हटा दिया गया।', 'info');
    },
    [settings, showToast]
  );

  const createVaultLink = useCallback(
    async (folderId: string, title: string, url: string) => {
      const client = getSupabaseClient(settings);
      if (!client) return;
      await client.from('study_vault_links').insert({ folder_id: folderId, title, url });
      showToast('लिंक जुड़ गया!', 'success');
    },
    [settings, showToast]
  );

  const deleteVaultLink = useCallback(
    async (id: string) => {
      const client = getSupabaseClient(settings);
      if (!client) return;
      await client.from('study_vault_links').delete().eq('id', id);
      showToast('लिंक हटा दिया गया।', 'info');
    },
    [settings, showToast]
  );

  return {
    studentProfile,
    saveStudentProfile,
    recordQuizInLeaderboard,
    fetchLeaderboardList,
    loadStudyVaultData,
    createVaultFolder,
    deleteVaultFolder,
    createVaultLink,
    deleteVaultLink,
  };
}
