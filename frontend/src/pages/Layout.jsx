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

  const isStaff = user.role === "OWNER" || user.role === "ADMIN";

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
    <div className="flex h-full bg-cloud">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
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
          <p className="mt-2 rounded bg-brand-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            {user.role}
          </p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
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