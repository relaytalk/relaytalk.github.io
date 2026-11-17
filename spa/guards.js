export function hasStoredSession() {
  try {
    return Boolean(
      localStorage.getItem('supabase.auth.token') ||
      sessionStorage.getItem('supabase.auth.token')
    );
  } catch (error) {
    console.warn('[RelayTalk] Session storage unavailable:', error);
    return false;
  }
}

export async function getCurrentSession() {
  try {
    const module = await import('../utils/supabase.js');

    if (typeof module.initializeSupabase !== 'function') {
      return null;
    }

    const client = await module.initializeSupabase();
    if (!client?.auth) return null;

    const { data, error } = await client.auth.getSession();

    if (error) throw error;
    return data?.session || null;
  } catch (error) {
    console.error('[RelayTalk] Session check failed:', error);
    return null;
  }
}

export async function requireSession(redirect = '/pages/login/') {
  const session = await getCurrentSession();

  if (!session) {
    window.RelayRouter?.navigate(redirect, { replace: true });
    return null;
  }

  return session;
}
