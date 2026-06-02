<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class NjbaPlayoffsSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $teams = [
            [
                'name' => 'Oklahoma City Thunder',
                'city' => 'Oklahoma City',
                'seed' => 1,
                'players' => [
                    [2, 'Shai', 'Gilgeous-Alexander'],
                    [5, 'Luguentz', 'Dort'],
                    [6, 'Jaylin', 'Williams'],
                    [7, 'Chet', 'Holmgren'],
                    [8, 'Jalen', 'Williams'],
                    [9, 'Alex', 'Caruso'],
                    [11, 'Isaiah', 'Joe'],
                    [12, 'Thomas', 'Sorber'],
                    [13, 'Ousmane', 'Dieng'],
                    [21, 'Aaron', 'Wiggins'],
                    [22, 'Cason', 'Wallace'],
                    [25, 'Ajay', 'Mitchell'],
                    [34, 'Kenrich', 'Williams'],
                    [44, 'Nikola', 'Topic'],
                    [55, 'Isaiah', 'Hartenstein'],
                ],
            ],
            [
                'name' => 'San Antonio Spurs',
                'city' => 'San Antonio',
                'seed' => 2,
                'players' => [
                    [0, 'Jordan', 'McLaughlin'],
                    [1, 'Victor', 'Wembanyama'],
                    [2, 'Dylan', 'Harper'],
                    [3, 'Keldon', 'Johnson'],
                    [4, "De'Aaron", 'Fox'],
                    [5, 'Stephon', 'Castle'],
                    [7, 'Luke', 'Kornet'],
                    [8, 'Kelly', 'Olynyk'],
                    [10, 'Jeremy', 'Sochan'],
                    [11, 'Carter', 'Bryant'],
                    [18, 'Bismack', 'Biyombo'],
                    [24, 'Devin', 'Vassell'],
                    [30, 'Julian', 'Champagnie'],
                    [40, 'Harrison', 'Barnes'],
                    [43, 'Lindy', 'Waters III'],
                ],
            ],
            [
                'name' => 'Denver Nuggets',
                'city' => 'Denver',
                'seed' => 3,
                'players' => [
                    [0, 'Christian', 'Braun'],
                    [3, 'Julian', 'Strawther'],
                    [4, 'Hunter', 'Tyson'],
                    [5, 'Tyus', 'Jones'],
                    [8, 'Peyton', 'Watson'],
                    [10, 'Tim', 'Hardaway Jr.'],
                    [11, 'Bruce', 'Brown'],
                    [14, 'DaRon', 'Holmes II'],
                    [15, 'Nikola', 'Jokic'],
                    [17, 'Jonas', 'Valanciunas'],
                    [22, 'Zeke', 'Nnaji'],
                    [23, 'Cameron', 'Johnson'],
                    [24, 'Jalen', 'Pickett'],
                    [27, 'Jamal', 'Murray'],
                    [32, 'Aaron', 'Gordon'],
                ],
            ],
            [
                'name' => 'Los Angeles Lakers',
                'city' => 'Los Angeles',
                'seed' => 4,
                'players' => [
                    [2, 'Jarred', 'Vanderbilt'],
                    [4, 'Dalton', 'Knecht'],
                    [5, 'Deandre', 'Ayton'],
                    [9, 'Bronny', 'James'],
                    [11, 'Jaxson', 'Hayes'],
                    [12, 'Maxi', 'Kleber'],
                    [15, 'Austin', 'Reaves'],
                    [20, 'Nick', 'Smith Jr.'],
                    [21, 'Rui', 'Hachimura'],
                    [23, 'LeBron', 'James'],
                    [25, 'Marcus', 'Smart'],
                    [26, 'Jake', 'LaRavia'],
                    [28, 'Adou', 'Thiero'],
                    [30, 'Luke', 'Kennard'],
                    [77, 'Luka', 'Doncic'],
                ],
            ],
            [
                'name' => 'Houston Rockets',
                'city' => 'Houston',
                'seed' => 5,
                'players' => [
                    [0, 'Aaron', 'Holiday'],
                    [1, 'Amen', 'Thompson'],
                    [2, 'Dorian', 'Finney-Smith'],
                    [5, 'Fred', 'VanVleet'],
                    [7, 'Kevin', 'Durant'],
                    [8, "Jae'Sean", 'Tate'],
                    [10, 'Jabari', 'Smith Jr.'],
                    [12, 'Steven', 'Adams'],
                    [13, 'Tristen', 'Newton'],
                    [15, 'Reed', 'Sheppard'],
                    [17, 'Tari', 'Eason'],
                    [20, 'Josh', 'Okogie'],
                    [28, 'Alperen', 'Sengun'],
                    [30, 'Clint', 'Capela'],
                    [32, 'Jeff', 'Green'],
                ],
            ],
            [
                'name' => 'Minnesota Timberwolves',
                'city' => 'Minneapolis',
                'seed' => 6,
                'players' => [
                    [0, 'Donte', 'DiVincenzo'],
                    [1, 'Terrence', 'Shannon Jr.'],
                    [3, 'Jaden', 'McDaniels'],
                    [4, 'Julian', 'Phillips'],
                    [5, 'Anthony', 'Edwards'],
                    [7, 'Joe', 'Ingles'],
                    [8, 'Bones', 'Hyland'],
                    [10, 'Mike', 'Conley'],
                    [11, 'Naz', 'Reid'],
                    [12, 'Kyle', 'Anderson'],
                    [13, 'Ayo', 'Dosunmu'],
                    [19, 'Joan', 'Beringer'],
                    [22, 'Jaylen', 'Clark'],
                    [27, 'Rudy', 'Gobert'],
                    [30, 'Julius', 'Randle'],
                ],
            ],
            [
                'name' => 'Portland Trail Blazers',
                'city' => 'Portland',
                'seed' => 7,
                'players' => [
                    [0, 'Damian', 'Lillard'],
                    [00, 'Scoot', 'Henderson'],
                    [1, 'Blake', 'Wesley'],
                    [4, 'Matisse', 'Thybulle'],
                    [5, 'Jrue', 'Holiday'],
                    [8, 'Deni', 'Avdija'],
                    [9, 'Jerami', 'Grant'],
                    [16, 'Yang', 'Hansen'],
                    [17, 'Shaedon', 'Sharpe'],
                    [21, 'Rayan', 'Rupert'],
                    [23, 'Donovan', 'Clingan'],
                    [24, 'Kris', 'Murray'],
                    [26, 'Duop', 'Reath'],
                    [33, 'Toumani', 'Camara'],
                    [35, 'Robert', 'Williams III'],
                ],
            ],
            [
                'name' => 'Phoenix Suns',
                'city' => 'Phoenix',
                'seed' => 8,
                'players' => [
                    [00, 'Royce', "O'Neale"],
                    [0, 'Ryan', 'Dunn'],
                    [1, 'Devin', 'Booker'],
                    [2, 'Amir', 'Coffey'],
                    [3, 'Dillon', 'Brooks'],
                    [4, 'Jalen', 'Green'],
                    [8, 'Grayson', 'Allen'],
                    [10, 'Khaman', 'Maluach'],
                    [12, 'Collin', 'Gillespie'],
                    [15, 'Mark', 'Williams'],
                    [20, 'Rasheer', 'Fleming'],
                    [22, 'CJ', 'Huntley'],
                    [23, 'Jordan', 'Goodwin'],
                    [25, 'Oso', 'Ighodaro'],
                    [28, 'Koby', 'Brea'],
                ],
            ],
        ];

        DB::transaction(function () use ($teams, $now): void {
            $adminId = DB::table('users')->where('email', 'admin@example.com')->value('id');
            $teamIds = [];

            foreach ($teams as $team) {
                $teamId = DB::table('teams')->where('name', $team['name'])->value('id');

                if ($teamId) {
                    DB::table('teams')->where('id', $teamId)->update([
                        'city' => $team['city'],
                        'logo_url' => 'https://cdn.nba.com/logos/nba/' . $this->nbaTeamId($team['name']) . '/primary/L/logo.svg',
                        'updated_at' => $now,
                    ]);
                } else {
                    $teamId = DB::table('teams')->insertGetId([
                        'name' => $team['name'],
                        'city' => $team['city'],
                        'logo_url' => 'https://cdn.nba.com/logos/nba/' . $this->nbaTeamId($team['name']) . '/primary/L/logo.svg',
                        'manager_id' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                $teamIds[$team['name']] = $teamId;
                DB::table('tournament_team_players')->where('team_id', $teamId)->delete();
                DB::table('players')->where('team_id', $teamId)->delete();

                foreach ($team['players'] as [$number, $firstName, $lastName]) {
                    DB::table('players')->insert([
                        'team_id' => $teamId,
                        'first_name' => $firstName,
                        'last_name' => $lastName,
                        'jersey_number' => $number,
                        'photo_url' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            $tournamentId = DB::table('tournaments')->where('name', 'njba playoffs')->value('id');
            $payload = [
                'name' => 'njba playoffs',
                'banner_url' => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
                'start_date' => '2026-04-18',
                'end_date' => '2026-06-19',
                'format' => 'single_elimination',
                'status' => 'draft',
                'created_by' => $adminId,
                'max_teams' => 8,
                'duration_weeks' => 9,
                'allowed_days' => json_encode([1, 2, 3, 4, 5, 6, 7]),
                'time_slots' => json_encode(['12:00', '14:00', '16:00', '18:00']),
                'venues_count' => 1,
                'venue_names' => json_encode(['NJBA Arena']),
                'venue_name' => 'NJBA Arena',
                'playoff_round_gap_days' => 1,
                'groups_to_playoffs_gap_days' => 1,
                'group_games_per_day' => 4,
                'stage_day_gap_days' => 0,
                'registration_deadline' => null,
                'participants_locked' => true,
                'updated_at' => $now,
            ];

            if ($tournamentId) {
                $matchIds = DB::table('matches')->where('tournament_id', $tournamentId)->pluck('id');
                DB::table('match_player_stats')->whereIn('match_id', $matchIds)->delete();
                DB::table('matches')->where('tournament_id', $tournamentId)->delete();
                DB::table('tournament_team_players')->where('tournament_id', $tournamentId)->delete();
                DB::table('tournament_teams')->where('tournament_id', $tournamentId)->delete();
                DB::table('tournaments')->where('id', $tournamentId)->update($payload);
            } else {
                $payload['created_at'] = $now;
                $tournamentId = DB::table('tournaments')->insertGetId($payload);
            }

            foreach ($teams as $team) {
                $teamId = $teamIds[$team['name']];

                DB::table('tournament_teams')->insert([
                    'tournament_id' => $tournamentId,
                    'team_id' => $teamId,
                    'group_code' => null,
                    'seed' => $team['seed'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                DB::table('players')
                    ->where('team_id', $teamId)
                    ->orderBy('jersey_number')
                    ->pluck('id')
                    ->each(function ($playerId) use ($tournamentId, $teamId, $now): void {
                        DB::table('tournament_team_players')->insert([
                            'tournament_id' => $tournamentId,
                            'team_id' => $teamId,
                            'player_id' => $playerId,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    });
            }
        });
    }

    private function nbaTeamId(string $teamName): string
    {
        return [
            'Oklahoma City Thunder' => '1610612760',
            'San Antonio Spurs' => '1610612759',
            'Denver Nuggets' => '1610612743',
            'Los Angeles Lakers' => '1610612747',
            'Houston Rockets' => '1610612745',
            'Minnesota Timberwolves' => '1610612750',
            'Portland Trail Blazers' => '1610612757',
            'Phoenix Suns' => '1610612756',
        ][$teamName];
    }
}
