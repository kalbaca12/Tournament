<?php

namespace App\Support;

use App\Models\Game;
use App\Models\Tournament;
use App\Support\SchedulingFeasibility;

class PdfExportBuilder
{
    public static function tournament(Tournament $tournament, array $sections = []): string
    {
        if ($tournament->getConnectionResolver() !== null) {
            $tournament->loadMissing(['teams', 'matches.homeTeam', 'matches.awayTeam']);
        }

        $sections = self::normalizeSections($sections, [
            'teams',
            'standings',
            'schedule',
            'playoffs',
            'feasibility',
        ]);

        $sortedTeams = $tournament->teams
            ->sortBy(fn ($team) => strtolower((string) $team->name))
            ->values();

        [$dayMatches, $playoffRounds] = self::splitTournamentMatches($tournament);

        $doc = new SimplePdfDocument();
        $doc->addBanner(
            'Tournament Export',
            $tournament->name ?: ('Tournament #' . $tournament->id),
            self::tournamentSubtitle($tournament),
            [
                self::labelize($tournament->format),
                self::labelize($tournament->status),
                $sortedTeams->count() . ' teams',
                $tournament->matches->count() . ' matches',
            ],
        );

        $doc->addStatsGrid([
            ['label' => 'Start date', 'value' => self::safeValue($tournament->start_date), 'meta' => 'Tournament opening day'],
            ['label' => 'End date', 'value' => self::safeValue($tournament->end_date), 'meta' => 'Scheduled closing day'],
            ['label' => 'Registration', 'value' => self::safeValue($tournament->registration_deadline), 'meta' => 'Signup deadline'],
            ['label' => 'Participants', 'value' => $tournament->participants_locked ? 'Locked' : 'Open', 'meta' => 'Participant state'],
            ['label' => 'Approved teams', 'value' => (string) $sortedTeams->count(), 'meta' => 'Registered tournament teams'],
            ['label' => 'Matches', 'value' => (string) $tournament->matches->count(), 'meta' => 'Scheduled fixtures'],
        ]);

        if (in_array('feasibility', $sections, true)) {
            $feasibility = SchedulingFeasibility::evaluate($tournament, $sortedTeams->count());
            $doc->addSection('Scheduling Feasibility', 'Summarises the generated planning window from the estimated opening day to the configured final.');
            $doc->addStatsGrid([
                ['label' => 'Required matches', 'value' => (string) $feasibility['required_matches'], 'meta' => 'Matches needed for this format'],
                ['label' => 'Estimated start', 'value' => self::safeValue($feasibility['estimated_start_date'] ?? null), 'meta' => 'Auto-calculated opening day'],
                ['label' => 'Final date', 'value' => self::safeValue($feasibility['final_date'] ?? null), 'meta' => 'Latest scheduled day'],
                ['label' => 'Stage days', 'value' => (string) ($feasibility['stage_day_count'] ?? 0), 'meta' => 'Used for groups or regular season'],
                ['label' => 'Playoff days', 'value' => (string) ($feasibility['playoff_day_count'] ?? 0), 'meta' => 'Used for playoff rounds'],
                ['label' => 'Stage games / day', 'value' => (string) ($feasibility['stage_matches_per_day'] ?? 0), 'meta' => 'Daily cap before playoffs'],
                ['label' => 'Planning status', 'value' => $feasibility['is_feasible'] ? 'Ready' : 'Setup needed', 'meta' => 'Scheduling outcome'],
            ]);

            if (!$feasibility['is_feasible'] && !empty($feasibility['issues'])) {
                $doc->addNoteBox(implode(' ', $feasibility['issues']));
            }
        }

        if (in_array('teams', $sections, true)) {
            $doc->addSection('Approved Teams', 'Roster of tournament entrants and their group assignments.');
            if ($sortedTeams->isEmpty()) {
                $doc->addNoteBox('No approved teams are registered for this tournament yet.');
            } else {
                $teamRows = [];
                foreach ($sortedTeams as $team) {
                    $tournamentRow = $tournament->teams->firstWhere('id', $team->id);
                    $pivot = $tournamentRow?->pivot;
                    $teamRows[] = [
                        'seed' => self::safeValue($pivot?->seed),
                        'group' => self::safeValue($pivot?->group_code),
                        'team' => $team->name ?: ('Team ' . $team->id),
                        'city' => self::safeValue($team->city),
                    ];
                }

                $doc->addTable([
                    ['key' => 'seed', 'label' => 'Seed', 'width' => 46, 'align' => 'right'],
                    ['key' => 'group', 'label' => 'Group', 'width' => 52],
                    ['key' => 'team', 'label' => 'Team', 'width' => 230],
                    ['key' => 'city', 'label' => 'City'],
                ], $teamRows);
            }
        }

        if (in_array('standings', $sections, true)) {
            if ($tournament->format === 'groups_playoffs') {
                $groups = TournamentStandings::grouped($tournament);
                $doc->addSection('Group Standings', 'Final group rankings with wins, losses, and point differential.');
                if ($groups === []) {
                    $doc->addNoteBox('No completed group-stage results are available yet.');
                } else {
                    foreach ($groups as $index => $group) {
                        self::ensureTableSectionFits($doc, count($group['rows']), false, 18.0, 20.0, $index === 0 ? 28.0 : 34.0);
                        $doc->addBlankLine($index === 0 ? 2 : 6);
                        $doc->addLine('Group ' . $group['group_code'], 12, true, 0, [0.11, 0.18, 0.28]);
                        $groupRows = [];
                        foreach ($group['rows'] as $row) {
                            $groupRows[] = [
                                'rank' => $row['rank'],
                                'team' => $row['team_name'] ?: ('Team ' . $row['team_id']),
                                'played' => $row['played'],
                                'wins' => $row['wins'],
                                'losses' => $row['losses'],
                                'diff' => $row['diff'],
                                'points' => $row['points'],
                            ];
                        }

                        $doc->addTable([
                            ['key' => 'rank', 'label' => '#', 'width' => 32, 'align' => 'right'],
                            ['key' => 'team', 'label' => 'Team', 'width' => 220],
                            ['key' => 'played', 'label' => 'P', 'width' => 34, 'align' => 'right'],
                            ['key' => 'wins', 'label' => 'W', 'width' => 34, 'align' => 'right'],
                            ['key' => 'losses', 'label' => 'L', 'width' => 34, 'align' => 'right'],
                            ['key' => 'diff', 'label' => 'Diff', 'width' => 54, 'align' => 'right'],
                            ['key' => 'points', 'label' => 'Pts', 'width' => 40, 'align' => 'right'],
                        ], $groupRows);
                    }
                }
            } else {
                $rows = TournamentStandings::overall($tournament);
                $doc->addSection('Standings', 'Overall ranking table for the tournament.');
                if ($rows === []) {
                    $doc->addNoteBox('No completed standings data is available yet.');
                } else {
                    $standingsRows = [];
                    foreach ($rows as $row) {
                        $standingsRows[] = [
                            'rank' => $row['rank'],
                            'team' => $row['team_name'] ?: ('Team ' . $row['team_id']),
                            'played' => $row['played'],
                            'wins' => $row['wins'],
                            'losses' => $row['losses'],
                            'diff' => $row['diff'],
                            'points' => $row['points'],
                        ];
                    }

                    $doc->addTable([
                        ['key' => 'rank', 'label' => '#', 'width' => 32, 'align' => 'right'],
                        ['key' => 'team', 'label' => 'Team', 'width' => 220],
                        ['key' => 'played', 'label' => 'P', 'width' => 34, 'align' => 'right'],
                        ['key' => 'wins', 'label' => 'W', 'width' => 34, 'align' => 'right'],
                        ['key' => 'losses', 'label' => 'L', 'width' => 34, 'align' => 'right'],
                        ['key' => 'diff', 'label' => 'Diff', 'width' => 54, 'align' => 'right'],
                        ['key' => 'points', 'label' => 'Pts', 'width' => 40, 'align' => 'right'],
                    ], $standingsRows);
                }
            }
        }

        if (in_array('schedule', $sections, true)) {
            $doc->addSection('Matches By Day', 'Scheduled group-stage and regular fixtures grouped by calendar day.');
            if ($dayMatches === []) {
                $doc->addNoteBox('No day-based matches are available yet.');
            } else {
                $dayIndex = 0;
                foreach ($dayMatches as $day => $matches) {
                    self::ensureTableSectionFits($doc, count($matches), false, 18.0, 20.0, $dayIndex === 0 ? 28.0 : 34.0);
                    $doc->addBlankLine($dayIndex === 0 ? 2 : 6);
                    $doc->addLine($day, 12, true, 0, [0.11, 0.18, 0.28]);
                    $rows = [];
                    foreach ($matches as $match) {
                        $rows[] = [
                            'round' => 'R' . self::safeValue($match->round_number),
                            'matchup' => self::teamName($match, 'home') . ' vs ' . self::teamName($match, 'away'),
                            'time' => self::timeOnly($match->scheduled_at),
                            'status' => self::labelize($match->status),
                            'score' => self::resultLabel($match),
                        ];
                    }

                    $doc->addTable([
                        ['key' => 'round', 'label' => 'Round', 'width' => 52],
                        ['key' => 'matchup', 'label' => 'Matchup', 'width' => 248],
                        ['key' => 'time', 'label' => 'Time', 'width' => 62],
                        ['key' => 'status', 'label' => 'Status', 'width' => 74],
                        ['key' => 'score', 'label' => 'Score', 'width' => 56, 'align' => 'right'],
                    ], $rows);
                    $dayIndex++;
                }
            }
        }

        if (in_array('playoffs', $sections, true)) {
            $doc->addSection('Playoff Rounds', 'Bracket rounds and their completed results.');
            if ($playoffRounds === []) {
                $doc->addNoteBox('No playoff matches are available for this tournament.');
            } else {
                $roundCounts = [];
                foreach ($playoffRounds as $round => $matches) {
                    $roundCounts[(int) $round] = count($matches);
                }

                $diagramRounds = [];
                foreach ($playoffRounds as $round => $matches) {
                    $diagramMatches = [];
                    foreach (array_values($matches) as $matchIndex => $match) {
                        $diagramMatches[] = [
                            'meta' => 'Match #' . $match->id,
                            'status' => self::labelize($match->status),
                            'top_label' => self::playoffParticipantName($match, 'home', $roundCounts, (int) $round, $matchIndex),
                            'top_score' => self::scoreDisplay($match->home_score),
                            'top_winner' => self::isWinner($match, 'home'),
                            'bottom_label' => self::playoffParticipantName($match, 'away', $roundCounts, (int) $round, $matchIndex),
                            'bottom_score' => self::scoreDisplay($match->away_score),
                            'bottom_winner' => self::isWinner($match, 'away'),
                            'footer' => self::formatDateTime($match->scheduled_at),
                        ];
                    }

                    $diagramRounds[] = [
                        'title' => self::roundLabel(count($matches)),
                        'matches' => $diagramMatches,
                    ];
                }

                $doc->addBracketDiagram($diagramRounds);
            }
        }

        return $doc->output();
    }

