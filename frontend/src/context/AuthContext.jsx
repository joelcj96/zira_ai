import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthToken } from "../api/client";

const AuthContext = createContext(null);
const TOKEN_KEY = "zira_ai_token";
const USER_KEY = "zira_ai_user";
const LEGACY_TOKEN_KEY = "agentcj_token";
const LEGACY_USER_KEY = "agentcj_user";

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(
    localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || ""
  );
  const [user, setUser] = useState(
    localStorage.getItem(USER_KEY)
      ? JSON.parse(localStorage.getItem(USER_KEY))
      : localStorage.getItem(LEGACY_USER_KEY)
      ? JSON.parse(localStorage.getItem(LEGACY_USER_KEY))
      : null
  );

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const syncUserSession = async () => {
      try {
        const { data } = await api.get("/user/me");
        setUser(data);
        localStorage.setItem(USER_KEY, JSON.stringify(data));
        localStorage.removeItem(LEGACY_USER_KEY);
      } catch {
        setToken("");
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
        setAuthToken("");
      }
    };

    syncUserSession();
  }, [token]);

  const saveSession = (sessionToken, sessionUser) => {
    setToken(sessionToken);
    setUser(sessionUser);
    localStorage.setItem(TOKEN_KEY, sessionToken);
    localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
    setAuthToken(sessionToken);
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    saveSession(data.token, data.user);
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    saveSession(data.token, data.user);
  };

  const googleLogin = async (email, name) => {
    const { data } = await api.post("/auth/google", {
      email,
      name,
      googleToken: `mock_google_${Date.now()}`
    });
    saveSession(data.token, data.user);
  };

  const refreshUser = async () => {
    if (!token) return;
    const { data } = await api.get("/user/me");
    setUser(data);
    localStorage.setItem(USER_KEY, JSON.stringify(data));
    localStorage.removeItem(LEGACY_USER_KEY);
  };

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
    setAuthToken("");
  };

  const value = useMemo(
    () => ({
      token,
      user,
      isPro:
        user?.entitlements?.plan === "pro" ||
        user?.subscriptionPlan === "pro" ||
        (user?.subscriptionPlan === "pro" && ["active", "trialing"].includes(user?.subscriptionStatus)),
      login,
      register,
      googleLogin,
      refreshUser,
      logout
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
