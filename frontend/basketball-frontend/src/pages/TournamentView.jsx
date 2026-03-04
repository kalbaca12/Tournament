import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { teamsApi } from "../api/teams";
import { playersApi } from "../api/players";
import { useAuth } from "../auth/useAuth";

function roundLabel(matchCount) {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semifinals";
  if (matchCount === 4) return "Quarterfinals";
  if (matchCount === 8) return "Round of 16";
  return `Round (${matchCount} matches)`;
}

function formatDateTime(value) {
  if (!value) return "No time";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function isoWeekToMonday(weekValue) {
  const [yearPart, weekPart] = weekValue.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);

  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);

  if (day <= 4) {
    monday.setUTCDate(simple.getUTCDate() - day + 1);
  } else {
    monday.setUTCDate(simple.getUTCDate() + 8 - day);
  }

  return monday;
}

function dateToIsoWeek(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";

  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  const week = String(weekNo).padStart(2, "0");
  return `${target.getUTCFullYear()}-W${week}`;
}

function calcDurationWeeks(startDateValue, endDateValue) {
  if (!startDateValue || !endDateValue) return 1;
  const start = new Date(`${startDateValue}T00:00:00Z`);
  const end = new Date(`${endDateValue}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  const diffDays = Math.floor((end - start) / 86400000) + 1;
  return Math.max(1, Math.ceil(diffDays / 7));
}

function addWeeks(date, weeksToAdd) {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + (weeksToAdd * 7));
  return out;
}

export default function TournamentView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin, isManager } = useAuth();

  const [t, setT] = useState(null);
  const [teams, setTeams] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [feasibility, setFeasibility] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);

  const [teamToAdd, setTeamToAdd] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    start_date: "",
    end_date: "",
    format: "round_robin",
    status: "draft",
    max_teams: "",
    registration_deadline: "",
  });
  const [newMatch, setNewMatch] = useState({
    home_team_id: "",
    away_team_id: "",
    round_number: 1,
    scheduled_at: "",
  });
  const [startWeek, setStartWeek] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("1");
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedTeamName, setSelectedTeamName] = useState("");
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [err, setErr] = useState("");

  const teamNameById = useMemo(
    () =>
      teams.reduce((acc, tm) => {
        if (tm?.team_id && tm?.team?.name) {
          acc[tm.team_id] = tm.team.name;
        }
        return acc;
      }, {}),
    [teams],
  );

  const resolveTeamName = (matchRow, side) => {
    const idKey = side === "home" ? "home_team_id" : "away_team_id";
    const camelRelation = side === "home" ? "homeTeam" : "awayTeam";
    const snakeRelation = side === "home" ? "home_team" : "away_team";
    const teamId = matchRow?.[idKey];

    return (
      matchRow?.[camelRelation]?.name ||
      matchRow?.[snakeRelation]?.name ||
      teamNameById[teamId] ||
      null
    );
  };

  const load = useCallback(async () => {
    setErr("");

    const baseCalls = [
      tournamentsApi.get(id),
      tournamentsApi.teams(id),
      tournamentsApi.matches(id),
      tournamentsApi.feasibility(id),
    ];

    if (isAdmin) {
      baseCalls.push(teamsApi.list());
      baseCalls.push(tournamentsApi.participationRequests(id));
    }

    if (isManager) {
      baseCalls.push(teamsApi.mine());
      baseCalls.push(tournamentsApi.myParticipationRequests(id));
    }

    const responses = await Promise.all(baseCalls);
    const [tRes, teamRes, matchesRes, feasibilityRes] = responses;

    setT(tRes.data);
    setEditForm({
      name: tRes.data?.name || "",
      start_date: tRes.data?.start_date || "",
      end_date: tRes.data?.end_date || "",
      format: tRes.data?.format || "round_robin",
      status: tRes.data?.status || "draft",
      max_teams: tRes.data?.max_teams || "",
      registration_deadline: tRes.data?.registration_deadline || "",
    });
    setStartWeek(dateToIsoWeek(tRes.data?.start_date || ""));
    setDurationWeeks(String(tRes.data?.duration_weeks || calcDurationWeeks(tRes.data?.start_date, tRes.data?.end_date)));
    setTeams(teamRes.data);
    setMatches(matchesRes.data);
    setFeasibility(feasibilityRes.data);

    let index = 4;
    if (isAdmin) {
      setAllTeams(responses[index].data);
      index += 1;
      setAdminRequests(responses[index].data);
      index += 1;
    } else {
      setAllTeams([]);
      setAdminRequests([]);
    }

    if (isManager) {
      setMyTeam(responses[index].data || null);
      index += 1;
      setMyRequests(responses[index].data || []);
    } else {
      setMyTeam(null);
      setMyRequests([]);
    }
  }, [id, isAdmin, isManager]);

  useEffect(() => {
    load().catch((e) => setErr(e?.response?.data?.message || e.message));
  }, [load]);

  const saveTournament = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      const weekValue = startWeek || dateToIsoWeek(editForm.start_date);
      if (!weekValue) {
        setErr("Please select a start week.");
        return;
      }

      const monday = isoWeekToMonday(weekValue);
      const duration = Math.max(1, Number(durationWeeks) || 1);
      const endSunday = new Date(monday);
      endSunday.setUTCDate(monday.getUTCDate() + duration * 7 - 1);
      const registrationDeadline = new Date(monday);
      registrationDeadline.setUTCDate(monday.getUTCDate() - 1);

      const res = await tournamentsApi.update(id, {
        ...editForm,
        start_date: formatUtcDate(monday),
        end_date: formatUtcDate(endSunday),
        duration_weeks: duration,
        registration_deadline: formatUtcDate(registrationDeadline),
        max_teams: editForm.max_teams ? Number(editForm.max_teams) : null,
      });
      setT(res.data);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const deleteTournament = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await tournamentsApi.remove(id);
      nav("/tournaments");
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const lockParticipants = async () => {
    if (!isAdmin) return;
    try {
      await tournamentsApi.lockParticipants(id);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const unlockParticipants = async () => {
    if (!isAdmin) return;
    try {
      await tournamentsApi.unlockParticipants(id);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const requestParticipation = async () => {
    if (!isManager) return;
    try {
      await tournamentsApi.requestParticipation(id, myTeam?.id ? { team_id: myTeam.id } : {});
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const approveRequest = async (requestId) => {
    if (!isAdmin) return;
    try {
      await tournamentsApi.approveRequest(requestId);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const rejectRequest = async (requestId) => {
    if (!isAdmin) return;
    try {
      await tournamentsApi.rejectRequest(requestId, {});
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const addTeam = async () => {
    if (!isAdmin || !teamToAdd) return;
    setErr("");
    try {
      await tournamentsApi.addTeam(id, { team_id: Number(teamToAdd) });
      setTeamToAdd("");
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const removeTeam = async (teamId) => {
    if (!isAdmin) return;
    setErr("");
    try {
      await tournamentsApi.removeTeam(id, teamId);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const generate = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await tournamentsApi.generateSchedule(id);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const clear = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await tournamentsApi.clearSchedule(id);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const createMatch = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await tournamentsApi.createMatch(id, {
        home_team_id: Number(newMatch.home_team_id),
        away_team_id: Number(newMatch.away_team_id),
        round_number: Number(newMatch.round_number) || 1,
        scheduled_at: newMatch.scheduled_at || null,
      });
      setNewMatch({ home_team_id: "", away_team_id: "", round_number: 1, scheduled_at: "" });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message);
    }
  };

  const openTeamPlayers = async (teamId, teamName) => {
    if (!teamId) return;

    if (selectedTeamId === teamId) {
      setSelectedTeamId(null);
      setSelectedTeamName("");
      setTeamPlayers([]);
      return;
    }

    setSelectedTeamId(teamId);
    setSelectedTeamName(teamName || `Team ${teamId}`);
    setPlayersLoading(true);
    try {
      const res = await playersApi.list(teamId);
      setTeamPlayers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTeamPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  };

  const myPendingRequest = myRequests.find((r) => r.status === "pending");
  const previewMonday = startWeek ? isoWeekToMonday(startWeek) : null;
  const previewSunday = previewMonday ? new Date(previewMonday) : null;
  const previewEndWeekMonday = previewMonday ? addWeeks(previewMonday, Math.max(1, Number(durationWeeks) || 1) - 1) : null;
  const previewEndWeek = previewEndWeekMonday ? dateToIsoWeek(formatUtcDate(previewEndWeekMonday)) : "";
  if (previewSunday) {
    previewSunday.setUTCDate(previewMonday.getUTCDate() + (Math.max(1, Number(durationWeeks) || 1) * 7) - 1);
  }

  const sortedMatches = useMemo(
    () =>
      [...matches].sort((a, b) => {
        const aRound = Number(a.round_number || 0);
        const bRound = Number(b.round_number || 0);
        if (aRound !== bRound) return aRound - bRound;
        const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return a.id - b.id;
      }),
    [matches],
  );

  const playoffMatches = sortedMatches.filter((m) => m.stage === "playoffs" || m.stage === "playoff");
  const dayListMatches = sortedMatches.filter((m) => m.stage !== "playoffs" && m.stage !== "playoff");

  const groupedByDay = useMemo(() => {
    const bucket = {};
    for (const m of dayListMatches) {
      const dayKey = m.scheduled_at ? m.scheduled_at.slice(0, 10) : "Unscheduled";
      if (!bucket[dayKey]) bucket[dayKey] = [];
      bucket[dayKey].push(m);
    }
    return Object.entries(bucket).sort(([a], [b]) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [dayListMatches]);

  const bracketRounds = useMemo(() => {
    const map = new Map();
    for (const m of playoffMatches) {
      const round = Number(m.round_number || 1);
      if (!map.has(round)) map.set(round, []);
      map.get(round).push(m);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, list]) => ({ round, matches: list.sort((a, b) => a.id - b.id) }));
  }, [playoffMatches]);

  const roundSizeByNumber = useMemo(
    () =>
      bracketRounds.reduce((acc, item) => {
        acc[item.round] = item.matches.length;
        return acc;
      }, {}),
    [bracketRounds],
  );

  const playoffName = (m, side, matchIndex) => {
    const teamName = resolveTeamName(m, side);
    if (teamName) return teamName;
    const round = Number(m.round_number || 1);
    if (round <= 1) return "TBD";

    const prevRound = round - 1;
    const prevRoundLabel = roundLabel(roundSizeByNumber[prevRound] || 0);
    const prevMatchNumber = side === "home" ? matchIndex * 2 + 1 : matchIndex * 2 + 2;
    return `Winner of ${prevRoundLabel} ${prevMatchNumber}`;
  };

  if (!t) return <div className="text-slate-500">Loading...</div>;

  return (
    <div className="space-y-4">
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="panel space-y-4 p-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t.name || `Tournament #${t.id}`}</h1>
          <p className="text-sm text-slate-500">Tournament #{t.id}</p>
        </div>

        {feasibility && (
          <div className={`rounded-xl border p-3 text-sm ${feasibility.is_feasible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            Feasibility: teams {feasibility.team_count}, required matches {feasibility.required_matches}, available slots {feasibility.available_slots}
            {Number.isFinite(feasibility.minimum_weeks_needed) ? `, minimum weeks needed ${feasibility.minimum_weeks_needed}` : ""}
            {!feasibility.is_feasible ? `, missing ${feasibility.missing_slots} slots` : ""}.
          </div>
        )}

        {isAdmin && (
          <>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Tournament name</label>
                <input className="input" placeholder="Tournament name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Max teams</label>
                <input className="input" type="number" min={2} placeholder="Max teams" value={editForm.max_teams} onChange={(e) => setEditForm({ ...editForm, max_teams: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Start week</label>
                <input className="input" type="week" value={startWeek} onChange={(e) => setStartWeek(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Duration (weeks)</label>
                <select className="input" value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)}>
                  <option value="1">1 week</option>
                  <option value="2">2 weeks</option>
                  <option value="3">3 weeks</option>
                  <option value="4">4 weeks</option>
                  <option value="5">5 weeks</option>
                  <option value="6">6 weeks</option>
                  <option value="7">7 weeks</option>
                  <option value="8">8 weeks</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">End week (auto)</label>
                <input className="input" type="week" value={previewEndWeek} disabled />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Registration deadline</label>
                <input className="input" value={previewMonday ? `${formatUtcDate(new Date(previewMonday.getTime() - 86400000))} (auto)` : "Auto from start week"} disabled />
              </div>
            </div>
            {previewMonday && previewSunday && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Tournament week range: <span className="font-semibold">{startWeek}</span> to <span className="font-semibold">{previewEndWeek}</span>. Date range: <span className="font-semibold">{formatUtcDate(previewMonday)}</span> to{" "}
                <span className="font-semibold">{formatUtcDate(previewSunday)}</span>.
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Tournament format</label>
                <select className="input" value={editForm.format} onChange={(e) => setEditForm({ ...editForm, format: e.target.value })}>
                  <option value="round_robin">round_robin</option>
                  <option value="groups_playoffs">groups_playoffs</option>
                  <option value="single_elimination">single_elimination</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Status</label>
                <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="finished">finished</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Venue setup</label>
                <input className="input" value="Single venue" disabled />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveTournament} className="btn-primary">Save tournament</button>
              <button onClick={deleteTournament} className="btn-danger">Delete tournament</button>
              {!t.participants_locked ? (
                <button onClick={lockParticipants} className="btn-secondary">Lock participants</button>
              ) : (
                <button onClick={unlockParticipants} className="btn-secondary">Unlock participants</button>
              )}
            </div>
          </>
        )}

        {isManager && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {!myTeam ? (
              <>
                Create your team first, then request participation. <Link to="/teams/new" className="font-semibold underline">Create team</Link>
              </>
            ) : myPendingRequest ? (
              <>Participation request is pending approval for team: <span className="font-semibold">{myTeam.name}</span>.</>
            ) : t.participants_locked ? (
              <>Participants are locked for this tournament.</>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span>Your team: <span className="font-semibold">{myTeam.name}</span></span>
                <button onClick={requestParticipation} className="btn-primary">Request participation</button>
              </div>
            )}
          </div>
        )}
      </div>

      {isAdmin && adminRequests.length > 0 && (
        <div className="panel space-y-3 p-4">
          <h2 className="text-xl font-semibold text-slate-900">Participation requests</h2>
          <div className="grid gap-2">
            {adminRequests.map((r) => (
              <div key={r.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">{r.team?.name || `Team ${r.team_id}`} - {r.status}</div>
                <div className="text-xs text-slate-500">Manager: {r.manager?.name || r.manager_id}</div>
                {r.note && <div className="mt-1 text-xs text-slate-600">Note: {r.note}</div>}
                {r.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => approveRequest(r.id)} className="btn-primary">Approve</button>
                    <button onClick={() => rejectRequest(r.id)} className="btn-danger">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Approved teams</h2>
            <p className="text-sm text-slate-500">Only approved teams are used for scheduling.</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={generate} className="btn-primary">Generate schedule</button>
              <button onClick={clear} className="btn-secondary">Clear schedule</button>
            </div>
          )}
        </div>

        {isAdmin && !t.participants_locked && (
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <select className="input" value={teamToAdd} onChange={(e) => setTeamToAdd(e.target.value)}>
              <option value="">Select team to add...</option>
              {allTeams.map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
            <button onClick={addTeam} className="btn-secondary">Add team directly</button>
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-2">
          {teams.map((tm) => (
            <div
              key={tm.id}
              role="button"
              tabIndex={0}
              onClick={() => openTeamPlayers(tm.team_id, tm.team?.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openTeamPlayers(tm.team_id, tm.team?.name);
                }
              }}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 ${selectedTeamId === tm.team_id ? "border-slate-500 bg-slate-100" : "border-slate-300 bg-white"}`}
            >
              <div className="min-w-0 text-sm select-none">
                <span className="font-medium text-slate-900">{tm.team?.name || `Team ${tm.team_id}`}</span>
                <span className="text-slate-500"> - {tm.team?.city || "No city"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/teams/${tm.team_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                >
                  Open
                </Link>
                {isAdmin && !t.participants_locked && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTeam(tm.team_id);
                    }}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {teams.length === 0 && <div className="text-sm text-slate-500">No approved teams yet.</div>}
        </div>
        {selectedTeamId && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">{selectedTeamName} roster</div>
              <Link to={`/teams/${selectedTeamId}`} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                Go to team page
              </Link>
            </div>
            {playersLoading ? (
              <div className="text-sm text-slate-500">Loading players...</div>
            ) : teamPlayers.length === 0 ? (
              <div className="text-sm text-slate-500">No players registered yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {teamPlayers.map((p) => (
                  <div key={p.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700">
                    #{p.jersey_number ?? "-"} {p.first_name} {p.last_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Matches</h2>
            <p className="text-sm text-slate-500">Group stage is listed by day. Playoffs are shown as a bracket.</p>
          </div>
          {isAdmin && (
            <button onClick={clear} className="btn-danger">Clear all matches</button>
          )}
        </div>

        {isAdmin && (
          <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Add manual match</summary>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Home team</label>
                <select className="input" value={newMatch.home_team_id} onChange={(e) => setNewMatch({ ...newMatch, home_team_id: e.target.value })}>
                  <option value="">Select home team</option>
                  {teams.map((tm) => (
                    <option key={`home-${tm.team_id}`} value={tm.team_id}>{tm.team?.name || tm.team_id}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Away team</label>
                <select className="input" value={newMatch.away_team_id} onChange={(e) => setNewMatch({ ...newMatch, away_team_id: e.target.value })}>
                  <option value="">Select away team</option>
                  {teams.map((tm) => (
                    <option key={`away-${tm.team_id}`} value={tm.team_id}>{tm.team?.name || tm.team_id}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Round</label>
                <input className="input" type="number" min={1} placeholder="Round number" value={newMatch.round_number} onChange={(e) => setNewMatch({ ...newMatch, round_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Action</label>
                <button onClick={createMatch} className="btn-secondary w-full">Add match</button>
              </div>
            </div>
          </details>
        )}

        {groupedByDay.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-slate-800">Matches by day</h3>
            {groupedByDay.map(([day, list]) => (
              <div key={day} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{day}</div>
                <div className="grid gap-1.5">
                  {list.map((m) => (
                    <Link key={m.id} to={`/matches/${m.id}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-2 transition hover:border-sky-300">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">#{m.id} - R{m.round_number} - {m.status}</span>
                        <span>{formatDateTime(m.scheduled_at)}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        {(resolveTeamName(m, "home") || "TBD")} vs {(resolveTeamName(m, "away") || "TBD")}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {bracketRounds.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-slate-800">Playoff bracket</h3>
            <div className="bracket-board">
              {bracketRounds.map((roundData) => (
                <div key={roundData.round} className="bracket-round">
                  <div className="bracket-round-title">{roundLabel(roundData.matches.length)}</div>
                  <div className="space-y-3">
                    {roundData.matches.map((m, index) => (
                      <Link key={m.id} to={`/matches/${m.id}`} className="bracket-match">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">#{m.id} | {m.status}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{playoffName(m, "home", index)}</div>
                        <div className="text-sm font-semibold text-slate-900">{playoffName(m, "away", index)}</div>
                        <div className="mt-2 text-xs text-slate-500">{formatDateTime(m.scheduled_at)}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {matches.length === 0 && <div className="text-sm text-slate-500">No matches yet.</div>}
      </div>
    </div>
  );
}


