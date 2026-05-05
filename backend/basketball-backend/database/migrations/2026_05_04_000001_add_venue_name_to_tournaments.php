<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tournaments') && !Schema::hasColumn('tournaments', 'venue_name')) {
            Schema::table('tournaments', function (Blueprint $table) {
                $table->string('venue_name', 150)->nullable()->after('time_slots');
            });
        }

        if (Schema::hasTable('tournaments') && Schema::hasColumn('tournaments', 'venue_names')) {
            DB::table('tournaments')
                ->whereNull('venue_name')
                ->orderBy('id')
                ->chunkById(100, function ($tournaments): void {
                    foreach ($tournaments as $tournament) {
                        $venueNames = json_decode($tournament->venue_names ?? '[]', true);
                        $firstVenue = is_array($venueNames) ? trim((string) ($venueNames[0] ?? '')) : '';
                        if ($firstVenue !== '') {
                            DB::table('tournaments')
                                ->where('id', $tournament->id)
                                ->update(['venue_name' => $firstVenue]);
                        }
                    }
                });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tournaments') && Schema::hasColumn('tournaments', 'venue_name')) {
            Schema::table('tournaments', function (Blueprint $table) {
                $table->dropColumn('venue_name');
            });
        }
    }
};
