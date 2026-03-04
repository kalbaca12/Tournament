<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Venue extends Model
{
    protected $fillable = [
        'name',
        'address',
    ];

    public function games(): HasMany
    {
        return $this->hasMany(Game::class, 'venue_id');
    }
}