import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { authService } from '../services';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true });

  useEffect(() => {
    let mounted = true;

    authService.getSession()
      .then(session => {
        if (!mounted) return;
        setState({ user: session?.user || null, session, loading: false });
      })
      .catch(error => {
        console.warn('Auth session bootstrap failed', error);
        if (!mounted) return;
        setState({ user: null, session: null, loading: false });
      });

    const { data: { subscription } } = authService.onAuthStateChange((_event, session) => {
      setState(prev => ({ ...prev, user: session?.user || null, session }));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn(email: string, password: string) {
    const { user, session } = await authService.signIn(email, password);
    setState(prev => ({ ...prev, user, session }));
  }

  async function handleSignUp(email: string, password: string) {
    const { user, session } = await authService.signUp(email, password);
    setState(prev => ({ ...prev, user: user || prev.user, session: session || prev.session }));
  }

  async function handleSignOut() {
    await authService.signOut();
    setState({ user: null, session: null, loading: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn: handleSignIn, signUp: handleSignUp, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
