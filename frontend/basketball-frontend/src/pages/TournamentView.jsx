import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { matchesApi } from "../api/matches";
import { teamsApi } from "../api/teams";
import { playersApi } from "../api/players";
import { useAuth } from "../auth/useAuth";
import BracketSimulatorModal from "../components/BracketSimulatorModal";
import EmptyState from "../components/EmptyState";
import GroupsPlayoffsSimulatorModal from "../components/GroupsPlayoffsSimulatorModal";
import PdfExportModal from "../components/PdfExportModal";
import PlayoffBracket from "../components/PlayoffBracket";
import Skeleton from "../components/Skeleton";
import { useConfirm } from "../components/useConfirm";
import { useToast } from "../components/useToast";
import { downloadBlobResponse } from "../utils/downloadFile";

const defaultTournamentPdfSections = {
  teams: true,
  standings: true,
  schedule: true,
  playoffs: true,
  feasibility: true,
};

function selectedSections(state) {
  return Object.entries(state)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
}

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

function stagePlanningCopy(format) {
  if (format === "groups_playoffs") {
    return {
      usesStagePlanning: true,
      gapLabel: "Days between groups and playoffs",
      capLabel: "Group-stage games per day",
      stageName: "group stage",
    };
  }

  if (format === "round_robin") {
    return {
      usesStagePlanning: true,
      gapLabel: "Days between regular season and playoffs",
      capLabel: "Regular-season games per day",
      stageName: "regular season",
    };
  }

  return {
    usesStagePlanning: false,
    gapLabel: "",
    capLabel: "",
    stageName: "playoffs",
  };
}

