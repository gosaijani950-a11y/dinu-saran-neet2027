import type { AppSettings } from '../types';
import { getSupabaseClient } from './supabaseService';

export type LockTargetScope = 'all' | 'new' | 'old';

export interface AppLockConfig {
  id: number;
  is_locked: boolean;
  target_scope: LockTargetScope;
  lock_title: string;
  lock_message: string;
  whatsapp_number: string;
  whatsapp_channel_url: string;
  updated_at?: string;
}

export interface AppAccessKey {
  id: string;
  key_code: string;
  key_type: 'public' | 'limited';
  max_uses: number | null;
  used_count: number;
  created_by?: string;
  created_at?: string;
}

export interface AdminPermissionRecord {
  email: string;
  is_master_owner: boolean;
  can_upload_questions: boolean;
  can_view_users: boolean;
  can_manage_reports: boolean;
  can_control_lock: boolean;
  can_manage_keys: boolean;
  can_manage_admins: boolean;
  created_at?: string;
}

export interface RegisteredStudentRow {
  id: string;
  username: string;
  full_name?: string;
  mobile?: string;
  secret_code?: string;
  security_code?: string;
  target_year?: string;
  created_at?: string;
}

export const DEFAULT_LOCK_CONFIG: AppLockConfig = {
  id: 1,
  is_locked: false,
  target_scope: 'all',
  lock_title: 'App Locked 🔒',
  lock_message: 'अस्थायी रूप से एक्सेस लॉक किया गया है। आगे बढ़ने के लिए अपनी Access Key दर्ज करें।',
  whatsapp_number: '22379778524',
  whatsapp_channel_url: 'https://whatsapp.com/channel/0029VbE7gX0FMqrWwudHPx31',
};

export function validateAccessKeyFormat(rawKey: string): string | null {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 4) return 'Key 4 अक्षरों से बड़ी (कम से कम 5 अक्षर) होनी चाहिए।';
  if (trimmed.length >= 12) return 'Key 12 अक्षरों से छोटी (अधिकतम 11 अक्षर) होनी चाहिए।';
  if (/\s/.test(trimmed)) return 'Key में खाली स्पेस (Space) नहीं होना चाहिए।';
  return null;
}

export async function syncLocalStudentProfileToCloud(settings: AppSettings): Promise<void> {
  const client = getSupabaseClient(settings);
  if (!client) return;
  try {
    const raw = localStorage.getItem('dinu_neet2027_full_profile_v2');
    if (!raw) return;
    const saved = JSON.parse(raw);
    const username = String(saved.username || saved.full_name || '').trim();
    const mobile = String(saved.mobile || saved.phone || '').trim();
    if (!username || !mobile) return;

    await client.from('app_registered_users').upsert(
      {
        username,
        full_name: String(saved.full_name || saved.name || username),
        mobile,
        security_code: String(saved.security_code || saved.securityCode || ''),
        secret_code: String(saved.secret_code || saved.secretCode || ''),
        target_year: String(saved.target_year || '2027'),
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'username,mobile' }
    );
  } catch {
    // Silent background sync
  }
}

