import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { socket } from "../socket.js";
import { useAuth } from "../context/AuthContext.jsx";
import ChatWindow from "./ChatWindow.jsx";

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
  const [listWidth, setListWidth] = useState(320);

  function startListResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev) => {
      const w = Math.min(640, Math.max(200, startW + ev.clientX - startX));
      setListWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/conversations");
        setCustomers(data.customers);
        if (data.customers.length) {
          const first = data.customers[0];
          const convo = await api.get(`/conversations/${first.id}`);
          setActiveId(first.id);
          setMessages(convo.data.messages);
          setActive(convo.data.customer);
        }
      } catch (e) {
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

    const onChatUpdate = (data) => {
      if (data.customerId === activeId) {
        if (data.messages?.length) setMessages((prev) => [...prev, ...data.messages]);
        if (data.notes?.length) setMessages((prev) => [...prev, ...data.notes]);
        if (data.customer && !activeId) setActive(data.customer);
      } else if (data.customerId && data.customer) {
        setCustomers((prev) => {
          const exists = prev.some((c) => c.id === data.customerId);
          if (exists) {
            return prev.map((c) =>
              c.id === data.customerId
                ? { ...c, lastMessage: data.messages?.at(-1)?.text ?? c.lastMessage, lastSender: data.messages?.at(-1)?.sender ?? c.lastSender }
                : c
            );
          }
          const merged = { ...data.customer, lastMessage: data.messages?.at(-1)?.text, lastSender: data.messages?.at(-1)?.sender };
          const withoutClosed = data.customer.status !== "closed";
          return withoutClosed ? [merged, ...prev] : prev;
        });
      }
      refreshCustomer(data.customerId, data.messages?.at(-1));
    };

    const onChatNew = (data) => {
      if (!data.customer) return;
      const merged = {
        ...data.customer,
        lastMessage: data.messages?.at(-1)?.text ?? "(no text)",
        lastSender: data.messages?.at(-1)?.sender,
      };
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === data.customer.id);
        if (exists) {
          return prev.map((c) => (c.id === data.customer.id ? { ...c, lastMessage: merged.lastMessage, lastSender: merged.lastSender, lastMessageAt: data.customer.lastMessageAt } : c)).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
        }
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

    socket.on("chat:update", onChatUpdate);
    socket.on("chat:new", onChatNew);
    socket.on("chat:updated", onChatUpdated);
    socket.on("conversation:assigned", onAssigned);
    socket.on("message:deleted", onMessageDeleted);

    return () => {
      socket.off("chat:update", onChatUpdate);
      socket.off("chat:new", onChatNew);
      socket.off("chat:updated", onChatUpdated);
      socket.off("conversation:assigned", onAssigned);
      socket.off("message:deleted", onMessageDeleted);
    };
  }, [activeId, refreshCustomer]);

  async function select(id) {
    const { data } = await api.get(`/conversations/${id}`);
    setActiveId(id);
    setMessages(data.messages);
    setActive(data.customer);
  }

  async function send(text) {
    if (!activeId) return;
    const { data } = await api.post(`/conversations/${activeId}/reply`, { text });
    setMessages((prev) => [...prev, data.message]);
  }

  async function sendMedia(file, caption = "") {
    if (!activeId || !file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (caption) fd.append("caption", caption);
    const { data } = await api.post(`/conversations/${activeId}/send-media`, fd);
    setMessages((prev) => [...prev, data.message]);
  }

  async function deleteMessage(messageId) {
    if (!activeId) return;
    if (!window.confirm("Kya aap ye message delete karna chahte hain?")) return;
    await api.delete(`/conversations/${activeId}/messages/${messageId}`);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  async function doAssign(e, files = []) {
    e?.preventDefault?.();
    if (!assignTarget) return;
    const fd = new FormData();
    fd.append("agentId", assignTarget);
    fd.append("note", assignNote);
    for (const f of files) fd.append("files", f);
    const { data } = await api.post(`/conversations/${activeId}/assign`, fd);
    setActive(data.customer);
    const notes = data.notes?.length ? data.notes : data.note ? [data.note] : [];
    if (notes.length) setMessages((prev) => [...prev, ...notes]);
    setAssignTarget("");
    setAssignNote("");
  }

  async function closeConvo() {
    if (!activeId) return;
    await api.post(`/conversations/${activeId}/close`);
  }

  function timeLabel(t) {
    return t ? new Date(t).toLocaleString() : "";
  }

  const sorted = [...customers].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

  return (
    <div className="flex h-full">
      <div
        className="flex flex-col border-r border-slate-200 bg-white"
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
                <span className="ml-2 whitespace-nowrap text-[10px] text-slate-400">
                  {timeLabel(c.lastMessageAt)}
                </span>
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
        className="w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition hover:bg-brand/50 active:bg-brand"
      />

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
        onSendMedia={sendMedia}
        onDeleteMessage={deleteMessage}
        myId={user?.id}
        isStaff={isStaff}
      />
    </div>
  );
}