// Verify a Cloudflare Turnstile token server-side.
// Returns { success: true } or { success: false, errors: [...] }

export async function verifyTurnstileToken(token, remoteip) {
  if (!token) return { success: false, errors: ['missing_token'] };

  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    console.error('[turnstile] TURNSTILE_SECRET not configured');
    return { success: false, errors: ['server_misconfigured'] };
  }

  const formData = new URLSearchParams();
  formData.append('secret', secret);
  formData.append('response', token);
  if (remoteip) formData.append('remoteip', remoteip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return {
      success: !!data.success,
      errors: data['error-codes'] || [],
      hostname: data.hostname,
    };
  } catch (err) {
    console.error('[turnstile] verify failed:', err);
    return { success: false, errors: ['verify_request_failed'] };
  }
}
