<?php

namespace App\Support;

use App\Models\Game;
use App\Models\Tournament;

class TournamentProgression
{
    public static function sync(Tournament $tournament): void
    {
        if ($tournament->format === 'groups_playoffs') {
            self::syncGroupPlayoffEntrants($tournament);
        }

        if ($tournament->format === 'round_robin') {
            self::syncRoundRobinPlayoffEntrants($tournament);
        }

        if (in_array($tournament->format, ['groups_playoffs', 'round_robin', 'single_elimination'], true)) {
            self::syncPlayoffProgression($tournament);
        }
    }

    private static function syncGroupPlayoffEntrants(Tournament $tournament): void
    {
        $round1 = Game::where('tournament_id', $tournament->id)
            ->where('stage', 'playoffs')
            ->where('round_number', 1)
            ->orderBy('id')
            ->get();

        if ($round1->isEmpty()) {
            return;
        }

        $groups = TournamentStandings::grouped($tournament);
        if ($groups === []) {
            return;
        }

        $limit = min(self::playoffLimit($tournament), $round1->count() * 2);
        $pairings = self::round1Pairs($groups, $limit);

        foreach ($round1 as $i => $match) {
            $pairing = $pairings[$i] ?? ['home' => null, 'away' => null];
            self::setTeams(
                $match,
                $pairing['home']['team_id'] ?? null,
                $pairing['away']['team_id'] ?? null,
            );
        }
    }

    private static function syncRoundRobinPlayoffEntrants(Tournament $tournament): void
    {
        $round1 = Game::where('tournament_id', $tournament->id)
            ->where('stage', 'playoffs')
            ->where('round_number', 1)
            ->orderBy('id')
            ->get();

        if ($round1->isEmpty()) {
            return;
        }

        $rows = TournamentStandings::overall($tournament);
        if ($rows === []) {
            return;
        }

        $limit = min(self::rrPlayoffLimit($tournament), $round1->count() * 2);
        $pairings = self::seedPairs([
            ['rows' => $rows],
        ], $limit);

        foreach ($round1 as $i => $match) {
            $pairing = $pairings[$i] ?? ['home' => null, 'away' => null];
            self::setTeams(
                $match,
                $pairing['home']['team_id'] ?? null,
                $pairing['away']['team_id'] ?? null,
            );
        }
    }

    private static function syncPlayoffProgression(Tournament $tournament): void
    {
        $rounds = Game::where('tournament_id', $tournament->id)
            ->where('stage', 'playoffs')
            ->orderBy('round_number')
            ->orderBy('id')
            ->get()
            ->groupBy('round_number');

        if ($rounds->isEmpty()) {
            return;
        }

        $maxRound = (int) $rounds->keys()->max();
        for ($round = 2; $round <= $maxRound; $round++) {
            $prev = $rounds->get($round - 1);
            $cur = $rounds->get($round);

            if ($prev === null || $cur === null) {
                continue;
            }

            foreach ($cur->values() as $i => $match) {
                $participants = self::nextRoundParticipants($prev->all(), $i);

                self::setTeams(
                    $match,
                    $participants['home_team_id'],
                    $participants['away_team_id'],
                );
            }
        }
    }

    public static function roundOnePairings(array $groups, int $qualifierCount): array
    {
        return self::round1Pairs($groups, $qualifierCount);
    }

    public static function nextRoundParticipants(array $previousRoundMatches, int $matchIndex): array
    {
        return [
            'home_team_id' => self::winnerId($previousRoundMatches[$matchIndex * 2] ?? null),
            'away_team_id' => self::winnerId($previousRoundMatches[$matchIndex * 2 + 1] ?? null),
        ];
    }

    public static function winnerFromMatch(object|array|null $match): ?int
    {
        return self::winnerId($match);
    }

    public static function playoffQualifiedCountForTeamCount(int $teamCount, int $groupSize = 4, int $advanceCount = 2): int
    {
        if (!self::validGroupPlayoffSetup($teamCount, $groupSize, $advanceCount)) {
            return 0;
        }

        return intdiv($teamCount, $groupSize) * $advanceCount;
    }

    public static function validGroupPlayoffSetup(int $teamCount, int $groupSize, int $advanceCount): bool
    {
        if (!in_array($teamCount, [4, 8, 16, 32], true)) {
            return false;
        }
        if (!in_array($groupSize, [4, 8], true) || $groupSize > $teamCount || $teamCount % $groupSize !== 0) {
            return false;
        }
        if ($advanceCount < 1 || $advanceCount >= $groupSize) {
            return false;
        }

        $qualified = intdiv($teamCount, $groupSize) * $advanceCount;

        return $qualified >= 2 && ($qualified & ($qualified - 1)) === 0;
    }

    public static function groupPlayoffOptions(int $teamCount): array
    {
        $options = [];
        foreach ([4, 8] as $groupSize) {
            foreach (range(1, $groupSize - 1) as $advanceCount) {
                if (self::validGroupPlayoffSetup($teamCount, $groupSize, $advanceCount)) {
                    $options[] = [
                        'group_size' => $groupSize,
                        'group_advance_count' => $advanceCount,
                        'playoff_team_count' => intdiv($teamCount, $groupSize) * $advanceCount,
                    ];
                }
            }
        }

        return $options;
    }

