<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MatchPlayerStat extends Model
{
    protected $table = 'match_player_stats';

    protected $fillable = [
        'match_id',
        'player_id',
        'team_id',
        'minutes',
        'dnp',
        'fouled_out',
        'points',
        'rebounds',
        'assists',
        'steals',
        'blocks',
        'fouls',
        'fgm',
        'fga',
        'tpm',
        'tpa',
        'ftm',
        'fta'
    ];

    protected $casts = [
        'dnp' => 'boolean',
        'fouled_out' => 'boolean',
    ];

    public function game()
    {
        return $this->belongsTo(Game::class, 'match_id');
    }

    public function player()
    {
        return $this->belongsTo(Player::class);
    }
}
