<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Http\Request;

class PlayerController extends Controller
{
    public function index(Request $request)
    {
        $q = Player::query()->orderByDesc('id');

        if ($request->filled('team_id')) {
            $q->where('team_id', (int)$request->query('team_id'));
        }

        return $q->get();
    }

    public function show(Player $player)
    {
        return $player->load('team');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'team_id' => ['required','integer','exists:teams,id'],
            'first_name' => ['required','string','max:100'],
            'last_name' => ['required','string','max:100'],
            'jersey_number' => ['nullable','integer','min:0','max:99'],
        ]);

        $team = Team::findOrFail((int)$validated['team_id']);
        if ((int)$team->manager_id !== (int)$request->user()->id) {
            return response()->json(['message' => 'You can add players only to your own team.'], 403);
        }

        $player = Player::create($validated);

        return response()->json($player, 201);
    }

    public function update(Request $request, Player $player)
    {
        $targetTeamId = (int)($request->input('team_id') ?? $player->team_id);
        $team = Team::findOrFail($targetTeamId);
        if ((int)$team->manager_id !== (int)$request->user()->id) {
            return response()->json(['message' => 'You can edit players only in your own team.'], 403);
        }

        $validated = $request->validate([
            'team_id' => ['sometimes','integer','exists:teams,id'],
            'first_name' => ['sometimes','string','max:100'],
            'last_name' => ['sometimes','string','max:100'],
            'jersey_number' => ['nullable','integer','min:0','max:99'],
        ]);

        $player->update($validated);

        return $player;
    }

    public function destroy(Player $player)
    {
        $team = Team::findOrFail((int)$player->team_id);
        if ((int)$team->manager_id !== (int)request()->user()->id) {
            return response()->json(['message' => 'You can delete players only from your own team.'], 403);
        }

        $player->delete();
        return response()->json(['message' => 'Deleted'], 200);
    }
}
