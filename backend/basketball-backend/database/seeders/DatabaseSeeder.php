<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $now = now();

        DB::table('users')->updateOrInsert(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Admin User',
                'password' => Hash::make('admin123'),
                'role' => 'admin',
                'updated_at' => $now,
                'created_at' => $now,
            ],
        );

        DB::table('users')->updateOrInsert(
            ['email' => 'manager@example.com'],
            [
                'name' => 'Manager User',
                'password' => Hash::make('manager123'),
                'role' => 'manager',
                'updated_at' => $now,
                'created_at' => $now,
            ],
        );

        $adminId = DB::table('users')->where('email', 'admin@example.com')->value('id');
        $teamIds = $this->seedDemoTeams();
        $playoffTeamIds = $this->seedPlayoffDemoTeams();

        $this->seedFinishedTournament($adminId, array_slice($teamIds, 0, 4));
        $this->seedScheduleTestTournament($adminId, $teamIds);
        $this->seedLiveGroupsPlayoffsTournament($adminId, $playoffTeamIds);
        $this->seedQualificationRaceTournament($adminId, array_slice($playoffTeamIds, 8, 8));
        $this->backfillTournamentBanners();
    }

    private function backfillTournamentBanners(): void
    {
        $banners = [
            'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1518063319789-7217e6706b04?auto=format&fit=crop&w=1200&q=80',
        ];

        DB::table('tournaments')
            ->whereNull('banner_url')
            ->orderBy('id')
            ->get(['id'])
            ->values()
            ->each(function ($tournament, $index) use ($banners): void {
                DB::table('tournaments')->where('id', $tournament->id)->update([
                    'banner_url' => $banners[$index % count($banners)],
                    'updated_at' => now(),
                ]);
            });
    }

    private function seedDemoTeams(): array
    {
        $teams = [
            ['name' => 'Kauno Tornadai', 'city' => 'Kaunas', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=KaunoTornadai'],
            ['name' => 'Vilniaus Perkunas', 'city' => 'Vilnius', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=VilniausPerkunas'],
            ['name' => 'Klaipedos Bangos', 'city' => 'Klaipeda', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=KlaipedosBangos'],
            ['name' => 'Siauliu Sauliai', 'city' => 'Siauliai', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=SiauliuSauliai'],
            ['name' => 'Panevezio Ezerai', 'city' => 'Panevezys', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=PanevezioEzerai'],
            ['name' => 'Alytaus Vilkai', 'city' => 'Alytus', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=AlytausVilkai'],
            ['name' => 'Marijampoles Stumbras', 'city' => 'Marijampole', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=MarijampolesStumbras'],
            ['name' => 'Utenos Auksas', 'city' => 'Utena', 'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=UtenosAuksas'],
        ];

        $teamIds = [];

        foreach ($teams as $index => $team) {
            $existingId = DB::table('teams')->where('name', $team['name'])->value('id');
            $teamId = $existingId ?: DB::table('teams')->insertGetId([
                'name' => $team['name'],
                'city' => $team['city'],
                'logo_url' => $team['logo_url'],
                'manager_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('teams')->where('id', $teamId)->update([
                'logo_url' => $team['logo_url'],
                'updated_at' => now(),
            ]);

            $teamIds[] = $teamId;
            $this->seedPlayersForTeam($teamId, $index);
        }

        return $teamIds;
    }

    private function seedPlayersForTeam(int $teamId, int $teamIndex): void
    {
        $firstNames = ['Mantas', 'Jonas', 'Tomas', 'Rokas', 'Lukas', 'Paulius', 'Domantas', 'Arnas'];
        $lastNames = ['Kazlauskas', 'Petraitis', 'Jankauskas', 'Stankus', 'Balciunas', 'Vaitkus', 'Urbonas', 'Zukauskas'];

        for ($i = 0; $i < 5; $i++) {
            $jersey = ($teamIndex + 1) * 10 + $i;
            $exists = DB::table('players')
                ->where('team_id', $teamId)
                ->where('jersey_number', $jersey)
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('players')->insert([
                'team_id' => $teamId,
                'first_name' => $firstNames[($teamIndex + $i) % count($firstNames)],
                'last_name' => $lastNames[($teamIndex * 2 + $i) % count($lastNames)],
                'photo_url' => 'https://randomuser.me/api/portraits/men/' . ((($teamIndex * 5 + $i) % 90) + 1) . '.jpg',
                'jersey_number' => $jersey,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('players')
            ->where('team_id', $teamId)
            ->whereNull('photo_url')
            ->orderBy('id')
            ->get(['id'])
            ->values()
            ->each(function ($player, $index) use ($teamIndex): void {
                DB::table('players')->where('id', $player->id)->update([
                    'photo_url' => 'https://randomuser.me/api/portraits/men/' . ((($teamIndex * 5 + $index) % 90) + 1) . '.jpg',
                    'updated_at' => now(),
                ]);
            });
    }

    private function seedPlayoffDemoTeams(): array
    {
        $teamIds = [];

        for ($teamNumber = 1; $teamNumber <= 16; $teamNumber++) {
            $name = 'Playoff Team ' . str_pad((string) $teamNumber, 2, '0', STR_PAD_LEFT);
            $existingId = DB::table('teams')->where('name', $name)->value('id');
            $teamId = $existingId ?: DB::table('teams')->insertGetId([
                'name' => $name,
                'city' => 'Demo City',
                'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=' . rawurlencode($name),
                'manager_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('teams')->where('id', $teamId)->update([
                'city' => 'Demo City',
                'logo_url' => 'https://api.dicebear.com/9.x/shapes/svg?seed=' . rawurlencode($name),
                'updated_at' => now(),
            ]);

            $teamIds[] = $teamId;
            $this->seedPlayoffPlayersForTeam($teamId, $teamNumber);
        }

        return $teamIds;
    }

    private function seedPlayoffPlayersForTeam(int $teamId, int $teamNumber): void
    {
        $firstNames = ['Arnas', 'Justas', 'Karolis', 'Aistis', 'Martynas', 'Lukas', 'Mantas', 'Jonas', 'Dovydas', 'Tomas', 'Nojus'];
        $lastNames = ['Kazlauskas', 'Jankunas', 'Petraitis', 'Valiulis', 'Grigonis', 'Sabonis', 'Mockevicius', 'Butkus', 'Misiunas', 'Brazdeikis', 'Lekavicius'];

        for ($index = 0; $index < 8; $index++) {
            $jersey = $index + 4;
            $exists = DB::table('players')
                ->where('team_id', $teamId)
                ->where('jersey_number', $jersey)
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('players')->insert([
                'team_id' => $teamId,
                'first_name' => $firstNames[($teamNumber + $index - 1) % count($firstNames)],
                'last_name' => $lastNames[($teamNumber + $index + 2) % count($lastNames)],
                'photo_url' => 'https://randomuser.me/api/portraits/men/' . (((($teamNumber - 1) * 8 + $index) % 90) + 1) . '.jpg',
                'jersey_number' => $jersey,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function seedFinishedTournament(?int $adminId, array $teamIds): void
    {
        $name = 'Demo: Finished Spring Cup';
        if (DB::table('tournaments')->where('name', $name)->exists()) {
            DB::table('tournaments')->where('name', $name)->update([
                'banner_url' => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
                'updated_at' => now(),
            ]);
            return;
        }

        $tournamentId = DB::table('tournaments')->insertGetId([
            'name' => $name,
            'banner_url' => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
            'start_date' => now()->subWeeks(3)->toDateString(),
            'end_date' => now()->subWeek()->toDateString(),
            'format' => 'round_robin',
            'status' => 'finished',
            'created_by' => $adminId,
            'max_teams' => 4,
            'duration_weeks' => 2,
            'allowed_days' => json_encode([1, 2, 3, 4, 5, 6, 7]),
            'time_slots' => json_encode(['12:00', '14:00', '16:00', '18:00']),
            'venues_count' => 2,
            'venue_names' => json_encode(['Main Court', 'Second Court']),
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 1,
            'group_games_per_day' => 4,
            'stage_day_gap_days' => 0,
            'registration_deadline' => now()->subWeeks(4)->toDateString(),
            'participants_locked' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ($teamIds as $index => $teamId) {
            DB::table('tournament_teams')->insert([
                'tournament_id' => $tournamentId,
                'team_id' => $teamId,
                'group_code' => null,
                'seed' => $index + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $scores = [
            [0, 1, 88, 74],
            [2, 3, 69, 76],
            [0, 2, 91, 84],
            [1, 3, 80, 77],
            [0, 3, 73, 79],
            [1, 2, 82, 75],
        ];

        foreach ($scores as $index => [$home, $away, $homeScore, $awayScore]) {
            DB::table('matches')->insert([
                'tournament_id' => $tournamentId,
                'home_team_id' => $teamIds[$home],
                'away_team_id' => $teamIds[$away],
                'venue_id' => null,
                'venue_slot' => ($index % 2) + 1,
                'stage' => 'group',
                'group_code' => null,
                'round_number' => intdiv($index, 2) + 1,
                'scheduled_at' => now()->subWeeks(3)->addDays($index * 2)->setTime(18, 0)->toDateTimeString(),
                'home_score' => $homeScore,
                'away_score' => $awayScore,
                'status' => 'finished',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function seedScheduleTestTournament(?int $adminId, array $teamIds): void
    {
        $name = 'Demo: Ready for Schedule Generation';
        if (DB::table('tournaments')->where('name', $name)->exists()) {
            DB::table('tournaments')->where('name', $name)->update([
                'banner_url' => 'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
                'updated_at' => now(),
            ]);
            return;
        }

        $tournamentId = DB::table('tournaments')->insertGetId([
            'name' => $name,
            'banner_url' => 'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
            'start_date' => now()->addWeek()->toDateString(),
            'end_date' => now()->addWeeks(4)->toDateString(),
            'format' => 'groups_playoffs',
            'status' => 'draft',
            'created_by' => $adminId,
            'max_teams' => 8,
            'duration_weeks' => 4,
            'allowed_days' => json_encode([1, 3, 5, 6]),
            'time_slots' => json_encode(['18:00', '20:00']),
            'venues_count' => 2,
            'venue_names' => json_encode(['Arena A', 'Arena B']),
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 2,
            'group_games_per_day' => 4,
            'stage_day_gap_days' => 1,
            'registration_deadline' => now()->addDays(3)->toDateString(),
            'participants_locked' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ($teamIds as $index => $teamId) {
            DB::table('tournament_teams')->insert([
                'tournament_id' => $tournamentId,
                'team_id' => $teamId,
                'group_code' => $index < 4 ? 'A' : 'B',
                'seed' => $index + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function seedLiveGroupsPlayoffsTournament(?int $adminId, array $teamIds): void
    {
        if (count($teamIds) < 16) {
            return;
        }

        $name = 'Demo: 16 Team Groups Playoffs Live';
        $tournamentId = DB::table('tournaments')->where('name', $name)->value('id');
        $payload = [
            'name' => $name,
            'banner_url' => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
            'start_date' => '2026-05-05',
            'end_date' => '2026-05-15',
            'format' => 'groups_playoffs',
            'status' => 'draft',
            'created_by' => $adminId,
            'max_teams' => 16,
            'duration_weeks' => 2,
            'allowed_days' => json_encode([1, 2, 3, 4, 5, 6, 7]),
            'time_slots' => json_encode(['12:00', '14:00', '16:00', '18:00']),
            'venues_count' => 1,
            'venue_names' => json_encode(['Main Court']),
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 0,
            'group_games_per_day' => 4,
            'stage_day_gap_days' => 0,
            'registration_deadline' => null,
            'participants_locked' => true,
            'updated_at' => now(),
        ];

        if ($tournamentId) {
            DB::table('tournaments')->where('id', $tournamentId)->update($payload);
        } else {
            $payload['created_at'] = now();
            $tournamentId = DB::table('tournaments')->insertGetId($payload);
        }

        $matchIds = DB::table('matches')->where('tournament_id', $tournamentId)->pluck('id');
        DB::table('match_player_stats')->whereIn('match_id', $matchIds)->delete();
        DB::table('matches')->where('tournament_id', $tournamentId)->delete();
        DB::table('tournament_team_players')->where('tournament_id', $tournamentId)->delete();
        DB::table('tournament_teams')->where('tournament_id', $tournamentId)->delete();

        $groups = array_chunk(array_slice($teamIds, 0, 16), 4);
        foreach ($groups as $groupIndex => $groupTeamIds) {
            $groupCode = chr(ord('A') + $groupIndex);
            foreach ($groupTeamIds as $seedIndex => $teamId) {
                DB::table('tournament_teams')->insert([
                    'tournament_id' => $tournamentId,
                    'team_id' => $teamId,
                    'group_code' => $groupCode,
                    'seed' => ($groupIndex * 4) + $seedIndex + 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                DB::table('players')
                    ->where('team_id', $teamId)
                    ->orderBy('jersey_number')
                    ->limit(8)
                    ->pluck('id')
                    ->each(function ($playerId) use ($tournamentId, $teamId): void {
                        DB::table('tournament_team_players')->insert([
                            'tournament_id' => $tournamentId,
                            'team_id' => $teamId,
                            'player_id' => $playerId,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    });
            }
        }

        $firstMatchId = DB::table('matches')->insertGetId([
            'tournament_id' => $tournamentId,
            'home_team_id' => $groups[0][0],
            'away_team_id' => $groups[0][3],
            'venue_id' => null,
            'venue_slot' => 1,
            'venue_name' => 'Main Court',
            'stage' => 'group',
            'group_code' => 'A',
            'round_number' => 1,
            'scheduled_at' => '2026-05-05 12:00:00',
            'home_score' => 86,
            'away_score' => 80,
            'status' => 'finished',
            'live_events' => json_encode($this->liveDemoEvents($groups[0][0], $groups[0][3], '2026-05-05 12:00:00')),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->seedLiveDemoBoxScore($firstMatchId, $groups[0][0], $groups[0][3]);
        $this->seedRemainingLiveDemoMatches($tournamentId, $groups);
    }

    private function seedQualificationRaceTournament(?int $adminId, array $teamIds): void
    {
        $teamIds = array_values($teamIds);

        if (count($teamIds) < 8) {
            return;
        }

        $name = 'Demo: Qualification Race';
        $tournamentId = DB::table('tournaments')->where('name', $name)->value('id');
        $payload = [
            'name' => $name,
            'banner_url' => 'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
            'start_date' => '2026-05-20',
            'end_date' => '2026-05-31',
            'format' => 'groups_playoffs',
            'status' => 'draft',
            'created_by' => $adminId,
            'max_teams' => 8,
            'duration_weeks' => 2,
            'allowed_days' => json_encode([1, 2, 3, 4, 5, 6, 7]),
            'time_slots' => json_encode(['12:00', '14:00', '16:00', '18:00']),
            'venues_count' => 1,
            'venue_names' => json_encode(['Main Court']),
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 1,
            'group_games_per_day' => 4,
            'stage_day_gap_days' => 0,
            'registration_deadline' => null,
            'participants_locked' => true,
            'updated_at' => now(),
        ];

        if ($tournamentId) {
            DB::table('tournaments')->where('id', $tournamentId)->update($payload);
        } else {
            $payload['created_at'] = now();
            $tournamentId = DB::table('tournaments')->insertGetId($payload);
        }

        $matchIds = DB::table('matches')->where('tournament_id', $tournamentId)->pluck('id');
        DB::table('match_player_stats')->whereIn('match_id', $matchIds)->delete();
        DB::table('matches')->where('tournament_id', $tournamentId)->delete();
        DB::table('tournament_team_players')->where('tournament_id', $tournamentId)->delete();
        DB::table('tournament_teams')->where('tournament_id', $tournamentId)->delete();

        foreach (array_values($teamIds) as $index => $teamId) {
            $groupCode = $index < 4 ? 'A' : 'B';
            DB::table('tournament_teams')->insert([
                'tournament_id' => $tournamentId,
                'team_id' => $teamId,
                'group_code' => $groupCode,
                'seed' => $index + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('players')
                ->where('team_id', $teamId)
                ->orderBy('jersey_number')
                ->limit(8)
                ->pluck('id')
                ->each(function ($playerId) use ($tournamentId, $teamId): void {
                    DB::table('tournament_team_players')->insert([
                        'tournament_id' => $tournamentId,
                        'team_id' => $teamId,
                        'player_id' => $playerId,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                });
        }

        $matches = [
            ['A', 1, 0, 1, '2026-05-20 12:00:00', 78, 72, 'finished'],
            ['A', 1, 2, 3, '2026-05-20 14:00:00', 77, 75, 'finished'],
            ['A', 2, 0, 2, '2026-05-21 12:00:00', 81, 76, 'finished'],
            ['A', 2, 1, 3, '2026-05-21 14:00:00', 74, 70, 'finished'],
            ['A', 3, 0, 3, '2026-05-22 12:00:00', 68, 70, 'finished'],
            ['A', 3, 1, 2, '2026-05-28 12:00:00', null, null, 'scheduled'],
            ['B', 1, 4, 5, '2026-05-20 16:00:00', 74, 70, 'finished'],
            ['B', 1, 6, 7, '2026-05-20 18:00:00', 79, 73, 'finished'],
            ['B', 2, 4, 6, '2026-05-21 16:00:00', 69, 67, 'finished'],
            ['B', 2, 5, 7, '2026-05-21 18:00:00', 83, 75, 'finished'],
            ['B', 3, 4, 7, '2026-05-22 14:00:00', 81, 88, 'finished'],
            ['B', 3, 5, 6, '2026-05-28 14:00:00', null, null, 'scheduled'],
        ];

        foreach ($matches as [$groupCode, $round, $homeIndex, $awayIndex, $scheduledAt, $homeScore, $awayScore, $status]) {
            DB::table('matches')->insert([
                'tournament_id' => $tournamentId,
                'home_team_id' => $teamIds[$homeIndex],
                'away_team_id' => $teamIds[$awayIndex],
                'venue_id' => null,
                'venue_slot' => 1,
                'venue_name' => 'Main Court',
                'stage' => 'group',
                'group_code' => $groupCode,
                'round_number' => $round,
                'scheduled_at' => $scheduledAt,
                'home_score' => $homeScore,
                'away_score' => $awayScore,
                'status' => $status,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $playoffRows = [
            [1, 'GP1-1', '2026-05-30 12:00:00'],
            [1, 'GP1-2', '2026-05-30 14:00:00'],
            [2, 'GP2-1', '2026-05-31 18:00:00'],
        ];

        foreach ($playoffRows as [$round, $groupCode, $scheduledAt]) {
            DB::table('matches')->insert([
                'tournament_id' => $tournamentId,
                'home_team_id' => null,
                'away_team_id' => null,
                'venue_id' => null,
                'venue_slot' => 1,
                'venue_name' => 'Main Court',
                'stage' => 'playoffs',
                'group_code' => $groupCode,
                'round_number' => $round,
                'scheduled_at' => $scheduledAt,
                'home_score' => null,
                'away_score' => null,
                'status' => 'scheduled',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        \App\Support\TournamentProgression::sync(\App\Models\Tournament::findOrFail($tournamentId));
    }

    private function seedRemainingLiveDemoMatches(int $tournamentId, array $groups): void
    {
        $pairings = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
        $slotIndex = 1;

        foreach ($groups as $groupIndex => $teamIds) {
            $groupCode = chr(ord('A') + $groupIndex);
            foreach ($pairings as $roundIndex => [$homeIndex, $awayIndex]) {
                if ($groupCode === 'A' && $homeIndex === 0 && $awayIndex === 3) {
                    continue;
                }

                $scheduledAt = now()
                    ->setDate(2026, 5, 5)
                    ->startOfDay()
                    ->addDays(intdiv($slotIndex, 4))
                    ->addHours(12 + (($slotIndex % 4) * 2));

                DB::table('matches')->insert([
                    'tournament_id' => $tournamentId,
                    'home_team_id' => $teamIds[$homeIndex],
                    'away_team_id' => $teamIds[$awayIndex],
                    'venue_id' => null,
                    'venue_slot' => 1,
                    'venue_name' => 'Main Court',
                    'stage' => 'group',
                    'group_code' => $groupCode,
                    'round_number' => $roundIndex + 1,
                    'scheduled_at' => $scheduledAt->toDateTimeString(),
                    'home_score' => null,
                    'away_score' => null,
                    'status' => 'scheduled',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $slotIndex++;
            }
        }
    }

    private function liveDemoEvents(int $homeTeamId, int $awayTeamId, string $scheduledAt): array
    {
        $home = DB::table('players')->where('team_id', $homeTeamId)->orderBy('jersey_number')->limit(8)->pluck('id')->values();
        $away = DB::table('players')->where('team_id', $awayTeamId)->orderBy('jersey_number')->limit(8)->pluck('id')->values();
        $p = [
            'h1' => $home[0], 'h2' => $home[1], 'h3' => $home[2], 'h4' => $home[3],
            'h5' => $home[4], 'h6' => $home[5], 'h7' => $home[6], 'h8' => $home[7],
            'a1' => $away[0], 'a2' => $away[1], 'a3' => $away[2], 'a4' => $away[3],
            'a5' => $away[4], 'a6' => $away[5], 'a7' => $away[6], 'a8' => $away[7],
        ];

        $events = [];
        $eventNo = 1;
        $baseTime = \Illuminate\Support\Carbon::parse($scheduledAt);
        $clock = fn (int $elapsed) => gmdate('i:s', max(0, 600 - $elapsed));
        $add = function (array $event) use (&$events, &$eventNo, $baseTime): void {
            $quarter = (int) $event['quarter'];
            $elapsed = (int) $event['elapsed'];
            $event['id'] = 'seed-live-' . str_pad((string) $eventNo, 3, '0', STR_PAD_LEFT);
            $event['createdAt'] = $baseTime->copy()->addSeconds((($quarter - 1) * 600) + $elapsed)->toIso8601String();
            $events[] = $event;
            $eventNo++;
        };
        $shot = function (int $q, int $e, string $side, int $player, int $points, bool $made, ?int $assist = null, ?int $rebound = null) use ($add, $clock): void {
            $add(array_filter([
                'type' => 'shot',
                'quarter' => $q,
                'clock' => $clock($e),
                'elapsed' => $e,
                'teamSide' => $side,
                'playerId' => $player,
                'points' => $points,
                'made' => $made,
                'assistPlayerId' => $assist,
                'reboundPlayerId' => $rebound,
            ], fn ($value) => $value !== null));
        };
        $ft = function (int $q, int $e, string $side, int $player, bool $made, ?int $rebound = null) use ($add, $clock): void {
            $add(array_filter([
                'type' => 'free_throw',
                'quarter' => $q,
                'clock' => $clock($e),
                'elapsed' => $e,
                'teamSide' => $side,
                'playerId' => $player,
                'made' => $made,
                'reboundPlayerId' => $rebound,
            ], fn ($value) => $value !== null));
        };
        $simple = fn (string $type, int $q, int $e, ?string $side, array $extra = []) => $add(array_merge([
            'type' => $type,
            'quarter' => $q,
            'clock' => $clock($e),
            'elapsed' => $e,
            'teamSide' => $side,
        ], $extra));

        $shot(1, 18, 'away', $p['a2'], 3, true, $p['a1']);
        $shot(1, 41, 'home', $p['h2'], 3, false, null, $p['a5']);
        $simple('rebound', 1, 45, 'away', ['playerId' => $p['a5']]);
        $shot(1, 70, 'away', $p['a1'], 3, true, $p['a3']);
        $simple('steal', 1, 95, 'away', ['playerId' => $p['a3'], 'turnoverPlayerId' => $p['h1']]);
        $shot(1, 101, 'away', $p['a3'], 2, true, $p['a3']);
        $shot(1, 130, 'home', $p['h1'], 2, true, $p['h5']);
        $shot(1, 156, 'away', $p['a4'], 2, true, $p['a2']);
        $simple('turnover', 1, 184, 'home', ['playerId' => $p['h4']]);
        $shot(1, 213, 'home', $p['h3'], 3, true, $p['h2']);
        $simple('block', 1, 239, 'home', ['blockerId' => $p['h6'], 'shooterId' => $p['a1'], 'shotPoints' => 2]);
        $shot(1, 263, 'home', $p['h5'], 2, true, $p['h1']);
        $shot(1, 292, 'away', $p['a6'], 3, false, null, $p['h5']);
        $shot(1, 318, 'home', $p['h2'], 2, true, $p['h3']);
        $shot(1, 345, 'home', $p['h1'], 3, true, $p['h2']);
        $simple('foul', 1, 372, 'away', ['playerId' => $p['a4']]);
        $ft(1, 377, 'home', $p['h1'], true);
        $ft(1, 381, 'home', $p['h1'], true);
        $shot(1, 418, 'away', $p['a1'], 2, true, $p['a5']);
        $simple('substitution', 1, 438, 'home', ['outPlayerId' => $p['h4'], 'inPlayerId' => $p['h7']]);
        $shot(1, 464, 'home', $p['h7'], 3, true, $p['h3']);
        $shot(1, 501, 'away', $p['a2'], 3, true, $p['a1']);
        $shot(1, 533, 'home', $p['h6'], 2, true, $p['h1']);
        $shot(1, 566, 'away', $p['a5'], 2, true, $p['a2']);
        $shot(1, 591, 'home', $p['h2'], 2, true, $p['h7']);
        $simple('quarter_end', 1, 600, null);

        $shot(2, 24, 'home', $p['h1'], 3, false, null, $p['a5']);
        $shot(2, 49, 'away', $p['a2'], 2, true, $p['a1']);
        $simple('foul', 2, 71, 'home', ['playerId' => $p['h5']]);
        $ft(2, 75, 'away', $p['a5'], false, $p['a5']);
        $simple('rebound', 2, 77, 'away', ['playerId' => $p['a5']]);
        $shot(2, 83, 'away', $p['a1'], 3, true, $p['a2']);
        $shot(2, 120, 'home', $p['h3'], 2, false, null, $p['a3']);
        $shot(2, 149, 'away', $p['a3'], 2, true, $p['a4']);
        $simple('turnover', 2, 178, 'home', ['playerId' => $p['h2']]);
        $shot(2, 206, 'away', $p['a6'], 2, true, $p['a1']);
        $shot(2, 236, 'home', $p['h7'], 3, false, null, $p['a7']);
        $shot(2, 261, 'away', $p['a4'], 3, true, $p['a2']);
        $simple('substitution', 2, 288, 'away', ['outPlayerId' => $p['a4'], 'inPlayerId' => $p['a8']]);
        $shot(2, 313, 'home', $p['h5'], 2, true, $p['h1']);
        $shot(2, 339, 'home', $p['h1'], 2, true, $p['h3']);
        $simple('steal', 2, 363, 'home', ['playerId' => $p['h2'], 'turnoverPlayerId' => $p['a8']]);
        $shot(2, 370, 'home', $p['h2'], 3, true, $p['h1']);
        $shot(2, 405, 'away', $p['a2'], 3, false, null, $p['h6']);
        $shot(2, 431, 'home', $p['h6'], 2, true, $p['h5']);
        $shot(2, 459, 'away', $p['a8'], 2, true, $p['a1']);
        $shot(2, 486, 'home', $p['h4'], 2, true, $p['h2']);
        $simple('block', 2, 516, 'away', ['blockerId' => $p['a5'], 'shooterId' => $p['h1'], 'shotPoints' => 2]);
        $shot(2, 539, 'away', $p['a1'], 2, true, $p['a3']);
        $ft(2, 561, 'home', $p['h3'], true);
        $ft(2, 565, 'home', $p['h3'], true);
        $shot(2, 589, 'away', $p['a3'], 2, true, $p['a2']);
        $simple('quarter_end', 2, 600, null);

        $simple('steal', 3, 20, 'home', ['playerId' => $p['h1'], 'turnoverPlayerId' => $p['a2']]);
        $shot(3, 29, 'home', $p['h2'], 3, true, $p['h1']);
        $shot(3, 58, 'away', $p['a1'], 3, false, null, $p['h5']);
        $shot(3, 83, 'home', $p['h1'], 2, true, $p['h5']);
        $shot(3, 112, 'away', $p['a2'], 2, false, null, $p['h6']);
        $shot(3, 139, 'home', $p['h3'], 3, true, $p['h2']);
        $shot(3, 170, 'away', $p['a4'], 3, false, null, $p['h3']);
        $shot(3, 198, 'home', $p['h5'], 2, true, $p['h1']);
        $shot(3, 226, 'home', $p['h1'], 3, true, $p['h2']);
        $simple('foul', 3, 248, 'away', ['playerId' => $p['a5']]);
        $ft(3, 253, 'home', $p['h6'], true);
        $shot(3, 281, 'away', $p['a3'], 2, true, $p['a1']);
        $shot(3, 308, 'home', $p['h4'], 2, true, $p['h3']);
        $shot(3, 336, 'away', $p['a1'], 3, true, $p['a2']);
        $shot(3, 365, 'home', $p['h7'], 2, false, null, $p['h7']);
        $simple('rebound', 3, 367, 'home', ['playerId' => $p['h7']]);
        $shot(3, 373, 'home', $p['h7'], 2, true, $p['h7']);
        $shot(3, 402, 'away', $p['a6'], 2, true, $p['a3']);
        $simple('turnover', 3, 427, 'home', ['playerId' => $p['h3']]);
        $shot(3, 449, 'away', $p['a2'], 3, true, $p['a4']);
        $shot(3, 482, 'home', $p['h1'], 2, true, $p['h5']);
        $shot(3, 511, 'away', $p['a5'], 2, true, $p['a1']);
        $shot(3, 540, 'home', $p['h2'], 2, true, $p['h1']);
        $ft(3, 568, 'away', $p['a3'], true);
        $ft(3, 572, 'away', $p['a3'], true);
        $shot(3, 594, 'home', $p['h8'], 2, true, $p['h4']);
        $simple('quarter_end', 3, 600, null);

        $shot(4, 22, 'away', $p['a2'], 3, true, $p['a1']);
        $shot(4, 51, 'home', $p['h5'], 2, false, null, $p['a5']);
        $shot(4, 77, 'away', $p['a4'], 2, true, $p['a2']);
        $shot(4, 108, 'home', $p['h1'], 3, true, $p['h2']);
        $shot(4, 139, 'away', $p['a1'], 2, true, $p['a3']);
        $simple('foul', 4, 166, 'home', ['playerId' => $p['h4']]);
        $ft(4, 171, 'away', $p['a1'], true);
        $ft(4, 175, 'away', $p['a1'], false, $p['h6']);
        $shot(4, 204, 'home', $p['h3'], 2, true, $p['h1']);
        $simple('block', 4, 232, 'home', ['blockerId' => $p['h6'], 'shooterId' => $p['a2'], 'shotPoints' => 3]);
        $shot(4, 257, 'home', $p['h2'], 3, true, $p['h1']);
        $shot(4, 285, 'away', $p['a3'], 2, true, $p['a2']);
        $shot(4, 312, 'home', $p['h6'], 2, true, $p['h5']);
        $shot(4, 340, 'away', $p['a5'], 2, true, $p['a1']);
        $simple('steal', 4, 366, 'away', ['playerId' => $p['a2'], 'turnoverPlayerId' => $p['h2']]);
        $shot(4, 374, 'away', $p['a2'], 3, true, $p['a2']);
        $shot(4, 408, 'home', $p['h7'], 2, true, $p['h3']);
        $shot(4, 438, 'away', $p['a1'], 2, false, null, $p['h5']);
        $shot(4, 448, 'away', $p['a2'], 3, true, $p['a1']);
        $shot(4, 456, 'away', $p['a1'], 2, true, $p['a3']);
        $shot(4, 466, 'home', $p['h4'], 2, true, $p['h1']);
        $shot(4, 472, 'home', $p['h1'], 2, true, $p['h2']);
        $shot(4, 486, 'home', $p['h2'], 3, true, $p['h1']);
        $shot(4, 496, 'away', $p['a8'], 2, true, $p['a3']);
        $shot(4, 504, 'away', $p['a3'], 3, true, $p['a2']);
        $simple('turnover', 4, 520, 'away', ['playerId' => $p['a4']]);
        $shot(4, 532, 'home', $p['h5'], 2, true, $p['h1']);
        $ft(4, 542, 'home', $p['h1'], true);
        $ft(4, 546, 'home', $p['h1'], true);
        $shot(4, 552, 'away', $p['a2'], 3, true, $p['a4']);
        $shot(4, 562, 'away', $p['a3'], 3, false, null, $p['h5']);
        $shot(4, 568, 'home', $p['h3'], 3, true, $p['h2']);
        $shot(4, 570, 'away', $p['a1'], 3, true, $p['a2']);
        $ft(4, 574, 'home', $p['h2'], true);
        $ft(4, 578, 'home', $p['h2'], true);
        $simple('quarter_end', 4, 600, null);

        return $events;
    }

    private function seedLiveDemoBoxScore(int $matchId, int $homeTeamId, int $awayTeamId): void
    {
        $home = DB::table('players')->where('team_id', $homeTeamId)->orderBy('jersey_number')->limit(8)->pluck('id')->values();
        $away = DB::table('players')->where('team_id', $awayTeamId)->orderBy('jersey_number')->limit(8)->pluck('id')->values();
        $rows = [
            [$home[0], $homeTeamId, 37, 2220, 22, 6, 8, 1, 0, 2, 8, 19, 2, 7, 4, 4, 3],
            [$home[1], $homeTeamId, 35, 2100, 20, 4, 6, 2, 0, 3, 7, 16, 4, 8, 2, 2, 4],
            [$home[2], $homeTeamId, 32, 1920, 13, 5, 5, 0, 0, 2, 4, 11, 2, 5, 3, 4, 3],
            [$home[3], $homeTeamId, 28, 1680, 8, 3, 2, 0, 0, 4, 4, 8, 0, 1, 0, 0, 2],
            [$home[4], $homeTeamId, 29, 1740, 8, 13, 4, 0, 0, 3, 4, 9, 0, 1, 0, 0, 1],
            [$home[5], $homeTeamId, 24, 1440, 7, 10, 2, 0, 3, 2, 3, 7, 0, 1, 1, 2, 1],
            [$home[6], $homeTeamId, 10, 600, 6, 4, 2, 0, 0, 1, 2, 6, 1, 3, 1, 2, 1],
            [$home[7], $homeTeamId, 5, 300, 2, 1, 1, 0, 0, 1, 1, 2, 0, 0, 0, 0, 0],
            [$away[0], $awayTeamId, 38, 2280, 21, 4, 8, 0, 0, 3, 8, 18, 3, 7, 2, 4, 2],
            [$away[1], $awayTeamId, 36, 2160, 20, 5, 7, 2, 0, 2, 7, 17, 4, 9, 2, 2, 3],
            [$away[2], $awayTeamId, 33, 1980, 13, 7, 4, 1, 0, 3, 5, 13, 0, 3, 3, 4, 2],
            [$away[3], $awayTeamId, 29, 1740, 9, 4, 3, 0, 0, 4, 4, 11, 1, 4, 0, 0, 4],
            [$away[4], $awayTeamId, 28, 1680, 7, 15, 2, 0, 1, 5, 3, 8, 0, 0, 1, 4, 2],
            [$away[5], $awayTeamId, 21, 1260, 7, 3, 2, 0, 0, 2, 3, 7, 1, 3, 0, 0, 1],
            [$away[6], $awayTeamId, 8, 480, 0, 3, 1, 0, 0, 1, 0, 3, 0, 2, 0, 0, 0],
            [$away[7], $awayTeamId, 7, 420, 3, 2, 1, 0, 0, 1, 1, 4, 0, 0, 1, 2, 2],
        ];

        foreach ($rows as $row) {
            [$playerId, $teamId, $minutes, $seconds, $points, $rebounds, $assists, $steals, $blocks, $fouls, $fgm, $fga, $tpm, $tpa, $ftm, $fta, $turnovers] = $row;
            DB::table('match_player_stats')->insert([
                'match_id' => $matchId,
                'player_id' => $playerId,
                'team_id' => $teamId,
                'minutes' => $minutes,
                'played_seconds' => $seconds,
                'dnp' => false,
                'fouled_out' => $fouls >= 5,
                'points' => $points,
                'rebounds' => $rebounds,
                'assists' => $assists,
                'steals' => $steals,
                'blocks' => $blocks,
                'fouls' => $fouls,
                'turnovers' => $turnovers,
                'fgm' => $fgm,
                'fga' => $fga,
                'tpm' => $tpm,
                'tpa' => $tpa,
                'ftm' => $ftm,
                'fta' => $fta,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}
