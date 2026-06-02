<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('tournaments')) {
            return;
        }

        Schema::table('tournaments', function (Blueprint $table) {
            if (!Schema::hasColumn('tournaments', 'group_size')) {
                $table->unsignedInteger('group_size')->default(4)->after('max_teams');
            }
            if (!Schema::hasColumn('tournaments', 'group_advance_count')) {
                $table->unsignedInteger('group_advance_count')->default(2)->after('group_size');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('tournaments')) {
            return;
        }

        Schema::table('tournaments', function (Blueprint $table) {
            $drop = [];
            foreach (['group_size', 'group_advance_count'] as $column) {
                if (Schema::hasColumn('tournaments', $column)) {
                    $drop[] = $column;
                }
            }
            if ($drop !== []) {
                $table->dropColumn($drop);
            }
        });
    }
};
