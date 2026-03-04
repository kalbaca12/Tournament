import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { teamsApi } from "../api/teams";
import { useAuth } from "../auth/useAuth";

export default function TeamsList() {
  const { isManager } = useAuth();
  const [items, setItems] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const listRes = await teamsApi.list();
        setItems(listRes.data);
      } catch (e) {
        setErr(e?.response?.data?.message || e.message);
      }

      if (isManager) {
        try {
          const myRes = await teamsApi.mine();
          setMyTeam(myRes.data || null);
        } catch {
          setMyTeam(null);
        }
      }
    };

    load();
  }, [isManager]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Teams</h1>
          <p className="text-sm text-slate-500">Create teams and maintain team details.</p>
        </div>
        {isManager ? (
          <div className="flex items-center gap-2">
            {myTeam ? (
              <Link to={`/teams/${myTeam.id}`} className="btn-secondary">Edit my team</Link>
            ) : (
              <Link to="/teams/new" className="btn-primary">Create team</Link>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Login as manager to create/edit teams.</div>
        )}
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="grid gap-3">
        {items.map((t) => (
          <Link key={t.id} to={`/teams/${t.id}`} className="panel p-4 transition hover:border-sky-300 hover:shadow-md">
            <div className="font-semibold text-slate-900">{t.name}</div>
            <div className="text-sm text-slate-500">{t.city || "No city"}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

