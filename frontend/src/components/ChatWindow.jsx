import { useEffect, useRef, useState } from "react";

function BrokenImage({ type = "image" }) {
  return (
    <div className="mb-1 flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-xs text-red-500">
      {type === "image"
        ? "🖼 Image load nahi hui"
        : type === "video"
          ? "🎬 Video load nahi hua"
          : "📄 File load nahi hui"}
    </div>
  );
}

function MediaImage({ src, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <BrokenImage type="image" />;
  return (
    <img
      src={src}
      alt="image"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function MediaVideo({ src, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <BrokenImage type="video" />;
  return (
    <video
      src={src}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function fmtTime(t) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ m, onDelete, canDelete }) {
  if (m.sender === "note") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] rounded-xl border border-lemon/30 bg-lemon-soft px-4 py-2 text-sm text-slate-700 shadow-sm">
          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-lemon">
            📝 Note — sirf agent ko
          </p>
          {m.mediaType === "image" && m.mediaUrl && (
            <MediaImage src={m.mediaUrl} className="mb-1 max-h-64 max-w-full rounded-lg" />
          )}
          {m.mediaType === "video" && m.mediaUrl && (
            <MediaVideo src={m.mediaUrl} className="mb-1 max-h-64 max-w-full rounded-lg bg-black" />
          )}
          {m.mediaType === "document" && m.mediaUrl && (
            <a
              href={m.mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-1 flex items-center gap-1 text-xs underline text-lemon"
            >
              📄 {m.mediaUrl.split("/").pop()}
            </a>
          )}
          {m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
          <div className="mt-1 flex items-center justify-end gap-2">
            {canDelete && (
              <button
                onClick={onDelete}
                title="Delete message"
                className="text-slate-400 hover:text-brand"
              >
                🗑
              </button>
            )}
            <p className="text-[10px] text-slate-400">{fmtTime(m.createdAt)}</p>
          </div>
        </div>
      </div>
    );
  }

  const mine = m.sender !== "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="group relative max-w-[70%]">
        {canDelete && (
          <button
            onClick={onDelete}
            title="Delete message"
            className={`absolute -top-2 ${mine ? "-left-6" : "-right-6"} hidden rounded bg-white px-1 text-sm text-slate-500 shadow group-hover:block hover:text-red-500`}
          >
            🗑
          </button>
        )}
        <div
          className={`rounded-2xl px-4 py-2 text-sm shadow-sm ${
            mine
              ? "bg-gradient-to-br from-brand to-lemon text-white shadow-black/30"
              : "bg-white text-slate-800"
          }`}
        >
          {m.mediaType === "image" && m.mediaUrl && (
            <MediaImage src={m.mediaUrl} className="mb-1 max-h-64 max-w-full rounded-lg" />
          )}
          {m.mediaType === "video" && m.mediaUrl && (
            <MediaVideo src={m.mediaUrl} className="mb-1 max-h-64 max-w-full rounded-lg bg-black" />
          )}
          {m.mediaType === "document" && m.mediaUrl && (
            <a
              href={m.mediaUrl}
              target="_blank"
              rel="noreferrer"
              className={`mb-1 flex items-center gap-1 text-xs underline ${
                mine ? "text-white/85" : "text-slate-500"
              }`}
            >
              📄 {m.mediaUrl.split("/").pop()}
            </a>
          )}
          {m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
          <p
            className={`mt-1 text-right text-[10px] ${
              mine ? "text-white/60" : "text-slate-400"
            }`}
          >
            {fmtTime(m.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({
  active,
  messages,
  onSend,
  canAssign,
  agents,
  onAssign,
  assignTarget,
  setAssignTarget,
  assignNote,
  setAssignNote,
  onClose,
  onDismiss,
  onDeleteChat,
  onToggleNotes,
  mobileNotes,
  onSendMedia,
  onDeleteMessage,
  myId,
  isStaff,
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState([]);
  const [sending, setSending] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [forwardFiles, setForwardFiles] = useState([]);
  const [forwardDragging, setForwardDragging] = useState(false);
  const [notesWidth, setNotesWidth] = useState(320);
  const fileRef = useRef(null);
  const forwardFileRef = useRef(null);
  const msgListRef = useRef(null);
  const scrollRef = useRef(null);

  function startNotesResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = notesWidth;
    const onMove = (ev) => {
      const w = Math.min(640, Math.max(200, startW - (ev.clientX - startX)));
      setNotesWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // active conversation change hone par pending clear karo
  useEffect(() => {
    setPending([]);
    setText("");
    setForwardFiles([]);
  }, [active?.id]);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const forwardRef = useRef(forwardFiles);
  forwardRef.current = forwardFiles;

  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
      forwardRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, []);

  // Conversation open hone par last message pe scroll karo
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      scrollRef.current?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(raf);
  }, [active?.id]);

  // Naye messages aane par sirf bottom ke paas hoon to bottom par raho
  useEffect(() => {
    const el = msgListRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!active) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50">
        <p className="text-slate-400">Koi conversation select karo</p>
      </div>
    );
  }

  const notes = messages.filter((m) => m.sender === "note");

  function addFiles(files) {
    const imgs = [...files].filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (!imgs.length) return;
    setPending((prev) => [
      ...prev,
      ...imgs.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  }

  function removePending(id) {
    setPending((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  function addForwardFiles(files) {
    const imgs = [...files].filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (!imgs.length) return;
    setForwardFiles((prev) => [
      ...prev,
      ...imgs.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  }

  function removeForwardFile(id) {
    setForwardFiles((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  function onPasteForward(e) {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) {
      if (it.type.startsWith("image/") || it.type.startsWith("video/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addForwardFiles(files);
    }
  }

  function onDropForward(e) {
    e.preventDefault();
    setForwardDragging(false);
    if (e.dataTransfer?.files?.length) addForwardFiles(e.dataTransfer.files);
  }

  function submit(e) {
    e.preventDefault();
    if (sending) return;
    if (!pending.length && !text.trim()) return;
    setSending(true);
    (async () => {
      try {
        if (pending.length) {
          const attachments = [...pending];
          const caption = text.trim();
          let i = 0;
          for (const p of attachments) {
            await onSendMedia(p.file, i === 0 ? caption : "");
            i++;
          }
          setPending([]);
          setText("");
        } else if (text.trim()) {
          await onSend(text.trim());
          setText("");
        }
      } finally {
        setSending(false);
      }
    })();
  }

  function onPaste(e) {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) {
      if (it.type.startsWith("image/") || it.type.startsWith("video/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  function handleAdminAction(e) {
    const action = e.target.value;
    e.target.value = "";
    if (action === "close") onClose();
    else if (action === "delete") {
      if (window.confirm("Poora conversation delete karna hai? Yeh wapas nahi aayega.")) {
        onDeleteChat();
      }
    }
  }

  return (
    <div className="flex flex-1">
      <div className="flex flex-1 flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-800">
            {active.firstName || active.telegramUser || active.telegramId}
            {active.lastName ? ` ${active.lastName}` : ""}
          </h3>
          <p className="text-xs text-slate-500">
            {canAssign && (
              <>
                @{active.botUsername || "?"} ·{" "}
              </>
            )}
            {active.telegramUser ? `@${active.telegramUser}` : active.telegramId}
            {active.agentName ? ` · Agent: ${active.agentName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleNotes}
            title="Notes kholo/band karo"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 md:hidden"
          >
            📝
          </button>
          {isStaff ? (
            <select
              onChange={handleAdminAction}
              defaultValue=""
              title="Admin actions"
              className="rounded-lg border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100 focus:outline-none"
            >
              <option value="" disabled>
                ⋯
              </option>
              <option value="close">Close Chat</option>
              <option value="delete">Delete Chat</option>
            </select>
          ) : (
            <button
              onClick={onDismiss}
              title="Chat panel band karo (conversation close nahi hogi)"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div ref={msgListRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.filter((m) => m.sender !== "note").map((m) => (
          <MessageBubble
            key={m.id}
            m={m}
            onDelete={() => onDeleteMessage(m.id)}
            canDelete={
              isStaff || (m.sender === "agent" && m.senderUserId === myId)
            }
          />
        ))}
        <div ref={scrollRef} />
      </div>

      <form
        onSubmit={submit}
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={onDrop}
        className="relative border-t border-slate-200 bg-white p-3"
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-lemon bg-lemon-soft/90">
            <p className="text-sm font-semibold text-brand">
              📷 Images/Videos yahan drop karo
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {pending.map((p) => (
              <div key={p.id} className="relative shrink-0">
                {p.file.type.startsWith("video/") ? (
                  <video
                    src={p.preview}
                    muted
                    className="h-16 w-16 rounded-lg border border-slate-200 bg-black object-cover"
                  />
                ) : (
                  <img
                    src={p.preview}
                    alt="preview"
                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  title="Hatana"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow hover:bg-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files || []);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Image attach karo (drag-drop ya paste Ctrl+V)"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            🖼
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              pending.length
                ? "Images ke liye caption likho (optional)..."
                : "Reply likho (Enter se send)"
            }
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-lemon"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && !pending.length)}
            className="rounded-lg bg-gradient-to-br from-brand to-lemon px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {sending ? "Sending..." : pending.length ? `Send ${pending.length}` : "Send"}
          </button>
        </div>
      </form>
      </div>

      <div
        onMouseDown={startNotesResize}
        title="Drag karo: chota/bara"
        className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition hover:bg-brand/50 active:bg-brand md:block"
      />

      {mobileNotes && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileNotes(false)}
        />
      )}
      <aside
        className={`flex-col border-l border-slate-200 bg-white ${
          mobileNotes
            ? "fixed inset-y-0 right-0 z-50 flex w-80 shadow-xl"
            : "hidden"
        } md:static md:z-auto md:flex md:shadow-none`}
        style={{ width: mobileNotes ? undefined : notesWidth }}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">📝 Agent Notes</h3>
          <p className="text-[11px] text-slate-400">Sirf team ko dikhte hain (customer ko nahi)</p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {notes.map((m) => (
            <div key={m.id} className="rounded-lg border border-lemon/30 bg-lemon-soft p-3">
              {m.mediaType === "image" && m.mediaUrl && (
                <MediaImage src={m.mediaUrl} className="mb-2 max-h-52 w-full rounded-lg object-cover" />
              )}
              {m.mediaType === "video" && m.mediaUrl && (
                <MediaVideo src={m.mediaUrl} className="mb-2 max-h-52 w-full rounded-lg bg-black" />
              )}
              {m.mediaType === "document" && m.mediaUrl && (
                <a
                  href={m.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-2 flex items-center gap-1 text-xs underline text-lemon"
                >
                  📄 {m.mediaUrl.split("/").pop()}
                </a>
              )}
              {m.text ? (
                <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{m.text}</p>
              ) : null}
              <p className="mt-1 text-right text-[10px] text-slate-400">{fmtTime(m.createdAt)}</p>
            </div>
          ))}
          {!notes.length && (
            <p className="p-2 text-xs text-slate-400">Abhi koi note nahi.</p>
          )}
        </div>

        {canAssign && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!assignTarget || assigning) return;
              setAssigning(true);
              try {
                await onAssign(e, forwardFiles.map((f) => f.file));
                forwardFiles.forEach((f) => URL.revokeObjectURL(f.preview));
                setForwardFiles([]);
              } finally {
                setAssigning(false);
              }
            }}
            onPaste={onPasteForward}
            onDragOver={(e) => {
              e.preventDefault();
              setForwardDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setForwardDragging(false);
            }}
            onDrop={onDropForward}
            className="relative border-t border-slate-200 p-3"
          >
            {forwardDragging && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-lemon bg-lemon-soft/95">
                <p className="text-sm font-semibold text-brand">📷 Images/Videos yahan drop karo</p>
              </div>
            )}
            <p className="mb-2 text-xs font-semibold text-slate-500">Forward + Note</p>
            <select
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-lemon"
            >
              <option value="">Agent assign karo...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {forwardFiles.length > 0 && (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {forwardFiles.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    {p.file.type.startsWith("video/") ? (
                      <video
                        src={p.preview}
                        muted
                        className="h-12 w-12 rounded-lg border border-slate-200 bg-black object-cover"
                      />
                    ) : (
                      <img
                        src={p.preview}
                        alt="preview"
                        className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeForwardFile(p.id)}
                      title="Hatana"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow hover:bg-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              rows={2}
              placeholder="Note (optional) — image paste/drag bhi..."
              className="mb-2 w-full resize-none rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-lemon"
            />
            <div className="flex items-center gap-2">
              <input
                ref={forwardFileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => {
                  addForwardFiles(e.target.files || []);
                  if (forwardFileRef.current) forwardFileRef.current.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => forwardFileRef.current?.click()}
                title="Note ke sath image attach (drag-drop ya Ctrl+V paste)"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                🖼
              </button>
              <button
                type="submit"
                disabled={!assignTarget || assigning}
                className="flex-1 rounded-lg bg-gradient-to-br from-brand to-lemon px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
              >
                {assigning ? "Forwarding..." : `Forward${forwardFiles.length ? ` ${forwardFiles.length}` : ""}`}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}