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
        $roundOneMatches = Game::where('tournament_id', $tournament->id)
            ->where('stage', 'playoffs')
            ->where('round_number', 1)
            ->orderBy('id')
            ->get();

        if ($roundOneMatches->isEmpty()) {
            return;
        }

        $groups = TournamentStandings::grouped($tournament);
        if ($groups === []) {
            return;
        }

        $qualifierCount = min(self::playoffQualifiedCount($tournament), $roundOneMatches->count() * 2);
        $pairings = self::buildRoundOnePairings($groups, $qualifierCount);

        foreach ($roundOneMatches as $index => $match) {
            $pairing = $pairings[$index] ?? ['home' => null, 'away' => null];
            self::applyParticipants(
                $match,
                $pairing['home']['team_id'] ?? null,
                $pairing['away']['team_id'] ?? null,
            );
        }
    }

    private static function syncRoundRobinPlayoffEntrants(Tournament $tournament): void
    {
        $roundOneMatches = Game::where('tournament_id', $tournament->id)
            ->where('stage', 'playoffs')
            ->where('round_number', 1)
            ->orderBy('id')
            ->get();

        if ($roundOneMatches->isEmpty()) {
            return;
        }

        $rows = TournamentStandings::overall($tournament);
        if ($rows === []) {
            return;
        }

        $qualifierCount = min(self::roundRobinPlayoffQualifiedCount($tournament), $roundOneMatches->count() * 2);
        $pairings = self::seededFallbackPairings([
            ['rows' => $rows],
        ], $qualifierCount);

        foreach ($roundOneMatches as $index => $match) {
            $pairing = $pairings[$index] ?? ['home' => null, 'away' => null];
            self::applyParticipants(
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
            $previousRound = $rounds->get($round - 1);
            $currentRound = $rounds->get($round);

            if ($previousRound === null || $currentRound === null) {
                continue;
            }

            foreach ($currentRound->values() as $matchIndex => $match) {
                $participants = self::nextRoundParticipants($previousRound->all(), $matchIndex);

                self::applyParticipants(
                    $match,
                    $participants['home_team_id'],
                    $participants['away_team_id'],
                );
            }
        }
    }

    public static function roundOnePairings(array $groups, int $qualifierCount): array
    {
        return self::buildRoundOnePairings($groups, $qualifierCount);
    }

    public static function nextRoundParticipants(array $previousRoundMatches, int $matchIndex): array
    {
        return [
            'home_team_id' => self::winnerTeamId($previousRoundMatches[$matchIndex * 2] ?? null),
            'away_team_id' => self::winnerTeamId($previousRoundMatches[$matchIndex * 2 + 1] ?? null),
        ];
    }

    public static function winnerFromMatch(object|array|null $match): ?int
    {
        return self::winnerTeamId($match);
    }

    public static function playoffQualifiedCountForTeamCount(int $teamCount): int
    {
        if ($teamCount >= 8) {
            return 8;
        }
        if ($teamCount >= 4) {
            return 4;
        }

        return $teamCount >= 2 ? 2 : 0;
    }

    public static function roundRobinPlayoffQualifiedCountForTeamCount(int $teamCount): int
    {
        $qualified = intdiv($teamCount, 2);
        $bracketSize = 1;

        while (($bracketSize * 2) <= $qualified) {
            $bracketSize *= 2;
        }

        return $bracketSize >= 2 ? $bracketSize : 0;
    }

    private static function buildRoundOnePairings(array $groups, int $qualifierCount): array
    {
        $groupCount = count($groups);
        if ($groupCount === 0 || $qualifierCount < 2) {
            return [];
        }

        $qualifiersPerGroup = intdiv($qualifierCount, $groupCount);
        if ($qualifiersPerGroup > 0 && $qualifiersPerGroup * $groupCount === $qualifierCount && $groupCount % 2 === 0) {
            return self::pairedGroupCrossovers($groups, $qualifiersPerGroup);
        }

        return self::seededFallbackPairings($groups, $qualifierCount);
    }

    private static function pairedGroupCrossovers(array $groups, int $qualifiersPerGroup): array
    {
        $pairings = [];
        $groupPairs = array_chunk($groups, 2);

        foreach ($groupPairs as $pair) {
            if (count($pair) < 2) {
                continue;
            }

            $leftQualifiers = array_slice($pair[0]['rows'], 0, $qualifiersPerGroup);
            $rightQualifiers = array_slice($pair[1]['rows'], 0, $qualifiersPerGroup);

            if (count($leftQualifiers) < $qualifiersPerGroup || count($rightQualifiers) < $qualifiersPerGroup) {
                continue;
            }

            if ($qualifiersPerGroup === 1) {
                $pairings[] = [
                    'home' => $leftQualifiers[0],
                    'away' => $rightQualifiers[0],
                ];
                continue;
            }

            for ($index = 0; $index < intdiv($qualifiersPerGroup, 2); $index++) {
                $pairings[] = [
                    'home' => $leftQualifiers[$index],
                    'away' => $rightQualifiers[$qualifiersPerGroup - $index - 1],
                ];
                $pairings[] = [
                    'home' => $rightQualifiers[$index],
                    'away' => $leftQualifiers[$qualifiersPerGroup - $index - 1],
                ];
            }
        }

        return $pairings;
    }

    private static function seededFallbackPairings(array $groups, int $qualifierCount): array
    {
        $qualifiers = [];
        foreach ($groups as $group) {
            foreach ($group['rows'] as $row) {
                $qualifiers[] = $row;
            }
        }

        usort($qualifiers, function (array $left, array $right) {
            return [
                $left['rank'],
                -$left['points'],
                -$left['diff'],
                -$left['points_for'],
                $left['team_id'],
            ] <=> [
                $right['rank'],
                -$right['points'],
                -$right['diff'],
                -$right['points_for'],
                $right['team_id'],
            ];
        });

        $qualifiers = array_slice($qualifiers, 0, $qualifierCount);
        $pairings = [];
        $lastIndex = count($qualifiers) - 1;
        for ($index = 0; $index < intdiv(count($qualifiers), 2); $index++) {
            $pairings[] = [
                'home' => $qualifiers[$index],
                'away' => $qualifiers[$lastIndex - $index],
            ];
        }

        return $pairings;
    }

    private static function applyParticipants(Game $match, ?int $homeTeamId, ?int $awayTeamId): void
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

    private static function winnerTeamId(object|array|null $match): ?int
    {
        if ($match === null || self::field($match, 'status') !== 'finished') {
            return null;
        }

        if (self::field($match, 'home_score') === null || self::field($match, 'away_score') === null) {
            return null;
        }

        $homeScore = (int) self::field($match, 'home_score');
        $awayScore = (int) self::field($match, 'away_score');

        if ($homeScore === $awayScore) {
            return null;
        }

        return $homeScore > $awayScore ? self::field($match, 'home_team_id') : self::field($match, 'away_team_id');
    }

    private static function playoffQualifiedCount(Tournament $tournament): int
    {
        return self::playoffQualifiedCountForTeamCount((int) $tournament->teams()->count());
    }

    private static function roundRobinPlayoffQualifiedCount(Tournament $tournament): int
    {
        return self::roundRobinPlayoffQualifiedCountForTeamCount((int) $tournament->teams()->count());
    }

    private static function field(object|array $value, string $key): mixed
    {
        if (is_array($value)) {
            return $value[$key] ?? null;
        }

        return $value->{$key} ?? null;
    }
}
