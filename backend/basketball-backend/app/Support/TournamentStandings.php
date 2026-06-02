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

        $teams = Team::whereIn('id', $teamIds)->get(['id', 'name', 'city', 'logo_url'])->keyBy('id');

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
            $homeId = (int) self::getv($match, 'home_team_id');
            $awayId = (int) self::getv($match, 'away_team_id');
            if ($homeId > 0) {
                $teamIds[] = $homeId;
            }
            if ($awayId > 0) {
                $teamIds[] = $awayId;
            }
        }
        $teamIds = array_values(array_unique($teamIds));
        $teams = Team::whereIn('id', $teamIds)->get(['id', 'name', 'city', 'logo_url'])->keyBy('id');

        return self::calculateGroupedRows($groupMatches->all(), $teams->all());
    }

    public static function calculateOverallRows(array $teamIds, array $matches, array $teamsById = []): array
    {
        $teamIds = array_values(array_unique(array_map('intval', $teamIds)));
        if ($teamIds === []) {
            return [];
        }

        $table = self::initTable($teamIds);
        self::applyMatches($table, $matches);

        $rows = array_values(array_map(
            fn (array $row) => self::teamInfo($row, $teamsById),
            $table,
        ));

        self::sortTable($rows);

        return self::ranked($rows);
    }

    public static function calculateGroupedRows(array $matches, array $teamsById = []): array
    {
        if ($matches === []) {
            return [];
        }

        $tables = [];
        foreach ($matches as $match) {
            $group = (string) self::getv($match, 'group_code');
            if ($group === '') {
                continue;
            }

            if (!isset($tables[$group])) {
                $tables[$group] = [];
            }

            foreach ([(int) self::getv($match, 'home_team_id'), (int) self::getv($match, 'away_team_id')] as $teamId) {
                if ($teamId > 0 && !isset($tables[$group][$teamId])) {
                    $tables[$group][$teamId] = self::row0($teamId);
                }
            }
        }

        foreach ($matches as $match) {
            $group = (string) self::getv($match, 'group_code');
            if ($group === '' || !isset($tables[$group])) {
                continue;
            }

            if (self::getv($match, 'status') !== 'finished' || self::getv($match, 'home_score') === null || self::getv($match, 'away_score') === null) {
                continue;
            }

            self::addMatch($tables[$group], $match);
        }

        $groups = [];
        ksort($tables);
        foreach ($tables as $group => $groupRows) {
            $rows = array_values(array_map(
                fn (array $row) => self::teamInfo($row, $teamsById),
                $groupRows,
            ));

            self::sortTable($rows);
            $groups[] = [
                'group_code' => $group,
                'rows' => self::ranked($rows),
            ];
        }

        return $groups;
    }

    private static function initTable(array $teamIds): array
    {
        $table = [];
        foreach ($teamIds as $teamId) {
            $table[$teamId] = self::row0((int) $teamId);
        }

        return $table;
    }

    private static function row0(int $teamId): array
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

    private static function applyMatches(array &$table, array $matches): void
    {
        foreach ($matches as $match) {
            self::addMatch($table, $match);
        }
    }

    private static function addMatch(array &$table, object|array $match): void
    {
        $homeId = (int) self::getv($match, 'home_team_id');
        $awayId = (int) self::getv($match, 'away_team_id');
        $home = (int) self::getv($match, 'home_score');
        $away = (int) self::getv($match, 'away_score');

        if (!isset($table[$homeId]) || !isset($table[$awayId])) {
            return;
        }

        $table[$homeId]['played']++;
        $table[$awayId]['played']++;

        $table[$homeId]['points_for'] += $home;
        $table[$homeId]['points_against'] += $away;
        $table[$awayId]['points_for'] += $away;
        $table[$awayId]['points_against'] += $home;

        if ($home > $away) {
            $table[$homeId]['wins']++;
            $table[$awayId]['losses']++;
        } elseif ($away > $home) {
            $table[$awayId]['wins']++;
            $table[$homeId]['losses']++;
        }

        $table[$homeId]['diff'] = $table[$homeId]['points_for'] - $table[$homeId]['points_against'];
        $table[$awayId]['diff'] = $table[$awayId]['points_for'] - $table[$awayId]['points_against'];
        $table[$homeId]['points'] = $table[$homeId]['wins'] * 2 + $table[$homeId]['losses'];
        $table[$awayId]['points'] = $table[$awayId]['wins'] * 2 + $table[$awayId]['losses'];
    }

    private static function sortTable(array &$rows): void
    {
        usort($rows, function (array $left, array $right) {
            return ((int) $right['points'] <=> (int) $left['points'])
                ?: ((int) $right['diff'] <=> (int) $left['diff'])
                ?: ((int) $right['points_for'] <=> (int) $left['points_for'])
                ?: strcasecmp((string) ($left['team_name'] ?? ''), (string) ($right['team_name'] ?? ''))
                ?: ((int) $left['team_id'] <=> (int) $right['team_id']);
        });
    }

    private static function ranked(array $rows): array
    {
        $rank = 1;
        foreach ($rows as &$row) {
            $row['rank'] = $rank++;
        }
        unset($row);

        return $rows;
    }

    private static function teamInfo(array $row, array $teamsById): array
    {
        $team = $teamsById[$row['team_id']] ?? null;
        $row['team_name'] = self::getv($team, 'name');
        $row['city'] = self::getv($team, 'city');
        $row['logo_url'] = self::getv($team, 'logo_url');

        return $row;
    }

    private static function getv(object|array|null $value, string $key): mixed
    {
        if (is_array($value)) {
            return $value[$key] ?? null;
        }

        return $value?->{$key} ?? null;
    }
}

