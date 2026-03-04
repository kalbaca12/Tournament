<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use App\Support\SchedulingFeasibility;
use Illuminate\Http\Request;

class TournamentController extends Controller
{
    public function index()
    {
        return Tournament::orderByDesc('id')->get();
    }

    public function show(Tournament $tournament)
    {
        return $tournament->load([
            'teams',
            'matches.homeTeam',
            'matches.awayTeam',
        ]);
    }

    public function feasibility(Tournament $tournament)
    {
        $teamCount = TournamentTeam::where('tournament_id', $tournament->id)->count();
        return SchedulingFeasibility::evaluate($tournament, $teamCount);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Please login again.'], 401);
        }

        $validated = $request->validate([
            'name' => ['required','string','max:150'],
            'start_date' => ['required','date'],
            'end_date' => ['nullable','date','after_or_equal:start_date'],
            'format' => ['required','in:round_robin,groups_playoffs,single_elimination'],
            'max_teams' => ['nullable', 'integer', 'min:2', 'max:512'],
            'duration_weeks' => ['nullable', 'integer', 'min:1', 'max:52'],
            'allowed_days' => ['nullable', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'time_slots' => ['nullable', 'array'],
            'time_slots.*' => ['string', 'max:10'],
            'registration_deadline' => ['nullable', 'date'],
        ]);

        $validated['created_by'] = $user->id;
        $validated['status'] = 'draft';
        $validated['participants_locked'] = false;
        $validated['duration_weeks'] = $validated['duration_weeks'] ?? 1;
        $validated['venues_count'] = 1;

        $tournament = Tournament::create($validated);

        return response()->json($tournament, 201);
    }

    public function update(Request $request, Tournament $tournament)
    {
        $validated = $request->validate([
            'name' => ['sometimes','string','max:150'],
            'start_date' => ['sometimes','date'],
            'end_date' => ['nullable','date'],
            'format' => ['sometimes','in:round_robin,groups_playoffs,single_elimination'],
            'status' => ['sometimes','in:draft,published,finished,cancelled'],
            'max_teams' => ['nullable', 'integer', 'min:2', 'max:512'],
            'duration_weeks' => ['nullable', 'integer', 'min:1', 'max:52'],
            'allowed_days' => ['nullable', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'time_slots' => ['nullable', 'array'],
            'time_slots.*' => ['string', 'max:10'],
            'registration_deadline' => ['nullable', 'date'],
            'participants_locked' => ['sometimes', 'boolean'],
        ]);

        $validated['venues_count'] = 1;

        $tournament->update($validated);

        return $tournament;
    }

    public function lockParticipants(Tournament $tournament)
    {
        $tournament->participants_locked = true;
        $tournament->save();

        return response()->json(['message' => 'Participants locked']);
    }

    public function unlockParticipants(Tournament $tournament)
    {
        $tournament->participants_locked = false;
        $tournament->save();

        return response()->json(['message' => 'Participants unlocked']);
    }

    public function destroy(Tournament $tournament)
    {
        $tournament->delete();
        return response()->json(['message' => 'Deleted'], 200);
    }
}
