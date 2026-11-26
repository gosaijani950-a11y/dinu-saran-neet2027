import { useCallback, useEffect, useMemo, useState } from 'react';
import { CORE_SUBJECTS } from '../data/syllabus';
import type { SubjectName } from '../types';

export const CUSTOM_SUBJECTS_STORAGE_KEY = 'dinu_saran_neet_2027_custom_subjects_v1';
const SUBJECTS_EVENT = 'dinu-saran-custom-subjects-changed';

export function normalizeSubjectList(list: string[]): string[] {
  const seen = new Set<string>(CORE_SUBJECTS.map((s) => s.toLowerCase()));
  const out: string[] = [];
  for (const raw of list) {
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function loadCustomSubjectsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SUBJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeSubjectList(parsed.map(String));
  } catch {
    return [];
  }
}

export function saveCustomSubjectsToStorage(subjects: string[]): string[] {
  const normalized = normalizeSubjectList(subjects);
  try {
    localStorage.setItem(CUSTOM_SUBJECTS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SUBJECTS_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function addCustomSubjectToStorage(name: string): string[] {
  const clean = name.trim();
  if (!clean) return loadCustomSubjectsFromStorage();
  const current = loadCustomSubjectsFromStorage();
  return saveCustomSubjectsToStorage([...current, clean]);
}

export function mergeCustomSubjectsIntoStorage(dbSubjects: string[]): string[] {
  const current = loadCustomSubjectsFromStorage();
  return saveCustomSubjectsToStorage([...current, ...dbSubjects]);
}

/**
 * Shared global hook for Core PCBZ + Custom Subjects backed by localStorage.
 * Any custom subject created in QuizSetup immediately updates Notes, Short Notes,
 * PYQs, Special, Modules, Mistake Bank, and Backup Manager.
 */
export function useSubjects(extraSubjects?: string[]) {
  const [customSubjects, setCustomSubjects] = useState<string[]>(() =>
    loadCustomSubjectsFromStorage()
  );

  useEffect(() => {
    const handleSync = () => {
      setCustomSubjects(loadCustomSubjectsFromStorage());
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CUSTOM_SUBJECTS_STORAGE_KEY) {
        handleSync();
      }
    };
    window.addEventListener(SUBJECTS_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(SUBJECTS_EVENT, handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const mergedCustomSubjects = useMemo(
    () => normalizeSubjectList([...customSubjects, ...(extraSubjects ?? [])]),
    [customSubjects, extraSubjects]
  );

  const subjects = useMemo<SubjectName[]>(
    () => [...CORE_SUBJECTS, ...mergedCustomSubjects],
    [mergedCustomSubjects]
  );

  const subjectsWithAll = useMemo<string[]>(() => ['All', ...subjects], [subjects]);

  const addSubject = useCallback((name: string) => {
    const next = addCustomSubjectToStorage(name);
    setCustomSubjects(next);
    return next;
  }, []);

  return {
    coreSubjects: CORE_SUBJECTS,
    customSubjects: mergedCustomSubjects,
    subjects,
    subjectsWithAll,
    addSubject,
  };
}
