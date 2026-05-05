import { useMemo, useState } from "react";

function winnerKey(roundIndex, matchIndex) {
  return `${roundIndex}:${matchIndex}`;
}

function hasScore(value) {
  return value !== null && value !== undefined && value !== "";
}

function actualWinnerSide(match) {
  if (!hasScore(match?.home_score) || !hasScore(match?.away_score)) return null;
  const home = Number(match.home_score);
  const away = Number(match.away_score);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home === away) return null;
  return home > away ? "home" : "away";
}

function defaultScoreRow(side) {
  return side === "home"
    ? { home_score: "80", away_score: "79" }
    : { home_score: "79", away_score: "80" };
}

function buildInitialScoreMap(matchRows) {
  return matchRows.reduce((acc, match) => {
    if (hasScore(match?.home_score) && hasScore(match?.away_score)) {
      acc[match.id] = {
        home_score: String(match.home_score),
        away_score: String(match.away_score),
      };
    }
    return acc;
  }, {});
}

function parseScoreValue(value) {
  if (!hasScore(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function parseScoreRow(scoreRow) {
  if (!scoreRow) return null;
  const homeScore = parseScoreValue(scoreRow.home_score);
  const awayScore = parseScoreValue(scoreRow.away_score);
  if (homeScore === null || awayScore === null) return null;
  return { home_score: homeScore, away_score: awayScore };
}

function winnerSideFromScoreRow(scoreRow) {
  const parsed = parseScoreRow(scoreRow);
  if (!parsed || parsed.home_score === parsed.away_score) return null;
  return parsed.home_score > parsed.away_score ? "home" : "away";
}

function createParticipant(teamId, label) {
  return {
    entryKey: teamId ? `team-${teamId}` : `placeholder-${label || "tbd"}`,
    teamId: teamId ?? null,
    label: label || "TBD",
    isPlaceholder: !teamId,
  };
}

function emptyRow(teamId, teamName) {
  return {
    team_id: teamId,
    team_name: teamName || `Team ${teamId}`,
    played: 0,
    wins: 0,
    losses: 0,
    points_for: 0,
    points_against: 0,
    diff: 0,
    points: 0,
    rank: 0,
  };
}

function sortRows(rows) {
  return [...rows].sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.diff !== left.diff) return right.diff - left.diff;
    if (right.points_for !== left.points_for) return right.points_for - left.points_for;
    return left.team_id - right.team_id;
  });
}

