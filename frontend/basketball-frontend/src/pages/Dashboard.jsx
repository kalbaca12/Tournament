import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { teamsApi } from "../api/teams";
import { matchesApi } from "../api/matches";
import { useAuth } from "../auth/useAuth";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";

function formatDateTime(value) {
  if (!value) return "Time not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const directDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directDate) return directDate[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchTeam(match, side) {
  const relation = side === "home" ? "homeTeam" : "awayTeam";
  const snake = side === "home" ? "home_team" : "away_team";
  const id = side === "home" ? match.home_team_id : match.away_team_id;
  return match?.[relation]?.name || match?.[snake]?.name || (id ? `Team ${id}` : "TBD");
}

function tournamentStartLabel(tournament) {
  return Number(tournament.matches_count || 0) > 0 ? tournament.start_date || "not set" : "TBD";
}

export default function Dashboard() {
  const { user, isAdmin, isManager, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [teamMatches, setTeamMatches] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const tournamentsRes = await tournamentsApi.list();
        const matchesRes = await matchesApi.list().catch(() => ({ data: [] }));
        const loadedTournaments = tournamentsRes.data || [];
        setTournaments(loadedTournaments);
        setAllMatches(matchesRes.data || []);

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

  const todayMatches = useMemo(() => {
    const today = dateKey(new Date());
    return allMatches
      .filter((match) => dateKey(match.scheduled_at) === today)
      .slice(0, 6);
  }, [allMatches]);

  if (!isAuthenticated) {
    return (
      <div className="auth-gate panel">
        <div>
          <p className="page-kicker">Workspace</p>
          <h1 className="page-title mt-3">Log in to manage</h1>
          <p className="page-copy mt-4">Tournaments can be viewed publicly, but management requires an account.</p>
        </div>
        <Link to="/login" className="btn-primary">Login</Link>
      </div>
    );
  }

  if (loading) {
    return <Skeleton rows={4} />;
  }

  return (
    <div className="workbench">
      <aside className="workbench-rail panel">
        <p className="workbench-rail__eyebrow">Account</p>
        <h1>{user?.name || user?.role}</h1>
        <p>{user?.email}</p>

        <div className="workbench-rail__stats">
          <div><span>{activeTournaments.length}</span><small>active</small></div>
          <div><span>{todayMatches.length}</span><small>today</small></div>
          <div><span>{user?.role}</span><small>role</small></div>
        </div>

        <div className="workbench-rail__actions">
          <Link to="/tournaments" className="btn-secondary">Tournaments</Link>
          {isAdmin ? <Link to="/tournaments/new" className="btn-primary">New tournament</Link> : null}
          {isManager && !myTeam ? <Link to="/teams/new" className="btn-primary">New team</Link> : null}
        </div>
      </aside>

      <main className="workbench-main">
        <section className="work-section work-section--today">
          <div className="work-section__head">
            <div>
              <p>Today</p>
              <h2>Matches on the calendar</h2>
            </div>
            <Link to="/matches" className="btn-secondary">Calendar</Link>
          </div>
          {todayMatches.length === 0 ? (
            <EmptyState title="No matches today" description="All matches can be viewed on the calendar page." />
          ) : (
            <div className="dash-match-strip">
              {todayMatches.map((match) => (
                <Link key={match.id} to={`/matches/${match.id}`} className="dash-match-card">
                  <span>{match.tournament?.name || `Tournament #${match.tournament_id}`}</span>
                  <h3>{matchTeam(match, "home")} vs {matchTeam(match, "away")}</h3>
                  <p>{formatDateTime(match.scheduled_at)} / {match.status}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="work-section">
          <div className="work-section__head">
            <div>
              <p>Tournaments</p>
              <h2>Active work</h2>
            </div>
            <Link to="/tournaments" className="btn-secondary">All</Link>
          </div>
          {activeTournaments.length === 0 ? (
            <EmptyState title="No active tournaments" description="Published or newly created tournaments will appear here." />
          ) : (
            <div className="work-card-grid">
              {activeTournaments.map((tournament) => (
                <Link key={tournament.id} to={`/tournaments/${tournament.id}`} className="dash-tournament-card">
                  <span>{tournament.format}</span>
                  <h3>{tournament.name}</h3>
                  <div>
                    <b>{tournament.status}</b>
                    <small>{tournamentStartLabel(tournament)} - {tournament.end_date || "not set"}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {isAdmin ? (
          <section className="work-section">
            <div className="work-section__head">
              <div>
                <p>Requests</p>
                <h2>Waiting for review</h2>
              </div>
            </div>
            {pendingRequests.length === 0 ? (
              <EmptyState title="No pending requests" description="New team requests will appear here." />
            ) : (
              <div className="work-card-grid">
                {pendingRequests.slice(0, 6).map((request) => (
                  <Link key={request.id} to={`/tournaments/${request.tournament_id}`} className="work-card">
                    <span>pending</span>
                    <h3>{request.team?.name || `Team ${request.team_id}`}</h3>
                    <p>Manager: {request.manager?.name || request.manager_id}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="work-section">
            <div className="work-section__head">
              <div>
                <p>Team</p>
                <h2>My roster</h2>
              </div>
              {myTeam ? <Link to={`/teams/${myTeam.id}`} className="btn-secondary">Open</Link> : <Link to="/teams/new" className="btn-primary">Create</Link>}
            </div>
            {myTeam ? (
              <div className="work-card-grid">
                <Link to={`/teams/${myTeam.id}`} className="work-card">
                  <span>{myTeam.city || "city not set"}</span>
                  <h3>{myTeam.name}</h3>
                  <p>Team page and players</p>
                </Link>
              </div>
            ) : (
              <EmptyState title="No team yet" description="Create a team before sending tournament requests." />
            )}
          </section>
        )}

        {isManager && (
          <section className="work-section">
            <div className="work-section__head">
              <div>
                <p>Matches</p>
                <h2>Upcoming</h2>
              </div>
            </div>
            {upcomingMatches.length === 0 ? (
              <EmptyState title="No matches" description="They will appear after an administrator generates the schedule." />
            ) : (
              <div className="work-card-grid">
                {upcomingMatches.map((match) => (
                  <Link key={match.id} to={`/matches/${match.id}`} className="work-card">
                    <span>{match.status}</span>
                    <h3>{matchTeam(match, "home")} vs {matchTeam(match, "away")}</h3>
                    <p>Round {match.round_number || "-"} / {formatDateTime(match.scheduled_at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {isManager && myRequests.length > 0 && (
          <section className="work-section">
            <div className="work-section__head">
              <div>
                <p>Requests</p>
                <h2>My submissions</h2>
              </div>
            </div>
            <div className="work-card-grid">
              {myRequests.slice(0, 6).map((request) => (
                <div key={request.id} className="work-card">
                  <span>{request.status}</span>
                  <h3>{request.team?.name || `Team ${request.team_id}`}</h3>
                  {request.note ? <p>{request.note}</p> : <p>No notes</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
