<?php

namespace App\Support;

use App\Models\Tournament;
use Carbon\Carbon;

class TournamentSchedulePlanner
{
    public static function plan(Tournament $tournament, int $teamCount): array
    {
        $finalDate = $tournament->end_date ? Carbon::parse($tournament->end_date)->startOfDay() : null;
        $allowedDays = self::allowedDays($tournament);
        $slotCapacity = self::slotCapacity($tournament);
        $stageMatchesPerDay = self::stageMatchesPerDay($tournament);
        $issues = [];

        if (!$finalDate) {
            $issues[] = 'Final date is required.';
        }
        if ($allowedDays === []) {
            $issues[] = 'Select at least one allowed playing day.';
        }
        if ($slotCapacity < 1) {
            $issues[] = 'At least one time slot is required.';
        }

        $stageRoundSizes = self::stageRoundSizes((string) $tournament->format, $teamCount);
        $playoffRoundSizes = self::playoffRoundSizes((string) $tournament->format, $teamCount);
        $requiredMatches = array_sum($stageRoundSizes) + array_sum($playoffRoundSizes);

        if ($issues !== []) {
            return [
                'team_count' => $teamCount,
                'required_matches' => $requiredMatches,
                'stage_match_count' => array_sum($stageRoundSizes),
                'playoff_match_count' => array_sum($playoffRoundSizes),
                'stage_day_count' => 0,
                'playoff_day_count' => 0,
                'total_used_days' => 0,
                'estimated_start_date' => null,
                'final_date' => $finalDate?->toDateString(),
                'stage_dates' => [],
                'playoff_round_dates' => [],
                'playoff_round_gap_days' => max(0, (int) ($tournament->playoff_round_gap_days ?? 1)),
                'groups_to_playoffs_gap_days' => max(0, (int) ($tournament->groups_to_playoffs_gap_days ?? 1)),
                'stage_day_gap_days' => max(0, (int) ($tournament->stage_day_gap_days ?? 0)),
                'stage_matches_per_day' => $stageMatchesPerDay,
                'slot_capacity_per_day' => $slotCapacity,
                'issues' => $issues,
                'is_feasible' => false,
            ];
        }

        $playoffRoundDates = self::planPlayoffRoundDates($tournament, $playoffRoundSizes, $finalDate);
        $playoffIssues = $playoffRoundDates['issues'];
        $firstPlayoffDate = $playoffRoundDates['first_playoff_date'];
        $latestStageDate = $firstPlayoffDate
            ? $firstPlayoffDate->copy()->subDays(max(0, (int) ($tournament->groups_to_playoffs_gap_days ?? 1)) + 1)
            : $finalDate->copy();

        $stageDayCount = (int) ceil(array_sum($stageRoundSizes) / max(1, $stageMatchesPerDay));
        $stageDates = self::selectBalancedStageDatesBackward($tournament, $latestStageDate, $stageDayCount);

        if ($stageDayCount > 0 && count($stageDates) < $stageDayCount) {
            $playoffIssues[] = 'Could not find enough calendar days for the stage schedule.';
        }

        $usedDates = [];
        foreach ($stageDates as $date) {
            $usedDates[$date->toDateString()] = true;
        }
        foreach ($playoffRoundDates['round_dates'] as $roundDates) {
            foreach ($roundDates as $date) {
                $usedDates[$date->toDateString()] = true;
            }
        }

        $estimatedStartDate = null;
        if ($stageDates !== []) {
            $estimatedStartDate = $stageDates[0]->toDateString();
        } elseif ($firstPlayoffDate) {
            $estimatedStartDate = $firstPlayoffDate->toDateString();
        } elseif ($finalDate) {
            $estimatedStartDate = $finalDate->toDateString();
        }

        return [
            'team_count' => $teamCount,
            'required_matches' => $requiredMatches,
            'stage_match_count' => array_sum($stageRoundSizes),
            'playoff_match_count' => array_sum($playoffRoundSizes),
            'stage_day_count' => count($stageDates),
            'playoff_day_count' => $playoffRoundDates['day_count'],
            'total_used_days' => count($usedDates),
            'estimated_start_date' => $estimatedStartDate,
            'final_date' => $finalDate->toDateString(),
            'stage_dates' => array_map(fn (Carbon $date) => $date->toDateString(), $stageDates),
            'playoff_round_dates' => array_map(
                fn (array $roundDates) => array_map(fn (Carbon $date) => $date->toDateString(), $roundDates),
                $playoffRoundDates['round_dates'],
            ),
            'playoff_round_gap_days' => max(0, (int) ($tournament->playoff_round_gap_days ?? 1)),
            'groups_to_playoffs_gap_days' => max(0, (int) ($tournament->groups_to_playoffs_gap_days ?? 1)),
            'stage_day_gap_days' => max(0, (int) ($tournament->stage_day_gap_days ?? 0)),
            'stage_matches_per_day' => $stageMatchesPerDay,
            'slot_capacity_per_day' => $slotCapacity,
            'issues' => $playoffIssues,
            'is_feasible' => $playoffIssues === [],
        ];
    }