    public static function match(Game $game, array $sections = []): string
    {
        if ($game->getConnectionResolver() !== null) {
            $game->loadMissing(['tournament', 'homeTeam', 'awayTeam', 'stats.player']);
        }

        $sections = self::normalizeSections($sections, [
            'players',
            'leaders',
            'team_totals',
            'box_score',
        ]);

        $stats = $game->stats->sortByDesc('points')->values();
        $doc = new SimplePdfDocument();
        $doc->addBanner(
            'Match Export',
            self::teamName($game, 'home') . ' vs ' . self::teamName($game, 'away'),
            'Match #' . $game->id . ' | ' . self::labelize($game->stage) . ' | ' . self::formatDateTime($game->scheduled_at),
            [
                self::labelize($game->status),
                'Result ' . self::resultLabel($game),
                $game->tournament?->name ?: ('Tournament #' . self::safeValue($game->tournament_id)),
            ],
        );

        $doc->addStatsGrid([
            ['label' => 'Tournament', 'value' => $game->tournament?->name ?: ('Tournament #' . self::safeValue($game->tournament_id)), 'meta' => 'Competition'],
            ['label' => 'Stage', 'value' => self::labelize($game->stage), 'meta' => 'Phase of play'],
            ['label' => 'Round', 'value' => self::safeValue($game->round_number), 'meta' => 'Bracket round'],
            ['label' => 'Group', 'value' => self::safeValue($game->group_code), 'meta' => 'Grouping code'],
            ['label' => 'Scheduled', 'value' => self::formatDateTime($game->scheduled_at), 'meta' => 'Tip-off time'],
            ['label' => 'Result', 'value' => self::resultLabel($game), 'meta' => 'Final score'],
        ]);

        $teamTables = self::teamStatTables($game, $stats);
        $hasStatSections = array_intersect($sections, ['players', 'leaders', 'team_totals', 'box_score']) !== [];
        if ($stats->isEmpty() && $hasStatSections) {
            $doc->addNoteBox('No player stats are saved for this match yet.');

            return $doc->output();
        }

        if (in_array('players', $sections, true)) {
            $doc->addSection('Recorded Players', 'Players included in the saved stat sheet for each team.');
            foreach ($teamTables as $index => $teamTable) {
                self::ensureTableSectionFits($doc, count($teamTable['rows']), false, 18.0, 20.0, $index === 0 ? 28.0 : 34.0);
                $doc->addBlankLine($index === 0 ? 2 : 6);
                $doc->addLine($teamTable['team_name'], 12, true, 0, [0.11, 0.18, 0.28]);
                if ($teamTable['rows'] === []) {
                    $doc->addNoteBox('No recorded players for this team yet.');
                    continue;
                }

                $playerRows = array_map(fn (array $row) => ['player' => $row['player']], $teamTable['rows']);
                $doc->addTable([
                    ['key' => 'player', 'label' => 'Player'],
                ], $playerRows);
            }
        }

        if (in_array('leaders', $sections, true)) {
            $leaders = self::matchLeaders($game, $stats);
            $doc->addSection('Match Leaders', 'Top individual performances based on recorded stat categories.');
            $doc->addTable([
                ['key' => 'category', 'label' => 'Category', 'width' => 120],
                ['key' => 'player', 'label' => 'Player', 'width' => 220],
                ['key' => 'team', 'label' => 'Team', 'width' => 140],
                ['key' => 'value', 'label' => 'Value', 'width' => 50, 'align' => 'right'],
            ], $leaders);
        }

        if (in_array('team_totals', $sections, true)) {
            $doc->addSection('Team Totals', 'Combined team production and shooting totals for the match.');
            $doc->addTable([
                ['key' => 'team', 'label' => 'Team', 'width' => 120],
                ['key' => 'points', 'label' => 'PTS', 'width' => 32, 'align' => 'right'],
                ['key' => 'rebounds', 'label' => 'REB', 'width' => 32, 'align' => 'right'],
                ['key' => 'assists', 'label' => 'AST', 'width' => 32, 'align' => 'right'],
                ['key' => 'steals', 'label' => 'STL', 'width' => 32, 'align' => 'right'],
                ['key' => 'blocks', 'label' => 'BLK', 'width' => 32, 'align' => 'right'],
                ['key' => 'fouls', 'label' => 'FLS', 'width' => 32, 'align' => 'right'],
                ['key' => 'fgm', 'label' => 'FGM', 'width' => 34, 'align' => 'right'],
                ['key' => 'fga', 'label' => 'FGA', 'width' => 34, 'align' => 'right'],
                ['key' => 'tpm', 'label' => '3PM', 'width' => 34, 'align' => 'right'],
                ['key' => 'tpa', 'label' => '3PA', 'width' => 34, 'align' => 'right'],
                ['key' => 'ftm', 'label' => 'FTM', 'width' => 34, 'align' => 'right'],
                ['key' => 'fta', 'label' => 'FTA', 'width' => 34, 'align' => 'right'],
            ], self::teamTotalsRows($teamTables), [
                'font_size' => 7.8,
                'row_height' => 17.0,
                'header_height' => 19.0,
            ]);
        }

        if (in_array('box_score', $sections, true)) {
            $doc->addSection('Team Box Scores', 'Separate player tables for each team, including shooting totals and attempts.');
            foreach ($teamTables as $index => $teamTable) {
                self::ensureTableSectionFits($doc, count($teamTable['rows']), true, 17.0, 19.0, $index === 0 ? 42.0 : 48.0);
                $doc->addBlankLine($index === 0 ? 4 : 10);
                $doc->addLine($teamTable['team_name'], 12, true, 0, [0.11, 0.18, 0.28]);
                $doc->addLine('Score: ' . $teamTable['score'] . ' | ' . count($teamTable['rows']) . ' recorded players', 9, false, 0, [0.42, 0.49, 0.57]);
                $doc->addTable([
                    ['key' => 'player', 'label' => 'Player', 'width' => 118],
                    ['key' => 'points', 'label' => 'PTS', 'width' => 28, 'align' => 'right'],
                    ['key' => 'rebounds', 'label' => 'REB', 'width' => 28, 'align' => 'right'],
                    ['key' => 'assists', 'label' => 'AST', 'width' => 28, 'align' => 'right'],
                    ['key' => 'steals', 'label' => 'STL', 'width' => 28, 'align' => 'right'],
                    ['key' => 'blocks', 'label' => 'BLK', 'width' => 28, 'align' => 'right'],
                    ['key' => 'fouls', 'label' => 'FLS', 'width' => 28, 'align' => 'right'],
                    ['key' => 'fgm', 'label' => 'FGM', 'width' => 30, 'align' => 'right'],
                    ['key' => 'fga', 'label' => 'FGA', 'width' => 30, 'align' => 'right'],
                    ['key' => 'tpm', 'label' => '3PM', 'width' => 30, 'align' => 'right'],
                    ['key' => 'tpa', 'label' => '3PA', 'width' => 30, 'align' => 'right'],
                    ['key' => 'ftm', 'label' => 'FTM', 'width' => 30, 'align' => 'right'],
                    ['key' => 'fta', 'label' => 'FTA', 'width' => 30, 'align' => 'right'],
                ], $teamTable['rows'], [
                    'font_size' => 7.8,
                    'row_height' => 17.0,
                    'header_height' => 19.0,
                    'footer' => $teamTable['footer'],
                ]);
            }
        }

        return $doc->output();
    }

