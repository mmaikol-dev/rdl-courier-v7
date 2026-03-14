<?php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Notifications\Notifiable;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Str;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'uuid',
        'photo',
        'name',
        'username',
        'email',
        'password',
        "store_name",
        "store_address",
        "store_phone",
        'roles', 
        "store_email",
        "email_verified_at",
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        
        'created_at' => 'datetime',
        'updated_at' => 'datetime'
    ];

    public function scopeSearch($query, $value): void
    {
        $query->where('name', 'like', "%{$value}%")
            ->orWhere('email', 'like', "%{$value}%");
    }

  
    public function hasRole($role)
{
    return $this->roles()->where('name', $role)->exists();
}
protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->uuid)) {
                $model->uuid = (string) Str::uuid();
            }
        });
    }

    public function locations(): HasMany
    {
        return $this->hasMany(UserLocation::class);
    }

    public function latestLocation(): HasOne
    {
        return $this->hasOne(UserLocation::class)->latestOfMany('recorded_at');
    }

    public function loginLocations(): HasMany
    {
        return $this->hasMany(UserLoginLocation::class);
    }

    public function latestLoginLocation(): HasOne
    {
        return $this->hasOne(UserLoginLocation::class)->latestOfMany('logged_in_at');
    }

}
