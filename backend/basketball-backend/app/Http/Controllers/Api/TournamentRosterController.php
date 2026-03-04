<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use App\Models\TournamentTeamPlayer;
use Illuminate\Http\Request;

class TournamentRosterController extends Controller
{
    private function ensureTeamRegistered(Tournament $tournament, Team $team): void
    {
        $ok = TournamentTeam::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->exists();

        abort_unless($ok, 409, 'Team is not registered in this tournament.');
    }

    public function index(Tournament $tournament, Team $team)
    {
        $this->ensureTeamRegistered($tournament, $team);

        return TournamentTeamPlayer::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->with('player')
            ->orderByDesc('id')
            ->get();
    }

    public function store(Request $request, Tournament $tournament, Team $team)
    {
        $this->ensureTeamRegistered($tournament, $team);

        $validated = $request->validate([
            'player_id' => ['required','integer','exists:players,id'],
        ]);

        $player = Player::findOrFail($validated['player_id']);
        
        if ((int)$player->team_id !== (int)$team->id) {
            return response()->json(['message' => 'Player does not belong to this team.'], 409);
        }

        $exists = TournamentTeamPlayer::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->where('player_id', $player->id)
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'Player already added to tournament roster.'], 409);
        }

        $row = TournamentTeamPlayer::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'player_id' => $player->id,
        ]);

        return response()->json($row->load('player'), 201);
    }

    public function destroy(Tournament $tournament, Team $team, Player $player)
    {
        $this->ensureTeamRegistered($tournament, $team);

        TournamentTeamPlayer::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->where('player_id', $player->id)
            ->delete();

        return response()->json(['message' => 'Removed from roster'], 200);
    }
}