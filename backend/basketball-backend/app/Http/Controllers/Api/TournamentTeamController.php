<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use Illuminate\Http\Request;

class TournamentTeamController extends Controller
{
    public function index(Tournament $tournament)
    {
        return TournamentTeam::where('tournament_id', $tournament->id)
            ->with('team')
            ->orderByRaw('seed IS NULL, seed ASC')
            ->get();
    }

    public function store(Request $request, Tournament $tournament)
    {
        if ($tournament->participants_locked) {
            return response()->json(['message' => 'Participants are locked for this tournament.'], 409);
        }

        $validated = $request->validate([
            'team_id' => ['required','integer','exists:teams,id'],
            'group_code' => ['nullable','string','max:5'],
            'seed' => ['nullable','integer','min:1'],
        ]);

        $approvedCount = TournamentTeam::where('tournament_id', $tournament->id)->count();
        if (!empty($tournament->max_teams) && $approvedCount >= (int)$tournament->max_teams) {
            return response()->json(['message' => 'Max teams limit reached.'], 409);
        }

        $exists = TournamentTeam::where('tournament_id', $tournament->id)
            ->where('team_id', $validated['team_id'])
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'Team already registered in this tournament.'], 409);
        }

        $row = TournamentTeam::create([
            'tournament_id' => $tournament->id,
            'team_id' => $validated['team_id'],
            'group_code' => $validated['group_code'] ?? null,
            'seed' => $validated['seed'] ?? null,
        ]);

        return response()->json($row->load('team'), 201);
    }

    public function destroy(Tournament $tournament, Team $team)
    {
        if ($tournament->participants_locked) {
            return response()->json(['message' => 'Participants are locked for this tournament.'], 409);
        }

        TournamentTeam::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->delete();

        return response()->json(['message' => 'Unregistered'], 200);
    }
}
