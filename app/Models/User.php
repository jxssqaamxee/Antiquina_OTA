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

    public const ROLE_ADMIN = 'admin';
    public const ROLE_COORDINATOR = 'coordinator';
    public const ROLE_TRAINEE = 'trainee';

    /** @var list<string> */
    public const ROLES = [self::ROLE_ADMIN, self::ROLE_COORDINATOR, self::ROLE_TRAINEE];

    /** @var list<string> accounts that sign in with a staff ID */
    public const STAFF_ROLES = [self::ROLE_ADMIN, self::ROLE_COORDINATOR];

    // NOTE: role, staff_id, is_active and deactivated_at are deliberately NOT mass-assignable, so no
    // request body can ever promote an account. Admin code sets them explicitly (forceFill).
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
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'deactivated_at' => 'datetime',
        ];
    }

    /** The account's role. Rows created before roles existed read as trainee. */
    public function roleName(): string
    {
        return in_array($this->role, self::ROLES, true) ? $this->role : self::ROLE_TRAINEE;
    }

    public function hasRole(string ...$roles): bool
    {
        return in_array($this->roleName(), $roles, true);
    }

    public function isAdmin(): bool
    {
        return $this->roleName() === self::ROLE_ADMIN;
    }

    public function isCoordinator(): bool
    {
        return $this->roleName() === self::ROLE_COORDINATOR;
    }

    public function isTrainee(): bool
    {
        return $this->roleName() === self::ROLE_TRAINEE;
    }

    public function isStaff(): bool
    {
        return in_array($this->roleName(), self::STAFF_ROLES, true);
    }

    /** Only an explicit false deactivates (a row without the column yet counts as active). */
    public function isActive(): bool
    {
        return $this->is_active !== false;
    }

    /** Blocks sign-in and ends every session on every device. */
    public function deactivate(): void
    {
        $this->forceFill(['is_active' => false, 'deactivated_at' => now()])->save();
        app(\App\Services\Auth\SessionLogin::class)->revokeAll($this);
    }

    public function reactivate(): void
    {
        $this->forceFill(['is_active' => true, 'deactivated_at' => null])->save();
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(StudentEnrollment::class);
    }

    /** The trainee's open enrollment (course, year level, section) or null. */
    public function currentEnrollment(): ?StudentEnrollment
    {
        return $this->enrollments()->open()->with(['course', 'section.course'])->first();
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
            'role' => $this->roleName(),
            'staff_id' => $this->staff_id,
            'must_change_password' => (bool) $this->must_change_password,
            'student_id' => $this->student_id,
            'first_name' => $this->first_name,
            'middle_name' => $this->middle_name,
            'last_name' => $this->last_name,
            'name' => $this->fullName(),
            'email' => $this->email,
            'course' => $this->course,
            'enrollment' => $this->isTrainee() ? $this->currentEnrollment()?->toClient() : null,
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
