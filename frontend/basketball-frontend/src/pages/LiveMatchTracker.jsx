import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { matchesApi } from "../api/matches";
import { playersApi } from "../api/players";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useConfirm } from "../components/useConfirm";
import { useToast } from "../components/useToast";

const QUARTER_SECONDS = 10 * 60;
const EVENT_TYPES = [
  { type: "shot", label: "Shot" },
  { type: "free_throw", label: "Free throw" },
  { type: "rebound", label: "Rebound" },
  { type: "block", label: "Block" },
  { type: "steal", label: "Steal" },
  { type: "foul", label: "Foul" },
  { type: "turnover", label: "Turnover" },
  { type: "substitution", label: "Substitution" },
  { type: "quarter_end", label: "Quarter ended" },
];

const initialFlow = {
  open: false,
  type: "",
  teamSide: "",
  playerId: "",
  points: null,
  made: null,
  assistChoice: "",
  assistPlayerId: "",
  reboundChoice: "",
  reboundPlayerId: "",
  blockerId: "",
  shooterId: "",
  shotPoints: null,
  stealPlayerId: "",
  turnoverChoice: "",
  turnoverPlayerId: "",
  outPlayerId: "",
  inPlayerId: "",
  eventElapsed: null,
  eventClock: "",
  eventQuarter: null,
};

function playerName(player) {
  if (!player) return "Unknown player";
  const fullName = `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
  const jersey = player?.jersey_number ?? null;
  return jersey !== null ? `#${jersey} ${fullName || `Player ${player.id}`}` : fullName || `Player ${player.id}`;
}