    /**
     * @return array{0: array<string, array<int, Game>>, 1: array<int, array<int, Game>>}
     */
    private static function splitTournamentMatches(Tournament $tournament): array
    {
        $sorted = $tournament->matches->sort(function (Game $left, Game $right) {
            $roundCompare = ((int) ($left->round_number ?? 0)) <=> ((int) ($right->round_number ?? 0));
            if ($roundCompare !== 0) {
                return $roundCompare;
            }

            $leftTime = $left->scheduled_at ? strtotime((string) $left->scheduled_at) : PHP_INT_MAX;
            $rightTime = $right->scheduled_at ? strtotime((string) $right->scheduled_at) : PHP_INT_MAX;
            if ($leftTime !== $rightTime) {
                return $leftTime <=> $rightTime;
            }

            return ((int) $left->id) <=> ((int) $right->id);
        })->values();

        $dayMatches = [];
        $playoffRounds = [];

        foreach ($sorted as $match) {
            $stage = strtolower((string) ($match->stage ?? ''));
            if ($stage === 'playoff' || $stage === 'playoffs') {
                $round = (int) ($match->round_number ?? 1);
                if (!isset($playoffRounds[$round])) {
                    $playoffRounds[$round] = [];
                }
                $playoffRounds[$round][] = $match;

                continue;
            }

            $day = $match->scheduled_at ? substr((string) $match->scheduled_at, 0, 10) : 'Unscheduled';
            if (!isset($dayMatches[$day])) {
                $dayMatches[$day] = [];
            }
            $dayMatches[$day][] = $match;
        }

        ksort($playoffRounds);

        return [$dayMatches, $playoffRounds];
    }

