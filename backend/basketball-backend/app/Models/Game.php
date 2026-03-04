<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Game extends Model
{
    protected $table = 'matches';

    protected $fillable = [
        'tournament_id',
        'home_team_id',
        'away_team_id',
        'venue_id',
        'stage',
        'group_code',
        'round_number',
        'scheduled_at',
        'home_score',
        'away_score',
        'status'
    ];

    public function tournament()
    {
        return $this->belongsTo(Tournament::class);
    }

    public function homeTeam()
    {
        return $this->belongsTo(Team::class, 'home_team_id');
    }

    public function awayTeam()
    {
        return $this->belongsTo(Team::class, 'away_team_id');
    }

    public function stats()
    {
        return $this->hasMany(MatchPlayerStat::class, 'match_id');
    }
}