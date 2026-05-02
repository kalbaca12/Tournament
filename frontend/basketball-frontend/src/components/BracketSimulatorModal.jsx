import { useMemo, useState } from "react";

function winnerKey(roundIndex, matchIndex) {
  return `${roundIndex}:${matchIndex}`;
}

function createBaseParticipant(match, side, label) {
  const teamId = side === "home" ? match.home_team_id : match.away_team_id;
  const safeLabel = label || "TBD";

  return {
    entryKey: teamId ? `team-${teamId}` : `match-${match.id}-${side}-${safeLabel}`,
    label: safeLabel,
    teamId: teamId ?? null,
    isPlaceholder: safeLabel === "TBD",
  };
}

function isActualWinner(match, side) {
  if (match?.home_score === null || match?.home_score === undefined || match?.away_score === null || match?.away_score === undefined) {
    return false;
  }

  const home = Number(match.home_score);
  const away = Number(match.away_score);

  if (!Number.isFinite(home) || !Number.isFinite(away) || home === away) {
    return false;
  }

  return side === "home" ? home > away : away > home;
}

function buildInitialWinnerSelections(bracketRounds, playoffName) {
  const selections = {};
  const builtRounds = [];

  bracketRounds.forEach((roundData, roundIndex) => {
    const prevRound = builtRounds[roundIndex - 1]?.matches || [];
    const matches = roundData.matches.map((match, matchIndex) => {
      const participants =
        roundIndex === 0
          ? [
              createBaseParticipant(match, "home", playoffName(match, "home", matchIndex)),
              createBaseParticipant(match, "away", playoffName(match, "away", matchIndex)),
            ]
          : [
              prevRound[matchIndex * 2]?.winner ?? null,
              prevRound[matchIndex * 2 + 1]?.winner ?? null,
            ];

      let winner = null;
      if (isActualWinner(match, "home")) winner = participants[0] ?? null;
      if (isActualWinner(match, "away")) winner = participants[1] ?? null;

      if (!winner) {
        const currentChoice = selections[winnerKey(roundIndex, matchIndex)];
        winner = participants.find((entry) => entry && currentChoice && entry.entryKey === currentChoice.entryKey) ?? null;
      }

      if (winner) {
        selections[winnerKey(roundIndex, matchIndex)] = winner;
      }

      return {
        id: match.id,
        matchIndex,
        participants,
        winner,
      };
    });

    builtRounds.push({ matches });
  });

  return selections;
}

function buildSimulationRounds(bracketRounds, playoffName, roundLabel, simulatedWinners) {
  const builtRounds = [];

  bracketRounds.forEach((roundData, roundIndex) => {
    const previousRoundMatches = builtRounds[roundIndex - 1]?.matches || [];

    const matches = roundData.matches.map((match, matchIndex) => {
      const participants =
        roundIndex === 0
          ? [
              createBaseParticipant(match, "home", playoffName(match, "home", matchIndex)),
              createBaseParticipant(match, "away", playoffName(match, "away", matchIndex)),
            ]
          : [
              previousRoundMatches[matchIndex * 2]?.winner ?? null,
              previousRoundMatches[matchIndex * 2 + 1]?.winner ?? null,
            ];

      const currentChoice = simulatedWinners[winnerKey(roundIndex, matchIndex)];
      const winner = participants.find((entry) => entry && currentChoice && entry.entryKey === currentChoice.entryKey) ?? null;

      return {
        id: match.id,
        matchIndex,
        participants,
        winner,
        title: roundLabel(roundData.matches.length),
      };
    });

    builtRounds.push({
      round: roundData.round,
      title: roundLabel(roundData.matches.length),
      matches,
    });
  });

  return builtRounds;
}

