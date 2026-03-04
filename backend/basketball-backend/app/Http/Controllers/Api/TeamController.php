<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\Team;
use Illuminate\Http\Request;

class TeamController extends Controller
{
    public function index()
    {
        return Team::orderByDesc('id')->get();
    }

    public function mine(Request $request)
    {
        return Team::where('manager_id', $request->user()->id)->first();
    }

    public function show(Team $team)
    {
        return $team->load('players');
    }

    public function matches(Team $team)
    {
        return Game::where(function ($q) use ($team) {
                $q->where('home_team_id', $team->id)
                  ->orWhere('away_team_id', $team->id);
            })
            ->with(['homeTeam', 'awayTeam', 'tournament'])
            ->orderBy('scheduled_at')
            ->orderByDesc('id')
            ->get();
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Please login again.'], 401);
        }

        $existingTeam = Team::where('manager_id', $user->id)->first();
        if ($existingTeam) {
            return response()->json(['message' => 'Manager can only own one team.'], 409);
        }

        $validated = $request->validate([
            'name' => ['required','string','max:150'],
            'city' => ['nullable','string','max:100'],
        ]);

        $validated['manager_id'] = $user->id;
        $team = Team::create($validated);

        return response()->json($team, 201);
    }

    public function update(Request $request, Team $team)
    {
        if ((int)$team->manager_id !== (int)$request->user()->id) {
            return response()->json(['message' => 'You can edit only your own team.'], 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes','string','max:150'],
            'city' => ['nullable','string','max:100'],
        ]);

        $team->update($validated);

        return $team;
    }

    public function destroy(Team $team)
    {
        if ((int)$team->manager_id !== (int)request()->user()->id) {
            return response()->json(['message' => 'You can delete only your own team.'], 403);
        }

        $team->delete();
        return response()->json(['message' => 'Deleted'], 200);
    }
}