    public static function daySlots(Tournament $tournament, Carbon $date, string $timeDirection = 'asc', ?int $limit = null): array
    {
        $slots = [];
        $times = self::timeSlots($tournament);
        if ($timeDirection === 'desc') {
            $times = array_reverse($times);
        }

        foreach ($times as $time) {
            $slots[] = [
                'slot' => $date->copy()->setTimeFromTimeString($time),
            ];
        }

        return $limit === null ? $slots : array_slice($slots, 0, max(0, $limit));
    }

    public static function stageMatchesPerDay(Tournament $tournament): int
    {
        $slotCapacity = self::slotCapacity($tournament);
        $configured = $tournament->group_games_per_day !== null
            ? max(1, (int) $tournament->group_games_per_day)
            : $slotCapacity;

        return max(1, min($slotCapacity, $configured));
    }

    public static function slotCapacity(Tournament $tournament): int
    {
        return max(1, count(self::timeSlots($tournament)));
    }

    public static function stageRoundSizes(string $format, int $teamCount): array
    {
        if ($teamCount < 2) {
            return [];
        }

        return match ($format) {
            'groups_playoffs' => self::groupsStageRoundSizes($teamCount),
            'round_robin' => self::roundRobinRoundSizes(range(1, $teamCount)),
            default => [],
        };
    }

    public static function playoffRoundSizes(string $format, int $teamCount): array
    {
        if ($teamCount < 2) {
            return [];
        }

        return match ($format) {
            'single_elimination' => self::singleEliminationRoundSizes($teamCount),
            'groups_playoffs' => self::shellRoundSizes(TournamentProgression::playoffQualifiedCountForTeamCount($teamCount)),
            'round_robin' => self::shellRoundSizes(self::roundRobinPlayoffQualifiedCount($teamCount)),
            default => [],
        };
    }

    private static function planPlayoffRoundDates(Tournament $tournament, array $roundSizes, Carbon $finalDate): array
    {
        if ($roundSizes === []) {
            return [
                'round_dates' => [],
                'day_count' => 0,
                'first_playoff_date' => null,
                'issues' => [],
            ];
        }

        $roundDates = [];
        $issues = [];
        $slotCapacity = self::slotCapacity($tournament);
        $boundary = $finalDate->copy();
        $firstPlayoffDate = null;

        for ($roundIndex = count($roundSizes); $roundIndex >= 1; $roundIndex--) {
            $matchCount = $roundSizes[$roundIndex - 1];
            $requiredDays = (int) ceil($matchCount / max(1, $slotCapacity));
            $dates = self::selectLatestPlayableDatesBackward($tournament, $boundary, $requiredDays, true);

            if (count($dates) < $requiredDays) {
                $issues[] = 'Could not find enough calendar days for playoff rounds.';
                break;
            }

            $dates = array_reverse($dates);
            $roundDates[$roundIndex] = $dates;
            $firstPlayoffDate = $dates[0];
            $boundary = $dates[0]->copy()->subDays(max(0, (int) ($tournament->playoff_round_gap_days ?? 1)) + 1);
        }

        ksort($roundDates);

        return [
            'round_dates' => $roundDates,
            'day_count' => array_sum(array_map('count', $roundDates)),
            'first_playoff_date' => $firstPlayoffDate,
            'issues' => $issues,
        ];
    }

    private static function selectBalancedStageDatesBackward(Tournament $tournament, Carbon $latestDate, int $count): array
    {
        if ($count <= 0) {
            return [];
        }

        $candidateCount = max($count * 3, $count + 10);
        $candidates = self::collectAllowedDatesBackward($tournament, $latestDate, $candidateCount);
        if (!self::dateInList($latestDate, $candidates)) {
            array_unshift($candidates, $latestDate->copy());
        }
        if ($candidates === []) {
            return [];
        }

        $selected = [];
        $gapDays = max(0, (int) ($tournament->stage_day_gap_days ?? 0));
        $index = 0;
        while (count($selected) < $count && $index < count($candidates)) {
            $candidate = $candidates[$index];
            $previous = $selected[count($selected) - 1] ?? null;
            if (!$previous || abs($previous->diffInDays($candidate)) > $gapDays) {
                $selected[] = $candidate;
            }
            $index++;
        }

        if (count($selected) < $count) {
            foreach ($candidates as $candidate) {
                if (count($selected) >= $count) {
                    break;
                }

                $alreadySelected = array_filter(
                    $selected,
                    fn (Carbon $selectedDate) => $selectedDate->equalTo($candidate),
                );
                if ($alreadySelected !== []) {
                    continue;
                }

                $previous = $selected[count($selected) - 1] ?? null;
                if (!$previous || abs($previous->diffInDays($candidate)) > $gapDays) {
                    $selected[] = $candidate;
                }
            }
        }

        usort($selected, fn (Carbon $left, Carbon $right) => $left->getTimestamp() <=> $right->getTimestamp());

        return array_slice($selected, 0, $count);
    }

