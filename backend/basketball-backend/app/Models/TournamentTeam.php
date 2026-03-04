<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TournamentTeam extends Model
{
    protected $table = 'tournament_teams';

    protected $fillable = [
        'tournament_id',
        'team_id',
        'group_code',
        'seed',
    ];

    public function team()
    {
        return $this->belongsTo(\App\Models\Team::class);
    }

    public function tournament()
    {
        return $this->belongsTo(\App\Models\Tournament::class);
    }
}