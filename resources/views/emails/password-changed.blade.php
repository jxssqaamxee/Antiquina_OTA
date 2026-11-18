<!DOCTYPE html>
<html lang="en">
<body style="font-family: Arial, sans-serif; background:#f3f6fb; margin:0; padding:24px;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; padding:28px; color:#1f2937;">
        <h2 style="color:#0f2a5c; font-size:20px; margin-top:0;">Hello {{ $fullName }},</h2>
        <p style="line-height:1.6;">The password of your OCCDL account was just changed.</p>
        <p style="line-height:1.6;"><strong>If this was you</strong>, nothing else to do.</p>
        <p style="line-height:1.6;"><strong>If it was NOT you</strong>, someone else may have access. Reset your password right away from
            <a href="{{ $loginUrl }}" style="color:#2563eb;">the sign-in page</a> (Forgot password) and tell your coordinator.</p>
        <p style="font-size:12px; color:#6b7280; margin-top:24px;">Automated message sent to {{ $email }}. Please do not reply.</p>
    </div>
</body>
</html>
