import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api } from "../api.js";
import { connectSocket, disconnectSocket } from "../socket.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const doLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    disconnectSocket();
    setUser(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem("token");
    const cachedUser = localStorage.getItem("user");

    async function validate() {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        if (mounted) {
          setUser(data.user);
          localStorage.setItem("user", JSON.stringify(data.user));
          connectSocket(token);
        }
      } catch (e) {
        doLogout();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    // Seed immediate user from cache for faster first render, then validate
    if (cachedUser && token) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch {}
    }

    validate();
    return () => {
      mounted = false;
    };
  }, [doLogout]);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    doLogout();
  }, [doLogout]);

  if (loading && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-cloud">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