function OverviewAccordion({ title, subtitle, isOpen, onToggle, children, actions = null }) {
  return (
    <section className={`overview-accordion panel ${isOpen ? "is-open" : ""}`}>
      <button
        type="button"
        className="overview-accordion__toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="overview-accordion__copy">
          <span className="overview-accordion__title">{title}</span>
          {subtitle ? <span className="overview-accordion__subtitle">{subtitle}</span> : null}
        </span>
        <span className={`overview-accordion__chevron ${isOpen ? "is-open" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="overview-accordion__body">
          {actions ? <div className="overview-accordion__actions">{actions}</div> : null}
          {children}
        </div>
      )}
    </section>
  );
}

export default function TournamentView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin, isManager, isAuthenticated } = useAuth();
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const [t, setT] = useState(null);
  const [teams, setTeams] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [feasibility, setFeasibility] = useState(null);
  const [standingsRows, setStandingsRows] = useState([]);
  const [groupStandings, setGroupStandings] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);

  const [teamToAdd, setTeamToAdd] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    end_date: "",
    format: "round_robin",
    status: "draft",
    max_teams: "",
    venues_count: 1,
    venue_names: "Main Court",
    time_slots: "12:00,14:00,16:00,18:00",
    playoff_round_gap_days: 1,
    groups_to_playoffs_gap_days: 1,
    group_games_per_day: 4,
  });
  const [newMatch, setNewMatch] = useState({
    home_team_id: "",
    away_team_id: "",
    round_number: 1,
    scheduled_at: "",
    venue_slot: "",
  });
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedTeamName, setSelectedTeamName] = useState("");
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isGroupsSimulatorOpen, setIsGroupsSimulatorOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfSections, setPdfSections] = useState(defaultTournamentPdfSections);
  const [activeTab, setActiveTab] = useState("overview");
  const [matchQuery, setMatchQuery] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState("all");
  const [matchDateFilter, setMatchDateFilter] = useState("all");
  const [matchVenueFilter, setMatchVenueFilter] = useState("all");
  const [participationNote, setParticipationNote] = useState("");
  const [rejectNotes, setRejectNotes] = useState({});
  const [matchEdits, setMatchEdits] = useState({});
  const [overviewOpen, setOverviewOpen] = useState({
    teams: false,
    standings: true,
    groups: true,
    matches: false,
    playoffs: true,
  });
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

  const venueNames = useMemo(() => {
    const count = Math.max(1, Number(t?.venues_count || editForm.venues_count || 1));
    const rawNames = Array.isArray(t?.venue_names) && t.venue_names.length > 0
      ? t.venue_names
      : String(editForm.venue_names || "").split(",");

    return Array.from({ length: count }, (_, index) => {
      const name = String(rawNames[index] || "").trim();
      return name || `Court ${index + 1}`;
    });
  }, [editForm.venue_names, editForm.venues_count, t?.venue_names, t?.venues_count]);

  const venueLabel = useCallback((venueId) => {
    const idNumber = Number(venueId);
    if (!Number.isFinite(idNumber) || idNumber <= 0) return "Court TBD";
    return venueNames[idNumber - 1] || `Court ${idNumber}`;
  }, [venueNames]);

  const planningCopy = useMemo(() => stagePlanningCopy(editForm.format), [editForm.format]);

  const resolveTeamName = useCallback((matchRow, side) => {
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
  }, [teamNameById]);

  const hasScore = (value) => value !== null && value !== undefined && value !== "";

  const hasFinishedResult = (matchRow) => matchRow?.status === "finished" && hasScore(matchRow.home_score) && hasScore(matchRow.away_score);

  const load = useCallback(async () => {
    setErr("");

    const baseCalls = [
      tournamentsApi.get(id),
      tournamentsApi.teams(id),
      tournamentsApi.matches(id),
      tournamentsApi.feasibility(id),
      tournamentsApi.standings(id),
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
    const [tRes, teamRes, matchesRes, feasibilityRes, standingsRes] = responses;

    setT(tRes.data);
    setEditForm({
      name: tRes.data?.name || "",
      end_date: tRes.data?.end_date || "",
      format: tRes.data?.format || "round_robin",
      status: tRes.data?.status || "draft",
      max_teams: tRes.data?.max_teams || "",
      venues_count: tRes.data?.venues_count || 1,
      venue_names: Array.isArray(tRes.data?.venue_names) && tRes.data.venue_names.length > 0
        ? tRes.data.venue_names.join(",")
        : Array.from({ length: Number(tRes.data?.venues_count || 1) }, (_, index) => `Court ${index + 1}`).join(","),
      time_slots: Array.isArray(tRes.data?.time_slots) && tRes.data.time_slots.length > 0
        ? tRes.data.time_slots.join(",")
        : "12:00,14:00,16:00,18:00",
      playoff_round_gap_days: tRes.data?.playoff_round_gap_days ?? 1,
      groups_to_playoffs_gap_days: tRes.data?.groups_to_playoffs_gap_days ?? 1,
      group_games_per_day: tRes.data?.group_games_per_day ?? Math.min(
        Math.max(1, Number(tRes.data?.venues_count || 1)) * (Array.isArray(tRes.data?.time_slots) && tRes.data.time_slots.length > 0 ? tRes.data.time_slots.length : 4),
        4,
      ),
    });
    setTeams(teamRes.data);
    setMatches(matchesRes.data);
    setMatchEdits((matchesRes.data || []).reduce((acc, matchRow) => {
      acc[matchRow.id] = {
        scheduled_at: matchRow.scheduled_at ? matchRow.scheduled_at.slice(0, 16) : "",
        venue_slot: matchRow.venue_slot ?? matchRow.venue_id ?? "",
        status: matchRow.status || "scheduled",
      };
      return acc;
    }, {}));
    setFeasibility(feasibilityRes.data);
    setStandingsRows(
      Array.isArray(standingsRes.data)
        ? standingsRes.data
        : Array.isArray(standingsRes.data?.rows)
          ? standingsRes.data.rows
          : [],
    );
    setGroupStandings(Array.isArray(standingsRes.data?.groups) ? standingsRes.data.groups : []);

    let index = 5;
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

  const handleActionError = (e, fallback) => {
    const message = e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message || fallback;
    setErr(message);
    showToast(message, "error");
  };

  const toggleOverviewSection = (key) => {
    setOverviewOpen((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const buildPlanningPayload = () => ({
    ...editForm,
    max_teams: editForm.max_teams ? Number(editForm.max_teams) : null,
    venues_count: Math.max(1, Number(editForm.venues_count) || 1),
    venue_names: String(editForm.venue_names || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
    time_slots: String(editForm.time_slots || "")
      .split(",")
      .map((slot) => slot.trim())
      .filter(Boolean),
    playoff_round_gap_days: Math.max(0, Number(editForm.playoff_round_gap_days) || 0),
    groups_to_playoffs_gap_days: planningCopy.usesStagePlanning ? Math.max(0, Number(editForm.groups_to_playoffs_gap_days) || 0) : 0,
    group_games_per_day: planningCopy.usesStagePlanning ? Math.max(1, Number(editForm.group_games_per_day) || 1) : null,
  });

  const persistTournament = async ({ silent = false } = {}) => {
    if (!isAdmin) return null;
    if (!editForm.name.trim()) {
      const message = "Tournament name is required.";
      setErr(message);
      if (!silent) showToast(message, "error");
      return null;
    }
    if (!editForm.end_date) {
      const message = "Please select the final day.";
      setErr(message);
      if (!silent) showToast(message, "error");
      return null;
    }

    const res = await tournamentsApi.update(id, buildPlanningPayload());
    setT(res.data);
    await load();
    if (!silent) {
      showToast("Tournament saved.");
    }
    return res.data;
  };

  const saveTournament = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await persistTournament();
    } catch (e) {
      handleActionError(e, "Failed to save tournament.");
    }
  };

  const deleteTournament = async () => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Delete this tournament?",
      message: "This removes the tournament and its related schedule data.",
      confirmLabel: "Delete tournament",
    });
    if (!ok) return;
    setErr("");
    try {
      await tournamentsApi.remove(id);
      showToast("Tournament deleted.");
      nav("/tournaments");
    } catch (e) {
      handleActionError(e, "Failed to delete tournament.");
    }
  };

  const lockParticipants = async () => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Lock participants?",
      message: "Managers will no longer be able to change participation for this tournament until you unlock it.",
      confirmLabel: "Lock participants",
      tone: "primary",
    });
    if (!ok) return;
    try {
      await tournamentsApi.lockParticipants(id);
      await load();
      showToast("Participants locked.");
    } catch (e) {
      handleActionError(e, "Failed to lock participants.");
    }
  };

  const unlockParticipants = async () => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Unlock participants?",
      message: "Managers may be able to request participation again.",
      confirmLabel: "Unlock participants",
      tone: "primary",
    });
    if (!ok) return;
    try {
      await tournamentsApi.unlockParticipants(id);
      await load();
      showToast("Participants unlocked.");
    } catch (e) {
      handleActionError(e, "Failed to unlock participants.");
    }
  };

  const requestParticipation = async () => {
    if (!isManager) return;
    const liveNote = document.querySelector('textarea[placeholder="Optional note for the tournament admin..."]')?.value ?? participationNote;
    try {
      await tournamentsApi.requestParticipation(id, {
        ...(myTeam?.id ? { team_id: myTeam.id } : {}),
        note: liveNote.trim() || null,
      });
      setParticipationNote("");
      await load();
      showToast("Participation request sent.");
    } catch (e) {
      handleActionError(e, "Failed to request participation.");
    }
  };

  const approveRequest = async (requestId) => {
    if (!isAdmin) return;
    try {
      await tournamentsApi.approveRequest(requestId);
      await load();
      showToast("Request approved.");
    } catch (e) {
      handleActionError(e, "Failed to approve request.");
    }
  };

  const rejectRequest = async (requestId) => {
    if (!isAdmin) return;
    try {
      await tournamentsApi.rejectRequest(requestId, { note: rejectNotes[requestId]?.trim() || null });
      setRejectNotes((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      await load();
      showToast("Request rejected.");
    } catch (e) {
      handleActionError(e, "Failed to reject request.");
    }
  };

  const removeRequest = async (requestId) => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Remove this request?",
      message: "This removes the participation request from the admin list.",
      confirmLabel: "Remove request",
    });
    if (!ok) return;
    try {
      await tournamentsApi.removeRequest(requestId);
      await load();
      showToast("Request removed.");
    } catch (e) {
      handleActionError(e, "Failed to remove request.");
    }
  };

  const addTeam = async () => {
    if (!isAdmin || !teamToAdd) return;
    setErr("");
    try {
      await tournamentsApi.addTeam(id, { team_id: Number(teamToAdd) });
      setTeamToAdd("");
      await load();
      showToast("Team added to tournament.");
    } catch (e) {
      handleActionError(e, "Failed to add team.");
    }
  };

  const removeTeam = async (teamId) => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Remove this team?",
      message: "The team will no longer be approved for this tournament.",
      confirmLabel: "Remove team",
    });
    if (!ok) return;
    setErr("");
    try {
      await tournamentsApi.removeTeam(id, teamId);
      await load();
      showToast("Team removed from tournament.");
    } catch (e) {
      handleActionError(e, "Failed to remove team.");
    }
  };

  const generate = async () => {
    if (!isAdmin) return;
    setErr("");
    if (!editForm.end_date) {
      const message = "Select the final day before generating a schedule.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    if (teams.length < 2) {
      const message = "Add at least two approved teams before generating a schedule.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    if (feasibility && !feasibility.is_feasible) {
      const ok = await confirm({
        title: "Planning setup needs attention",
        message: feasibility.issues?.[0] || "The schedule rules are incomplete. Fix them before generating.",
        confirmLabel: "Continue anyway",
        tone: "primary",
      });
      if (!ok) return;
    } else if (matches.length > 0) {
      const ok = await confirm({
        title: "Regenerate schedule?",
        message: "This may replace or change existing generated matches.",
        confirmLabel: "Regenerate",
        tone: "primary",
      });
      if (!ok) return;
    }
    try {
      const payload = buildPlanningPayload();
      const saveResult = await persistTournament({ silent: true });
      if (!saveResult) return;
      await tournamentsApi.generateSchedule(id, payload);
      await load();
      showToast("Schedule generated.");
    } catch (e) {
      handleActionError(e, "Failed to generate schedule.");
    }
  };

  const clear = async () => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Clear the schedule?",
      message: "This removes all generated and manual matches for the tournament.",
      confirmLabel: "Clear schedule",
    });
    if (!ok) return;
    setErr("");
    try {
      await tournamentsApi.clearSchedule(id);
      await load();
      showToast("Schedule cleared.");
    } catch (e) {
      handleActionError(e, "Failed to clear schedule.");
    }
  };

  const createMatch = async () => {
    if (!isAdmin) return;
    setErr("");
    if (!newMatch.home_team_id || !newMatch.away_team_id) {
      const message = "Select both teams before creating a match.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    if (newMatch.home_team_id === newMatch.away_team_id) {
      const message = "Home and away teams must be different.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    try {
      await tournamentsApi.createMatch(id, {
        home_team_id: Number(newMatch.home_team_id),
        away_team_id: Number(newMatch.away_team_id),
        round_number: Number(newMatch.round_number) || 1,
        scheduled_at: newMatch.scheduled_at || null,
        venue_slot: newMatch.venue_slot ? Number(newMatch.venue_slot) : null,
      });
      setNewMatch({ home_team_id: "", away_team_id: "", round_number: 1, scheduled_at: "", venue_slot: "" });
      await load();
      showToast("Match created.");
    } catch (e) {
      handleActionError(e, "Failed to create match.");
    }
  };

  const exportPdf = async () => {
    setErr("");
    setIsExportingPdf(true);
    try {
      const response = await tournamentsApi.exportPdf(id, selectedSections(pdfSections));
      downloadBlobResponse(response, `${t?.name || `tournament-${id}`}-report.pdf`);
      setIsPdfModalOpen(false);
      showToast("Tournament PDF exported.");
    } catch (e) {
      handleActionError(e, "Failed to export tournament PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const togglePdfSection = (key) => {
    setPdfSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
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

  const filteredDayListMatches = useMemo(() => {
    const normalizedQuery = matchQuery.trim().toLowerCase();

    return dayListMatches.filter((matchRow) => {
      if (matchStatusFilter !== "all" && matchRow.status !== matchStatusFilter) {
        return false;
      }
      const dayKey = matchRow.scheduled_at ? matchRow.scheduled_at.slice(0, 10) : "Unscheduled";
      if (matchDateFilter !== "all" && dayKey !== matchDateFilter) {
        return false;
      }
      const venueKey = matchRow.venue_slot || matchRow.venue_id ? String(matchRow.venue_slot ?? matchRow.venue_id) : "none";
      if (matchVenueFilter !== "all" && venueKey !== matchVenueFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const homeName = resolveTeamName(matchRow, "home") || "";
      const awayName = resolveTeamName(matchRow, "away") || "";
      const searchText = [
        matchRow.id,
        matchRow.round_number,
        matchRow.status,
        matchRow.scheduled_at,
        venueLabel(matchRow.venue_slot ?? matchRow.venue_id),
        homeName,
        awayName,
      ].join(" ").toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [dayListMatches, matchDateFilter, matchQuery, matchStatusFilter, matchVenueFilter, resolveTeamName, venueLabel]);

  const matchDayOptions = useMemo(() => {
    const days = new Set(dayListMatches.map((matchRow) => (
      matchRow.scheduled_at ? matchRow.scheduled_at.slice(0, 10) : "Unscheduled"
    )));
    return [...days].sort((a, b) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [dayListMatches]);

  const groupedByDay = useMemo(() => {
    const bucket = {};
    for (const m of filteredDayListMatches) {
      const dayKey = m.scheduled_at ? m.scheduled_at.slice(0, 10) : "Unscheduled";
      if (!bucket[dayKey]) bucket[dayKey] = [];
      bucket[dayKey].push(m);
    }
    return Object.entries(bucket).sort(([a], [b]) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [filteredDayListMatches]);

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

  const updateMatchEdit = (matchId, key, value) => {
    setMatchEdits((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] || {}),
        [key]: value,
      },
    }));
  };

  const saveMatchEdit = async (matchId) => {
    if (!isAdmin) return;
    const draft = matchEdits[matchId] || {};
    setErr("");
    try {
      await matchesApi.update(matchId, {
        scheduled_at: draft.scheduled_at || null,
        venue_slot: draft.venue_slot ? Number(draft.venue_slot) : null,
        status: draft.status || "scheduled",
      });
      await load();
      showToast("Match schedule updated.");
    } catch (e) {
      handleActionError(e, "Failed to update match schedule.");
    }
  };

  const roundRobinQualifiedCount = t?.format === "round_robin" && bracketRounds.length > 0
    ? bracketRounds[0].matches.length * 2
    : 0;
  const isOverviewTab = activeTab === "overview";
  const isAdminTab = activeTab === "admin" && isAdmin;
  const tournamentPdfOptions = useMemo(
    () => [
      {
        key: "teams",
        label: "Approved teams",
        description: "Include the approved team list with seeds, cities, and groups.",
      },
      {
        key: "standings",
        label: t?.format === "groups_playoffs" ? "Group tables" : "Standings table",
        description: t?.format === "groups_playoffs"
          ? "Print every group table with played games, wins, losses, and points."
          : "Print the overall tournament standings table.",
      },
      {
        key: "schedule",
        label: "Schedule",
        description: "Print the match list grouped by day with round, time, status, and score.",
      },
      {
        key: "playoffs",
        label: "Playoff rounds",
        description: "Print playoff rounds and recorded bracket results.",
      },
      {
        key: "feasibility",
        label: "Feasibility summary",
        description: "Include required matches, available slots, and the planning outcome.",
      },
    ],
    [t?.format],
  );

  if (!t) return <Skeleton rows={4} />;

  return (
    <div className="page-stack">
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="panel page-hero">
        <div className="section-heading">
          <div>
            <p className="section-heading__eyebrow">Tournament Hub</p>
            <h1 className="section-heading__title">{t.name || `Tournament #${t.id}`}</h1>
            <p className="section-heading__copy">Tournament #{t.id} · {t.format} · {t.status}</p>
          </div>
          <div className="list-card__meta">
            <button type="button" onClick={() => setIsPdfModalOpen(true)} disabled={isExportingPdf} className="btn-secondary">
              {isExportingPdf ? "Exporting..." : "Export PDF"}
            </button>
            {t.start_date ? <span className="list-tag">Starts {t.start_date}</span> : null}
            {t.end_date ? <span className="list-tag">Ends {t.end_date}</span> : null}
            {t.max_teams ? <span className="list-tag">{t.max_teams} team cap</span> : null}
          </div>
        </div>

        {!isAuthenticated && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Public view: schedules, standings, brackets, and results are visible without logging in. Login is required to manage teams or tournaments.
          </div>
        )}

        {isManager && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {!myTeam ? (
              <>
                Create your team first, then request participation. <Link to="/teams/new" className="font-semibold underline">Create team</Link>
              </>
            ) : myPendingRequest ? (
              <div className="space-y-1">
                <div>Participation request is pending approval for team: <span className="font-semibold">{myTeam.name}</span>.</div>
                {myPendingRequest.note ? <div className="text-slate-500">Note: {myPendingRequest.note}</div> : null}
              </div>
            ) : t.participants_locked ? (
              <>Participants are locked for this tournament.</>
            ) : (
              <div className="grid gap-2">
                <span>Your team: <span className="font-semibold">{myTeam.name}</span></span>
                <textarea
                  className="input min-h-[88px]"
                  placeholder="Optional note for the tournament admin..."
                  value={participationNote}
                  onChange={(event) => setParticipationNote(event.target.value)}
                />
                <div>
                  <button onClick={requestParticipation} className="btn-primary">Request participation</button>
                </div>
              </div>
            )}
            {myRequests.some((request) => request.status === "rejected") && (
              <div className="mt-3 rounded-lg border border-red-100 bg-white p-2 text-red-700">
                Latest rejection reason: {myRequests.find((request) => request.status === "rejected")?.note || "No reason provided."}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[20px] border border-slate-700/60 bg-slate-900/85 shadow-[0_18px_40px_rgba(8,12,20,0.18)]">
        <div className={`grid ${isAdmin ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-5 py-3 text-sm font-semibold transition ${isOverviewTab ? "bg-slate-800 text-white" : "bg-slate-900/40 text-slate-300 hover:bg-slate-800/70 hover:text-white"}`}
          >
            Overview
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("admin")}
              className={`border-t border-slate-700/60 px-5 py-3 text-sm font-semibold transition sm:border-t-0 sm:border-l ${isAdminTab ? "bg-slate-800 text-white" : "bg-slate-900/40 text-slate-300 hover:bg-slate-800/70 hover:text-white"}`}
            >
              Admin
            </button>
          )}
        </div>
      </div>

      {isAdminTab && (
        <>
          {feasibility && (
            <div className={`rounded-xl border p-3 text-sm ${feasibility.is_feasible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              Planning summary: {feasibility.required_matches} matches, estimated start {feasibility.estimated_start_date || "not ready"}, final day {feasibility.final_date || "not set"}, stage days {feasibility.stage_day_count ?? 0}, playoff days {feasibility.playoff_day_count ?? 0}.
              {!feasibility.is_feasible && feasibility.issues?.length ? ` ${feasibility.issues[0]}` : ""}
            </div>
          )}

          <div className="panel space-y-4 p-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Tournament settings</h2>
              <p className="text-sm text-slate-500">Edit the tournament, lock participants, and control the backwards schedule generation rules.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Tournament name</label>
                <input className="input" placeholder="Tournament name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Max teams</label>
                <input className="input" type="number" min={2} placeholder="Max teams" value={editForm.max_teams} onChange={(e) => setEditForm({ ...editForm, max_teams: e.target.value })} />
              </div>
              <div className="space-y-1">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Final day</label>
                  <input className="input" type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
                </div>
              </div>
            </div>
            {editForm.end_date && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                The scheduler will treat <span className="font-semibold">{editForm.end_date}</span> as the last tournament day and automatically place earlier rounds before it.
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
                <input className="input" type="number" min={1} max={20} value={editForm.venues_count} onChange={(e) => setEditForm({ ...editForm, venues_count: e.target.value })} />
              </div>
            </div>
            <div className={`grid grid-cols-1 gap-2 ${planningCopy.usesStagePlanning ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Days between playoff rounds</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={30}
                  value={editForm.playoff_round_gap_days}
                  onChange={(e) => setEditForm({ ...editForm, playoff_round_gap_days: e.target.value })}
                />
              </div>
              {planningCopy.usesStagePlanning && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">{planningCopy.gapLabel}</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={30}
                    value={editForm.groups_to_playoffs_gap_days}
                    onChange={(e) => setEditForm({ ...editForm, groups_to_playoffs_gap_days: e.target.value })}
                  />
                </div>
              )}
              {planningCopy.usesStagePlanning && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">{planningCopy.capLabel}</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={editForm.group_games_per_day}
                    onChange={(e) => setEditForm({ ...editForm, group_games_per_day: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Court names</label>
              <input
                className="input"
                placeholder="Main Court,Court 2,Court 3"
                value={editForm.venue_names}
                onChange={(e) => setEditForm({ ...editForm, venue_names: e.target.value })}
              />
              <div className="text-xs text-slate-500">Separate court names with commas. These labels are used in match filters and schedule editing.</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Daily time slots</label>
              <input
                className="input"
                placeholder="12:00,14:00,16:00,18:00"
                value={editForm.time_slots}
                onChange={(e) => setEditForm({ ...editForm, time_slots: e.target.value })}
              />
              <div className="text-xs text-slate-500">Separate slot start times with commas. These slots are reused across the automatically generated planning window.</div>
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
          </div>

          {adminRequests.length > 0 && (
        <div className="panel space-y-3 p-4">
          <h2 className="text-xl font-semibold text-slate-900">Participation requests</h2>
          <div className="grid gap-2">
            {adminRequests.map((r) => (
              <div key={r.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">{r.team?.name || `Team ${r.team_id}`} - {r.status}</div>
                <div className="text-xs text-slate-500">Manager: {r.manager?.name || r.manager_id}</div>
                {r.note && <div className="mt-1 text-xs text-slate-600">{r.status === "rejected" ? "Rejection reason" : "Request note"}: {r.note}</div>}
                {r.status === "pending" && (
                  <div className="mt-2 grid gap-2">
                    <textarea
                      className="input min-h-[76px]"
                      placeholder="Optional rejection reason..."
                      value={rejectNotes[r.id] || ""}
                      onChange={(event) => setRejectNotes({ ...rejectNotes, [r.id]: event.target.value })}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => approveRequest(r.id)} className="btn-primary">Approve</button>
                      <button onClick={() => rejectRequest(r.id)} className="btn-danger">Reject</button>
                    </div>
                  </div>
                )}
                {r.status !== "pending" && (
                  <div className="mt-2">
                    <button onClick={() => removeRequest(r.id)} className="btn-danger">Remove request</button>
                  </div>
                )}
                {r.status === "pending" && (
                  <div className="mt-2">
                    <button onClick={() => removeRequest(r.id)} className="btn-secondary">Remove request</button>
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
          {teams.length === 0 && (
            <EmptyState
              title="No approved teams yet"
              description={isAdmin ? "Approve participation requests or add a team directly before generating a schedule." : "Teams will appear here after the tournament admin approves them."}
            />
          )}
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

          <div className="panel space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Match controls</h2>
                <p className="text-sm text-slate-500">Create manual matches or clear the current schedule without leaving the admin view.</p>
              </div>
              <button onClick={clear} className="btn-danger">Clear all matches</button>
            </div>

            <div className="grid gap-2 md:grid-cols-6">
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
                <label className="text-sm font-medium text-slate-700">Time</label>
                <input className="input" type="datetime-local" value={newMatch.scheduled_at} onChange={(e) => setNewMatch({ ...newMatch, scheduled_at: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Court</label>
                <select className="input" value={newMatch.venue_slot} onChange={(e) => setNewMatch({ ...newMatch, venue_slot: e.target.value })}>
                  <option value="">Court TBD</option>
                  {venueNames.map((name, index) => (
                    <option key={name} value={index + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Action</label>
                <button onClick={createMatch} className="btn-secondary w-full">Add match</button>
              </div>
            </div>

            {sortedMatches.length > 0 && (
              <div className="space-y-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Schedule editor</h3>
                  <p className="text-sm text-slate-500">Adjust match time, court, and status without opening each match page.</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Match</th>
                        <th className="px-3 py-2 font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Court</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMatches.map((matchRow) => (
                        <tr key={matchRow.id} className="border-t border-slate-100">
                          <td className="min-w-[220px] px-3 py-2">
                            <Link to={`/matches/${matchRow.id}`} className="font-semibold text-slate-900 hover:text-sky-700">
                              #{matchRow.id} · {resolveTeamName(matchRow, "home") || "TBD"} vs {resolveTeamName(matchRow, "away") || "TBD"}
                            </Link>
                            <div className="text-xs text-slate-500">Round {matchRow.round_number || "-"} · {matchRow.stage || "regular"}</div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input min-w-[210px]"
                              type="datetime-local"
                              value={matchEdits[matchRow.id]?.scheduled_at || ""}
                              onChange={(event) => updateMatchEdit(matchRow.id, "scheduled_at", event.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="input min-w-[150px]"
                              value={matchEdits[matchRow.id]?.venue_slot ?? ""}
                              onChange={(event) => updateMatchEdit(matchRow.id, "venue_slot", event.target.value)}
                            >
                              <option value="">Court TBD</option>
                              {venueNames.map((name, index) => (
                                <option key={`${matchRow.id}-${name}`} value={index + 1}>{name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="input min-w-[140px]"
                              value={matchEdits[matchRow.id]?.status || "scheduled"}
                              onChange={(event) => updateMatchEdit(matchRow.id, "status", event.target.value)}
                            >
                              <option value="scheduled">scheduled</option>
                              <option value="live">live</option>
                              <option value="finished">finished</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => saveMatchEdit(matchRow.id)} className="btn-secondary">Save</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {isOverviewTab && (
        <OverviewAccordion
          title="Teams"
          subtitle="Approved teams currently used for standings, scheduling, and playoff progression."
          isOpen={overviewOpen.teams}
          onToggle={() => toggleOverviewSection("teams")}
        >
          <div className="grid gap-2 md:grid-cols-2">
            {teams.map((tm) => (
              <div
                key={`overview-${tm.id ?? tm.team_id}`}
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
                  {tm.seed ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Seed {tm.seed}</span> : null}
                  <Link
                    to={`/teams/${tm.team_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
            {teams.length === 0 && (
              <EmptyState
                title="No approved teams yet"
                description={isAdmin ? "Approve participation requests or add a team directly before generating a schedule." : "Teams will appear here after the tournament admin approves them."}
              />
            )}
          </div>

          {selectedTeamId && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">{selectedTeamName} roster</div>
                <Link to={`/teams/${selectedTeamId}`} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                  Open team page
                </Link>
              </div>
              {playersLoading ? (
                <div className="text-sm text-slate-500">Loading roster...</div>
              ) : teamPlayers.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {teamPlayers.map((player) => (
                    <div key={player.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">
                        {player.first_name} {player.last_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        #{player.jersey_number ?? "-"} · {player.position || "No position"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">No players added for this team yet.</div>
              )}
            </div>
          )}
        </OverviewAccordion>
      )}

      {isOverviewTab && t.format === "round_robin" && standingsRows.length > 0 && (
        <OverviewAccordion
          title="Standings Table"
          subtitle={`One league table for the full regular season.${roundRobinQualifiedCount > 0 ? ` Top ${roundRobinQualifiedCount} teams advance to the playoff bracket.` : ""}`}
          isOpen={overviewOpen.standings}
          onToggle={() => toggleOverviewSection("standings")}
          actions={isAdmin ? (
            <button type="button" onClick={() => setIsGroupsSimulatorOpen(true)} className="btn-secondary">
              Simulate
            </button>
          ) : null}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-1 font-medium">#</th>
                  <th className="px-2 py-1 font-medium">Team</th>
                  <th className="px-2 py-1 font-medium">P</th>
                  <th className="px-2 py-1 font-medium">W</th>
                  <th className="px-2 py-1 font-medium">L</th>
                  <th className="px-2 py-1 font-medium">Diff</th>
                  <th className="px-2 py-1 font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standingsRows.map((row) => (
                  <tr
                    key={row.team_id}
                    className={roundRobinQualifiedCount > 0 && row.rank <= roundRobinQualifiedCount ? "bg-emerald-50 text-slate-900" : "text-slate-700"}
                  >
                    <td className="px-2 py-1 font-semibold">{row.rank}</td>
                    <td className="px-2 py-1 font-medium">{row.team_name || `Team ${row.team_id}`}</td>
                    <td className="px-2 py-1">{row.played}</td>
                    <td className="px-2 py-1">{row.wins}</td>
                    <td className="px-2 py-1">{row.losses}</td>
                    <td className="px-2 py-1">{row.diff}</td>
                    <td className="px-2 py-1 font-semibold">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OverviewAccordion>
      )}

      {isOverviewTab && t.format === "groups_playoffs" && groupStandings.length > 0 && (
        <OverviewAccordion
          title="Group Tables"
          subtitle="Top teams update the playoff bracket automatically as group results come in."
          isOpen={overviewOpen.groups}
          onToggle={() => toggleOverviewSection("groups")}
          actions={isAdmin ? (
            <button type="button" onClick={() => setIsGroupsSimulatorOpen(true)} className="btn-secondary">
              Simulate
            </button>
          ) : null}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {groupStandings.map((group) => (
              <div key={group.group_code} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Group {group.group_code}</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="px-2 py-1 font-medium">#</th>
                        <th className="px-2 py-1 font-medium">Team</th>
                        <th className="px-2 py-1 font-medium">P</th>
                        <th className="px-2 py-1 font-medium">W</th>
                        <th className="px-2 py-1 font-medium">L</th>
                        <th className="px-2 py-1 font-medium">Diff</th>
                        <th className="px-2 py-1 font-medium">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.team_id} className={row.rank <= 2 ? "bg-emerald-50 text-slate-900" : "text-slate-700"}>
                          <td className="px-2 py-1 font-semibold">{row.rank}</td>
                          <td className="px-2 py-1 font-medium">{row.team_name || `Team ${row.team_id}`}</td>
                          <td className="px-2 py-1">{row.played}</td>
                          <td className="px-2 py-1">{row.wins}</td>
                          <td className="px-2 py-1">{row.losses}</td>
                          <td className="px-2 py-1">{row.diff}</td>
                          <td className="px-2 py-1 font-semibold">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </OverviewAccordion>
      )}

      {isOverviewTab && bracketRounds.length > 0 && (
        <OverviewAccordion
          title={t.format === "single_elimination" ? "Single Elimination Bracket" : "Playoff Bracket"}
          subtitle="Collapse or expand the playoff tree without losing your place in the tournament view."
          isOpen={overviewOpen.playoffs}
          onToggle={() => toggleOverviewSection("playoffs")}
          actions={
            t.format === "single_elimination" ? (
              <button type="button" onClick={() => setIsSimulatorOpen(true)} className="btn-secondary">
                Simulate
              </button>
            ) : null
          }
        >
          <PlayoffBracket
            bracketRounds={bracketRounds}
            roundLabel={roundLabel}
            playoffName={playoffName}
            formatDateTime={formatDateTime}
            hideHeading
          />
        </OverviewAccordion>
      )}

      {isOverviewTab && (
        <OverviewAccordion
          title="Matches"
          subtitle={t.format === "round_robin"
            ? "Regular-season games are listed by day."
            : "Group-stage matches are listed by day."}
          isOpen={overviewOpen.matches}
          onToggle={() => toggleOverviewSection("matches")}
        >
          {dayListMatches.length > 0 && (
            <div className="grid gap-2 lg:grid-cols-[1fr_170px_170px_170px_auto]">
              <input
                className="input"
                placeholder="Search by team, round, status, or match ID..."
                value={matchQuery}
                onChange={(event) => setMatchQuery(event.target.value)}
              />
              <select
                className="input"
                value={matchStatusFilter}
                onChange={(event) => setMatchStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="finished">Finished</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                className="input"
                value={matchDateFilter}
                onChange={(event) => setMatchDateFilter(event.target.value)}
              >
                <option value="all">All dates</option>
                {matchDayOptions.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select
                className="input"
                value={matchVenueFilter}
                onChange={(event) => setMatchVenueFilter(event.target.value)}
              >
                <option value="all">All courts</option>
                <option value="none">Court TBD</option>
                {venueNames.map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
              <div className="flex items-center text-sm font-semibold text-slate-500">
                Showing {filteredDayListMatches.length} of {dayListMatches.length}
              </div>
            </div>
          )}

          {groupedByDay.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-slate-800">Matches by day</h3>
              {groupedByDay.map(([day, list]) => (
                <div key={day} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{day}</div>
                  <div className="grid gap-1.5">
                    {list.map((m) => (
                      <div key={m.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                        <Link to={`/matches/${m.id}`} className="block transition hover:text-sky-700">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">#{m.id} - R{m.round_number} - {m.status}</span>
                            <span>{formatDateTime(m.scheduled_at)} · {venueLabel(m.venue_slot ?? m.venue_id)}</span>
                          </div>
                          {hasFinishedResult(m) ? (
                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-t border-slate-100 pt-2">
                              <div className="truncate text-right text-sm font-medium text-slate-900">
                                {resolveTeamName(m, "home") || "TBD"}
                              </div>
                              <div className="min-w-[74px] text-center text-lg font-bold tracking-tight text-slate-900">
                                {m.home_score}-{m.away_score}
                              </div>
                              <div className="truncate text-sm font-medium text-slate-900">
                                {resolveTeamName(m, "away") || "TBD"}
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm font-medium text-slate-900">
                              {(resolveTeamName(m, "home") || "TBD")} vs {(resolveTeamName(m, "away") || "TBD")}
                            </div>
                          )}
                          {m.status === "finished" && !hasFinishedResult(m) && (
                            <div className="mt-1 text-sm font-semibold text-slate-700">
                              Result pending
                            </div>
                          )}
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {matches.length === 0 && (
            <EmptyState
              title="No matches yet"
              description={isAdmin ? "Lock participants and generate a schedule, or add matches manually in the admin tab." : "The schedule has not been published yet."}
            />
          )}
          {dayListMatches.length > 0 && groupedByDay.length === 0 && (
            <EmptyState
              title="No matches found"
              description="Try changing the search text or status filter."
            />
          )}
        </OverviewAccordion>
      )}

        <BracketSimulatorModal
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          bracketRounds={bracketRounds}
          roundLabel={roundLabel}
          playoffName={playoffName}
        />

        <GroupsPlayoffsSimulatorModal
          isOpen={isGroupsSimulatorOpen}
          onClose={() => setIsGroupsSimulatorOpen(false)}
          format={t.format}
          matches={matches}
          bracketRounds={bracketRounds}
          roundLabel={roundLabel}
          resolveTeamName={resolveTeamName}
          formatDateTime={formatDateTime}
        />

      <PdfExportModal
        isOpen={isPdfModalOpen}
        title="Configure tournament PDF"
        subtitle="Choose which tournament sections should be included in the exported report."
        options={tournamentPdfOptions}
        selections={pdfSections}
        onToggle={togglePdfSection}
        onClose={() => setIsPdfModalOpen(false)}
        onConfirm={exportPdf}
        confirmLabel="Export tournament PDF"
        loading={isExportingPdf}
      />
    </div>
  );
}


