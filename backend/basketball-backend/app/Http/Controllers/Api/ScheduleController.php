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

        $data = $request->validate([
            'end_date' => ['nullable', 'date'],
            'time_slots' => ['nullable', 'array'],
            'time_slots.*' => ['string', 'max:10'],
            'venue_name' => ['nullable', 'string', 'max:150'],
            'playoff_round_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'groups_to_playoffs_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'group_games_per_day' => ['nullable', 'integer', 'in:2,4,6,8'],
            'group_size' => ['nullable', 'integer', 'in:4,8'],
            'group_advance_count' => ['nullable', 'integer', 'min:1', 'max:512'],
            'stage_day_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
        ]);

        $teams = TournamentTeam::where('tournament_id', $tournament->id)
            ->orderByRaw('seed IS NULL, seed ASC')
            ->orderBy('id')
            ->pluck('team_id')
            ->values()
            ->all();

        if (count($teams) < 2) {
            return response()->json(['message' => 'Need at least 2 teams registered.'], 409);
        }

        $planCfg = $this->planCfg($tournament, $data);
        $tournament->fill($planCfg);

        if ($tournament->format === 'groups_playoffs' && !TournamentProgression::validGroupPlayoffSetup(
            count($teams),
            (int) ($tournament->group_size ?? 4),
            (int) ($tournament->group_advance_count ?? 2),
        )) {
            return response()->json(['message' => 'Groups + playoffs rules must create a clean playoff bracket.'], 409);
        }
        if ($tournament->format === 'round_robin' && !TournamentProgression::validRoundRobinPlayoffCount(
            count($teams),
            (int) ($tournament->group_advance_count ?? 0),
        )) {
            return response()->json(['message' => 'Round robin playoff teams must be 2, 4, 8, 16, or 32 and cannot exceed the approved team count.'], 409);
        }

        $feasibility = SchedulingFeasibility::evaluate($tournament, count($teams));
        if (!$feasibility['is_feasible']) {
            return response()->json([
                'message' => $feasibility['issues'][0] ?? 'Schedule planning setup is incomplete.',
                'feasibility' => $feasibility,
            ], 409);
        }

        $groups = $tournament->format === 'groups_playoffs'
            ? $this->groupMap($teams, $tournament)
            : [];

        $planned = match ($tournament->format) {
            'single_elimination' => $this->koMatches($teams),
            'groups_playoffs' => $this->groupsMatches($teams, $tournament),
            'round_robin' => $this->rrMatches($teams, $tournament),
            default => $this->rrMatches($teams, $tournament),
        };

        $scheduled = $this->assignSlots($tournament, $planned, $feasibility);
        if (count($scheduled) !== count($planned)) {
            return response()->json([
                'message' => 'Could not assign all matches into the generated planning window.',
                'feasibility' => $feasibility,
                'assigned_matches' => count($scheduled),
                'required_matches' => count($planned),
            ], 409);
        }

        $firstSlot = collect($scheduled)
            ->pluck('slot')
            ->filter()
            ->sortBy(fn (Carbon $slot) => $slot->getTimestamp())
            ->first();
        $lastSlot = collect($scheduled)
            ->pluck('slot')
            ->filter()
            ->sortByDesc(fn (Carbon $slot) => $slot->getTimestamp())
            ->first();

        DB::transaction(function () use ($tournament, $scheduled, $groups, $planCfg, $firstSlot, $lastSlot) {
            $tournament->fill($planCfg);
            if ($firstSlot instanceof Carbon) {
                $tournament->start_date = $firstSlot->toDateString();
            }
            if ($lastSlot instanceof Carbon) {
                $tournament->end_date = $lastSlot->toDateString();
            }
            if ($firstSlot instanceof Carbon && $lastSlot instanceof Carbon) {
                $days = $firstSlot->copy()->startOfDay()->diffInDays($lastSlot->copy()->startOfDay()) + 1;
                $tournament->duration_weeks = max(1, (int) ceil($days / 7));
            }
            $tournament->save();

            Game::where('tournament_id', $tournament->id)->delete();
            TournamentTeam::where('tournament_id', $tournament->id)->update(['group_code' => null]);

            foreach ($groups as $teamId => $groupCode) {
                TournamentTeam::where('tournament_id', $tournament->id)
                    ->where('team_id', $teamId)
                    ->update(['group_code' => $groupCode]);
            }

            foreach ($scheduled as $matchRow) {
                $row = $matchRow['row'];
                $slot = $matchRow['slot'];

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
            'matches_created' => count($planned),
            'schedule_window' => [
                'start_date' => $firstSlot?->toDateString(),
                'final_date' => $lastSlot?->toDateString(),
            ],
        ], 201);
    }

    private function planCfg(Tournament $tournament, array $data): array
    {
        $timeSlots = array_values(array_filter(
            $data['time_slots'] ?? $tournament->time_slots ?? ['12:00', '14:00', '16:00', '18:00'],
            fn (mixed $slot) => is_string($slot) && trim($slot) !== '',
        ));

        return [
            'end_date' => $data['end_date'] ?? $tournament->end_date,
            'venue_name' => $this->venueName($data['venue_name'] ?? $tournament->venue_name ?? null),
            'time_slots' => $timeSlots === [] ? ['12:00', '14:00', '16:00', '18:00'] : $timeSlots,
            'playoff_round_gap_days' => $data['playoff_round_gap_days'] ?? $tournament->playoff_round_gap_days ?? 1,
            'groups_to_playoffs_gap_days' => $data['groups_to_playoffs_gap_days'] ?? $tournament->groups_to_playoffs_gap_days ?? 1,
            'stage_day_gap_days' => $data['stage_day_gap_days'] ?? $tournament->stage_day_gap_days ?? 0,
            'group_games_per_day' => $data['group_games_per_day'] ?? $tournament->group_games_per_day,
            'group_size' => $data['group_size'] ?? $tournament->group_size ?? 4,
            'group_advance_count' => $data['group_advance_count'] ?? $tournament->group_advance_count ?? 2,
        ];
    }

    private function assignSlots(Tournament $tournament, array $planned, ?array $feasibility = null): array
    {
        $feasibility = $feasibility ?? SchedulingFeasibility::evaluate($tournament, count(array_unique(array_filter(array_merge(
            array_column($planned, 'home_team_id'),
            array_column($planned, 'away_team_id'),
        )))));

        $stageRows = [];
        $playoffRows = [];

        foreach ($planned as $row) {
            $round = (int) ($row['round_number'] ?? 1);
            if (($row['stage'] ?? null) === 'playoffs') {
                $playoffRows[$round][] = $row;
            } else {
                $stageRows[] = $row;
            }
        }

        usort($stageRows, function (array $left, array $right): int {
            return ((int) ($left['round_number'] ?? 1) <=> (int) ($right['round_number'] ?? 1))
                ?: ((int) ($left['seed'] ?? 0) <=> (int) ($right['seed'] ?? 0));
        });
        ksort($playoffRows);

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

        foreach ($stageRows as $i => $row) {
            if (!isset($stageSlots[$i])) {
                continue;
            }

            $scheduled[] = [
                'row' => $row,
                'slot' => $stageSlots[$i]['slot'],
            ];
        }

        foreach ($playoffRows as $round => $matches) {
            $roundDates = $feasibility['playoff_round_dates'][$round] ?? [];
            $roundDates = array_values($roundDates);
            $slots = [];

            foreach ($roundDates as $dateString) {
                $slots = array_merge(
                    $slots,
                    TournamentSchedulePlanner::daySlots(
                        $tournament,
                        Carbon::parse($dateString)->startOfDay(),
                        $round === max(array_keys($playoffRows)) ? 'desc' : 'asc',
                    ),
                );
            }

            foreach ($matches as $i => $row) {
                if (!isset($slots[$i])) {
                    continue;
                }

                $scheduled[] = [
                    'row' => $row,
                    'slot' => $slots[$i]['slot'],
                ];
            }
        }

        usort($scheduled, function (array $left, array $right) {
            return $left['slot']->getTimestamp() <=> $right['slot']->getTimestamp();
        });

        return $scheduled;
    }

    private function rrPairs(array $teamIds): array
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

    private function rrMatches(array $teamIds, ?Tournament $tournament = null): array
    {
        $rows = [];
        $byRound = $this->rrPairs($teamIds);
        foreach ($byRound as $roundNumber => $pairs) {
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

        $qualified = $this->rrPlayoffCount(count($teamIds), $tournament);
        if ($qualified < 2) {
            return $rows;
        }

        $rows = array_merge($rows, $this->playoffShell($qualified, 'RR'));

        return $rows;
    }

    private function koMatches(array $teamIds): array
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

        $matches = (int)($bracketSize / 2);
        for ($i = 0; $i < $matches; $i++) {
            $rows[] = [
                'home_team_id' => $seeded[$i * 2],
                'away_team_id' => $seeded[$i * 2 + 1],
                'stage' => 'playoffs',
                'group_code' => 'P1-' . ($i + 1),
                'round_number' => 1,
            ];
        }

        $round = 2;
        while ($matches > 1) {
            $matches = (int)($matches / 2);
            for ($i = 0; $i < $matches; $i++) {
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

    private function groupsMatches(array $teamIds, ?Tournament $tournament = null): array
    {
        $rows = [];
        $groupSize = max(2, (int) ($tournament?->group_size ?? 4));
        $groups = array_chunk(array_values($teamIds), $groupSize);

        foreach ($groups as $groupIndex => $groupTeams) {
            if (count($groupTeams) < 2) {
                continue;
            }

            $groupCode = chr(ord('A') + $groupIndex);
            $groupRounds = $this->rrPairs($groupTeams);

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

        $qualified = TournamentProgression::playoffQualifiedCountForTeamCount(
            count($teamIds),
            (int) ($tournament?->group_size ?? 4),
            (int) ($tournament?->group_advance_count ?? 2),
        );

        if ($qualified < 2) {
            return $rows;
        }

        return array_merge($rows, $this->playoffShell($qualified, 'GP'));
    }

    private function groupMap(array $teamIds, ?Tournament $tournament = null): array
    {
        $assignments = [];
        $groupSize = max(2, (int) ($tournament?->group_size ?? 4));
        foreach (array_chunk(array_values($teamIds), $groupSize) as $groupIndex => $groupTeams) {
            $groupCode = chr(ord('A') + $groupIndex);
            foreach ($groupTeams as $teamId) {
                $assignments[$teamId] = $groupCode;
            }
        }

        return $assignments;
    }

    private function rrPlayoffCount(int $teamCount, ?Tournament $tournament = null): int
    {
        return TournamentProgression::roundRobinPlayoffQualifiedCountForTeamCount(
            $teamCount,
            (int) ($tournament?->group_advance_count ?? 0),
        );
    }

    private function playoffShell(int $qualified, string $prefix): array
    {
        $rows = [];
        $matches = (int)($qualified / 2);
        $round = 1;

        while ($matches > 0) {
            for ($i = 0; $i < $matches; $i++) {
                $rows[] = [
                    'home_team_id' => null,
                    'away_team_id' => null,
                    'stage' => 'playoffs',
                    'group_code' => $prefix . $round . '-' . ($i + 1),
                    'round_number' => $round,
                ];
            }
            $matches = (int)($matches / 2);
            $round++;
        }

        return $rows;
    }

    private function venueName(?string $venueName): ?string
    {
        $name = trim((string) ($venueName ?? ''));
        return $name !== '' ? $name : null;
    }
}
