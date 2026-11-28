import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Lock,
  MessageCircle,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { AppSettings, QuestionReport, StudentSuggestion } from '../types';
import {
  createAccessKey,
  createSubAdminWithPermissions,
  DEFAULT_LOCK_CONFIG,
  deleteAccessKey,
  fetchAccessKeys,
  fetchAllAdmins,
  fetchAppLockConfig,
  fetchRegisteredUsersList,
  redeemAccessKey,
  removeSubAdmin,
  updateAppLockConfig,
  updateSubAdminPermissions,
  type AdminPermissionRecord,
  type AppAccessKey,
  type AppLockConfig,
  type LockTargetScope,
  type RegisteredStudentRow,
} from '../services/appLockAndAdminService';
import { getSupabaseClient } from '../services/supabaseService';

/* ============================================================================
   1. REAL-TIME FULLSCREEN APP LOCK POPUP (STUDENTS / LOCKED USERS)
   ============================================================================ */
export const AppLockOverlayModal: React.FC<{
  isOpen: boolean;
  config: AppLockConfig;
  settings: AppSettings;
  onUnlocked: () => void;
}> = ({ isOpen, config, settings, onUnlocked }) => {
  const [keyInput, setKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const cleanWaNumber = (config.whatsapp_number || '22379778524').replace(/[^\d]/g, '');
  const waPrefilledText = encodeURIComponent('Access key 🔑 ?');
  const waDirectUrl = `https://wa.me/${cleanWaNumber}?text=${waPrefilledText}`;
  const channelUrl =
    config.whatsapp_channel_url?.trim() ||
    'https://whatsapp.com/channel/0029VbE7gX0FMqrWwudHPx31';

  const handleVerifyKey = async () => {
    if (!keyInput.trim() || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await redeemAccessKey(settings, keyInput.trim());
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'अमान्य Access Key! कृपया दोबारा जाँचें।');
      return;
    }
    setKeyInput('');
    onUnlocked();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-xl">
      <div className="w-full max-w-md rounded-3xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-500/15 text-rose-400 shadow-lg">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">
            {config.lock_title || 'App Locked 🔒'}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
            {config.lock_message ||
              'अस्थायी रूप से एक्सेस लॉक किया गया है। आगे बढ़ने के लिए अपनी Access Key दर्ज करें।'}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Enter your key here
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400" />
              <input
                type="text"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleVerifyKey();
                  }
                }}
                placeholder="यहाँ अपनी Access Key डालें..."
                maxLength={12}
                autoFocus
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-4 text-sm font-bold tracking-wider text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-200">
              ⚠️ {errorMsg}
            </div>
          )}

          <button
            type="button"
            disabled={submitting || !keyInput.trim()}
            onClick={() => void handleVerifyKey()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-emerald-600 py-3 text-sm font-black text-white shadow-lg transition active:scale-[0.98] hover:opacity-95 disabled:opacity-50"
          >
            <Unlock className="h-4 w-4" />
            {submitting ? 'Verifying Key...' : 'Unlock App Now'}
          </button>
        </div>

        <div className="mt-5 border-t border-slate-800 pt-4">
          <p className="mb-2.5 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            🔑 Key कहाँ से प्राप्त करें? (Find Your Key)
          </p>

          <div className="space-y-2.5">
            <a
              href={waDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 transition hover:bg-emerald-500/20"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-black text-emerald-200">
                    WhatsApp Admin Direct (+{cleanWaNumber})
                  </div>
                  <div className="text-[10px] text-emerald-300/80">
                    टैप करते ही "Access key 🔑 ?" मैसेज तैयार मिलेगा
                  </div>
                </div>
              </div>
              <span className="rounded-lg bg-emerald-500/25 px-2 py-1 text-[10px] font-black text-emerald-200">
                Ask ↗
              </span>
            </a>

            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 transition hover:bg-indigo-500/20"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white font-black text-xs">
                  CH
                </div>
                <div>
                  <div className="text-xs font-black text-indigo-200">
                    Official WhatsApp Channel (Latest Post)
                  </div>
                  <div className="text-[10px] text-indigo-300/80">
                    चैनल खोलें — लेटेस्ट पोस्ट में शेयर की गई Key देखें
                  </div>
                </div>
              </div>
              <span className="rounded-lg bg-indigo-500/25 px-2 py-1 text-[10px] font-black text-indigo-200">
                Open ↗
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   2. MASTER ADMIN PAGE / COMMAND CENTER MODAL (100% BUG-FREE & INSTANT UI)
   ============================================================================ */
export const AdminCommandCenterModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  adminEmail: string | null;
  suggestions: StudentSuggestion[];
  reports: QuestionReport[];
  onOpenRoute: (route: 'suggestions' | 'reports') => void;
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}> = ({
  isOpen,
  onClose,
  settings,
  adminEmail,
  suggestions,
  reports,
  onOpenRoute,
  onShowToast,
}) => {
  const [tab, setTab] = useState<'lock' | 'users' | 'admins' | 'reports' | 'suggestions'>('lock');
  const [loading, setLoading] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    msg: string;
    tone: 'success' | 'error' | 'info';
  } | null>(null);

  // Lock & Keys State (Initialized with DEFAULT_LOCK_CONFIG so UI is never blank or dead)
  const [lockConfig, setLockConfig] = useState<AppLockConfig>(DEFAULT_LOCK_CONFIG);
  const [togglingLock, setTogglingLock] = useState(false);
  const [keysList, setKeysList] = useState<AppAccessKey[]>([]);
  const [addingKey, setAddingKey] = useState(false);
  const [keyCategory, setKeyCategory] = useState<'limited' | 'public'>('limited');
  const [newKeyCode, setNewKeyCode] = useState('');
  const [usePreset, setUsePreset] = useState<number | 'custom'>(1);
  const [customUseCount, setCustomUseCount] = useState<string>('5');

  // Users List State
  const [usersList, setUsersList] = useState<RegisteredStudentRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Admins & Granular Permissions State
  const [adminsList, setAdminsList] = useState<AdminPermissionRecord[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newPerms, setNewPerms] = useState({
    can_upload_questions: true,
    can_view_users: false,
    can_manage_reports: true,
    can_control_lock: false,
    can_manage_keys: false,
    can_manage_admins: false,
  });

  const notify = useCallback(
    (msg: string, tone: 'success' | 'error' | 'info' = 'info') => {
      setStatusBanner({ msg, tone });
      onShowToast(msg, tone);
    },
    [onShowToast]
  );

  const currentAdminPerm = useMemo(() => {
    if (!adminEmail) return null;
    return adminsList.find((a) => a.email.toLowerCase() === adminEmail.toLowerCase()) || null;
  }, [adminsList, adminEmail]);

  const isMasterOwner =
    !currentAdminPerm || currentAdminPerm.is_master_owner || adminsList.length === 0;
  const canControlLock = isMasterOwner || Boolean(currentAdminPerm?.can_control_lock);
  const canManageKeys = isMasterOwner || Boolean(currentAdminPerm?.can_manage_keys);
  const canViewUsers = isMasterOwner || Boolean(currentAdminPerm?.can_view_users);
  const canManageAdmins = isMasterOwner || Boolean(currentAdminPerm?.can_manage_admins);

  const loadAllCommandData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, keys, users, admins] = await Promise.all([
        fetchAppLockConfig(settings),
        fetchAccessKeys(settings),
        fetchRegisteredUsersList(settings),
        fetchAllAdmins(settings),
      ]);
      setLockConfig(cfg || DEFAULT_LOCK_CONFIG);
      setKeysList(keys);
      setUsersList(users);
      setAdminsList(admins);
    } catch (err: any) {
      notify(err?.message || 'डेटा लोड करने में समस्या आई।', 'error');
    } finally {
      setLoading(false);
    }
  }, [settings, notify]);

  useEffect(() => {
    if (!isOpen) return;
    void loadAllCommandData();

    const client = getSupabaseClient(settings);
    if (!client) return;

    const channel = client
      .channel('admin-command-center-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_registered_users' },
        () => {
          void fetchRegisteredUsersList(settings).then(setUsersList);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_access_keys' },
        () => {
          void fetchAccessKeys(settings).then(setKeysList);
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [isOpen, loadAllCommandData, settings]);

  if (!isOpen) return null;

  const handleToggleLock = async () => {
    if (togglingLock) return;
    if (!canControlLock) {
      notify('आपके पास App Lock बदलने की अनुमति नहीं है।', 'error');
      return;
    }
    const previousLocked = lockConfig.is_locked;
    const nextLocked = !previousLocked;

    // 1. Instant Optimistic UI Update (0ms lag on mobile tap)
    setTogglingLock(true);
    setLockConfig((prev) => ({ ...prev, is_locked: nextLocked }));

    try {
      const res = await updateAppLockConfig(settings, {
        ...lockConfig,
        is_locked: nextLocked,
      });

      if (!res.ok) {
        setLockConfig((prev) => ({ ...prev, is_locked: previousLocked }));
        notify(`❌ लॉक अपडेट विफल: ${res.error || 'Supabase Error'}`, 'error');
        return;
      }

      notify(
        nextLocked
          ? `🔒 App Locked LIVE (${lockConfig.target_scope.toUpperCase()} Users पर तुरंत लागू!)`
          : '🔓 App Unlocked! सभी यूज़र्स के लिए साइट खुल गई है।',
        'success'
      );
    } finally {
      setTogglingLock(false);
    }
  };

  const handleChangeScope = async (scope: LockTargetScope) => {
    if (!canControlLock) return;
    const prevScope = lockConfig.target_scope;
    setLockConfig((prev) => ({ ...prev, target_scope: scope }));
    const res = await updateAppLockConfig(settings, { ...lockConfig, target_scope: scope });
    if (res.ok) {
      notify(`✅ Lock Target अपडेट: ${scope.toUpperCase()} Users`, 'info');
    } else {
      setLockConfig((prev) => ({ ...prev, target_scope: prevScope }));
      notify(res.error || 'Scope अपडेट विफल', 'error');
    }
  };

  const handleAddKey = async () => {
    if (addingKey) return;
    if (!canManageKeys) {
      notify('आपके पास Key बनाने की अनुमति नहीं है।', 'error');
      return;
    }
    const cleanCode = newKeyCode.trim();
    if (!cleanCode) {
      notify('⚠️ कृपया पहले 5 से 11 अक्षरों की Key लिखें!', 'error');
      return;
    }

    const maxUses =
      keyCategory === 'public'
        ? null
        : usePreset === 'custom'
        ? Math.max(1, parseInt(customUseCount, 10) || 1)
        : usePreset;

    setAddingKey(true);
    try {
      const res = await createAccessKey(settings, {
        key_code: cleanCode,
        key_type: keyCategory,
        max_uses: maxUses,
        created_by: adminEmail || 'Master Owner',
      });

      if (!res.ok) {
        notify(`❌ ${res.error || 'Key बनाने में त्रुटि'}`, 'error');
        return;
      }

      setNewKeyCode('');
      notify(
        keyCategory === 'public'
          ? `🌐 Public Key "${cleanCode}" बन गई!`
          : `🔑 Limited Key "${cleanCode}" बन गई (${maxUses} यूज़ के बाद ऑटो-डिलीट)!`,
        'success'
      );
      const updatedKeys = await fetchAccessKeys(settings);
      setKeysList(updatedKeys);
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!canManageKeys) return;
    const res = await deleteAccessKey(settings, id);
    if (res.ok) {
      setKeysList((prev) => prev.filter((k) => k.id !== id));
      notify('🗑️ Key स्थायी रूप से डिलीट कर दी गई।', 'info');
    } else {
      notify(res.error || 'Key डिलीट नहीं हो पाई', 'error');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAdmins) {
      notify('केवल Master Owner या अधिकृत Admin ही नया Admin बना सकता है।', 'error');
      return;
    }
    const res = await createSubAdminWithPermissions(settings, {
      email: newAdminEmail,
      password: newAdminPassword,
      permissions: newPerms,
    });
    if (!res.ok) {
      notify(res.error || 'Admin बनाने में विफल', 'error');
      return;
    }
    setNewAdminEmail('');
    setNewAdminPassword('');
    notify('✅ नया Sub-Admin और उसकी Permissions सेव हो गईं!', 'success');
    const updated = await fetchAllAdmins(settings);
    setAdminsList(updated);
  };

  const handleToggleExistingAdminPerm = async (
    email: string,
    field: keyof AdminPermissionRecord,
    val: boolean
  ) => {
    if (!canManageAdmins) return;
    const res = await updateSubAdminPermissions(settings, email, { [field]: val });
    if (res.ok) {
      setAdminsList((prev) =>
        prev.map((a) => (a.email === email ? { ...a, [field]: val } : a))
      );
      notify('Admin Permission अपडेट हो गई।', 'success');
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (!canManageAdmins) return;
    const res = await removeSubAdmin(settings, email);
    if (res.ok) {
      setAdminsList((prev) => prev.filter((a) => a.email !== email));
      notify(`Admin (${email}) को हटा दिया गया।`, 'info');
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.mobile || '').toLowerCase().includes(q) ||
      (u.secret_code || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/90 p-2 sm:p-4 backdrop-blur-lg">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-indigo-500/35 bg-slate-900 shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                🛡️ Master Admin Command Center
              </h2>
              <p className="text-[11px] text-slate-400">
                {adminEmail || 'Owner'} • {isMasterOwner ? '👑 Master Owner' : 'Sub-Admin'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAllCommandData()}
              className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-rose-600 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live Feedback Status Banner (Always visible above modal!) */}
        {statusBanner && (
          <div
            className={`flex items-center justify-between px-4 py-2 text-xs font-black ${
              statusBanner.tone === 'error'
                ? 'bg-rose-600 text-white'
                : statusBanner.tone === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 text-white'
            }`}
          >
            <span>{statusBanner.msg}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="ml-2 rounded px-1.5 py-0.5 text-[10px] hover:bg-black/20"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-900/90 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setTab('lock')}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              tab === 'lock'
                ? 'bg-rose-600 text-white shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🔒 App Lock & Keys ({keysList.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('users');
              void fetchRegisteredUsersList(settings).then(setUsersList);
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              tab === 'users'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            👥 See Users & Secret Codes ({usersList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('admins')}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              tab === 'admins'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            👑 Manage Admins ({adminsList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('reports')}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              tab === 'reports'
                ? 'bg-sky-600 text-white shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🚩 Reported Questions ({reports.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('suggestions')}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              tab === 'suggestions'
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            💡 Suggestions ({suggestions.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* ==================== TAB 1: REALTIME APP LOCK & KEYS ==================== */}
          {tab === 'lock' && (
            <div className="space-y-5">
              {/* Live Lock Master Switch & Target Audience */}
              <div className="rounded-2xl border border-rose-500/35 bg-slate-950/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white">
                      ⚡ Real-Time Website / App Lock Switch
                    </h3>
                    <p className="text-xs text-slate-400">
                      ऑन करते ही सभी चुने गए यूज़र्स के फ़ोन पर हाथोंहाथ "App Locked 🔒" लग जाएगा।
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canControlLock || togglingLock}
                    onClick={() => void handleToggleLock()}
                    className={`cursor-pointer select-none rounded-2xl px-5 py-3 text-xs font-black shadow-lg transition active:scale-95 ${
                      lockConfig.is_locked
                        ? 'bg-rose-600 text-white ring-2 ring-rose-400/50 hover:bg-rose-500'
                        : 'bg-emerald-600 text-white ring-2 ring-emerald-400/50 hover:bg-emerald-500'
                    } disabled:opacity-50`}
                  >
                    {togglingLock
                      ? '⏳ Updating...'
                      : lockConfig.is_locked
                      ? '🔒 LOCKED (Tap to Unlock)'
                      : '🔓 UNLOCKED (Tap to Lock)'}
                  </button>
                </div>

                {/* Scope Selector: All / New Users Only / Old Users Only */}
                <div className="mt-4">
                  <span className="mb-1.5 block text-[11px] font-extrabold uppercase text-slate-400">
                    किस पर लॉक लागू करें? (Target Users)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['all', '🌍 All Users (सभी पर)'],
                        ['new', '🆕 New Users Only'],
                        ['old', '👤 Old Users Only'],
                      ] as const
                    ).map(([sc, label]) => (
                      <button
                        key={sc}
                        type="button"
                        disabled={!canControlLock}
                        onClick={() => void handleChangeScope(sc)}
                        className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition active:scale-95 ${
                          lockConfig.target_scope === sc
                            ? 'border-indigo-500 bg-indigo-600/25 text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Editable WhatsApp & Channel Link */}
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400">
                      WhatsApp Number (Default: 22379778524)
                    </label>
                    <input
                      type="text"
                      value={lockConfig.whatsapp_number}
                      onChange={(e) =>
                        setLockConfig({ ...lockConfig, whatsapp_number: e.target.value })
                      }
                      onBlur={() =>
                        void updateAppLockConfig(settings, {
                          whatsapp_number: lockConfig.whatsapp_number,
                        })
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400">
                      WhatsApp Channel Link
                    </label>
                    <input
                      type="url"
                      value={lockConfig.whatsapp_channel_url}
                      onChange={(e) =>
                        setLockConfig({ ...lockConfig, whatsapp_channel_url: e.target.value })
                      }
                      onBlur={() =>
                        void updateAppLockConfig(settings, {
                          whatsapp_channel_url: lockConfig.whatsapp_channel_url,
                        })
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Keys Generator: Public Key vs Limited Key */}
              <div className="rounded-2xl border border-indigo-500/35 bg-slate-950/80 p-4">
                <h3 className="mb-3 text-sm font-black text-indigo-200">
                  🔑 Set & Manage Access Keys (5 से 11 अक्षर: Letters, Numbers, Symbols)
                </h3>

                {/* Public vs Limited Selector */}
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setKeyCategory('limited')}
                    className={`flex-1 rounded-xl border py-2 text-xs font-black transition ${
                      keyCategory === 'limited'
                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    ⏳ Limited Key (Auto-Delete After Uses)
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeyCategory('public')}
                    className={`flex-1 rounded-xl border py-2 text-xs font-black transition ${
                      keyCategory === 'public'
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    🌐 Public Key (Unlimited Uses)
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newKeyCode}
                      onChange={(e) => setNewKeyCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAddKey();
                        }
                      }}
                      placeholder="Key लिखें (5 से 11 अक्षर, e.g. NEET@27)..."
                      maxLength={11}
                      className="min-w-[200px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white"
                    />
                    <button
                      type="button"
                      disabled={!canManageKeys || addingKey}
                      onClick={() => void handleAddKey()}
                      className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow transition active:scale-95 hover:bg-indigo-500 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                      {addingKey ? 'Adding...' : 'Add Key'}
                    </button>
                  </div>

                  {/* How Many Times Use It */}
                  {keyCategory === 'limited' && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                      <span className="mb-2 block text-[11px] font-bold text-slate-300">
                        How many times use it? (इतने यूज़ के बाद Supabase से ऑटो-डिलीट हो जाएगी):
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[1, 2, 4, 6, 8, 10, 12].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setUsePreset(num)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-black ${
                              usePreset === num
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {num === 1 ? 'Once (1)' : num}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setUsePreset('custom')}
                          className={`rounded-lg px-2.5 py-1 text-xs font-black ${
                            usePreset === 'custom'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          Custom
                        </button>
                        {usePreset === 'custom' && (
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={customUseCount}
                            onChange={(e) => setCustomUseCount(e.target.value)}
                            className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Keys List with Manual Delete */}
                <div className="mt-4 space-y-2">
                  <div className="text-[11px] font-extrabold uppercase text-slate-400">
                    Active Keys ({keysList.length})
                  </div>
                  {keysList.length === 0 ? (
                    <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">
                      अभी कोई Key सक्रिय नहीं है। ऊपर से नई Public या Limited Key बनाएं।
                    </p>
                  ) : (
                    keysList.map((k) => (
                      <div
                        key={k.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="rounded-lg bg-indigo-500/20 px-2.5 py-1 font-mono text-sm font-black text-indigo-200">
                            {k.key_code}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                              k.key_type === 'public'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {k.key_type === 'public'
                              ? `🌐 Public (${k.used_count} used)`
                              : `⏳ Limited: ${k.used_count} / ${k.max_uses} used`}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={!canManageKeys}
                          onClick={() => void handleDeleteKey(k.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-600 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: USERS LIST & SECRET CODES ==================== */}
          {tab === 'users' && (
            <div className="space-y-3">
              {!canViewUsers ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-200">
                  ⛔ Master Owner ने आपको Users व Secret Codes देखने की अनुमति नहीं दी है।
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-black text-indigo-200">
                      <Users className="h-4 w-4" />
                      Total Registered Users: {usersList.length}
                    </div>
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Username, Mobile या Secret Code से खोजें..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white sm:w-64"
                    />
                  </div>

                  <div className="space-y-2">
                    {filteredUsers.length === 0 ? (
                      <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                        कोई यूज़र रिकॉर्ड नहीं मिला। (दूसरे ब्राउज़र को 1 बार रीफ्रेश करें या ऊपर Refresh बटन दबाएं)
                      </p>
                    ) : (
                      filteredUsers.map((u) => (
                        <div
                          key={u.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-xs"
                        >
                          <div>
                            <div className="font-black text-white">
                              @{u.username}{' '}
                              {u.full_name && u.full_name !== u.username && (
                                <span className="font-normal text-slate-400">({u.full_name})</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              📱 {u.mobile || 'No Mobile'} • Target: NEET {u.target_year || '2027'}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 font-mono text-[11px] font-black text-amber-200">
                              Secret: {u.secret_code || '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(
                                  `${u.username} | Mobile: ${u.mobile || ''} | Secret: ${u.secret_code || ''}`
                                );
                                setCopiedId(u.id);
                                setTimeout(() => setCopiedId(null), 1500);
                              }}
                              className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white"
                              title="Copy Details"
                            >
                              {copiedId === u.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ==================== TAB 3: CREATE & MANAGE SUB-ADMINS ==================== */}
          {tab === 'admins' && (
            <div className="space-y-5">
              {!canManageAdmins ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-200">
                  ⛔ केवल Master Owner ही नए Admin बना या हटा सकता है।
                </div>
              ) : (
                <form
                  onSubmit={handleCreateAdmin}
                  className="space-y-3 rounded-2xl border border-amber-500/35 bg-slate-950/80 p-4"
                >
                  <div className="flex items-center gap-2 text-sm font-black text-amber-300">
                    <UserPlus className="h-4 w-4" />
                    Create New Admin & Set Granular Permissions
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="New Admin Gmail (e.g. helper@gmail.com)"
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Set Password (min 6 chars)"
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                    {(
                      [
                        ['can_upload_questions', '📚 Questions & Notes अपलोड कर सके'],
                        ['can_view_users', '👥 Users List व Secret Codes देख सके'],
                        ['can_manage_reports', '🚩 Reported Questions & Suggestions देख सके'],
                        ['can_control_lock', '🔒 App Lock लगा / हटा सके'],
                        ['can_manage_keys', '🔑 Access Keys बना / डिलीट कर सके'],
                        ['can_manage_admins', '👑 नए Admin बना / हटा सके'],
                      ] as const
                    ).map(([permKey, label]) => (
                      <label
                        key={permKey}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={newPerms[permKey]}
                          onChange={(e) =>
                            setNewPerms((prev) => ({ ...prev, [permKey]: e.target.checked }))
                          }
                          className="h-4 w-4 accent-indigo-500"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-black text-slate-950 shadow hover:bg-amber-400"
                  >
                    ➕ Create Admin with Selected Access
                  </button>
                </form>
              )}

              <div className="space-y-2.5">
                <h4 className="text-xs font-black uppercase text-slate-400">
                  Registered Admins & Access Controls ({adminsList.length})
                </h4>
                {adminsList.map((adm) => (
                  <div
                    key={adm.email}
                    className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-black text-white">
                        {adm.email}{' '}
                        {adm.is_master_owner && (
                          <span className="ml-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                            👑 Master Owner
                          </span>
                        )}
                      </div>
                      {!adm.is_master_owner && canManageAdmins && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveAdmin(adm.email)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-600/20 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-600 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove Admin
                        </button>
                      )}
                    </div>

                    {!adm.is_master_owner && canManageAdmins && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(
                          [
                            ['can_upload_questions', 'Upload Qs'],
                            ['can_view_users', 'See Users'],
                            ['can_manage_reports', 'Reports/Sugs'],
                            ['can_control_lock', 'App Lock'],
                            ['can_manage_keys', 'Keys'],
                            ['can_manage_admins', 'Manage Admins'],
                          ] as const
                        ).map(([pKey, shortLabel]) => {
                          const enabled = Boolean(adm[pKey]);
                          return (
                            <button
                              key={pKey}
                              type="button"
                              onClick={() =>
                                void handleToggleExistingAdminPerm(adm.email, pKey, !enabled)
                              }
                              className={`rounded-lg px-2.5 py-1 text-[10px] font-black transition ${
                                enabled
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-900 text-slate-500 border border-slate-800'
                              }`}
                            >
                              {enabled ? '✅' : '❌'} {shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== TAB 4: REPORTED QUESTIONS PREVIEW ==================== */}
          {tab === 'reports' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-sky-300">
                  🚩 Total Reported Questions: {reports.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRoute('reports');
                  }}
                  className="rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-sky-500"
                >
                  Open Full Reports Patch Inbox →
                </button>
              </div>
              {reports.slice(0, 10).map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3 text-xs"
                >
                  <div className="flex justify-between font-bold text-amber-300">
                    <span>
                      {r.subject} • {r.chapter} ({r.reason})
                    </span>
                    <span className="uppercase text-[10px]">{r.status}</span>
                  </div>
                  <p className="mt-1 text-slate-300">{r.questionSnapshot}</p>
                  {r.comment && <p className="mt-1 text-[11px] text-slate-400">Note: {r.comment}</p>}
                </div>
              ))}
            </div>
          )}

          {/* ==================== TAB 5: STUDENT SUGGESTIONS PREVIEW ==================== */}
          {tab === 'suggestions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-300">
                  💡 Total Student Suggestions: {suggestions.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRoute('suggestions');
                  }}
                  className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-500"
                >
                  Open Full Suggestions Inbox →
                </button>
              </div>
              {suggestions.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3 text-xs"
                >
                  <div className="flex justify-between font-bold text-emerald-300">
                    <span>
                      {s.studentName} • [{s.category}]
                    </span>
                    <span className="uppercase text-[10px]">{s.status}</span>
                  </div>
                  <p className="mt-1 text-slate-200">{s.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
