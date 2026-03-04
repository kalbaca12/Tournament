<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\TournamentTeam;
use App\Models\Tournament;
use Illuminate\Http\Request;

class MatchController extends Controller
{
    public function index(Tournament $tournament)
    {
        return Game::where('tournament_id', $tournament->id)
            ->with(['homeTeam','awayTeam'])
            ->orderBy('round_number')
            ->orderBy('scheduled_at')
            ->get();
    }

    public function show(Game $game)
    {
        return $game->load(['homeTeam','awayTeam','stats.player']);
    }

    public function store(Request $request, Tournament $tournament)
    {
        $validated = $request->validate([
            'home_team_id' => ['required', 'integer', 'exists:teams,id'],
            'away_team_id' => ['required', 'integer', 'exists:teams,id', 'different:home_team_id'],
            'stage' => ['nullable', 'string', 'max:50'],
            'group_code' => ['nullable', 'string', 'max:5'],
            'round_number' => ['nullable', 'integer', 'min:1'],
            'scheduled_at' => ['nullable', 'date'],
            'venue_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'in:scheduled,live,finished,cancelled'],
        ]);

        $registeredTeamIds = TournamentTeam::where('tournament_id', $tournament->id)
            ->whereIn('team_id', [$validated['home_team_id'], $validated['away_team_id']])
            ->pluck('team_id')
            ->all();

        if (count($registeredTeamIds) !== 2) {
            return response()->json([
                'message' => 'Both teams must be registered in this tournament.',
            ], 422);
        }

        $game = Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $validated['home_team_id'],
            'away_team_id' => $validated['away_team_id'],
            'stage' => $validated['stage'] ?? null,
            'group_code' => $validated['group_code'] ?? null,
            'round_number' => $validated['round_number'] ?? 1,
            'scheduled_at' => $validated['scheduled_at'] ?? null,
            'venue_id' => $validated['venue_id'] ?? null,
            'status' => $validated['status'] ?? 'scheduled',
        ]);

        return response()->json($game->load(['homeTeam', 'awayTeam']), 201);
    }

    public function update(Request $request, Game $game)
    {
        $validated = $request->validate([
            'scheduled_at' => ['nullable','date'],
            'venue_id' => ['nullable','integer'],
            'status' => ['nullable','in:scheduled,live,finished,cancelled'],
        ]);

        $game->update($validated);

        return $game;
    }

    public function destroy(Game $game)
    {
        $game->delete();

        return response()->json(['message' => 'Deleted'], 200);
    }

    public function setResult(Request $request, Game $game)
    {
        $validated = $request->validate([
            'home_score' => ['required','integer','min:0'],
            'away_score' => ['required','integer','min:0'],
            'status' => ['nullable','in:finished,live'],
        ]);

        $game->home_score = $validated['home_score'];
        $game->away_score = $validated['away_score'];
        $game->status = $validated['status'] ?? 'finished';
        $game->save();

        return $game;
    }
}
