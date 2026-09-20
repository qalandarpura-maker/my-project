import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api.js";
import { socket } from "../socket.js";

function Item({ to, children, end, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative block rounded-lg px-4 py-2.5 text-sm font-medium transition ${
          isActive
            ? "bg-gradient-to-br from-brand to-lemon text-white shadow-md shadow-lemon/30"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        }`
      }
    >
      {children}
      {badge ? (
        <span className="absolute right-2 top-1/2 flex h-5 min-w-[1.25rem] -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("nav-collapsed") === "1"
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const isStaff = user.role === "OWNER" || user.role === "ADMIN";

  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggleNav() {
    if (isMobile) {
      setDrawerOpen((o) => !o);
    } else {
      setCollapsed((c) => {
        localStorage.setItem("nav-collapsed", c ? "0" : "1");
        return !c;
      });
    }
  }

  useEffect(() => {
    async function fetchUnread() {
      try {
        const { data } = await api.get("/conversations/unread-count");
        setUnread(data.count || 0);
      } catch {
        setUnread(0);
      }
    }
    fetchUnread();
    if (!socket) return;
    const events = ["chat:new", "chat:update", "chat:updated", "conversation:assigned", "conversation:unassigned", "message:deleted"];
    const handler = () => fetchUnread();
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
  }, []);

  return (
    <div className="relative flex h-full bg-cloud">
      <button
        onClick={toggleNav}
        title="Sidebar kholo/band karo"
        className={`${
          collapsed || (isMobile && !drawerOpen) ? "" : "hidden"
        } fixed left-3 top-3 z-50 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-md transition hover:bg-slate-100`}
      >
        ☰
      </button>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={`flex-col border-r border-slate-200 bg-white ${
          drawerOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-64 shadow-2xl md:hidden"
            : collapsed
              ? "hidden"
              : "w-64 md:flex"
        }`}
      >
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/wolf-logo.png"
                alt="Wolf Bots"
                className="h-16 w-16 rounded-xl shadow-md shadow-slate-300"
              />
              <div>
                <p className="bg-gradient-to-br from-brand to-lemon bg-clip-text text-xl font-bold text-transparent">
                  Wolf Bots
                </p>
                <p className="text-xs text-slate-400">{user.name}</p>
              </div>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg border border-slate-200 p-1.5 text-sm text-slate-500 hover:bg-slate-100 md:hidden"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 rounded bg-brand-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            {user.role}
          </p>
        </div>
        <nav onClick={() => setDrawerOpen(false)} className="flex-1 space-y-1 p-3">
          {isStaff ? (
            <>
              <Item to="/inbox" badge={unread}>Inbox</Item>
              <Item to="/agents">Agents</Item>
            </>
          ) : (
            <Item to="/my-chats" badge={unread}>My Chats</Item>
          )}
          {user.role === "OWNER" && (
            <>
              <Item to="/admins">Admins</Item>
              <Item to="/bots">Bots</Item>
            </>
          )}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-600 transition hover:bg-brand hover:text-white"
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-hidden bg-cloud">
        <Outlet />
      </main>
    </div>
  );
}