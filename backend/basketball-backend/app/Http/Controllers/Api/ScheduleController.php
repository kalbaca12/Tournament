<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use App\Support\SchedulingFeasibility;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ScheduleController extends Controller
{
    public function clearSchedule(Tournament $tournament)
    {
        Game::where('tournament_id', $tournament->id)->delete();
        return response()->json(['message' => 'Schedule cleared'], 200);
    }

    public function generateRoundRobin(Request $request, Tournament $tournament)
    {
        if (!$tournament->participants_locked) {
            return response()->json(['message' => 'Lock participants before schedule generation.'], 409);
        }

        $validated = $request->validate([
            'start_datetime' => ['nullable','date'],
            'minutes_between_games' => ['nullable','integer','min:10','max:10000'],
            'venue_id' => ['nullable','integer'],
        ]);

        $teams = TournamentTeam::where('tournament_id', $tournament->id)
            ->orderByRaw('seed IS NULL, seed ASC')
            ->pluck('team_id')
            ->values()
            ->all();

        if (count($teams) < 2) {
            return response()->json(['message' => 'Need at least 2 teams registered.'], 409);
        }

        $feasibility = SchedulingFeasibility::evaluate($tournament, count($teams));
        if (!$feasibility['is_feasible']) {
            return response()->json([
                'message' => 'Schedule is not feasible with current duration/slots.',
                'feasibility' => $feasibility,
            ], 409);
        }

        $venueId = $validated['venue_id'] ?? null;
        $slots = $this->buildSlots($tournament, $validated['start_datetime'] ?? null);

        if (count($slots) === 0) {
            return response()->json([
                'message' => 'No valid date/time slots found. Set tournament date range first.',
            ], 409);
        }

        $plannedMatches = match ($tournament->format) {
            'single_elimination' => $this->buildSingleEliminationMatches($teams),
            'groups_playoffs' => $this->buildGroupsPlayoffsMatches($teams),
            default => $this->buildRoundRobinMatches($teams),
        };

        if (count($plannedMatches) > count($slots)) {
            return response()->json([
                'message' => 'Schedule is not feasible with current date range and fixed daily slots (12:00, 14:00, 16:00, 18:00).',
                'required_matches' => count($plannedMatches),
                'available_slots' => count($slots),
            ], 409);
        }

        DB::transaction(function () use ($tournament, $plannedMatches, $slots, $venueId) {
            Game::where('tournament_id', $tournament->id)->delete();

            foreach ($plannedMatches as $index => $row) {
                $dt = $slots[$index];
                Game::create([
                    'tournament_id' => $tournament->id,
                    'home_team_id' => $row['home_team_id'],
                    'away_team_id' => $row['away_team_id'],
                    'venue_id' => $venueId,
                    'stage' => $row['stage'],
                    'group_code' => $row['group_code'],
                    'round_number' => $row['round_number'],
                    'scheduled_at' => $dt->toDateTimeString(),
                    'home_score' => null,
                    'away_score' => null,
                    'status' => 'scheduled',
                ]);
            }
        });

        return response()->json([
            'message' => 'Schedule generated',
            'format' => $tournament->format,
            'matches_created' => count($plannedMatches),
        ], 201);
    }

    private function roundRobinPairings(array $teamIds): array
    {
        $teams = array_values($teamIds);

        if (count($teams) % 2 === 1) {
            $teams[] = null;
        }

        $n = count($teams);
        $rounds = $n - 1;
        $half = (int)($n / 2);

        $result = [];

        for ($r = 1; $r <= $rounds; $r++) {
            $pairs = [];
            for ($i = 0; $i < $half; $i++) {
                $t1 = $teams[$i];
                $t2 = $teams[$n - 1 - $i];

                if ($t1 !== null && $t2 !== null) {
                    $pairs[] = ($r % 2 === 1) ? [$t1, $t2] : [$t2, $t1];
                }
            }

            $result[$r] = $pairs;
            $fixed = $teams[0];
            $rest = array_slice($teams, 1);
            $last = array_pop($rest);
            array_unshift($rest, $last);
            $teams = array_merge([$fixed], $rest);
        }

        return $result;
    }

    private function buildRoundRobinMatches(array $teamIds): array
    {
        $rows = [];
        $pairingsByRound = $this->roundRobinPairings($teamIds);
        foreach ($pairingsByRound as $roundNumber => $pairs) {
            foreach ($pairs as [$homeId, $awayId]) {
                $rows[] = [
                    'home_team_id' => $homeId,
                    'away_team_id' => $awayId,
                    'stage' => 'group',
                    'group_code' => null,
                    'round_number' => $roundNumber,
                ];
            }
        }

        return $rows;
    }

    private function buildSingleEliminationMatches(array $teamIds): array
    {
        $rows = [];
        $count = count($teamIds);
        $bracketSize = 1;
        while ($bracketSize < $count) {
            $bracketSize *= 2;
        }

        $seeded = array_values($teamIds);
        while (count($seeded) < $bracketSize) {
            $seeded[] = null;
        }

        $matchCount = (int)($bracketSize / 2);
        for ($i = 0; $i < $matchCount; $i++) {
            $rows[] = [
                'home_team_id' => $seeded[$i * 2],
                'away_team_id' => $seeded[$i * 2 + 1],
                'stage' => 'playoffs',
                'group_code' => 'P1-' . ($i + 1),
                'round_number' => 1,
            ];
        }

        $round = 2;
        while ($matchCount > 1) {
            $matchCount = (int)($matchCount / 2);
            for ($i = 0; $i < $matchCount; $i++) {
                $rows[] = [
                    'home_team_id' => null,
                    'away_team_id' => null,
                    'stage' => 'playoffs',
                    'group_code' => 'P' . $round . '-' . ($i + 1),
                    'round_number' => $round,
                ];
            }
            $round++;
        }

        return $rows;
    }

    private function buildGroupsPlayoffsMatches(array $teamIds): array
    {
        $rows = [];
        $groupSize = 4;
        $groups = array_chunk(array_values($teamIds), $groupSize);

        foreach ($groups as $groupIndex => $groupTeamIds) {
            if (count($groupTeamIds) < 2) {
                continue;
            }

            $groupCode = chr(ord('A') + $groupIndex);
            $groupRounds = $this->roundRobinPairings($groupTeamIds);

            foreach ($groupRounds as $roundNumber => $pairs) {
                foreach ($pairs as [$homeId, $awayId]) {
                    $rows[] = [
                        'home_team_id' => $homeId,
                        'away_team_id' => $awayId,
                        'stage' => 'group',
                        'group_code' => $groupCode,
                        'round_number' => $roundNumber,
                    ];
                }
            }
        }

        $qualified = $this->playoffQualifiedCount(count($teamIds));

        if ($qualified < 2) {
            return $rows;
        }

        $matchCount = (int)($qualified / 2);
        $round = 1;
        while ($matchCount > 0) {
            for ($i = 0; $i < $matchCount; $i++) {
                $rows[] = [
                    'home_team_id' => null,
                    'away_team_id' => null,
                    'stage' => 'playoffs',
                    'group_code' => 'GP' . $round . '-' . ($i + 1),
                    'round_number' => $round,
                ];
            }
            $matchCount = (int)($matchCount / 2);
            $round++;
        }

        return $rows;
    }

    private function playoffQualifiedCount(int $teamCount): int
    {
        if ($teamCount >= 8) {
            return 8;
        }
        if ($teamCount >= 4) {
            return 4;
        }

        return $teamCount >= 2 ? 2 : 0;
    }

    private function buildSlots(Tournament $tournament, ?string $startDateTime = null): array
    {
        if (!$tournament->start_date || !$tournament->end_date) {
            return [];
        }

        $startDate = Carbon::parse($tournament->start_date)->startOfDay();
        $endDate = Carbon::parse($tournament->end_date)->endOfDay();
        if ($endDate->lt($startDate)) {
            return [];
        }

        $allowedDays = $tournament->allowed_days ?: [1, 2, 3, 4, 5, 6, 7];
        $allowedDays = array_map('intval', $allowedDays);
        $fixedSlots = ['12:00', '14:00', '16:00', '18:00'];

        $notBefore = $startDateTime ? Carbon::parse($startDateTime) : null;
        $result = [];
        $cursor = $startDate->copy();

        while ($cursor->lte($endDate)) {
            if (in_array((int)$cursor->dayOfWeekIso, $allowedDays, true)) {
                foreach ($fixedSlots as $time) {
                    $dt = $cursor->copy()->setTimeFromTimeString($time);
                    if ($notBefore instanceof CarbonInterface && $dt->lt($notBefore)) {
                        continue;
                    }
                    $result[] = $dt;
                }
            }
            $cursor->addDay();
        }

        return $result;
    }
}
