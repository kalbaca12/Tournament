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

        $this->seedFinishedTournament($adminId, array_slice($teamIds, 0, 4));
        $this->seedScheduleTestTournament($adminId, $teamIds);
    }

    private function seedDemoTeams(): array
    {
        $teams = [
            ['name' => 'Kauno Tornadai', 'city' => 'Kaunas'],
            ['name' => 'Vilniaus Perkunas', 'city' => 'Vilnius'],
            ['name' => 'Klaipedos Bangos', 'city' => 'Klaipeda'],
            ['name' => 'Siauliu Sauliai', 'city' => 'Siauliai'],
            ['name' => 'Panevezio Ezerai', 'city' => 'Panevezys'],
            ['name' => 'Alytaus Vilkai', 'city' => 'Alytus'],
            ['name' => 'Marijampoles Stumbras', 'city' => 'Marijampole'],
            ['name' => 'Utenos Auksas', 'city' => 'Utena'],
        ];

        $teamIds = [];

        foreach ($teams as $index => $team) {
            $existingId = DB::table('teams')->where('name', $team['name'])->value('id');
            $teamId = $existingId ?: DB::table('teams')->insertGetId([
                'name' => $team['name'],
                'city' => $team['city'],
                'manager_id' => null,
                'created_at' => now(),
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
            return;
        }

        $tournamentId = DB::table('tournaments')->insertGetId([
            'name' => $name,
            'start_date' => now()->subWeeks(3)->toDateString(),
            'end_date' => now()->subWeek()->toDateString(),
            'format' => 'round_robin',
            'status' => 'finished',
            'created_by' => $adminId,
            'max_teams' => 4,
            'duration_weeks' => 2,
            'allowed_days' => json_encode([1, 2, 3, 4, 5, 6, 7]),
            'time_slots' => json_encode(['12:00', '14:00', '16:00']),
            'venues_count' => 2,
            'venue_names' => json_encode(['Main Court', 'Second Court']),
            'playoff_round_gap_days' => 1,
            'groups_to_playoffs_gap_days' => 1,
            'group_games_per_day' => 4,
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
            return;
        }

        $tournamentId = DB::table('tournaments')->insertGetId([
            'name' => $name,
            'start_date' => now()->addWeek()->toDateString(),
            'end_date' => now()->addWeeks(4)->toDateString(),
            'format' => 'groups_playoffs',
            'status' => 'published',
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
}
