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
  const [demoMode, setDemoMode] = useState(false);

  const toggleDemoMode = useCallback((val) => {
    setDemoMode(typeof val === 'boolean' ? val : !demoMode);
  }, [demoMode]);

  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // Fetch profile — never throws, never hangs
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data || !data.tenant_id) {
        // Fallback: check tenant_members if user_profiles has no tenant_id
        try {
          const { data: memberData } = await supabase
            .from('tenant_members')
            .select('tenant_id, role')
            .eq('user_id', userId)
            .limit(1)
            .single();
          if (memberData && memberData.tenant_id) {
            var profileData = data || { id: userId };
            profileData.tenant_id = memberData.tenant_id;
            profileData.role = memberData.role || 'user';
            // Check if tenant is a CSP
            try {
              const { data: tenantData } = await supabase
                .from('tenants')
                .select('tenant_type, customer_type, entity_tier, aup_accepted, kyc_status, sms_enabled')
                .eq('id', memberData.tenant_id)
                .maybeSingle();
              if (tenantData) {
                profileData.tenant_type = tenantData.customer_type || tenantData.tenant_type;
                profileData.entity_tier = tenantData.entity_tier;
                profileData.aup_accepted = !!tenantData.aup_accepted;
                profileData.kyc_status = tenantData.kyc_status || 'unverified';
                profileData.sms_enabled = !!tenantData.sms_enabled;
              }
            } catch (ttErr) {}
            setProfile(profileData);
            return profileData;
          }
        } catch (mbErr) {
          console.warn('Member fallback error:', mbErr.message);
        }
        if (data) {
          setProfile(data);
          return data;
        }
        console.warn('Profile fetch error:', error ? error.message : 'no tenant_id');
        setProfile({ id: userId, role: 'user' });
        return null;
      }
      // Enrich profile with customer_type + entity_tier
      if (data && data.tenant_id && (!data.tenant_type || !data.entity_tier)) {
        try {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('tenant_type, customer_type, entity_tier, aup_accepted, kyc_status, sms_enabled')
            .eq('id', data.tenant_id)
            .maybeSingle();
          if (tenantData) {
            data.tenant_type = tenantData.customer_type || tenantData.tenant_type;
            data.entity_tier = tenantData.entity_tier;
            data.aup_accepted = !!tenantData.aup_accepted;
            data.kyc_status = tenantData.kyc_status || 'unverified';
            data.sms_enabled = !!tenantData.sms_enabled;
          }
        } catch (ttErr) {}
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
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true);
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
      // Fetch profile — await so isCSP is set before routing
    await fetchProfile(data.user.id);
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

  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordRecovery(false);
      return { error: null };
    } catch (err) {
      return { error: err.message };
    }
  };

  const isAuthenticated = !!user && !!session;
  const isNotificationOnly = profile?.role === 'notification_only';
  const isSuperAdmin = profile?.role === 'superadmin' || profile?.role === 'super_admin' || profile?.role === 'sp_admin';
  if (profile && profile.role) console.log('[Auth] role=' + profile.role + ' isSuperAdmin=' + (profile.role === 'superadmin' || profile.role === 'super_admin' || profile.role === 'sp_admin'));
  const isCSP = profile?.tenant_type === 'csp';
  const cspTenantId = isCSP ? profile?.tenant_id : null;
  const entityTier = profile?.entity_tier || null;
  const isMasterAgent = entityTier === 'master_agent';
  const isAgent = profile?.tenant_type === 'agent' && !isMasterAgent;

  return (
    <AuthContext.Provider value={{
      user, session, profile, setProfile, loading,
      demoMode, toggleDemoMode,
      signIn, signUp, signOut, resetPassword, updatePassword,
      authError, isAuthenticated, isNotificationOnly, isSuperAdmin, isCSP, cspTenantId,
      entityTier, isMasterAgent, isAgent, passwordRecovery,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
