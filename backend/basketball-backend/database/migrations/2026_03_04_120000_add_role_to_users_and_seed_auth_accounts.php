<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'role')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('role', 20)->default('manager')->after('password');
            });
        }

        if (!Schema::hasTable('users')) {
            return;
        }

        $admin = DB::table('users')->where('email', 'admin@example.com')->first();
        if (!$admin) {
            DB::table('users')->insert([
                'name' => 'Admin User',
                'email' => 'admin@example.com',
                'password' => Hash::make('admin123'),
                'role' => 'admin',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $manager = DB::table('users')->where('email', 'manager@example.com')->first();
        if (!$manager) {
            DB::table('users')->insert([
                'name' => 'Manager User',
                'email' => 'manager@example.com',
                'password' => Hash::make('manager123'),
                'role' => 'manager',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('users')) {
            return;
        }

        DB::table('users')->whereIn('email', ['admin@example.com', 'manager@example.com'])->delete();

        if (Schema::hasColumn('users', 'role')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('role');
            });
        }
    }
};
