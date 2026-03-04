<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Team extends Model
{
    protected $fillable = ['name', 'city', 'manager_id'];

    public function players()
    {
        return $this->hasMany(Player::class);
    }

    public function tournaments()
    {
        return $this->belongsToMany(
            Tournament::class,
            'tournament_teams'
        );
    }
    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function homeGames()
    {
        return $this->hasMany(Game::class, 'home_team_id');
    }

    public function awayGames()
    {
        return $this->hasMany(Game::class, 'away_team_id');
    }
}
