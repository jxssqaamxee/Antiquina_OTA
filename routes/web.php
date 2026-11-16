<?php

use Illuminate\Support\Facades\Route;

// Everything that is not /api, /up or a real file is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|up$).*');
