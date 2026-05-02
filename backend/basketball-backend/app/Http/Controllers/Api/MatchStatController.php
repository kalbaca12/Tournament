<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\MatchPlayerStat;
use App\Models\Player;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MatchStatController extends Controller
{
    public function index(Game $game)
    {
        return MatchPlayerStat::where('match_id', $game->id)
            ->with('player')
            ->orderByDesc('points')
            ->get();
    }

    public function storeBulk(Request $request, Game $game)
    {
        $validated = $request->validate([
            'stats' => ['required','array','min:1'],
            'stats.*.player_id' => ['required','integer','exists:players,id'],
            'stats.*.team_id' => ['required','integer','exists:teams,id'],
            'stats.*.minutes' => ['nullable','integer','min:0','max:60'],
            'stats.*.dnp' => ['nullable','boolean'],
            'stats.*.fouled_out' => ['nullable','boolean'],
            'stats.*.points' => ['nullable','integer','min:0'],
            'stats.*.rebounds' => ['nullable','integer','min:0'],
            'stats.*.assists' => ['nullable','integer','min:0'],
            'stats.*.steals' => ['nullable','integer','min:0'],
            'stats.*.blocks' => ['nullable','integer','min:0'],
            'stats.*.fouls' => ['nullable','integer','min:0'],
            'stats.*.fgm' => ['nullable','integer','min:0'],
            'stats.*.fga' => ['nullable','integer','min:0'],
            'stats.*.tpm' => ['nullable','integer','min:0'],
            'stats.*.tpa' => ['nullable','integer','min:0'],
            'stats.*.ftm' => ['nullable','integer','min:0'],
            'stats.*.fta' => ['nullable','integer','min:0'],
        ]);

        $homeId = (int)$game->home_team_id;
        $awayId = (int)$game->away_team_id;

        DB::transaction(function () use ($validated, $game, $homeId, $awayId) {
            foreach ($validated['stats'] as $row) {
                $teamId = (int)$row['team_id'];

                if ($teamId !== $homeId && $teamId !== $awayId) {
                    abort(409, 'team_id must be one of the match teams.');
                }

                $player = Player::findOrFail((int)$row['player_id']);
                if ((int)$player->team_id !== $teamId) {
                    abort(409, 'player_id does not belong to given team_id.');
                }

                foreach ([['fgm', 'fga'], ['tpm', 'tpa'], ['ftm', 'fta']] as [$madeKey, $attemptKey]) {
                    if ((int)($row[$madeKey] ?? 0) > (int)($row[$attemptKey] ?? 0)) {
                        abort(422, strtoupper($madeKey) . ' cannot be greater than ' . strtoupper($attemptKey) . '.');
                    }
                }

                if ((int)($row['tpm'] ?? 0) > (int)($row['fgm'] ?? 0)) {
                    abort(422, '3PM cannot be greater than FGM.');
                }

                MatchPlayerStat::updateOrCreate(
                    [
                        'match_id' => $game->id,
                        'player_id' => (int)$row['player_id'],
                    ],
                    [
                        'team_id' => $teamId,
                        'minutes' => (int)($row['minutes'] ?? 0),
                        'dnp' => (bool)($row['dnp'] ?? false),
                        'fouled_out' => (bool)($row['fouled_out'] ?? false),
                        'points' => (int)($row['points'] ?? 0),
                        'rebounds' => (int)($row['rebounds'] ?? 0),
                        'assists' => (int)($row['assists'] ?? 0),
                        'steals' => (int)($row['steals'] ?? 0),
                        'blocks' => (int)($row['blocks'] ?? 0),
                        'fouls' => (int)($row['fouls'] ?? 0),
                        'fgm' => (int)($row['fgm'] ?? 0),
                        'fga' => (int)($row['fga'] ?? 0),
                        'tpm' => (int)($row['tpm'] ?? 0),
                        'tpa' => (int)($row['tpa'] ?? 0),
                        'ftm' => (int)($row['ftm'] ?? 0),
                        'fta' => (int)($row['fta'] ?? 0),
                    ]
                );
            }
        });

        return response()->json(['message' => 'Stats saved'], 201);
    }
}
