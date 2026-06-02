<?php

namespace Database\Seeders;

use App\Models\Tournament;
use App\Support\TournamentProgression;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    private const ADMIN_EMAIL = 'admin@example.com';
    private const MANAGER_EMAIL = 'manager@example.com';

    public function run(): void
    {
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        DB::table('match_player_stats')->truncate();
        DB::table('tournament_team_players')->truncate();
        DB::table('tournament_participation_requests')->truncate();
        DB::table('tournament_teams')->truncate();
        DB::table('matches')->truncate();
        DB::table('players')->truncate();
        DB::table('teams')->truncate();
        DB::table('tournaments')->truncate();
        DB::table('personal_access_tokens')->truncate();
        DB::table('users')->truncate();
        DB::statement('SET FOREIGN_KEY_CHECKS=1');

        $adminId = $this->createUser('Lukas Admin', self::ADMIN_EMAIL, 'admin');
        $managerId = $this->createUser('Mantas Kazlauskas', self::MANAGER_EMAIL, 'manager');
        $teamIds = $this->createTeams($managerId);

        $this->createFinishedTournament($adminId, $teamIds);
        $this->createFutureTournamentWithRequests($adminId, $managerId, $teamIds);
    }

    private function createUser(string $name, string $email, string $role): int
    {
        $row = [
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('example123'),
            'role' => $role,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('users', 'email_verified_at')) {
            $row['email_verified_at'] = now();
        }

        if (Schema::hasColumn('users', 'remember_token')) {
            $row['remember_token'] = null;
        }

        return DB::table('users')->insertGetId($row);
    }

    private function createTeams(int $managerId): array
    {
        $teams = [
            [
                'name' => 'Kauno Tornadai',
                'city' => 'Kaunas',
                'logo' => $this->logoUrl('Kauno Tornadai', '0f172a', 'f8fafc'),
                'players' => [
                    ['Mantas', 'Jankunas', 4], ['Rokas', 'Vaitkus', 7], ['Tomas', 'Petraitis', 9], ['Arnas', 'Balciunas', 11],
                    ['Domantas', 'Zukauskas', 13], ['Paulius', 'Stankus', 15], ['Lukas', 'Kazlauskas', 21], ['Justas', 'Urbonas', 23],
                    ['Karolis', 'Mockevicius', 31], ['Aistis', 'Sakalauskas', 33],
                ],
            ],
            [
                'name' => 'Vilniaus Perkunas',
                'city' => 'Vilnius',
                'logo' => $this->logoUrl('Vilniaus Perkunas', 'b91c1c', 'ffffff'),
                'players' => [
                    ['Dovydas', 'Giedraitis', 3], ['Mindaugas', 'Kairys', 5], ['Nojus', 'Sirvydis', 8], ['Edvinas', 'Brazdeikis', 10],
                    ['Titas', 'Lekavicius', 12], ['Laurynas', 'Butkus', 16], ['Matas', 'Normantas', 18], ['Simas', 'Jasaitis', 22],
                    ['Gytis', 'Radzevicius', 24], ['Benas', 'Valinskas', 30],
                ],
            ],
            [
                'name' => 'Klaipedos Bangos',
                'city' => 'Klaipeda',
                'logo' => $this->logoUrl('Klaipedos Bangos', '0369a1', 'ffffff'),
                'players' => [
                    ['Tauras', 'Sleza', 2], ['Ernestas', 'Seskus', 6], ['Jonas', 'Macijauskas', 8], ['Arminas', 'Bendzius', 14],
                    ['Pijus', 'Galdikas', 17], ['Vytenis', 'Cizauskas', 19], ['Saulius', 'Kuzminskas', 20], ['Ignas', 'Ramanauskas', 25],
                    ['Deividas', 'Anuzis', 32], ['Martynas', 'Mazeika', 41],
                ],
            ],
            [
                'name' => 'Siauliu Sauliai',
                'city' => 'Siauliai',
                'logo' => $this->logoUrl('Siauliu Sauliai', 'ca8a04', '111827'),
                'players' => [
                    ['Aurimas', 'Grigonis', 1], ['Eimantas', 'Bendorius', 4], ['Rytis', 'Pipiras', 9], ['Vilius', 'Serapinas', 12],
                    ['Giedrius', 'Rutkauskas', 15], ['Dainius', 'Adomaitis', 18], ['Tadas', 'Pacevicius', 21], ['Joris', 'Mikalauskas', 27],
                    ['Nerijus', 'Jucikas', 35], ['Evaldas', 'Saulys', 44],
                ],
            ],
            [
                'name' => 'Panevezio Lietkabelis II',
                'city' => 'Panevezys',
                'logo' => $this->logoUrl('Panevezio Lietkabelis II', '7f1d1d', 'ffffff'),
                'players' => [
                    ['Gabrielius', 'Maldunas', 5], ['Kristupas', 'Zemaitis', 7], ['Julius', 'Paukste', 10], ['Marius', 'Valinskas', 13],
                    ['Adomas', 'Drungilas', 17], ['Vaidotas', 'Peciukas', 20], ['Tautvydas', 'Kupsas', 23], ['Sarunas', 'Beniusis', 29],
                    ['Erikas', 'Venskus', 34], ['Rimantas', 'Daunys', 45],
                ],
            ],
            [
                'name' => 'Alytaus Dzuku Vilkai',
                'city' => 'Alytus',
                'logo' => $this->logoUrl('Alytaus Dzuku Vilkai', '166534', 'ffffff'),
                'players' => [
                    ['Zygimantas', 'Janavicius', 2], ['Ovidijus', 'Varanauskas', 6], ['Arvydas', 'Eitutavicius', 8], ['Tomas', 'Pauliukenas', 11],
                    ['Marius', 'Runkauskas', 14], ['Donatas', 'Tarolis', 19], ['Jokubas', 'Rubinas', 23], ['Povilas', 'Cukinas', 31],
                    ['Vytautas', 'Kaciulis', 33], ['Linas', 'Kvedaravicius', 55],
                ],
            ],
            [
                'name' => 'Marijampoles Suduva',
                'city' => 'Marijampole',
                'logo' => $this->logoUrl('Marijampoles Suduva', '991b1b', 'ffffff'),
                'players' => [
                    ['Kajus', 'Kubilinskas', 3], ['Rokas', 'Stipcevic', 6], ['Mantas', 'Ruikis', 9], ['Tomas', 'Zdanavicius', 13],
                    ['Gvidas', 'Galinauskas', 16], ['Edgaras', 'Stanionis', 22], ['Ignas', 'Labutis', 24], ['Dominykas', 'Milka', 28],
                    ['Justinas', 'Marcinkevicius', 32], ['Paulius', 'Petrilevicius', 40],
                ],
            ],
            [
                'name' => 'Utenos Juventus Academy',
                'city' => 'Utena',
                'logo' => $this->logoUrl('Utenos Juventus Academy', '065f46', 'ffffff'),
                'players' => [
                    ['Darius', 'Tarvydas', 1], ['Tautvydas', 'Kupstas', 4], ['Martynas', 'Gecevicius', 8], ['Laurynas', 'Mikalauskas', 12],
                    ['Arnas', 'Berucka', 15], ['Mantas', 'Sernius', 18], ['Gediminas', 'Navickas', 21], ['Tadas', 'Rinkunas', 25],
                    ['Justas', 'Tamulis', 30], ['Vilius', 'Sumskis', 42],
                ],
            ],
            [
                'name' => 'Rygos Daugava',
                'city' => 'Riga',
                'logo' => $this->logoUrl('Rygos Daugava', '1d4ed8', 'ffffff'),
                'players' => [
                    ['Arturs', 'Ozols', 2], ['Janis', 'Berzins', 5], ['Roberts', 'Kalnins', 7], ['Kristaps', 'Liepa', 11],
                    ['Edgars', 'Vitolins', 14], ['Raimonds', 'Abols', 18], ['Martins', 'Eglitis', 22], ['Gustavs', 'Balodis', 25],
                    ['Niks', 'Stradins', 34], ['Valters', 'Skuja', 41],
                ],
            ],
            [
                'name' => 'Tartu Kalev',
                'city' => 'Tartu',
                'logo' => $this->logoUrl('Tartu Kalev', '0e7490', 'ffffff'),
                'players' => [
                    ['Karl', 'Tamm', 1], ['Mihkel', 'Saar', 4], ['Rasmus', 'Kask', 6], ['Henri', 'Laane', 9],
                    ['Markus', 'Koppel', 12], ['Oliver', 'Rebane', 17], ['Siim', 'Mets', 20], ['Kristjan', 'Pold', 24],
                    ['Andres', 'Vaher', 32], ['Taavi', 'Nurme', 45],
                ],
            ],
            [
                'name' => 'Druskininku Aidas',
                'city' => 'Druskininkai',
                'logo' => $this->logoUrl('Druskininku Aidas', '4338ca', 'ffffff'),
                'players' => [
                    ['Arvydas', 'Maciulis', 3], ['Matas', 'Venslovas', 6], ['Tomas', 'Bieliauskas', 8], ['Rokas', 'Jokubaitis', 10],
                    ['Deividas', 'Pocius', 13], ['Lukas', 'Klimavicius', 16], ['Mindaugas', 'Navickas', 21], ['Aurimas', 'Jakstys', 27],
                    ['Domas', 'Rimkus', 35], ['Vytis', 'Grabauskas', 50],
                ],
            ],
            [
                'name' => 'Taurages Taurai',
                'city' => 'Taurage',
                'logo' => $this->logoUrl('Taurages Taurai', '92400e', 'ffffff'),
                'players' => [
                    ['Vaidotas', 'Grinius', 2], ['Edvinas', 'Mikutis', 5], ['Tautas', 'Sadauskas', 7], ['Jokubas', 'Kalvaitis', 12],
                    ['Karolis', 'Dauksa', 15], ['Giedrius', 'Simkus', 18], ['Rytis', 'Vainauskas', 23], ['Paulius', 'Rimsa', 28],
                    ['Justas', 'Vasiliauskas', 33], ['Aivaras', 'Butrimas', 44],
                ],
            ],
            [
                'name' => 'Palangos Kursiai',
                'city' => 'Palanga',
                'logo' => $this->logoUrl('Palangos Kursiai', '0f766e', 'ffffff'),
                'players' => [
                    ['Nerijus', 'Misevicius', 1], ['Ignas', 'Sutkus', 4], ['Tadas', 'Pociunas', 8], ['Simonas', 'Kvedaras', 11],
                    ['Arnas', 'Savickas', 14], ['Marius', 'Jurgaitis', 19], ['Laurynas', 'Morkunas', 22], ['Vytautas', 'Grigaitis', 26],
                    ['Eimantas', 'Seskus', 31], ['Dainius', 'Kavaliauskas', 43],
                ],
            ],
            [
                'name' => 'Mazeikiu Nafta',
                'city' => 'Mazeikiai',
                'logo' => $this->logoUrl('Mazeikiu Nafta', '111827', 'facc15'),
                'players' => [
                    ['Modestas', 'Paulauskas', 3], ['Rimvydas', 'Milius', 6], ['Titas', 'Rupkus', 9], ['Linas', 'Valenta', 13],
                    ['Sarunas', 'Kavolis', 17], ['Evaldas', 'Bickauskis', 20], ['Mantas', 'Juska', 24], ['Dovydas', 'Petkus', 29],
                    ['Gintaras', 'Rimkus', 36], ['Algirdas', 'Vaitiekus', 52],
                ],
            ],
            [
                'name' => 'Joniskio Delikatesas',
                'city' => 'Joniskis',
                'logo' => $this->logoUrl('Joniskio Delikatesas', 'be123c', 'ffffff'),
                'players' => [
                    ['Kipras', 'Petronis', 2], ['Nojus', 'Vasiliauskas', 5], ['Mantas', 'Kvedaras', 8], ['Tomas', 'Stonkus', 10],
                    ['Arminas', 'Miksys', 16], ['Julius', 'Rakauskas', 19], ['Rokas', 'Lapinskas', 23], ['Dominykas', 'Uosis', 30],
                    ['Martynas', 'Zilinskas', 34], ['Gytis', 'Petrulis', 40],
                ],
            ],
            [
                'name' => 'Kedainiu Nevezis B',
                'city' => 'Kedainiai',
                'logo' => $this->logoUrl('Kedainiu Nevezis B', '4d7c0f', 'ffffff'),
                'players' => [
                    ['Aistis', 'Matulionis', 1], ['Benas', 'Sakalauskas', 4], ['Lukas', 'Ambrazevicius', 7], ['Justinas', 'Banevicius', 12],
                    ['Tomas', 'Zvirblis', 15], ['Karolis', 'Pukelis', 18], ['Gvidas', 'Siaulys', 21], ['Paulius', 'Kisielius', 25],
                    ['Erikas', 'Masiulis', 32], ['Mindaugas', 'Lukosevicius', 44],
                ],
            ],
        ];

        $teamIds = [];
        foreach ($teams as $teamIndex => $team) {
            $teamId = DB::table('teams')->insertGetId([
                'name' => $team['name'],
                'city' => $team['city'],
                'logo_url' => $team['logo'],
                'manager_id' => $managerId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $teamIds[] = $teamId;
            foreach ($team['players'] as $playerIndex => [$firstName, $lastName, $jersey]) {
                DB::table('players')->insert([
                    'team_id' => $teamId,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'photo_url' => $this->photoUrl($teamIndex, $playerIndex),
                    'jersey_number' => $jersey,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        return $teamIds;
    }

    private function createFinishedTournament(int $adminId, array $teamIds): void
    {
        $tournamentId = DB::table('tournaments')->insertGetId([
            'name' => 'Baltic Hoops Spring Invitational 2026',
            'banner_url' => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1600&q=80',
            'start_date' => '2026-04-17',
            'end_date' => '2026-05-02',
            'format' => 'groups_playoffs',
            'status' => 'finished',
            'created_by' => $adminId,
            'max_teams' => 8,
            'group_size' => 4,
            'group_advance_count' => 2,
            'duration_weeks' => 3,
            'allowed_days' => json_encode([1, 3, 5, 6, 7]),
            'time_slots' => json_encode(['18:00', '20:00']),
            'venue_name' => 'Kauno Sporto Hale',
            'venues_count' => 2,
            'venue_names' => json_encode(['Kauno Sporto Hale', 'VDU Prezidento Valdo Adamkaus Sporto Centras']),
            'playoff_round_gap_days' => 2,
            'groups_to_playoffs_gap_days' => 3,
            'group_games_per_day' => 2,
            'stage_day_gap_days' => 1,
            'registration_deadline' => '2026-04-10',
            'participants_locked' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach (array_slice($teamIds, 0, 8) as $index => $teamId) {
            $groupCode = $index < 4 ? 'A' : 'B';
            DB::table('tournament_teams')->insert([
                'tournament_id' => $tournamentId,
                'team_id' => $teamId,
                'group_code' => $groupCode,
                'seed' => $index + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->attachTournamentRoster($tournamentId, $teamId);
        }

        $groupMatches = [
            ['A', 1, 0, 1, '2026-04-17 18:00:00', 84, 76],
            ['A', 1, 2, 3, '2026-04-17 20:00:00', 79, 71],
            ['B', 1, 4, 5, '2026-04-18 18:00:00', 88, 82],
            ['B', 1, 6, 7, '2026-04-18 20:00:00', 77, 69],
            ['A', 2, 0, 2, '2026-04-20 18:00:00', 91, 83],
            ['A', 2, 1, 3, '2026-04-20 20:00:00', 86, 72],
            ['B', 2, 4, 6, '2026-04-22 18:00:00', 81, 74],
            ['B', 2, 5, 7, '2026-04-22 20:00:00', 85, 78],
            ['A', 3, 0, 3, '2026-04-24 18:00:00', 87, 75],
            ['A', 3, 1, 2, '2026-04-24 20:00:00', 80, 74],
            ['B', 3, 4, 7, '2026-04-25 18:00:00', 92, 79],
            ['B', 3, 5, 6, '2026-04-25 20:00:00', 83, 76],
        ];

        foreach ($groupMatches as [$group, $round, $home, $away, $scheduledAt, $homeScore, $awayScore]) {
            $this->createFinishedMatch($tournamentId, $teamIds[$home], $teamIds[$away], $scheduledAt, $homeScore, $awayScore, 'group', $group, $round);
        }

        foreach ([['GP1-1', '2026-04-29 18:00:00'], ['GP1-2', '2026-04-29 20:00:00'], ['GP2-1', '2026-05-02 19:00:00']] as $index => [$groupCode, $scheduledAt]) {
            DB::table('matches')->insert([
                'tournament_id' => $tournamentId,
                'home_team_id' => null,
                'away_team_id' => null,
                'venue_id' => null,
                'venue_slot' => ($index % 2) + 1,
                'venue_name' => $index === 0 ? 'Kauno Sporto Hale' : 'VDU Prezidento Valdo Adamkaus Sporto Centras',
                'stage' => 'playoffs',
                'group_code' => $groupCode,
                'round_number' => $index < 2 ? 1 : 2,
                'scheduled_at' => $scheduledAt,
                'home_score' => null,
                'away_score' => null,
                'status' => 'scheduled',
                'quarter_length_seconds' => 600,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        TournamentProgression::sync(Tournament::findOrFail($tournamentId));

        $semifinals = DB::table('matches')
            ->where('tournament_id', $tournamentId)
            ->where('stage', 'playoffs')
            ->where('round_number', 1)
            ->orderBy('id')
            ->get();

        $this->finishExistingMatch((int) $semifinals[0]->id, 89, 81);
        $this->finishExistingMatch((int) $semifinals[1]->id, 78, 82);

        TournamentProgression::sync(Tournament::findOrFail($tournamentId));

        $final = DB::table('matches')
            ->where('tournament_id', $tournamentId)
            ->where('stage', 'playoffs')
            ->where('round_number', 2)
            ->first();

        $this->finishExistingMatch((int) $final->id, 94, 88);
        TournamentProgression::sync(Tournament::findOrFail($tournamentId));
    }

    private function createFutureTournamentWithRequests(int $adminId, int $managerId, array $teamIds): void
    {
        $tournamentId = DB::table('tournaments')->insertGetId([
            'name' => 'Lithuanian Summer Cup 2026',
            'banner_url' => 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&w=1600&q=80',
            'start_date' => '2026-08-03',
            'end_date' => '2026-08-17',
            'format' => 'groups_playoffs',
            'status' => 'draft',
            'created_by' => $adminId,
            'max_teams' => 8,
            'group_size' => 4,
            'group_advance_count' => 2,
            'duration_weeks' => 3,
            'allowed_days' => json_encode([1, 2, 4, 6]),
            'time_slots' => json_encode(['18:30', '20:30']),
            'venue_name' => 'Avia Solutions Group Arena',
            'venues_count' => 2,
            'venue_names' => json_encode(['Avia Solutions Group Arena', 'Jeep Arena']),
            'playoff_round_gap_days' => 2,
            'groups_to_playoffs_gap_days' => 2,
            'group_games_per_day' => 2,
            'stage_day_gap_days' => 1,
            'registration_deadline' => '2026-07-24',
            'participants_locked' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach (array_slice($teamIds, 0, 8) as $index => $teamId) {
            DB::table('tournament_participation_requests')->insert([
                'tournament_id' => $tournamentId,
                'team_id' => $teamId,
                'manager_id' => $managerId,
                'status' => 'pending',
                'note' => $this->requestNote($index),
                'reviewed_by' => null,
                'reviewed_at' => null,
                'created_at' => now()->subDays(7 - min($index, 6))->addMinutes($index * 17),
                'updated_at' => now()->subDays(7 - min($index, 6))->addMinutes($index * 17),
            ]);
        }
    }

    private function createFinishedMatch(
        int $tournamentId,
        int $homeTeamId,
        int $awayTeamId,
        string $scheduledAt,
        int $homeScore,
        int $awayScore,
        string $stage,
        ?string $groupCode,
        int $round
    ): int {
        $events = $this->generateEvents($homeTeamId, $awayTeamId, $homeScore, $awayScore, $scheduledAt);
        $matchId = DB::table('matches')->insertGetId([
            'tournament_id' => $tournamentId,
            'home_team_id' => $homeTeamId,
            'away_team_id' => $awayTeamId,
            'venue_id' => null,
            'venue_slot' => $round % 2 === 0 ? 2 : 1,
            'venue_name' => $round % 2 === 0 ? 'VDU Prezidento Valdo Adamkaus Sporto Centras' : 'Kauno Sporto Hale',
            'stage' => $stage,
            'group_code' => $groupCode,
            'round_number' => $round,
            'scheduled_at' => $scheduledAt,
            'home_score' => $homeScore,
            'away_score' => $awayScore,
            'status' => 'finished',
            'live_events' => json_encode($events),
            'quarter_length_seconds' => 600,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->createBoxScore($matchId, $homeTeamId, $awayTeamId, $homeScore, $awayScore);

        return $matchId;
    }

    private function finishExistingMatch(int $matchId, int $homeScore, int $awayScore): void
    {
        $match = DB::table('matches')->where('id', $matchId)->first();
        $events = $this->generateEvents((int) $match->home_team_id, (int) $match->away_team_id, $homeScore, $awayScore, (string) $match->scheduled_at);

        DB::table('matches')->where('id', $matchId)->update([
            'home_score' => $homeScore,
            'away_score' => $awayScore,
            'status' => 'finished',
            'live_events' => json_encode($events),
            'updated_at' => now(),
        ]);

        $this->createBoxScore($matchId, (int) $match->home_team_id, (int) $match->away_team_id, $homeScore, $awayScore);
    }

    private function attachTournamentRoster(int $tournamentId, int $teamId): void
    {
        DB::table('players')
            ->where('team_id', $teamId)
            ->orderBy('jersey_number')
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

    private function generateEvents(int $homeTeamId, int $awayTeamId, int $homeScore, int $awayScore, string $scheduledAt): array
    {
        $homePlayers = DB::table('players')->where('team_id', $homeTeamId)->orderBy('jersey_number')->pluck('id')->values()->all();
        $awayPlayers = DB::table('players')->where('team_id', $awayTeamId)->orderBy('jersey_number')->pluck('id')->values()->all();
        $homeShots = $this->scoringPlays($homeScore, $homePlayers);
        $awayShots = $this->scoringPlays($awayScore, $awayPlayers);
        $events = [];
        $base = Carbon::parse($scheduledAt);
        $eventNo = 1;
        $homeIndex = 0;
        $awayIndex = 0;
        $script = $this->gameScript($homeScore, $awayScore, $homeTeamId, $awayTeamId);
        $totalMadeShots = count($homeShots) + count($awayShots);
        $madeShotNo = 0;

        foreach ($script as $phase) {
            [$phaseSide, $madeCount, $startSecond, $endSecond] = $phase;
            for ($i = 0; $i < $madeCount; $i++) {
                $side = $phaseSide;
                if ($side === 'home' && $homeIndex >= count($homeShots)) {
                    $side = 'away';
                }
                if ($side === 'away' && $awayIndex >= count($awayShots)) {
                    $side = 'home';
                }
                if (($side === 'home' && $homeIndex >= count($homeShots)) || ($side === 'away' && $awayIndex >= count($awayShots))) {
                    continue;
                }

                $shot = $side === 'home' ? $homeShots[$homeIndex++] : $awayShots[$awayIndex++];
                $madeShotNo++;
                $window = max(1, $endSecond - $startSecond);
                $absoluteSecond = $startSecond + (int) round((($i + 1) / ($madeCount + 1)) * $window);
                $absoluteSecond += (($madeShotNo * 11) + $homeTeamId + $awayTeamId) % 19 - 9;
                $absoluteSecond = max(8, min(2392, $absoluteSecond));
                [$quarter, $elapsed] = $this->clockFromAbsoluteSecond($absoluteSecond);
                $players = $side === 'home' ? $homePlayers : $awayPlayers;
                $defenders = $side === 'home' ? $awayPlayers : $homePlayers;

                if ($madeShotNo % 5 === 0) {
                    $missSecond = max(5, $absoluteSecond - 16);
                    [$missQuarter, $missElapsed] = $this->clockFromAbsoluteSecond($missSecond);
                    $events[] = $this->eventRow($eventNo++, 'shot', $missQuarter, $missElapsed, $side, $base, [
                        'playerId' => $players[($madeShotNo + 3) % count($players)],
                        'points' => $shot['points'] === 3 ? 3 : 2,
                        'made' => false,
                    ]);
                    $events[] = $this->eventRow($eventNo++, 'rebound', $missQuarter, min(599, $missElapsed + 4), $side === 'home' ? 'away' : 'home', $base, [
                        'playerId' => $defenders[($madeShotNo + 1) % count($defenders)],
                    ]);
                }

                if ($madeShotNo % 7 === 0) {
                    $foulSecond = max(6, $absoluteSecond - 9);
                    [$foulQuarter, $foulElapsed] = $this->clockFromAbsoluteSecond($foulSecond);
                    $events[] = $this->eventRow($eventNo++, 'foul', $foulQuarter, $foulElapsed, $side === 'home' ? 'away' : 'home', $base, [
                        'playerId' => $defenders[($madeShotNo + 4) % count($defenders)],
                    ]);
                }

                if ($madeShotNo % 9 === 0) {
                    $turnoverSecond = max(6, $absoluteSecond - 23);
                    [$turnoverQuarter, $turnoverElapsed] = $this->clockFromAbsoluteSecond($turnoverSecond);
                    $events[] = $this->eventRow($eventNo++, 'turnover', $turnoverQuarter, $turnoverElapsed, $side === 'home' ? 'away' : 'home', $base, [
                        'playerId' => $defenders[($madeShotNo + 2) % count($defenders)],
                    ]);
                    $events[] = $this->eventRow($eventNo++, 'steal', $turnoverQuarter, min(599, $turnoverElapsed + 2), $side, $base, [
                        'playerId' => $players[($madeShotNo + 5) % count($players)],
                    ]);
                }

                $events[] = $this->eventRow($eventNo++, 'shot', $quarter, $elapsed, $side, $base, [
                    'playerId' => $shot['player_id'],
                    'points' => $shot['points'],
                    'made' => true,
                    'assistPlayerId' => $shot['assist_id'],
                ]);
            }
        }

        while ($homeIndex < count($homeShots) || $awayIndex < count($awayShots)) {
            $side = $homeIndex < count($homeShots) ? 'home' : 'away';
            $shot = $side === 'home' ? $homeShots[$homeIndex++] : $awayShots[$awayIndex++];
            $madeShotNo++;
            $absoluteSecond = min(2390, 2120 + (($madeShotNo * 17) % 240));
            [$quarter, $elapsed] = $this->clockFromAbsoluteSecond($absoluteSecond);
            $events[] = $this->eventRow($eventNo++, 'shot', $quarter, $elapsed, $side, $base, [
                'playerId' => $shot['player_id'],
                'points' => $shot['points'],
                'made' => true,
                'assistPlayerId' => $shot['assist_id'],
            ]);
        }

        for ($quarter = 1; $quarter <= 4; $quarter++) {
            $events[] = $this->eventRow($eventNo++, 'quarter_end', $quarter, 600, null, $base, []);
        }

        usort($events, fn (array $left, array $right) => [
            $left['quarter'],
            $left['elapsed'],
            $left['id'],
        ] <=> [
            $right['quarter'],
            $right['elapsed'],
            $right['id'],
        ]);

        return array_values($events);
    }

    private function gameScript(int $homeScore, int $awayScore, int $homeTeamId, int $awayTeamId): array
    {
        $homePlays = count($this->scoringPlays($homeScore, range(1, 10)));
        $awayPlays = count($this->scoringPlays($awayScore, range(1, 10)));
        $homeLead = $homeScore > $awayScore;
        $diff = abs($homeScore - $awayScore);
        $winner = $homeLead ? 'home' : 'away';
        $loser = $homeLead ? 'away' : 'home';
        $homeChunks = $this->splitCounts($homePlays, $diff >= 12 ? [3, 2, 4, 4, 3, 5, 5, 3] : [3, 4, 3, 5, 4, 3, 4, 4]);
        $awayChunks = $this->splitCounts($awayPlays, $diff >= 12 ? [2, 4, 2, 3, 2, 3, 2, 2] : [4, 2, 4, 2, 5, 4, 2, 3]);
        $windows = [
            [30, 260], [275, 545], [640, 870], [885, 1160],
            [1240, 1460], [1480, 1735], [1820, 2070], [2095, 2360],
        ];

        if (($homeTeamId + $awayTeamId) % 3 === 0 && $diff < 12) {
            $order = [
                ['home', $homeChunks[0], $windows[0][0], $windows[0][1]],
                ['away', $awayChunks[0] + $awayChunks[1], $windows[1][0], $windows[1][1]],
                ['home', $homeChunks[1] + $homeChunks[2], $windows[2][0], $windows[2][1]],
                ['away', $awayChunks[2], $windows[3][0], $windows[3][1]],
                ['away', $awayChunks[3] + $awayChunks[4], $windows[4][0], $windows[4][1]],
                ['home', $homeChunks[3] + $homeChunks[4], $windows[5][0], $windows[5][1]],
                [$winner, $winner === 'home' ? $homeChunks[5] : $awayChunks[5], $windows[6][0], $windows[6][1]],
                [$winner, $winner === 'home' ? $homeChunks[6] + $homeChunks[7] : $awayChunks[6] + $awayChunks[7], $windows[7][0], $windows[7][1]],
            ];
        } elseif ($diff >= 12) {
            $order = [
                [$winner, $winner === 'home' ? $homeChunks[0] + $homeChunks[1] : $awayChunks[0] + $awayChunks[1], $windows[0][0], $windows[0][1]],
                [$loser, $loser === 'home' ? $homeChunks[0] : $awayChunks[0], $windows[1][0], $windows[1][1]],
                [$winner, $winner === 'home' ? $homeChunks[2] : $awayChunks[2], $windows[2][0], $windows[2][1]],
                [$winner, $winner === 'home' ? $homeChunks[3] : $awayChunks[3], $windows[3][0], $windows[3][1]],
                [$loser, $loser === 'home' ? $homeChunks[1] + $homeChunks[2] : $awayChunks[1] + $awayChunks[2], $windows[4][0], $windows[4][1]],
                [$winner, $winner === 'home' ? $homeChunks[4] + $homeChunks[5] : $awayChunks[4] + $awayChunks[5], $windows[5][0], $windows[5][1]],
                [$loser, $loser === 'home' ? $homeChunks[3] : $awayChunks[3], $windows[6][0], $windows[6][1]],
                [$winner, $winner === 'home' ? $homeChunks[6] + $homeChunks[7] : $awayChunks[6] + $awayChunks[7], $windows[7][0], $windows[7][1]],
            ];
        } else {
            $order = [
                ['away', $awayChunks[0], $windows[0][0], $windows[0][1]],
                ['home', $homeChunks[0] + $homeChunks[1], $windows[1][0], $windows[1][1]],
                ['away', $awayChunks[1] + $awayChunks[2], $windows[2][0], $windows[2][1]],
                ['home', $homeChunks[2], $windows[3][0], $windows[3][1]],
                [$loser, $loser === 'home' ? $homeChunks[3] + $homeChunks[4] : $awayChunks[3] + $awayChunks[4], $windows[4][0], $windows[4][1]],
                [$winner, $winner === 'home' ? $homeChunks[5] : $awayChunks[5], $windows[5][0], $windows[5][1]],
                [$loser, $loser === 'home' ? $homeChunks[5] : $awayChunks[5], $windows[6][0], $windows[6][1]],
                [$winner, $winner === 'home' ? $homeChunks[6] + $homeChunks[7] : $awayChunks[6] + $awayChunks[7], $windows[7][0], $windows[7][1]],
            ];
        }

        return array_values(array_filter($order, fn (array $phase) => $phase[1] > 0));
    }

    private function splitCounts(int $total, array $weights): array
    {
        $sum = array_sum($weights);
        $chunks = [];
        $assigned = 0;

        foreach ($weights as $weight) {
            $value = (int) floor($total * $weight / $sum);
            $chunks[] = $value;
            $assigned += $value;
        }

        $index = 0;
        while ($assigned < $total) {
            $chunks[$index % count($chunks)]++;
            $assigned++;
            $index++;
        }

        return $chunks;
    }

    private function clockFromAbsoluteSecond(int $absoluteSecond): array
    {
        $absoluteSecond = max(0, min(2399, $absoluteSecond));
        $quarter = intdiv($absoluteSecond, 600) + 1;
        $elapsed = $absoluteSecond % 600;

        return [$quarter, $elapsed];
    }

    private function scoringPlays(int $score, array $playerIds): array
    {
        $plays = [];
        $remaining = $score;
        $index = 0;

        while ($remaining > 0) {
            $points = $remaining >= 3 && ($index % 4 === 0 || $remaining === 3) ? 3 : 2;
            if ($remaining === 1) {
                $points = 1;
            }
            if ($remaining - $points < 0) {
                $points = $remaining;
            }

            $plays[] = [
                'points' => $points,
                'player_id' => $playerIds[$index % count($playerIds)],
                'assist_id' => $points > 1 ? $playerIds[($index + 2) % count($playerIds)] : null,
            ];
            $remaining -= $points;
            $index++;
        }

        return $plays;
    }

    private function eventRow(int $id, string $type, int $quarter, int $elapsed, ?string $side, Carbon $base, array $extra): array
    {
        return array_filter(array_merge([
            'id' => 'seed-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT),
            'type' => $type,
            'quarter' => $quarter,
            'clock' => gmdate('i:s', max(0, 600 - $elapsed)),
            'elapsed' => $elapsed,
            'teamSide' => $side,
            'createdAt' => $base->copy()->addSeconds((($quarter - 1) * 600) + $elapsed)->toIso8601String(),
        ], $extra), fn ($value) => $value !== null);
    }

    private function createBoxScore(int $matchId, int $homeTeamId, int $awayTeamId, int $homeScore, int $awayScore): void
    {
        DB::table('match_player_stats')->where('match_id', $matchId)->delete();
        $this->createTeamBoxScore($matchId, $homeTeamId, $homeScore, true);
        $this->createTeamBoxScore($matchId, $awayTeamId, $awayScore, false);
    }

    private function createTeamBoxScore(int $matchId, int $teamId, int $score, bool $home): void
    {
        $players = DB::table('players')->where('team_id', $teamId)->orderBy('jersey_number')->pluck('id')->values()->all();
        $points = $this->pointDistribution($score, count($players));

        foreach ($players as $index => $playerId) {
            $playerPoints = $points[$index] ?? 0;
            $madeTwos = intdiv(max(0, $playerPoints - ($index % 3 === 0 ? 3 : 0)), 2);
            $madeThrees = $playerPoints >= 9 && $index % 3 === 0 ? 1 : 0;
            $freeThrows = max(0, $playerPoints - ($madeTwos * 2) - ($madeThrees * 3));

            DB::table('match_player_stats')->insert([
                'match_id' => $matchId,
                'player_id' => $playerId,
                'team_id' => $teamId,
                'minutes' => max(8, 34 - ($index * 2)),
                'played_seconds' => max(480, (34 - ($index * 2)) * 60),
                'dnp' => false,
                'fouled_out' => $index === 4 && !$home,
                'points' => $playerPoints,
                'rebounds' => 2 + (($index * 3 + ($home ? 1 : 2)) % 9),
                'assists' => ($index * 2 + ($home ? 2 : 1)) % 8,
                'steals' => $index % 4 === 0 ? 2 : ($index % 3 === 0 ? 1 : 0),
                'blocks' => $index % 5 === 0 ? 1 : 0,
                'fouls' => min(5, 1 + (($index + ($home ? 0 : 1)) % 4)),
                'turnovers' => ($index + 1) % 4,
                'fgm' => $madeTwos + $madeThrees,
                'fga' => $madeTwos + $madeThrees + 2 + ($index % 3),
                'tpm' => $madeThrees,
                'tpa' => $madeThrees + ($index % 3),
                'ftm' => $freeThrows,
                'fta' => $freeThrows + ($index % 2),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function pointDistribution(int $score, int $count): array
    {
        $weights = [18, 15, 13, 11, 10, 9, 8, 7, 5, 4];
        $sum = array_sum(array_slice($weights, 0, $count));
        $points = [];
        $assigned = 0;

        for ($i = 0; $i < $count; $i++) {
            $value = (int) floor($score * $weights[$i] / $sum);
            $points[] = $value;
            $assigned += $value;
        }

        $i = 0;
        while ($assigned < $score) {
            $points[$i % $count]++;
            $assigned++;
            $i++;
        }

        return $points;
    }

    private function requestNote(int $index): string
    {
        $notes = [
            'Komanda pasirengusi dalyvauti, sudetis suformuota.',
            'Norime dalyvauti vasaros turnyre ir zaisti Vilniuje.',
            'Registruojame komanda, zaideju sarasas bus patikslintas iki termino.',
            'Komanda turi pilna sudeti ir gali zaisti vakarais.',
            'Prasome patvirtinti dalyvavima, arena ir laikai tinka.',
            'Dalyvautume abiejuose savaitiniuose turuose.',
            'Komanda grizta po pavasario turnyro ir nori testis sezona.',
            'Patvirtiname susidomejima, laukiame administratoriaus sprendimo.',
        ];

        return $notes[$index % count($notes)];
    }

    private function logoUrl(string $name, string $background, string $color): string
    {
        return 'https://ui-avatars.com/api/?name=' . rawurlencode($name)
            . '&background=' . $background
            . '&color=' . $color
            . '&bold=true&format=svg&size=256';
    }

    private function photoUrl(int $teamIndex, int $playerIndex): string
    {
        return 'https://randomuser.me/api/portraits/men/' . (((($teamIndex * 10) + $playerIndex + 12) % 90) + 1) . '.jpg';
    }
}