    private static function tournamentSubtitle(Tournament $tournament): string
    {
        return implode(' | ', array_filter([
            self::labelize($tournament->format),
            self::labelize($tournament->status),
            self::safeValue($tournament->start_date),
            self::safeValue($tournament->end_date),
        ]));
    }

    private static function teamStatTables(Game $game, $stats): array
    {
        $tables = [];
        $teams = [
            ['team_id' => (int) $game->home_team_id, 'team_name' => self::teamName($game, 'home'), 'score' => self::safeValue($game->home_score)],
            ['team_id' => (int) $game->away_team_id, 'team_name' => self::teamName($game, 'away'), 'score' => self::safeValue($game->away_score)],
        ];

        foreach ($teams as $team) {
            $teamStats = $stats
                ->filter(fn ($stat) => (int) $stat->team_id === $team['team_id'])
                ->sortByDesc('points')
                ->values();

            $rows = [];
            $footer = [
                'player' => 'Team total',
                'points' => 0,
                'rebounds' => 0,
                'assists' => 0,
                'steals' => 0,
                'blocks' => 0,
                'fouls' => 0,
                'fgm' => 0,
                'fga' => 0,
                'tpm' => 0,
                'tpa' => 0,
                'ftm' => 0,
                'fta' => 0,
            ];

            foreach ($teamStats as $stat) {
                $row = [
                    'player' => self::playerName($stat),
                    'points' => (int) ($stat->points ?? 0),
                    'rebounds' => (int) ($stat->rebounds ?? 0),
                    'assists' => (int) ($stat->assists ?? 0),
                    'steals' => (int) ($stat->steals ?? 0),
                    'blocks' => (int) ($stat->blocks ?? 0),
                    'fouls' => (int) ($stat->fouls ?? 0),
                    'fgm' => (int) ($stat->fgm ?? 0),
                    'fga' => (int) ($stat->fga ?? 0),
                    'tpm' => (int) ($stat->tpm ?? 0),
                    'tpa' => (int) ($stat->tpa ?? 0),
                    'ftm' => (int) ($stat->ftm ?? 0),
                    'fta' => (int) ($stat->fta ?? 0),
                ];

                foreach ($footer as $key => $value) {
                    if ($key === 'player') {
                        continue;
                    }
                    $footer[$key] += $row[$key];
                }

                $rows[] = $row;
            }

            $tables[] = [
                'team_name' => $team['team_name'],
                'score' => $team['score'],
                'rows' => $rows,
                'footer' => $footer,
            ];
        }

        return $tables;
    }

