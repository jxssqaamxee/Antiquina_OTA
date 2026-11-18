<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sends plain-HTTP visitors to the https:// address (permanent redirect).
 *
 * OFF by default (OCC_FORCE_HTTPS=false) so nothing can loop before you have confirmed that your
 * host forwards X-Forwarded-Proto. Switch on with OCC_FORCE_HTTPS=true. /up (health checks) is
 * never redirected, because platform probes and Docker's HEALTHCHECK call it over plain HTTP.
 */
class ForceHttps
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('occ.force_https') && ! $request->secure() && ! $request->is('up')) {
            return redirect()->secure($request->getRequestUri(), 308);
        }

        return $next($request);
    }
}
