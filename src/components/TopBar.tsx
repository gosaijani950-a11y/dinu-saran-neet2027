import React from 'react';
import {
  AlertCircle,
  Cloud,
  HelpCircle,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import type { AppSettings, CloudSyncStatus, UserRole, ViewRoute } from '../types';
import { BrandLogo } from './BrandLogo';

interface TopBarProps {
  settings: AppSettings;
  role: UserRole;
  adminEmail: string | null;
  cloudSyncStatus: CloudSyncStatus;
  mistakeCount: number;
  currentRoute: ViewRoute;
  onNavigateHome: () => void;
  onOpenMistakes: () => void;
  onOpenSettings: () => void;
  onOpenRules: () => void;
  onOpenHelp: () => void;
  onOpenDrawer: () => void;
  onAdminLogout: () => void;
  onToggleTheme: () => void;
  onAdjustFont: (delta: number) => void;
  onLogoTap?: () => void;

}

export const TopBar: React.FC<TopBarProps> = ({
  settings,
  role,
  adminEmail,
  cloudSyncStatus,
  mistakeCount,
  currentRoute,
  onNavigateHome,
  onOpenMistakes,
  onOpenSettings,
  onOpenRules,
  onOpenHelp,
  onOpenDrawer,
  onAdminLogout,
  onToggleTheme,
  onAdjustFont,
  onLogoTap,

}) => {
  const isAdmin = role === 'admin';
  const hasApiKey = Boolean(settings.apiKey.trim());
  const initials =
    settings.creatorName
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'DS';

  const syncLabel =
    cloudSyncStatus === 'syncing'
      ? 'Syncing…'
      : cloudSyncStatus === 'synced'
      ? 'Synced'
      : cloudSyncStatus === 'error'
      ? 'Sync Err'
      : 'Local';

  return (
    <header className="sticky top-0 z-40 w-full h-12 border-b border-slate-200/80 dark:border-white/[0.06] bg-[#F4F6FA]/85 dark:bg-[#0B0E14]/85 backdrop-blur-xl transition-colors">
      <div className="mx-auto max-w-3xl px-3 sm:px-4 h-full flex items-center justify-between gap-2">
        {/* Left: Compact Brand Lockup */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => (onLogoTap ? onLogoTap() : onNavigateHome())}

            aria-label="Go to Home Hub"
            className="flex items-center gap-2 text-left group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg py-0.5 pr-1 cursor-pointer"
          >
            <BrandLogo
              size="sm"
              initials={initials}
              className="transition-transform group-hover:scale-105"
            />
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-[13px] tracking-tight text-[#0F172A] dark:text-[#F1F5F9] whitespace-nowrap truncate">
                {settings.creatorName || 'DINU SARAN'}
              </span>
              <span className="hidden xs:inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-tight bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 whitespace-nowrap shrink-0">
                NEET 27
              </span>
            </span>
          </button>

          {isAdmin && (
            <div className="hidden sm:inline-flex items-center gap-1 shrink-0">
              <span
                title={adminEmail ? `Signed in as ${adminEmail}` : 'Admin Mode Active'}
                className="px-1.5 py-0.5 rounded-md bg-emerald-500/14 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap"
              >
                <ShieldCheck className="w-3 h-3 shrink-0" />
                Admin Mode
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap ${
                  cloudSyncStatus === 'synced'
                    ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                    : cloudSyncStatus === 'error'
                    ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                    : 'bg-slate-500/12 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Cloud className="w-2.5 h-2.5 shrink-0" />
                {syncLabel}
              </span>
              <button
                type="button"
                onClick={onAdminLogout}
                title="Sign out of Admin Mode"
                aria-label="Logout Admin Mode"
                className="px-1.5 py-0.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <LogOut className="w-2.5 h-2.5 shrink-0" />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Right: Tight Utility Cluster */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Joined Font Scale Pill */}
          <div
            className="hidden sm:flex items-center h-7.5 rounded-lg bg-[#EEF2F7] dark:bg-[#141923] border border-slate-200/80 dark:border-white/[0.06] p-0.5"
            role="group"
            aria-label="Global font size controls"
          >
            <button
              type="button"
              onClick={() => onAdjustFont(-5)}
              disabled={settings.fontScale <= 85}
              aria-label="Decrease font size"
              className="px-1.5 h-full text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] hover:bg-white dark:hover:bg-[#1C2331] rounded-md transition-colors disabled:opacity-35 cursor-pointer"
            >
              A-
            </button>
            <span className="px-1 text-[10px] font-mono-num text-[#64748B] select-none">
              {settings.fontScale}%
            </span>
            <button
              type="button"
              onClick={() => onAdjustFont(5)}
              disabled={settings.fontScale >= 130}
              aria-label="Increase font size"
              className="px-1.5 h-full text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] hover:bg-white dark:hover:bg-[#1C2331] rounded-md transition-colors disabled:opacity-35 cursor-pointer"
            >
              A+
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={settings.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-7.5 h-7.5 rounded-lg bg-[#EEF2F7] dark:bg-[#141923] border border-slate-200/80 dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors cursor-pointer"
          >
            {settings.theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-[#F59E0B]" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[#6366F1]" />
            )}
          </button>

          {/* Compact Mistake Badge */}
          <button
            type="button"
            onClick={onOpenMistakes}
            aria-label={`Mistake Bank (${mistakeCount})`}
            className={`h-7.5 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              currentRoute === 'mistakes'
                ? 'bg-[#F43F5E] text-white border-[#F43F5E]'
                : 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300 hover:bg-rose-500/18'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Mistake</span>
            <span className="font-mono-num font-bold text-[11px]">{mistakeCount}</span>
          </button>

          {/* Admin-only: Gemini API Settings & Custom AI Rules */}
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label={hasApiKey ? 'Gemini API Settings (Key Active)' : 'Gemini API Settings (No Key Configured)'}
                title={hasApiKey ? 'Gemini API Settings — Key Saved' : 'Gemini API Settings — No Key Configured'}
                className="relative w-7.5 h-7.5 rounded-lg bg-[#EEF2F7] dark:bg-[#141923] border border-slate-200/80 dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span
                  aria-hidden="true"
                  className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                    hasApiKey ? 'bg-[#10B981]' : 'bg-[#F43F5E]'
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={onOpenRules}
                aria-label="Custom AI Rules"
                title="Custom AI Rules"
                className="w-7.5 h-7.5 rounded-lg bg-[#EEF2F7] dark:bg-[#141923] border border-slate-200/80 dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1C2331] flex items-center justify-center text-[#6366F1] dark:text-indigo-400 transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Help & Contact Us */}
          <button
            type="button"
            onClick={onOpenHelp}
            aria-label="Help and Contact Us"
            title="Help & Contact Us"
            className="w-7.5 h-7.5 rounded-lg bg-[#EEF2F7] dark:bg-[#141923] border border-slate-200/80 dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#10B981] dark:hover:text-[#34D399] transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          {/* Menu Drawer Trigger */}
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Open Navigation Menu"
            title="Menu"
            className="w-7.5 h-7.5 rounded-lg bg-[#EEF2F7] dark:bg-[#141923] border border-slate-200/80 dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1C2331] flex items-center justify-center text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors cursor-pointer"
          >
            <Menu className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
