import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { socket } from "../socket.js";
import { useAuth } from "../context/AuthContext.jsx";
import ChatWindow from "./ChatWindow.jsx";

const MIN_LIST_WIDTH = 200;
const MAX_LIST_WIDTH = 640;
const LIST_WIDTH_KEY = "inbox-list-width";

function mergeMessages(prev, incoming) {
  const seen = new Set(prev.map((m) => m.id));
  const fresh = (incoming || []).filter((m) => m && !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

export default function ChatWorkspace({ agentView = false }) {
  const { user } = useAuth();
  const isStaff = user && (user.role === "OWNER" || user.role === "ADMIN");
  const [customers, setCustomers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [listWidth, setListWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(LIST_WIDTH_KEY);
      return saved ? Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, parseInt(saved, 10))) : 320;
    } catch {
      return 320;
    }
  });
  const listWidthRef = useRef(listWidth);
  const [error, setError] = useState(null);
  const [mobileNotes, setMobileNotes] = useState(false);

  function startListResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidthRef.current;
    const onMove = (ev) => {
      const w = Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, startW + ev.clientX - startX));
      listWidthRef.current = w;
      setListWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem(LIST_WIDTH_KEY, String(listWidthRef.current));
      } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const { data } = await api.get("/conversations");
        setCustomers(data.customers);
        if (data.customers.length) {
          const first = data.customers[0];
          await select(first.id, { skipMarkRead: false });
        }
      } catch (e) {
        setError("Conversations load nahi ho saki.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    if (!agentView) {
      api.get("/staff/agents").then(({ data }) => setAgents(data.users || []));
    }
  }, [agentView]);

  const refreshCustomer = useCallback(
    (customerId, newMsg) => {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customerId
            ? {
                ...c,
                lastMessage: newMsg?.text ?? c.lastMessage,
                lastSender: newMsg?.sender ?? c.lastSender,
                lastMessageAt: newMsg?.createdAt ?? c.lastMessageAt,
              }
            : c
        )
      );
    },
    []
  );

  useEffect(() => {
    if (!socket) return;

    const bumpUnread = (customerId, incomingSender) => {
      if (customerId === activeId) return;
      if (incomingSender !== "customer") return;
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customerId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
        )
      );
    };

    const onChatUpdate = (data) => {
      if (data.customerId === activeId) {
        if (data.messages?.length) setMessages((prev) => mergeMessages(prev, data.messages));
        if (data.notes?.length) setMessages((prev) => mergeMessages(prev, data.notes));
      } else if (data.customerId && data.customer) {
        const incoming = data.messages?.at(-1);
        setCustomers((prev) => {
          const exists = prev.some((c) => c.id === data.customerId);
          if (exists) {
            return prev.map((c) =>
              c.id === data.customerId
                ? {
                    ...c,
                    lastMessage: incoming?.text ?? c.lastMessage,
                    lastSender: incoming?.sender ?? c.lastSender,
                    unreadCount:
                      c.id === activeId
                        ? 0
                        : incoming?.sender === "customer"
                        ? (c.unreadCount || 0) + 1
                        : c.unreadCount || 0,
                  }
                : c
            );
          }
          const merged = {
            ...data.customer,
            lastMessage: incoming?.text,
            lastSender: incoming?.sender,
            unreadCount: data.customer.id === activeId ? 0 : data.customer.unreadCount || 0,
          };
          return data.customer.status !== "closed" ? [merged, ...prev] : prev;
        });
      }
      bumpUnread(data.customerId, data.messages?.at(-1)?.sender);
      refreshCustomer(data.customerId, data.messages?.at(-1));
    };

    const onChatNew = (data) => {
      if (!data.customer) return;
      const incoming = data.messages?.at(-1);
      const isCustomerMessage = incoming?.sender === "customer";
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === data.customer.id);
        if (exists) {
          return prev
            .map((c) =>
              c.id === data.customer.id
                ? {
                    ...c,
                    lastMessage: incoming?.text ?? "(no text)",
                    lastSender: incoming?.sender,
                    lastMessageAt: data.customer.lastMessageAt,
                    unreadCount:
                      c.id === activeId
                        ? 0
                        : isCustomerMessage
                        ? (c.unreadCount || 0) + 1
                        : c.unreadCount || 0,
                  }
                : c
            )
            .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
        }
        const merged = {
          ...data.customer,
          lastMessage: incoming?.text ?? "(no text)",
          lastSender: incoming?.sender,
          unreadCount: data.customer.id === activeId ? 0 : data.customer.unreadCount || 0,
        };
        return [merged, ...prev];
      });
    };

    const onChatUpdated = (data) => {
      if (data.customer) {
        if (data.customer.id === activeId) setActive(data.customer);
        setCustomers((prev) =>
          prev.map((c) => (c.id === data.customer.id ? { ...c, ...data.customer } : c))
        );
      }
    };

    const onAssigned = (data) => {
      if (data.customer) {
        setCustomers((prev) => {
          const exists = prev.some((c) => c.id === data.customer.id);
          if (exists) {
            return prev.map((c) => (c.id === data.customer.id ? { ...c, ...data.customer } : c));
          }
          return [data.customer, ...prev];
        });
      }
    };

    const onUnassigned = (data) => {
      if (agentView && data.customerId) {
        setCustomers((prev) => prev.filter((c) => c.id !== data.customerId));
        if (activeId === data.customerId) {
          setActiveId(null);
          setActive(null);
          setMessages([]);
        }
      }
    };

    const onMessageDeleted = (data) => {
      if (data.customerId === activeId) {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      }
      if (data.customer) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === data.customer.id
              ? {
                  ...c,
                  lastMessage: data.customer.lastMessage,
                  lastSender: data.customer.lastSender,
                  lastMessageAt: data.customer.lastMessageAt,
                }
              : c
          )
        );
      }
    };

    const onConversationDeleted = (data) => {
      if (data.customerId) {
        setCustomers((prev) => prev.filter((c) => c.id !== data.customerId));
        if (activeId === data.customerId) {
          setMobileNotes(false);
          setActiveId(null);
          setActive(null);
          setMessages([]);
        }
      }
    };

    socket.on("chat:update", onChatUpdate);
    socket.on("chat:new", onChatNew);
    socket.on("chat:updated", onChatUpdated);
    socket.on("conversation:assigned", onAssigned);
    socket.on("conversation:unassigned", onUnassigned);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("conversation:deleted", onConversationDeleted);

    return () => {
      socket.off("chat:update", onChatUpdate);
      socket.off("chat:new", onChatNew);
      socket.off("chat:updated", onChatUpdated);
      socket.off("conversation:assigned", onAssigned);
      socket.off("conversation:unassigned", onUnassigned);
      socket.off("message:deleted", onMessageDeleted);
      socket.off("conversation:deleted", onConversationDeleted);
    };
  }, [activeId, refreshCustomer, agentView]);

  async function select(id, options = {}) {
    try {
      const { data } = await api.get(`/conversations/${id}`);
      setActiveId(id);
      setMessages(data.messages);
      setActive(data.customer);
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      if (!options.skipMarkRead) {
        await api.post(`/conversations/${id}/read`).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function send(text) {
    if (!activeId) return;
    try {
      const { data } = await api.post(`/conversations/${activeId}/reply`, { text });
      setMessages((prev) => mergeMessages(prev, [data.message]));
    } catch (e) {
      alert(e.response?.data?.error || "Reply fail");
    }
  }

  async function sendMedia(file, caption = "") {
    if (!activeId || !file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (caption) fd.append("caption", caption);
      const { data } = await api.post(`/conversations/${activeId}/send-media`, fd);
      setMessages((prev) => mergeMessages(prev, [data.message]));
    } catch (e) {
      alert(e.response?.data?.error || "Media send fail");
    }
  }

  async function deleteMessage(messageId) {
    if (!activeId) return;
    if (!window.confirm("Kya aap ye message delete karna chahte hain?")) return;
    try {
      await api.delete(`/conversations/${activeId}/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      alert(e.response?.data?.error || "Delete fail");
    }
  }

  async function doAssign(e, files = []) {
    e?.preventDefault?.();
    if (!assignTarget) return;
    const fd = new FormData();
    fd.append("agentId", assignTarget);
    fd.append("note", assignNote);
    for (const f of files) fd.append("files", f);
    try {
      const { data } = await api.post(`/conversations/${activeId}/assign`, fd);
      setActive(data.customer);
      const notes = data.notes?.length ? data.notes : data.note ? [data.note] : [];
      if (notes.length) setMessages((prev) => mergeMessages(prev, notes));
      setAssignTarget("");
      setAssignNote("");
    } catch (e) {
      alert(e.response?.data?.error || "Assign fail");
    }
  }

  async function closeConvo() {
    if (!activeId) return;
    try {
      await api.post(`/conversations/${activeId}/close`);
      setCustomers((prev) => prev.filter((c) => c.id !== activeId));
      setActiveId(null);
      setActive(null);
      setMessages([]);
    } catch (e) {
      alert(e.response?.data?.error || "Close fail");
    }
  }

  async function deleteChat() {
    if (!activeId) return;
    try {
      await api.delete(`/conversations/${activeId}`);
      setCustomers((prev) => prev.filter((c) => c.id !== activeId));
      setActiveId(null);
      setActive(null);
      setMessages([]);
    } catch (e) {
      alert(e.response?.data?.error || "Delete fail");
    }
  }

  function dismissChat() {
    setMobileNotes(false);
    setActiveId(null);
    setActive(null);
    setMessages([]);
  }

  function timeLabel(t) {
    return t ? new Date(t).toLocaleString() : "";
  }

  const sorted = [...customers].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

  return (
    <div className="relative flex h-full overflow-hidden">
      <div
        className={`${activeId ? "hidden" : "flex"} md:flex flex-col border-r border-slate-200 bg-white`}
        style={{ width: listWidth }}
      >
        <div className="bg-gradient-to-br from-brand to-lemon px-4 py-3">
          <h2 className="text-lg font-semibold text-white">
            {agentView ? "My Chats" : "Inbox"}
          </h2>
          <p className="text-xs text-white/85">
            {sorted.length} active {sorted.length === 1 ? "chat" : "chats"}
          </p>
        </div>
        {error && <p className="bg-red-50 p-2 text-xs text-red-600">{error}</p>}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-slate-500">Loading...</p>}
          {sorted.map((c) => (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                activeId === c.id ? "bg-brand-soft" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-semibold text-slate-800">
                  {c.firstName || c.telegramUser || c.telegramId}
                </span>
                <div className="ml-2 flex items-center gap-1.5">
                  {(c.unreadCount || 0) > 0 && (
                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  )}
                  <span className="whitespace-nowrap text-[10px] text-slate-400">
                    {timeLabel(c.lastMessageAt)}
                  </span>
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {c.lastSender === "agent" ? "→ " : ""}
                  {c.lastMessage || (c.status === "closed" ? "(closed)" : "Start kar diya")}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    c.status === "assigned"
                      ? "bg-green-100 text-green-700"
                      : c.status === "closed"
                      ? "bg-slate-100 text-slate-500"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {c.status === "assigned"
                    ? c.agentName || "assigned"
                    : c.status === "closed"
                    ? "closed"
                    : "new"}
                </span>
              </div>
              {c.botUsername && (
                <div className="mt-0.5 text-[10px] text-brand">@{c.botUsername}</div>
              )}
            </button>
          ))}
          {!loading && !sorted.length && (
            <p className="p-4 text-sm text-slate-400">Abhi koi conversation nahi hai.</p>
          )}
        </div>
      </div>

      <div
        onMouseDown={startListResize}
        title="Drag karo: chota/bara"
        className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition hover:bg-brand/50 active:bg-brand md:block"
      />

      <div className={`${activeId ? "flex" : "hidden"} md:flex flex-1`}>
        <ChatWindow
          active={active}
          messages={messages}
          onSend={send}
          canAssign={!agentView}
          agents={agents}
          onAssign={doAssign}
          assignTarget={assignTarget}
          setAssignTarget={setAssignTarget}
          assignNote={assignNote}
          setAssignNote={setAssignNote}
          onClose={closeConvo}
          onDismiss={dismissChat}
          onDeleteChat={deleteChat}
          onToggleNotes={() => setMobileNotes((o) => !o)}
          mobileNotes={mobileNotes}
          onSendMedia={sendMedia}
          onDeleteMessage={deleteMessage}
          myId={user?.id}
          isStaff={isStaff}
        />
      </div>
    </div>
  );
}