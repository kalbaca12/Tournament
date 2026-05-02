<?php

namespace App\Support;

use App\Models\Game;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentTeam;

class TournamentStandings
{
    public static function overall(Tournament $tournament): array
    {
        $teamIds = TournamentTeam::where('tournament_id', $tournament->id)
            ->pluck('team_id')
            ->values()
            ->all();

        if ($teamIds === []) {
            return [];
        }

        $matches = Game::where('tournament_id', $tournament->id)
            ->where(function ($query) {
                $query->whereNull('stage')
                    ->orWhere('stage', '!=', 'playoffs');
            })
            ->where('status', 'finished')
            ->whereNotNull('home_score')
            ->whereNotNull('away_score')
            ->get(['home_team_id', 'away_team_id', 'home_score', 'away_score']);

        $teams = Team::whereIn('id', $teamIds)->get(['id', 'name', 'city'])->keyBy('id');

        return self::calculateOverallRows($teamIds, $matches->all(), $teams->all());
    }

    public static function grouped(Tournament $tournament): array
    {
        $groupMatches = Game::where('tournament_id', $tournament->id)
            ->where('stage', 'group')
            ->whereNotNull('group_code')
            ->orderBy('group_code')
            ->orderBy('round_number')
            ->orderBy('scheduled_at')
            ->get(['group_code', 'home_team_id', 'away_team_id', 'home_score', 'away_score', 'status']);

        if ($groupMatches->isEmpty()) {
            return [];
        }

        $teamIds = [];
        foreach ($groupMatches as $match) {
            $homeTeamId = (int) self::field($match, 'home_team_id');
            $awayTeamId = (int) self::field($match, 'away_team_id');
            if ($homeTeamId > 0) {
                $teamIds[] = $homeTeamId;
            }
            if ($awayTeamId > 0) {
                $teamIds[] = $awayTeamId;
            }
        }
        $teamIds = array_values(array_unique($teamIds));
        $teams = Team::whereIn('id', $teamIds)->get(['id', 'name', 'city'])->keyBy('id');

        return self::calculateGroupedRows($groupMatches->all(), $teams->all());
    }

    public static function calculateOverallRows(array $teamIds, array $matches, array $teamsById = []): array
    {
        $teamIds = array_values(array_unique(array_map('intval', $teamIds)));
        if ($teamIds === []) {
            return [];
        }

        $table = self::emptyTable($teamIds);
        self::applyMatchesToTable($table, $matches);

        $rows = array_values(array_map(
            fn (array $row) => self::withTeamInfo($row, $teamsById),
            $table,
        ));

        self::sortRows($rows);

        return self::withRanks($rows);
    }

    public static function calculateGroupedRows(array $matches, array $teamsById = []): array
    {
        if ($matches === []) {
            return [];
        }

        $tables = [];
        foreach ($matches as $match) {
            $groupCode = (string) self::field($match, 'group_code');
            if ($groupCode === '') {
                continue;
            }

            if (!isset($tables[$groupCode])) {
                $tables[$groupCode] = [];
            }

            foreach ([(int) self::field($match, 'home_team_id'), (int) self::field($match, 'away_team_id')] as $teamId) {
                if ($teamId > 0 && !isset($tables[$groupCode][$teamId])) {
                    $tables[$groupCode][$teamId] = self::emptyRow($teamId);
                }
            }
        }

        foreach ($matches as $match) {
            $groupCode = (string) self::field($match, 'group_code');
            if ($groupCode === '' || !isset($tables[$groupCode])) {
                continue;
            }

            if (self::field($match, 'status') !== 'finished' || self::field($match, 'home_score') === null || self::field($match, 'away_score') === null) {
                continue;
            }

            self::applyMatchToTable($tables[$groupCode], $match);
        }

        $groups = [];
        ksort($tables);
        foreach ($tables as $groupCode => $groupTable) {
            $rows = array_values(array_map(
                fn (array $row) => self::withTeamInfo($row, $teamsById),
                $groupTable,
            ));

            self::sortRows($rows);
            $groups[] = [
                'group_code' => $groupCode,
                'rows' => self::withRanks($rows),
            ];
        }

        return $groups;
    }

    private static function emptyTable(array $teamIds): array
    {
        $table = [];
        foreach ($teamIds as $teamId) {
            $table[$teamId] = self::emptyRow((int) $teamId);
        }

        return $table;
    }

    private static function emptyRow(int $teamId): array
    {
        return [
            'team_id' => $teamId,
            'played' => 0,
            'wins' => 0,
            'losses' => 0,
            'points_for' => 0,
            'points_against' => 0,
            'diff' => 0,
            'points' => 0,
        ];
    }

    private static function applyMatchesToTable(array &$table, array $matches): void
    {
        foreach ($matches as $match) {
            self::applyMatchToTable($table, $match);
        }
    }

    private static function applyMatchToTable(array &$table, object|array $match): void
    {
        $homeTeamId = (int) self::field($match, 'home_team_id');
        $awayTeamId = (int) self::field($match, 'away_team_id');
        $homeScore = (int) self::field($match, 'home_score');
        $awayScore = (int) self::field($match, 'away_score');

        if (!isset($table[$homeTeamId]) || !isset($table[$awayTeamId])) {
            return;
        }

        $table[$homeTeamId]['played']++;
        $table[$awayTeamId]['played']++;

        $table[$homeTeamId]['points_for'] += $homeScore;
        $table[$homeTeamId]['points_against'] += $awayScore;
        $table[$awayTeamId]['points_for'] += $awayScore;
        $table[$awayTeamId]['points_against'] += $homeScore;

        if ($homeScore > $awayScore) {
            $table[$homeTeamId]['wins']++;
            $table[$awayTeamId]['losses']++;
        } elseif ($awayScore > $homeScore) {
            $table[$awayTeamId]['wins']++;
            $table[$homeTeamId]['losses']++;
        }

        $table[$homeTeamId]['diff'] = $table[$homeTeamId]['points_for'] - $table[$homeTeamId]['points_against'];
        $table[$awayTeamId]['diff'] = $table[$awayTeamId]['points_for'] - $table[$awayTeamId]['points_against'];
        $table[$homeTeamId]['points'] = $table[$homeTeamId]['wins'] * 2 + $table[$homeTeamId]['losses'];
        $table[$awayTeamId]['points'] = $table[$awayTeamId]['wins'] * 2 + $table[$awayTeamId]['losses'];
    }

    private static function sortRows(array &$rows): void
    {
        usort($rows, function (array $left, array $right) {
            return [
                $right['points'],
                $right['diff'],
                $right['points_for'],
                -$right['team_id'],
            ] <=> [
                $left['points'],
                $left['diff'],
                $left['points_for'],
                -$left['team_id'],
            ];
        });
    }

    private static function withRanks(array $rows): array
    {
        $rank = 1;
        foreach ($rows as &$row) {
            $row['rank'] = $rank++;
        }
        unset($row);

        return $rows;
    }

    private static function withTeamInfo(array $row, array $teamsById): array
    {
        $team = $teamsById[$row['team_id']] ?? null;
        $row['team_name'] = self::field($team, 'name');
        $row['city'] = self::field($team, 'city');

        return $row;
    }

    private static function field(object|array|null $value, string $key): mixed
    {
        if (is_array($value)) {
            return $value[$key] ?? null;
        }

        return $value?->{$key} ?? null;
    }
}
