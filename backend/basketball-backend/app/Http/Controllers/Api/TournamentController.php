<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tournament;
use App\Support\PdfExportBuilder;
use App\Models\TournamentTeam;
use App\Support\SchedulingFeasibility;
use App\Support\TournamentProgression;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TournamentController extends Controller
{
    public function index()
    {
        return Tournament::withCount('matches')->orderByDesc('id')->get();
    }

    public function show(Tournament $tournament)
    {
        return $tournament->loadCount('matches')->load([
            'teams',
            'matches.homeTeam',
            'matches.awayTeam',
        ]);
    }

    public function feasibility(Tournament $tournament)
    {
        $teams = TournamentTeam::where('tournament_id', $tournament->id)->count();
        return SchedulingFeasibility::evaluate($tournament, $teams);
    }

    public function exportPdf(Request $request, Tournament $tournament)
    {
        $data = $request->validate([
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string', 'in:teams,standings,schedule,playoffs,feasibility'],
        ]);

        $pdf = PdfExportBuilder::tournament($tournament, $data['sections'] ?? []);
        $name = Str::slug($tournament->name ?: ('tournament-' . $tournament->id));
        $file = ($name !== '' ? $name : 'tournament-' . $tournament->id) . '-report.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $file . '"',
            'Content-Length' => (string) strlen($pdf),
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Please login again.'], 401);
        }

        $data = $request->validate([
            'name' => ['required','string','max:150'],
            'banner_url' => ['nullable', 'url', 'max:2048'],
            'start_date' => ['nullable','date'],
            'end_date' => ['required','date'],
            'format' => ['required','in:round_robin,groups_playoffs,single_elimination'],
            'max_teams' => ['nullable', 'integer', 'min:2', 'max:512'],
            'group_size' => ['nullable', 'integer', 'in:4,8'],
            'group_advance_count' => ['nullable', 'integer', 'min:1', 'max:512'],
            'duration_weeks' => ['nullable', 'integer', 'min:1', 'max:52'],
            'allowed_days' => ['nullable', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'time_slots' => ['nullable', 'array', $this->slotCountRule()],
            'time_slots.*' => ['string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'venue_name' => ['nullable', 'string', 'max:150'],
            'playoff_round_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'groups_to_playoffs_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'group_games_per_day' => ['nullable', 'integer', 'in:2,4,6,8'],
            'stage_day_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'registration_deadline' => ['nullable', 'date'],
        ]);

        $data = $this->normalizeGroupRules($data, $data['format'] ?? null);
        if (($data['format'] ?? null) === 'groups_playoffs' && !$this->validGroupSetup($data['max_teams'] ?? null, $data['group_size'] ?? null, $data['group_advance_count'] ?? null)) {
            return response()->json(['message' => 'Choose group rules that create a 2, 4, 8, or 16 team playoff bracket.'], 422);
        }
        if (($data['format'] ?? null) === 'round_robin' && !$this->validRoundRobinAdvanceCount($data['max_teams'] ?? null, $data['group_advance_count'] ?? null)) {
            return response()->json(['message' => 'Round robin playoff teams must be 2, 4, 8, 16, or 32 and cannot exceed max teams.'], 422);
        }
        if (($data['format'] ?? null) === 'single_elimination' && !$this->validKoSize($data['max_teams'] ?? null)) {
            return response()->json(['message' => 'Single elimination tournaments support 4, 8, 16, or 32 teams.'], 422);
        }

        $data['created_by'] = $user->id;
        $data['status'] = 'draft';
        $data['participants_locked'] = false;
        $data['duration_weeks'] = $data['duration_weeks'] ?? 1;
        $data['start_date'] = $data['start_date'] ?? $data['end_date'];
        $data['playoff_round_gap_days'] = $data['playoff_round_gap_days'] ?? 1;
        $data['groups_to_playoffs_gap_days'] = $data['groups_to_playoffs_gap_days'] ?? 1;
        $data['stage_day_gap_days'] = $data['stage_day_gap_days'] ?? 0;
        $data['venue_name'] = $this->venueName($data['venue_name'] ?? null);

        $tournament = Tournament::create($data);

        return response()->json($tournament, 201);
    }

    public function update(Request $request, Tournament $tournament)
    {
        $data = $request->validate([
            'name' => ['sometimes','string','max:150'],
            'banner_url' => ['nullable', 'url', 'max:2048'],
            'start_date' => ['nullable','date'],
            'end_date' => ['nullable','date'],
            'format' => ['sometimes','in:round_robin,groups_playoffs,single_elimination'],
            'status' => ['sometimes','in:draft,published,finished,cancelled'],
            'max_teams' => ['nullable', 'integer', 'min:2', 'max:512'],
            'group_size' => ['nullable', 'integer', 'in:4,8'],
            'group_advance_count' => ['nullable', 'integer', 'min:1', 'max:512'],
            'duration_weeks' => ['nullable', 'integer', 'min:1', 'max:52'],
            'allowed_days' => ['nullable', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'time_slots' => ['nullable', 'array', $this->slotCountRule()],
            'time_slots.*' => ['string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'venue_name' => ['nullable', 'string', 'max:150'],
            'playoff_round_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'groups_to_playoffs_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'group_games_per_day' => ['nullable', 'integer', 'in:2,4,6,8'],
            'stage_day_gap_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'registration_deadline' => ['nullable', 'date'],
            'participants_locked' => ['sometimes', 'boolean'],
        ]);

        $fmt = $data['format'] ?? $tournament->format;
        $maxTeams = array_key_exists('max_teams', $data) ? $data['max_teams'] : $tournament->max_teams;
        $groupSize = array_key_exists('group_size', $data) ? $data['group_size'] : $tournament->group_size;
        $advanceCount = array_key_exists('group_advance_count', $data) ? $data['group_advance_count'] : $tournament->group_advance_count;
        $data = $this->normalizeGroupRules($data, $fmt, $maxTeams, $groupSize, $advanceCount);
        $groupSize = $data['group_size'] ?? $groupSize;
        $advanceCount = $data['group_advance_count'] ?? $advanceCount;
        if ($fmt === 'groups_playoffs' && !$this->validGroupSetup($maxTeams, $groupSize, $advanceCount)) {
            return response()->json(['message' => 'Choose group rules that create a 2, 4, 8, or 16 team playoff bracket.'], 422);
        }
        if ($fmt === 'round_robin' && !$this->validRoundRobinAdvanceCount($maxTeams, $advanceCount)) {
            return response()->json(['message' => 'Round robin playoff teams must be 2, 4, 8, 16, or 32 and cannot exceed max teams.'], 422);
        }
        if ($fmt === 'single_elimination' && !$this->validKoSize($maxTeams)) {
            return response()->json(['message' => 'Single elimination tournaments support 4, 8, 16, or 32 teams.'], 422);
        }

        $data['playoff_round_gap_days'] = $data['playoff_round_gap_days'] ?? ($tournament->playoff_round_gap_days ?? 1);
        $data['groups_to_playoffs_gap_days'] = $data['groups_to_playoffs_gap_days'] ?? ($tournament->groups_to_playoffs_gap_days ?? 1);
        $data['stage_day_gap_days'] = $data['stage_day_gap_days'] ?? ($tournament->stage_day_gap_days ?? 0);
        if (array_key_exists('venue_name', $data)) {
            $data['venue_name'] = $this->venueName($data['venue_name'] ?? null);
        }

        $tournament->update($data);

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
        if ($tournament->matches()->exists()) {
            return response()->json([
                'message' => 'Clear the schedule before unlocking participants.',
            ], 409);
        }

        $tournament->participants_locked = false;
        $tournament->save();

        return response()->json(['message' => 'Participants unlocked']);
    }

    public function destroy(Tournament $tournament)
    {
        $tournament->delete();
        return response()->json(['message' => 'Deleted'], 200);
    }

    private function venueName(?string $venueName): ?string
    {
        $name = trim((string) ($venueName ?? ''));
        return $name !== '' ? $name : null;
    }

    private function slotCountRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if (is_array($value) && !in_array(count($value), [2, 4, 6, 8], true)) {
                $fail('Choose 2, 4, 6, or 8 time slots.');
            }
        };
    }

    private function validGroupSize(mixed $teamCount): bool
    {
        return in_array((int) $teamCount, [4, 8, 16, 32], true);
    }

    private function validKoSize(mixed $teamCount): bool
    {
        return in_array((int) $teamCount, [4, 8, 16, 32], true);
    }

    private function normalizeGroupRules(array $data, mixed $format = null, mixed $teamCount = null, mixed $groupSize = null, mixed $advanceCount = null): array
    {
        $resolvedFormat = $data['format'] ?? $format;

        if ($resolvedFormat === 'round_robin') {
            $data['group_size'] = (int) ($groupSize ?? 4) ?: 4;
            $data['group_advance_count'] = $this->normalizeRoundRobinAdvanceCount(
                $data['max_teams'] ?? $teamCount ?? 8,
                $data['group_advance_count'] ?? $advanceCount ?? null,
            );
            return $data;
        }

        if ($resolvedFormat !== 'groups_playoffs') {
            $data['group_size'] = (int) ($groupSize ?? 4) ?: 4;
            $data['group_advance_count'] = 2;
            return $data;
        }

        $teamCount = (int) ($data['max_teams'] ?? $teamCount ?? 8);
        $groupSize = (int) ($data['group_size'] ?? $groupSize ?? 4);
        $advanceCount = (int) ($data['group_advance_count'] ?? $advanceCount ?? 2);

        if (!TournamentProgression::validGroupPlayoffSetup($teamCount, $groupSize, $advanceCount)) {
            $first = TournamentProgression::groupPlayoffOptions($teamCount)[0] ?? null;
            if ($first) {
                $groupSize = $first['group_size'];
                $advanceCount = $first['group_advance_count'];
            }
        }

        $data['group_size'] = $groupSize;
        $data['group_advance_count'] = $advanceCount;

        return $data;
    }

    private function validGroupSetup(mixed $teamCount, mixed $groupSize, mixed $advanceCount): bool
    {
        return $this->validGroupSize($teamCount)
            && TournamentProgression::validGroupPlayoffSetup((int) $teamCount, (int) $groupSize, (int) $advanceCount);
    }

    private function validRoundRobinAdvanceCount(mixed $teamCount, mixed $advanceCount): bool
    {
        return TournamentProgression::validRoundRobinPlayoffCount((int) $teamCount, (int) $advanceCount);
    }

    private function normalizeRoundRobinAdvanceCount(mixed $teamCount, mixed $advanceCount): int
    {
        $teamCount = max(2, (int) $teamCount);
        $advanceCount = (int) $advanceCount;

        if ($advanceCount > 0 && $this->validRoundRobinAdvanceCount($teamCount, $advanceCount)) {
            return $advanceCount;
        }

        if ($advanceCount > 0) {
            return $advanceCount;
        }

        $options = array_values(array_filter([2, 4, 8, 16, 32], fn (int $count) => $count <= $teamCount));

        return $options[0] ?? 2;
    }
}
