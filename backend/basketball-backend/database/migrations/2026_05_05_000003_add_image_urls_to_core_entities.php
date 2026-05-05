<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('teams') && !Schema::hasColumn('teams', 'logo_url')) {
            Schema::table('teams', function (Blueprint $table): void {
                $table->string('logo_url', 2048)->nullable()->after('city');
            });
        }

        if (Schema::hasTable('tournaments') && !Schema::hasColumn('tournaments', 'banner_url')) {
            Schema::table('tournaments', function (Blueprint $table): void {
                $table->string('banner_url', 2048)->nullable()->after('name');
            });
        }

        if (Schema::hasTable('players') && !Schema::hasColumn('players', 'photo_url')) {
            Schema::table('players', function (Blueprint $table): void {
                $table->string('photo_url', 2048)->nullable()->after('last_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('players') && Schema::hasColumn('players', 'photo_url')) {
            Schema::table('players', function (Blueprint $table): void {
                $table->dropColumn('photo_url');
            });
        }

        if (Schema::hasTable('tournaments') && Schema::hasColumn('tournaments', 'banner_url')) {
            Schema::table('tournaments', function (Blueprint $table): void {
                $table->dropColumn('banner_url');
            });
        }

        if (Schema::hasTable('teams') && Schema::hasColumn('teams', 'logo_url')) {
            Schema::table('teams', function (Blueprint $table): void {
                $table->dropColumn('logo_url');
            });
        }
    }
};
