import { rosterPlayerLabel } from "./matchDisplay";

function eventPlayerLabel(playersById, playerId) {
  return rosterPlayerLabel(playersById.get(Number(playerId)));
}

export function formatLiveEventLabel(event, playersById, matchRow, resolveTeamName) {
  const player = (playerId) => eventPlayerLabel(playersById, playerId);
  const team = event.teamSide === "home" ? resolveTeamName(matchRow, "home") : resolveTeamName(matchRow, "away");

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
  if (event.type === "stat_adjust") return `${team}: ${player(event.playerId)} ${event.label || event.statKey || "stat"}`;
  return event.type || "Event";
}
