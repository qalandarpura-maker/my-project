import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { socket } from "../socket.js";

export default function Bots() {
  const [bots, setBots] = useState([]);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [editingGreeting, setEditingGreeting] = useState(null);
  const [greetingText, setGreetingText] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get("/owner/bots");
    setBots(data.bots || []);
  }, []);

  useEffect(() => {
    load();
    socket?.on("bots:update", load);
    return () => socket?.off("bots:update", load);
  }, [load]);

  async function add(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const { data } = await api.post("/owner/bots", { botToken: token });
      setMsg(`Bot add ho gaya: @${data.bot.botUsername}`);
      setToken("");
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Bot add nahi hua");
    }
  }

  async function toggle(bot) {
    await api.patch(`/owner/bots/${bot.id}/status`);
    load();
  }

  async function saveGreeting(bot) {
    await api.patch(`/owner/bots/${bot.id}/greeting`, { greeting: greetingText });
    setEditingGreeting(null);
    load();
  }

  async function remove(bot) {
    await api.delete(`/owner/bots/${bot.id}`);
    load();
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-6">
      <h1 className="bg-gradient-to-br from-brand to-lemon bg-clip-text text-2xl font-bold text-transparent">
        Telegram Bots
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        @BotFather se token lo aur yahan add karo. Customer in bots pe `{"/start"}`
        karega.
      </p>

      <form onSubmit={add} className="mt-4 flex gap-3 rounded-xl border border-lemon-soft bg-white p-4 shadow">
        <input
          placeholder="Bot token (BotFather se)..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lemon"
        />
        <button className="rounded-lg bg-gradient-to-br from-brand to-lemon px-5 py-2 text-sm font-semibold text-white hover:brightness-110">
          Add Bot
        </button>
      </form>
      {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-500">{err}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-lemon-soft bg-white shadow">
        {bots.map((b) => (
          <div key={b.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  @{b.botUsername}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      b.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {b.status}
                  </span>
                </p>
                <p className="text-xs text-slate-500">{b.customers} customers</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggle(b)}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  {b.status === "active" ? "Pause" : "Start"}
                </button>
                <button
                  onClick={() => remove(b)}
                  className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-2">
              {editingGreeting === b.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={greetingText}
                    onChange={(e) => setGreetingText(e.target.value)}
                    rows={3}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-lemon"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveGreeting(b)}
                      className="rounded-lg bg-gradient-to-br from-brand to-lemon px-3 py-1.5 text-sm text-white hover:brightness-110"
                    >
                      Save Greeting
                    </button>
                    <button
                      onClick={() => setEditingGreeting(null)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="flex-1 text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Greeting: </span>
                    {b.greeting || "(koi greeting nahi)"}
                  </p>
                  <button
                    onClick={() => {
                      setEditingGreeting(b.id);
                      setGreetingText(b.greeting || "");
                    }}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!bots.length && (
          <p className="p-4 text-sm text-slate-400">Abhi koi bot add nahi hai.</p>
        )}
      </div>
    </div>
  );
}