import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { tournamentsApi } from "../api/tournaments";
import { matchesApi } from "../api/matches";
import { teamsApi } from "../api/teams";
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

const defaultPdfSections = {
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

const TIME_SLOT_COUNTS = [2, 4, 6, 8];
const GROUPS_PLAYOFFS_TEAM_COUNTS = [4, 8, 16, 32];
const SINGLE_ELIMINATION_TEAM_COUNTS = [4, 8, 16, 32];
const ROUND_ROBIN_ADVANCE_COUNTS = [2, 4, 8, 16, 32];
const RULE_LABEL_CLASS = "flex min-h-[2.75rem] items-end text-sm font-medium text-slate-700";
const DEFAULT_TIME_SLOTS = ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "09:00", "11:00"];

function normalizeTimeSlots(value) {
  const slots = Array.isArray(value) ? value : String(value || "").split(",");
  return slots.map((slot) => String(slot || "").trim()).filter(Boolean);
}

function resizeTimeSlots(slots, count) {
  const current = normalizeTimeSlots(slots);
  return Array.from({ length: count }, (_, index) => current[index] || DEFAULT_TIME_SLOTS[index] || "12:00");
}

function normalizeGamesPerDay(value, fallback = 4) {
  const count = Number(value) || fallback;
  return TIME_SLOT_COUNTS.includes(count) ? count : fallback;
}

function normalizeGroupPlayoffTeamCount(value) {
  const count = Number(value) || 8;
  return GROUPS_PLAYOFFS_TEAM_COUNTS.includes(count) ? count : 8;
}

function normalizeSingleEliminationTeamCount(value) {
  const count = Number(value) || 8;
  return SINGLE_ELIMINATION_TEAM_COUNTS.includes(count) ? count : 8;
}

function isPowerOfTwo(value) {
  return value >= 2 && (value & (value - 1)) === 0;
}

function groupRuleOptions(teamCount) {
  const total = Number(teamCount) || 8;
  const options = [];
  [4, 8].forEach((groupSize) => {
    if (groupSize > total || total % groupSize !== 0) return;
    for (let advance = 1; advance < groupSize; advance += 1) {
      const playoffTeams = (total / groupSize) * advance;
      if (isPowerOfTwo(playoffTeams)) {
        options.push({ groupSize, advance, playoffTeams });
      }
    }
  });
  return options;
}

function normalizeGroupRules(teamCount, groupSize, advance) {
  const options = groupRuleOptions(teamCount);
  return options.find((opt) => opt.groupSize === Number(groupSize) && opt.advance === Number(advance)) || options[0];
}

function roundRobinAdvanceOptions(teamCount) {
  const total = Math.max(2, Number(teamCount) || 8);
  return ROUND_ROBIN_ADVANCE_COUNTS.filter((count) => count <= total);
}

