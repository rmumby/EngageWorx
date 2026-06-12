-- 067: swap the tenant welcome email from a plaintext temp password to a set-password link.
--
-- The onboarding flow (invite-tenant) no longer generates or emails a password. It mints a
-- single-use recovery link that lands on the portal's /auth/callback set-password form, and
-- passes it to the welcome template as {set_password_link}. This updates the stored
-- platform_config template to remove the "Temporary Password" row and point the CTA button at
-- {set_password_link} instead of {portal_url}.
--
-- ⚠ APPLY ORDERING: apply this AFTER the code that passes {set_password_link} is deployed
-- (api/invite-tenant.js + api/_lib/set-password-link.js). renderTemplate leaves unmatched
-- tokens literal — if the new template ships before the code, the email would render a literal
-- "{set_password_link}" and would have already lost the password row. Ship together; apply last.
-- This mirrors the 066 ordering note.
--
-- Idempotent: only rewrites the legacy template that still contains {temp_password}; re-running
-- after the swap is a no-op. Applies to the SP-level (scope='platform') row only — there are no
-- tenant-scoped overrides today. If a CSP later customizes welcome_email_html_template, give it
-- the same swap.

UPDATE public.platform_config
SET welcome_email_html_template = $html$<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#080d1a;border-radius:16px;overflow:hidden;"><div style="background:linear-gradient(135deg,#00C9FF,#E040FB);padding:32px 24px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;font-weight:800;">{platform_name}</h1><p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">AI-Powered Communications Platform</p></div><div style="padding:32px 24px;"><p style="color:#e8f4fd;font-size:16px;line-height:1.6;margin:0 0 20px;">Hi {admin_first_name},</p><p style="color:#cbd5e1;font-size:15px;line-height:1.7;margin:0 0 20px;">Your <strong style="color:#00C9FF;">{tenant_name}</strong> account on {platform_name} is ready. Set your password to get started:</p><div style="background:rgba(0,201,255,0.08);border:1px solid rgba(0,201,255,0.25);border-radius:12px;padding:20px;margin:0 0 24px;"><table style="width:100%;font-size:14px;"><tr><td style="color:#6b8bae;padding:4px 0;">Portal</td><td style="color:#00C9FF;font-weight:700;"><a href="{portal_url}" style="color:#00C9FF;text-decoration:none;">{portal_url}</a></td></tr><tr><td style="color:#6b8bae;padding:4px 0;">Email</td><td style="color:#e8f4fd;">{admin_email}</td></tr><tr><td style="color:#6b8bae;padding:4px 0;">Plan</td><td style="color:#e8f4fd;">{plan_name}</td></tr></table></div><p style="color:#cbd5e1;font-size:14px;line-height:1.6;">Use the secure button below to set your password and sign in. It's a single-use link.</p><div style="text-align:center;margin:24px 0;"><a href="{set_password_link}" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;font-weight:800;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:16px;">Set Your Password &amp; Sign In</a></div><div style="display:flex;gap:8px;justify-content:center;margin:20px 0;"><span style="background:rgba(0,201,255,0.12);color:#00C9FF;border:1px solid rgba(0,201,255,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">SMS</span><span style="background:rgba(37,211,102,0.12);color:#25D366;border:1px solid rgba(37,211,102,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">WhatsApp</span><span style="background:rgba(255,107,53,0.12);color:#FF6B35;border:1px solid rgba(255,107,53,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">Email</span><span style="background:rgba(255,214,0,0.12);color:#FFD600;border:1px solid rgba(255,214,0,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">Voice</span></div><div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;margin-top:24px;"><p style="color:#94a3b8;font-size:13px;margin:0;">Need help getting started?</p><ul style="color:#94a3b8;font-size:13px;padding-left:18px;margin:8px 0 0;"><li><a href="{calendar_url}" style="color:#00C9FF;">Book an onboarding call</a></li><li><a href="{onboarding_guide_url}" style="color:#00C9FF;">Read the setup guide</a></li><li>Email us: <a href="mailto:{support_email}" style="color:#00C9FF;">{support_email}</a></li></ul></div></div><div style="background:rgba(255,255,255,0.03);padding:16px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#475569;font-size:11px;margin:0;">{platform_name} · {headquarters}</p></div></div>$html$
WHERE scope = 'platform'
  AND tenant_id IS NULL
  AND welcome_email_html_template LIKE '%{temp_password}%';
