<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentParticipationRequest;
use App\Models\TournamentTeam;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ParticipationRequestController extends Controller
{
    public function managerIndex(Tournament $tournament, Request $request)
    {
        return TournamentParticipationRequest::where('tournament_id', $tournament->id)
            ->where('manager_id', $request->user()->id)
            ->with('team')
            ->orderByDesc('id')
            ->get();
    }

    public function adminIndex(Tournament $tournament)
    {
        return TournamentParticipationRequest::where('tournament_id', $tournament->id)
            ->with(['team', 'manager', 'reviewer'])
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('id')
            ->get();
    }

    public function store(Tournament $tournament, Request $request)
    {
        $managerId = $request->user()->id;
        $validated = $request->validate([
            'team_id' => ['nullable', 'integer', 'exists:teams,id'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        if ($tournament->participants_locked) {
            return response()->json(['message' => 'Participants are locked for this tournament.'], 409);
        }

        if ($tournament->registration_deadline && Carbon::today()->gt(Carbon::parse($tournament->registration_deadline))) {
            return response()->json(['message' => 'Registration deadline has passed.'], 409);
        }

        $team = null;
        if (!empty($validated['team_id'])) {
            $team = Team::find($validated['team_id']);
            if (!$team || (int)$team->manager_id !== (int)$managerId) {
                return response()->json(['message' => 'You can only request with your own team.'], 403);
            }
        } else {
            $team = Team::where('manager_id', $managerId)->first();
        }

        if (!$team) {
            return response()->json(['message' => 'Create your team first before requesting participation.'], 409);
        }

        $alreadyApproved = TournamentTeam::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->exists();
        if ($alreadyApproved) {
            return response()->json(['message' => 'Team is already approved in this tournament.'], 409);
        }

        $existing = TournamentParticipationRequest::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->first();

        if ($existing && $existing->status === 'pending') {
            return response()->json(['message' => 'A pending request already exists.'], 409);
        }

        if ($existing) {
            $existing->update([
                'manager_id' => $managerId,
                'status' => 'pending',
                'note' => $validated['note'] ?? null,
                'reviewed_by' => null,
                'reviewed_at' => null,
            ]);

            return response()->json($existing->load('team'), 200);
        }

        $created = TournamentParticipationRequest::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'manager_id' => $managerId,
            'status' => 'pending',
            'note' => $validated['note'] ?? null,
        ]);

        return response()->json($created->load('team'), 201);
    }

    public function approve(TournamentParticipationRequest $requestRow, Request $request)
    {
        if ($requestRow->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be approved.'], 409);
        }

        $tournament = Tournament::findOrFail($requestRow->tournament_id);
        if ($tournament->participants_locked) {
            return response()->json(['message' => 'Participants are locked for this tournament.'], 409);
        }

        $approvedCount = TournamentTeam::where('tournament_id', $tournament->id)->count();
        if (!empty($tournament->max_teams) && $approvedCount >= (int)$tournament->max_teams) {
            return response()->json(['message' => 'Max teams limit reached.'], 409);
        }

        DB::transaction(function () use ($requestRow, $request, $tournament): void {
            TournamentTeam::firstOrCreate([
                'tournament_id' => $tournament->id,
                'team_id' => $requestRow->team_id,
            ], [
                'group_code' => null,
                'seed' => null,
            ]);

            $requestRow->update([
                'status' => 'approved',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);
        });

        return response()->json($requestRow->fresh()->load(['team', 'manager', 'reviewer']), 200);
    }

    public function reject(TournamentParticipationRequest $requestRow, Request $request)
    {
        if ($requestRow->status !== 'pending') {
            return response()->json(['message' => 'Only pending requests can be rejected.'], 409);
        }

        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $requestRow->update([
            'status' => 'rejected',
            'note' => $validated['note'] ?? $requestRow->note,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        return response()->json($requestRow->fresh()->load(['team', 'manager', 'reviewer']), 200);
    }
}
