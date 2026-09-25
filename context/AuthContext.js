import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// On native, only refresh the session token while the app is in the foreground
// (Supabase's React Native guidance). The web client handles this itself.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

const NOT_SET_UP_MESSAGE = "This account isn't set up yet. Please contact your coach.";

// A signed-in user must be a coach or have a linked athlete row to use the app.
async function loadAccount(userId) {
  const [coachResult, athleteResult] = await Promise.all([
    supabase.from('coaches').select('user_id, display_name').eq('user_id', userId).maybeSingle(),
    supabase.from('athletes').select('id, name, tier, level').eq('user_id', userId).maybeSingle(),
  ]);
  if (coachResult.error) throw coachResult.error;
  if (athleteResult.error) throw athleteResult.error;
  const athlete = athleteResult.data;
  if (coachResult.data) return { role: 'coach', name: coachResult.data.display_name, athlete };
  if (athlete) return { role: 'athlete', name: athlete.name, athlete };
  return null;
}

function friendlyAuthError(error) {
  if (error?.code === 'invalid_credentials') return 'Email or password is incorrect.';
  if (error?.code === 'same_password') return 'Choose a password different from your current one.';
  if (error?.code === 'weak_password') return 'That password is too weak. Try a longer one.';
  return error?.message || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  // 'loading' | 'signedOut' | 'ready' | 'error'
  const [status, setStatus] = useState('loading');
  const [notice, setNotice] = useState(null);
  // Whose account is loaded, so a repeated SIGNED_IN (e.g. a web tab regaining
  // focus) doesn't reload it and reset navigation.
  const loadedUserId = useRef(null);

  const refreshAccount = useCallback(async (currentSession) => {
    if (!currentSession) {
      loadedUserId.current = null;
      setAccount(null);
      setStatus('signedOut');
      return;
    }
    try {
      const loaded = await loadAccount(currentSession.user.id);
      if (!loaded) {
        setNotice(NOT_SET_UP_MESSAGE);
        await supabase.auth.signOut();
        return;
      }
      loadedUserId.current = currentSession.user.id;
      setAccount(loaded);
      setStatus('ready');
    } catch {
      setAccount(null);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      refreshAccount(data.session);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      // Token refreshes and password changes don't change who is signed in.
      const sameUser = nextSession?.user.id === loadedUserId.current;
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && !sameUser)) {
        setStatus(nextSession ? 'loading' : 'signedOut');
        // Don't await Supabase calls inside this callback (it can deadlock the client).
        setTimeout(() => refreshAccount(nextSession), 0);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [refreshAccount]);

  const signIn = useCallback(async (email, password) => {
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendlyAuthError(error) : null;
  }, []);

  const signOut = useCallback(async () => {
    setNotice(null);
    await supabase.auth.signOut();
  }, []);

  const changePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error ? friendlyAuthError(error) : null;
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    refreshAccount(session);
  }, [refreshAccount, session]);

  const value = useMemo(
    () => ({ session, account, status, notice, signIn, signOut, changePassword, retry }),
    [session, account, status, notice, signIn, signOut, changePassword, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
