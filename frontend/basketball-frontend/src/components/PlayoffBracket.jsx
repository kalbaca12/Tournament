import { Link } from "react-router-dom";

function hasScore(value) {
  return value !== null && value !== undefined && value !== "";
}

function isWinner(match, side) {
  if (!hasScore(match.home_score) || !hasScore(match.away_score)) return false;

  const home = Number(match.home_score);
  const away = Number(match.away_score);

  if (!Number.isFinite(home) || !Number.isFinite(away) || home === away) {
    return false;
  }

  return side === "home" ? home > away : away > home;
}

function scoreText(value) {
  return hasScore(value) ? value : "-";
}

export default function PlayoffBracket({ bracketRounds, roundLabel, playoffName, formatDateTime, actions = null, hideHeading = false }) {
  if (bracketRounds.length === 0) return null;

  return (
    <div className="space-y-3">
      {!hideHeading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-800">Playoff bracket</h3>
          {actions}
        </div>
      )}
      <div className="bracket-board__hint">Scroll sideways to view the full bracket.</div>
      <div className="bracket-board">
        {bracketRounds.map((roundData, roundIndex) => (
          <section key={roundData.round} className="bracket-round" style={{ "--slot-factor": 2 ** roundIndex }}>
            <div className="bracket-round-title">{roundLabel(roundData.matches.length)}</div>

            <div className="bracket-round-track">
              {roundData.matches.map((match, matchIndex) => (
                <div key={match.id} className={`bracket-slot ${roundIndex === 0 ? "is-opening-round" : ""}`}>
                  <div className={`bracket-match ${match.status === "finished" ? "is-finished" : ""} ${match.status === "live" ? "is-live" : ""}`}>
                    <Link to={`/matches/${match.id}`} className="bracket-match-link">
                      <div className="bracket-match-meta">
                        <span className="bracket-match-id">Round {match.round_number || "-"}</span>
                        <span className={`bracket-status bracket-status-${match.status || "scheduled"}`}>{match.status || "scheduled"}</span>
                      </div>

                      <div className="bracket-match-body">
                        <div className={`bracket-team-row ${isWinner(match, "home") ? "is-winner" : ""}`}>
                          <span className="bracket-team-name">{playoffName(match, "home", matchIndex)}</span>
                          <span className="bracket-team-score">{scoreText(match.home_score)}</span>
                        </div>

                        <div className={`bracket-team-row ${isWinner(match, "away") ? "is-winner" : ""}`}>
                          <span className="bracket-team-name">{playoffName(match, "away", matchIndex)}</span>
                          <span className="bracket-team-score">{scoreText(match.away_score)}</span>
                        </div>
                      </div>

                      <div className="bracket-match-footer">{formatDateTime(match.scheduled_at)}</div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
