import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useToast } from "../components/useToast";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const nextEmail = String(formData.get("email") || email).trim();
    const nextPassword = String(formData.get("password") || password);
    try {
      await login(nextEmail, nextPassword);
      showToast("Signed in.");
      nav(location.state?.from || "/dashboard", { replace: true });
    } catch (e2) {
      const message = e2?.response?.data?.message || "Login failed.";
      setErr(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="panel page-hero auth-hero">
        <p className="page-kicker">Access Control</p>
        <h1 className="page-title mt-3">Sign In To The Match Desk</h1>
        <p className="page-copy mt-4">
          Admins run tournaments, schedules, brackets, and results. Managers maintain clubs, rosters, and tournament participation.
        </p>

        <div className="page-metrics mt-8">
          <div className="hero-stat">
            <div className="hero-stat__label">Admin Role</div>
            <div className="hero-stat__value">Events</div>
            <div className="hero-stat__meta">Create tournaments, approve requests, generate schedules, and update results.</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Manager Role</div>
            <div className="hero-stat__value">Teams</div>
            <div className="hero-stat__meta">Own your club page, edit players, and request entry into tournaments.</div>
          </div>
        </div>
      </section>

      <div className="auth-panel-stack">
        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <form onSubmit={submit} className="panel space-y-4 p-6">
          <div>
            <p className="page-kicker">Credentials</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Login</h2>
          </div>
          <input
            className="input"
            type="email"
            name="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            name="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn-primary w-full" disabled={saving}>{saving ? "Signing in..." : "Login"}</button>
        </form>
      </div>
    </div>
  );
}
