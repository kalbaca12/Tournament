<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentTeam;
use Illuminate\Support\Facades\DB;

class StandingsController extends Controller
{
    public function index(Tournament $tournament)
    {
        $teamIds = TournamentTeam::where('tournament_id', $tournament->id)
            ->pluck('team_id')
            ->values()
            ->all();

        if (count($teamIds) === 0) {
            return [];
        }

        $matches = Game::where('tournament_id', $tournament->id)
            ->where('status', 'finished')
            ->whereNotNull('home_score')
            ->whereNotNull('away_score')
            ->get(['home_team_id','away_team_id','home_score','away_score']);

        $table = [];
        foreach ($teamIds as $tid) {
            $table[$tid] = [
                'team_id' => $tid,
                'played' => 0,
                'wins' => 0,
                'losses' => 0,
                'points_for' => 0,
                'points_against' => 0,
                'diff' => 0,
                'points' => 0, 
            ];
        }

        foreach ($matches as $m) {
            $h = (int)$m->home_team_id;
            $a = (int)$m->away_team_id;
            $hs = (int)$m->home_score;
            $as = (int)$m->away_score;

            if (!isset($table[$h]) || !isset($table[$a])) continue;

            $table[$h]['played']++;
            $table[$a]['played']++;

            $table[$h]['points_for'] += $hs;
            $table[$h]['points_against'] += $as;

            $table[$a]['points_for'] += $as;
            $table[$a]['points_against'] += $hs;

            if ($hs > $as) {
                $table[$h]['wins']++;
                $table[$a]['losses']++;
            } elseif ($as > $hs) {
                $table[$a]['wins']++;
                $table[$h]['losses']++;
            } else {
            }
        }

        foreach ($table as &$row) {
            $row['diff'] = $row['points_for'] - $row['points_against'];
            $row['points'] = $row['wins'] * 2 + $row['losses'] * 1;
        }
        unset($row);

        $teams = Team::whereIn('id', $teamIds)->get(['id','name','city'])->keyBy('id');

        $rows = array_values(array_map(function ($r) use ($teams) {
            $t = $teams[$r['team_id']] ?? null;
            $r['team_name'] = $t?->name;
            $r['city'] = $t?->city;
            return $r;
        }, $table));

        usort($rows, function ($x, $y) {
            return [$y['points'], $y['diff'], $y['points_for']]
                <=> [$x['points'], $x['diff'], $x['points_for']];
        });

        $rank = 1;
        foreach ($rows as &$r) {
            $r['rank'] = $rank++;
        }
        unset($r);

        return $rows;
    }
}