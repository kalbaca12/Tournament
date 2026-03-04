import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { useAuth } from "../auth/useAuth";

export default function TournamentsList() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tournamentsApi
      .list()
      .then((res) => setItems(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Tournaments</h1>
          <p className="text-sm text-slate-500">Create tournaments, add teams, and manage schedules.</p>
        </div>

        {isAdmin ? (
          <Link to="/tournaments/new" className="btn-primary">
            + Create tournament
          </Link>
        ) : (
          <div className="text-xs text-slate-500">Login as admin to create/edit tournaments.</div>
        )}
      </div>

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-500">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-slate-500">
            No tournaments yet. {isAdmin ? "Use Create tournament." : "Ask an admin to create one."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {items.map((t) => (
              <li key={t.id} className="p-5 transition hover:bg-slate-50">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{t.name}</div>
                    <div className="text-sm text-slate-500">
                      {t.start_date} {"->"} {t.end_date} | {t.format} | {t.status}
                    </div>
                  </div>

                  <Link to={`/tournaments/${t.id}`} className="btn-secondary">
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

