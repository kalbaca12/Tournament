export function selectedSections(state) {
  return Object.entries(state)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
}

export function formatDateTime(value) {
  if (!value) return "No time";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function statValue(value) {
  return value ?? 0;
}

export function playedSeconds(row) {
  const seconds = Number(row?.played_seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.max(0, seconds);
  }
  return Math.max(0, (Number(row?.minutes) || 0) * 60);
}

export function formatPlayedTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function parsePlayedTime(value) {
  const rawValue = String(value || "").trim();
  if (rawValue === "") return 0;

  const match = rawValue.match(/^(\d{1,3})(?::([0-5]?\d))?$/);
  if (!match) return null;

  const minutes = Number(match[1]) || 0;
  const seconds = match[2] === undefined ? 0 : Number(match[2]) || 0;
  return (minutes * 60) + seconds;
}

export function playerLabel(statRow) {
  const firstName = statRow?.player?.first_name || "";
  const lastName = statRow?.player?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const jersey = statRow?.player?.jersey_number ?? null;

  if (!fullName) {
    return jersey !== null ? `#${jersey} Player ${statRow.player_id}` : `Player ${statRow.player_id}`;
  }

  return jersey !== null ? `#${jersey} ${fullName}` : fullName;
}

export function rosterPlayerLabel(player) {
  const fullName = `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
  const jersey = player?.jersey_number ?? null;
  return jersey !== null ? `#${jersey} ${fullName || `Player ${player.id}`}` : fullName || `Player ${player.id}`;
}