    private static function matchLeaders(Game $game, $stats): array
    {
        $categories = [
            'Points' => 'points',
            'Rebounds' => 'rebounds',
            'Assists' => 'assists',
            'Steals' => 'steals',
            'Blocks' => 'blocks',
        ];
        $teamNameById = [
            (int) $game->home_team_id => self::teamName($game, 'home'),
            (int) $game->away_team_id => self::teamName($game, 'away'),
        ];

        $leaders = [];
        foreach ($categories as $label => $key) {
            $leader = $stats->sortByDesc(fn ($stat) => (int) ($stat->{$key} ?? 0))->first();
            if ($leader === null) {
                continue;
            }

            $leaders[] = [
                'category' => $label,
                'player' => self::playerName($leader),
                'team' => $teamNameById[(int) ($leader->team_id ?? 0)] ?? ('Team ' . self::safeValue($leader->team_id)),
                'value' => (string) ((int) ($leader->{$key} ?? 0)),
            ];
        }

        return $leaders;
    }

    private static function teamTotalsRows(array $teamTables): array
    {
        return array_map(function (array $teamTable): array {
            return ['team' => $teamTable['team_name']] + $teamTable['footer'];
        }, $teamTables);
    }

    private static function playerName($stat): string
    {
        $fullName = trim((string) (($stat->player?->first_name ?? 'Player') . ' ' . ($stat->player?->last_name ?? ('#' . $stat->player_id))));
        $jersey = $stat->player?->jersey_number;

        return $jersey !== null ? '#' . $jersey . ' ' . $fullName : $fullName;
    }

