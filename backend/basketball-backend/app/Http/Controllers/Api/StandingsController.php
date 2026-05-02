<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tournament;
use App\Support\TournamentStandings;

class StandingsController extends Controller
{
    public function index(Tournament $tournament)
    {
        if ($tournament->format === 'groups_playoffs') {
            return [
                'groups' => TournamentStandings::grouped($tournament),
            ];
        }

        return [
            'rows' => TournamentStandings::overall($tournament),
        ];
    }
}