function withRanks(rows) {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function applyWinnerToTable(table, match, winnerSide, scoreRow) {
  const homeTeamId = Number(match.home_team_id);
  const awayTeamId = Number(match.away_team_id);
  if (!table[homeTeamId] || !table[awayTeamId] || !winnerSide) return;
  const parsedScore = parseScoreRow(scoreRow);
  const homeScore = parsedScore?.home_score ?? (winnerSide === "home" ? 80 : 79);
  const awayScore = parsedScore?.away_score ?? (winnerSide === "away" ? 80 : 79);

  table[homeTeamId].played += 1;
  table[awayTeamId].played += 1;
  table[homeTeamId].points_for += homeScore;
  table[homeTeamId].points_against += awayScore;
  table[awayTeamId].points_for += awayScore;
  table[awayTeamId].points_against += homeScore;

  if (homeScore > awayScore) {
    table[homeTeamId].wins += 1;
    table[awayTeamId].losses += 1;
  } else {
    table[awayTeamId].wins += 1;
    table[homeTeamId].losses += 1;
  }

  table[homeTeamId].diff = table[homeTeamId].points_for - table[homeTeamId].points_against;
  table[awayTeamId].diff = table[awayTeamId].points_for - table[awayTeamId].points_against;
  table[homeTeamId].points = table[homeTeamId].wins * 2 + table[homeTeamId].losses;
  table[awayTeamId].points = table[awayTeamId].wins * 2 + table[awayTeamId].losses;
}

function playoffQualifiedCount(teamCount) {
  if (teamCount >= 8) return 8;
  if (teamCount >= 4) return 4;
  return teamCount >= 2 ? 2 : 0;
}

function pairedGroupCrossovers(groups, qualifiersPerGroup) {
  const pairings = [];
  for (let index = 0; index < groups.length; index += 2) {
    const pair = groups.slice(index, index + 2);
    if (pair.length < 2) continue;
    const leftQualifiers = pair[0].rows.slice(0, qualifiersPerGroup);
    const rightQualifiers = pair[1].rows.slice(0, qualifiersPerGroup);
    if (leftQualifiers.length < qualifiersPerGroup || rightQualifiers.length < qualifiersPerGroup) continue;
    if (qualifiersPerGroup === 1) {
      pairings.push({ home: leftQualifiers[0], away: rightQualifiers[0] });
      continue;
    }
    for (let qualifierIndex = 0; qualifierIndex < Math.floor(qualifiersPerGroup / 2); qualifierIndex += 1) {
      pairings.push({
        home: leftQualifiers[qualifierIndex],
        away: rightQualifiers[qualifiersPerGroup - qualifierIndex - 1],
      });
      pairings.push({
        home: rightQualifiers[qualifierIndex],
        away: leftQualifiers[qualifiersPerGroup - qualifierIndex - 1],
      });
    }
  }
  return pairings;
}

function seededFallbackPairings(groups, qualifierCount) {
  const qualifiers = groups.flatMap((group) => group.rows);
  qualifiers.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    if (right.points !== left.points) return right.points - left.points;
    if (right.diff !== left.diff) return right.diff - left.diff;
    if (right.points_for !== left.points_for) return right.points_for - left.points_for;
    return left.team_id - right.team_id;
  });

  const selected = qualifiers.slice(0, qualifierCount);
  const pairings = [];
  for (let index = 0; index < Math.floor(selected.length / 2); index += 1) {
    pairings.push({ home: selected[index], away: selected[selected.length - index - 1] });
  }
  return pairings;
}

function buildRoundOnePairings(groups, qualifierCount) {
  const groupCount = groups.length;
  if (groupCount === 0 || qualifierCount < 2) return [];
  const qualifiersPerGroup = Math.floor(qualifierCount / groupCount);
  if (qualifiersPerGroup > 0 && qualifiersPerGroup * groupCount === qualifierCount && groupCount % 2 === 0) {
    return pairedGroupCrossovers(groups, qualifiersPerGroup);
  }
  return seededFallbackPairings(groups, qualifierCount);
}

function buildInitialGroupSelections(groupMatches) {
  return groupMatches.reduce((acc, match) => {
    const winnerSide = actualWinnerSide(match);
    if (winnerSide) acc[match.id] = winnerSide;
    return acc;
  }, {});
}

function buildWinnerMap(matches, selections, scores) {
  return matches.reduce((acc, match) => {
    acc[match.id] = winnerSideFromScoreRow(scores[match.id]) || selections[match.id] || null;
    return acc;
  }, {});
}

function buildGroupStandings(groupMatches, resolveTeamName, winnerMap, groupScores) {
  const tables = {};
  for (const match of groupMatches) {
    const groupCode = String(match.group_code || "?");
    if (!tables[groupCode]) tables[groupCode] = {};
    if (match.home_team_id) {
      tables[groupCode][match.home_team_id] ||= emptyRow(match.home_team_id, resolveTeamName(match, "home"));
    }
    if (match.away_team_id) {
      tables[groupCode][match.away_team_id] ||= emptyRow(match.away_team_id, resolveTeamName(match, "away"));
    }
  }

  for (const match of groupMatches) {
    const groupCode = String(match.group_code || "?");
    applyWinnerToTable(tables[groupCode], match, winnerMap[match.id], groupScores[match.id] || null);
  }

  return Object.keys(tables)
    .sort((left, right) => left.localeCompare(right))
    .map((groupCode) => ({
      group_code: groupCode,
      rows: withRanks(sortRows(Object.values(tables[groupCode]))),
    }));
}

