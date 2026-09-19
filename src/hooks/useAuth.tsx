import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User } from "firebase/auth";
import { subscribeToAuthState, subscribeToUserProfile, getUserProfile } from "../services/auth";
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
    let unsubscribeProfile: (() => void) | undefined;
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      const version = ++session.current.version;
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      session.current.uid = firebaseUser?.uid ?? null;
      setUser(firebaseUser);
      setProfile(null);
      if (firebaseUser) {
        setLoading(true);
        // Auth may fire before signUp writes the profile. Keep listening after
        // a missing snapshot so that successful creation reaches the UI.
        unsubscribeProfile = subscribeToUserProfile(firebaseUser.uid, (nextProfile) => {
          if (!currentSession.active || currentSession.version !== version) return;
          currentSession.request++;
          setProfile(nextProfile);
          setLoading(false);
        }, () => {
          if (!currentSession.active || currentSession.version !== version) return;
          currentSession.request++;
          setProfile(null);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
    return () => {
      currentSession.active = false;
      currentSession.version++;
      unsubscribeProfile?.();
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