function normalizeRoundRobinAdvance(teamCount, advance) {
  const options = roundRobinAdvanceOptions(teamCount);
  const selected = Number(advance);
  return options.includes(selected) ? selected : options[0];
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

function TeamLogo({ logoUrl, name, className = "team-logo-tiny" }) {
  if (!logoUrl) return null;

  return (
    <img
      className={className}
      src={logoUrl}
      alt={`${name || "Team"} logo`}
      loading="lazy"
    />
  );
}

function TeamIdentity({ name, logoUrl, className = "" }) {
  return (
    <span className={`team-identity ${className}`}>
      <TeamLogo logoUrl={logoUrl} name={name} />
      <span className="team-identity__name">{name}</span>
    </span>
  );
}

export default function TournamentView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const [t, setT] = useState(null);
  const [teams, setTeams] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [feasibility, setFeasibility] = useState(null);
  const [standings, setStandings] = useState([]);
  const [groupTables, setGroupTables] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);

  const [teamIdsToAdd, setTeamIdsToAdd] = useState([]);
  const [editForm, setEditForm] = useState({
    name: "",
    banner_url: "",
    end_date: "",
    format: "round_robin",
    status: "draft",
    max_teams: "",
    venue_name: "",
    time_slots: ["12:00", "14:00", "16:00", "18:00"],
    playoff_round_gap_days: 1,
    groups_to_playoffs_gap_days: 1,
    group_size: 4,
    group_advance_count: 2,
    stage_day_gap_days: 0,
    group_games_per_day: 4,
  });
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isGroupsSimulatorOpen, setIsGroupsSimulatorOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfSections, setPdfSections] = useState(defaultPdfSections);
  const [activeTab, setActiveTab] = useState("overview");
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [matchQuery, setMatchQuery] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState("all");
  const [matchDateFilter, setMatchDateFilter] = useState("all");
  const [matchVenueFilter, setMatchVenueFilter] = useState("all");
  const [participationNote, setParticipationNote] = useState("");
  const [rejectNotes, setRejectNotes] = useState({});
  const [busyRequestIds, setBusyRequestIds] = useState(() => new Set());
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

  const teamLogoById = useMemo(
    () =>
      teams.reduce((acc, tm) => {
        if (tm?.team_id && tm?.team?.logo_url) {
          acc[tm.team_id] = tm.team.logo_url;
        }
        return acc;
      }, {}),
    [teams],
  );

  const approvedTeamIds = useMemo(
    () => new Set(teams.map((tm) => Number(tm.team_id)).filter(Number.isFinite)),
    [teams],
  );

  const freeTeams = useMemo(
    () => allTeams.filter((tm) => !approvedTeamIds.has(Number(tm.id))),
    [allTeams, approvedTeamIds],
  );

  const slotsLeft = useMemo(() => {
    const maxTeams = Number(t?.max_teams);
    if (!Number.isFinite(maxTeams) || maxTeams <= 0) return null;
    return Math.max(0, maxTeams - teams.length);
  }, [t?.max_teams, teams.length]);

  const canPickMore = slotsLeft === null || teamIdsToAdd.length < slotsLeft;

  useEffect(() => {
    const availableIds = new Set(freeTeams.map((tm) => Number(tm.id)));
    setTeamIdsToAdd((current) => {
      const filtered = current.filter((teamId) => availableIds.has(Number(teamId)));
      return slotsLeft === null ? filtered : filtered.slice(0, slotsLeft);
    });
  }, [freeTeams, slotsLeft]);

  const toggleAddTeam = (teamId) => {
    const normalizedId = Number(teamId);
    if (!Number.isFinite(normalizedId)) return;

    setTeamIdsToAdd((current) => {
      if (current.includes(normalizedId)) {
        return current.filter((idValue) => idValue !== normalizedId);
      }
      if (slotsLeft !== null && current.length >= slotsLeft) {
        return current;
      }
      return [...current, normalizedId];
    });
  };

  const selectAllTeams = () => {
    const limit = slotsLeft === null ? freeTeams.length : slotsLeft;
    setTeamIdsToAdd(freeTeams.slice(0, limit).map((tm) => Number(tm.id)));
  };

  const pickedTeamNames = useMemo(() => {
    const namesById = new Map(allTeams.map((tm) => [Number(tm.id), tm.name]));
    return teamIdsToAdd.map((teamId) => namesById.get(Number(teamId))).filter(Boolean);
  }, [allTeams, teamIdsToAdd]);

  const seedOptions = useMemo(() => {
    const maxTeams = Number(t?.max_teams) || teams.length || 0;
    return Array.from({ length: maxTeams }, (_, index) => index + 1);
  }, [t?.max_teams, teams.length]);

  const usedSeedsByTeamId = useMemo(
    () =>
      teams.reduce((acc, tm) => {
        const seed = Number(tm.seed);
        if (Number.isFinite(seed) && seed > 0) {
          acc[Number(tm.team_id)] = seed;
        }
        return acc;
      }, {}),
    [teams],
  );

  const approvedTeamsByAddedDate = useMemo(
    () =>
      [...teams].sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftTime !== rightTime) return leftTime - rightTime;
        return Number(left.id || 0) - Number(right.id || 0);
      }),
    [teams],
  );

  const defaultVenueName = useMemo(() => {
    const directName = String(t?.venue_name || editForm.venue_name || "").trim();
    if (directName) return directName;
    if (Array.isArray(t?.venue_names) && t.venue_names.length > 0) {
      return String(t.venue_names[0] || "").trim();
    }
    return "";
  }, [editForm.venue_name, t?.venue_name, t?.venue_names]);

  const venueLabel = useCallback((matchRow) => {
    const override = String(matchRow?.venue_name || "").trim();
    return override || defaultVenueName || "Venue TBD";
  }, [defaultVenueName]);

  const venueFilterOptions = useMemo(() => {
    const names = new Set();
    if (defaultVenueName) names.add(defaultVenueName);
    matches.forEach((matchRow) => {
      const name = String(matchRow?.venue_name || "").trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [defaultVenueName, matches]);

  const planningCopy = useMemo(() => stagePlanningCopy(editForm.format), [editForm.format]);
  const groupAdvanceLimit = Math.max(1, Number(t?.group_advance_count || editForm.group_advance_count || 2));
  const groupOptions = useMemo(() => groupRuleOptions(editForm.max_teams), [editForm.max_teams]);
  const selectedGroupRule = useMemo(
    () => normalizeGroupRules(editForm.max_teams, editForm.group_size, editForm.group_advance_count),
    [editForm.group_advance_count, editForm.group_size, editForm.max_teams],
  );
  const roundRobinOptions = useMemo(() => roundRobinAdvanceOptions(editForm.max_teams), [editForm.max_teams]);
  const selectedRoundRobinAdvance = useMemo(
    () => normalizeRoundRobinAdvance(editForm.max_teams, editForm.group_advance_count),
    [editForm.group_advance_count, editForm.max_teams],
  );

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

  const resolveTeamLogo = useCallback((matchRow, side) => {
    const idKey = side === "home" ? "home_team_id" : "away_team_id";
    const camelRelation = side === "home" ? "homeTeam" : "awayTeam";
    const snakeRelation = side === "home" ? "home_team" : "away_team";
    const teamId = matchRow?.[idKey];

    return (
      matchRow?.[camelRelation]?.logo_url ||
      matchRow?.[snakeRelation]?.logo_url ||
      teamLogoById[teamId] ||
      null
    );
  }, [teamLogoById]);

  const standingsTeamLogo = useCallback((row) => row?.logo_url || teamLogoById[row?.team_id] || null, [teamLogoById]);

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
      banner_url: tRes.data?.banner_url || "",
      end_date: tRes.data?.end_date || "",
      format: tRes.data?.format || "round_robin",
      status: tRes.data?.status || "draft",
      max_teams: tRes.data?.max_teams || "",
      venue_name: tRes.data?.venue_name || (Array.isArray(tRes.data?.venue_names) ? tRes.data.venue_names[0] || "" : ""),
      time_slots: Array.isArray(tRes.data?.time_slots) && tRes.data.time_slots.length > 0
        ? resizeTimeSlots(tRes.data.time_slots, normalizeGamesPerDay(tRes.data?.group_games_per_day, 4))
        : ["12:00", "14:00", "16:00", "18:00"],
      playoff_round_gap_days: tRes.data?.playoff_round_gap_days ?? 1,
      groups_to_playoffs_gap_days: tRes.data?.groups_to_playoffs_gap_days ?? 1,
      group_size: tRes.data?.group_size ?? 4,
      group_advance_count: tRes.data?.group_advance_count ?? 2,
      stage_day_gap_days: tRes.data?.stage_day_gap_days ?? 0,
      group_games_per_day: normalizeGamesPerDay(tRes.data?.group_games_per_day, 4),
    });
    setTeams(teamRes.data);
    setMatches(matchesRes.data);
    setMatchEdits((matchesRes.data || []).reduce((acc, matchRow) => {
      acc[matchRow.id] = {
        scheduled_at: matchRow.scheduled_at ? matchRow.scheduled_at.slice(0, 16) : "",
        venue_name: matchRow.venue_name || "",
        status: matchRow.status || "scheduled",
      };
      return acc;
    }, {}));
    setFeasibility(feasibilityRes.data);
    setStandings(
      Array.isArray(standingsRes.data)
        ? standingsRes.data
        : Array.isArray(standingsRes.data?.rows)
          ? standingsRes.data.rows
          : [],
    );
    setGroupTables(Array.isArray(standingsRes.data?.groups) ? standingsRes.data.groups : []);

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

  const reloadParticipationContext = useCallback(async () => {
    const calls = [
      tournamentsApi.teams(id),
      tournamentsApi.feasibility(id),
    ];

    if (isAdmin) {
      calls.push(tournamentsApi.participationRequests(id));
    }

    if (isManager) {
      calls.push(tournamentsApi.myParticipationRequests(id));
    }

    const responses = await Promise.all(calls);
    setTeams(responses[0].data);
    setFeasibility(responses[1].data);

    let index = 2;
    if (isAdmin) {
      setAdminRequests(responses[index].data);
      index += 1;
    }
    if (isManager) {
      setMyRequests(responses[index].data || []);
    }
  }, [id, isAdmin, isManager]);

  const setRequestBusy = (requestId, busy) => {
    setBusyRequestIds((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(requestId);
      } else {
        next.delete(requestId);
      }
      return next;
    });
  };

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
    banner_url: String(editForm.banner_url || "").trim() || null,
    venue_name: String(editForm.venue_name || "").trim() || null,
    time_slots: resizeTimeSlots(editForm.time_slots, Number(editForm.group_games_per_day) || 4),
    playoff_round_gap_days: Math.max(0, Number(editForm.playoff_round_gap_days) || 0),
    groups_to_playoffs_gap_days: planningCopy.usesStagePlanning ? Math.max(0, Number(editForm.groups_to_playoffs_gap_days) || 0) : 0,
    group_size: editForm.format === "groups_playoffs" ? selectedGroupRule?.groupSize : 4,
    group_advance_count: editForm.format === "groups_playoffs" ? selectedGroupRule?.advance : editForm.format === "round_robin" ? selectedRoundRobinAdvance : 2,
    stage_day_gap_days: planningCopy.usesStagePlanning ? Math.max(0, Number(editForm.stage_day_gap_days) || 0) : 0,
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
    if (editForm.format === "groups_playoffs" && (!GROUPS_PLAYOFFS_TEAM_COUNTS.includes(Number(editForm.max_teams)) || !selectedGroupRule)) {
      const message = "Choose a team count and group setup that creates a clean playoff bracket.";
      setErr(message);
      if (!silent) showToast(message, "error");
      return null;
    }
    if (editForm.format === "round_robin" && !roundRobinAdvanceOptions(editForm.max_teams).includes(selectedRoundRobinAdvance)) {
      const message = "Choose how many teams advance to the playoff bracket.";
      setErr(message);
      if (!silent) showToast(message, "error");
      return null;
    }
    if (editForm.format === "single_elimination" && !SINGLE_ELIMINATION_TEAM_COUNTS.includes(Number(editForm.max_teams))) {
      const message = "Single elimination supports 4, 8, 16, or 32 teams.";
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
    if (busyRequestIds.has(requestId)) return;
    setRequestBusy(requestId, true);
    try {
      await tournamentsApi.approveRequest(requestId);
      await reloadParticipationContext();
      showToast("Request approved.");
    } catch (e) {
      handleActionError(e, "Failed to approve request.");
    } finally {
      setRequestBusy(requestId, false);
    }
  };

  const rejectRequest = async (requestId) => {
    if (!isAdmin) return;
    if (busyRequestIds.has(requestId)) return;
    setRequestBusy(requestId, true);
    try {
      await tournamentsApi.rejectRequest(requestId, { note: rejectNotes[requestId]?.trim() || null });
      setRejectNotes((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      await reloadParticipationContext();
      showToast("Request rejected.");
    } catch (e) {
      handleActionError(e, "Failed to reject request.");
    } finally {
      setRequestBusy(requestId, false);
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
    if (busyRequestIds.has(requestId)) return;
    setRequestBusy(requestId, true);
    try {
      await tournamentsApi.removeRequest(requestId);
      await reloadParticipationContext();
      showToast("Request removed.");
    } catch (e) {
      handleActionError(e, "Failed to remove request.");
    } finally {
      setRequestBusy(requestId, false);
    }
  };

  const addTeam = async () => {
    if (!isAdmin || teamIdsToAdd.length === 0) return;
    setErr("");
    const availableIds = new Set(freeTeams.map((tm) => Number(tm.id)));
    const teamIds = teamIdsToAdd
      .map(Number)
      .filter((teamId) => Number.isFinite(teamId) && availableIds.has(teamId))
      .slice(0, slotsLeft === null ? undefined : slotsLeft);

    if (teamIds.length === 0) return;

    let addedCount = 0;
    let firstError = "";

    for (const teamId of teamIds) {
      try {
        await tournamentsApi.addTeam(id, { team_id: teamId });
        addedCount += 1;
      } catch (e) {
        firstError = firstError || e?.response?.data?.message || e.message || "Failed to add team.";
      }
    }

    setTeamIdsToAdd([]);
    setIsTeamPickerOpen(false);
    await load();

    if (firstError) {
      const message = addedCount > 0
        ? `${addedCount} team${addedCount === 1 ? "" : "s"} added, but another team could not be added: ${firstError}`
        : firstError;
      setErr(message);
      showToast(message, "error");
    } else {
      showToast(`${addedCount} team${addedCount === 1 ? "" : "s"} added to tournament.`);
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

  const updateTeamSeed = async (teamId, value) => {
    if (!isAdmin || t?.participants_locked) return;
    const seed = value === "" ? null : Number(value);
    if (seed !== null && (!Number.isFinite(seed) || seed < 1)) return;

    setErr("");
    try {
      const response = await tournamentsApi.updateTeam(id, teamId, { seed });
      setTeams((current) =>
        current.map((tm) => (Number(tm.team_id) === Number(teamId) ? response.data : tm)),
      );
      showToast(seed ? `Seed ${seed} saved.` : "Seed cleared.");
    } catch (e) {
      handleActionError(e, "Failed to update seed.");
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
      const venueName = venueLabel(matchRow);
      const venueKey = venueName === "Venue TBD" ? "none" : venueName;
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
        venueName,
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
        venue_name: draft.venue_name?.trim() || null,
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
  const displayStartDate = matches.length > 0 ? t?.start_date : null;
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
        {t.banner_url ? (
          <img className="tournament-hero-banner" src={t.banner_url} alt={`${t.name} banner`} />
        ) : null}
        <div className="section-heading">
          <div>
            <p className="section-heading__eyebrow">Tournament Hub</p>
            <h1 className="section-heading__title">{t.name || `Tournament #${t.id}`}</h1>
            <p className="section-heading__copy">Tournament #{t.id} - {t.format} - {t.status}</p>
          </div>
          <div className="list-card__meta">
            <button type="button" onClick={() => setIsPdfModalOpen(true)} disabled={isExportingPdf} className="btn-secondary">
              {isExportingPdf ? "Exporting..." : "Export PDF"}
            </button>
            <span className="list-tag">Starts {displayStartDate || "TBD"}</span>
            {t.end_date ? <span className="list-tag">Ends {t.end_date}</span> : null}
            {t.max_teams ? <span className="list-tag">{t.max_teams} team cap</span> : null}
          </div>
        </div>

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
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Tournament name</label>
                <input className="input" placeholder="Tournament name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Banner URL</label>
                <input className="input" placeholder="https://..." value={editForm.banner_url} onChange={(e) => setEditForm({ ...editForm, banner_url: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Tournament format</label>
                <select
                  className="input"
                  value={editForm.format}
                  onChange={(e) => {
                    const nextFormat = e.target.value;
                    setEditForm({
                      ...editForm,
                      format: nextFormat,
                      max_teams: nextFormat === "groups_playoffs"
                        ? normalizeGroupPlayoffTeamCount(editForm.max_teams)
                        : nextFormat === "single_elimination"
                          ? normalizeSingleEliminationTeamCount(editForm.max_teams)
                          : editForm.max_teams,
                      ...(nextFormat === "groups_playoffs"
                        ? {
                            group_size: normalizeGroupRules(normalizeGroupPlayoffTeamCount(editForm.max_teams), editForm.group_size, editForm.group_advance_count)?.groupSize || 4,
                            group_advance_count: normalizeGroupRules(normalizeGroupPlayoffTeamCount(editForm.max_teams), editForm.group_size, editForm.group_advance_count)?.advance || 2,
                          }
                        : nextFormat === "round_robin"
                          ? {
                              group_size: 4,
                              group_advance_count: normalizeRoundRobinAdvance(editForm.max_teams, editForm.group_advance_count),
                            }
                          : { group_size: 4, group_advance_count: 2 }),
                    });
                  }}
                >
                  <option value="round_robin">round_robin</option>
                  <option value="groups_playoffs">groups_playoffs</option>
                  <option value="single_elimination">single_elimination</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Max teams</label>
                {editForm.format === "groups_playoffs" || editForm.format === "single_elimination" ? (
                  <div key={`${editForm.format}-max-teams`} className="grid gap-2 grid-cols-4">
                    {(editForm.format === "groups_playoffs" ? GROUPS_PLAYOFFS_TEAM_COUNTS : SINGLE_ELIMINATION_TEAM_COUNTS).map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={Number(editForm.max_teams) === count ? "btn-primary" : "btn-secondary"}
                        onClick={() => {
                          const rule = normalizeGroupRules(count, editForm.group_size, editForm.group_advance_count);
                          setEditForm({
                            ...editForm,
                            max_teams: count,
                            ...(editForm.format === "groups_playoffs" && rule ? { group_size: rule.groupSize, group_advance_count: rule.advance } : {}),
                          });
                        }}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    key="open-max-teams"
                    className="input"
                    type="number"
                    min={2}
                    max={512}
                    placeholder="Max teams"
                    value={editForm.max_teams}
                    onChange={(e) => {
                      const maxTeams = e.target.value;
                      setEditForm({
                        ...editForm,
                        max_teams: maxTeams,
                        group_advance_count: normalizeRoundRobinAdvance(maxTeams, editForm.group_advance_count),
                      });
                    }}
                  />
                )}
              </div>
              <div className="space-y-1">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Final day</label>
                  <input className="input" type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
                </div>
              </div>
            </div>
            {editForm.format === "round_robin" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Teams advancing to playoffs</label>
                <select
                  className="input"
                  value={selectedRoundRobinAdvance}
                  onChange={(e) => setEditForm({ ...editForm, group_advance_count: Number(e.target.value) })}
                >
                  {roundRobinOptions.map((count) => (
                    <option key={count} value={count}>Top {count} teams</option>
                  ))}
                </select>
              </div>
            ) : null}

            {editForm.format === "groups_playoffs" && selectedGroupRule ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold text-slate-700">Group setup</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {groupOptions.map((option) => (
                    <button
                      key={`${option.groupSize}-${option.advance}`}
                      type="button"
                      className={selectedGroupRule.groupSize === option.groupSize && selectedGroupRule.advance === option.advance ? "btn-primary" : "btn-secondary"}
                      onClick={() => setEditForm({ ...editForm, group_size: option.groupSize, group_advance_count: option.advance })}
                    >
                      Groups of {option.groupSize}, top {option.advance} advance ({option.playoffTeams} playoff teams)
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {editForm.end_date && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                The scheduler will treat <span className="font-semibold">{editForm.end_date}</span> as the last tournament day and automatically place earlier rounds before it.
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Status</label>
                <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="finished">finished</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>
            <div className={`grid grid-cols-1 gap-2 ${planningCopy.usesStagePlanning ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
              <div className="space-y-1">
                <label className={RULE_LABEL_CLASS}>Days between playoff rounds</label>
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
                  <label className={RULE_LABEL_CLASS}>{planningCopy.gapLabel}</label>
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
                  <label className={RULE_LABEL_CLASS}>Days between {planningCopy.stageName} match days</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={30}
                    value={editForm.stage_day_gap_days}
                    onChange={(e) => setEditForm({ ...editForm, stage_day_gap_days: e.target.value })}
                  />
                </div>
              )}
              {planningCopy.usesStagePlanning && (
                <div className="space-y-1">
                  <label className={RULE_LABEL_CLASS}>{planningCopy.capLabel}</label>
                  <select
                    className="input"
                    value={editForm.group_games_per_day}
                    onChange={(e) => {
                      const count = Number(e.target.value);
                      setEditForm({
                        ...editForm,
                        group_games_per_day: count,
                        time_slots: resizeTimeSlots(editForm.time_slots, count),
                      });
                    }}
                  >
                    {TIME_SLOT_COUNTS.map((count) => (
                      <option key={count} value={count}>{count} games per day</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Default venue</label>
              <input
                className="input"
                placeholder="Main Arena"
                value={editForm.venue_name}
                onChange={(e) => setEditForm({ ...editForm, venue_name: e.target.value })}
              />
              <div className="text-xs text-slate-500">Generated matches use this venue unless a match-specific override is entered below.</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Daily time slots</label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {resizeTimeSlots(editForm.time_slots, Number(editForm.group_games_per_day) || 4).map((slot, index) => (
                  <input
                    key={index}
                    className="input"
                    type="time"
                    value={slot}
                    onChange={(e) => {
                      const nextSlots = [...normalizeTimeSlots(editForm.time_slots)];
                      nextSlots[index] = e.target.value;
                      setEditForm({ ...editForm, time_slots: nextSlots });
                    }}
                  />
                ))}
              </div>
              <div className="text-xs text-slate-500">Set one start time for each match allowed on a generated match day.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveTournament} className="btn-primary">Save tournament</button>
              <button onClick={deleteTournament} className="btn-danger">Delete tournament</button>
              {!t.participants_locked ? (
                <button onClick={lockParticipants} className="btn-secondary">Lock participants</button>
              ) : (
                <button
                  onClick={unlockParticipants}
                  disabled={matches.length > 0}
                  title={matches.length > 0 ? "Clear the schedule before unlocking participants." : undefined}
                  className="btn-secondary"
                >
                  {matches.length > 0 ? "Clear schedule to unlock" : "Unlock participants"}
                </button>
              )}
            </div>
          </div>

          {adminRequests.length > 0 && (
        <div className="panel space-y-3 p-4">
          <h2 className="text-xl font-semibold text-slate-900">Participation requests</h2>
          <div className="grid gap-2">
            {adminRequests.map((r) => (
              <div key={r.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">
                  {r.team_id ? (
                    <Link to={`/teams/${r.team_id}`} className="underline decoration-slate-300 underline-offset-2 hover:text-sky-700">
                      {r.team?.name || `Team ${r.team_id}`}
                    </Link>
                  ) : (
                    r.team?.name || `Team ${r.team_id}`
                  )} - {r.status}
                </div>
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
                      <button onClick={() => approveRequest(r.id)} disabled={busyRequestIds.has(r.id)} className="btn-primary">
                        {busyRequestIds.has(r.id) ? "Working..." : "Approve"}
                      </button>
                      <button onClick={() => rejectRequest(r.id)} disabled={busyRequestIds.has(r.id)} className="btn-danger">
                        Reject
                      </button>
                    </div>
                  </div>
                )}
                {r.status !== "pending" && (
                  <div className="mt-2">
                    <button onClick={() => removeRequest(r.id)} disabled={busyRequestIds.has(r.id)} className="btn-danger">
                      {busyRequestIds.has(r.id) ? "Working..." : "Remove request"}
                    </button>
                  </div>
                )}
                {r.status === "pending" && (
                  <div className="mt-2">
                    <button onClick={() => removeRequest(r.id)} disabled={busyRequestIds.has(r.id)} className="btn-secondary">
                      {busyRequestIds.has(r.id) ? "Working..." : "Remove request"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel approved-teams-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Approved teams</h2>
            <p className="text-sm text-slate-500">Only approved teams are used for scheduling.</p>
          </div>
        </div>

        {isAdmin && !t.participants_locked && (
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <button
                type="button"
                className="input flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setIsTeamPickerOpen((open) => !open)}
                disabled={freeTeams.length === 0 || slotsLeft === 0}
              >
                <span className="min-w-0 truncate">
                  {pickedTeamNames.length === 0
                    ? slotsLeft === 0
                      ? "Team limit reached"
                      : "Select teams to add..."
                    : pickedTeamNames.length <= 2
                      ? pickedTeamNames.join(", ")
                      : `${pickedTeamNames.slice(0, 2).join(", ")} +${pickedTeamNames.length - 2}`}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {slotsLeft === null ? `${teamIdsToAdd.length} selected` : `${teamIdsToAdd.length}/${slotsLeft}`}
                </span>
              </button>

              {isTeamPickerOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 border border-slate-300 bg-white shadow-lg">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={selectAllTeams}
                      disabled={freeTeams.length === 0 || slotsLeft === 0}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-950 disabled:text-slate-300"
                    >
                      Select available
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamIdsToAdd([])}
                      disabled={teamIdsToAdd.length === 0}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-950 disabled:text-slate-300"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto p-1">
                    {freeTeams.length > 0 ? freeTeams.map((tm) => {
                      const teamId = Number(tm.id);
                      const checked = teamIdsToAdd.includes(teamId);
                      const disabled = !checked && !canPickMore;

                      return (
                        <label
                          key={tm.id}
                          className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-sm leading-tight hover:bg-slate-50 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleAddTeam(teamId)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900">{tm.name}</span>
                            <span className="block truncate text-[11px] text-slate-500">{tm.city || "No city"}</span>
                          </span>
                        </label>
                      );
                    }) : (
                      <div className="px-2 py-3 text-sm text-slate-500">No available teams to add.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button type="button" onClick={addTeam} disabled={teamIdsToAdd.length === 0} className="btn-secondary">
              Add selected teams
            </button>
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-2">
          {approvedTeamsByAddedDate.map((tm) => (
            <div
              key={tm.id}
              role="button"
              tabIndex={0}
              onClick={() => nav(`/teams/${tm.team_id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  nav(`/teams/${tm.team_id}`);
                }
              }}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 transition hover:border-sky-300 hover:bg-slate-50"
            >
              <div className="flex min-w-0 items-center gap-2 text-sm select-none">
                {tm.team?.logo_url ? (
                  <img className="team-logo-small" src={tm.team.logo_url} alt={`${tm.team?.name || "Team"} logo`} />
                ) : null}
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">{tm.team?.name || `Team ${tm.team_id}`}</span>
                  <span className="text-slate-500"> - {tm.team?.city || "No city"}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isAdmin && !t.participants_locked ? (
                  <label
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Seed
                    <select
                      className="input h-8 min-w-[72px] px-2 py-1 text-xs"
                      value={tm.seed || ""}
                      onChange={(e) => updateTeamSeed(tm.team_id, e.target.value)}
                    >
                      <option value="">None</option>
                      {seedOptions
                        .filter((seed) => !Object.entries(usedSeedsByTeamId).some(
                          ([teamId, usedSeed]) => Number(teamId) !== Number(tm.team_id) && Number(usedSeed) === seed,
                        ))
                        .map((seed) => (
                          <option key={seed} value={seed}>
                            {seed}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : tm.seed ? (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Seed {tm.seed}</span>
                ) : null}
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
      </div>

          <div className="panel space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Match controls</h2>
                <p className="text-sm text-slate-500">Generate a schedule, clear it, or edit existing match slots without leaving the admin view.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={generate} className="btn-primary">Generate schedule</button>
                <button onClick={clear} className="btn-danger">Clear all matches</button>
              </div>
            </div>

            {sortedMatches.length > 0 && (
              <div className="space-y-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Schedule editor</h3>
                  <p className="text-sm text-slate-500">Adjust match time, venue override, and status without opening each match page.</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Match</th>
                        <th className="px-3 py-2 font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Venue override</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMatches.map((matchRow) => (
                        <tr key={matchRow.id} className="border-t border-slate-100">
                          <td className="min-w-[220px] px-3 py-2">
                            <Link to={`/matches/${matchRow.id}`} className="font-semibold text-slate-900 hover:text-sky-700">
                              {resolveTeamName(matchRow, "home") || "TBD"} vs {resolveTeamName(matchRow, "away") || "TBD"}
                            </Link>
                            <div className="text-xs text-slate-500">Round {matchRow.round_number || "-"} - {matchRow.stage || "regular"}</div>
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
                            <input
                              className="input min-w-[190px]"
                              placeholder={defaultVenueName || "Venue TBD"}
                              value={matchEdits[matchRow.id]?.venue_name ?? ""}
                              onChange={(event) => updateMatchEdit(matchRow.id, "venue_name", event.target.value)}
                            />
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
              <Link
                key={`overview-${tm.id ?? tm.team_id}`}
                to={`/teams/${tm.team_id}`}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 transition hover:border-sky-300 hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm select-none">
                  <TeamLogo logoUrl={tm.team?.logo_url} name={tm.team?.name} className="team-logo-small" />
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">{tm.team?.name || `Team ${tm.team_id}`}</span>
                    <span className="text-slate-500"> - {tm.team?.city || "No city"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {tm.seed ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Seed {tm.seed}</span> : null}
                </div>
              </Link>
            ))}
            {teams.length === 0 && (
              <EmptyState
                title="No approved teams yet"
                description={isAdmin ? "Approve participation requests or add a team directly before generating a schedule." : "Teams will appear here after the tournament admin approves them."}
              />
            )}
          </div>
        </OverviewAccordion>
      )}

      {isOverviewTab && t.format === "round_robin" && standings.length > 0 && (
        <OverviewAccordion
          title="Standings Table"
          subtitle={`One league table for the full regular season.${roundRobinQualifiedCount > 0 ? ` Top ${roundRobinQualifiedCount} teams advance to the playoff bracket.` : ""}`}
          isOpen={overviewOpen.standings}
          onToggle={() => toggleOverviewSection("standings")}
          actions={
            <button type="button" onClick={() => setIsGroupsSimulatorOpen(true)} className="btn-secondary">
              Simulate
            </button>
          }
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
                {standings.map((row) => (
                  <tr
                    key={row.team_id}
                    className={roundRobinQualifiedCount > 0 && row.rank <= roundRobinQualifiedCount ? "bg-emerald-50 text-slate-900" : "text-slate-700"}
                  >
                    <td className="px-2 py-1 font-semibold">{row.rank}</td>
                    <td className="px-2 py-1 font-medium">
                      <TeamIdentity name={row.team_name || `Team ${row.team_id}`} logoUrl={standingsTeamLogo(row)} />
                    </td>
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

      {isOverviewTab && t.format === "groups_playoffs" && groupTables.length > 0 && (
        <OverviewAccordion
          title="Group Tables"
          subtitle="Top teams update the playoff bracket automatically as group results come in."
          isOpen={overviewOpen.groups}
          onToggle={() => toggleOverviewSection("groups")}
          actions={
            <button type="button" onClick={() => setIsGroupsSimulatorOpen(true)} className="btn-secondary">
              Simulate
            </button>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {groupTables.map((group) => (
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
                        <tr key={row.team_id} className={row.rank <= groupAdvanceLimit ? "bg-emerald-50 text-slate-900" : "text-slate-700"}>
                          <td className="px-2 py-1 font-semibold">{row.rank}</td>
                          <td className="px-2 py-1 font-medium">
                            <TeamIdentity name={row.team_name || `Team ${row.team_id}`} logoUrl={standingsTeamLogo(row)} />
                          </td>
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
            playoffLogo={resolveTeamLogo}
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
            <div className="grid gap-2 border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1fr_170px_170px_170px_auto]">
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
                <option value="all">All venues</option>
                <option value="none">Venue TBD</option>
                {venueFilterOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
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
                            <span className="font-semibold text-slate-700">R{m.round_number || "-"} - {m.status}</span>
                            <span>{formatDateTime(m.scheduled_at)} - {venueLabel(m)}</span>
                          </div>
                          {hasFinishedResult(m) ? (
                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-t border-slate-100 pt-2">
                              <div className="flex min-w-0 justify-end text-right text-sm font-medium text-slate-900">
                                <TeamIdentity className="team-identity--reverse" name={resolveTeamName(m, "home") || "TBD"} logoUrl={resolveTeamLogo(m, "home")} />
                              </div>
                              <div className="min-w-[74px] text-center text-lg font-bold tracking-tight text-slate-900">
                                {m.home_score}-{m.away_score}
                              </div>
                              <div className="min-w-0 text-sm font-medium text-slate-900">
                                <TeamIdentity name={resolveTeamName(m, "away") || "TBD"} logoUrl={resolveTeamLogo(m, "away")} />
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-900">
                              <TeamIdentity name={resolveTeamName(m, "home") || "TBD"} logoUrl={resolveTeamLogo(m, "home")} />
                              <span className="text-xs font-semibold uppercase text-slate-400">vs</span>
                              <TeamIdentity name={resolveTeamName(m, "away") || "TBD"} logoUrl={resolveTeamLogo(m, "away")} />
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
          resolveTeamLogo={resolveTeamLogo}
          formatDateTime={formatDateTime}
          playoffQualifierCount={roundRobinQualifiedCount}
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



