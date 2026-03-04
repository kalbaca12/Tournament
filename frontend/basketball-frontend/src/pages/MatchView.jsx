import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { matchesApi } from "../api/matches";
import { useAuth } from "../auth/useAuth";

export default function MatchView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [match, setMatch] = useState(null);
  const [stats, setStats] = useState([]);
  const [err, setErr] = useState("");

  const [result, setResult] = useState({ home_score: "", away_score: "" });
  const [meta, setMeta] = useState({ scheduled_at: "", status: "scheduled" });

  const resolveTeamName = (matchRow, side) => {
    const idKey = side === "home" ? "home_team_id" : "away_team_id";
    const camelRelation = side === "home" ? "homeTeam" : "awayTeam";
    const snakeRelation = side === "home" ? "home_team" : "away_team";
    const teamId = matchRow?.[idKey];

    return matchRow?.[camelRelation]?.name || matchRow?.[snakeRelation]?.name || teamId;
  };

  const load = async () => {
    const [mRes, sRes] = await Promise.all([matchesApi.get(id), matchesApi.stats(id)]);
    setMatch(mRes.data);
    setStats(sRes.data);
    setMeta({
      scheduled_at: mRes.data?.scheduled_at ? mRes.data.scheduled_at.slice(0, 16) : "",
      status: mRes.data?.status || "scheduled",
    });
  };

  useEffect(() => {
    load().catch((e) => setErr(e?.response?.data?.message || e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveMeta = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await matchesApi.update(id, {
        scheduled_at: meta.scheduled_at || null,
        status: meta.status,
      });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const saveResult = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await matchesApi.setResult(id, {
        home_score: Number(result.home_score),
        away_score: Number(result.away_score),
      });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const remove = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await matchesApi.remove(id);
      if (match?.tournament_id) {
        nav(`/tournaments/${match.tournament_id}`);
        return;
      }
      nav("/tournaments");
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>;
  if (!match) return <div className="text-slate-500">Loading...</div>;

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Read-only mode. Login as admin to edit matches.
        </div>
      )}

      <div className="panel p-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Match #{match.id}</h1>
        <div className="mt-1 text-sm text-slate-500">
          {resolveTeamName(match, "home")} vs {resolveTeamName(match, "away")} | Status: {match.status}
        </div>
        {match?.tournament_id && (
          <div className="mt-3">
            <button onClick={() => nav(`/tournaments/${match.tournament_id}`)} className="btn-secondary">
              Go to tournament
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="panel space-y-3 p-5">
          <div className="font-semibold text-slate-800">Match info</div>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="input"
              type="datetime-local"
              value={meta.scheduled_at}
              onChange={(e) => setMeta({ ...meta, scheduled_at: e.target.value })}
            />
            <select
              className="input"
              value={meta.status}
              onChange={(e) => setMeta({ ...meta, status: e.target.value })}
            >
              <option value="scheduled">scheduled</option>
              <option value="live">live</option>
              <option value="finished">finished</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={saveMeta} className="btn-secondary">Save info</button>
            <button onClick={remove} className="btn-danger">Delete match</button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="panel space-y-3 p-5">
          <div className="font-semibold text-slate-800">Set result</div>
          <div className="grid gap-2 md:grid-cols-3">
            <input
              className="input"
              placeholder="Home score"
              value={result.home_score}
              onChange={(e) => setResult({ ...result, home_score: e.target.value })}
            />
            <input
              className="input"
              placeholder="Away score"
              value={result.away_score}
              onChange={(e) => setResult({ ...result, away_score: e.target.value })}
            />
            <button onClick={saveResult} className="btn-primary">Save result</button>
          </div>
        </div>
      )}

      <div className="panel p-5">
        <div className="mb-2 font-semibold text-slate-800">Stats</div>
        {stats.length === 0 ? (
          <div className="text-sm text-slate-500">No stats yet.</div>
        ) : (
          <div className="grid gap-2">
            {stats.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                Player {s.player_id} | PTS {s.points} | REB {s.rebounds} | AST {s.assists}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