export default function BracketSimulatorModal({ isOpen, onClose, bracketRounds, playoffName, roundLabel }) {
  const bracketSeedKey = useMemo(
    () =>
      JSON.stringify(
        bracketRounds.map((roundData) =>
          roundData.matches.map((match) => ({
            id: match.id,
            round: match.round_number,
            home_team_id: match.home_team_id,
            away_team_id: match.away_team_id,
            home_score: match.home_score,
            away_score: match.away_score,
            status: match.status,
          })),
        ),
      ),
    [bracketRounds],
  );
  const [winnerState, setWinnerState] = useState(() => ({
    seedKey: bracketSeedKey,
    selections: buildInitialWinnerSelections(bracketRounds, playoffName),
  }));
  const [dragState, setDragState] = useState(null);

  if (winnerState.seedKey !== bracketSeedKey) {
    setWinnerState({
      seedKey: bracketSeedKey,
      selections: buildInitialWinnerSelections(bracketRounds, playoffName),
    });
  }

  const simulatedWinners = winnerState.selections;

  const simulationRounds = useMemo(
    () => buildSimulationRounds(bracketRounds, playoffName, roundLabel, simulatedWinners),
    [bracketRounds, playoffName, roundLabel, simulatedWinners],
  );

  const hasRounds = simulationRounds.length > 0;
  const champion = hasRounds ? simulationRounds[simulationRounds.length - 1].matches[0]?.winner ?? null : null;

  if (!isOpen || !hasRounds) return null;

  const isValidDropTarget = (targetRoundIndex, targetMatchIndex, targetSideIndex) => {
    if (!dragState?.participant) return false;
    if (targetRoundIndex !== dragState.roundIndex + 1) return false;
    if (targetMatchIndex !== Math.floor(dragState.matchIndex / 2)) return false;
    return targetSideIndex === dragState.matchIndex % 2;
  };

  const handleDrop = (targetRoundIndex, targetMatchIndex, targetSideIndex) => {
    if (!isValidDropTarget(targetRoundIndex, targetMatchIndex, targetSideIndex)) return;

    setWinnerState((current) => ({
      ...current,
      selections: {
        ...current.selections,
        [winnerKey(dragState.roundIndex, dragState.matchIndex)]: dragState.participant,
      },
    }));
    setDragState(null);
  };

  const pickWinner = (roundIndex, matchIndex, participant) => {
    if (!participant || participant.isPlaceholder) return;

    setWinnerState((current) => ({
      ...current,
      selections: {
        ...current.selections,
        [winnerKey(roundIndex, matchIndex)]: participant,
      },
    }));
  };

  const resetSimulation = () => {
    setWinnerState({
      seedKey: bracketSeedKey,
      selections: buildInitialWinnerSelections(bracketRounds, playoffName),
    });
    setDragState(null);
  };

  return (
    <div className="sim-modal-backdrop" onClick={onClose}>
      <div className="sim-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sim-modal-header">
          <div>
            <h3 className="sim-modal-title">Bracket simulator</h3>
            <p className="sim-modal-copy">Drag a team forward or click a team row to mark them as the winner of their current match.</p>
          </div>
          <div className="sim-modal-actions">
            <button type="button" onClick={resetSimulation} className="btn-secondary">
              Reset
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>

        <div className="sim-modal-summary">
          <span className="sim-summary-label">Projected champion</span>
          <span className="sim-summary-value">{champion?.label || "Choose winners to finish the bracket"}</span>
        </div>

        <div className="sim-board">
          {simulationRounds.map((roundData, roundIndex) => (
            <section key={roundData.round} className="sim-round" style={{ "--slot-factor": 2 ** roundIndex }}>
              <div className="sim-round-title">{roundData.title}</div>
              <div className="sim-round-track">
                {roundData.matches.map((match) => (
                  <div key={match.id} className={`sim-slot ${roundIndex === 0 ? "is-opening-round" : ""}`}>
                    <div className="sim-match-card">
                      {match.participants.map((participant, sideIndex) => {
                        const canDrag = Boolean(participant && !participant.isPlaceholder && roundIndex < simulationRounds.length - 1);
                        const isPickedWinner = Boolean(participant && match.winner && participant.entryKey === match.winner.entryKey);
                        const dropActive = isValidDropTarget(roundIndex, match.matchIndex, sideIndex);
                        const dropText =
                          roundIndex === 0
                            ? "Drag this team forward"
                            : sideIndex === 0
                              ? "Drop winner here"
                              : "Drop winner here";

                        return (
                          <div
                            key={`${match.id}-${sideIndex}`}
                            className={`sim-team-row ${canDrag ? "is-draggable" : ""} ${isPickedWinner ? "is-picked" : ""} ${dropActive ? "is-drop-target" : ""}`}
                            role={participant && !participant.isPlaceholder ? "button" : undefined}
                            tabIndex={participant && !participant.isPlaceholder ? 0 : undefined}
                            draggable={canDrag}
                            onClick={() => pickWinner(roundIndex, match.matchIndex, participant)}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === " ") && participant && !participant.isPlaceholder) {
                                e.preventDefault();
                                pickWinner(roundIndex, match.matchIndex, participant);
                              }
                            }}
                            onDragStart={() => setDragState({ roundIndex, matchIndex: match.matchIndex, participant })}
                            onDragEnd={() => setDragState(null)}
                            onDragOver={(e) => {
                              if (isValidDropTarget(roundIndex, match.matchIndex, sideIndex)) {
                                e.preventDefault();
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              handleDrop(roundIndex, match.matchIndex, sideIndex);
                            }}
                          >
                            <span className="sim-team-label">{participant?.label || dropText}</span>
                            {participant && !participant.isPlaceholder && <span className="sim-team-hint">{canDrag ? "drag/pick" : "pick"}</span>}
                            {!participant && <span className="sim-team-hint">drop</span>}
                          </div>
                        );
                      })}

                      {match.winner && (
                        <button
                          type="button"
                          className="sim-clear-pick"
                          onClick={() =>
                            setWinnerState((current) => {
                              const next = { ...current.selections };
                              delete next[winnerKey(roundIndex, match.matchIndex)];
                              return { ...current, selections: next };
                            })
                          }
                        >
                          Clear winner
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
