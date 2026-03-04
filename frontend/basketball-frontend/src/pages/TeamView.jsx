import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { teamsApi } from "../api/teams";
import { playersApi } from "../api/players";
import { useAuth } from "../auth/useAuth";

function formatDateTime(value) {
  if (!value) return "No time";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function resolveTeamName(matchRow, side) {
  const relationCamel = side === "home" ? "homeTeam" : "awayTeam";
  const relationSnake = side === "home" ? "home_team" : "away_team";
  const idKey = side === "home" ? "home_team_id" : "away_team_id";

  return (
    matchRow?.[relationCamel]?.name ||
    matchRow?.[relationSnake]?.name ||
    (matchRow?.[idKey] ? `Team ${matchRow[idKey]}` : "TBD")
  );
}

export default function TeamView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isManager, user } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState({ name: "", city: "" });
  const [newPlayer, setNewPlayer] = useState({ first_name: "", last_name: "", jersey_number: "" });
  const [editRows, setEditRows] = useState({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canManageTeam = useMemo(() => {
    if (!isManager || !team || !user) return false;
    return Number(team.manager_id) === Number(user.id);
  }, [isManager, team, user]);

  const groupedMatches = useMemo(() => {
    const bucket = {};
    for (const m of matches) {
      const dayKey = m.scheduled_at ? m.scheduled_at.slice(0, 10) : "Unscheduled";
      if (!bucket[dayKey]) bucket[dayKey] = [];
      bucket[dayKey].push(m);
    }
    return Object.entries(bucket).sort(([a], [b]) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [matches]);

  const load = useCallback(async () => {
    const [teamRes, playersRes, matchesRes] = await Promise.all([
      teamsApi.get(id),
      playersApi.list(id),
      teamsApi.matches(id),
    ]);

    setTeam(teamRes.data);
    setForm({
      name: teamRes.data?.name || "",
      city: teamRes.data?.city || "",
    });
    setPlayers(playersRes.data || []);
    setMatches(matchesRes.data || []);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setErr(e?.response?.data?.message || e.message));
  }, [load]);

  const save = async () => {
    if (!canManageTeam) return;
    setErr("");
    setSaving(true);
    try {
      const res = await teamsApi.update(id, form);
      setTeam({ ...team, ...res.data });
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!canManageTeam) return;
    setErr("");
    try {
      await teamsApi.remove(id);
      nav("/teams");
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const addPlayer = async () => {
    if (!canManageTeam) return;
    setErr("");
    try {
      await playersApi.create({
        team_id: Number(id),
        first_name: newPlayer.first_name,
        last_name: newPlayer.last_name,
        jersey_number: newPlayer.jersey_number === "" ? null : Number(newPlayer.jersey_number),
      });
      setNewPlayer({ first_name: "", last_name: "", jersey_number: "" });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const startEditPlayer = (p) => {
    setEditRows((prev) => ({
      ...prev,
      [p.id]: {
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        jersey_number: p.jersey_number ?? "",
      },
    }));
  };

  const savePlayer = async (playerId) => {
    if (!canManageTeam) return;
    const row = editRows[playerId];
    if (!row) return;

    setErr("");
    try {
      await playersApi.update(playerId, {
        first_name: row.first_name,
        last_name: row.last_name,
        jersey_number: row.jersey_number === "" ? null : Number(row.jersey_number),
      });

      setEditRows((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const deletePlayer = async (playerId) => {
    if (!canManageTeam) return;
    setErr("");
    try {
      await playersApi.remove(playerId);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>;
  if (!team) return <div className="text-slate-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Team details</h1>
        <p className="text-sm text-slate-500">Team ID: {team.id}</p>
      </div>

      {!canManageTeam && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Read-only mode. Only this team's manager can edit team and players.
        </div>
      )}

      <div className="panel space-y-4 p-5">
        <input
          className="input"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          disabled={!canManageTeam}
        />
        <input
          className="input"
          placeholder="City"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          disabled={!canManageTeam}
        />

        {canManageTeam && (
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button onClick={remove} className="btn-danger">Delete team</button>
          </div>
        )}
      </div>

      <div className="panel space-y-4 p-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Players</h2>
          <p className="text-sm text-slate-500">Roster for this team.</p>
        </div>

        {canManageTeam && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <input
              className="input"
              placeholder="First name"
              value={newPlayer.first_name}
              onChange={(e) => setNewPlayer({ ...newPlayer, first_name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Last name"
              value={newPlayer.last_name}
              onChange={(e) => setNewPlayer({ ...newPlayer, last_name: e.target.value })}
            />
            <input
              className="input"
              type="number"
              min={0}
              max={99}
              placeholder="Jersey"
              value={newPlayer.jersey_number}
              onChange={(e) => setNewPlayer({ ...newPlayer, jersey_number: e.target.value })}
            />
            <button onClick={addPlayer} className="btn-primary">Add player</button>
          </div>
        )}

        <div className="grid gap-2">
          {players.map((p) => {
            const row = editRows[p.id];
            const isEditing = Boolean(row);

            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                {!isEditing ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900">{p.first_name} {p.last_name}</div>
                      <div className="text-sm text-slate-500">Jersey #{p.jersey_number ?? "-"}</div>
                    </div>
                    {canManageTeam && (
                      <div className="flex gap-2">
                        <button onClick={() => startEditPlayer(p)} className="btn-secondary">Edit</button>
                        <button onClick={() => deletePlayer(p.id)} className="btn-danger">Delete</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <input
                      className="input"
                      value={row.first_name}
                      onChange={(e) => setEditRows((prev) => ({ ...prev, [p.id]: { ...prev[p.id], first_name: e.target.value } }))}
                    />
                    <input
                      className="input"
                      value={row.last_name}
                      onChange={(e) => setEditRows((prev) => ({ ...prev, [p.id]: { ...prev[p.id], last_name: e.target.value } }))}
                    />
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={99}
                      value={row.jersey_number}
                      onChange={(e) => setEditRows((prev) => ({ ...prev, [p.id]: { ...prev[p.id], jersey_number: e.target.value } }))}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => savePlayer(p.id)} className="btn-primary">Save</button>
                      <button
                        onClick={() => setEditRows((prev) => {
                          const next = { ...prev };
                          delete next[p.id];
                          return next;
                        })}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {players.length === 0 && <div className="text-sm text-slate-500">No players yet.</div>}
        </div>
      </div>

      <div className="panel space-y-3 p-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Matches</h2>
          <p className="text-sm text-slate-500">Matches for this team, grouped by day.</p>
        </div>

        {groupedMatches.length === 0 ? (
          <div className="text-sm text-slate-500">No matches yet.</div>
        ) : (
          <div className="space-y-2">
            {groupedMatches.map(([day, list]) => (
              <div key={day} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{day}</div>
                <div className="grid gap-1.5">
                  {list.map((m) => (
                    <Link key={m.id} to={`/matches/${m.id}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-2 transition hover:border-sky-300">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">#{m.id} • R{m.round_number ?? "-"} • {m.status}</span>
                        <span>{formatDateTime(m.scheduled_at)}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        {resolveTeamName(m, "home")} vs {resolveTeamName(m, "away")}
                      </div>
                      <div className="text-xs text-slate-500">
                        Tournament: {m.tournament?.name || `#${m.tournament_id}`}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
