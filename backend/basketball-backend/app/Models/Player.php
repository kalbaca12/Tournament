<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Player extends Model
{
    protected $fillable = [
        'team_id',
        'first_name',
        'last_name',
        'jersey_number'
    ];

    public function team()
    {
        return $this->belongsTo(Team::class);
    }
    public function tournamentEntries()
    {
        return $this->hasMany(TournamentTeamPlayer::class, 'player_id');
    }
}
