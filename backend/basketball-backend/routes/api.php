<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;

use App\Http\Controllers\Api\TournamentController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\PlayerController;

use App\Http\Controllers\Api\TournamentTeamController;
use App\Http\Controllers\Api\TournamentRosterController;

use App\Http\Controllers\Api\ScheduleController;
use App\Http\Controllers\Api\MatchController;
use App\Http\Controllers\Api\MatchStatController;
use App\Http\Controllers\Api\StandingsController;
use App\Http\Controllers\Api\ParticipationRequestController;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
});

Route::get('/tournaments', [TournamentController::class, 'index']);
Route::get('/tournaments/{tournament}', [TournamentController::class, 'show']);
Route::get('/tournaments/{tournament}/feasibility', [TournamentController::class, 'feasibility']);

Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::post('/tournaments', [TournamentController::class, 'store']);
    Route::put('/tournaments/{tournament}', [TournamentController::class, 'update']);
    Route::delete('/tournaments/{tournament}', [TournamentController::class, 'destroy']);
    Route::post('/tournaments/{tournament}/lock-participants', [TournamentController::class, 'lockParticipants']);
    Route::post('/tournaments/{tournament}/unlock-participants', [TournamentController::class, 'unlockParticipants']);
});

Route::get('/teams', [TeamController::class, 'index']);

Route::middleware(['auth:sanctum', 'role:manager'])->group(function () {
    Route::get('/teams/my', [TeamController::class, 'mine']);
    Route::post('/teams', [TeamController::class, 'store']);
    Route::put('/teams/{team}', [TeamController::class, 'update']);
    Route::delete('/teams/{team}', [TeamController::class, 'destroy']);
    Route::post('/players', [PlayerController::class, 'store']);
    Route::put('/players/{player}', [PlayerController::class, 'update']);
    Route::delete('/players/{player}', [PlayerController::class, 'destroy']);
    Route::get('/tournaments/{tournament}/participation-requests/mine', [ParticipationRequestController::class, 'managerIndex']);
    Route::post('/tournaments/{tournament}/participation-requests', [ParticipationRequestController::class, 'store']);
});
Route::get('/teams/{team}', [TeamController::class, 'show']);
Route::get('/teams/{team}/matches', [TeamController::class, 'matches']);

Route::get('/players', [PlayerController::class, 'index']);
Route::get('/players/{player}', [PlayerController::class, 'show']);

Route::get('/tournaments/{tournament}/teams', [TournamentTeamController::class, 'index']);

Route::get('/tournaments/{tournament}/teams/{team}/players', [TournamentRosterController::class, 'index']);
Route::post('/tournaments/{tournament}/teams/{team}/players', [TournamentRosterController::class, 'store']);
Route::delete('/tournaments/{tournament}/teams/{team}/players/{player}', [TournamentRosterController::class, 'destroy']);

Route::get('/tournaments/{tournament}/matches', [MatchController::class, 'index']);
Route::get('/matches/{game}', [MatchController::class, 'show']);


Route::get('/matches/{game}/stats', [MatchStatController::class, 'index']);


Route::get('/tournaments/{tournament}/standings', [StandingsController::class, 'index']);

Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::get('/tournaments/{tournament}/participation-requests', [ParticipationRequestController::class, 'adminIndex']);
    Route::post('/participation-requests/{requestRow}/approve', [ParticipationRequestController::class, 'approve']);
    Route::post('/participation-requests/{requestRow}/reject', [ParticipationRequestController::class, 'reject']);

    Route::post('/tournaments/{tournament}/teams', [TournamentTeamController::class, 'store']);
    Route::delete('/tournaments/{tournament}/teams/{team}', [TournamentTeamController::class, 'destroy']);

    Route::post('/tournaments/{tournament}/generate-schedule', [ScheduleController::class, 'generateRoundRobin']);
    Route::delete('/tournaments/{tournament}/schedule', [ScheduleController::class, 'clearSchedule']);

    Route::post('/tournaments/{tournament}/matches', [MatchController::class, 'store']);
    Route::put('/matches/{game}', [MatchController::class, 'update']);
    Route::delete('/matches/{game}', [MatchController::class, 'destroy']);
    Route::post('/matches/{game}/result', [MatchController::class, 'setResult']);
    Route::post('/matches/{game}/stats', [MatchStatController::class, 'storeBulk']);
});
