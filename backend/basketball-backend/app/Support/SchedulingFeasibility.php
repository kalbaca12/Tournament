<?php

namespace App\Support;

use App\Models\Tournament;
use Carbon\Carbon;

class SchedulingFeasibility
{
    public static function evaluate(Tournament $tournament, int $teamCount): array
    {
        $requiredMatches = self::requiredMatches($tournament->format, $teamCount);
        $availableSlots = self::availableSlots($tournament);
        $slotsPerWeek = self::slotsPerWeek($tournament);
        $minimumWeeksNeeded = $requiredMatches > 0 ? (int)ceil($requiredMatches / max(1, $slotsPerWeek)) : 0;

        return [
            'team_count' => $teamCount,
            'required_matches' => $requiredMatches,
            'available_slots' => $availableSlots,
            'slots_per_week' => $slotsPerWeek,
            'minimum_weeks_needed' => $minimumWeeksNeeded,
            'is_feasible' => $requiredMatches <= $availableSlots,
            'missing_slots' => max(0, $requiredMatches - $availableSlots),
        ];
    }

    private static function requiredMatches(string $format, int $teamCount): int
    {
        if ($teamCount < 2) {
            return 0;
        }

        return match ($format) {
            'single_elimination' => $teamCount - 1,
            'groups_playoffs' => self::groupsPlayoffsMatches($teamCount),
            default => (int)(($teamCount * ($teamCount - 1)) / 2),
        };
    }

    private static function groupsPlayoffsMatches(int $teamCount): int
    {
        $groupSize = 4;
        $groups = [];
        $remaining = $teamCount;

        while ($remaining > 0) {
            $size = min($groupSize, $remaining);
            $groups[] = $size;
            $remaining -= $size;
        }

        $groupMatches = 0;
        foreach ($groups as $size) {
            $groupMatches += (int)(($size * ($size - 1)) / 2);
        }

        $qualified = self::playoffQualifiedCount($teamCount);
        $playoffMatches = $qualified - 1;

        return $groupMatches + $playoffMatches;
    }

    private static function playoffQualifiedCount(int $teamCount): int
    {
        if ($teamCount >= 8) {
            return 8;
        }
        if ($teamCount >= 4) {
            return 4;
        }

        return $teamCount >= 2 ? 2 : 0;
    }

    private static function availableSlots(Tournament $tournament): int
    {
        if (!$tournament->start_date || !$tournament->end_date) {
            return 0;
        }

        $start = Carbon::parse($tournament->start_date)->startOfDay();
        $end = Carbon::parse($tournament->end_date)->startOfDay();
        if ($end->lt($start)) {
            return 0;
        }

        $allowedDays = $tournament->allowed_days ?: [1, 2, 3, 4, 5, 6, 7];
        $allowedDays = array_map('intval', $allowedDays);
        $slotsPerDay = self::slotsPerDay();
        $venues = 1;

        $days = 0;
        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            if (in_array((int)$cursor->dayOfWeekIso, $allowedDays, true)) {
                $days++;
            }
            $cursor->addDay();
        }

        return $days * $slotsPerDay * $venues;
    }

    private static function slotsPerWeek(Tournament $tournament): int
    {
        $allowedDays = $tournament->allowed_days ?: [1, 2, 3, 4, 5, 6, 7];
        $allowedDays = array_unique(array_map('intval', $allowedDays));
        $validDayCount = count(array_filter($allowedDays, fn ($d) => $d >= 1 && $d <= 7));

        return max(1, $validDayCount) * self::slotsPerDay();
    }

    private static function slotsPerDay(): int
    {
        // Fixed 2-hour spacing inside the daily window: 12:00, 14:00, 16:00, 18:00.
        return 4;
    }
}
