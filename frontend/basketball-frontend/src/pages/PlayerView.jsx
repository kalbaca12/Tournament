import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { playersApi } from "../api/players";
import { teamsApi } from "../api/teams";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";

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

export default function PlayerView() {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [matches, setMatches] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadPlayer = async () => {
      try {
        const playerRes = await playersApi.get(id);
        const matchesRes = playerRes.data?.team_id
          ? await teamsApi.matches(playerRes.data.team_id)
          : { data: [] };

        if (cancelled) return;
        setPlayer(playerRes.data);
        setMatches(matchesRes.data || []);
      } catch (error) {
        if (!cancelled) setErr(error?.response?.data?.message || error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPlayer();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const recentMatches = useMemo(
    () => [...matches]
      .sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0))
      .slice(0, 8),
    [matches],
  );

  if (loading) return <Skeleton rows={4} />;
  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>;
  if (!player) return <EmptyState title="Player not found" description="This player could not be loaded." />;

  const fullName = `${player.first_name || ""} ${player.last_name || ""}`.trim() || `Player ${player.id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center gap-4">
          {player.photo_url ? (
            <img className="player-profile-photo" src={player.photo_url} alt={fullName} />
          ) : null}
          <div className="min-w-0">
            <p className="page-kicker">Player Profile</p>
            <h1 className="page-title mt-2 text-3xl">{fullName}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="list-tag">#{player.jersey_number ?? "-"}</span>
              {player.team ? <Link to={`/teams/${player.team_id}`} className="list-tag">{player.team.name}</Link> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Recent matches</h2>
          <p className="text-sm text-slate-500">Matches for this player's team.</p>
        </div>

        {recentMatches.length === 0 ? (
          <EmptyState title="No matches yet" description="This player's team has no matches yet." />
        ) : (
          <div className="grid gap-2">
            {recentMatches.map((match) => (
              <Link key={match.id} to={`/matches/${match.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-sky-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">
                    {resolveTeamName(match, "home")} vs {resolveTeamName(match, "away")}
                  </div>
                  <span className="list-tag">{match.status}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {formatDateTime(match.scheduled_at)} · Tournament: {match.tournament?.name || `#${match.tournament_id}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
