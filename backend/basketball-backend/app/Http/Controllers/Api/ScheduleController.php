<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use App\Support\SchedulingFeasibility;
use App\Support\TournamentProgression;
use App\Support\TournamentSchedulePlanner;
use Carbon\Carbon;
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
            'end_date' => ['nullable', 'date'],
            'time_slots' => ['nullable', 'array'],
            'time_slots.*' => ['string', 'max:10'],
            'venue_name' => ['nullable', 'string', 'max:150'],
            'playoff_round_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'groups_to_playoffs_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'group_games_per_day' => ['nullable', 'integer', 'in:2,4,6,8'],
            'stage_day_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
        ]);

        $teams = TournamentTeam::where('tournament_id', $tournament->id)
            ->orderByRaw('seed IS NULL, seed ASC')
            ->pluck('team_id')
            ->values()
            ->all();

        if (count($teams) < 2) {
            return response()->json(['message' => 'Need at least 2 teams registered.'], 409);
        }

        $planningConfig = $this->buildPlanningConfig($tournament, $validated);
        $tournament->fill($planningConfig);

        $feasibility = SchedulingFeasibility::evaluate($tournament, count($teams));
        if (!$feasibility['is_feasible']) {
            return response()->json([
                'message' => $feasibility['issues'][0] ?? 'Schedule planning setup is incomplete.',
                'feasibility' => $feasibility,
            ], 409);
        }

        $groupAssignments = $tournament->format === 'groups_playoffs'
            ? $this->buildGroupAssignments($teams)
            : [];

        $plannedMatches = match ($tournament->format) {
            'single_elimination' => $this->buildSingleEliminationMatches($teams),
            'groups_playoffs' => $this->buildGroupsPlayoffsMatches($teams),
            default => $this->buildRoundRobinMatches($teams),
        };

        $scheduledMatches = $this->assignMatchesToSlots($tournament, $plannedMatches, $feasibility);
        if (count($scheduledMatches) !== count($plannedMatches)) {
            return response()->json([
                'message' => 'Could not assign all matches into the generated planning window.',
                'feasibility' => $feasibility,
                'assigned_matches' => count($scheduledMatches),
                'required_matches' => count($plannedMatches),
            ], 409);
        }

        $earliestSlot = collect($scheduledMatches)
            ->pluck('slot')
            ->filter()
            ->sortBy(fn (Carbon $slot) => $slot->getTimestamp())
            ->first();
        $latestSlot = collect($scheduledMatches)
            ->pluck('slot')
            ->filter()
            ->sortByDesc(fn (Carbon $slot) => $slot->getTimestamp())
            ->first();

        DB::transaction(function () use ($tournament, $scheduledMatches, $groupAssignments, $planningConfig, $earliestSlot, $latestSlot) {
            $tournament->fill($planningConfig);
            if ($earliestSlot instanceof Carbon) {
                $tournament->start_date = $earliestSlot->toDateString();
            }
            if ($latestSlot instanceof Carbon) {
                $tournament->end_date = $latestSlot->toDateString();
            }
            if ($earliestSlot instanceof Carbon && $latestSlot instanceof Carbon) {
                $days = $earliestSlot->copy()->startOfDay()->diffInDays($latestSlot->copy()->startOfDay()) + 1;
                $tournament->duration_weeks = max(1, (int) ceil($days / 7));
            }
            $tournament->save();

            Game::where('tournament_id', $tournament->id)->delete();
            TournamentTeam::where('tournament_id', $tournament->id)->update(['group_code' => null]);

            foreach ($groupAssignments as $teamId => $groupCode) {
                TournamentTeam::where('tournament_id', $tournament->id)
                    ->where('team_id', $teamId)
                    ->update(['group_code' => $groupCode]);
            }

            foreach ($scheduledMatches as $scheduledMatch) {
                $row = $scheduledMatch['row'];
                $slot = $scheduledMatch['slot'];

                Game::create([
                    'tournament_id' => $tournament->id,
                    'home_team_id' => $row['home_team_id'],
                    'away_team_id' => $row['away_team_id'],
                    'stage' => $row['stage'],
                    'group_code' => $row['group_code'],
                    'round_number' => $row['round_number'],
                    'scheduled_at' => $slot->toDateTimeString(),
                    'venue_name' => null,
                    'home_score' => null,
                    'away_score' => null,
                    'status' => 'scheduled',
                ]);
            }

            TournamentProgression::sync($tournament);
        });

        return response()->json([
            'message' => 'Schedule generated',
            'format' => $tournament->format,
            'matches_created' => count($plannedMatches),
            'schedule_window' => [
                'start_date' => $earliestSlot?->toDateString(),
                'final_date' => $latestSlot?->toDateString(),
            ],
        ], 201);
    }

    private function buildPlanningConfig(Tournament $tournament, array $validated): array
    {
        $timeSlots = array_values(array_filter(
            $validated['time_slots'] ?? $tournament->time_slots ?? ['12:00', '14:00', '16:00', '18:00'],
            fn (mixed $slot) => is_string($slot) && trim($slot) !== '',
        ));

        return [
            'end_date' => $validated['end_date'] ?? $tournament->end_date,
            'venue_name' => $this->normalizeVenueName($validated['venue_name'] ?? $tournament->venue_name ?? null),
            'time_slots' => $timeSlots === [] ? ['12:00', '14:00', '16:00', '18:00'] : $timeSlots,
            'playoff_round_gap_days' => $validated['playoff_round_gap_days'] ?? $tournament->playoff_round_gap_days ?? 1,
            'groups_to_playoffs_gap_days' => $validated['groups_to_playoffs_gap_days'] ?? $tournament->groups_to_playoffs_gap_days ?? 1,
            'stage_day_gap_days' => $validated['stage_day_gap_days'] ?? $tournament->stage_day_gap_days ?? 0,
            'group_games_per_day' => $validated['group_games_per_day'] ?? $tournament->group_games_per_day,
        ];
    }

    private function assignMatchesToSlots(Tournament $tournament, array $plannedMatches, ?array $feasibility = null, array $legacySlots = []): array
    {
        $feasibility = $feasibility ?? SchedulingFeasibility::evaluate($tournament, count(array_unique(array_filter(array_merge(
            array_column($plannedMatches, 'home_team_id'),
            array_column($plannedMatches, 'away_team_id'),
        )))));

        $stageMatches = [];
        $playoffMatchesByRound = [];

        foreach ($plannedMatches as $row) {
            $round = (int) ($row['round_number'] ?? 1);
            if (($row['stage'] ?? null) === 'playoffs') {
                $playoffMatchesByRound[$round][] = $row;
            } else {
                $stageMatches[] = $row;
            }
        }

        usort($stageMatches, function (array $left, array $right): int {
            return ((int) ($left['round_number'] ?? 1) <=> (int) ($right['round_number'] ?? 1))
                ?: ((int) ($left['seed'] ?? 0) <=> (int) ($right['seed'] ?? 0));
        });
        ksort($playoffMatchesByRound);

        $scheduled = [];

        $stageDates = array_values($feasibility['stage_dates'] ?? []);
        $stageMatchesPerDay = max(1, (int) ($feasibility['stage_matches_per_day'] ?? TournamentSchedulePlanner::stageMatchesPerDay($tournament)));
        $stageSlots = [];

        foreach ($stageDates as $dateString) {
            $stageSlots = array_merge(
                $stageSlots,
                TournamentSchedulePlanner::daySlots(
                    $tournament,
                    Carbon::parse($dateString)->startOfDay(),
                    'asc',
                    $stageMatchesPerDay,
                ),
            );
        }

        foreach ($stageMatches as $index => $row) {
            if (!isset($stageSlots[$index])) {
                continue;
            }

            $scheduled[] = [
                'row' => $row,
                'slot' => $stageSlots[$index]['slot'],
            ];
        }

        foreach ($playoffMatchesByRound as $round => $matches) {
            $roundDates = $feasibility['playoff_round_dates'][$round] ?? [];
            $roundDates = array_values($roundDates);
            $slots = [];

            foreach ($roundDates as $dateString) {
                $slots = array_merge(
                    $slots,
                    TournamentSchedulePlanner::daySlots(
                        $tournament,
                        Carbon::parse($dateString)->startOfDay(),
                        $round === max(array_keys($playoffMatchesByRound)) ? 'desc' : 'asc',
                    ),
                );
            }

            foreach ($matches as $index => $row) {
                if (!isset($slots[$index])) {
                    continue;
                }

                $scheduled[] = [
                    'row' => $row,
                    'slot' => $slots[$index]['slot'],
                ];
            }
        }

        usort($scheduled, function (array $left, array $right) {
            return $left['slot']->getTimestamp() <=> $right['slot']->getTimestamp();
        });

        return $scheduled;
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

        $qualified = $this->roundRobinPlayoffQualifiedCount(count($teamIds));
        if ($qualified < 2) {
            return $rows;
        }

        $rows = array_merge($rows, $this->buildPlayoffShellMatches($qualified, 'RR'));

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

        return array_merge($rows, $this->buildPlayoffShellMatches($qualified, 'GP'));
    }

    private function buildGroupAssignments(array $teamIds): array
    {
        $assignments = [];
        foreach (array_chunk(array_values($teamIds), 4) as $groupIndex => $groupTeamIds) {
            $groupCode = chr(ord('A') + $groupIndex);
            foreach ($groupTeamIds as $teamId) {
                $assignments[$teamId] = $groupCode;
            }
        }

        return $assignments;
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

    private function roundRobinPlayoffQualifiedCount(int $teamCount): int
    {
        $qualified = intdiv($teamCount, 2);
        $bracketSize = 1;

        while (($bracketSize * 2) <= $qualified) {
            $bracketSize *= 2;
        }

        return $bracketSize >= 2 ? $bracketSize : 0;
    }

    private function buildPlayoffShellMatches(int $qualified, string $prefix): array
    {
        $rows = [];
        $matchCount = (int)($qualified / 2);
        $round = 1;

        while ($matchCount > 0) {
            for ($i = 0; $i < $matchCount; $i++) {
                $rows[] = [
                    'home_team_id' => null,
                    'away_team_id' => null,
                    'stage' => 'playoffs',
                    'group_code' => $prefix . $round . '-' . ($i + 1),
                    'round_number' => $round,
                ];
            }
            $matchCount = (int)($matchCount / 2);
            $round++;
        }

        return $rows;
    }

    private function normalizeVenueName(?string $venueName): ?string
    {
        $name = trim((string) ($venueName ?? ''));
        return $name !== '' ? $name : null;
    }
}
