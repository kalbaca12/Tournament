import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { matchesApi } from "../api/matches";
import { playersApi } from "../api/players";
import { tournamentsApi } from "../api/tournaments";
import { useAuth } from "../auth/useAuth";
import EmptyState from "../components/EmptyState";
import { useConfirm } from "../components/useConfirm";
import PdfExportModal from "../components/PdfExportModal";
import ScoringChart from "../components/ScoringChart";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";
import { downloadBlobResponse } from "../utils/downloadFile";
import { formatLiveEventLabel } from "../utils/liveEventLabels";
import {
  formatDateTime,
  formatPlayedTime,
  parsePlayedTime,
  playedSeconds,
  playerLabel,
  rosterPlayerLabel,
  selectedSections,
  statValue,
} from "../utils/matchDisplay";

const defaultMatchPdfSections = {
  players: true,
  leaders: true,
  team_totals: true,
  box_score: true,
};

function quarterMinutes(match) {
  const seconds = Number(match?.quarter_length_seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "10";
  return String(Math.round(seconds / 60));
}

function blankStat(player, teamId) {
  return {
    player_id: player.id,
    team_id: teamId,
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

export default function MatchView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [match, setMatch] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [stats, setStats] = useState([]);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [statsDraft, setStatsDraft] = useState([]);
  const [err, setErr] = useState("");

  const [result, setResult] = useState({ home_score: "", away_score: "" });
  const [meta, setMeta] = useState({ scheduled_at: "", status: "scheduled", venue_name: "", quarter_length_minutes: "10" });
  const [isEditingResult, setIsEditingResult] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfSections, setPdfSections] = useState(defaultMatchPdfSections);
  const [statsSaving, setStatsSaving] = useState(false);
  const [showLiveEvents, setShowLiveEvents] = useState(false);
  const [showScoringChart, setShowScoringChart] = useState(false);

  const resolveTeamName = (matchRow, side) => {
    const idKey = side === "home" ? "home_team_id" : "away_team_id";
    const camelRelation = side === "home" ? "homeTeam" : "awayTeam";
    const snakeRelation = side === "home" ? "home_team" : "away_team";
    const teamId = matchRow?.[idKey];

    return matchRow?.[camelRelation]?.name || matchRow?.[snakeRelation]?.name || teamId;
  };

  const defaultVenueName = useMemo(() => {
    const directName = String(tournament?.venue_name || "").trim();
    if (directName) return directName;
    if (Array.isArray(tournament?.venue_names) && tournament.venue_names.length > 0) {
      return String(tournament.venue_names[0] || "").trim();
    }
    return "";
  }, [tournament?.venue_name, tournament?.venue_names]);

  const venueLabel = (matchRow = match) => {
    const override = String(matchRow?.venue_name || "").trim();
    return override || defaultVenueName || "Venue TBD";
  };

  const buildStatsDraft = useCallback((players, savedStats, teamId) => {
    const statsByPlayerId = savedStats.reduce((acc, row) => {
      acc[Number(row.player_id)] = row;
      return acc;
    }, {});

    return players.map((player) => {
      const savedRow = statsByPlayerId[Number(player.id)] || {};
      const totalSeconds = playedSeconds(savedRow);

      return {
      ...blankStat(player, teamId),
      ...savedRow,
      player_id: player.id,
      team_id: teamId,
      minutes: Math.floor(totalSeconds / 60),
      played_seconds: totalSeconds,
      play_time: formatPlayedTime(totalSeconds),
      player,
      };
    });
  }, []);

  const load = useCallback(async () => {
    const [mRes, sRes] = await Promise.all([matchesApi.get(id), matchesApi.stats(id)]);
    setMatch(mRes.data);
    setStats(sRes.data);

    if (mRes.data?.tournament_id) {
      const tournamentRes = await tournamentsApi.get(mRes.data.tournament_id).catch(() => ({ data: null }));
      setTournament(tournamentRes.data || null);
    }

    const [homePlayersRes, awayPlayersRes] = await Promise.all([
      mRes.data?.home_team_id ? playersApi.list(mRes.data.home_team_id) : Promise.resolve({ data: [] }),
      mRes.data?.away_team_id ? playersApi.list(mRes.data.away_team_id) : Promise.resolve({ data: [] }),
    ]);
    const nextHomePlayers = homePlayersRes.data || [];
    const nextAwayPlayers = awayPlayersRes.data || [];
    setHomePlayers(nextHomePlayers);
    setAwayPlayers(nextAwayPlayers);
    setStatsDraft([
      ...buildStatsDraft(nextHomePlayers, sRes.data || [], mRes.data.home_team_id),
      ...buildStatsDraft(nextAwayPlayers, sRes.data || [], mRes.data.away_team_id),
    ]);

    setResult({
      home_score: mRes.data?.home_score ?? "",
      away_score: mRes.data?.away_score ?? "",
    });
    setMeta({
      scheduled_at: mRes.data?.scheduled_at ? mRes.data.scheduled_at.slice(0, 16) : "",
      status: mRes.data?.status || "scheduled",
      venue_name: mRes.data?.venue_name || "",
      quarter_length_minutes: quarterMinutes(mRes.data),
    });
  }, [buildStatsDraft, id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const saveMeta = async () => {
    if (!isAdmin) return;
    setErr("");
    try {
      await matchesApi.update(id, {
        scheduled_at: meta.scheduled_at || null,
        status: meta.status,
        venue_name: meta.venue_name?.trim() || null,
        quarter_length_seconds: Math.round((Number(meta.quarter_length_minutes) || 10) * 60),
      });
      await load();
      showToast("Match info saved.");
    } catch (e) {
      const message = e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message;
      setErr(message);
      showToast(message, "error");
    }
  };

  const saveResult = async () => {
    if (!isAdmin) return;
    setErr("");
    const liveResult = {
      home_score: document.querySelector('input[placeholder="Home score"]')?.value ?? result.home_score,
      away_score: document.querySelector('input[placeholder="Away score"]')?.value ?? result.away_score,
    };
    if (liveResult.home_score === "" || liveResult.away_score === "") {
      const message = "Enter both scores before saving the result.";
      setErr(message);
      showToast(message, "error");
      return;
    }
    try {
      await matchesApi.setResult(id, {
        home_score: Number(liveResult.home_score),
        away_score: Number(liveResult.away_score),
      });
      await load();
      setIsEditingResult(false);
      showToast("Result saved.");
    } catch (e) {
      const message = e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message;
      setErr(message);
      showToast(message, "error");
    }
  };

  const remove = async () => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Delete this match?",
      message: "This removes the match and any stats attached to it.",
      confirmLabel: "Delete match",
    });
    if (!ok) return;
    setErr("");
    try {
      await matchesApi.remove(id);
      showToast("Match deleted.");
      if (match?.tournament_id) {
        nav(`/tournaments/${match.tournament_id}`);
        return;
      }
      nav("/tournaments");
    } catch (e) {
      const message = e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message;
      setErr(message);
      showToast(message, "error");
    }
  };

  const exportPdf = async () => {
    setErr("");
    setIsExportingPdf(true);
    try {
      const response = await matchesApi.exportPdf(id, selectedSections(pdfSections));
      downloadBlobResponse(response, `match-${id}-report.pdf`);
      setIsPdfModalOpen(false);
      showToast("Match PDF exported.");
    } catch (e) {
      const message = e?.response?.data?.message || "Failed to export match PDF.";
      setErr(message);
      showToast(message, "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const updateStatDraft = (playerId, key, value) => {
    if (key === "play_time") {
      const parsedSeconds = parsePlayedTime(value);
      setStatsDraft((current) => current.map((row) => (
        Number(row.player_id) === Number(playerId)
          ? {
              ...row,
              play_time: value,
              ...(parsedSeconds === null
                ? {}
                : {
                    minutes: Math.floor(parsedSeconds / 60),
                    played_seconds: parsedSeconds,
                  }),
            }
          : row
      )));
      return;
    }

    const normalizedValue = value === "" ? "" : String(Math.max(0, Number(value) || 0));
    setStatsDraft((current) => current.map((row) => (
      Number(row.player_id) === Number(playerId)
        ? {
            ...row,
            [key]: normalizedValue,
          }
        : row
    )));
  };

  const updateStatFlag = (playerId, key, checked) => {
    setStatsDraft((current) => current.map((row) => (
      Number(row.player_id) === Number(playerId)
        ? {
            ...row,
            ...(key === "dnp" && checked ? blankStat(row.player || { id: row.player_id }, row.team_id) : {}),
            player: row.player,
            [key]: checked,
          }
        : row
    )));
  };

  const validateStatsDraft = () => {
    for (const row of statsDraft) {
      const label = rosterPlayerLabel(row.player);
      const fgm = Number(row.fgm) || 0;
      const fga = Number(row.fga) || 0;
      const tpm = Number(row.tpm) || 0;
      const tpa = Number(row.tpa) || 0;
      const ftm = Number(row.ftm) || 0;
      const fta = Number(row.fta) || 0;
      const totalSeconds = parsePlayedTime(row.play_time ?? formatPlayedTime(playedSeconds(row)));

      if (fgm > fga) return `${label}: FGM cannot be greater than FGA.`;
      if (tpm > tpa) return `${label}: 3PM cannot be greater than 3PA.`;
      if (ftm > fta) return `${label}: FTM cannot be greater than FTA.`;
      if (tpm > fgm) return `${label}: 3PM cannot be greater than FGM.`;
      if (totalSeconds === null) return `${label}: enter play time as minutes:seconds.`;
      if (totalSeconds > 3600) return `${label}: play time cannot be greater than 60:00.`;
    }

    return "";
  };

  const setMatchStatus = async (status) => {
    if (!isAdmin) return;
    setErr("");
    try {
      await matchesApi.update(id, {
        scheduled_at: meta.scheduled_at || null,
        venue_name: meta.venue_name?.trim() || null,
        quarter_length_seconds: Math.round((Number(meta.quarter_length_minutes) || 10) * 60),
        status,
      });
      await load();
      showToast(`Match marked ${status}.`);
    } catch (e) {
      const message = e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message;
      setErr(message);
      showToast(message, "error");
    }
  };

  const saveStats = async () => {
    if (!isAdmin) return;
    setErr("");
    const validationMessage = validateStatsDraft();
    if (validationMessage) {
      setErr(validationMessage);
      showToast(validationMessage, "error");
      return;
    }
    setStatsSaving(true);
    try {
      await matchesApi.submitStatsBulk(id, {
        stats: statsDraft.map((row) => ({
          ...row,
          played_seconds: parsePlayedTime(row.play_time ?? formatPlayedTime(playedSeconds(row))) ?? playedSeconds(row),
        })).map((row) => ({
          player_id: Number(row.player_id),
          team_id: Number(row.team_id),
          minutes: Math.floor((Number(row.played_seconds) || 0) / 60),
          played_seconds: Number(row.played_seconds) || 0,
          dnp: Boolean(row.dnp),
          fouled_out: Boolean(row.fouled_out),
          points: Number(row.points) || 0,
          rebounds: Number(row.rebounds) || 0,
          assists: Number(row.assists) || 0,
          steals: Number(row.steals) || 0,
          blocks: Number(row.blocks) || 0,
          fouls: Number(row.fouls) || 0,
          turnovers: Number(row.turnovers) || 0,
          fgm: Number(row.fgm) || 0,
          fga: Number(row.fga) || 0,
          tpm: Number(row.tpm) || 0,
          tpa: Number(row.tpa) || 0,
          ftm: Number(row.ftm) || 0,
          fta: Number(row.fta) || 0,
        })),
      });
      await load();
      showToast("Match stats saved.");
    } catch (e) {
      const message = e?.response?.data?.message || JSON.stringify(e?.response?.data) || e.message;
      setErr(message);
      showToast(message, "error");
    } finally {
      setStatsSaving(false);
    }
  };

  const togglePdfSection = (key) => {
    setPdfSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const statsTables = useMemo(() => {
    if (!match) return [];

    const buildTeamStats = (teamId, fallbackName) => {
      const rows = stats
        .filter((stat) => Number(stat.team_id) === Number(teamId))
        .sort((a, b) => {
          const pointsDiff = statValue(b.points) - statValue(a.points);
          if (pointsDiff !== 0) return pointsDiff;
          return playerLabel(a).localeCompare(playerLabel(b));
        });

      const totals = rows.reduce((acc, row) => ({
        played_seconds: acc.played_seconds + playedSeconds(row),
        points: acc.points + statValue(row.points),
        rebounds: acc.rebounds + statValue(row.rebounds),
        assists: acc.assists + statValue(row.assists),
        steals: acc.steals + statValue(row.steals),
        blocks: acc.blocks + statValue(row.blocks),
        fouls: acc.fouls + statValue(row.fouls),
        turnovers: acc.turnovers + statValue(row.turnovers),
        fgm: acc.fgm + statValue(row.fgm),
        fga: acc.fga + statValue(row.fga),
        tpm: acc.tpm + statValue(row.tpm),
        tpa: acc.tpa + statValue(row.tpa),
        ftm: acc.ftm + statValue(row.ftm),
        fta: acc.fta + statValue(row.fta),
      }), {
        played_seconds: 0,
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
      });

      return {
        teamId,
        teamName: fallbackName,
        rows,
        totals,
      };
    };

    return [
      buildTeamStats(match.home_team_id, resolveTeamName(match, "home")),
      buildTeamStats(match.away_team_id, resolveTeamName(match, "away")),
    ];
  }, [match, stats]);
  const liveEvents = useMemo(
    () => (Array.isArray(match?.live_events) ? match.live_events : []),
    [match?.live_events],
  );
  const matchPlayersById = useMemo(
    () => new Map([...homePlayers, ...awayPlayers].map((player) => [Number(player.id), player])),
    [awayPlayers, homePlayers],
  );
  const matchPdfOptions = useMemo(
    () => [
      {
        key: "players",
        label: "Players list",
        description: "Print the recorded players for each team.",
      },
      {
        key: "leaders",
        label: "Match leaders",
        description: "Show top performers in points, rebounds, assists, steals, and blocks.",
      },
      {
        key: "team_totals",
        label: "Team totals",
        description: "Include team summary rows for points, shooting, and other totals.",
      },
      {
        key: "box_score",
        label: "Box score",
        description: "Print the full player-by-player stat tables for both teams.",
      },
    ],
    [],
  );

  if (!match) return <Skeleton rows={4} />;

  return (
    <div className="page-stack">
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <section className="panel page-hero">
        <div className="section-heading">
          <div>
            <p className="section-heading__eyebrow">Match Center</p>
            <h1 className="section-heading__title">{resolveTeamName(match, "home")} vs {resolveTeamName(match, "away")}</h1>
            <p className="section-heading__copy">
              Round {match.round_number || "-"} - {match.status}
            </p>
          </div>
          {match?.tournament_id ? (
            <div className="page-actions">
              <button onClick={() => setIsPdfModalOpen(true)} disabled={isExportingPdf} className="btn-secondary">
                {isExportingPdf ? "Exporting..." : "Export PDF"}
              </button>
              {isAdmin ? (
                <>
                  <button onClick={() => nav(`/matches/${id}/live-tracker`)} className="btn-primary">
                    Live tracker
                  </button>
                  <button onClick={() => nav(`/matches/${id}/live-tracker-2`)} className="btn-primary">
                    Live tracker 2
                  </button>
                </>
              ) : null}
              <button onClick={() => nav(`/tournaments/${match.tournament_id}`)} className="btn-secondary">
                Back to tournament
              </button>
            </div>
          ) : null}
        </div>

        <div className="page-metrics mt-6">
          <div className="hero-stat">
            <div className="hero-stat__label">Status</div>
            <div className="hero-stat__value">{match.status}</div>
            <div className="hero-stat__meta">Current lifecycle state for this fixture.</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Scheduled</div>
            <div className="hero-stat__value">{match.scheduled_at ? "Set" : "TBD"}</div>
            <div className="hero-stat__meta">{match.scheduled_at ? `${formatDateTime(match.scheduled_at)} - ${venueLabel(match)}` : `No kickoff time assigned yet - ${venueLabel(match)}`}</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Result</div>
            <div className="hero-stat__value">
              {result.home_score !== "" && result.away_score !== "" ? `${result.home_score}-${result.away_score}` : "--"}
            </div>
            <div className="hero-stat__meta">Live scoreline stored for the selected match.</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__label">Quarter</div>
            <div className="hero-stat__value">{quarterMinutes(match)} min</div>
            <div className="hero-stat__meta">Used by the live clock and scoring chart.</div>
          </div>
        </div>
      </section>

      {isAdmin && (
        <div className="panel space-y-3 p-5">
          <div className="font-semibold text-slate-800">Match info</div>
          <div className="grid gap-2 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date and time</span>
              <input
                className="input"
                type="datetime-local"
                value={meta.scheduled_at}
                onChange={(e) => setMeta({ ...meta, scheduled_at: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Venue</span>
              <input
                className="input"
                placeholder={defaultVenueName || "Venue TBD"}
                value={meta.venue_name}
                onChange={(e) => setMeta({ ...meta, venue_name: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quarter length</span>
              <input
                className="input"
                type="number"
                min="1"
                max="20"
                step="1"
                value={meta.quarter_length_minutes}
                onChange={(e) => setMeta({ ...meta, quarter_length_minutes: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
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
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={saveMeta} className="btn-secondary">Save info</button>
            <button onClick={() => setMatchStatus("live")} className="btn-secondary">Start match</button>
            <button onClick={() => setMatchStatus("finished")} className="btn-secondary">Finish match</button>
            <button onClick={() => setMatchStatus("cancelled")} className="btn-secondary">Cancel match</button>
            <button onClick={remove} className="btn-danger">Delete match</button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="panel space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-800">Result</div>
              <div className="text-sm text-slate-500">
                {result.home_score !== "" && result.away_score !== ""
                  ? `${resolveTeamName(match, "home")} ${result.home_score} - ${result.away_score} ${resolveTeamName(match, "away")}`
                  : "No result saved yet."}
              </div>
            </div>
            <button onClick={() => setIsEditingResult((current) => !current)} className="btn-secondary">
              {isEditingResult ? "Cancel" : "Edit result"}
            </button>
          </div>

          {isEditingResult && (
            <div className="grid gap-2 md:grid-cols-3">
              <input
                className="input"
                type="number"
                min="0"
                placeholder="Home score"
                value={result.home_score}
                onChange={(e) => setResult({ ...result, home_score: e.target.value })}
              />
              <input
                className="input"
                type="number"
                min="0"
                placeholder="Away score"
                value={result.away_score}
                onChange={(e) => setResult({ ...result, away_score: e.target.value })}
              />
              <button onClick={saveResult} className="btn-primary">Save result</button>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="panel space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-800">Edit match stats</div>
              <div className="text-sm text-slate-500">Enter or update player box score rows for both teams.</div>
            </div>
            <button onClick={saveStats} disabled={statsSaving || statsDraft.length === 0} className="btn-primary">
              {statsSaving ? "Saving stats..." : "Save stats"}
            </button>
          </div>

          {statsDraft.length === 0 ? (
            <EmptyState
              title="No roster players available"
              description="Add players to both teams before entering match stats."
            />
          ) : (
            <div className="space-y-4">
              {[
                { teamId: match.home_team_id, teamName: resolveTeamName(match, "home"), players: homePlayers },
                { teamId: match.away_team_id, teamName: resolveTeamName(match, "away"), players: awayPlayers },
              ].map((teamBlock) => (
                <div key={teamBlock.teamId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 font-semibold text-slate-900">{teamBlock.teamName}</div>
                  {teamBlock.players.length === 0 ? (
                    <div className="text-sm text-slate-500">No roster players for this team yet.</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Player</th>
                            {["Play time", "DNP", "OUT", "PTS", "REB", "AST", "STL", "BLK", "FLS", "TO", "FGM", "FGA", "3PM", "3PA", "FTM", "FTA"].map((label) => (
                              <th key={label} className="px-2 py-2 text-right font-medium">{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {statsDraft
                            .filter((row) => Number(row.team_id) === Number(teamBlock.teamId))
                            .map((row) => (
                              <tr key={row.player_id} className="border-t border-slate-100">
                                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                                  {rosterPlayerLabel(row.player)}
                                </td>
                                <td className="px-1 py-1">
                                  <input
                                    className="stat-input stat-input--time"
                                    aria-label={`${rosterPlayerLabel(row.player)} play time`}
                                    inputMode="numeric"
                                    placeholder="0:00"
                                    value={row.play_time ?? formatPlayedTime(playedSeconds(row))}
                                    onChange={(event) => updateStatDraft(row.player_id, "play_time", event.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1 text-right">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(row.dnp)}
                                    onChange={(event) => updateStatFlag(row.player_id, "dnp", event.target.checked)}
                                  />
                                </td>
                                <td className="px-2 py-1 text-right">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(row.fouled_out)}
                                    onChange={(event) => updateStatFlag(row.player_id, "fouled_out", event.target.checked)}
                                  />
                                </td>
                                {[
                                  ["points", "PTS"],
                                  ["rebounds", "REB"],
                                  ["assists", "AST"],
                                  ["steals", "STL"],
                                  ["blocks", "BLK"],
                                  ["fouls", "FLS"],
                                  ["turnovers", "TO"],
                                  ["fgm", "FGM"],
                                  ["fga", "FGA"],
                                  ["tpm", "3PM"],
                                  ["tpa", "3PA"],
                                  ["ftm", "FTM"],
                                  ["fta", "FTA"],
                                ].map(([key, label]) => (
                                  <td key={key} className="px-1 py-1">
                                    <input
                                      className="stat-input"
                                      aria-label={`${rosterPlayerLabel(row.player)} ${label}`}
                                      type="number"
                                      min="0"
                                      value={row[key] ?? 0}
                                      onChange={(event) => updateStatDraft(row.player_id, key, event.target.value)}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-800">Live play-by-play</div>
            <div className="text-sm text-slate-500">Saved timeline from live match tracking.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowScoringChart((current) => !current)} className="btn-secondary">
              {showScoringChart ? "Hide scoring chart" : "Show scoring chart"}
            </button>
            <button onClick={() => setShowLiveEvents((current) => !current)} className="btn-secondary">
              {showLiveEvents ? "Hide play-by-play" : "Show play-by-play"}
            </button>
          </div>
        </div>

        {showScoringChart ? (
          liveEvents.length === 0 ? (
            <EmptyState
              title="No scoring chart yet"
              description="The chart will appear after live tracking saves made shots or free throws."
            />
          ) : (
            <ScoringChart
              events={liveEvents}
              homeName={resolveTeamName(match, "home")}
              awayName={resolveTeamName(match, "away")}
              playersById={matchPlayersById}
              matchRow={match}
              resolveTeamName={resolveTeamName}
              quarterLengthSeconds={match.quarter_length_seconds}
            />
          )
        ) : null}

        {showLiveEvents ? (
          liveEvents.length === 0 ? (
            <EmptyState
              title="No play-by-play saved"
              description="Live play-by-play will appear here after an admin finishes the live tracker."
            />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Q</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Play</th>
                  </tr>
                </thead>
                <tbody>
                  {liveEvents.map((event) => (
                    <tr key={event.id || `${event.quarter}-${event.clock}-${event.type}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{event.quarter}</td>
                      <td className="px-3 py-2">{event.clock}</td>
                      <td className="px-3 py-2">{formatLiveEventLabel(event, matchPlayersById, match, resolveTeamName)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      <div className="panel p-5">
        <div className="mb-4">
          <div className="font-semibold text-slate-800">Stats</div>
          <div className="text-sm text-slate-500">
            Team box scores with player-by-player totals and shooting lines.
          </div>
        </div>

        {stats.length === 0 ? (
          <EmptyState
            title="No stats yet"
            description={isAdmin ? "Use the stats editor above to enter the first box score." : "Stats will appear after an admin enters the box score."}
          />
        ) : (
          <div className="space-y-5">
            {statsTables.map((teamStats) => (
              <div key={teamStats.teamId || teamStats.teamName} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-base font-semibold text-slate-900">{teamStats.teamName}</div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {teamStats.rows.length} players
                  </div>
                </div>

                {teamStats.rows.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    No stats recorded for this team yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Player</th>
                          <th className="px-3 py-2 text-right font-medium">Play time</th>
                          <th className="px-3 py-2 text-right font-medium">DNP</th>
                          <th className="px-3 py-2 text-right font-medium">OUT</th>
                          <th className="px-3 py-2 text-right font-medium">PTS</th>
                          <th className="px-3 py-2 text-right font-medium">REB</th>
                          <th className="px-3 py-2 text-right font-medium">AST</th>
                          <th className="px-3 py-2 text-right font-medium">STL</th>
                          <th className="px-3 py-2 text-right font-medium">BLK</th>
                          <th className="px-3 py-2 text-right font-medium">FLS</th>
                          <th className="px-3 py-2 text-right font-medium">TO</th>
                          <th className="px-3 py-2 text-right font-medium">FGM</th>
                          <th className="px-3 py-2 text-right font-medium">FGA</th>
                          <th className="px-3 py-2 text-right font-medium">3PM</th>
                          <th className="px-3 py-2 text-right font-medium">3PA</th>
                          <th className="px-3 py-2 text-right font-medium">FTM</th>
                          <th className="px-3 py-2 text-right font-medium">FTA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamStats.rows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{playerLabel(row)}</td>
                            <td className="px-3 py-2 text-right">{formatPlayedTime(playedSeconds(row))}</td>
                            <td className="px-3 py-2 text-right">{row.dnp ? "Yes" : "-"}</td>
                            <td className="px-3 py-2 text-right">{row.fouled_out ? "Yes" : "-"}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.points)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.rebounds)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.assists)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.steals)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.blocks)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.fouls)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.turnovers)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.fgm)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.fga)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.tpm)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.tpa)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.ftm)}</td>
                            <td className="px-3 py-2 text-right">{statValue(row.fta)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                          <td className="px-3 py-2">Team total</td>
                          <td className="px-3 py-2 text-right">{formatPlayedTime(teamStats.totals.played_seconds)}</td>
                          <td className="px-3 py-2 text-right">-</td>
                          <td className="px-3 py-2 text-right">-</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.points}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.rebounds}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.assists}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.steals}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.blocks}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.fouls}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.turnovers}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.fgm}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.fga}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.tpm}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.tpa}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.ftm}</td>
                          <td className="px-3 py-2 text-right">{teamStats.totals.fta}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <PdfExportModal
        isOpen={isPdfModalOpen}
        title="Configure match PDF"
        subtitle="Choose which match sections should be included in the exported report."
        options={matchPdfOptions}
        selections={pdfSections}
        onToggle={togglePdfSection}
        onClose={() => setIsPdfModalOpen(false)}
        onConfirm={exportPdf}
        confirmLabel="Export match PDF"
        loading={isExportingPdf}
      />
    </div>
  );
}



