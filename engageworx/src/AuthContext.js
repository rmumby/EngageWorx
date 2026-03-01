import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [demoMode, setDemoMode] = useState(true);

  const toggleDemoMode = useCallback((val) => {
    setDemoMode(typeof val === 'boolean' ? val : !demoMode);
  }, [demoMode]);

  // Fetch profile — never throws, never hangs
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('Profile fetch error:', error.message);
        setProfile({ id: userId, role: 'user' });
        return null;
      }
      setProfile(data);
      return data;
    } catch (err) {
      console.warn('Profile fetch failed:', err.message);
      setProfile({ id: userId, role: 'user' });
      return null;
    }
  }, []);

  // Init auth on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (s?.user) {
          setSession(s);
          setUser(s.user);
          await fetchProfile(s.user.id);
        }
      } catch (err) {
        console.warn('Auth init error:', err.message);
      }
      if (mounted) setLoading(false);
    };

    // Safety: force loading off after 3s
    const safety = setTimeout(() => { if (mounted) setLoading(false); }, 3000);

    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (event === 'SIGNED_IN' && s?.user) {
          fetchProfile(s.user.id); // Don't await — let it run in background
        }
        if (event === 'SIGNED_OUT') {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ─── Auth Methods ─────────────────────────────────────────────

  const signIn = async ({ email, password }) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Manually set user/session immediately so we don't wait for onAuthStateChange
      setUser(data.user);
      setSession(data.session);
      // Fetch profile in background
      fetchProfile(data.user.id);
      return { data, error: null };
    } catch (err) {
      setAuthError(err.message);
      return { data: null, error: err.message };
    }
  };

  const signUp = async ({ email, password, fullName, companyName }) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, company_name: companyName } },
      });
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      setAuthError(err.message);
      return { data: null, error: err.message };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const resetPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      return { error: null };
    } catch (err) {
      return { error: err.message };
    }
  };

  const isAuthenticated = !!user && !!session;
  const isSuperAdmin = profile?.role === 'superadmin';

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading,
      demoMode, toggleDemoMode,
      signIn, signUp, signOut, resetPassword,
      authError, isAuthenticated, isSuperAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
