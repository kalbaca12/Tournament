<?php

namespace App\Support;

use App\Models\Tournament;

class SchedulingFeasibility
{
    public static function evaluate(Tournament $tournament, int $teamCount): array
    {
        return TournamentSchedulePlanner::plan($tournament, $teamCount);
    }
}
