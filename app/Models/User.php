<?php

namespace App\Models;

use App\Support\PrivateMedia;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $fillable = [
        'student_id', 'first_name', 'middle_name', 'last_name', 'email',
        'course', 'password', 'profile_photo', 'email_verified_at',
    ];

    protected $hidden = ['password', 'remember_token'];

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

    public function settings(): HasOne
    {
        return $this->hasOne(UserSetting::class);
    }

    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(PushSubscription::class);
    }

    public function photo(): HasOne
    {
        return $this->hasOne(UserPhoto::class);
    }

    /**
     * Address of this account's photo, or null (-> initials). The photo counts as present when it is
     * stored in the database (survives redeploys) or, for old accounts, still on disk.
     */
    public function photoUrl(): ?string
    {
        if (! $this->profile_photo) {
            return null;
        }
        if ($this->photo()->exists()) {
            return PrivateMedia::url($this->profile_photo);
        }

        return PrivateMedia::urlIfExists($this->profile_photo);
    }

    public function hostClients(): HasMany
    {
        return $this->hasMany(HostClient::class);
    }

    public function dutyEntries(): HasMany
    {
        return $this->hasMany(DutyEntry::class);
    }

    public function userNotifications(): HasMany
    {
        return $this->hasMany(UserNotification::class);
    }

    public function fullName(): string
    {
        return trim(implode(' ', array_filter([$this->first_name, $this->middle_name, $this->last_name])));
    }

    /** Shape the React app consumes. */
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
            // Own photo URL (only this account's session can open it), or null -> initials.
            'picture' => $picture = $this->photoUrl(),
            'has_profile_photo' => $picture !== null,
            'has_password' => $this->password !== null,
            // Colour theme saved on the account (null = never chosen; the device keeps its own).
            'theme' => $this->settings?->theme,
            // The React app sends unverified accounts to /verify-email.
            'email_verified' => $this->hasVerifiedEmail(),
        ];
    }

    /**
     * Password reset email: branded blade, link opens the SPA page /reset-password/{token}?email=...
     * (there is no server-rendered "password.reset" route in this app).
     */
    public function sendPasswordResetNotification($token): void
    {
        $url = rtrim(config('app.url'), '/').'/reset-password/'.$token.'?email='.urlencode($this->getEmailForPasswordReset());

        \Illuminate\Support\Facades\Mail::to($this->email)->send(
            new \App\Mail\PasswordResetMail($this->first_name ?: $this->fullName(), $url, $this->email)
        );
    }
}
