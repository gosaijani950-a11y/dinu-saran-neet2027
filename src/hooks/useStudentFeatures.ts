import { useCallback, useState } from 'react';
import { getSupabaseClient } from "../services/supabaseService";
import type {
  AppSettings,
  QuizResultSummary,
  StudentProfile,
  StudyVaultFolder,
  StudyVaultLink,
} from '../types';

export interface RankedStudent extends StudentProfile {
  period_points?: number;
  period_correct?: number;
  period_attempted?: number;
  group_code?: string | null;
  group_name?: string | null;
}

export interface RankedGroup {
  group_code: string;
  group_name: string;
  total_points: number;
  total_correct: number;
  total_attempted: number;
  member_count: number;
  top_contributor: string;
}

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

  const createOrJoinGroup = useCallback(
    async (groupName: string, customCode?: string) => {
      if (!studentProfile) return null;
      const cleanName = groupName.trim().slice(0, 28);
      const code = (
        customCode?.trim() ||
        `${cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'NEET'}${Math.floor(100 + Math.random() * 900)}`
      ).toUpperCase();

      const updatedStudent = {
        ...studentProfile,
        group_code: code,
        group_name: cleanName || `Squad ${code}`,
      } as StudentProfile;

      setStudentProfile(updatedStudent);
      localStorage.setItem('dinu_saran_student_profile', JSON.stringify(updatedStudent));

      const client = getSupabaseClient(settings);
      if (client && !studentProfile.id.startsWith('local-')) {
        await client
          .from('students')
          .update({
            group_code: code,
            group_name: cleanName || `Squad ${code}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', studentProfile.id);
      }

      showToast(`Squad "${cleanName || code}" से जुड़ गए! कोड: ${code}`, 'success');
      return { code, name: cleanName || `Squad ${code}` };
    },
    [settings, studentProfile, showToast]
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

      // Points earned in THIS quiz session (for Today & Weekly rankings)
      const sessionPoints = Math.max(0, summary.correctCount * 4 - summary.wrongCount * 1 + attemptedNow);

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
        const sAny = studentProfile as RankedStudent;
        await Promise.all([
          client
            .from('students')
            .update({
              total_attempted: nextAttempted,
              total_correct: nextCorrect,
              total_wrong: nextWrong,
              total_time_seconds: nextTime,
              leaderboard_score: nextScore,
              updated_at: new Date().toISOString(),
            })
            .eq('id', studentProfile.id),
          client.from('quiz_score_logs').insert({
            student_id: studentProfile.id,
            student_name: studentProfile.full_name,
            group_code: sAny.group_code ?? null,
            group_name: sAny.group_name ?? null,
            attempted: attemptedNow,
            correct: summary.correctCount,
            wrong: summary.wrongCount,
            points: sessionPoints,
          }),
        ]);
      }
    },
    [settings, studentProfile]
  );

  const fetchLeaderboardList = useCallback(
    async (timeframe: 'today' | 'weekly' = 'today'): Promise<RankedStudent[]> => {
      const client = getSupabaseClient(settings);
      if (!client) return studentProfile ? [studentProfile] : [];

      const sinceDate = new Date();
      if (timeframe === 'today') {
        sinceDate.setHours(0, 0, 0, 0);
      } else {
        sinceDate.setDate(sinceDate.getDate() - 7);
      }

      const [studentsRes, logsRes] = await Promise.all([
        client.from('students').select('*').limit(200),
        client
          .from('quiz_score_logs')
          .select('*')
          .gte('created_at', sinceDate.toISOString())
          .limit(2000),
      ]);

      const allStudents = (studentsRes.data as RankedStudent[]) ?? [];
      const logs = logsRes.data ?? [];

      const scoreMap = new Map<string, { points: number; correct: number; attempted: number }>();
      for (const log of logs) {
        if (!log.student_id) continue;
        const prev = scoreMap.get(log.student_id) ?? { points: 0, correct: 0, attempted: 0 };
        scoreMap.set(log.student_id, {
          points: prev.points + (log.points || 0),
          correct: prev.correct + (log.correct || 0),
          attempted: prev.attempted + (log.attempted || 0),
        });
      }

      return allStudents
        .map((st) => {
          const stats = scoreMap.get(st.id) ?? { points: 0, correct: 0, attempted: 0 };
          return {
            ...st,
            period_points: stats.points,
            period_correct: stats.correct,
            period_attempted: stats.attempted,
          };
        })
        .sort((a, b) => (b.period_points ?? 0) - (a.period_points ?? 0) || (b.period_correct ?? 0) - (a.period_correct ?? 0));
    },
    [settings, studentProfile]
  );

  const fetchGroupLeaderboard = useCallback(
    async (timeframe: 'today' | 'weekly' = 'today'): Promise<RankedGroup[]> => {
      const client = getSupabaseClient(settings);
      if (!client) return [];

      const sinceDate = new Date();
      if (timeframe === 'today') {
        sinceDate.setHours(0, 0, 0, 0);
      } else {
        sinceDate.setDate(sinceDate.getDate() - 7);
      }

      const [studentsRes, logsRes] = await Promise.all([
        client.from('students').select('id, full_name, group_code, group_name').not('group_code', 'is', null),
        client
          .from('quiz_score_logs')
          .select('*')
          .gte('created_at', sinceDate.toISOString())
          .not('group_code', 'is', null)
          .limit(2000),
      ]);

      const groupMap = new Map<
        string,
        {
          group_code: string;
          group_name: string;
          total_points: number;
          total_correct: number;
          total_attempted: number;
          members: Set<string>;
          contributorPoints: Map<string, number>;
        }
      >();

      for (const st of studentsRes.data ?? []) {
        if (!st.group_code) continue;
        if (!groupMap.has(st.group_code)) {
          groupMap.set(st.group_code, {
            group_code: st.group_code,
            group_name: st.group_name || st.group_code,
            total_points: 0,
            total_correct: 0,
            total_attempted: 0,
            members: new Set(),
            contributorPoints: new Map(),
          });
        }
        groupMap.get(st.group_code)!.members.add(st.id);
      }

      for (const log of logsRes.data ?? []) {
        if (!log.group_code) continue;
        if (!groupMap.has(log.group_code)) {
          groupMap.set(log.group_code, {
            group_code: log.group_code,
            group_name: log.group_name || log.group_code,
            total_points: 0,
            total_correct: 0,
            total_attempted: 0,
            members: new Set(),
            contributorPoints: new Map(),
          });
        }
        const g = groupMap.get(log.group_code)!;
        g.total_points += log.points || 0;
        g.total_correct += log.correct || 0;
        g.total_attempted += log.attempted || 0;
        if (log.student_id) g.members.add(log.student_id);
        const prevC = g.contributorPoints.get(log.student_name) ?? 0;
        g.contributorPoints.set(log.student_name, prevC + (log.points || 0));
      }

      return Array.from(groupMap.values())
        .map((g) => {
          let topContributor = '—';
          let maxPts = -1;
          g.contributorPoints.forEach((pts, name) => {
            if (pts > maxPts) {
              maxPts = pts;
              topContributor = name;
            }
          });
          return {
            group_code: g.group_code,
            group_name: g.group_name,
            total_points: g.total_points,
            total_correct: g.total_correct,
            total_attempted: g.total_attempted,
            member_count: g.members.size,
            top_contributor: topContributor,
          };
        })
        .sort((a, b) => b.total_points - a.total_points || b.total_correct - a.total_correct);
    },
    [settings]
  );

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
    createOrJoinGroup,
    recordQuizInLeaderboard,
    fetchLeaderboardList,
    fetchGroupLeaderboard,
    loadStudyVaultData,
    createVaultFolder,
    deleteVaultFolder,
    createVaultLink,
    deleteVaultLink,
  };
}
