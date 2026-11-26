import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
  Wifi,
  X,
} from 'lucide-react';
import type { AppSettings, ThinkingLevelOption } from '../types';
import {
  PRESET_GEMINI_MODELS,
  testGeminiConnection,
} from '../services/geminiService';
import {
  SUPABASE_SETUP_SQL,
  testSupabaseConnection,
} from '../services/supabaseService';
import { resolveSupabaseConfig } from '../utils/supabaseMappers';
import { isThinkingLevelClamped, resolveThinkingLevel } from '../utils/quizLogic';
import { SegmentedControl } from './SegmentedControl';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  isAdmin: boolean;
  initialTab?: 'gemini' | 'cloud';
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onCloudConfigSaved?: () => Promise<void>;
  onPushLibraryToCloud?: () => Promise<void>;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

const THINKING_OPTIONS: Array<{ value: ThinkingLevelOption; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  isAdmin,
  initialTab = 'gemini',
  onUpdateSettings,
  onCloudConfigSaved,
  onPushLibraryToCloud,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'cloud'>(
    isAdmin ? initialTab : 'cloud'
  );

  // Gemini state
  const [primaryInput, setPrimaryInput] = useState(settings.apiKey);
  const [showPrimary, setShowPrimary] = useState(false);

  const [backupInput, setBackupInput] = useState(settings.backupApiKey);
  const [showBackup, setShowBackup] = useState(false);

  const [modelInput, setModelInput] = useState(settings.modelId);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>(settings.thinkingLevel);
  const [cooldownSec, setCooldownSec] = useState(String(settings.batchCooldownSec));

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Supabase Cloud state
  const [sbUrlInput, setSbUrlInput] = useState(settings.supabaseUrl || '');
  const [sbKeyInput, setSbKeyInput] = useState(settings.supabaseAnonKey || '');
  const [sbTesting, setSbTesting] = useState(false);
  const [sbTestResult, setSbTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [pushingCloud, setPushingCloud] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(isAdmin ? initialTab : 'cloud');
      setPrimaryInput(settings.apiKey);
      setBackupInput(settings.backupApiKey);
      setModelInput(settings.modelId);
      setThinkingLevel(settings.thinkingLevel);
      setCooldownSec(String(settings.batchCooldownSec));
      setTestResult(null);

      setSbUrlInput(settings.supabaseUrl || '');
      setSbKeyInput(settings.supabaseAnonKey || '');
      setSbTestResult(null);
      setCopiedSql(false);
    }
  }, [isOpen, initialTab, isAdmin, settings]);

  const hasSavedPrimary = Boolean(settings.apiKey.trim());
  const hasSavedBackup = Boolean(settings.backupApiKey.trim());
  const clamped = isThinkingLevelClamped(modelInput, thinkingLevel);
  const effectiveLevel = resolveThinkingLevel(modelInput, thinkingLevel);

  const envUrl =
    typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_URL as string) || '' : '';
  const envKey =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_SUPABASE_ANON_KEY as string) || ''
      : '';
  const resolvedSb = resolveSupabaseConfig(
    { supabaseUrl: sbUrlInput, supabaseAnonKey: sbKeyInput },
    envUrl,
    envKey
  );
  const sbSource: 'settings' | 'env' | 'none' =
    sbUrlInput.trim() && sbKeyInput.trim()
      ? 'settings'
      : envUrl.trim() && envKey.trim() && resolvedSb.url && resolvedSb.anonKey
      ? 'env'
      : 'none';

  const handleSavePrimary = () => {
    const trimmed = primaryInput.trim();
    if (!trimmed) {
      onToast('Please enter a non-empty Gemini API key before saving.', 'error');
      return;
    }
    onUpdateSettings({ apiKey: trimmed });
    onToast('Primary Gemini API key saved locally.', 'success');
  };

  const handleReplacePrimary = () => {
    const trimmed = primaryInput.trim();
    if (!trimmed) {
      onToast('Enter the new API key to replace the existing one.', 'error');
      return;
    }
    onUpdateSettings({ apiKey: trimmed });
    onToast('Primary Gemini API key replaced successfully.', 'success');
  };

  const handleDeletePrimary = () => {
    setPrimaryInput('');
    setTestResult(null);
    onUpdateSettings({ apiKey: '' });
    onToast('Primary Gemini API key deleted from browser storage.', 'info');
  };

  const handleSaveBackup = () => {
    const trimmed = backupInput.trim();
    if (!trimmed) {
      onToast('Please enter a non-empty Backup API key.', 'error');
      return;
    }
    onUpdateSettings({ backupApiKey: trimmed });
    onToast('Backup Gemini API key saved.', 'success');
  };

  const handleReplaceBackup = () => {
    const trimmed = backupInput.trim();
    if (!trimmed) {
      onToast('Enter the new Backup API key first.', 'error');
      return;
    }
    onUpdateSettings({ backupApiKey: trimmed });
    onToast('Backup Gemini API key replaced.', 'success');
  };

  const handleDeleteBackup = () => {
    setBackupInput('');
    onUpdateSettings({ backupApiKey: '' });
    onToast('Backup API key removed.', 'info');
  };

  const handleTestConnection = async () => {
    const keyToTest = primaryInput.trim() || settings.apiKey.trim();
    if (!keyToTest) {
      setTestResult({
        ok: false,
        message: 'No API key entered. Paste your Gemini API key above first.',
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const res = await testGeminiConnection(
      keyToTest,
      modelInput.trim() || 'gemini-3.5-flash-lite',
      thinkingLevel
    );
    setTesting(false);
    setTestResult({ ok: res.ok, message: res.message, latencyMs: res.latencyMs });
    if (res.ok) {
      onToast(`Connected in ${res.latencyMs}ms`, 'success');
    }
  };

  const handleSaveModelConfig = () => {
    const cleanModel = modelInput.trim() || 'gemini-3.5-flash-lite';
    const parsedCooldown = Number(cooldownSec);
    const validCooldown = Number.isFinite(parsedCooldown)
      ? Math.min(30, Math.max(0.5, parsedCooldown))
      : 2.5;
    onUpdateSettings({
      modelId: cleanModel,
      thinkingLevel,
      batchCooldownSec: validCooldown,
    });
    setCooldownSec(String(validCooldown));
    onToast(`Model routing saved: ${cleanModel} (${effectiveLevel} thinking).`, 'success');
  };

  const handleSaveCloudConfig = async () => {
    const cleanUrl = sbUrlInput.trim();
    const cleanKey = sbKeyInput.trim();
    if (cleanUrl && !/^https:\/\/.+\.supabase\.co$/i.test(cleanUrl)) {
      onToast('Supabase URL must look like https://your-project.supabase.co', 'error');
      return;
    }
    onUpdateSettings({
      supabaseUrl: cleanUrl,
      supabaseAnonKey: cleanKey,
    });
    onToast('Cloud configuration saved.', 'success');
    if (onCloudConfigSaved) {
      await onCloudConfigSaved();
    }
  };

  const handleTestSupabase = async () => {
    setSbTesting(true);
    setSbTestResult(null);
    const candidateSettings: AppSettings = {
      ...settings,
      supabaseUrl: sbUrlInput.trim(),
      supabaseAnonKey: sbKeyInput.trim(),
    };
    const res = await testSupabaseConnection(candidateSettings);
    setSbTesting(false);
    setSbTestResult(res);
    if (res.ok) {
      onToast(res.message, 'success');
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
      setCopiedSql(true);
      onToast('Supabase SQL setup script copied!', 'success');
      window.setTimeout(() => setCopiedSql(false), 2200);
    } catch {
      onToast('Select the SQL block and copy manually.', 'info');
    }
  };

  const handlePushLibrary = async () => {
    if (!onPushLibraryToCloud) return;
    setPushingCloud(true);
    try {
      await onPushLibraryToCloud();
    } finally {
      setPushingCloud(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Settings and Cloud Setup"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative z-10 w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white/95 dark:bg-[#141923]/95 backdrop-blur-2xl border border-[#E2E8F0] dark:border-white/[0.08] shadow-2xl"
          >
            {/* Compact Frosted Header */}
            <div className="sticky top-0 z-10 px-4 py-3 bg-white/95 dark:bg-[#141923]/95 backdrop-blur-xl border-b border-[#E2E8F0] dark:border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#6366F1]/12 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center shrink-0">
                    {activeTab === 'cloud' ? (
                      <Cloud className="w-3.5 h-3.5" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F1F5F9] truncate">
                      {activeTab === 'cloud'
                        ? 'Cloud & Admin Setup'
                        : 'Gemini API & Model Routing'}
                    </h2>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">
                      {activeTab === 'cloud'
                        ? 'Supabase public study sync & Admin RLS schema'
                        : 'Stored 100% locally in Admin browser'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Settings"
                  className="w-7 h-7 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#0E121B]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('gemini')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'gemini'
                        ? 'bg-white dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    Gemini API &amp; Model
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('cloud')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'cloud'
                        ? 'bg-white dark:bg-[#1C2331] text-[#0F172A] dark:text-[#F1F5F9] shadow-xs'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    ☁️ Cloud &amp; Admin Setup
                  </button>
                </div>
              )}
            </div>

            {activeTab === 'gemini' && isAdmin ? (
              <div className="divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                {/* Primary API Key */}
                <section className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="primary-gemini-key"
                      className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                    >
                      Primary Gemini API Key
                    </label>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5 ${
                        hasSavedPrimary
                          ? 'bg-[#10B981]/12 text-[#059669] dark:text-[#34D399]'
                          : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasSavedPrimary ? 'bg-[#10B981]' : 'bg-[#64748B]'
                        }`}
                      />
                      {hasSavedPrimary ? 'Key Active' : 'No Key'}
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      id="primary-gemini-key"
                      type={showPrimary ? 'text' : 'password'}
                      value={primaryInput}
                      onChange={(e) => setPrimaryInput(e.target.value)}
                      placeholder="AIzaSy..."
                      autoComplete="off"
                      className="w-full pl-3 pr-9 py-2 rounded-lg text-xs font-mono bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrimary((s) => !s)}
                      aria-label={showPrimary ? 'Hide Primary API Key' : 'Show Primary API Key'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]"
                    >
                      {showPrimary ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSavePrimary}
                      className="px-2.5 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#6366F1] dark:hover:bg-[#5558E8] text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      Save Key
                    </button>
                    <button
                      type="button"
                      onClick={handleReplacePrimary}
                      disabled={!hasSavedPrimary}
                      className="px-2.5 py-1.5 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold flex items-center gap-1 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Replace Key
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePrimary}
                      disabled={!hasSavedPrimary}
                      className="px-2.5 py-1.5 rounded-lg bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 text-[#E11D48] dark:text-[#FB7185] text-xs font-semibold flex items-center gap-1 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Key
                    </button>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing}
                      className="ml-auto px-2.5 py-1.5 rounded-lg bg-[#10B981]/12 hover:bg-[#10B981]/20 border border-[#10B981]/30 text-[#059669] dark:text-[#34D399] text-xs font-semibold flex items-center gap-1 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {testing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wifi className="w-3 h-3" />
                      )}
                      Test Connection
                    </button>
                  </div>

                  {testResult && (
                    <div
                      role="status"
                      className={`px-3 py-2 rounded-lg text-xs font-medium flex items-start gap-2 border ${
                        testResult.ok
                          ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#059669] dark:text-[#34D399]'
                          : 'bg-[#F43F5E]/10 border-[#F43F5E]/30 text-[#E11D48] dark:text-[#FB7185]'
                      }`}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </section>

                {/* Optional Backup API Key */}
                <section className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="backup-gemini-key"
                      className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                    >
                      Backup API Key{' '}
                      <span className="font-normal text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        (Optional 429 fallback)
                      </span>
                    </label>
                    <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                      {hasSavedBackup ? 'Backup Active' : 'Not Set'}
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      id="backup-gemini-key"
                      type={showBackup ? 'text' : 'password'}
                      value={backupInput}
                      onChange={(e) => setBackupInput(e.target.value)}
                      placeholder="Optional secondary key for 429 auto-fallback..."
                      autoComplete="off"
                      className="w-full pl-3 pr-9 py-2 rounded-lg text-xs font-mono bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBackup((s) => !s)}
                      aria-label={showBackup ? 'Hide Backup API Key' : 'Show Backup API Key'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]"
                    >
                      {showBackup ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSaveBackup}
                      className="px-2.5 py-1.5 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Save Backup
                    </button>
                    <button
                      type="button"
                      onClick={handleReplaceBackup}
                      disabled={!hasSavedBackup}
                      className="px-2.5 py-1.5 rounded-lg bg-[#F4F6FA] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] text-[#475569] dark:text-[#94A3B8] text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Replace Backup
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteBackup}
                      disabled={!hasSavedBackup}
                      className="px-2.5 py-1.5 rounded-lg bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 text-[#E11D48] dark:text-[#FB7185] text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Delete Backup
                    </button>
                  </div>
                </section>

                {/* Model & Thinking Configuration */}
                <section className="p-4 space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                    Model &amp; Thinking Configuration
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label
                        htmlFor="model-quick-select"
                        className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]"
                      >
                        Quick-Pick Preset
                      </label>
                      <select
                        id="model-quick-select"
                        value={
                          PRESET_GEMINI_MODELS.some((m) => m.id === modelInput)
                            ? modelInput
                            : '__custom'
                        }
                        onChange={(e) => {
                          if (e.target.value !== '__custom') setModelInput(e.target.value);
                        }}
                        className="w-full px-2.5 py-2 rounded-lg text-xs bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
                      >
                        {PRESET_GEMINI_MODELS.map((m) => (
                          <option key={m.id} value={m.id} className="bg-white dark:bg-[#141923]">
                            {m.label}
                          </option>
                        ))}
                        <option value="__custom" className="bg-white dark:bg-[#141923]">
                          Custom Model ID
                        </option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="model-id-input"
                        className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]"
                      >
                        Active Model ID
                      </label>
                      <input
                        id="model-id-input"
                        type="text"
                        value={modelInput}
                        onChange={(e) => setModelInput(e.target.value)}
                        placeholder="gemini-3.5-flash-lite"
                        className="w-full px-2.5 py-2 rounded-lg text-xs font-mono bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
                      />
                    </div>
                  </div>

                  {/* Thinking Level Segmented Track */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]">
                        Thinking Level (<code className="font-mono">thinkingLevel</code>)
                      </span>
                      <span className="text-[11px] font-mono text-[#4F46E5] dark:text-[#818CF8]">
                        Sent: {effectiveLevel}
                      </span>
                    </div>
                    <SegmentedControl
                      layoutId="settings-thinking-level"
                      value={thinkingLevel}
                      onChange={setThinkingLevel}
                      options={THINKING_OPTIONS}
                      fullWidth
                      size="sm"
                      ariaLabel="Thinking Level"
                    />
                    {clamped && (
                      <p className="text-[11px] text-[#B45309] dark:text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/25 rounded-lg px-2.5 py-1.5">
                        Auto-clamp active: <strong>xhigh</strong> is safely clamped to{' '}
                        <strong>HIGH</strong> on Flash / Flash-Lite models.
                      </p>
                    )}
                  </div>

                  {/* Batch Cooldown Guard */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="min-w-0">
                      <label
                        htmlFor="cooldown-input"
                        className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                      >
                        Batch Cooldown Guard (sec)
                      </label>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        Delay between rolling 10-MCQ batches to protect free-tier quota.
                      </p>
                    </div>
                    <input
                      id="cooldown-input"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="30"
                      value={cooldownSec}
                      onChange={(e) => setCooldownSec(e.target.value)}
                      className="w-20 px-2.5 py-1.5 rounded-lg text-xs font-mono-num bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60 shrink-0"
                    />
                  </div>

                  {/* Footer Action Row */}
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#475569] dark:text-[#94A3B8] hover:bg-[#F4F6FA] dark:hover:bg-[#1C2331] transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveModelConfig}
                      className="px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#6366F1] dark:hover:bg-[#5558E8] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                    >
                      Save Model &amp; Routing Config
                    </button>
                  </div>
                </section>
              </div>
            ) : (
              /* Cloud & Admin Setup Tab */
              <div className="divide-y divide-[#E2E8F0] dark:divide-white/[0.06]">
                <section className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                      Supabase Project Credentials
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        sbSource === 'env'
                          ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                          : sbSource === 'settings'
                          ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                          : 'bg-slate-500/12 text-[#64748B]'
                      }`}
                    >
                      {sbSource === 'env'
                        ? 'Env Active'
                        : sbSource === 'settings'
                        ? 'Saved Locally'
                        : 'Not Linked'}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                    Connect your Supabase project via{' '}
                    <code className="font-mono">VITE_SUPABASE_URL</code> /{' '}
                    <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> or save them below.
                    Public anon keys only allow read-only study sync + student suggestions via RLS.
                  </p>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label
                        htmlFor="supabase-url-input"
                        className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]"
                      >
                        Supabase Project URL
                      </label>
                      <input
                        id="supabase-url-input"
                        type="url"
                        value={sbUrlInput}
                        onChange={(e) => setSbUrlInput(e.target.value)}
                        placeholder={envUrl || 'https://xyzcompany.supabase.co'}
                        className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="supabase-anon-input"
                        className="block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]"
                      >
                        Supabase Public Anon Key
                      </label>
                      <input
                        id="supabase-anon-input"
                        type="text"
                        value={sbKeyInput}
                        onChange={(e) => setSbKeyInput(e.target.value)}
                        placeholder={envKey ? 'Loaded from VITE_SUPABASE_ANON_KEY' : 'eyJhbGciOi...'}
                        className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-[#F4F6FA] dark:bg-[#1C2331] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/60"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => void handleSaveCloudConfig()}
                      className="px-3 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#6366F1] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Cloud Config
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleTestSupabase()}
                      disabled={sbTesting}
                      className="px-3 py-1.5 rounded-lg bg-[#10B981]/12 hover:bg-[#10B981]/20 border border-[#10B981]/30 text-[#059669] dark:text-[#34D399] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                    >
                      {sbTesting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wifi className="w-3.5 h-3.5" />
                      )}
                      Test Cloud
                    </button>

                    {isAdmin && onPushLibraryToCloud && (
                      <button
                        type="button"
                        onClick={() => void handlePushLibrary()}
                        disabled={pushingCloud}
                        className="ml-auto px-3 py-1.5 rounded-lg bg-sky-500/12 hover:bg-sky-500/20 border border-sky-500/30 text-sky-700 dark:text-sky-300 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                      >
                        {pushingCloud ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UploadCloud className="w-3.5 h-3.5" />
                        )}
                        Push Library to Cloud
                      </button>
                    )}
                  </div>

                  {sbTestResult && (
                    <div
                      role="status"
                      className={`px-3 py-2 rounded-lg text-xs font-medium flex items-start gap-2 border ${
                        sbTestResult.ok
                          ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#059669] dark:text-[#34D399]'
                          : 'bg-[#F43F5E]/10 border-[#F43F5E]/30 text-[#E11D48] dark:text-[#FB7185]'
                      }`}
                    >
                      {sbTestResult.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <span>{sbTestResult.message}</span>
                    </div>
                  )}
                </section>

                {/* 1-Click Copyable Supabase SQL Setup Script */}
                <section className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                        Supabase SQL &amp; RLS Setup Script
                      </h3>
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        Run once in Supabase SQL Editor, then add your Auth UID to{' '}
                        <code className="font-mono">public.admins</code>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopySql()}
                      className="px-2.5 py-1.5 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-[#E2E8F0] dark:hover:bg-[#242D3F] border border-[#E2E8F0] dark:border-white/[0.08] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#10B981]" />
                          <span className="text-[#10B981]">Copied SQL</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy SQL</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="max-h-48 overflow-auto p-3 rounded-xl bg-[#0B0E14] text-[#CBD5E1] text-[10px] font-mono leading-relaxed border border-white/[0.08] select-all">
                    {SUPABASE_SETUP_SQL}
                  </pre>
                </section>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
