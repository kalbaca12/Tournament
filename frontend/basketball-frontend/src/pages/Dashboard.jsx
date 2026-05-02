import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { teamsApi } from "../api/teams";
import { useAuth } from "../auth/useAuth";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";

function formatDateTime(value) {
  if (!value) return "No time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function matchTeam(match, side) {
  const relation = side === "home" ? "homeTeam" : "awayTeam";
  const snake = side === "home" ? "home_team" : "away_team";
  const id = side === "home" ? match.home_team_id : match.away_team_id;
  return match?.[relation]?.name || match?.[snake]?.name || (id ? `Team ${id}` : "TBD");
}

export default function Dashboard() {
  const { user, isAdmin, isManager, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [teamMatches, setTeamMatches] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const tournamentsRes = await tournamentsApi.list();
        const loadedTournaments = tournamentsRes.data || [];
        setTournaments(loadedTournaments);

        if (isAdmin) {
          const requestResults = await Promise.allSettled(
            loadedTournaments.slice(0, 8).map((tournament) => tournamentsApi.participationRequests(tournament.id)),
          );
          setPendingRequests(requestResults.flatMap((result) => (
            result.status === "fulfilled"
              ? (result.value.data || []).filter((request) => request.status === "pending")
              : []
          )));
        }

        if (isManager) {
          const myTeamRes = await teamsApi.mine().catch(() => ({ data: null }));
          setMyTeam(myTeamRes.data || null);
          if (myTeamRes.data?.id) {
            const matchesRes = await teamsApi.matches(myTeamRes.data.id).catch(() => ({ data: [] }));
            setTeamMatches(matchesRes.data || []);
          }

          const requestResults = await Promise.allSettled(
            loadedTournaments.slice(0, 8).map((tournament) => tournamentsApi.myParticipationRequests(tournament.id)),
          );
          setMyRequests(requestResults.flatMap((result) => (
            result.status === "fulfilled" ? (result.value.data || []) : []
          )));
        }
      } catch (error) {
        showToast(error?.response?.data?.message || error.message || "Failed to load dashboard.", "error");
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      load();
    } else {
      setLoading(false);
    }
  }, [isAdmin, isAuthenticated, isManager, showToast]);

  const activeTournaments = useMemo(
    () => tournaments.filter((tournament) => tournament.status !== "finished" && tournament.status !== "cancelled").slice(0, 5),
    [tournaments],
  );

  const upcomingMatches = useMemo(
    () =>
      [...teamMatches]
        .filter((match) => match.status !== "finished" && match.status !== "cancelled")
        .sort((a, b) => new Date(a.scheduled_at || "2999-01-01").getTime() - new Date(b.scheduled_at || "2999-01-01").getTime())
        .slice(0, 5),
    [teamMatches],
  );

  if (!isAuthenticated) {
    return (
      <div className="page-stack">
        <section className="panel page-hero">
          <p className="page-kicker">Dashboard</p>
          <h1 className="page-title mt-3">Sign in to manage tournaments</h1>
          <p className="page-copy mt-4">Public tournament pages are still available, but the dashboard is personalized for admins and managers.</p>
          <div className="mt-6">
            <Link to="/login" className="btn-primary">Login</Link>
          </div>
        </section>
      </div>
    );
  }

  if (loading) {
    return <Skeleton rows={4} />;
  }

  return (
    <div className="page-stack">
      <section className="panel page-hero">
        <p className="page-kicker">Dashboard</p>
        <h1 className="page-title mt-3">Welcome, {user?.name || user?.role}</h1>
        <p className="page-copy mt-4">
          Quick access to active tournaments, pending work, and the next matches that need attention.
        </p>

        <div className="page-metrics mt-8">
          <div className="hero-stat">
            <div className="hero-stat__label">Active tournaments</div>
            <div className="hero-stat__value">{activeTournaments.length}</div>
            <div className="hero-stat__meta">Events still open, published, or in progress.</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">{isAdmin ? "Pending requests" : "My team"}</div>
            <div className="hero-stat__value">{isAdmin ? pendingRequests.length : (myTeam ? "Ready" : "None")}</div>
            <div className="hero-stat__meta">{isAdmin ? "Teams waiting for review." : "Manager-owned club status."}</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Role</div>
            <div className="hero-stat__value">{user?.role}</div>
            <div className="hero-stat__meta">{user?.email}</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Active tournaments</h2>
              <p className="text-sm text-slate-500">Open a tournament desk to manage schedule, requests, standings, and PDF exports.</p>
            </div>
            <Link to="/tournaments" className="btn-secondary">View all</Link>
          </div>
          {activeTournaments.length === 0 ? (
            <EmptyState title="No active tournaments" description="Create or publish a tournament to make it appear here." />
          ) : (
            <div className="grid gap-2">
              {activeTournaments.map((tournament) => (
                <Link key={tournament.id} to={`/tournaments/${tournament.id}`} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-amber-300">
                  <div className="font-semibold text-slate-900">{tournament.name}</div>
                  <div className="text-sm text-slate-500">{tournament.format} · {tournament.status} · {tournament.start_date || "No start date"}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {isAdmin ? (
          <section className="panel space-y-3 p-5">
            <h2 className="text-xl font-semibold text-slate-900">Pending participation</h2>
            {pendingRequests.length === 0 ? (
              <EmptyState title="No pending requests" description="New team participation requests will appear here." />
            ) : (
              <div className="grid gap-2">
                {pendingRequests.slice(0, 6).map((request) => (
                  <Link key={request.id} to={`/tournaments/${request.tournament_id}`} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-amber-300">
                    <div className="font-semibold text-slate-900">{request.team?.name || `Team ${request.team_id}`}</div>
                    <div className="text-sm text-slate-500">Manager: {request.manager?.name || request.manager_id}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="panel space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">My team</h2>
                <p className="text-sm text-slate-500">Roster and upcoming match access for managers.</p>
              </div>
              {myTeam ? <Link to={`/teams/${myTeam.id}`} className="btn-secondary">Open team</Link> : <Link to="/teams/new" className="btn-primary">Create team</Link>}
            </div>
            {myTeam ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">{myTeam.name}</div>
                <div className="text-sm text-slate-500">{myTeam.city || "City not set"}</div>
              </div>
            ) : (
              <EmptyState title="No team yet" description="Create your team before requesting participation in tournaments." />
            )}
          </section>
        )}
      </div>

      {isManager && (
        <section className="panel space-y-3 p-5">
          <h2 className="text-xl font-semibold text-slate-900">Upcoming matches</h2>
          {upcomingMatches.length === 0 ? (
            <EmptyState title="No upcoming matches" description="Matches will appear after an admin generates or creates a schedule." />
          ) : (
            <div className="grid gap-2">
              {upcomingMatches.map((match) => (
                <Link key={match.id} to={`/matches/${match.id}`} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-amber-300">
                  <div className="font-semibold text-slate-900">{matchTeam(match, "home")} vs {matchTeam(match, "away")}</div>
                  <div className="text-sm text-slate-500">Round {match.round_number || "-"} · {formatDateTime(match.scheduled_at)} · {match.status}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {isManager && myRequests.length > 0 && (
        <section className="panel space-y-3 p-5">
          <h2 className="text-xl font-semibold text-slate-900">My participation requests</h2>
          <div className="grid gap-2">
            {myRequests.slice(0, 6).map((request) => (
              <div key={request.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">{request.team?.name || `Team ${request.team_id}`}</div>
                <div className="text-sm text-slate-500">Status: {request.status}</div>
                {request.note ? <div className="mt-1 text-sm text-slate-600">{request.note}</div> : null}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
