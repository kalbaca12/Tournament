<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tournament extends Model
{
    protected $fillable = [
        'name',
        'banner_url',
        'start_date',
        'end_date',
        'format',
        'status',
        'created_by',
        'max_teams',
        'duration_weeks',
        'allowed_days',
        'time_slots',
        'venue_name',
        'venues_count',
        'venue_names',
        'playoff_round_gap_days',
        'groups_to_playoffs_gap_days',
        'group_games_per_day',
        'stage_day_gap_days',
        'registration_deadline',
        'participants_locked',
    ];

    protected function casts(): array
    {
        return [
            'allowed_days' => 'array',
            'time_slots' => 'array',
            'venue_names' => 'array',
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