function teamName(match, side) {
  const camel = side === "home" ? "homeTeam" : "awayTeam";
  const snake = side === "home" ? "home_team" : "away_team";
  const idKey = side === "home" ? "home_team_id" : "away_team_id";
  return match?.[camel]?.name || match?.[snake]?.name || `Team ${match?.[idKey] || ""}`;
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.min(QUARTER_SECONDS, Math.floor(seconds || 0)));
  const remaining = QUARTER_SECONDS - safe;
  const minutes = Math.floor(remaining / 60);
  const rest = String(remaining % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function elapsedFromClock(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const remaining = Number(match[1]) * 60 + Number(match[2]);
  if (remaining < 0 || remaining > QUARTER_SECONDS) return null;
  return QUARTER_SECONDS - remaining;
}

function hasLockedElapsed(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

function emptyTracker(matchId) {
  return {
    matchId: Number(matchId),
    quarter: 1,
    quarterStartedAt: Date.now(),
    timerRunning: false,
    timerStartedAt: null,
    lastElapsed: 0,
    startersConfirmed: false,
    startingLineups: { home: [], away: [] },
    lineups: { home: [], away: [] },
    playerSeconds: {},
    events: [],
    finalized: false,
  };
}

function normalizeTracker(value, matchId) {
  if (!value || Number(value.matchId) !== Number(matchId)) return emptyTracker(matchId);
  return {
    ...emptyTracker(matchId),
    ...value,
    startersConfirmed: Boolean(value.startersConfirmed || (value.events?.length > 0)),
    timerRunning: Boolean(value.timerRunning),
    timerStartedAt: value.timerStartedAt || null,
    startingLineups: {
      home: Array.isArray(value.startingLineups?.home) ? value.startingLineups.home.map(Number) : [],
      away: Array.isArray(value.startingLineups?.away) ? value.startingLineups.away.map(Number) : [],
    },
    lineups: {
      home: Array.isArray(value.lineups?.home) ? value.lineups.home.map(Number) : [],
      away: Array.isArray(value.lineups?.away) ? value.lineups.away.map(Number) : [],
    },
    playerSeconds: value.playerSeconds || {},
    events: Array.isArray(value.events) ? value.events : [],
  };
}

function loadTracker(matchId) {
  try {
    return normalizeTracker(JSON.parse(localStorage.getItem(`live-match-tracker:${matchId}`)), matchId);
  } catch {
    return emptyTracker(matchId);
  }
}

function statRow(player, teamId) {
  return {
    player_id: Number(player.id),
    team_id: Number(teamId),
    minutes: 0,
    played_seconds: 0,
    dnp: false,
    fouled_out: false,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    fouls: 0,
    turnovers: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
  };
}

function increment(row, key, amount = 1) {
  row[key] = (Number(row[key]) || 0) + amount;
}

function eventLabel(event, playersById, match) {
  const player = (id) => playerName(playersById.get(Number(id)));
  const team = event.teamSide === "home" ? teamName(match, "home") : teamName(match, "away");

  if (event.type === "shot") {
    const result = event.made ? "made" : "missed";
    const assist = event.made && event.assistPlayerId ? `, assist ${player(event.assistPlayerId)}` : "";
    const rebound = !event.made && event.reboundPlayerId ? `, rebound ${player(event.reboundPlayerId)}` : "";
    return `${team}: ${player(event.playerId)} ${result} ${event.points}PT${assist}${rebound}`;
  }
  if (event.type === "free_throw") {
    const rebound = !event.made && event.reboundPlayerId ? `, rebound ${player(event.reboundPlayerId)}` : "";
    return `${team}: ${player(event.playerId)} ${event.made ? "made" : "missed"} FT${rebound}`;
  }
  if (event.type === "rebound") return `${team}: rebound by ${player(event.playerId)}`;
  if (event.type === "block") return `${team}: ${player(event.blockerId)} blocked ${player(event.shooterId)} ${event.shotPoints}PT attempt`;
  if (event.type === "steal") {
    const turnover = event.turnoverPlayerId ? `, turnover by ${player(event.turnoverPlayerId)}` : "";
    return `${team}: steal by ${player(event.playerId)}${turnover}`;
  }
  if (event.type === "foul") return `${team}: foul by ${player(event.playerId)}`;
  if (event.type === "turnover") return `${team}: turnover by ${player(event.playerId)}`;
  if (event.type === "substitution") return `${team}: ${player(event.inPlayerId)} in, ${player(event.outPlayerId)} out`;
  if (event.type === "quarter_end") return `Quarter ${event.quarter} ended`;
  return event.type;
}

function calculateStats(tracker, match, homePlayers, awayPlayers) {
  const rowsByPlayer = new Map();
  const ensureRow = (player, teamId) => {
    const id = Number(player.id);
    if (!rowsByPlayer.has(id)) rowsByPlayer.set(id, statRow(player, teamId));
    return rowsByPlayer.get(id);
  };

  homePlayers.forEach((player) => ensureRow(player, match.home_team_id));
  awayPlayers.forEach((player) => ensureRow(player, match.away_team_id));

  tracker.events.forEach((event) => {
    if (event.type === "shot") {
      const row = rowsByPlayer.get(Number(event.playerId));
      if (!row) return;
      increment(row, "fga");
      if (Number(event.points) === 3) increment(row, "tpa");
      if (event.made) {
        increment(row, "fgm");
        increment(row, "points", Number(event.points));
        if (Number(event.points) === 3) increment(row, "tpm");
        if (event.assistPlayerId) {
          const assistRow = rowsByPlayer.get(Number(event.assistPlayerId));
          if (assistRow) increment(assistRow, "assists");
        }
      }
      if (!event.made && event.reboundPlayerId) {
        const reboundRow = rowsByPlayer.get(Number(event.reboundPlayerId));
        if (reboundRow) increment(reboundRow, "rebounds");
      }
    }

    if (event.type === "free_throw") {
      const row = rowsByPlayer.get(Number(event.playerId));
      if (!row) return;
      increment(row, "fta");
      if (event.made) {
        increment(row, "ftm");
        increment(row, "points");
      }
      if (!event.made && event.reboundPlayerId) {
        const reboundRow = rowsByPlayer.get(Number(event.reboundPlayerId));
        if (reboundRow) increment(reboundRow, "rebounds");
      }
    }

    if (event.type === "rebound") {
      const row = rowsByPlayer.get(Number(event.playerId));
      if (row) increment(row, "rebounds");
    }

    if (event.type === "block") {
      const shooterRow = rowsByPlayer.get(Number(event.shooterId));
      const blockerRow = rowsByPlayer.get(Number(event.blockerId));
      if (shooterRow) {
        increment(shooterRow, "fga");
        if (Number(event.shotPoints) === 3) increment(shooterRow, "tpa");
      }
      if (blockerRow) increment(blockerRow, "blocks");
    }

    if (event.type === "steal") {
      const row = rowsByPlayer.get(Number(event.playerId));
      if (row) increment(row, "steals");
      const turnoverRow = rowsByPlayer.get(Number(event.turnoverPlayerId));
      if (turnoverRow) increment(turnoverRow, "turnovers");
    }

    if (event.type === "foul") {
      const row = rowsByPlayer.get(Number(event.playerId));
      if (row) increment(row, "fouls");
    }

    if (event.type === "turnover") {
      const row = rowsByPlayer.get(Number(event.playerId));
      if (row) increment(row, "turnovers");
    }
  });

  for (const [playerId, seconds] of Object.entries(tracker.playerSeconds || {})) {
    const row = rowsByPlayer.get(Number(playerId));
    if (row) {
      row.played_seconds = Math.round(Number(seconds || 0));
      row.minutes = Math.floor(row.played_seconds / 60);
    }
  }

  return Array.from(rowsByPlayer.values()).map((row) => ({
    ...row,
    dnp: row.played_seconds === 0 && row.points === 0 && row.rebounds === 0 && row.assists === 0
      && row.steals === 0 && row.blocks === 0 && row.fouls === 0 && row.turnovers === 0 && row.fga === 0 && row.fta === 0,
  }));
}

function scoreFor(stats, teamId) {
  return stats
    .filter((row) => Number(row.team_id) === Number(teamId))
    .reduce((sum, row) => sum + Number(row.points || 0), 0);
}

function actionButtonClass(selected) {
  return selected ? "btn-primary" : "btn-secondary";
}

function timerButtonClass(kind, active) {
  if (!active) return "btn-secondary";
  return kind === "start"
    ? "btn-secondary tracker-timer-button tracker-timer-button--running"
    : "btn-secondary tracker-timer-button tracker-timer-button--paused";
}

function replaceEventById(events, eventId, nextEvent) {
  return events.map((event) => event.id === eventId ? nextEvent : event);
}

export default function LiveMatchTracker() {
  const { id } = useParams();
  const nav = useNavigate();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const eventBuilderRef = useRef(null);
  const [match, setMatch] = useState(null);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [tracker, setTracker] = useState(() => loadTracker(id));
  const [flow, setFlow] = useState(initialFlow);
  const [editingEventId, setEditingEventId] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const allPlayers = useMemo(() => [...homePlayers, ...awayPlayers], [homePlayers, awayPlayers]);
  const playersById = useMemo(() => new Map(allPlayers.map((player) => [Number(player.id), player])), [allPlayers]);
  const activeIds = useMemo(() => ({
    home: new Set((tracker.lineups.home || []).map(Number)),
    away: new Set((tracker.lineups.away || []).map(Number)),
  }), [tracker.lineups.away, tracker.lineups.home]);

  const currentElapsed = useCallback((state = tracker) => {
    const elapsed = Number(state.lastElapsed || 0) + (
      state.timerRunning && state.timerStartedAt
        ? Math.floor((Date.now() - Number(state.timerStartedAt)) / 1000)
        : 0
    );
    return Math.max(0, Math.min(QUARTER_SECONDS, elapsed));
  }, [tracker]);

  const activePlayers = useCallback((side) => {
    const ids = tracker.lineups?.[side] || [];
    return ids.map((playerId) => playersById.get(Number(playerId))).filter(Boolean);
  }, [playersById, tracker.lineups]);

  const benchPlayers = useCallback((side) => {
    const roster = side === "home" ? homePlayers : awayPlayers;
    return roster.filter((player) => !activeIds[side].has(Number(player.id)));
  }, [activeIds, awayPlayers, homePlayers]);

  const allActivePlayers = useMemo(
    () => [...activePlayers("home"), ...activePlayers("away")],
    [activePlayers],
  );
  const calculatedStats = useMemo(
    () => (match ? calculateStats(tracker, match, homePlayers, awayPlayers) : []),
    [awayPlayers, homePlayers, match, tracker],
  );
  const statsByPlayerId = useMemo(
    () => new Map(calculatedStats.map((row) => [Number(row.player_id), row])),
    [calculatedStats],
  );
  const homeScore = match ? scoreFor(calculatedStats, match.home_team_id) : 0;
  const awayScore = match ? scoreFor(calculatedStats, match.away_team_id) : 0;

  useEffect(() => {
    localStorage.setItem(`live-match-tracker:${id}`, JSON.stringify(tracker));
  }, [id, tracker]);

  useEffect(() => {
    const load = async () => {
      const matchRes = await matchesApi.get(id);
      setMatch(matchRes.data);
      const [homeRes, awayRes] = await Promise.all([
        matchRes.data?.home_team_id ? playersApi.list(matchRes.data.home_team_id) : Promise.resolve({ data: [] }),
        matchRes.data?.away_team_id ? playersApi.list(matchRes.data.away_team_id) : Promise.resolve({ data: [] }),
      ]);
      setHomePlayers(homeRes.data || []);
      setAwayPlayers(awayRes.data || []);
    };

    load().catch((error) => {
      const message = error?.response?.data?.message || error.message;
      setErr(message);
    });
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTracker((current) => ({ ...current }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (flow.open) {
      window.setTimeout(() => {
        eventBuilderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    }
  }, [flow]);

  const accrueActiveSeconds = (state, elapsed, targetElapsed = elapsed) => {
    const safeElapsed = Math.max(0, Math.min(QUARTER_SECONDS, Number(elapsed || 0)));
    const safeTargetElapsed = Math.max(safeElapsed, Math.min(QUARTER_SECONDS, Number(targetElapsed || safeElapsed)));
    const nextTimerStartedAt = state.timerRunning
      ? Date.now() - ((safeTargetElapsed - safeElapsed) * 1000)
      : state.timerStartedAt;
    const delta = Math.max(0, safeElapsed - Number(state.lastElapsed || 0));
    if (delta <= 0) {
      return {
        ...state,
        lastElapsed: safeElapsed,
        timerStartedAt: nextTimerStartedAt,
      };
    }

    const playerSeconds = { ...(state.playerSeconds || {}) };
    [...(state.lineups.home || []), ...(state.lineups.away || [])].forEach((playerId) => {
      playerSeconds[playerId] = Number(playerSeconds[playerId] || 0) + delta;
    });

    return {
      ...state,
      playerSeconds,
      lastElapsed: safeElapsed,
      timerStartedAt: nextTimerStartedAt,
    };
  };

  const toggleStarter = (side, playerId) => {
    if (tracker.startersConfirmed || tracker.events.length > 0) return;
    const idValue = Number(playerId);
    setTracker((current) => {
      const currentLineup = current.lineups[side] || [];
      const exists = currentLineup.some((idItem) => Number(idItem) === idValue);
      const nextLineup = exists
        ? currentLineup.filter((idItem) => Number(idItem) !== idValue)
        : currentLineup.length < 5
          ? [...currentLineup, idValue]
          : currentLineup;
      return { ...current, lineups: { ...current.lineups, [side]: nextLineup } };
    });
  };

  const validateLineups = () => {
    if ((tracker.lineups.home || []).length !== 5 || (tracker.lineups.away || []).length !== 5) {
      return "Select exactly 5 active players for each team before logging events.";
    }
    if (new Set(tracker.lineups.home).size !== 5 || new Set(tracker.lineups.away).size !== 5) {
      return "The same player cannot be selected twice in an active lineup.";
    }
    return "";
  };

  const playerTeamSide = useCallback((playerId) => {
    const idValue = Number(playerId);
    if (activeIds.home.has(idValue)) return "home";
    if (activeIds.away.has(idValue)) return "away";
    const player = playersById.get(idValue);
    if (player && match) {
      if (Number(player.team_id) === Number(match.home_team_id)) return "home";
      if (Number(player.team_id) === Number(match.away_team_id)) return "away";
    }
    return "";
  }, [activeIds.away, activeIds.home, match, playersById]);

  const activeOpponentsForPlayer = useCallback((playerId) => {
    const side = playerTeamSide(playerId);
    if (!side) return [];
    return activePlayers(side === "home" ? "away" : "home");
  }, [activePlayers, playerTeamSide]);

  const benchForPlayer = useCallback((playerId) => {
    const side = playerTeamSide(playerId);
    if (!side) return [];
    return benchPlayers(side);
  }, [benchPlayers, playerTeamSide]);

  const replayEvents = useCallback((events, sourceTracker = tracker) => {
    const initialLineups = {
      home: (sourceTracker.startingLineups?.home?.length ? sourceTracker.startingLineups.home : sourceTracker.lineups.home || []).map(Number),
      away: (sourceTracker.startingLineups?.away?.length ? sourceTracker.startingLineups.away : sourceTracker.lineups.away || []).map(Number),
    };
    let next = {
      ...sourceTracker,
      timerRunning: false,
      timerStartedAt: null,
      lineups: {
        home: [...initialLineups.home],
        away: [...initialLineups.away],
      },
      playerSeconds: {},
      quarter: 1,
      lastElapsed: 0,
      events: [],
    };

    for (const event of events) {
      if (Number(event.quarter || 1) !== Number(next.quarter || 1)) {
        next = { ...next, quarter: Number(event.quarter || 1), lastElapsed: 0 };
      }
      next = accrueActiveSeconds(next, Number(event.elapsed || 0));
      if (event.type === "substitution") {
        const lineup = [...(next.lineups[event.teamSide] || [])];
        const idx = lineup.findIndex((playerId) => Number(playerId) === Number(event.outPlayerId));
        if (idx >= 0) lineup[idx] = Number(event.inPlayerId);
        next = { ...next, lineups: { ...next.lineups, [event.teamSide]: lineup } };
      }
      if (event.type === "quarter_end" && Number(event.quarter) < 4) {
        next = { ...next, quarter: Number(event.quarter) + 1, lastElapsed: 0 };
      }
      next = { ...next, events: [...next.events, event] };
    }

    return next;
  }, [tracker]);

  const confirmStarters = () => {
    const lineupError = validateLineups();
    if (lineupError) {
      setErr(lineupError);
      showToast(lineupError, "error");
      return;
    }
    setErr("");
    setTracker((current) => ({
      ...current,
      startersConfirmed: true,
      startingLineups: {
        home: [...(current.lineups.home || [])],
        away: [...(current.lineups.away || [])],
      },
      timerRunning: false,
      timerStartedAt: null,
      lastElapsed: 0,
    }));
    showToast("Starting players confirmed.");
  };

  const startTimer = () => {
    const lineupError = validateLineups();
    if (lineupError) {
      setErr(lineupError);
      showToast(lineupError, "error");
      return;
    }
    if (!tracker.startersConfirmed) {
      const message = "Confirm starting players before starting the timer.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    setTracker((current) => current.timerRunning ? current : {
      ...current,
      timerRunning: true,
      timerStartedAt: Date.now(),
    });
  };

  const pauseTimer = () => {
    setTracker((current) => {
      const elapsed = currentElapsed(current);
      return {
        ...accrueActiveSeconds(current, elapsed),
        timerRunning: false,
        timerStartedAt: null,
      };
    });
  };

  const updateFlow = (patch) => {
    setFlow((current) => ({ ...current, ...patch }));
  };

  const resetFlow = () => {
    setFlow(initialFlow);
    setEditingEventId("");
  };

  const startFlow = () => {
    if (!tracker.startersConfirmed) {
      const message = "Confirm starting players before adding events.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    if (!tracker.timerRunning) {
      const message = "Start the timer before adding events.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    setErr("");
    const elapsed = currentElapsed();
    setFlow({
      ...initialFlow,
      open: true,
      eventElapsed: elapsed,
      eventClock: formatClock(elapsed),
      eventQuarter: tracker.quarter,
    });
  };

  const buildEventFromFlow = () => {
    const editedElapsed = elapsedFromClock(flow.eventClock);
    if (editingEventId && editedElapsed === null) return { error: "Enter event time as MM:SS." };
    const elapsed = editingEventId
      ? editedElapsed
      : hasLockedElapsed(flow.eventElapsed)
        ? Number(flow.eventElapsed)
        : currentElapsed();
    const eventQuarter = Number(flow.eventQuarter || tracker.quarter);
    const baseEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: flow.type,
      teamSide: flow.teamSide,
      quarter: eventQuarter,
      elapsed,
      clock: formatClock(elapsed),
      createdAt: new Date().toISOString(),
    };

    if (flow.type === "quarter_end") return { event: { ...baseEvent, teamSide: null }, elapsed };
    if (flow.type === "shot") {
      const side = playerTeamSide(flow.playerId);
      if (!side || !flow.playerId || !flow.points || flow.made === null) return { error: "Complete shot details." };
      if (!flow.made && flow.reboundChoice === "yes" && !flow.reboundPlayerId) return { error: "Choose who got the rebound." };
      return {
        elapsed,
        event: {
          ...baseEvent,
          teamSide: side,
          playerId: Number(flow.playerId),
          points: Number(flow.points),
          made: Boolean(flow.made),
          assistPlayerId: flow.made && flow.assistChoice === "yes" && flow.assistPlayerId ? Number(flow.assistPlayerId) : null,
          reboundPlayerId: !flow.made && flow.reboundChoice === "yes" && flow.reboundPlayerId ? Number(flow.reboundPlayerId) : null,
        },
      };
    }
    if (flow.type === "free_throw") {
      const side = playerTeamSide(flow.playerId);
      if (!side || !flow.playerId || flow.made === null) return { error: "Complete free throw details." };
      if (!flow.made && flow.reboundChoice === "yes" && !flow.reboundPlayerId) return { error: "Choose who got the rebound." };
      return {
        elapsed,
        event: {
          ...baseEvent,
          teamSide: side,
          playerId: Number(flow.playerId),
          made: Boolean(flow.made),
          reboundPlayerId: !flow.made && flow.reboundChoice === "yes" && flow.reboundPlayerId ? Number(flow.reboundPlayerId) : null,
        },
      };
    }
    if (flow.type === "rebound") {
      const side = playerTeamSide(flow.playerId);
      if (!side || !flow.playerId) return { error: "Choose who got the rebound." };
      return { elapsed, event: { ...baseEvent, teamSide: side, playerId: Number(flow.playerId) } };
    }
    if (flow.type === "block") {
      const side = playerTeamSide(flow.blockerId);
      if (!side || !flow.blockerId || !flow.shooterId || !flow.shotPoints) return { error: "Complete block details." };
      return {
        elapsed,
        event: {
          ...baseEvent,
          teamSide: side,
          blockerId: Number(flow.blockerId),
          shooterId: Number(flow.shooterId),
          shotPoints: Number(flow.shotPoints),
        },
      };
    }
    if (flow.type === "foul") {
      const side = playerTeamSide(flow.playerId);
      if (!side || !flow.playerId) return { error: "Choose who committed the foul." };
      return { elapsed, event: { ...baseEvent, teamSide: side, playerId: Number(flow.playerId) } };
    }
    if (flow.type === "steal") {
      const side = playerTeamSide(flow.stealPlayerId);
      if (!side || !flow.stealPlayerId) return { error: "Choose who made the steal." };
      if (flow.turnoverChoice === "yes" && !flow.turnoverPlayerId) return { error: "Choose who made the turnover." };
      return {
        elapsed,
        event: {
          ...baseEvent,
          teamSide: side,
          playerId: Number(flow.stealPlayerId),
          turnoverPlayerId: flow.turnoverChoice === "yes" && flow.turnoverPlayerId ? Number(flow.turnoverPlayerId) : null,
        },
      };
    }
    if (flow.type === "turnover") {
      const side = playerTeamSide(flow.turnoverPlayerId);
      if (!side || !flow.turnoverPlayerId) return { error: "Choose who made the turnover." };
      return { elapsed, event: { ...baseEvent, teamSide: side, playerId: Number(flow.turnoverPlayerId) } };
    }
    if (flow.type === "substitution") {
      const side = playerTeamSide(flow.outPlayerId);
      if (!side || !flow.outPlayerId || !flow.inPlayerId) return { error: "Choose both players for the substitution." };
      return {
        elapsed,
        event: {
          ...baseEvent,
          teamSide: side,
          outPlayerId: Number(flow.outPlayerId),
          inPlayerId: Number(flow.inPlayerId),
        },
      };
    }
    return { error: "Choose an event type." };
  };

  const flowFromEvent = (event) => ({
    ...initialFlow,
    open: true,
    type: event.type,
    teamSide: event.teamSide || "",
    playerId: event.playerId || "",
    points: event.points || null,
    made: typeof event.made === "boolean" ? event.made : null,
    assistChoice: event.assistPlayerId ? "yes" : event.type === "shot" && event.made ? "no" : "",
    assistPlayerId: event.assistPlayerId || "",
    reboundChoice: event.reboundPlayerId ? "yes" : ["shot", "free_throw"].includes(event.type) && event.made === false ? "no" : "",
    reboundPlayerId: event.reboundPlayerId || "",
    blockerId: event.blockerId || "",
    shooterId: event.shooterId || "",
    shotPoints: event.shotPoints || null,
    stealPlayerId: event.type === "steal" ? event.playerId || "" : "",
    turnoverChoice: event.turnoverPlayerId ? "yes" : event.type === "steal" ? "no" : "",
    turnoverPlayerId: event.turnoverPlayerId || (event.type === "turnover" ? event.playerId || "" : ""),
    outPlayerId: event.outPlayerId || "",
    inPlayerId: event.inPlayerId || "",
    eventElapsed: Number(event.elapsed || 0),
    eventClock: event.clock || formatClock(event.elapsed || 0),
    eventQuarter: Number(event.quarter || 1),
  });

  const editEvent = (event) => {
    pauseTimer();
    setEditingEventId(event.id);
    setFlow(flowFromEvent(event));
  };

  const addCurrentEvent = async () => {
    const lineupError = validateLineups();
    if (lineupError) {
      setErr(lineupError);
      showToast(lineupError, "error");
      return;
    }

    const result = buildEventFromFlow();
    if (result.error) {
      setErr(result.error);
      showToast(result.error, "error");
      return;
    }

    setErr("");
    if (result.event.type === "quarter_end") {
      const quarterEndElapsed = editingEventId ? result.elapsed : QUARTER_SECONDS;
      const nextTracker = accrueActiveSeconds(tracker, quarterEndElapsed);
      const event = {
        ...result.event,
        id: editingEventId || result.event.id,
        quarter: nextTracker.quarter,
        elapsed: quarterEndElapsed,
        clock: formatClock(quarterEndElapsed),
      };
      const nextEvents = editingEventId
        ? replaceEventById(tracker.events, editingEventId, event)
        : [...tracker.events, event];
      if (Number(nextTracker.quarter) >= 4) {
        const ok = await confirm({
          title: "Finish live tracking?",
          message: "The 4th quarter is ending. Save calculated box score and final result?",
          confirmLabel: "Save final stats",
        });
        if (!ok) return;
        await finalizeTracker(replayEvents(nextEvents, nextTracker));
        return;
      }
      const replayed = replayEvents(nextEvents, nextTracker);
      setTracker({
        ...replayed,
        quarter: Math.max(Number(replayed.quarter || 1), Number(event.quarter) + 1),
        timerRunning: false,
        timerStartedAt: null,
        lastElapsed: 0,
      });
      resetFlow();
      return;
    }

    setTracker((current) => {
      const event = { ...result.event, id: editingEventId || result.event.id };
      const nextEvents = editingEventId
        ? replaceEventById(current.events, editingEventId, event)
        : [...current.events, event];
      if (editingEventId) {
        return replayEvents(nextEvents, current);
      }
      const liveElapsed = currentElapsed(current);
      let next = event.type === "substitution"
        ? accrueActiveSeconds(current, result.elapsed, liveElapsed)
        : accrueActiveSeconds(current, liveElapsed);
      if (event.type === "substitution") {
        const lineup = [...(next.lineups[event.teamSide] || [])];
        const idx = lineup.findIndex((playerId) => Number(playerId) === Number(event.outPlayerId));
        if (idx >= 0) lineup[idx] = Number(event.inPlayerId);
        next = { ...next, lineups: { ...next.lineups, [event.teamSide]: lineup } };
      }
      return { ...next, events: nextEvents };
    });
    resetFlow();
  };

  const finalizeTracker = async (finalState) => {
    if (!match) return;
    setSaving(true);
    setErr("");
    try {
      const stats = calculateStats(finalState, match, homePlayers, awayPlayers);
      const nextHomeScore = scoreFor(stats, match.home_team_id);
      const nextAwayScore = scoreFor(stats, match.away_team_id);
      await matchesApi.submitLiveEvents(id, { events: finalState.events });
      await matchesApi.submitStatsBulk(id, { stats });
      await matchesApi.setResult(id, { home_score: nextHomeScore, away_score: nextAwayScore });
      localStorage.setItem(`live-match-tracker:${id}`, JSON.stringify(finalState));
      setTracker(finalState);
      showToast("Live match stats saved.");
      nav(`/matches/${id}`);
    } catch (error) {
      const message = error?.response?.data?.message || JSON.stringify(error?.response?.data) || error.message;
      setErr(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const resetTracker = async () => {
    const ok = await confirm({
      title: "Reset live tracker?",
      message: "This clears the local event log for this match only.",
      confirmLabel: "Reset tracker",
    });
    if (!ok) return;
    setTracker(emptyTracker(id));
    resetFlow();
  };

  const playerPickerScore = (player) => {
    const stats = statsByPlayerId.get(Number(player.id));
    if (!stats) return 0;
    return Number(stats.points || 0)
      + Number(stats.rebounds || 0)
      + Number(stats.assists || 0)
      + Number(stats.steals || 0)
      + Number(stats.blocks || 0);
  };

  const sortPickerPlayers = (players) => [...players].sort((a, b) => {
    const scoreDiff = playerPickerScore(b) - playerPickerScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const jerseyA = a.jersey_number ?? 999;
    const jerseyB = b.jersey_number ?? 999;
    if (Number(jerseyA) !== Number(jerseyB)) return Number(jerseyA) - Number(jerseyB);
    return playerName(a).localeCompare(playerName(b));
  });

  const playerButtonRow = (players, selectedId, key, suffix = "") => {
    const groups = [
      {
        side: "home",
        title: teamName(match, "home"),
        players: sortPickerPlayers(players.filter((player) => playerTeamSide(player.id) === "home")),
      },
      {
        side: "away",
        title: teamName(match, "away"),
        players: sortPickerPlayers(players.filter((player) => playerTeamSide(player.id) === "away")),
      },
    ].filter((group) => group.players.length > 0);

    if (groups.length === 0) return null;

    return (
      <div className={`grid gap-3 ${groups.length > 1 ? "md:grid-cols-2" : ""}`}>
        {groups.map((group) => (
          <div key={group.side} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.title}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.players.map((player) => (
                <button
                  type="button"
                  key={player.id}
                  className={actionButtonClass(Number(selectedId) === Number(player.id))}
                  onClick={() => updateFlow({ [key]: player.id })}
                >
                  {playerName(player)}{suffix}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (!match) return <Skeleton rows={4} />;

  return (
    <div className="page-stack">
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <section className="panel page-hero">
        <div className="section-heading">
          <div>
            <p className="section-heading__eyebrow">Live Match Tracker</p>
            <h1 className="section-heading__title">{teamName(match, "home")} vs {teamName(match, "away")}</h1>
          </div>
          <div className="page-actions">
            <button onClick={() => nav(`/matches/${id}`)} className="btn-secondary">Back to match</button>
            <button onClick={resetTracker} className="btn-danger">Reset local log</button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {[
          { side: "home", title: teamName(match, "home"), players: homePlayers },
          { side: "away", title: teamName(match, "away"), players: awayPlayers },
        ].map((team) => (
          <div key={team.side} className="panel space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-900">{team.title} active players</div>
              <div className="text-sm font-semibold text-slate-500">{(tracker.lineups?.[team.side] || []).length}/5</div>
            </div>
            {team.players.length < 5 ? (
              <EmptyState title="Not enough players" description="Add at least 5 players to this team before live tracking." />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {team.players.map((player) => {
                    const selected = activeIds[team.side].has(Number(player.id));
                    return (
                      <button
                        type="button"
                        key={player.id}
                        className={actionButtonClass(selected)}
                        onClick={() => toggleStarter(team.side, player.id)}
                        disabled={tracker.startersConfirmed}
                      >
                        {playerName(player)}
                      </button>
                    );
                  })}
                </div>
                {tracker.startersConfirmed ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                    Starters confirmed. Substitutions will update this active player list.
                  </div>
                ) : null}
              </>
            )}
          </div>
        ))}
      </section>

      {!tracker.startersConfirmed ? (
        <section className="panel p-5">
          <button onClick={confirmStarters} className="btn-primary">
            Confirm starting players
          </button>
        </section>
      ) : null}

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-900">Event log</div>
            <div className="text-sm text-slate-500">Every logged event is stored locally until the 4th quarter is confirmed.</div>
          </div>
          <div className="text-sm font-semibold text-slate-700">
            {teamName(match, "home")} {homeScore} - {awayScore} {teamName(match, "away")}
          </div>
        </div>

        {tracker.events.length === 0 ? (
          <EmptyState title="No events yet" description="Confirm starters, then add the first live match event." />
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Q</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {tracker.events.map((event) => (
                  <tr key={event.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{event.quarter}</td>
                    <td className="px-3 py-2">{event.clock}</td>
                    <td className="px-3 py-2">{eventLabel(event, playersById, match)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => editEvent(event)} className="btn-secondary">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section ref={eventBuilderRef} className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-900">Add event</div>
            <div className="text-sm text-slate-500">Press Add event, then follow the visible buttons.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
              Q{tracker.quarter} {formatClock(currentElapsed())}
            </div>
            <button
              type="button"
              onClick={startTimer}
              disabled={!tracker.startersConfirmed || tracker.timerRunning || saving}
              className={timerButtonClass("start", tracker.startersConfirmed && tracker.timerRunning)}
            >
              Start
            </button>
            <button
              type="button"
              onClick={pauseTimer}
              disabled={!tracker.startersConfirmed || !tracker.timerRunning || saving}
              className={timerButtonClass("pause", tracker.startersConfirmed && !tracker.timerRunning)}
            >
              Pause
            </button>
            {!flow.open ? (
              <button onClick={startFlow} disabled={!tracker.startersConfirmed || !tracker.timerRunning || saving} className="btn-primary">
                Add event
              </button>
            ) : (
              <button onClick={resetFlow} className="btn-secondary">Cancel</button>
            )}
          </div>
        </div>

        {flow.open ? (
          <div className="space-y-4">
            {flow.eventClock ? (
              editingEventId ? (
                <div className="mx-auto grid max-w-sm gap-2 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Quarter
                    <select
                      className="input mt-1"
                      value={flow.eventQuarter || tracker.quarter}
                      onChange={(event) => updateFlow({ eventQuarter: Number(event.target.value) })}
                    >
                      {[1, 2, 3, 4].map((quarter) => (
                        <option key={quarter} value={quarter}>Q{quarter}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Event time
                    <input
                      className="input mt-1"
                      value={flow.eventClock}
                      onChange={(event) => updateFlow({ eventClock: event.target.value })}
                      placeholder="MM:SS"
                    />
                  </label>
                </div>
              ) : (
                <div className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Event time: Q{tracker.quarter} - {flow.eventClock}
                </div>
              )
            ) : null}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-700">What happened?</div>
              <div className="flex flex-wrap justify-center gap-2">
                {EVENT_TYPES.map((item) => (
                  <button
                    type="button"
                    key={item.type}
                    className={actionButtonClass(flow.type === item.type)}
                    onClick={() => setFlow((current) => ({
                      ...initialFlow,
                      open: true,
                      type: item.type,
                      eventElapsed: hasLockedElapsed(current.eventElapsed) ? current.eventElapsed : currentElapsed(),
                      eventClock: current.eventClock || formatClock(currentElapsed()),
                      eventQuarter: current.eventQuarter || tracker.quarter,
                    }))}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {flow.type === "shot" ? (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Who shot?</div>
                  {playerButtonRow(allActivePlayers, flow.playerId, "playerId")}
                </div>
                {flow.playerId ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Shot type</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.points === 2)} onClick={() => updateFlow({ points: 2 })}>2 pointer</button>
                      <button type="button" className={actionButtonClass(flow.points === 3)} onClick={() => updateFlow({ points: 3 })}>3 pointer</button>
                    </div>
                  </div>
                ) : null}
                {flow.points ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Result</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.made === true)} onClick={() => updateFlow({ made: true })}>Made</button>
                      <button type="button" className={actionButtonClass(flow.made === false)} onClick={() => updateFlow({ made: false, assistChoice: "", assistPlayerId: "" })}>Missed</button>
                    </div>
                  </div>
                ) : null}
                {flow.made === true ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Assisted?</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.assistChoice === "no")} onClick={() => updateFlow({ assistChoice: "no", assistPlayerId: "" })}>No assist</button>
                      <button type="button" className={actionButtonClass(flow.assistChoice === "yes")} onClick={() => updateFlow({ assistChoice: "yes" })}>Yes</button>
                    </div>
                  </div>
                ) : null}
                {flow.made === true && flow.assistChoice === "yes" ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Who assisted?</div>
                    {playerButtonRow(
                      activePlayers(playerTeamSide(flow.playerId)).filter((player) => Number(player.id) !== Number(flow.playerId)),
                      flow.assistPlayerId,
                      "assistPlayerId",
                    )}
                  </div>
                ) : null}
                {flow.made === false ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Was there a rebound?</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.reboundChoice === "no")} onClick={() => updateFlow({ reboundChoice: "no", reboundPlayerId: "" })}>No rebound</button>
                      <button type="button" className={actionButtonClass(flow.reboundChoice === "yes")} onClick={() => updateFlow({ reboundChoice: "yes" })}>Yes</button>
                    </div>
                  </div>
                ) : null}
                {flow.made === false && flow.reboundChoice === "yes" ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Who got the rebound?</div>
                    {playerButtonRow(allActivePlayers, flow.reboundPlayerId, "reboundPlayerId")}
                  </div>
                ) : null}
              </>
            ) : null}

            {flow.type === "free_throw" ? (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Who shot the free throw?</div>
                  {playerButtonRow(allActivePlayers, flow.playerId, "playerId")}
                </div>
                {flow.playerId ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Result</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.made === true)} onClick={() => updateFlow({ made: true })}>Made</button>
                      <button type="button" className={actionButtonClass(flow.made === false)} onClick={() => updateFlow({ made: false })}>Missed</button>
                    </div>
                  </div>
                ) : null}
                {flow.made === false ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Was there a rebound?</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.reboundChoice === "no")} onClick={() => updateFlow({ reboundChoice: "no", reboundPlayerId: "" })}>No rebound</button>
                      <button type="button" className={actionButtonClass(flow.reboundChoice === "yes")} onClick={() => updateFlow({ reboundChoice: "yes" })}>Yes</button>
                    </div>
                  </div>
                ) : null}
                {flow.made === false && flow.reboundChoice === "yes" ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Who got the rebound?</div>
                    {playerButtonRow(allActivePlayers, flow.reboundPlayerId, "reboundPlayerId")}
                  </div>
                ) : null}
              </>
            ) : null}

            {flow.type === "rebound" ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">Who got the rebound?</div>
                {playerButtonRow(allActivePlayers, flow.playerId, "playerId")}
              </div>
            ) : null}

            {flow.type === "block" ? (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Who blocked?</div>
                  {playerButtonRow(allActivePlayers, flow.blockerId, "blockerId")}
                </div>
                {flow.blockerId ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Who was blocked?</div>
                    {playerButtonRow(activeOpponentsForPlayer(flow.blockerId), flow.shooterId, "shooterId")}
                  </div>
                ) : null}
                {flow.shooterId ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Blocked shot type</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.shotPoints === 2)} onClick={() => updateFlow({ shotPoints: 2 })}>2 pointer</button>
                      <button type="button" className={actionButtonClass(flow.shotPoints === 3)} onClick={() => updateFlow({ shotPoints: 3 })}>3 pointer</button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {flow.type === "foul" ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">Who committed the foul?</div>
                {playerButtonRow(allActivePlayers, flow.playerId, "playerId")}
              </div>
            ) : null}

            {flow.type === "steal" ? (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Who made the steal?</div>
                  {playerButtonRow(allActivePlayers, flow.stealPlayerId, "stealPlayerId")}
                </div>
                {flow.stealPlayerId ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Record a turnover too?</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className={actionButtonClass(flow.turnoverChoice === "no")} onClick={() => updateFlow({ turnoverChoice: "no", turnoverPlayerId: "" })}>No turnover</button>
                      <button type="button" className={actionButtonClass(flow.turnoverChoice === "yes")} onClick={() => updateFlow({ turnoverChoice: "yes" })}>Yes</button>
                    </div>
                  </div>
                ) : null}
                {flow.stealPlayerId && flow.turnoverChoice === "yes" ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Who made the turnover?</div>
                    {playerButtonRow(activeOpponentsForPlayer(flow.stealPlayerId), flow.turnoverPlayerId, "turnoverPlayerId")}
                  </div>
                ) : null}
              </>
            ) : null}

            {flow.type === "turnover" ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">Who made the turnover?</div>
                {playerButtonRow(allActivePlayers, flow.turnoverPlayerId, "turnoverPlayerId")}
              </div>
            ) : null}

            {flow.type === "substitution" ? (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Who goes out?</div>
                  {playerButtonRow(allActivePlayers, flow.outPlayerId, "outPlayerId")}
                </div>
                {flow.outPlayerId ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Who comes in?</div>
                    {benchForPlayer(flow.outPlayerId).length > 0 ? (
                      playerButtonRow(benchForPlayer(flow.outPlayerId), flow.inPlayerId, "inPlayerId")
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        No bench players available for this team.
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}

            {flow.type ? (
              <button onClick={addCurrentEvent} disabled={saving} className="btn-primary">
                {editingEventId ? "Update event" : flow.type === "quarter_end" ? `End quarter ${tracker.quarter}` : "Save event"}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
