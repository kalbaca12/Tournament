import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      await login(email, password);
      nav(location.state?.from || "/", { replace: true });
    } catch (e2) {
      setErr(e2?.response?.data?.message || "Login failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Login</h1>
      <p className="text-sm text-slate-500">Admin manages tournaments. Manager manages teams.</p>
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <form onSubmit={submit} className="panel space-y-4 p-5">
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn-primary" disabled={saving}>{saving ? "Signing in..." : "Login"}</button>
      </form>

      <div className="panel p-4 text-sm text-slate-600">
        <div className="font-semibold text-slate-800">Demo credentials</div>
        <pre className="mt-2 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-800">
admin@example.com    admin123
manager@example.com  manager123
manager1@example.com manager123
manager2@example.com manager123
manager3@example.com manager123
manager4@example.com manager123
        </pre>
      </div>
    </div>
  );
}

