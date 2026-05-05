<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\ScheduleController;
use App\Models\Tournament;
use App\Support\SchedulingFeasibility;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ScheduleControllerTest extends TestCase
{
    #[Test]
    public function four_team_groups_playoffs_creates_only_a_final_after_group_stage(): void
    {
        $controller = new ScheduleController();
        $plannedMatches = $this->invokeControllerMethod($controller, 'buildGroupsPlayoffsMatches', range(1, 4));

        $groupMatches = array_values(array_filter($plannedMatches, fn (array $row) => ($row['stage'] ?? null) === 'group'));
        $playoffMatches = array_values(array_filter($plannedMatches, fn (array $row) => ($row['stage'] ?? null) === 'playoffs'));

        self::assertCount(6, $groupMatches);
        self::assertCount(1, $playoffMatches);
        self::assertSame(1, $playoffMatches[0]['round_number']);
    }

    #[Test]
    public function groups_playoffs_stage_days_are_spread_out_and_finish_before_playoffs(): void
    {
        $controller = new ScheduleController();
        $tournament = new Tournament([
            'format' => 'groups_playoffs',
            'end_date' => '2026-04-19',
            'allowed_days' => [1, 2, 3, 4, 5, 6, 7],
            'time_slots' => ['12:00', '14:00', '16:00', '18:00'],
            'venue_name' => 'Main Arena',
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 1,
            'stage_day_gap_days' => 1,
            'group_games_per_day' => 4,
        ]);

        $plannedMatches = $this->invokeControllerMethod($controller, 'buildGroupsPlayoffsMatches', range(1, 8));
        $feasibility = SchedulingFeasibility::evaluate($tournament, 8);
        $scheduledMatches = $this->invokeControllerMethod($controller, 'assignMatchesToSlots', $tournament, $plannedMatches, $feasibility, []);

        $teamOneGroupGames = array_values(array_filter(
            $scheduledMatches,
            fn (array $scheduledMatch) => ($scheduledMatch['row']['stage'] ?? null) === 'group'
                && in_array(1, [
                    $scheduledMatch['row']['home_team_id'] ?? null,
                    $scheduledMatch['row']['away_team_id'] ?? null,
                ], true)
        ));

        $dates = array_values(array_unique(array_map(
            fn (array $scheduledMatch) => $scheduledMatch['slot']->toDateString(),
            $teamOneGroupGames
        )));
        sort($dates);

        $groupStageTimestamps = array_map(
            fn (array $scheduledMatch) => $scheduledMatch['slot']->getTimestamp(),
            array_filter($scheduledMatches, fn (array $scheduledMatch) => ($scheduledMatch['row']['stage'] ?? null) === 'group')
        );
        $playoffTimestamps = array_map(
            fn (array $scheduledMatch) => $scheduledMatch['slot']->getTimestamp(),
            array_filter($scheduledMatches, fn (array $scheduledMatch) => ($scheduledMatch['row']['stage'] ?? null) === 'playoffs')
        );

        self::assertCount(3, $teamOneGroupGames);
        self::assertSame(['2026-04-11', '2026-04-13', '2026-04-15'], $dates);
        self::assertNotEmpty($groupStageTimestamps);
        self::assertNotEmpty($playoffTimestamps);
        self::assertLessThan(min($playoffTimestamps), max($groupStageTimestamps));
    }

    #[Test]
    public function stage_generation_respects_the_configured_games_per_day_limit(): void
    {
        $controller = new ScheduleController();
        $tournament = new Tournament([
            'format' => 'groups_playoffs',
            'end_date' => '2026-04-19',
            'allowed_days' => [1, 2, 3, 4, 5, 6, 7],
            'time_slots' => ['12:00', '14:00', '16:00', '18:00'],
            'venue_name' => 'Main Arena',
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 1,
            'group_games_per_day' => 2,
        ]);

        $plannedMatches = $this->invokeControllerMethod($controller, 'buildGroupsPlayoffsMatches', range(1, 8));
        $feasibility = SchedulingFeasibility::evaluate($tournament, 8);
        $scheduledMatches = $this->invokeControllerMethod($controller, 'assignMatchesToSlots', $tournament, $plannedMatches, $feasibility, []);

        $matchesByDate = [];
        foreach ($scheduledMatches as $scheduledMatch) {
            if (($scheduledMatch['row']['stage'] ?? null) !== 'group') {
                continue;
            }

            $date = $scheduledMatch['slot']->toDateString();
            $matchesByDate[$date] = ($matchesByDate[$date] ?? 0) + 1;
        }

        self::assertNotEmpty($matchesByDate);
        foreach ($matchesByDate as $count) {
            self::assertLessThanOrEqual(2, $count);
        }
        self::assertSame(6, count($matchesByDate));
    }

    #[Test]
    public function stage_generation_packs_multiple_rounds_into_daily_capacity(): void
    {
        $controller = new ScheduleController();
        $tournament = new Tournament([
            'format' => 'groups_playoffs',
            'end_date' => '2026-05-24',
            'allowed_days' => [1, 2, 3, 4, 5, 6, 7],
            'time_slots' => ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'],
            'venue_name' => 'Arena A',
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 1,
            'stage_day_gap_days' => 0,
            'group_games_per_day' => 8,
        ]);

        $plannedMatches = $this->invokeControllerMethod($controller, 'buildGroupsPlayoffsMatches', range(1, 8));
        $feasibility = SchedulingFeasibility::evaluate($tournament, 8);
        $scheduledMatches = $this->invokeControllerMethod($controller, 'assignMatchesToSlots', $tournament, $plannedMatches, $feasibility, []);

        $matchesByDate = [];
        foreach ($scheduledMatches as $scheduledMatch) {
            if (($scheduledMatch['row']['stage'] ?? null) !== 'group') {
                continue;
            }

            $date = $scheduledMatch['slot']->toDateString();
            $matchesByDate[$date] = ($matchesByDate[$date] ?? 0) + 1;
        }

        self::assertSame([8, 4], array_values($matchesByDate));
    }

    #[Test]
    public function single_elimination_keeps_the_final_on_the_selected_final_day(): void
    {
        $controller = new ScheduleController();
        $tournament = new Tournament([
            'format' => 'single_elimination',
            'end_date' => '2026-04-19',
            'allowed_days' => [1, 2, 3, 4, 5, 6, 7],
            'time_slots' => ['12:00', '14:00', '16:00', '18:00'],
            'venue_name' => 'Main Arena',
            'playoff_round_gap_days' => 2,
        ]);

        $plannedMatches = $this->invokeControllerMethod($controller, 'buildSingleEliminationMatches', range(1, 4));
        $feasibility = SchedulingFeasibility::evaluate($tournament, 4);
        $scheduledMatches = $this->invokeControllerMethod($controller, 'assignMatchesToSlots', $tournament, $plannedMatches, $feasibility, []);

        $roundDates = [];
        foreach ($scheduledMatches as $scheduledMatch) {
            $round = (int) ($scheduledMatch['row']['round_number'] ?? 1);
            $roundDates[$round][] = $scheduledMatch['slot']->toDateString();
        }

        self::assertSame(['2026-04-19'], array_values(array_unique($roundDates[2] ?? [])));
        self::assertSame(['2026-04-16'], array_values(array_unique($roundDates[1] ?? [])));
    }

    private function invokeControllerMethod(ScheduleController $controller, string $method, mixed ...$args): mixed
    {
        $invoker = \Closure::bind(
            function (string $method, array $args): mixed {
                return $this->{$method}(...$args);
            },
            $controller,
            $controller,
        );

        return $invoker($method, $args);
    }
}