    private static function resultLabel(Game $game): string
    {
        if ($game->home_score === null || $game->away_score === null) {
            return 'Not recorded';
        }

        return $game->home_score . '-' . $game->away_score;
    }

    private static function scoreDisplay(mixed $value): string
    {
        return $value === null || $value === '' ? '-' : (string) $value;
    }

    private static function teamName(Game $game, string $side): string
    {
        $relation = $side === 'home' ? 'homeTeam' : 'awayTeam';
        $idKey = $side === 'home' ? 'home_team_id' : 'away_team_id';

        return $game->{$relation}?->name ?: ('Team ' . self::safeValue($game->{$idKey}));
    }

    private static function playoffParticipantName(Game $match, string $side, array $roundCounts, int $round, int $matchIndex): string
    {
        $relation = $side === 'home' ? 'homeTeam' : 'awayTeam';
        $idKey = $side === 'home' ? 'home_team_id' : 'away_team_id';
        $teamName = $match->{$relation}?->name;
        if ($teamName) {
            return $teamName;
        }

        if ($match->{$idKey}) {
            return 'Team ' . $match->{$idKey};
        }

        if ($round <= 1) {
            return 'TBD';
        }

        $previousRoundLabel = self::roundLabel($roundCounts[$round - 1] ?? 0);
        $previousMatchNumber = $side === 'home' ? ($matchIndex * 2) + 1 : ($matchIndex * 2) + 2;

        return 'Winner of ' . $previousRoundLabel . ' ' . $previousMatchNumber;
    }