function buildInitialPlayoffSelections(bracketRounds, roundOnePairings) {
  const selections = {};
  const builtRounds = [];
  bracketRounds.forEach((roundData, roundIndex) => {
    const previousRound = builtRounds[roundIndex - 1]?.matches || [];
    const matches = roundData.matches.map((match, matchIndex) => {
      const participants =
        roundIndex === 0
          ? [
              createParticipant(roundOnePairings[matchIndex]?.home?.team_id ?? null, roundOnePairings[matchIndex]?.home?.team_name || "TBD"),
              createParticipant(roundOnePairings[matchIndex]?.away?.team_id ?? null, roundOnePairings[matchIndex]?.away?.team_name || "TBD"),
            ]
          : [
              previousRound[matchIndex * 2]?.winner ?? null,
              previousRound[matchIndex * 2 + 1]?.winner ?? null,
            ];

      const actualSide = actualWinnerSide(match);
      const actualWinner = actualSide === "home" ? participants[0] : actualSide === "away" ? participants[1] : null;
      if (actualWinner && !actualWinner.isPlaceholder) {
        selections[winnerKey(roundIndex, matchIndex)] = actualWinner.entryKey;
      }

      return {
        participants,
        winner: actualWinner && !actualWinner.isPlaceholder ? actualWinner : null,
      };
    });
    builtRounds.push({ matches });
  });
  return selections;
}

function buildPlayoffRounds(bracketRounds, roundOnePairings, playoffSelections, playoffScores, roundLabel) {
  const builtRounds = [];
  bracketRounds.forEach((roundData, roundIndex) => {
    const previousRoundMatches = builtRounds[roundIndex - 1]?.matches || [];
    const matches = roundData.matches.map((match, matchIndex) => {
      const participants =
        roundIndex === 0
          ? [
              createParticipant(roundOnePairings[matchIndex]?.home?.team_id ?? null, roundOnePairings[matchIndex]?.home?.team_name || "TBD"),
              createParticipant(roundOnePairings[matchIndex]?.away?.team_id ?? null, roundOnePairings[matchIndex]?.away?.team_name || "TBD"),
            ]
          : [
              previousRoundMatches[matchIndex * 2]?.winner ?? null,
              previousRoundMatches[matchIndex * 2 + 1]?.winner ?? null,
            ];

      const scoreWinner = winnerSideFromScoreRow(playoffScores[match.id]);
      const selectedKey = playoffSelections[winnerKey(roundIndex, matchIndex)];
      const winner = scoreWinner
        ? participants[scoreWinner === "home" ? 0 : 1] ?? null
        : participants.find((participant) => participant && participant.entryKey === selectedKey) ?? null;

      return { id: match.id, matchIndex, participants, winner, title: roundLabel(roundData.matches.length) };
    });
    builtRounds.push({ round: roundData.round, title: roundLabel(roundData.matches.length), matches });
  });
  return builtRounds;
}

