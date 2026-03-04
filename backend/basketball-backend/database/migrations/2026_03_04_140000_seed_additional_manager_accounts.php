<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            return;
        }

        $accounts = [
            ['name' => 'Manager One', 'email' => 'manager1@example.com', 'password' => 'manager123'],
            ['name' => 'Manager Two', 'email' => 'manager2@example.com', 'password' => 'manager123'],
            ['name' => 'Manager Three', 'email' => 'manager3@example.com', 'password' => 'manager123'],
            ['name' => 'Manager Four', 'email' => 'manager4@example.com', 'password' => 'manager123'],
        ];

        foreach ($accounts as $account) {
            $existing = DB::table('users')->where('email', $account['email'])->first();
            if ($existing) {
                continue;
            }

            DB::table('users')->insert([
                'name' => $account['name'],
                'email' => $account['email'],
                'password' => Hash::make($account['password']),
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

        DB::table('users')->whereIn('email', [
            'manager1@example.com',
            'manager2@example.com',
            'manager3@example.com',
            'manager4@example.com',
        ])->delete();
    }
};
