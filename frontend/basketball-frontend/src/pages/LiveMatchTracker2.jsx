import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { matchesApi } from "../api/matches";
import { playersApi } from "../api/players";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useConfirm } from "../components/useConfirm";
import { useToast } from "../components/useToast";

const DEFAULT_QUARTER_SECONDS = 10 * 60;
const MIN_QUARTER_SECONDS = 60;
const MAX_QUARTER_SECONDS = 20 * 60;
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

function clampQuarterSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_QUARTER_SECONDS;
  return Math.max(MIN_QUARTER_SECONDS, Math.min(MAX_QUARTER_SECONDS, Math.round(seconds)));
}

function formatClock(seconds, quarterSeconds = DEFAULT_QUARTER_SECONDS) {
  const length = clampQuarterSeconds(quarterSeconds);
  const safe = Math.max(0, Math.min(length, Math.floor(seconds || 0)));
  const remaining = length - safe;
  const minutes = Math.floor(remaining / 60);
  const rest = String(remaining % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function elapsedFromClock(value, quarterSeconds = DEFAULT_QUARTER_SECONDS) {
  const match = String(value || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const length = clampQuarterSeconds(quarterSeconds);
  const remaining = Number(match[1]) * 60 + Number(match[2]);
  if (remaining < 0 || remaining > length) return null;
  return length - remaining;
}

function formatQuarterLengthInput(seconds) {
  const safe = clampQuarterSeconds(seconds);
  return String(Math.round(safe / 60));
}

function parseQuarterLengthInput(value) {
  const text = String(value || "").trim();
  const minutesOnly = text.match(/^([1-9]|1\d|20)$/);
  if (minutesOnly) return Number(minutesOnly[1]) * 60;

  const clock = text.match(/^([1-9]|1\d|20):00$/);
  if (clock) return Number(clock[1]) * 60;

  return null;
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
    starters: { home: [], away: [] },
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
    starters: {
      home: Array.isArray(value.starters?.home) ? value.starters.home.map(Number) : [],
      away: Array.isArray(value.starters?.away) ? value.starters.away.map(Number) : [],
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

function eventLabel(event, playerMap, match) {
  const player = (id) => playerName(playerMap.get(Number(id)));
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
  if (event.type === "stat_adjust") return `${team}: ${player(event.playerId)} ${event.label || event.statKey}`;
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

    if (event.type === "stat_adjust") {
      const row = rowsByPlayer.get(Number(event.playerId));
      if (!row) return;
      Object.entries(event.increments || {}).forEach(([key, amount]) => {
        increment(row, key, Number(amount) || 0);
      });
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

export default function LiveMatchTracker2() {
  const { id } = useParams();
  const nav = useNavigate();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [match, setMatch] = useState(null);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [tracker, setTracker] = useState(() => loadTracker(id));
  const [subOutId, setSubOutId] = useState("");
  const [subMenuPosition, setSubMenuPosition] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [clockDraft, setClockDraft] = useState("");
  const [quarterLengthDraft, setQuarterLengthDraft] = useState("10");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const allPlayers = useMemo(() => [...homePlayers, ...awayPlayers], [homePlayers, awayPlayers]);
  const playerMap = useMemo(() => new Map(allPlayers.map((player) => [Number(player.id), player])), [allPlayers]);
  const activeIds = useMemo(() => ({
    home: new Set((tracker.lineups.home || []).map(Number)),
    away: new Set((tracker.lineups.away || []).map(Number)),
  }), [tracker.lineups.away, tracker.lineups.home]);
  const quarterSeconds = useMemo(
    () => clampQuarterSeconds(match?.quarter_length_seconds),
    [match?.quarter_length_seconds],
  );

  const elapsedNow = useCallback((state = tracker) => {
    const elapsed = Number(state.lastElapsed || 0) + (
      state.timerRunning && state.timerStartedAt
        ? Math.floor((Date.now() - Number(state.timerStartedAt)) / 1000)
        : 0
    );
    return Math.max(0, Math.min(quarterSeconds, elapsed));
  }, [quarterSeconds, tracker]);

  const onCourt = useCallback((side) => {
    const ids = tracker.lineups?.[side] || [];
    return ids.map((playerId) => playerMap.get(Number(playerId))).filter(Boolean);
  }, [playerMap, tracker.lineups]);

  const bench = useCallback((side) => {
    const roster = side === "home" ? homePlayers : awayPlayers;
    return roster.filter((player) => !activeIds[side].has(Number(player.id)));
  }, [activeIds, awayPlayers, homePlayers]);

  const stats = useMemo(
    () => (match ? calculateStats(tracker, match, homePlayers, awayPlayers) : []),
    [awayPlayers, homePlayers, match, tracker],
  );
  const statMap = useMemo(
    () => new Map(stats.map((row) => [Number(row.player_id), row])),
    [stats],
  );
  const homeScore = match ? scoreFor(stats, match.home_team_id) : 0;
  const awayScore = match ? scoreFor(stats, match.away_team_id) : 0;

  useEffect(() => {
    localStorage.setItem(`live-match-tracker:${id}`, JSON.stringify(tracker));
  }, [id, tracker]);

  useEffect(() => {
    const load = async () => {
      const matchRes = await matchesApi.get(id);
      setMatch(matchRes.data);
      setQuarterLengthDraft(formatQuarterLengthInput(matchRes.data?.quarter_length_seconds));
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
    if (!subOutId) return undefined;

    const closeSubMenu = () => {
      setSubOutId("");
      setSubMenuPosition(null);
    };

    window.addEventListener("pointerdown", closeSubMenu);
    return () => window.removeEventListener("pointerdown", closeSubMenu);
  }, [subOutId]);

  const addSecs = (state, elapsed, targetElapsed = elapsed) => {
    const safeElapsed = Math.max(0, Math.min(quarterSeconds, Number(elapsed || 0)));
    const safeTargetElapsed = Math.max(safeElapsed, Math.min(quarterSeconds, Number(targetElapsed || safeElapsed)));
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

  const checkLineups = () => {
    if ((tracker.lineups.home || []).length !== 5 || (tracker.lineups.away || []).length !== 5) {
      return "Select exactly 5 active players for each team before logging events.";
    }
    if (new Set(tracker.lineups.home).size !== 5 || new Set(tracker.lineups.away).size !== 5) {
      return "The same player cannot be selected twice in an active lineup.";
    }
    return "";
  };

  const playerSide = useCallback((playerId) => {
    const idValue = Number(playerId);
    if (activeIds.home.has(idValue)) return "home";
    if (activeIds.away.has(idValue)) return "away";
    const player = playerMap.get(idValue);
    if (player && match) {
      if (Number(player.team_id) === Number(match.home_team_id)) return "home";
      if (Number(player.team_id) === Number(match.away_team_id)) return "away";
    }
    return "";
  }, [activeIds.away, activeIds.home, match, playerMap]);

  const benchFor = useCallback((playerId) => {
    const side = playerSide(playerId);
    if (!side) return [];
    return bench(side);
  }, [bench, playerSide]);

  const replayEvents = useCallback((events, sourceTracker = tracker) => {
    const initialLineups = {
      home: (sourceTracker.starters?.home?.length ? sourceTracker.starters.home : sourceTracker.lineups.home || []).map(Number),
      away: (sourceTracker.starters?.away?.length ? sourceTracker.starters.away : sourceTracker.lineups.away || []).map(Number),
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
      next = addSecs(next, Number(event.elapsed || 0));
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
    const lineupError = checkLineups();
    if (lineupError) {
      setErr(lineupError);
      showToast(lineupError, "error");
      return;
    }
    setErr("");
    setTracker((current) => ({
      ...current,
      startersConfirmed: true,
      starters: {
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
    const lineupError = checkLineups();
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
      const elapsed = elapsedNow(current);
      return {
        ...addSecs(current, elapsed),
        timerRunning: false,
        timerStartedAt: null,
      };
    });
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
    setSubOutId("");
    setSubMenuPosition(null);
    setEditDraft(null);
  };

  const setClock = (nextElapsed, nextQuarter = tracker.quarter) => {
    const safeQuarter = Math.max(1, Math.min(4, Number(nextQuarter) || 1));
    const safeElapsed = Math.max(0, Math.min(quarterSeconds, Number(nextElapsed || 0)));
    setTracker((current) => {
      const currentElapsed = elapsedNow(current);
      const rollback = Number(current.quarter) === safeQuarter
        ? Math.max(0, currentElapsed - safeElapsed)
        : 0;
      const playerSeconds = { ...(current.playerSeconds || {}) };

      if (rollback > 0) {
        [...(current.lineups.home || []), ...(current.lineups.away || [])].forEach((playerId) => {
          playerSeconds[playerId] = Math.max(0, Number(playerSeconds[playerId] || 0) - rollback);
        });
      }

      return {
        ...current,
        quarter: safeQuarter,
        playerSeconds,
        lastElapsed: safeElapsed,
        timerStartedAt: current.timerRunning ? Date.now() : null,
      };
    });
  };

  const adjustClock = (seconds) => {
    setClock(elapsedNow() + seconds, tracker.quarter);
  };

  const applyClockFromInput = () => {
    const editedElapsed = elapsedFromClock(clockDraft, quarterSeconds);
    if (editedElapsed === null) {
      const message = "Enter clock as MM:SS inside this quarter length.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    setClock(editedElapsed, tracker.quarter);
    setClockDraft(formatClock(editedElapsed, quarterSeconds));
    showToast("Live clock updated.");
  };

  const saveQuarterLength = async () => {
    const seconds = parseQuarterLengthInput(quarterLengthDraft);
    if (seconds === null) {
      const message = "Quarter length must be like 10 or 10:00.";
      setErr(message);
      showToast(message, "error");
      return;
    }

    setSaving(true);
    setErr("");
    try {
      await matchesApi.update(id, {
        scheduled_at: match?.scheduled_at || null,
        venue_name: match?.venue_name || null,
        status: match?.status || "scheduled",
        quarter_length_seconds: seconds,
      });
      const response = await matchesApi.get(id);
      setMatch(response.data);
      setQuarterLengthDraft(formatQuarterLengthInput(response.data?.quarter_length_seconds));
      setTracker((current) => {
        const currentElapsed = elapsedNow(current);
        return {
          ...current,
          lastElapsed: Math.min(currentElapsed, seconds),
          timerStartedAt: current.timerRunning ? Date.now() : current.timerStartedAt,
        };
      });
      showToast("Quarter length saved.");
    } catch (error) {
      const message = error?.response?.data?.message || JSON.stringify(error?.response?.data) || error.message;
      setErr(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const sortPickerPlayers = (players) => [...players].sort((a, b) => {
    const jerseyA = a.jersey_number ?? 999;
    const jerseyB = b.jersey_number ?? 999;
    if (Number(jerseyA) !== Number(jerseyB)) return Number(jerseyA) - Number(jerseyB);
    return playerName(a).localeCompare(playerName(b));
  });

  if (!match) return <Skeleton rows={4} />;

  const clockText = formatClock(elapsedNow(), quarterSeconds);
  const eventLog = tracker.events.slice().reverse();
  const statButtons = [
    { key: "made2", label: "+2", tone: "score", event: "shot", points: 2, made: true },
    { key: "made3", label: "+3", tone: "score", event: "shot", points: 3, made: true },
    { key: "madeFt", label: "FT", tone: "score", event: "free_throw", made: true },
    { key: "miss2", label: "2X", event: "shot", points: 2, made: false },
    { key: "miss3", label: "3X", event: "shot", points: 3, made: false },
    { key: "missFt", label: "FTX", event: "free_throw", made: false },
    { key: "rebound", label: "REB", event: "rebound" },
    { key: "assist", label: "AST", event: "stat_adjust", increments: { assists: 1 } },
    { key: "steal", label: "STL", event: "steal" },
    { key: "block", label: "BLK", event: "stat_adjust", increments: { blocks: 1 } },
    { key: "foul", label: "FLS", event: "foul" },
    { key: "turnover", label: "TO", event: "turnover" },
  ];
  const statByKey = new Map(statButtons.map((button) => [button.key, button]));

  const statKeyForEvent = (event) => {
    if (event.type === "shot") return `${event.made ? "made" : "miss"}${Number(event.points) || 2}`;
    if (event.type === "free_throw") return event.made ? "madeFt" : "missFt";
    if (event.type === "rebound") return "rebound";
    if (event.type === "foul") return "foul";
    if (event.type === "steal") return "steal";
    if (event.type === "turnover") return "turnover";
    if (event.type === "stat_adjust") return event.statKey || "";
    return "";
  };

  const buttonClass = (tone) => (
    tone === "score"
      ? "rounded-md bg-slate-900 px-2 py-1.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
      : "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50 disabled:opacity-50"
  );

  const eventBase = (type, side, elapsed = elapsedNow()) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    teamSide: side,
    quarter: tracker.quarter,
    elapsed,
    clock: formatClock(elapsed, quarterSeconds),
    createdAt: new Date().toISOString(),
  });

  const buildStatEvent = (player, stat, elapsed, quarter, base = {}) => {
    const side = playerSide(player.id);
    const common = {
      ...base,
      id: base.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      teamSide: side,
      quarter,
      elapsed,
      clock: formatClock(elapsed, quarterSeconds),
      createdAt: base.createdAt || new Date().toISOString(),
    };

    if (stat.event === "shot") {
      return {
        ...common,
        type: "shot",
        playerId: Number(player.id),
        points: Number(stat.points),
        made: Boolean(stat.made),
        assistPlayerId: null,
        reboundPlayerId: null,
      };
    }
    if (stat.event === "free_throw") {
      return {
        ...common,
        type: "free_throw",
        playerId: Number(player.id),
        made: Boolean(stat.made),
        reboundPlayerId: null,
      };
    }
    if (stat.event === "rebound" || stat.event === "foul") {
      return { ...common, type: stat.event, playerId: Number(player.id) };
    }
    if (stat.event === "steal") {
      return { ...common, type: "steal", playerId: Number(player.id), turnoverPlayerId: null };
    }
    if (stat.event === "turnover") {
      return { ...common, type: "turnover", playerId: Number(player.id) };
    }
    return {
      ...common,
      type: "stat_adjust",
      playerId: Number(player.id),
      statKey: stat.key,
      label: stat.label,
      increments: stat.increments,
    };
  };

  const addEventNow = (event, elapsed = elapsedNow()) => {
    setTracker((current) => {
      const liveElapsed = elapsedNow(current);
      let next = addSecs(current, elapsed, liveElapsed);

      if (event.type === "substitution") {
        const lineup = [...(next.lineups[event.teamSide] || [])];
        const idx = lineup.findIndex((playerId) => Number(playerId) === Number(event.outPlayerId));
        if (idx >= 0) lineup[idx] = Number(event.inPlayerId);
        next = { ...next, lineups: { ...next.lineups, [event.teamSide]: lineup } };
      }

      return { ...next, events: [...next.events, event] };
    });
  };

  const logPlayerStat = (player, stat) => {
    if (!tracker.startersConfirmed) {
      const message = "Confirm starting players before logging stats.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    const elapsed = elapsedNow();
    if (!playerSide(player.id)) return;
    setErr("");

    addEventNow(buildStatEvent(player, stat, elapsed, tracker.quarter), elapsed);
  };

  const substitutePlayer = (inPlayer) => {
    const outId = Number(subOutId);
    const inId = Number(inPlayer.id);
    const side = playerSide(outId);
    if (!tracker.startersConfirmed || !side || !inId) return;

    const elapsed = elapsedNow();
    const event = {
      ...eventBase("substitution", side, elapsed),
      outPlayerId: outId,
      inPlayerId: inId,
    };
    addEventNow(event, elapsed);
    setSubOutId("");
    setSubMenuPosition(null);
  };

  const endQuarterDirect = async () => {
    if (!tracker.startersConfirmed) return;
    const nextTracker = addSecs(tracker, quarterSeconds);
    const event = {
      ...eventBase("quarter_end", null, quarterSeconds),
      teamSide: null,
      quarter: nextTracker.quarter,
      elapsed: quarterSeconds,
      clock: formatClock(quarterSeconds, quarterSeconds),
    };
    const nextEvents = [...tracker.events, event];

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
  };

  const undoLastEvent = () => {
    if (tracker.events.length === 0) return;
    const nextEvents = tracker.events.slice(0, -1);
    setTracker(replayEvents(nextEvents, tracker));
  };

  const toggleSubMenu = (event, playerId) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const willOpen = Number(subOutId) !== Number(playerId);
    setSubOutId(willOpen ? playerId : "");
    setSubMenuPosition(willOpen
      ? {
          left: rect.right + 8,
          top: Math.min(rect.top + (rect.height / 2), window.innerHeight - 180),
        }
      : null);
  };

  const startEditEvent = (event) => {
    setEditDraft({
      id: event.id,
      type: event.type,
      quarter: Number(event.quarter || tracker.quarter),
      clock: event.clock || formatClock(event.elapsed || 0, quarterSeconds),
      playerId: event.playerId || "",
      statKey: statKeyForEvent(event),
      outPlayerId: event.outPlayerId || "",
      inPlayerId: event.inPlayerId || "",
    });
  };

  const deleteEvent = (eventId) => {
    const nextEvents = tracker.events.filter((event) => event.id !== eventId);
    setTracker(replayEvents(nextEvents, tracker));
    if (editDraft?.id === eventId) setEditDraft(null);
  };

  const saveEditedEvent = () => {
    if (!editDraft) return;
    const original = tracker.events.find((event) => event.id === editDraft.id);
    if (!original) return;

    const elapsed = elapsedFromClock(editDraft.clock, quarterSeconds);
    if (elapsed === null) {
      const message = "Enter event time as MM:SS inside this quarter length.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    const quarter = Math.max(1, Math.min(4, Number(editDraft.quarter) || 1));
    let nextEvent = null;

    if (original.type === "quarter_end") {
      nextEvent = {
        ...original,
        quarter,
        elapsed,
        clock: formatClock(elapsed, quarterSeconds),
      };
    } else if (original.type === "substitution") {
      const outPlayer = playerMap.get(Number(editDraft.outPlayerId));
      const inPlayer = playerMap.get(Number(editDraft.inPlayerId));
      const side = editDraft.outPlayerId ? playerSide(editDraft.outPlayerId) : original.teamSide;
      if (!outPlayer || !inPlayer || !side) {
        const message = "Choose both players for the substitution.";
        setErr(message);
        showToast(message, "error");
        return;
      }
      nextEvent = {
        ...original,
        teamSide: side,
        quarter,
        elapsed,
        clock: formatClock(elapsed, quarterSeconds),
        outPlayerId: Number(outPlayer.id),
        inPlayerId: Number(inPlayer.id),
      };
    } else {
      const player = playerMap.get(Number(editDraft.playerId));
      const stat = statByKey.get(editDraft.statKey);
      if (!player || !stat) {
        const message = "Choose a player and stat.";
        setErr(message);
        showToast(message, "error");
        return;
      }
      nextEvent = buildStatEvent(player, stat, elapsed, quarter, {
        id: original.id,
        createdAt: original.createdAt,
      });
    }

    const nextEvents = tracker.events.map((event) => event.id === original.id ? nextEvent : event);
    setTracker(replayEvents(nextEvents, tracker));
    setEditDraft(null);
    setErr("");
  };

  return (
    <div className="page-stack">
      {err && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <section className="panel p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-heading__eyebrow">Live Match Tracker 2</p>
            <h1 className="text-xl font-bold tracking-tight text-slate-950">{teamName(match, "home")} vs {teamName(match, "away")}</h1>
          </div>
          <div className="page-actions">
            <button onClick={() => nav(`/matches/${id}`)} className="btn-secondary">Back to match</button>
            <button onClick={resetTracker} className="btn-danger">Reset local log</button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center">
            <div className="truncate text-xs font-semibold text-slate-500">{teamName(match, "home")}</div>
            <div className="text-3xl font-bold leading-none text-slate-950">{homeScore}</div>
          </div>
          <div className="rounded-md border border-slate-300 bg-white px-3 py-2 text-center">
            <div className="grid grid-cols-[auto_auto_auto_auto_auto] items-center justify-center gap-2">
              <button type="button" onClick={() => adjustClock(-1)} disabled={!tracker.startersConfirmed || saving} className="btn-secondary h-9 w-10 px-0 py-0 text-sm">-1s</button>
              <button
                type="button"
                onClick={() => setClockDraft(clockText)}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-4xl font-bold leading-none text-slate-950 transition hover:border-slate-400 hover:bg-white"
                title="Copy current time to the exact clock editor"
              >
                {clockText}
              </button>
              <button type="button" onClick={() => adjustClock(1)} disabled={!tracker.startersConfirmed || saving} className="btn-secondary h-9 w-10 px-0 py-0 text-sm">+1s</button>
              <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-600">
                Q{tracker.quarter}
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={startTimer} disabled={!tracker.startersConfirmed || tracker.timerRunning || saving} className={`${timerButtonClass("start", tracker.startersConfirmed && tracker.timerRunning)} h-9 px-3 py-1`}>Start</button>
                <button type="button" onClick={pauseTimer} disabled={!tracker.startersConfirmed || !tracker.timerRunning || saving} className={`${timerButtonClass("pause", tracker.startersConfirmed && !tracker.timerRunning)} h-9 px-3 py-1`}>Pause</button>
              </div>
            </div>
            <div className="mt-2 grid gap-1 sm:grid-cols-[1fr_auto_7rem_auto]">
              <input className="input h-9 py-1" placeholder={clockText} value={clockDraft} onChange={(event) => setClockDraft(event.target.value)} disabled={!tracker.startersConfirmed || saving} />
              <button type="button" onClick={applyClockFromInput} disabled={!tracker.startersConfirmed || saving} className="btn-secondary h-9 py-1">Set</button>
              <input
                className="input h-9 py-1"
                placeholder="10 or 10:00"
                value={quarterLengthDraft}
                onChange={(event) => setQuarterLengthDraft(event.target.value)}
                disabled={saving}
              />
              <button type="button" onClick={saveQuarterLength} disabled={saving} className="btn-secondary h-9 py-1">
                Save length
              </button>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center">
            <div className="truncate text-xs font-semibold text-slate-500">{teamName(match, "away")}</div>
            <div className="text-3xl font-bold leading-none text-slate-950">{awayScore}</div>
          </div>
        </div>
      </section>

      {!tracker.startersConfirmed ? (
        <section className="panel space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">Choose the five players on court</div>
              <div className="text-sm text-slate-500">After this, the tracker becomes a one-tap stat sheet.</div>
            </div>
            <button onClick={confirmStarters} className="btn-primary">Confirm starting players</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { side: "home", title: teamName(match, "home"), players: homePlayers },
              { side: "away", title: teamName(match, "away"), players: awayPlayers },
            ].map((team) => (
              <div key={team.side} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">{team.title}</div>
                  <div className="text-sm font-semibold text-slate-500">{(tracker.lineups?.[team.side] || []).length}/5</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {team.players.map((player) => {
                    const selected = activeIds[team.side].has(Number(player.id));
                    return (
                      <button type="button" key={player.id} className={actionButtonClass(selected)} onClick={() => toggleStarter(team.side, player.id)}>
                        {playerName(player)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <div>
              <div className="font-semibold text-slate-900">Tap stats</div>
              <div className="text-xs text-slate-500">Each button updates the box score and logs Q{tracker.quarter} {clockText}.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={undoLastEvent} disabled={tracker.events.length === 0 || saving} className="btn-secondary">Undo last</button>
              <button type="button" onClick={endQuarterDirect} disabled={saving} className="btn-secondary">End quarter</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[190px] bg-slate-50 px-3 py-1.5 font-medium">Player</th>
                  <th className="px-3 py-1.5 font-medium">Now</th>
                  {statButtons.map((button) => (
                    <th key={button.key} className="px-1 py-1.5 text-center font-medium">{button.label}</th>
                  ))}
                  <th className="px-3 py-1.5 text-center font-medium">Sub</th>
                </tr>
              </thead>
              <tbody>
                {["home", "away"].map((side) => (
                  <Fragment key={side}>
                    <tr className="border-t border-slate-200 bg-slate-100">
                      <td colSpan={statButtons.length + 3} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                        {teamName(match, side)}
                      </td>
                    </tr>
                    {onCourt(side).map((player) => {
                      const playerStats = statMap.get(Number(player.id)) || {};
                      return (
                        <tr key={player.id} className="border-t border-slate-100">
                          <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-slate-900">
                            {playerName(player)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold text-slate-600">
                            {Number(playerStats.points || 0)} PTS / {Number(playerStats.rebounds || 0)} REB / {Number(playerStats.assists || 0)} AST
                          </td>
                          {statButtons.map((button) => (
                            <td key={button.key} className="px-1 py-1 text-center">
                              <button type="button" onClick={() => logPlayerStat(player, button)} disabled={saving} className={buttonClass(button.tone)}>
                                {button.label}
                              </button>
                            </td>
                          ))}
                          <td className="px-3 py-1 text-center">
                            <button
                              type="button"
                              onClick={(event) => toggleSubMenu(event, player.id)}
                              className={actionButtonClass(Number(subOutId) === Number(player.id))}
                            >
                              Out
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tracker.startersConfirmed && subOutId && subMenuPosition ? (
        <div
          className="fixed z-[100] w-64 -translate-y-1/2 rounded-md border border-slate-300 bg-white p-2 text-left shadow-xl"
          style={{
            left: `${subMenuPosition.left}px`,
            top: `${subMenuPosition.top}px`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 text-xs font-bold uppercase tracking-wide text-slate-500">
              Sub in
            </div>
            <button
              type="button"
              onClick={() => {
                setSubOutId("");
                setSubMenuPosition(null);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              Close
            </button>
          </div>
          <div className="grid gap-1">
            {benchFor(subOutId).map((benchPlayer) => (
              <button
                type="button"
                key={benchPlayer.id}
                onClick={() => substitutePlayer(benchPlayer)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
              >
                {playerName(benchPlayer)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <section className="grid gap-4">
        <div className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-slate-900">Event log</div>
            <div className="text-sm font-semibold text-slate-500">{tracker.events.length} total</div>
          </div>
          {editDraft ? (
            <div className="rounded-md border border-slate-300 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">Edit event</div>
                <button type="button" onClick={() => setEditDraft(null)} className="btn-secondary">Cancel</button>
              </div>
              <div className="grid gap-2 md:grid-cols-[7rem_9rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <select
                  className="input"
                  value={editDraft.quarter}
                  onChange={(event) => setEditDraft((current) => ({ ...current, quarter: Number(event.target.value) }))}
                >
                  {[1, 2, 3, 4].map((quarter) => (
                    <option key={quarter} value={quarter}>Q{quarter}</option>
                  ))}
                </select>
                <input
                  className="input"
                  value={editDraft.clock}
                  onChange={(event) => setEditDraft((current) => ({ ...current, clock: event.target.value }))}
                  placeholder="MM:SS"
                />
                {editDraft.type === "substitution" ? (
                  <>
                    <select
                      className="input"
                      value={editDraft.outPlayerId}
                      onChange={(event) => setEditDraft((current) => ({ ...current, outPlayerId: event.target.value }))}
                    >
                      <option value="">Player out</option>
                      {sortPickerPlayers(allPlayers).map((player) => (
                        <option key={player.id} value={player.id}>{playerName(player)}</option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={editDraft.inPlayerId}
                      onChange={(event) => setEditDraft((current) => ({ ...current, inPlayerId: event.target.value }))}
                    >
                      <option value="">Player in</option>
                      {sortPickerPlayers(allPlayers).map((player) => (
                        <option key={player.id} value={player.id}>{playerName(player)}</option>
                      ))}
                    </select>
                  </>
                ) : editDraft.type === "quarter_end" ? (
                  <div className="flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 md:col-span-2">
                    Quarter end
                  </div>
                ) : (
                  <>
                    <select
                      className="input"
                      value={editDraft.playerId}
                      onChange={(event) => setEditDraft((current) => ({ ...current, playerId: event.target.value }))}
                    >
                      <option value="">Player</option>
                      {sortPickerPlayers(allPlayers).map((player) => (
                        <option key={player.id} value={player.id}>{playerName(player)}</option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={editDraft.statKey}
                      onChange={(event) => setEditDraft((current) => ({ ...current, statKey: event.target.value }))}
                    >
                      <option value="">Stat</option>
                      {statButtons.map((stat) => (
                        <option key={stat.key} value={stat.key}>{stat.label}</option>
                      ))}
                    </select>
                  </>
                )}
                <button type="button" onClick={saveEditedEvent} className="btn-primary">
                  Save edit
                </button>
              </div>
            </div>
          ) : null}
          {eventLog.length === 0 ? (
            <EmptyState title="No events yet" description="Confirm starters, then tap any stat button beside a player." />
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded-md border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Play</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {eventLog.map((event) => (
                    <tr key={event.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2">Q{event.quarter} {event.clock}</td>
                      <td className="px-3 py-2">{eventLabel(event, playerMap, match)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => startEditEvent(event)} className="btn-secondary">Edit</button>
                          <button type="button" onClick={() => deleteEvent(event.id)} className="btn-secondary">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </section>
    </div>
  );

}