export default function GroupsPlayoffsSimulatorModal({
  isOpen,
  onClose,
  format = "groups_playoffs",
  matches,
  bracketRounds,
  roundLabel,
  resolveTeamName,
  formatDateTime,
}) {
  const groupMatches = useMemo(
    () =>
      [...matches]
        .filter((match) => match.stage === "group")
        .sort((left, right) => {
          const leftGroup = String(left.group_code || "");
          const rightGroup = String(right.group_code || "");
          if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup);
          const leftRound = Number(left.round_number || 0);
          const rightRound = Number(right.round_number || 0);
          if (leftRound !== rightRound) return leftRound - rightRound;
          const leftTime = left.scheduled_at ? new Date(left.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
          const rightTime = right.scheduled_at ? new Date(right.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
          if (leftTime !== rightTime) return leftTime - rightTime;
          return left.id - right.id;
        }),
    [matches],
  );

  const initialGroupSelections = useMemo(() => buildInitialGroupSelections(groupMatches), [groupMatches]);
  const initialGroupScores = useMemo(() => buildInitialScoreMap(groupMatches), [groupMatches]);
  const initialPlayoffScores = useMemo(() => buildInitialScoreMap(bracketRounds.flatMap((roundData) => roundData.matches)), [bracketRounds]);
  const groupSeedKey = useMemo(
    () =>
      JSON.stringify({
        isOpen,
        matches: groupMatches.map((match) => ({
          id: match.id,
          home_score: match.home_score,
          away_score: match.away_score,
          status: match.status,
        })),
      }),
    [groupMatches, isOpen],
  );

  const [groupState, setGroupState] = useState(() => ({
    seedKey: groupSeedKey,
    selections: initialGroupSelections,
    scores: initialGroupScores,
  }));
  const [playoffState, setPlayoffState] = useState(() => ({
    seedKey: "",
    selections: {},
  }));
  const [dragState, setDragState] = useState(null);

  if (groupState.seedKey !== groupSeedKey) {
    setGroupState({
      seedKey: groupSeedKey,
      selections: initialGroupSelections,
      scores: initialGroupScores,
    });
  }

  const groupSelections = groupState.selections;
  const groupScores = groupState.scores;

  const groupWinnerMap = useMemo(() => buildWinnerMap(groupMatches, groupSelections, groupScores), [groupMatches, groupScores, groupSelections]);
  const simulatedGroups = useMemo(() => buildGroupStandings(groupMatches, resolveTeamName, groupWinnerMap, groupScores), [groupMatches, groupScores, groupWinnerMap, resolveTeamName]);
  const matchesByGroup = useMemo(
    () =>
      groupMatches.reduce((acc, match) => {
        const key = match.group_code || "?";
        if (!acc[key]) acc[key] = [];
        acc[key].push(match);
        return acc;
      }, {}),
    [groupMatches],
  );

  const totalTeamCount = simulatedGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const roundOneMatchCount = bracketRounds[0]?.matches.length || 0;
  const qualifierCount = Math.min(playoffQualifiedCount(totalTeamCount), roundOneMatchCount * 2);
  const allGroupMatchesPicked = groupMatches.length > 0 && groupMatches.every((match) => Boolean(groupWinnerMap[match.id]));
  const roundOnePairings = useMemo(() => (allGroupMatchesPicked ? buildRoundOnePairings(simulatedGroups, qualifierCount) : []), [allGroupMatchesPicked, qualifierCount, simulatedGroups]);
  const playoffSeedKey = useMemo(
    () =>
      JSON.stringify({
        rounds: bracketRounds.map((roundData) => roundData.matches.map((match) => match.id)),
        pairings: roundOnePairings.map((pairing) => ({
          home: pairing.home?.team_id ?? null,
          away: pairing.away?.team_id ?? null,
        })),
      }),
    [bracketRounds, roundOnePairings],
  );
  const baselinePlayoffSelections = useMemo(() => (allGroupMatchesPicked ? buildInitialPlayoffSelections(bracketRounds, roundOnePairings) : {}), [allGroupMatchesPicked, bracketRounds, roundOnePairings]);

  if (playoffState.seedKey !== playoffSeedKey) {
    setPlayoffState({
      seedKey: playoffSeedKey,
      selections: baselinePlayoffSelections,
    });
  }

  const playoffSelections = playoffState.selections;

  const playoffRounds = useMemo(() => buildPlayoffRounds(bracketRounds, roundOnePairings, playoffSelections, initialPlayoffScores, roundLabel), [bracketRounds, initialPlayoffScores, playoffSelections, roundLabel, roundOnePairings]);
  const champion = playoffRounds.length > 0 ? playoffRounds[playoffRounds.length - 1]?.matches[0]?.winner ?? null : null;
  const isRoundRobin = format === "round_robin";
  const stageTitle = isRoundRobin ? "Regular season" : "Group stage";
  const stageSummaryLabel = isRoundRobin ? "Regular-season picks" : "Group picks";
  const stagePanelTitle = isRoundRobin ? "League table" : null;
  const stageHelpText = isRoundRobin
    ? "Pick winners for regular-season matches, then adjust the score if you want. The league table recalculates immediately."
    : "Pick a winner for any group match, then adjust the score if you want. The local tables recalculate immediately.";
  const playoffHelpText = allGroupMatchesPicked
    ? "Now you can click a playoff team to pick the winner or drag winners forward through the bracket."
    : isRoundRobin
      ? "Pick winners for all regular-season matches first, then the playoff bracket unlocks locally."
      : "Pick winners for all group matches first, then the playoff bracket unlocks locally.";

  if (!isOpen) return null;

  const ensureWinnerScore = (currentMap, matchId, side) => {
    const currentWinner = winnerSideFromScoreRow(currentMap[matchId]);
    if (currentWinner === side) return currentMap;
    return { ...currentMap, [matchId]: defaultScoreRow(side) };
  };

  const pickGroupWinner = (matchId, side) => {
    setGroupState((current) => ({
      ...current,
      scores: ensureWinnerScore(current.scores, matchId, side),
      selections: { ...current.selections, [matchId]: side },
    }));
  };

  const updateGroupScore = (matchId, side, value) => {
    const normalizedValue = value === "" ? "" : String(Math.max(0, Number(value) || 0));
    const field = side === "home" ? "home_score" : "away_score";
    const nextRow = {
      home_score: field === "home_score" ? normalizedValue : groupScores[matchId]?.home_score ?? "",
      away_score: field === "away_score" ? normalizedValue : groupScores[matchId]?.away_score ?? "",
    };
    setGroupState((current) => ({
      ...current,
      scores: { ...current.scores, [matchId]: nextRow },
    }));
    const scoreWinner = winnerSideFromScoreRow(nextRow);
    if (scoreWinner) {
      setGroupState((current) => ({
        ...current,
        selections: { ...current.selections, [matchId]: scoreWinner },
      }));
    }
  };

  const clearGroupPick = (matchId) => {
    const baselineWinner = initialGroupSelections[matchId];
    const baselineScore = initialGroupScores[matchId];
    setGroupState((current) => {
      const nextSelections = { ...current.selections };
      const nextScores = { ...current.scores };
      if (baselineWinner) nextSelections[matchId] = baselineWinner;
      else delete nextSelections[matchId];
      if (baselineScore) nextScores[matchId] = baselineScore;
      else delete nextScores[matchId];
      return { ...current, selections: nextSelections, scores: nextScores };
    });
  };

  const pickPlayoffWinner = (roundIndex, matchIndex, participant) => {
    if (!participant || participant.isPlaceholder || !allGroupMatchesPicked) return;
    setPlayoffState((current) => ({
      ...current,
      selections: { ...current.selections, [winnerKey(roundIndex, matchIndex)]: participant.entryKey },
    }));
  };

  const clearPlayoffPick = (roundIndex, matchIndex) => {
    const baselineWinner = baselinePlayoffSelections[winnerKey(roundIndex, matchIndex)];
    setPlayoffState((current) => {
      const next = { ...current.selections };
      if (baselineWinner) next[winnerKey(roundIndex, matchIndex)] = baselineWinner;
      else delete next[winnerKey(roundIndex, matchIndex)];
      return { ...current, selections: next };
    });
  };

  const isValidDropTarget = (targetRoundIndex, targetMatchIndex, targetSideIndex) => {
    if (!dragState?.participant || !allGroupMatchesPicked) return false;
    if (targetRoundIndex !== dragState.roundIndex + 1) return false;
    if (targetMatchIndex !== Math.floor(dragState.matchIndex / 2)) return false;
    return targetSideIndex === dragState.matchIndex % 2;
  };

  const handleDrop = (targetRoundIndex, targetMatchIndex, targetSideIndex) => {
    if (!isValidDropTarget(targetRoundIndex, targetMatchIndex, targetSideIndex)) return;
    pickPlayoffWinner(dragState.roundIndex, dragState.matchIndex, dragState.participant);
    setDragState(null);
  };

  const resetSimulation = () => {
    setGroupState({
      seedKey: groupSeedKey,
      selections: initialGroupSelections,
      scores: initialGroupScores,
    });
    setPlayoffState({
      seedKey: playoffSeedKey,
      selections: baselinePlayoffSelections,
    });
    setDragState(null);
  };

  return (
    <div className="sim-modal-backdrop" onClick={onClose}>
      <div className="sim-modal gp-sim-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sim-modal-header">
          <div>
            <h3 className="sim-modal-title">{isRoundRobin ? "Round robin simulator" : "Groups and playoffs simulator"}</h3>
            <p className="sim-modal-copy">
              This simulator is local only. Winner picks still default to 80-79 or 79-80, and you can edit the score for every simulated match.
            </p>
          </div>
          <div className="sim-modal-actions">
            <button type="button" onClick={resetSimulation} className="btn-secondary">Reset</button>
            <button type="button" onClick={onClose} className="btn-secondary">Close</button>
          </div>
        </div>

        <div className="sim-modal-summary">
          <span className="sim-summary-label">{stageSummaryLabel}</span>
          <span className="sim-summary-value">{groupMatches.filter((match) => Boolean(groupWinnerMap[match.id])).length}/{groupMatches.length} chosen</span>
          <span className="sim-summary-label">Projected champion</span>
          <span className="sim-summary-value">{champion?.label || "Finish groups, then pick playoff winners"}</span>
        </div>

        <div className="gp-sim-section">
          <div className="gp-sim-section-header">
            <div>
              <h4 className="gp-sim-section-title">{stageTitle}</h4>
              <p className="gp-sim-section-copy">{stageHelpText}</p>
            </div>
          </div>

          <div className="gp-sim-grid">
            {simulatedGroups.map((group) => (
              <section key={group.group_code} className="gp-sim-panel">
                <div className="gp-sim-panel-title">{stagePanelTitle || `Group ${group.group_code}`}</div>
                <div className="overflow-x-auto">
                  <table className="gp-sim-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>P</th>
                        <th>W</th>
                        <th>L</th>
                        <th>Diff</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.team_id} className={row.rank <= 2 ? "is-qualified" : ""}>
                          <td>{row.rank}</td>
                          <td>{row.team_name || `Team ${row.team_id}`}</td>
                          <td>{row.played}</td>
                          <td>{row.wins}</td>
                          <td>{row.losses}</td>
                          <td>{row.diff}</td>
                          <td>{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="gp-sim-match-list">
                  {(matchesByGroup[group.group_code] || []).map((match) => {
                    const selectedWinner = groupWinnerMap[match.id];
                    return (
                      <div key={match.id} className="gp-sim-match-card">
                        <div className="gp-sim-match-meta">
                          <span>R{match.round_number || "-"} | {match.status || "scheduled"}</span>
                          <span>{formatDateTime(match.scheduled_at)}</span>
                        </div>

                        <div className="gp-sim-match-actions">
                          <button type="button" onClick={() => pickGroupWinner(match.id, "home")} className={`gp-sim-pick ${selectedWinner === "home" ? "is-picked" : ""}`}>
                            <span>{resolveTeamName(match, "home") || "TBD"}</span>
                            {selectedWinner === "home" && <span className="gp-sim-pick-tag">winner</span>}
                          </button>
                          <button type="button" onClick={() => pickGroupWinner(match.id, "away")} className={`gp-sim-pick ${selectedWinner === "away" ? "is-picked" : ""}`}>
                            <span>{resolveTeamName(match, "away") || "TBD"}</span>
                            {selectedWinner === "away" && <span className="gp-sim-pick-tag">winner</span>}
                          </button>
                        </div>

                        <div className="gp-sim-score-editor">
                          <label className="gp-sim-score-field">
                            <span>Home</span>
                            <input className="input" type="number" min="0" value={groupScores[match.id]?.home_score ?? ""} onChange={(event) => updateGroupScore(match.id, "home", event.target.value)} />
                          </label>
                          <span className="gp-sim-score-sep">-</span>
                          <label className="gp-sim-score-field">
                            <span>Away</span>
                            <input className="input" type="number" min="0" value={groupScores[match.id]?.away_score ?? ""} onChange={(event) => updateGroupScore(match.id, "away", event.target.value)} />
                          </label>
                        </div>

                        <div className="gp-sim-match-status">
                          {selectedWinner ? `Picked winner: ${resolveTeamName(match, selectedWinner) || "TBD"}` : "No simulated winner yet"}
                        </div>

                        <button type="button" onClick={() => clearGroupPick(match.id)} className="sim-clear-pick">Clear pick</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="gp-sim-section">
          <div className="gp-sim-section-header">
            <div>
              <h4 className="gp-sim-section-title">Playoffs</h4>
              <p className="gp-sim-section-copy">
                {playoffHelpText}
              </p>
            </div>
          </div>

          {allGroupMatchesPicked ? (
            <div className="sim-board">
              {playoffRounds.map((roundData, roundIndex) => (
                <section key={roundData.round} className="sim-round" style={{ "--slot-factor": 2 ** roundIndex }}>
                  <div className="sim-round-title">{roundData.title}</div>
                  <div className="sim-round-track">
                    {roundData.matches.map((match) => (
                      <div key={match.id} className={`sim-slot ${roundIndex === 0 ? "is-opening-round" : ""}`}>
                        <div className="sim-match-card">
                          <div className="sim-match-meta">
                            <span>{match.title}</span>
                            <strong>{match.participants.filter((participant) => participant && !participant.isPlaceholder).length}/2</strong>
                          </div>
                          {match.participants.map((participant, sideIndex) => {
                            const canDrag = Boolean(participant && !participant.isPlaceholder && roundIndex < playoffRounds.length - 1);
                            const isPickedWinner = Boolean(participant && match.winner && participant.entryKey === match.winner.entryKey);
                            const dropActive = isValidDropTarget(roundIndex, match.matchIndex, sideIndex);
                            return (
                              <div
                                key={`${match.id}-${sideIndex}`}
                                className={`sim-team-row ${canDrag ? "is-draggable" : ""} ${isPickedWinner ? "is-picked" : ""} ${dropActive ? "is-drop-target" : ""}`}
                                role={participant && !participant.isPlaceholder ? "button" : undefined}
                                tabIndex={participant && !participant.isPlaceholder ? 0 : undefined}
                                draggable={canDrag}
                                onClick={() => pickPlayoffWinner(roundIndex, match.matchIndex, participant)}
                                onKeyDown={(event) => {
                                  if ((event.key === "Enter" || event.key === " ") && participant && !participant.isPlaceholder) {
                                    event.preventDefault();
                                    pickPlayoffWinner(roundIndex, match.matchIndex, participant);
                                  }
                                }}
                                onDragStart={() => setDragState({ roundIndex, matchIndex: match.matchIndex, participant })}
                                onDragEnd={() => setDragState(null)}
                                onDragOver={(event) => {
                                  if (isValidDropTarget(roundIndex, match.matchIndex, sideIndex)) event.preventDefault();
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  handleDrop(roundIndex, match.matchIndex, sideIndex);
                                }}
                              >
                                <span className="sim-team-label">{participant?.label || "Drop winner here"}</span>
                                {participant && !participant.isPlaceholder && <span className="sim-team-hint">{canDrag ? "drag/pick" : "pick"}</span>}
                                {!participant && <span className="sim-team-hint">drop</span>}
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            className={`sim-clear-pick ${match.winner ? "" : "is-hidden"}`}
                            tabIndex={match.winner ? 0 : -1}
                            aria-hidden={match.winner ? undefined : true}
                            onClick={() => {
                              if (match.winner) clearPlayoffPick(roundIndex, match.matchIndex);
                            }}
                          >
                            Clear winner
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="gp-sim-locked">
              {isRoundRobin
                ? "The playoff simulator stays locked until every regular-season match has a local winner picked in this modal."
                : "The playoff simulator stays locked until every group-stage match has a local winner picked in this modal."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
