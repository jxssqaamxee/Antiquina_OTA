<?php

namespace Tests\Feature;

use App\Mail\VerifyEmailMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private const COURSE = 'BSIT — Bachelor of Science in Information Technology';

    protected function setUp(): void
    {
        parent::setUp();
        // Photos go to the private ("local") disk; never touch the real storage/ folder in tests.
        Storage::fake('local');
    }

    private function photo(string $name = 'me.jpg', int $w = 400, int $h = 500): UploadedFile
    {
        return UploadedFile::fake()->image($name, $w, $h);
    }

    private function payload(array $over = []): array
    {
        return array_merge([
            'student_id' => '2024-1-00099',
            'first_name' => 'maria',
            'middle_name' => 'santos',
            'last_name' => 'reyes',
            'email' => 'OCC.Reyes.Maria@gmail.com',
            'course' => self::COURSE,
            'password' => 'Secret-Pass1',
            'password_confirmation' => 'Secret-Pass1',
            'profile_photo' => $this->photo(),
        ], $over);
    }

    public function test_register_creates_user_and_signs_in_with_an_httponly_cookie_not_a_token(): void
    {
        $res = $this->postJson('/api/auth/register', $this->payload());

        $res->assertCreated()->assertJsonPath('user.student_id', '2024-1-00099')
            ->assertJsonPath('user.name', 'Maria Santos Reyes')
            ->assertJsonPath('user.email', 'occ.reyes.maria@gmail.com');
        $this->assertNull($res->json('token'));            // nothing for JavaScript to store
        $this->assertNotNull($res->json('expires_at'));
        $this->assertDatabaseHas('users', ['student_id' => '2024-1-00099']);

        $this->assertAuthenticated('web');
        $cookie = $res->getCookie(config('session.cookie'), false);
        $this->assertNotNull($cookie);
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('strict', $cookie->getSameSite());
    }

    // ---- Email verification (link + 6-digit code, same flow as sclf_APP) ----


    /** @var list<array{to:list<string>,data:array}> */
    private array $sentMail = [];

    private bool $listening = false;

    /**
     * Mail::fake() does not record notification-channel mailables in Laravel 12.72, so these tests
     * read what was really handed to the (array) mailer through the MessageSent event instead.
     */
    private function listenForMail(): void
    {
        $this->sentMail = [];
        if ($this->listening) {
            return; // already listening in this test: only reset what was recorded so far
        }
        $this->listening = true;
        Event::listen(MessageSent::class, function (MessageSent $e) {
            $this->sentMail[] = [
                'to' => array_map(fn ($a) => $a->getAddress(), $e->message->getTo()),
                'data' => $e->data,
            ];
        });
    }

    /** @return list<array{to:list<string>,data:array}> */
    private function mailTo(string $address): array
    {
        return array_values(array_filter($this->sentMail, fn ($m) => in_array($address, $m['to'], true) && isset($m['data']['verifyUrl'])));
    }

    /** Register and return [signed-in user, 6-digit code, signed link] taken from the verification email. */
    private function registerAndGetVerification(): array
    {
        $this->listenForMail();
        $this->postJson('/api/auth/register', $this->payload())->assertCreated();
        $me = User::firstOrFail();

        $sent = $this->mailTo('occ.reyes.maria@gmail.com');
        $this->assertNotEmpty($sent, 'the verification email was not sent');
        $code = $sent[0]['data']['code'];
        $link = $sent[0]['data']['verifyUrl'];

        return [$me, $code, $link];
    }

    public function test_new_account_is_unverified_and_gets_a_verification_email(): void
    {
        [$me, $code, $link] = $this->registerAndGetVerification();

        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);
        $this->assertStringContainsString('/email/verify/', $link);
        $this->assertNull(User::first()->email_verified_at);
        $this->signedIn($me)->getJson('/api/me')->assertOk()->assertJsonPath('user.email_verified', false);
    }

    public function test_unverified_account_cannot_use_the_rest_of_the_api(): void
    {
        [$me] = $this->registerAndGetVerification();

        $this->signedIn($me)->getJson('/api/sync')->assertForbidden()->assertJsonPath('code', 'email_unverified');
        $this->signedIn($me)->putJson('/api/profile', ['first_name' => 'Ana', 'last_name' => 'Lim', 'course' => self::COURSE])
            ->assertForbidden()->assertJsonPath('code', 'email_unverified');
        $this->signedIn($me)->postJson('/api/auth/logout')->assertOk();
    }

    public function test_verifying_with_the_emailed_code_unlocks_the_api(): void
    {
        [$me, $code] = $this->registerAndGetVerification();

        $this->signedIn($me)->postJson('/api/email/verify-code', ['code' => '12345'])
            ->assertStatus(422)->assertJsonValidationErrors('code');
        $wrong = $code === '000000' ? '111111' : '000000';
        $this->signedIn($me)->postJson('/api/email/verify-code', ['code' => $wrong])
            ->assertStatus(422)->assertJsonPath('email_verified', false);

        $this->signedIn($me)->postJson('/api/email/verify-code', ['code' => $code])
            ->assertOk()->assertJsonPath('email_verified', true);

        $this->assertNotNull(User::first()->email_verified_at);
        $this->signedIn($me)->getJson('/api/sync')->assertOk();
    }

    public function test_five_wrong_codes_lock_the_code_until_a_new_email_is_sent(): void
    {
        [$me, $code] = $this->registerAndGetVerification();
        $wrong = $code === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 5; $i++) {
            $this->signedIn($me)->postJson('/api/email/verify-code', ['code' => $wrong])->assertStatus(422);
        }

        // Even the right code no longer works once locked.
        $this->signedIn($me)->postJson('/api/email/verify-code', ['code' => $code])->assertStatus(422);
        $this->assertNull(User::first()->email_verified_at);
    }

    public function test_verifying_with_the_emailed_link_works_without_being_signed_in(): void
    {
        [, , $link] = $this->registerAndGetVerification();

        $this->get($link)->assertRedirect('/login?verify=ok');
        $this->assertNotNull(User::first()->email_verified_at);
    }

    public function test_a_tampered_verification_link_is_refused(): void
    {
        [, , $link] = $this->registerAndGetVerification();

        $this->get($link.'x')->assertRedirect('/login?verify=invalid');
        $this->assertNull(User::first()->email_verified_at);
    }

    public function test_resend_sends_a_new_code_and_an_unverified_email_can_be_corrected(): void
    {
        [$me] = $this->registerAndGetVerification();
        $this->listenForMail();

        $this->signedIn($me)->postJson('/api/email/verification-notification')->assertOk()->assertJsonPath('email_verified', false);
        $this->assertCount(1, $this->mailTo('occ.reyes.maria@gmail.com'));

        $this->signedIn($me)->postJson('/api/email/change', ['current_password' => 'wrong', 'email' => 'occ.reyes.maria2@gmail.com'])
            ->assertStatus(422)->assertJsonValidationErrors('current_password');
        $this->signedIn($me)->postJson('/api/email/change', ['current_password' => 'Secret-Pass1', 'email' => 'occ.santos.maria@gmail.com'])
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $this->signedIn($me)->postJson('/api/email/change', ['current_password' => 'Secret-Pass1', 'email' => 'OCC.Reyes.Maria2@gmail.com'])
            ->assertOk()->assertJsonPath('user.email', 'occ.reyes.maria2@gmail.com');
        $this->assertCount(1, $this->mailTo('occ.reyes.maria2@gmail.com'));
    }

    public function test_an_already_verified_account_is_not_asked_again(): void
    {
        $user = User::factory()->create();

        $this->signedIn($user)->postJson('/api/email/verification-notification')
            ->assertOk()->assertJsonPath('email_verified', true);
        $this->signedIn($user)->getJson('/api/me')->assertJsonPath('user.email_verified', true);
    }

    public function test_register_email_must_follow_school_format(): void
    {
        foreach (['maria@yahoo.com', 'maria.reyes@gmail.com', 'occ.reyes@gmail.com'] as $email) {
            $this->postJson('/api/auth/register', $this->payload(['email' => $email]))
                ->assertStatus(422)->assertJsonValidationErrors('email');
        }
    }

    public function test_register_email_lastname_must_match_last_name(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['email' => 'occ.santos.maria@gmail.com']))
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson('/api/auth/register', $this->payload(['last_name' => 'De la Peña', 'email' => 'occ.delapena.maria12@gmail.com']))
            ->assertCreated();
    }

    public function test_register_student_id_format_and_required_fields(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-0099']))
            ->assertStatus(422)->assertJsonValidationErrors('student_id');

        $this->postJson('/api/auth/register', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['student_id', 'first_name', 'last_name', 'email', 'course', 'password', 'profile_photo']);
    }

    public function test_register_names_reject_digits(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['first_name' => 'Maria2']))
            ->assertStatus(422)->assertJsonValidationErrors('first_name');
    }

    public function test_register_password_policy(): void
    {
        foreach (['short1A', 'alllowercase1', 'ALLUPPERCASE1', 'NoNumbersHere'] as $pw) {
            $this->postJson('/api/auth/register', $this->payload(['password' => $pw, 'password_confirmation' => $pw]))
                ->assertStatus(422)->assertJsonValidationErrors('password');
        }
        $this->postJson('/api/auth/register', $this->payload(['password_confirmation' => 'Different-1']))
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_register_rejects_duplicates_and_unknown_course(): void
    {
        User::factory()->create(['student_id' => '2024-1-00099', 'email' => 'occ.reyes.maria@gmail.com']);

        $this->postJson('/api/auth/register', $this->payload())->assertJsonValidationErrors('student_id');
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-1-00100']))
            ->assertJsonValidationErrors('email');
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-1-00101', 'email' => 'occ.reyes.maria1@gmail.com', 'course' => 'Made Up']))
            ->assertJsonValidationErrors('course');
    }

    public function test_middle_name_is_optional_and_password_required(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['middle_name' => null]))->assertCreated();
        $this->postJson('/api/auth/register', $this->payload(['student_id' => '2024-1-00098', 'email' => 'occ.reyes.maria2@gmail.com', 'password' => null, 'password_confirmation' => null]))
            ->assertJsonValidationErrors('password');
    }

    public function test_login_with_student_id_and_password(): void
    {
        User::factory()->create(['student_id' => '2024-1-00001', 'password' => 'password']);

        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00001', 'password' => 'password'])
            ->assertOk()->assertJsonPath('status', 'ok');
        $this->postJson('/api/auth/login', ['student_id' => ' 2024-1-00001 ', 'password' => 'password'])->assertOk();
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00001', 'password' => 'nope'])
            ->assertStatus(422)->assertJsonValidationErrors('student_id');
        // Student ID is numbers and dashes only (YYYY-N-NNNNN): letters never get as far as a password check.
        $this->postJson('/api/auth/login', ['student_id' => 'nobody', 'password' => 'password'])
            ->assertStatus(422)->assertJsonValidationErrors('student_id');
        $this->postJson('/api/auth/login', ['student_id' => '2024-1-00002', 'password' => 'password'])
            ->assertStatus(422)->assertJsonValidationErrors('student_id');
    }

    public function test_me_and_logout(): void
    {
        $user = User::factory()->create(['student_id' => '2024-1-00001', 'password' => 'password']);
        $res = $this->postJson('/api/auth/login', ['student_id' => '2024-1-00001', 'password' => 'password'])->assertOk();
        $this->assertNull($res->json('token'));
        $this->assertAuthenticated('web');

        $this->signedIn($user)->getJson('/api/me')->assertOk()->assertJsonPath('user.id', $user->id);
        $this->postJson('/api/auth/logout')->assertOk();
        $this->assertGuest('web');
    }

    public function test_login_requires_both_fields(): void
    {
        $this->postJson('/api/auth/login', [])
            ->assertStatus(422)->assertJsonValidationErrors(['student_id', 'password']);
    }

    public function test_password_change_must_differ_and_follow_policy(): void
    {
        $user = User::factory()->create(['password' => 'Old-Password1']);

        $this->signedIn($user)->putJson('/api/profile/password', [
            'current_password' => 'Old-Password1', 'password' => 'Old-Password1', 'password_confirmation' => 'Old-Password1',
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->signedIn($user)->putJson('/api/profile/password', [
            'current_password' => 'Old-Password1', 'password' => 'weak', 'password_confirmation' => 'weak',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_profile_update_validates_names_and_course(): void
    {
        $user = User::factory()->create();

        $this->signedIn($user)->putJson('/api/profile', ['first_name' => '', 'last_name' => 'X1', 'course' => 'Nope'])
            ->assertStatus(422)->assertJsonValidationErrors(['first_name', 'last_name', 'course']);
        $this->signedIn($user)->putJson('/api/profile', ['first_name' => 'ana', 'last_name' => 'lim', 'course' => self::COURSE])
            ->assertOk()->assertJsonPath('user.name', 'Ana Lim');
    }

    // ---- Profile photo -----------------------------------------------------

    public function test_register_with_photo_stores_it_privately_and_serves_it_only_to_its_owner(): void
    {
        $res = $this->postJson('/api/auth/register', $this->payload())->assertCreated();

        $user = User::where('student_id', '2024-1-00099')->first();
        $path = $user->profile_photo;
        $this->assertStringStartsWith('profile-pictures/', $path);
        Storage::disk('local')->assertExists($path);

        // No signed / shareable link: a plain owner-only URL.
        $picture = $res->json('user.picture');
        $this->assertStringStartsWith('/api/me/photo?v=', $picture);
        $this->assertStringNotContainsString('signature=', $picture);
        $res->assertJsonPath('user.has_profile_photo', true);

        $this->signedIn($user)->get('/api/me/photo')->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Type', 'image/jpeg');
    }

    public function test_a_photo_missing_from_disk_is_reported_as_no_photo_instead_of_a_dead_url(): void
    {
        $user = User::factory()->create(['profile_photo' => 'profile-pictures/gone.jpg']);

        $this->signedIn($user)->getJson('/api/me')->assertOk()
            ->assertJsonPath('user.picture', null)
            ->assertJsonPath('user.has_profile_photo', false);
    }

    public function test_register_without_photo_is_rejected(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['profile_photo' => null]))
            ->assertStatus(422)->assertJsonValidationErrors('profile_photo');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_register_rejects_non_image_and_oversized_photo(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['profile_photo' => UploadedFile::fake()->create('cv.pdf', 50, 'application/pdf')]))
            ->assertStatus(422)->assertJsonValidationErrors('profile_photo');
        $this->postJson('/api/auth/register', $this->payload(['profile_photo' => UploadedFile::fake()->create('script.php', 10, 'text/x-php')]))
            ->assertStatus(422)->assertJsonValidationErrors('profile_photo');
        // 6 MB (size is in KB)
        $this->postJson('/api/auth/register', $this->payload(['profile_photo' => UploadedFile::fake()->create('big.jpg', 6144, 'image/jpeg')]))
            ->assertStatus(422)->assertJsonValidationErrors('profile_photo');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_photo_is_shrunk_to_640px_jpeg(): void
    {
        $this->postJson('/api/auth/register', $this->payload(['profile_photo' => $this->photo('big.png', 2000, 1000)]))->assertCreated();

        $path = User::first()->profile_photo;
        $this->assertStringEndsWith('.jpg', $path);
        [$w, $h] = getimagesizefromstring(Storage::disk('local')->get($path));
        $this->assertSame(640, max($w, $h));
    }

    public function test_photo_upload_requires_a_signed_in_session(): void
    {
        $this->postJson('/api/profile/photo', ['photo' => $this->photo()])->assertUnauthorized();
        $this->deleteJson('/api/profile/photo')->assertUnauthorized();
    }

    public function test_upload_replace_and_remove_photo(): void
    {
        $user = User::factory()->create();
        $this->signedIn($user);

        // No uploaded photo yet -> no picture (the app shows initials).
        $this->getJson('/api/me')->assertJsonPath('user.picture', null)
            ->assertJsonPath('user.has_profile_photo', false);

        $first = $this->post('/api/profile/photo', ['photo' => $this->photo()], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('user.has_profile_photo', true);
        $firstPath = $user->fresh()->profile_photo;
        Storage::disk('local')->assertExists($firstPath);
        $this->assertStringStartsWith('/api/me/photo?v=', $first->json('user.picture'));

        // Replacing deletes the old file.
        $this->post('/api/profile/photo', ['photo' => $this->photo('new.png')], ['Accept' => 'application/json'])->assertOk();
        $secondPath = $user->fresh()->profile_photo;
        $this->assertNotSame($firstPath, $secondPath);
        Storage::disk('local')->assertMissing($firstPath);
        Storage::disk('local')->assertExists($secondPath);

        // Removing deletes the file and falls back to initials.
        $this->deleteJson('/api/profile/photo')->assertOk()
            ->assertJsonPath('user.picture', null)
            ->assertJsonPath('user.has_profile_photo', false);
        Storage::disk('local')->assertMissing($secondPath);
        $this->assertNull($user->fresh()->profile_photo);
    }

    public function test_photo_upload_rejects_non_images_and_big_files(): void
    {
        $user = User::factory()->create();
        $this->signedIn($user);

        $this->post('/api/profile/photo', ['photo' => UploadedFile::fake()->create('notes.pdf', 20, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->post('/api/profile/photo', ['photo' => UploadedFile::fake()->create('big.jpg', 6144, 'image/jpeg')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->postJson('/api/profile/photo', [])->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->assertNull($user->fresh()->profile_photo);
    }

    public function test_photo_is_owner_only_and_never_cached_publicly(): void
    {
        $this->postJson('/api/auth/register', $this->payload())->assertCreated();
        $owner = User::first();
        $other = User::factory()->create(['profile_photo' => null]);

        // Not signed in: nothing. Someone else's session: no photo of its own, never the owner's.
        $this->app['auth']->guard('web')->logout();
        $this->flushSession();
        $this->getJson('/api/me/photo')->assertUnauthorized();
        $this->signedIn($other)->get('/api/me/photo')->assertNotFound();

        $res = $this->signedIn($owner)->get('/api/me/photo')->assertOk();
        $cache = (string) $res->headers->get('Cache-Control');
        $this->assertStringContainsString('private', $cache);
        $this->assertStringNotContainsString('public', $cache);

        // The old signed route is gone.
        $this->assertFalse(\Illuminate\Support\Facades\Route::has('media.show'));
    }
}
