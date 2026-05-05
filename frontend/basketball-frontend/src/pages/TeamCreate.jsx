import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { teamsApi } from "../api/teams";
import { useToast } from "../components/useToast";

export default function TeamCreate() {
  const nav = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: "", city: "", logo_url: "" });
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);
    const liveForm = {
      ...form,
      name: String(formData.get("name") || form.name),
      city: String(formData.get("city") || form.city),
      logo_url: String(formData.get("logo_url") || form.logo_url),
    };

    if (!liveForm.name.trim()) {
      setFieldErrors({ name: "Team name is required." });
      return;
    }

    setSaving(true);
    try {
      const r = await teamsApi.create({
        ...liveForm,
        logo_url: liveForm.logo_url.trim() || null,
      });
      showToast("Team created.");
      nav(`/teams/${r.data.id}`);
    } catch (e2) {
      const message = e2?.response?.data?.message || JSON.stringify(e2?.response?.data) || e2.message;
      setErr(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="panel page-hero">
        <p className="page-kicker">Manager Desk</p>
        <h1 className="page-title mt-3">Create Team</h1>
        <p className="page-copy mt-4">
          Register your club identity first, then build the roster and start applying to tournaments from the team page.
        </p>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <form onSubmit={submit} className="panel space-y-4 p-6" noValidate>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Team name</label>
          <input
            className="input"
            name="name"
            placeholder="Team name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {fieldErrors.name ? <div className="text-sm text-red-600">{fieldErrors.name}</div> : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">City</label>
          <input
            className="input"
            name="city"
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Logo URL</label>
          <input
            className="input"
            name="logo_url"
            placeholder="https://..."
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          />
        </div>
        <button className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save team"}</button>
      </form>
    </div>
  );
}
