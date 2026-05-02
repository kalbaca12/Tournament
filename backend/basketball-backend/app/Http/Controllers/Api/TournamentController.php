<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tournament;
use App\Support\PdfExportBuilder;
use App\Models\TournamentTeam;
use App\Support\SchedulingFeasibility;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

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

    public function exportPdf(Request $request, Tournament $tournament)
    {
        $validated = $request->validate([
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string', 'in:teams,standings,schedule,playoffs,feasibility'],
        ]);

        $pdf = PdfExportBuilder::tournament($tournament, $validated['sections'] ?? []);
        $name = Str::slug($tournament->name ?: ('tournament-' . $tournament->id));
        $filename = ($name !== '' ? $name : 'tournament-' . $tournament->id) . '-report.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Content-Length' => (string) strlen($pdf),
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Please login again.'], 401);
        }

        $validated = $request->validate([
            'name' => ['required','string','max:150'],
            'start_date' => ['nullable','date'],
            'end_date' => ['required','date'],
            'format' => ['required','in:round_robin,groups_playoffs,single_elimination'],
            'max_teams' => ['nullable', 'integer', 'min:2', 'max:512'],
            'duration_weeks' => ['nullable', 'integer', 'min:1', 'max:52'],
            'allowed_days' => ['nullable', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'time_slots' => ['nullable', 'array'],
            'time_slots.*' => ['string', 'max:10'],
            'venues_count' => ['nullable', 'integer', 'min:1', 'max:20'],
            'venue_names' => ['nullable', 'array'],
            'venue_names.*' => ['nullable', 'string', 'max:120'],
            'playoff_round_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'groups_to_playoffs_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'group_games_per_day' => ['nullable', 'integer', 'min:1', 'max:100'],
            'registration_deadline' => ['nullable', 'date'],
        ]);

        $validated['created_by'] = $user->id;
        $validated['status'] = 'draft';
        $validated['participants_locked'] = false;
        $validated['duration_weeks'] = $validated['duration_weeks'] ?? 1;
        $validated['venues_count'] = $validated['venues_count'] ?? 1;
        $validated['start_date'] = $validated['start_date'] ?? $validated['end_date'];
        $validated['playoff_round_gap_days'] = $validated['playoff_round_gap_days'] ?? 1;
        $validated['groups_to_playoffs_gap_days'] = $validated['groups_to_playoffs_gap_days'] ?? 1;
        $validated['venue_names'] = $this->normalizeVenueNames($validated['venue_names'] ?? [], (int) $validated['venues_count']);

        $tournament = Tournament::create($validated);

        return response()->json($tournament, 201);
    }

    public function update(Request $request, Tournament $tournament)
    {
        $validated = $request->validate([
            'name' => ['sometimes','string','max:150'],
            'start_date' => ['nullable','date'],
            'end_date' => ['nullable','date'],
            'format' => ['sometimes','in:round_robin,groups_playoffs,single_elimination'],
            'status' => ['sometimes','in:draft,published,finished,cancelled'],
            'max_teams' => ['nullable', 'integer', 'min:2', 'max:512'],
            'duration_weeks' => ['nullable', 'integer', 'min:1', 'max:52'],
            'allowed_days' => ['nullable', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'time_slots' => ['nullable', 'array'],
            'time_slots.*' => ['string', 'max:10'],
            'venues_count' => ['nullable', 'integer', 'min:1', 'max:20'],
            'venue_names' => ['nullable', 'array'],
            'venue_names.*' => ['nullable', 'string', 'max:120'],
            'playoff_round_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'groups_to_playoffs_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'group_games_per_day' => ['nullable', 'integer', 'min:1', 'max:100'],
            'registration_deadline' => ['nullable', 'date'],
            'participants_locked' => ['sometimes', 'boolean'],
        ]);

        $validated['venues_count'] = $validated['venues_count'] ?? ($tournament->venues_count ?? 1);
        $validated['playoff_round_gap_days'] = $validated['playoff_round_gap_days'] ?? ($tournament->playoff_round_gap_days ?? 1);
        $validated['groups_to_playoffs_gap_days'] = $validated['groups_to_playoffs_gap_days'] ?? ($tournament->groups_to_playoffs_gap_days ?? 1);
        if (array_key_exists('venue_names', $validated)) {
            $validated['venue_names'] = $this->normalizeVenueNames($validated['venue_names'] ?? [], (int) $validated['venues_count']);
        }

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

    private function normalizeVenueNames(array $venueNames, int $venuesCount): array
    {
        $venuesCount = max(1, min(20, $venuesCount));
        $normalized = [];

        for ($index = 0; $index < $venuesCount; $index++) {
            $name = trim((string) ($venueNames[$index] ?? ''));
            $normalized[] = $name !== '' ? $name : 'Court ' . ($index + 1);
        }

        return $normalized;
    }
}
