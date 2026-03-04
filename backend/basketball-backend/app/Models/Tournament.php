<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tournament extends Model
{
    protected $fillable = [
        'name',
        'start_date',
        'end_date',
        'format',
        'status',
        'created_by',
        'max_teams',
        'duration_weeks',
        'allowed_days',
        'time_slots',
        'venues_count',
        'registration_deadline',
        'participants_locked',
    ];

    protected function casts(): array
    {
        return [
            'allowed_days' => 'array',
            'time_slots' => 'array',
            'participants_locked' => 'boolean',
        ];
    }

    public function teams()
    {
        return $this->belongsToMany(Team::class, 'tournament_teams');
    }

    public function matches()
    {
        return $this->hasMany(Game::class, 'tournament_id');
    }

    public function participationRequests()
    {
        return $this->hasMany(TournamentParticipationRequest::class);
    }
}
