<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Announcement extends Model
{
    protected $fillable = ['author_id', 'audience_type', 'course_id', 'section_id', 'title', 'body', 'recipient_count'];
}
