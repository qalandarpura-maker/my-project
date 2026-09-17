import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

export default function UserManager({ title, listUrl, createUrl, deleteUrl }) {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get(listUrl);
    setUsers(data.users || []);
  }, [listUrl]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.post(createUrl, { name, username, password });
      setMsg(`${title.slice(0, -1)} ban gaya: ${username}`);
      setName(""); setUsername(""); setPassword("");
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Kuch ghalat hua");
    }
  }

  async function remove(id) {
    await api.delete(`${deleteUrl}/${id}`);
    load();
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-6">
      <h1 className="bg-gradient-to-br from-brand to-lemon bg-clip-text text-2xl font-bold text-transparent">
        {title}
      </h1>

      <form onSubmit={create} className="mt-4 rounded-xl border border-lemon-soft bg-white p-4 shadow">
        <div className="grid grid-cols-4 gap-3">
          <input
            placeholder="Naam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lemon"
          />
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lemon"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lemon"
          />
          <button className="rounded-lg bg-gradient-to-br from-brand to-lemon px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
            Create
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
        {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-lemon-soft bg-white shadow">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">{u.name}</p>
              <p className="text-xs text-slate-500">@{u.username}</p>
            </div>
            <button
              onClick={() => remove(u.id)}
              className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        ))}
        {!users.length && (
          <p className="p-4 text-sm text-slate-400">Abhi koi user nahi hai.</p>
        )}
      </div>
    </div>
  );
}