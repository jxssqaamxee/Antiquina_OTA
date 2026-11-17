<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Verifies a Google Identity Services ID token (the "credential" the Sign in
 * with Google button returns) by asking Google's tokeninfo endpoint, then
 * checking audience, issuer and e-mail verification ourselves.
 */
class GoogleTokenVerifier
{
    /** @return array{sub:string,email:string,first_name:string,last_name:string,picture:?string}|null */
    public function verify(?string $credential): ?array
    {
        $clientId = config('ota.google_client_id');
        if (! $credential || ! $clientId) {
            return null;
        }

        try {
            $res = Http::timeout(8)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $credential]);
        } catch (\Throwable) {
            return null;
        }
        if (! $res->ok()) {
            return null;
        }

        $p = $res->json();
        $issuerOk = in_array($p['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true);
        $verified = filter_var($p['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (($p['aud'] ?? null) !== $clientId || ! $issuerOk || ! $verified || empty($p['sub']) || empty($p['email'])) {
            return null;
        }
        if (isset($p['exp']) && (int) $p['exp'] < time()) {
            return null;
        }

        return [
            'sub' => (string) $p['sub'],
            'email' => strtolower($p['email']),
            'first_name' => (string) ($p['given_name'] ?? ''),
            'last_name' => (string) ($p['family_name'] ?? ''),
            'picture' => $p['picture'] ?? null,
        ];
    }
}
