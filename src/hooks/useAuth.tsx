import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User } from "firebase/auth";
import { subscribeToAuthState, getUserProfile } from "../services/auth";
import { UserProfile } from "../types/models";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const session = useRef({ uid: null as string | null, version: 0, request: 0, active: false });

  const refreshProfile = useCallback(async () => {
    const { uid, version, active } = session.current;
    if (!active || !uid) return;
    const request = ++session.current.request;
    const p = await getUserProfile(uid);
    // A late response must not restore a signed-out user's profile or replace
    // the result of a newer refresh (including a new login to the same account).
    if (session.current.active && session.current.version === version && session.current.request === request) {
      setProfile(p);
    }
  }, []);

  useEffect(() => {
    const currentSession = session.current;
    currentSession.active = true;
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      const version = ++session.current.version;
      session.current.uid = firebaseUser?.uid ?? null;
      setUser(firebaseUser);
      setProfile(null);
      if (firebaseUser) {
        setLoading(true);
        void refreshProfile().catch(() => {
          // Leave the profile unavailable; a failed read must not trap the
          // entire app on the authentication spinner. Manual refresh can retry.
        }).finally(() => {
          if (session.current.active && session.current.version === version) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
    return () => {
      currentSession.active = false;
      currentSession.version++;
      unsubscribe();
    };
  }, [refreshProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
