import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(() => {
    const stored = localStorage.getItem('engwx_demo_mode');
    return stored !== null ? stored === 'true' : false; // default to live
  });
  const [authError, setAuthError] = useState(null);

  // Toggle demo mode
  const toggleDemoMode = useCallback((enabled) => {
    setDemoMode(enabled);
    localStorage.setItem('engwx_demo_mode', String(enabled));
  }, []);

  // Fetch user profile from user_profiles table
  const fetchProfile = useCallback(async (userId) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()
        .abortSignal(controller.signal);

      clearTimeout(timeout);
      if (error) throw error;
      setProfile(data);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('Profile fetch timed out');
      } else {
        console.error('Error fetching profile:', err);
      }
      // Set a minimal profile so the app doesn't hang
      setProfile({ id: userId, role: 'user' });
      return null;
    }
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    let mounted = true;

    // Get initial session with timeout
    const initAuth = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          fetchProfile(s.user.id);
        }
      } catch (err) {
        console.error('Auth init error:', err);
      }
      if (mounted) setLoading(false);
    };

    // Force loading to false after 3 seconds no matter what
    const safetyTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 3000);

    initAuth();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);

        if (event === 'SIGNED_IN' && s?.user) {
          await fetchProfile(s.user.id);
        }
        if (event === 'SIGNED_OUT') {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ─── Auth Methods ───────────────────────────────────────────────────────

  const signUp = async ({ email, password, fullName, companyName }) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
          },
        },
      });
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      setAuthError(err.message);
      return { data: null, error: err.message };
    }
  };

  const signIn = async ({ email, password }) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      setAuthError(err.message);
      return { data: null, error: err.message };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out error:', error);
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (email) => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      return { error: null };
    } catch (err) {
      setAuthError(err.message);
      return { error: err.message };
    }
  };

  const updateProfile = async (updates) => {
    if (!user) return { error: 'Not authenticated' };
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────

  const isSuperAdmin = profile?.role === 'superadmin';
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;
  const isAuthenticated = !!user && !!session;

  const value = {
    // State
    user,
    profile,
    session,
    loading,
    demoMode,
    authError,
    // Auth methods
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    // Demo
    toggleDemoMode,
    // Helpers
    isSuperAdmin,
    isAdmin,
    isAuthenticated,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
