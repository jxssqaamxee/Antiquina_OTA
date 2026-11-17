<?php

namespace App\Models;

use App\Support\PrivateMedia;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory;

    protected $fillable = [
        'student_id', 'first_name', 'middle_name', 'last_name', 'email',
        'course', 'password', 'google_id', 'avatar', 'profile_photo', 'email_verified_at',
    ];

    protected $hidden = ['password', 'remember_token', 'google_id'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function documents(): HasMany
    {
        return $this->hasMany(UserDocument::class);
    }

    public function fullName(): string
    {
        return trim(implode(' ', array_filter([$this->first_name, $this->middle_name, $this->last_name])));
    }

    /** Shape the React app consumes (kept compatible with the old Google profile: name/email/picture/sub). */
    public function toClient(): array
    {
        return [
            'id' => $this->id,
            'sub' => 'u'.$this->id,
            'student_id' => $this->student_id,
            'first_name' => $this->first_name,
            'middle_name' => $this->middle_name,
            'last_name' => $this->last_name,
            'name' => $this->fullName(),
            'email' => $this->email,
            'course' => $this->course,
            // Uploaded photo (signed private URL) first, then the Google picture, then null -> initials.
            'picture' => PrivateMedia::url($this->profile_photo) ?? $this->avatar,
            'has_profile_photo' => $this->profile_photo !== null,
            'has_password' => $this->password !== null,
            'has_google' => $this->google_id !== null,
        ];
    }
}
