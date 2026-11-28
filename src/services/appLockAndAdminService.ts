import { supabase } from '../lib/supabaseClient';

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

export async function fetchAppLockConfig(): Promise<AppLockConfig> {
  if (!supabase) return DEFAULT_LOCK_CONFIG;
  try {
    const { data, error } = await supabase
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
  patch: Partial<AppLockConfig>
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase उपलब्ध नहीं है।' };
  const { error } = await supabase
    .from('app_lock_config')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchAccessKeys(): Promise<AppAccessKey[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('app_access_keys')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as AppAccessKey[];
}

export async function createAccessKey(params: {
  key_code: string;
  key_type: 'public' | 'limited';
  max_uses: number | null;
  created_by: string;
}): Promise<{ ok: boolean; error?: string }> {
  const validationErr = validateAccessKeyFormat(params.key_code);
  if (validationErr) return { ok: false, error: validationErr };
  if (!supabase) return { ok: false, error: 'Supabase उपलब्ध नहीं है।' };

  const { error } = await supabase.from('app_access_keys').insert({
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

export async function deleteAccessKey(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase उपलब्ध नहीं है।' };
  const { error } = await supabase.from('app_access_keys').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function redeemAccessKey(
  rawKey: string
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase कनेक्ट नहीं है।' };
  const trimmed = rawKey.trim();
  if (!trimmed) return { ok: false, error: 'कृपया अपनी Access Key लिखें।' };

  const { data, error } = await supabase.rpc('redeem_app_access_key', {
    p_key: trimmed,
  });

  if (error) return { ok: false, error: error.message };
  if (!data || !data.ok) {
    return { ok: false, error: data?.error || 'अमान्य Key!' };
  }
  return { ok: true };
}

export async function fetchAllAdmins(): Promise<AdminPermissionRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('admin_permissions')
    .select('*')
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as AdminPermissionRecord[];
}

export async function fetchAdminPermissionForEmail(
  email: string
): Promise<AdminPermissionRecord | null> {
  if (!supabase || !email) return null;
  const { data } = await supabase
    .from('admin_permissions')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  return (data as AdminPermissionRecord) || null;
}

export async function createSubAdminWithPermissions(params: {
  email: string;
  password: string;
  permissions: Omit<AdminPermissionRecord, 'email' | 'is_master_owner' | 'created_at'>;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase उपलब्ध नहीं है।' };
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail || !params.password || params.password.length < 6) {
    return { ok: false, error: 'सही Gmail और कम से कम 6 अक्षरों का Password डालें।' };
  }

  // 1. Register in Supabase Auth (or ignore if user already exists)
  const { error: signUpErr } = await supabase.auth.signUp({
    email: cleanEmail,
    password: params.password,
  });
  if (signUpErr && !signUpErr.message.toLowerCase().includes('already')) {
    return { ok: false, error: signUpErr.message };
  }

  // 2. Add to public.admins table if present
  try {
    await supabase.from('admins').upsert({ email: cleanEmail }, { onConflict: 'email' });
  } catch {
    // Optional if admins table uses different schema
  }

  // 3. Save granular permissions
  const { error: permErr } = await supabase.from('admin_permissions').upsert(
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
  email: string,
  permissions: Partial<AdminPermissionRecord>
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase उपलब्ध नहीं है।' };
  const { error } = await supabase
    .from('admin_permissions')
    .update(permissions)
    .eq('email', email)
    .eq('is_master_owner', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeSubAdmin(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase उपलब्ध नहीं है।' };
  try {
    await supabase.from('admins').delete().eq('email', email);
  } catch {
    // Ignore if absent
  }
  const { error } = await supabase
    .from('admin_permissions')
    .delete()
    .eq('email', email)
    .eq('is_master_owner', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
