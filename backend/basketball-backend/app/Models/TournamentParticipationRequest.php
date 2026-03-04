<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TournamentParticipationRequest extends Model
{
    protected $table = 'tournament_participation_requests';

    protected $fillable = [
        'tournament_id',
        'team_id',
        'manager_id',
        'status',
        'note',
        'reviewed_by',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
        ];
    }

    public function tournament()
    {
        return $this->belongsTo(Tournament::class);
    }

    public function team()
    {
        return $this->belongsTo(Team::class);
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