export async function fetchAppLockConfig(settings: AppSettings): Promise<AppLockConfig> {
  void syncLocalStudentProfileToCloud(settings);

  const client = getSupabaseClient(settings);
  if (!client) return DEFAULT_LOCK_CONFIG;
  try {
    const { data, error } = await client
      .from('app_lock_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_LOCK_CONFIG;
    return { ...DEFAULT_LOCK_CONFIG, ...data };
  } catch {
    return DEFAULT_LOCK_CONFIG;
  }
}

export async function updateAppLockConfig(
  settings: AppSettings,
  patch: Partial<AppLockConfig>
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(settings);
  if (!client) return { ok: false, error: 'Supabase कॉन्फ़िगर नहीं है।' };

  const current = await fetchAppLockConfig(settings);
  const payload = {
    id: 1,
    is_locked: patch.is_locked !== undefined ? patch.is_locked : current.is_locked,
    target_scope: patch.target_scope || current.target_scope,
    lock_title: patch.lock_title || current.lock_title,
    lock_message: patch.lock_message || current.lock_message,
    whatsapp_number: patch.whatsapp_number || current.whatsapp_number,
    whatsapp_channel_url: patch.whatsapp_channel_url || current.whatsapp_channel_url,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from('app_lock_config')
    .upsert(payload, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchAccessKeys(settings: AppSettings): Promise<AppAccessKey[]> {
  const client = getSupabaseClient(settings);
  if (!client) return [];
  const { data, error } = await client
    .from('app_access_keys')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as AppAccessKey[];
}

export async function createAccessKey(
  settings: AppSettings,
  params: {
    key_code: string;
    key_type: 'public' | 'limited';
    max_uses: number | null;
    created_by: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const validationErr = validateAccessKeyFormat(params.key_code);
  if (validationErr) return { ok: false, error: validationErr };
  const client = getSupabaseClient(settings);
  if (!client) return { ok: false, error: 'Supabase कॉन्फ़िगर नहीं है।' };

  const { error } = await client.from('app_access_keys').insert({
    key_code: params.key_code.trim(),
    key_type: params.key_type,
    max_uses: params.key_type === 'public' ? null : Math.max(1, params.max_uses || 1),
    used_count: 0,
    created_by: params.created_by,
  });

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'यह Key पहले से बनी हुई है!' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteAccessKey(
  settings: AppSettings,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(settings);
  if (!client) return { ok: false, error: 'Supabase कॉन्फ़िगर नहीं है।' };
  const { error } = await client.from('app_access_keys').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function redeemAccessKey(
  settings: AppSettings,
  rawKey: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(settings);
  if (!client) return { ok: false, error: 'Supabase कनेक्ट नहीं है।' };
  const trimmed = rawKey.trim();
  if (!trimmed) return { ok: false, error: 'कृपया अपनी Access Key लिखें।' };

  const { data, error } = await client.rpc('redeem_app_access_key', {
    p_key: trimmed,
  });

  if (error) return { ok: false, error: error.message };
  if (!data || !data.ok) {
    return { ok: false, error: data?.error || 'अमान्य या समाप्त हो चुकी Key!' };
  }
  return { ok: true };
}

export async function fetchRegisteredUsersList(
  settings: AppSettings
): Promise<RegisteredStudentRow[]> {
  await syncLocalStudentProfileToCloud(settings);
  const client = getSupabaseClient(settings);
  if (!client) return [];

  const mergedMap = new Map<string, RegisteredStudentRow>();

  const normalizeRow = (row: any, idx: number, prefix: string): RegisteredStudentRow => {
    const rawUser = String(row.username || row.student_name || row.full_name || 'Unknown').trim();
    const cleanUser = rawUser.startsWith('@') ? rawUser.slice(1) : rawUser;
    return {
      id: String(row.id || `${prefix}-${cleanUser}-${idx}`),
      username: cleanUser,
      full_name: String(row.full_name || row.name || cleanUser),
      mobile: String(row.mobile || row.phone || ''),
      secret_code: String(row.secret_code || row.secretCode || '—'),
      security_code: String(row.security_code || row.securityCode || '—'),
      target_year: String(row.target_year || '2027'),
      created_at: row.updated_at || row.created_at || row.last_active_at,
    };
  };

  // Read from all 4 possible student tables in priority order (students & student_registry first!)
  const tablesToCheck = ['students', 'student_registry', 'app_registered_users', 'student_profiles'];
  for (const tbl of tablesToCheck) {
    try {
      const { data: rows, error } = await client.from(tbl).select('*');
      if (!error && Array.isArray(rows)) {
        rows.forEach((row: any, idx: number) => {
          const norm = normalizeRow(row, idx, tbl);
          const key = `${norm.username.toLowerCase()}_${norm.mobile}`;
          const existing = mergedMap.get(key);
          if (!existing) {
            mergedMap.set(key, norm);
          } else {
            mergedMap.set(key, {
              ...existing,
              full_name: norm.full_name || existing.full_name,
              secret_code:
                norm.secret_code && norm.secret_code !== '—'
                  ? norm.secret_code
                  : existing.secret_code,
              security_code:
                norm.security_code && norm.security_code !== '—'
                  ? norm.security_code
                  : existing.security_code,
            });
          }
        });
      }
    } catch {
      // Skip if table doesn't exist
    }
  }

  return Array.from(mergedMap.values());
}

export async function fetchAllAdmins(settings: AppSettings): Promise<AdminPermissionRecord[]> {
  const client = getSupabaseClient(settings);
  if (!client) return [];
  const { data, error } = await client
    .from('admin_permissions')
    .select('*')
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as AdminPermissionRecord[];
}

export async function fetchAdminPermissionForEmail(
  settings: AppSettings,
  email: string
): Promise<AdminPermissionRecord | null> {
  const client = getSupabaseClient(settings);
  if (!client || !email) return null;
  const { data } = await client
    .from('admin_permissions')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  return (data as AdminPermissionRecord) || null;
}

export async function createSubAdminWithPermissions(
  settings: AppSettings,
  params: {
    email: string;
    password: string;
    permissions: Omit<AdminPermissionRecord, 'email' | 'is_master_owner' | 'created_at'>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(settings);
  if (!client) return { ok: false, error: 'Supabase कॉन्फ़िगर नहीं है।' };
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail || !params.password || params.password.length < 6) {
    return { ok: false, error: 'सही Gmail और कम से कम 6 अक्षरों का Password डालें।' };
  }

  const { data: signUpData, error: signUpErr } = await client.auth.signUp({
    email: cleanEmail,
    password: params.password,
  });

  if (signUpErr && !signUpErr.message.toLowerCase().includes('already')) {
    return { ok: false, error: signUpErr.message };
  }

  if (signUpData?.user?.id) {
    try {
      await client
        .from('admins')
        .upsert({ user_id: signUpData.user.id, email: cleanEmail }, { onConflict: 'user_id' });
    } catch {}
  }

  const { error: permErr } = await client.from('admin_permissions').upsert(
    {
      email: cleanEmail,
      is_master_owner: false,
      ...params.permissions,
    },
    { onConflict: 'email' }
  );

  if (permErr) return { ok: false, error: permErr.message };
  return { ok: true };
}

export async function updateSubAdminPermissions(
  settings: AppSettings,
  email: string,
  permissions: Partial<AdminPermissionRecord>
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(settings);
  if (!client) return { ok: false, error: 'Supabase कॉन्फ़िगर नहीं है।' };
  const { error } = await client
    .from('admin_permissions')
    .update(permissions)
    .eq('email', email)
    .eq('is_master_owner', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeSubAdmin(
  settings: AppSettings,
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(settings);
  if (!client) return { ok: false, error: 'Supabase कॉन्फ़िगर नहीं है।' };
  try {
    await client.from('admins').delete().eq('email', email);
  } catch {}
  const { error } = await client
    .from('admin_permissions')
    .delete()
    .eq('email', email)
    .eq('is_master_owner', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
