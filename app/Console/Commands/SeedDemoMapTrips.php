<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\UserLocation;
use App\Models\UserLoginLocation;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SeedDemoMapTrips extends Command
{
    protected $signature = 'maps:seed-demo {--fresh : Remove existing demo trip rows before seeding}';

    protected $description = 'Seed Kenya-based demo trip data into user_locations and user_login_locations.';

    public function handle(): int
    {
        if ($this->option('fresh')) {
            UserLocation::query()->where('source', 'demo')->delete();
            UserLoginLocation::query()->where('source', 'demo')->delete();
        }

        $users = collect([
            [
                'name' => 'Fatma Coast',
                'email' => 'fatma.mombasa@demo.local',
                'roles' => 'agent',
                'county' => 'Mombasa',
                'trail' => [
                    [-4.043477, 39.668206], // Mombasa CBD
                    [-4.046200, 39.671900],
                    [-4.049500, 39.676300],
                    [-4.052700, 39.680100], // Tononoka
                    [-4.056000, 39.684700],
                    [-4.059200, 39.689000], // Tudor
                    [-4.050800, 39.694800],
                    [-4.039500, 39.699700], // Nyali bridge side
                    [-4.032900, 39.706800], // Nyali
                    [-4.026800, 39.714200],
                    [-4.042500, 39.672100], // back toward island
                    [-4.048900, 39.665900],
                ],
            ],
            [
                'name' => 'Brian Kisii',
                'email' => 'brian.kisii@demo.local',
                'roles' => 'agent',
                'county' => 'Kisii',
                'trail' => [
                    [-0.677334, 34.779603], // Kisii town
                    [-0.679400, 34.782900],
                    [-0.681600, 34.786400],
                    [-0.684100, 34.790000],
                    [-0.686500, 34.793500], // Daraja Mbili side
                    [-0.688900, 34.797100],
                    [-0.692200, 34.801300],
                    [-0.695800, 34.806000],
                    [-0.690300, 34.789800], // loop back
                    [-0.685700, 34.784600],
                    [-0.681200, 34.778900],
                    [-0.676900, 34.774200],
                ],
            ],
            [
                'name' => 'Joy Nakuru',
                'email' => 'joy.nakuru@demo.local',
                'roles' => 'agent',
                'county' => 'Nakuru',
                'trail' => [
                    [-0.303099, 36.080026], // Nakuru CBD
                    [-0.300800, 36.083700],
                    [-0.298000, 36.088100],
                    [-0.295300, 36.092200], // Milimani side
                    [-0.292600, 36.096000],
                    [-0.289900, 36.100400],
                    [-0.286700, 36.105700],
                    [-0.282900, 36.111400], // Lanet
                    [-0.289100, 36.098600],
                    [-0.294800, 36.090500],
                    [-0.299500, 36.084400],
                    [-0.304100, 36.078300],
                ],
            ],
            [
                'name' => 'Dennis Eldoret',
                'email' => 'dennis.eldoret@demo.local',
                'roles' => 'agent',
                'county' => 'Uasin Gishu',
                'trail' => [
                    [0.514277, 35.269780], // Eldoret CBD
                    [0.517100, 35.273400],
                    [0.520000, 35.277900],
                    [0.522900, 35.282200],
                    [0.525500, 35.286800], // Kapsoya side
                    [0.528100, 35.291000],
                    [0.531500, 35.296100],
                    [0.535200, 35.301700],
                    [0.529800, 35.287500],
                    [0.524600, 35.280100],
                    [0.519400, 35.273100],
                    [0.514900, 35.267400],
                ],
            ],
            [
                'name' => 'Mercy Kakamega',
                'email' => 'mercy.kakamega@demo.local',
                'roles' => 'dispatcher',
                'county' => 'Kakamega',
                'trail' => [
                    [0.282731, 34.751968], // Kakamega town
                    [0.285200, 34.755400],
                    [0.287700, 34.759200],
                    [0.290100, 34.762900],
                    [0.292500, 34.766600], // Amalemba side
                    [0.294900, 34.770300],
                    [0.297600, 34.774100],
                    [0.300300, 34.777900],
                    [0.295100, 34.769400],
                    [0.290600, 34.762700],
                    [0.286400, 34.756600],
                    [0.283100, 34.752800],
                ],
            ],
        ]);

        $baseTime = now()->subMinutes(55);

        foreach ($users as $userConfig) {
            $user = User::query()->updateOrCreate(
                ['email' => $userConfig['email']],
                [
                'name' => $userConfig['name'],
                    'username' => Str::slug($userConfig['name']),
                    'password' => Hash::make('password'),
                    'roles' => $userConfig['roles'],
                    'email_verified_at' => now(),
                ]
            );

            UserLocation::query()->where('user_id', $user->id)->where('source', 'demo')->delete();
            UserLoginLocation::query()->where('user_id', $user->id)->where('source', 'demo')->delete();

            $start = $baseTime->copy()->subMinutes(random_int(0, 10));
            $firstPoint = $userConfig['trail'][0];

            UserLoginLocation::query()->create([
                'user_id' => $user->id,
                'latitude' => $firstPoint[0],
                'longitude' => $firstPoint[1],
                'accuracy_meters' => 10,
                'source' => 'demo',
                'ip_address' => '127.0.0.1',
                'user_agent' => 'Demo map seeder',
                'logged_in_at' => $start->copy()->subMinutes(12),
                'meta' => ['demo' => true, 'country' => 'Kenya', 'county' => $userConfig['county']],
            ]);

            foreach ($userConfig['trail'] as $index => $coordinate) {
                UserLocation::query()->create([
                    'user_id' => $user->id,
                    'latitude' => $coordinate[0],
                    'longitude' => $coordinate[1],
                    'accuracy_meters' => 7 + ($index % 4),
                    'speed_mps' => 6.5 + ($index * 0.8),
                    'heading_degrees' => 35 + ($index * 20),
                    'event_type' => $index === 0 ? 'heartbeat' : 'moving',
                    'source' => 'demo',
                    'ip_address' => '127.0.0.1',
                    'user_agent' => 'Demo map seeder',
                    'meta' => ['demo' => true, 'country' => 'Kenya', 'county' => $userConfig['county']],
                    'recorded_at' => $start->copy()->addMinutes($index * 6),
                ]);
            }
        }

        $this->info('Kenya demo trip data inserted into the database.');

        return self::SUCCESS;
    }
}
