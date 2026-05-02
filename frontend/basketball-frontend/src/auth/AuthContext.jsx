import { useEffect, useMemo, useState } from "react";
import { authApi } from "../api/auth";
import { AuthContext } from "./AuthContextValue";

export function AuthProvider({ children }) {
  const hasToken = Boolean(localStorage.getItem("auth_token"));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(hasToken);

  useEffect(() => {
    if (!hasToken) {
      return;
    }

    authApi
      .me()
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("auth_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [hasToken]);

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    localStorage.setItem("auth_token", res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Still clear the local session if the token is already expired server-side.
    } finally {
      localStorage.removeItem("auth_token");
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      isManager: user?.role === "manager",
      login,
      logout,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