    public static function roundRobinPlayoffQualifiedCountForTeamCount(int $teamCount, ?int $advanceCount = null): int
    {
        if ($advanceCount !== null && self::validRoundRobinPlayoffCount($teamCount, $advanceCount)) {
            return $advanceCount;
        }

        $qualified = intdiv($teamCount, 2);
        $bracketSize = 1;

        while (($bracketSize * 2) <= $qualified) {
            $bracketSize *= 2;
        }

        return $bracketSize >= 2 ? $bracketSize : 0;
    }

    public static function validRoundRobinPlayoffCount(int $teamCount, int $advanceCount): bool
    {
        return $teamCount >= 2
            && $advanceCount >= 2
            && $advanceCount <= $teamCount
            && in_array($advanceCount, [2, 4, 8, 16, 32], true);
    }

    private static function round1Pairs(array $groups, int $qualifierCount): array
    {
        $groupCount = count($groups);
        if ($groupCount === 0 || $qualifierCount < 2) {
            return [];
        }

        $qualifiersPerGroup = intdiv($qualifierCount, $groupCount);
        if ($qualifiersPerGroup > 0 && $qualifiersPerGroup * $groupCount === $qualifierCount && $groupCount % 2 === 0) {
            return self::crossPairs($groups, $qualifiersPerGroup);
        }

        return self::seedPairs($groups, $qualifierCount);
    }

    private static function crossPairs(array $groups, int $perGroup): array
    {
        $pairings = [];
        $groupPairs = array_chunk($groups, 2);

        foreach ($groupPairs as $pair) {
            if (count($pair) < 2) {
                continue;
            }

            $left = array_slice($pair[0]['rows'], 0, $perGroup);
            $right = array_slice($pair[1]['rows'], 0, $perGroup);

            if (count($left) < $perGroup || count($right) < $perGroup) {
                continue;
            }

            if ($perGroup === 1) {
                $pairings[] = [
                    'home' => $left[0],
                    'away' => $right[0],
                ];
                continue;
            }

            for ($i = 0; $i < intdiv($perGroup, 2); $i++) {
                $pairings[] = [
                    'home' => $left[$i],
                    'away' => $right[$perGroup - $i - 1],
                ];
                $pairings[] = [
                    'home' => $right[$i],
                    'away' => $left[$perGroup - $i - 1],
                ];
            }
        }

        return $pairings;
    }

    private static function seedPairs(array $groups, int $qualifierCount): array
    {
        $qualifiers = [];
        foreach ($groups as $group) {
            foreach ($group['rows'] as $row) {
                $qualifiers[] = $row;
            }
        }

        usort($qualifiers, function (array $left, array $right) {
            return ((int) $left['rank'] <=> (int) $right['rank'])
                ?: ((int) $right['points'] <=> (int) $left['points'])
                ?: ((int) $right['diff'] <=> (int) $left['diff'])
                ?: ((int) $right['points_for'] <=> (int) $left['points_for'])
                ?: strcasecmp((string) ($left['team_name'] ?? ''), (string) ($right['team_name'] ?? ''))
                ?: ((int) $left['team_id'] <=> (int) $right['team_id']);
        });

        $qualifiers = array_slice($qualifiers, 0, $qualifierCount);
        $pairings = [];
        $last = count($qualifiers) - 1;
        for ($i = 0; $i < intdiv(count($qualifiers), 2); $i++) {
            $pairings[] = [
                'home' => $qualifiers[$i],
                'away' => $qualifiers[$last - $i],
            ];
        }

        return $pairings;
    }

    private static function setTeams(Game $match, ?int $homeTeamId, ?int $awayTeamId): void
    {
        $participantsChanged = (int) ($match->home_team_id ?? 0) !== (int) ($homeTeamId ?? 0)
            || (int) ($match->away_team_id ?? 0) !== (int) ($awayTeamId ?? 0);

        if (!$participantsChanged) {
            return;
        }

        $match->home_team_id = $homeTeamId;
        $match->away_team_id = $awayTeamId;
        $match->home_score = null;
        $match->away_score = null;
        $match->status = 'scheduled';
        $match->save();
    }

    private static function winnerId(object|array|null $match): ?int
    {
        if ($match === null || self::getv($match, 'status') !== 'finished') {
            return null;
        }

        if (self::getv($match, 'home_score') === null || self::getv($match, 'away_score') === null) {
            return null;
        }

        $homeScore = (int) self::getv($match, 'home_score');
        $awayScore = (int) self::getv($match, 'away_score');

        if ($homeScore === $awayScore) {
            return null;
        }

        return $homeScore > $awayScore ? self::getv($match, 'home_team_id') : self::getv($match, 'away_team_id');
    }

    private static function playoffLimit(Tournament $tournament): int
    {
        return self::playoffQualifiedCountForTeamCount(
            (int) $tournament->teams()->count(),
            (int) ($tournament->group_size ?? 4),
            (int) ($tournament->group_advance_count ?? 2),
        );
    }

    private static function rrPlayoffLimit(Tournament $tournament): int
    {
        return self::roundRobinPlayoffQualifiedCountForTeamCount(
            (int) $tournament->teams()->count(),
            (int) ($tournament->group_advance_count ?? 0),
        );
    }

    private static function getv(object|array $value, string $key): mixed
    {
        if (is_array($value)) {
            return $value[$key] ?? null;
        }

        return $value->{$key} ?? null;
    }
}