    private static function isWinner(Game $match, string $side): bool
    {
        if ($match->home_score === null || $match->away_score === null) {
            return false;
        }

        $homeScore = (int) $match->home_score;
        $awayScore = (int) $match->away_score;
        if ($homeScore === $awayScore) {
            return false;
        }

        return $side === 'home' ? $homeScore > $awayScore : $awayScore > $homeScore;
    }

    private static function labelize(?string $value): string
    {
        if (!$value) {
            return 'N/A';
        }

        return ucwords(str_replace('_', ' ', $value));
    }

    private static function safeValue(mixed $value): string
    {
        if ($value === null || $value === '') {
            return 'N/A';
        }

        return (string) $value;
    }

    private static function formatDateTime(?string $value): string
    {
        if (!$value) {
            return 'No time set';
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }

        return date('Y-m-d H:i', $timestamp);
    }

    private static function timeOnly(?string $value): string
    {
        if (!$value) {
            return 'TBD';
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }

        return date('H:i', $timestamp);
    }

    private static function roundLabel(int $matchCount): string
    {
        return match ($matchCount) {
            1 => 'Final',
            2 => 'Semifinals',
            4 => 'Quarterfinals',
            8 => 'Round of 16',
            default => 'Round (' . $matchCount . ' matches)',
        };
    }

    private static function normalizeSections(array $sections, array $allowed): array
    {
        $sections = array_values(array_unique(array_filter(array_map(
            fn (mixed $section) => is_string($section) ? strtolower(trim($section)) : null,
            $sections,
        ))));

        $valid = array_values(array_filter($sections, fn (string $section) => in_array($section, $allowed, true)));

        return $valid === [] ? $allowed : $valid;
    }

    private static function ensureTableSectionFits(
        SimplePdfDocument $doc,
        int $rowCount,
        bool $hasFooter,
        float $rowHeight,
        float $headerHeight,
        float $leadingHeight
    ): void {
        $estimatedHeight = $leadingHeight
            + $headerHeight
            + ($rowCount * $rowHeight)
            + ($hasFooter ? $rowHeight : 0)
            + 18.0;

        if ($estimatedHeight <= $doc->contentHeight() && $doc->remainingHeight() < $estimatedHeight) {
            $doc->newPage();
        }
    }
}
