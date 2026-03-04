import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { teamsApi } from "../api/teams";

export default function TeamCreate() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", city: "" });
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const r = await teamsApi.create(form);
      nav(`/teams/${r.data.id}`);
    } catch (e2) {
      setErr(e2?.response?.data?.message || JSON.stringify(e2?.response?.data) || e2.message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Create team</h1>
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <form onSubmit={submit} className="panel space-y-4 p-5">
        <input
          className="input"
          placeholder="Team name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="input"
          placeholder="City"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <button className="btn-primary">Save team</button>
      </form>
    </div>
  );
}

