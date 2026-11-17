<?php

namespace App\Support\Logbook;

/** Limits shared by the validator, the store and the tests (mirrors resources/js/utils/validators.js + schedule.js). */
final class LogbookRules
{
    public const KEYS = ['logbook-v2', 'milestones-v1', 'shift-reminder-v1', 'onboarding-seen-v1', 'notifications-v1'];

    public const MIN_TARGET_HOURS = 1;
    public const MAX_TARGET_HOURS = 2000;
    public const DEFAULT_TARGET_HOURS = 486;

    public const MAX_CLIENTS = 100;
    public const MAX_ENTRIES = 5000;
    public const MAX_NOTIFICATIONS = 200;
    public const MAX_MILESTONES = 200;

    public const MAX_STUDENT_NAME = 120;
    public const MAX_CLIENT_NAME = 80;
    public const MAX_TASK = 500;
    public const MAX_NOTIF_TITLE = 160;
    public const MAX_NOTIF_MESSAGE = 500;

    public const CLIENT_TYPES = ['public', 'private', 'custom'];
    public const CATEGORIES = ['regular', 'evening', 'overtime'];
    public const THEMES = ['white', 'black', 'blue', 'yellow', 'maroon'];

    /** The ids the browser generates (Math.random().toString(36)) — letters, digits, dash, underscore. */
    public const ID_PATTERN = '/^[A-Za-z0-9_-]{1,32}$/';
}