    private static function selectLatestPlayableDatesBackward(
        Tournament $tournament,
        Carbon $boundaryDate,
        int $count,
        bool $forceBoundaryDate
    ): array {
        if ($count <= 0) {
            return [];
        }

        $selected = [];
        $cursor = $boundaryDate->copy();
        $guard = 0;

        while (count($selected) < $count && $guard < 3660) {
            $isBoundary = $cursor->equalTo($boundaryDate);
            if (($forceBoundaryDate && $isBoundary) || self::isAllowedDate($tournament, $cursor)) {
                $selected[] = $cursor->copy();
            }
            $cursor->subDay();
            $guard++;
        }

        return $selected;
    }

    private static function collectAllowedDatesBackward(Tournament $tournament, Carbon $boundaryDate, int $count): array
    {
        $selected = [];
        $cursor = $boundaryDate->copy();
        $guard = 0;

        while (count($selected) < $count && $guard < 3660) {
            if (self::isAllowedDate($tournament, $cursor)) {
                $selected[] = $cursor->copy();
            }
            $cursor->subDay();
            $guard++;
        }

        return $selected;
    }

    private static function dateInList(Carbon $date, array $dates): bool
    {
        foreach ($dates as $candidate) {
            if ($candidate instanceof Carbon && $candidate->equalTo($date)) {
                return true;
            }
        }

        return false;
    }

    private static function groupsStageRoundSizes(int $teamCount): array
    {
        $aggregate = [];
        $teams = range(1, $teamCount);

        foreach (array_chunk($teams, 4) as $groupTeams) {
            $roundSizes = self::roundRobinRoundSizes($groupTeams);
            foreach ($roundSizes as $index => $size) {
                $aggregate[$index] = ($aggregate[$index] ?? 0) + $size;
            }
        }

        ksort($aggregate);

        return array_values($aggregate);
    }

    private static function roundRobinRoundSizes(array $teamIds): array
    {
        $teams = array_values($teamIds);
        if (count($teams) % 2 === 1) {
            $teams[] = null;
        }

        $teamCount = count($teams);
        $rounds = $teamCount - 1;
        $half = (int) ($teamCount / 2);
        $sizes = [];

        for ($round = 0; $round < $rounds; $round++) {
            $count = 0;
            for ($index = 0; $index < $half; $index++) {
                $left = $teams[$index];
                $right = $teams[$teamCount - 1 - $index];
                if ($left !== null && $right !== null) {
                    $count++;
                }
            }

            $sizes[] = $count;

            $fixed = $teams[0];
            $rest = array_slice($teams, 1);
            $last = array_pop($rest);
            array_unshift($rest, $last);
            $teams = array_merge([$fixed], $rest);
        }

        return $sizes;
    }

    private static function singleEliminationRoundSizes(int $teamCount): array
    {
        $bracketSize = 1;
        while ($bracketSize < $teamCount) {
            $bracketSize *= 2;
        }

        return self::shellRoundSizes($bracketSize);
    }

    private static function shellRoundSizes(int $qualifiedCount): array
    {
        if ($qualifiedCount < 2) {
            return [];
        }

        $sizes = [];
        $matchCount = (int) ($qualifiedCount / 2);
        while ($matchCount > 0) {
            $sizes[] = $matchCount;
            $matchCount = (int) ($matchCount / 2);
        }

        return $sizes;
    }

    private static function roundRobinPlayoffQualifiedCount(int $teamCount): int
    {
        $qualified = intdiv($teamCount, 2);
        $bracketSize = 1;

        while (($bracketSize * 2) <= $qualified) {
            $bracketSize *= 2;
        }

        return $bracketSize >= 2 ? $bracketSize : 0;
    }

    private static function allowedDays(Tournament $tournament): array
    {
        $days = $tournament->allowed_days ?: [1, 2, 3, 4, 5, 6, 7];
        $days = array_values(array_unique(array_filter(
            array_map('intval', $days),
            fn (int $day) => $day >= 1 && $day <= 7,
        )));
        sort($days);

        return $days;
    }

    private static function timeSlots(Tournament $tournament): array
    {
        $slots = $tournament->time_slots ?: ['12:00', '14:00', '16:00', '18:00'];
        $slots = array_values(array_filter($slots, fn (mixed $slot) => is_string($slot) && trim($slot) !== ''));

        return $slots === [] ? ['12:00', '14:00', '16:00', '18:00'] : $slots;
    }

    private static function isAllowedDate(Tournament $tournament, Carbon $date): bool
    {
        return in_array((int) $date->dayOfWeekIso, self::allowedDays($tournament), true);
    }
}
