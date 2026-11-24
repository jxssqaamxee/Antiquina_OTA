<!DOCTYPE html>
<html lang="en">
<body style="font-family: Arial, sans-serif; background:#f3f6fb; margin:0; padding:24px;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; padding:28px; color:#1f2937;">
        <h2 style="color:#0f2a5c; font-size:20px; margin-top:0;">Hello {{ $fullName }},</h2>
        <p style="line-height:1.6;">An administrator changed the email address of your OCCDL account from this address to <strong>{{ $newEmail }}</strong>.</p>
        <p style="line-height:1.6;">You were signed out on all devices and must verify the new address before you can continue.</p>
        <p style="line-height:1.6;"><strong>If you did not expect this</strong>, contact your coordinator or administrator right away.</p>
        <p style="font-size:12px; color:#6b7280; margin-top:24px;">Automated message sent to {{ $oldEmail }}. Please do not reply.</p>
    </div>
</body>
</html>
