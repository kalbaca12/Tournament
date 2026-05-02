<?php

namespace Tests\Unit;

use App\Models\Tournament;
use App\Support\TournamentSchedulePlanner;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TournamentSchedulePlannerTest extends TestCase
{
    #[Test]
    public function plan_reports_missing_final_date_and_invalid_playing_days(): void
    {
        $tournament = new Tournament([
            'format' => 'single_elimination',
            'allowed_days' => [0, 8],
            'time_slots' => ['12:00'],
            'venues_count' => 1,
        ]);

        $plan = TournamentSchedulePlanner::plan($tournament, 4);

        self::assertFalse($plan['is_feasible']);
        self::assertContains('Final date is required.', $plan['issues']);
        self::assertContains('Select at least one allowed playing day.', $plan['issues']);
        self::assertSame(3, $plan['required_matches']);
    }

    #[Test]
    public function day_slots_respect_time_direction_venue_count_and_limit(): void
    {
        $tournament = new Tournament([
            'time_slots' => ['10:00', '12:00', '14:00'],
            'venues_count' => 2,
        ]);

        $slots = TournamentSchedulePlanner::daySlots(
            $tournament,
            Carbon::parse('2026-04-19'),
            'desc',
            3,
        );

        self::assertCount(3, $slots);
        self::assertSame('14:00', $slots[0]['slot']->format('H:i'));
        self::assertSame(1, $slots[0]['venue_slot']);
        self::assertSame('14:00', $slots[1]['slot']->format('H:i'));
        self::assertSame(2, $slots[1]['venue_slot']);
        self::assertSame('12:00', $slots[2]['slot']->format('H:i'));
    }

    #[Test]
    public function stage_matches_per_day_is_limited_by_daily_slot_capacity(): void
    {
        $tournament = new Tournament([
            'time_slots' => ['10:00', '12:00'],
            'venues_count' => 2,
            'group_games_per_day' => 10,
        ]);

        self::assertSame(4, TournamentSchedulePlanner::slotCapacity($tournament));
        self::assertSame(4, TournamentSchedulePlanner::stageMatchesPerDay($tournament));
    }

    #[Test]
    public function round_robin_stage_round_sizes_handle_odd_team_count(): void
    {
        $sizes = TournamentSchedulePlanner::stageRoundSizes('round_robin', 5);

        self::assertSame([2, 2, 2, 2, 2], $sizes);
    }

    #[Test]
    public function playoff_round_sizes_are_calculated_for_supported_formats(): void
    {
        self::assertSame([4, 2, 1], TournamentSchedulePlanner::playoffRoundSizes('single_elimination', 8));
        self::assertSame([4, 2, 1], TournamentSchedulePlanner::playoffRoundSizes('groups_playoffs', 10));
        self::assertSame([2, 1], TournamentSchedulePlanner::playoffRoundSizes('round_robin', 8));
        self::assertSame([], TournamentSchedulePlanner::playoffRoundSizes('round_robin', 3));
    }

    #[Test]
    public function single_elimination_plan_is_feasible_with_valid_calendar_settings(): void
    {
        $tournament = new Tournament([
            'format' => 'single_elimination',
            'end_date' => '2026-04-19',
            'allowed_days' => [1, 2, 3, 4, 5, 6, 7],
            'time_slots' => ['12:00', '14:00'],
            'venues_count' => 1,
            'playoff_round_gap_days' => 1,
        ]);

        $plan = TournamentSchedulePlanner::plan($tournament, 4);

        self::assertTrue($plan['is_feasible']);
        self::assertSame(3, $plan['required_matches']);
        self::assertSame(0, $plan['stage_match_count']);
        self::assertSame(3, $plan['playoff_match_count']);
        self::assertSame('2026-04-19', $plan['final_date']);
        self::assertSame(['2026-04-17'], $plan['playoff_round_dates'][1]);
        self::assertSame(['2026-04-19'], $plan['playoff_round_dates'][2]);
    }

    #[Test]
    public function plan_reports_not_enough_calendar_days_for_large_playoff_bracket(): void
    {
        $tournament = new Tournament([
            'format' => 'single_elimination',
            'end_date' => '2026-04-19',
            'allowed_days' => [1, 2, 3, 4, 5, 6, 7],
            'time_slots' => ['18:00'],
            'venues_count' => 1,
            'playoff_round_gap_days' => 1,
        ]);

        $plan = TournamentSchedulePlanner::plan($tournament, 8192);

        self::assertFalse($plan['is_feasible']);
        self::assertContains('Could not find enough calendar days for playoff rounds.', $plan['issues']);
        self::assertSame(8191, $plan['playoff_match_count']);
    }

    #[Test]
    public function empty_time_slots_fall_back_to_default_daily_capacity(): void
    {
        $tournament = new Tournament([
            'time_slots' => ['', null],
            'venues_count' => 2,
        ]);

        self::assertSame(8, TournamentSchedulePlanner::slotCapacity($tournament));
        self::assertSame(8, TournamentSchedulePlanner::stageMatchesPerDay($tournament));
    }

    #[Test]
    public function groups_playoffs_stage_round_sizes_are_aggregated_by_groups(): void
    {
        self::assertSame([4, 4, 4], TournamentSchedulePlanner::stageRoundSizes('groups_playoffs', 8));
        self::assertSame([], TournamentSchedulePlanner::stageRoundSizes('single_elimination', 8));
        self::assertSame([], TournamentSchedulePlanner::stageRoundSizes('round_robin', 1));
    }
}
