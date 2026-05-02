<?php

namespace Tests\Unit;

use App\Models\Game;
use App\Models\MatchPlayerStat;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\PdfExportBuilder;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class PdfExportBuilderTest extends TestCase
{
    #[Test]
    public function match_export_returns_pdf_binary(): void
    {
        $tournament = new Tournament([
            'id' => 9,
            'name' => 'Spring Cup',
        ]);

        $homeTeam = new Team([
            'id' => 1,
            'name' => 'Wolves',
        ]);

        $awayTeam = new Team([
            'id' => 2,
            'name' => 'Falcons',
        ]);

        $game = new Game([
            'id' => 15,
            'tournament_id' => 9,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'round_number' => 3,
            'scheduled_at' => '2026-04-18 18:30:00',
            'status' => 'finished',
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $game->setRelation('tournament', $tournament);
        $game->setRelation('homeTeam', $homeTeam);
        $game->setRelation('awayTeam', $awayTeam);

        $player = new Player([
            'id' => 10,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
        ]);

        $stat = new MatchPlayerStat([
            'id' => 1,
            'player_id' => 10,
            'team_id' => 1,
            'points' => 24,
            'rebounds' => 8,
            'assists' => 5,
            'steals' => 2,
            'blocks' => 1,
            'fouls' => 3,
        ]);
        $stat->setRelation('player', $player);

        $game->setRelation('stats', collect([$stat]));

        $pdf = PdfExportBuilder::match($game);

        self::assertStringStartsWith('%PDF-1.4', $pdf);
        self::assertStringContainsString('/Type /Catalog', $pdf);
        self::assertStringContainsString('Match Export', $pdf);
        self::assertStringContainsString('Wolves vs Falcons', $pdf);
    }

    #[Test]
    public function match_export_can_limit_rendered_sections(): void
    {
        $tournament = new Tournament([
            'id' => 9,
            'name' => 'Spring Cup',
        ]);

        $homeTeam = new Team([
            'id' => 1,
            'name' => 'Wolves',
        ]);

        $awayTeam = new Team([
            'id' => 2,
            'name' => 'Falcons',
        ]);

        $game = new Game([
            'id' => 15,
            'tournament_id' => 9,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'round_number' => 3,
            'scheduled_at' => '2026-04-18 18:30:00',
            'status' => 'finished',
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $game->setRelation('tournament', $tournament);
        $game->setRelation('homeTeam', $homeTeam);
        $game->setRelation('awayTeam', $awayTeam);

        $player = new Player([
            'id' => 10,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
        ]);

        $stat = new MatchPlayerStat([
            'id' => 1,
            'player_id' => 10,
            'team_id' => 1,
            'points' => 24,
            'rebounds' => 8,
            'assists' => 5,
            'steals' => 2,
            'blocks' => 1,
            'fouls' => 3,
        ]);
        $stat->setRelation('player', $player);

        $game->setRelation('stats', collect([$stat]));

        $pdf = PdfExportBuilder::match($game, ['leaders']);

        self::assertStringContainsString('Match Leaders', $pdf);
        self::assertStringNotContainsString('Team Box Scores', $pdf);
        self::assertStringNotContainsString('Recorded Players', $pdf);
    }

    #[Test]
    public function match_export_with_requested_stat_sections_handles_empty_stats(): void
    {
        $game = new Game([
            'id' => 16,
            'tournament_id' => 9,
            'home_team_id' => 1,
            'away_team_id' => 2,
            'scheduled_at' => '2026-04-18 19:00:00',
            'status' => 'scheduled',
        ]);
        $game->setRelation('tournament', new Tournament(['id' => 9, 'name' => 'Spring Cup']));
        $game->setRelation('homeTeam', new Team(['id' => 1, 'name' => 'Wolves']));
        $game->setRelation('awayTeam', new Team(['id' => 2, 'name' => 'Falcons']));
        $game->setRelation('stats', collect());

        $pdf = PdfExportBuilder::match($game, ['players']);

        self::assertStringStartsWith('%PDF-1.4', $pdf);
        self::assertStringContainsString('No player stats are saved for this match yet.', $pdf);
    }

    #[Test]
    public function team_stat_tables_group_players_by_team_and_calculate_totals(): void
    {
        $game = new Game([
            'home_team_id' => 1,
            'away_team_id' => 2,
            'home_score' => 81,
            'away_score' => 77,
        ]);
        $game->setRelation('homeTeam', new Team(['id' => 1, 'name' => 'Wolves']));
        $game->setRelation('awayTeam', new Team(['id' => 2, 'name' => 'Falcons']));

        $homePlayer = new Player([
            'id' => 10,
            'first_name' => 'Jonas',
            'last_name' => 'Stone',
            'jersey_number' => 12,
        ]);

        $awayPlayer = new Player([
            'id' => 11,
            'first_name' => 'Mantas',
            'last_name' => 'Lake',
            'jersey_number' => 8,
        ]);

        $homeStat = new MatchPlayerStat([
            'player_id' => 10,
            'team_id' => 1,
            'points' => 24,
            'rebounds' => 8,
            'assists' => 5,
            'steals' => 2,
            'blocks' => 1,
            'fouls' => 3,
            'fgm' => 9,
            'fga' => 15,
            'tpm' => 2,
            'tpa' => 5,
            'ftm' => 4,
            'fta' => 6,
        ]);
        $homeStat->setRelation('player', $homePlayer);

        $awayStat = new MatchPlayerStat([
            'player_id' => 11,
            'team_id' => 2,
            'points' => 18,
            'rebounds' => 6,
            'assists' => 7,
            'steals' => 1,
            'blocks' => 0,
            'fouls' => 2,
            'fgm' => 7,
            'fga' => 13,
            'tpm' => 1,
            'tpa' => 4,
            'ftm' => 3,
            'fta' => 4,
        ]);
        $awayStat->setRelation('player', $awayPlayer);

        $tables = $this->invokePdfMethod('teamStatTables', [$game, collect([$homeStat, $awayStat])]);

        self::assertSame('Wolves', $tables[0]['team_name']);
        self::assertSame('#12 Jonas Stone', $tables[0]['rows'][0]['player']);
        self::assertSame(24, $tables[0]['footer']['points']);
        self::assertSame(8, $tables[0]['footer']['rebounds']);
        self::assertSame(9, $tables[0]['footer']['fgm']);

        self::assertSame('Falcons', $tables[1]['team_name']);
        self::assertSame('#8 Mantas Lake', $tables[1]['rows'][0]['player']);
        self::assertSame(18, $tables[1]['footer']['points']);
        self::assertSame(7, $tables[1]['footer']['assists']);
    }

    #[Test]
    public function helper_formatters_return_safe_display_values(): void
    {
        self::assertSame('Single Elimination', $this->invokePdfMethod('labelize', ['single_elimination']));
        self::assertSame('N/A', $this->invokePdfMethod('labelize', [null]));
        self::assertSame('N/A', $this->invokePdfMethod('safeValue', ['']));
        self::assertSame('2026-04-18 18:30', $this->invokePdfMethod('formatDateTime', ['2026-04-18 18:30:00']));
        self::assertSame('18:30', $this->invokePdfMethod('timeOnly', ['2026-04-18 18:30:00']));
        self::assertSame('Final', $this->invokePdfMethod('roundLabel', [1]));
        self::assertSame('Quarterfinals', $this->invokePdfMethod('roundLabel', [4]));
    }

    #[Test]
    public function split_tournament_matches_separates_day_matches_and_playoff_rounds(): void
    {
        $tournament = new Tournament(['id' => 9]);
        $groupMatch = new Game([
            'stage' => 'group',
            'round_number' => 1,
            'scheduled_at' => '2026-04-18 18:30:00',
        ]);
        $groupMatch->id = 2;
        $playoffMatch = new Game([
            'stage' => 'playoffs',
            'round_number' => 2,
            'scheduled_at' => '2026-04-19 20:30:00',
        ]);
        $playoffMatch->id = 1;
        $unscheduledMatch = new Game([
            'stage' => 'group',
            'round_number' => 3,
            'scheduled_at' => null,
        ]);
        $unscheduledMatch->id = 3;
        $tournament->setRelation('matches', collect([$playoffMatch, $unscheduledMatch, $groupMatch]));

        [$dayMatches, $playoffRounds] = $this->invokePdfMethod('splitTournamentMatches', [$tournament]);

        self::assertArrayHasKey('2026-04-18', $dayMatches);
        self::assertArrayHasKey('Unscheduled', $dayMatches);
        self::assertSame(2, $dayMatches['2026-04-18'][0]->id);
        self::assertSame(1, $playoffRounds[2][0]->id);
    }

    #[Test]
    public function match_leaders_select_top_players_per_stat_category(): void
    {
        $game = new Game([
            'home_team_id' => 1,
            'away_team_id' => 2,
        ]);
        $game->setRelation('homeTeam', new Team(['id' => 1, 'name' => 'Wolves']));
        $game->setRelation('awayTeam', new Team(['id' => 2, 'name' => 'Falcons']));

        $scorer = new Player(['first_name' => 'Jonas', 'last_name' => 'Stone']);
        $rebounder = new Player(['first_name' => 'Mantas', 'last_name' => 'Lake']);

        $homeStat = new MatchPlayerStat([
            'player_id' => 10,
            'team_id' => 1,
            'points' => 30,
            'rebounds' => 5,
            'assists' => 2,
            'steals' => 1,
            'blocks' => 0,
        ]);
        $homeStat->setRelation('player', $scorer);

        $awayStat = new MatchPlayerStat([
            'player_id' => 11,
            'team_id' => 2,
            'points' => 12,
            'rebounds' => 14,
            'assists' => 9,
            'steals' => 3,
            'blocks' => 2,
        ]);
        $awayStat->setRelation('player', $rebounder);

        $leaders = $this->invokePdfMethod('matchLeaders', [$game, collect([$homeStat, $awayStat])]);

        self::assertSame('Points', $leaders[0]['category']);
        self::assertSame('Jonas Stone', $leaders[0]['player']);
        self::assertSame('30', $leaders[0]['value']);
        self::assertSame('Rebounds', $leaders[1]['category']);
        self::assertSame('Mantas Lake', $leaders[1]['player']);
        self::assertSame('Falcons', $leaders[1]['team']);
    }

    #[Test]
    public function playoff_helpers_format_participants_winners_scores_and_sections(): void
    {
        $game = new Game([
            'home_team_id' => null,
            'away_team_id' => 5,
            'home_score' => 88,
            'away_score' => 91,
        ]);
        $game->setRelation('homeTeam', null);
        $game->setRelation('awayTeam', null);

        self::assertSame('Winner of Semifinals 1', $this->invokePdfMethod('playoffParticipantName', [
            $game,
            'home',
            [1 => 2],
            2,
            0,
        ]));
        self::assertSame('Team 5', $this->invokePdfMethod('playoffParticipantName', [
            $game,
            'away',
            [1 => 2],
            2,
            0,
        ]));
        self::assertFalse($this->invokePdfMethod('isWinner', [$game, 'home']));
        self::assertTrue($this->invokePdfMethod('isWinner', [$game, 'away']));
        self::assertSame('88-91', $this->invokePdfMethod('resultLabel', [$game]));
        self::assertSame('-', $this->invokePdfMethod('scoreDisplay', [null]));
        self::assertSame(['leaders'], $this->invokePdfMethod('normalizeSections', [
            ['leaders', 'unknown', 'LEADERS'],
            ['players', 'leaders'],
        ]));
    }

    #[Test]
    public function tournament_and_match_display_helpers_use_fallback_values(): void
    {
        $tournament = new Tournament([
            'format' => 'round_robin',
            'status' => 'draft',
            'start_date' => null,
            'end_date' => '2026-04-19',
        ]);

        $game = new Game([
            'home_team_id' => null,
            'away_team_id' => 7,
            'home_score' => null,
            'away_score' => null,
        ]);
        $game->setRelation('homeTeam', null);
        $game->setRelation('awayTeam', null);

        self::assertSame('Round Robin | Draft | N/A | 2026-04-19', $this->invokePdfMethod('tournamentSubtitle', [$tournament]));
        self::assertSame('Team N/A', $this->invokePdfMethod('teamName', [$game, 'home']));
        self::assertSame('Team 7', $this->invokePdfMethod('teamName', [$game, 'away']));
        self::assertSame('Not recorded', $this->invokePdfMethod('resultLabel', [$game]));
        self::assertSame('not-a-date', $this->invokePdfMethod('formatDateTime', ['not-a-date']));
        self::assertSame('TBD', $this->invokePdfMethod('timeOnly', [null]));
        self::assertSame('Round (3 matches)', $this->invokePdfMethod('roundLabel', [3]));
    }

    private function invokePdfMethod(string $method, array $args): mixed
    {
        $invoker = \Closure::bind(
            function (string $method, array $args): mixed {
                return self::{$method}(...$args);
            },
            null,
            PdfExportBuilder::class,
        );

        return $invoker($method, $args);
    }
}
