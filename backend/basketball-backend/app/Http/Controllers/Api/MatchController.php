<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use App\Support\PdfExportBuilder;
use App\Support\TournamentProgression;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MatchController extends Controller
{
    public function all(Request $request)
    {
        $data = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Game::with(['homeTeam', 'awayTeam', 'tournament']);

        if (!empty($data['date'])) {
            $query->whereDate('scheduled_at', $data['date']);
        }

        $query
            ->orderByRaw('scheduled_at IS NULL')
            ->orderBy('scheduled_at')
            ->orderBy('id');

        if (!empty($data['limit'])) {
            $query->limit((int) $data['limit']);
        }

        return $query->get();
    }

    public function days(Request $request)
    {
        $data = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
        ]);

        $start = $data['month'] . '-01';
        $end = date('Y-m-t', strtotime($start));

        return Game::query()
            ->whereNotNull('scheduled_at')
            ->whereDate('scheduled_at', '>=', $start)
            ->whereDate('scheduled_at', '<=', $end)
            ->selectRaw('DATE(scheduled_at) as date, COUNT(*) as count')
            ->groupByRaw('DATE(scheduled_at)')
            ->orderBy('date')
            ->get();
    }

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

    public function exportPdf(Request $request, Game $game)
    {
        $data = $request->validate([
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string', 'in:players,leaders,team_totals,box_score'],
        ]);

        $pdf = PdfExportBuilder::match($game, $data['sections'] ?? []);
        $file = 'match-' . $game->id . '-report.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $file . '"',
            'Content-Length' => (string) strlen($pdf),
        ]);
    }

    public function store(Request $request, Tournament $tournament)
    {
        $data = $request->validate([
            'home_team_id' => ['required', 'integer', 'exists:teams,id'],
            'away_team_id' => ['required', 'integer', 'exists:teams,id', 'different:home_team_id'],
            'stage' => ['nullable', 'string', 'max:50'],
            'group_code' => ['nullable', 'string', 'max:5'],
            'round_number' => ['nullable', 'integer', 'min:1'],
            'scheduled_at' => ['nullable', 'date'],
            'venue_name' => ['nullable', 'string', 'max:150'],
            'quarter_length_seconds' => ['nullable', 'integer', 'min:60', 'max:1200'],
            'status' => ['nullable', 'in:scheduled,live,finished,cancelled'],
        ]);

        $regIds = TournamentTeam::where('tournament_id', $tournament->id)
            ->whereIn('team_id', [$data['home_team_id'], $data['away_team_id']])
            ->pluck('team_id')
            ->all();

        if (count($regIds) !== 2) {
            return response()->json([
                'message' => 'Both teams must be registered in this tournament.',
            ], 422);
        }

        $game = Game::create([
            'tournament_id' => $tournament->id,
            'home_team_id' => $data['home_team_id'],
            'away_team_id' => $data['away_team_id'],
            'stage' => $data['stage'] ?? null,
            'group_code' => $data['group_code'] ?? null,
            'round_number' => $data['round_number'] ?? 1,
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'venue_name' => $this->venueName($data['venue_name'] ?? null),
            'quarter_length_seconds' => $data['quarter_length_seconds'] ?? 600,
            'status' => $data['status'] ?? 'scheduled',
        ]);

        return response()->json($game->load(['homeTeam', 'awayTeam']), 201);
    }

    public function update(Request $request, Game $game)
    {
        $data = $request->validate([
            'scheduled_at' => ['nullable','date'],
            'venue_name' => ['nullable', 'string', 'max:150'],
            'quarter_length_seconds' => ['nullable', 'integer', 'min:60', 'max:1200'],
            'status' => ['nullable','in:scheduled,live,finished,cancelled'],
        ]);

        $payload = [
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'venue_name' => $this->venueName($data['venue_name'] ?? null),
            'status' => $data['status'] ?? $game->status,
        ];

        if (array_key_exists('quarter_length_seconds', $data)) {
            $payload['quarter_length_seconds'] = $data['quarter_length_seconds'] ?? 600;
        }

        $game->update($payload);

        return $game;
    }

    public function destroy(Game $game)
    {
        $game->delete();

        return response()->json(['message' => 'Deleted'], 200);
    }

    public function setResult(Request $request, Game $game)
    {
        $data = $request->validate([
            'home_score' => ['required','integer','min:0'],
            'away_score' => ['required','integer','min:0'],
            'status' => ['nullable','in:finished,live'],
        ]);

        DB::transaction(function () use ($game, $data) {
            $game->home_score = $data['home_score'];
            $game->away_score = $data['away_score'];
            $game->status = $data['status'] ?? 'finished';
            $game->save();

            TournamentProgression::sync($game->tournament()->firstOrFail());
        });

        return $game->fresh(['homeTeam', 'awayTeam']);
    }

    public function storeLiveEvents(Request $request, Game $game)
    {
        $quarterLengthSeconds = max(60, min(1200, (int) ($game->quarter_length_seconds ?? 600)));

        $data = $request->validate([
            'events' => ['required', 'array'],
            'events.*.id' => ['required', 'string', 'max:80'],
            'events.*.type' => ['required', 'string', 'in:shot,free_throw,rebound,block,steal,foul,turnover,substitution,quarter_end,stat_adjust'],
            'events.*.quarter' => ['required', 'integer', 'min:1', 'max:4'],
            'events.*.clock' => ['required', 'string', 'max:10'],
            'events.*.elapsed' => ['required', 'integer', 'min:0', 'max:' . $quarterLengthSeconds],
            'events.*.teamSide' => ['nullable', 'string', 'in:home,away'],
            'events.*.createdAt' => ['nullable', 'date'],
            'events.*.playerId' => ['nullable', 'integer', 'exists:players,id'],
            'events.*.points' => ['nullable', 'integer', 'in:2,3'],
            'events.*.made' => ['nullable', 'boolean'],
            'events.*.assistPlayerId' => ['nullable', 'integer', 'exists:players,id'],
            'events.*.reboundPlayerId' => ['nullable', 'integer', 'exists:players,id'],
            'events.*.blockerId' => ['nullable', 'integer', 'exists:players,id'],
            'events.*.shooterId' => ['nullable', 'integer', 'exists:players,id'],
            'events.*.shotPoints' => ['nullable', 'integer', 'in:2,3'],
            'events.*.outPlayerId' => ['nullable', 'integer', 'exists:players,id'],
            'events.*.inPlayerId' => ['nullable', 'integer', 'exists:players,id'],
            'events.*.statKey' => ['nullable', 'string', 'max:40'],
            'events.*.label' => ['nullable', 'string', 'max:40'],
            'events.*.increments' => ['nullable', 'array'],
            'events.*.increments.points' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.rebounds' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.assists' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.steals' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.blocks' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.fouls' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.turnovers' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.fgm' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.fga' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.tpm' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.tpa' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.ftm' => ['nullable', 'integer', 'min:0'],
            'events.*.increments.fta' => ['nullable', 'integer', 'min:0'],
        ]);

        $game->update([
            'live_events' => $data['events'],
        ]);

        return response()->json([
            'message' => 'Live events saved',
            'events' => $game->fresh()->live_events,
        ], 201);
    }

    private function venueName(?string $venueName): ?string
    {
        $name = trim((string) ($venueName ?? ''));
        return $name !== '' ? $name : null;
    }
}
