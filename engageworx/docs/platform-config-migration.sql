-- Platform Config + Onboarding schema
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL,
  support_email TEXT NOT NULL,
  support_phone TEXT,
  portal_url TEXT NOT NULL,
  calendar_url TEXT,
  onboarding_guide_url TEXT,
  headquarters TEXT,
  welcome_email_subject_template TEXT NOT NULL,
  welcome_email_html_template TEXT NOT NULL,
  default_escalation_rules JSONB NOT NULL DEFAULT '[]',
  plans JSONB NOT NULL DEFAULT '[]',
  industries JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON platform_config FOR ALL USING (true) WITH CHECK (true);

-- Seed with EngageWorx defaults
INSERT INTO platform_config (
  platform_name, support_email, support_phone, portal_url, calendar_url,
  onboarding_guide_url, headquarters,
  welcome_email_subject_template, welcome_email_html_template,
  default_escalation_rules, plans, industries
) VALUES (
  'EngageWorx',
  'hello@engwx.com',
  '+1 (786) 982-7800',
  'https://portal.engwx.com',
  'https://calendly.com/rob-engwx/30min',
  'https://tinyurl.com/EW-Onboarding',
  'Miami, Florida',
  'Welcome to {platform_name} — your {tenant_name} account is ready',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#080d1a;border-radius:16px;overflow:hidden;"><div style="background:linear-gradient(135deg,#00C9FF,#E040FB);padding:32px 24px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;font-weight:800;">{platform_name}</h1><p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">AI-Powered Communications Platform</p></div><div style="padding:32px 24px;"><p style="color:#e8f4fd;font-size:16px;line-height:1.6;margin:0 0 20px;">Hi {admin_first_name},</p><p style="color:#cbd5e1;font-size:15px;line-height:1.7;margin:0 0 20px;">Your <strong style="color:#00C9FF;">{tenant_name}</strong> account on {platform_name} is ready. Here are your login credentials:</p><div style="background:rgba(0,201,255,0.08);border:1px solid rgba(0,201,255,0.25);border-radius:12px;padding:20px;margin:0 0 24px;"><table style="width:100%;font-size:14px;"><tr><td style="color:#6b8bae;padding:4px 0;">Portal</td><td style="color:#00C9FF;font-weight:700;"><a href="{portal_url}" style="color:#00C9FF;text-decoration:none;">{portal_url}</a></td></tr><tr><td style="color:#6b8bae;padding:4px 0;">Email</td><td style="color:#e8f4fd;">{admin_email}</td></tr><tr><td style="color:#6b8bae;padding:4px 0;">Temporary Password</td><td style="color:#FFD600;font-family:monospace;font-weight:700;">{temp_password}</td></tr><tr><td style="color:#6b8bae;padding:4px 0;">Plan</td><td style="color:#e8f4fd;">{plan_name}</td></tr></table></div><p style="color:#cbd5e1;font-size:14px;line-height:1.6;">Please change your password on first login.</p><div style="text-align:center;margin:24px 0;"><a href="{portal_url}" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;font-weight:800;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:16px;">Sign In to Portal</a></div><div style="display:flex;gap:8px;justify-content:center;margin:20px 0;"><span style="background:rgba(0,201,255,0.12);color:#00C9FF;border:1px solid rgba(0,201,255,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">SMS</span><span style="background:rgba(37,211,102,0.12);color:#25D366;border:1px solid rgba(37,211,102,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">WhatsApp</span><span style="background:rgba(255,107,53,0.12);color:#FF6B35;border:1px solid rgba(255,107,53,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">Email</span><span style="background:rgba(255,214,0,0.12);color:#FFD600;border:1px solid rgba(255,214,0,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;">Voice</span></div><div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;margin-top:24px;"><p style="color:#94a3b8;font-size:13px;margin:0;">Need help getting started?</p><ul style="color:#94a3b8;font-size:13px;padding-left:18px;margin:8px 0 0;"><li><a href="{calendar_url}" style="color:#00C9FF;">Book an onboarding call</a></li><li><a href="{onboarding_guide_url}" style="color:#00C9FF;">Read the setup guide</a></li><li>Email us: <a href="mailto:{support_email}" style="color:#00C9FF;">{support_email}</a></li></ul></div></div><div style="background:rgba(255,255,255,0.03);padding:16px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#475569;font-size:11px;margin:0;">{platform_name} · {headquarters}</p></div></div>',
  '[{"rule_name":"Human request","description":"Customer asks to speak with a real person","trigger_type":"keyword","trigger_config":{"keywords":["speak to human","real person","manager","agent","representative"]},"action_type":"escalate_human","priority":5},{"rule_name":"Legal threat","description":"Customer mentions legal action","trigger_type":"keyword","trigger_config":{"keywords":["lawyer","lawsuit","legal action","sue","attorney"]},"action_type":"notify_admin","priority":1},{"rule_name":"Safety concern","description":"Urgent safety or emergency language detected","trigger_type":"keyword","trigger_config":{"keywords":["emergency","urgent","harm","threat","danger"]},"action_type":"escalate_human","priority":1},{"rule_name":"VIP customer","description":"Contact is flagged as VIP","trigger_type":"vip_match","trigger_config":{"vip_only":true},"action_type":"notify_admin","priority":3}]',
  '[{"slug":"starter","name":"Starter","monthly_price":99,"message_limit":5000,"contact_limit":10000,"user_seats":3,"description":"For small teams getting started"},{"slug":"growth","name":"Growth","monthly_price":249,"message_limit":25000,"contact_limit":50000,"user_seats":10,"description":"For growing businesses"},{"slug":"pro","name":"Pro","monthly_price":499,"message_limit":50000,"contact_limit":100000,"user_seats":25,"description":"For teams that need scale and automation"},{"slug":"enterprise","name":"Enterprise","monthly_price":null,"message_limit":250000,"contact_limit":500000,"user_seats":100,"description":"Custom pricing for large organizations"}]',
  '["Telecommunications","Healthcare","Retail","Hospitality","Professional Services","Financial Services","Technology","Education","Other"]'
)
ON CONFLICT DO NOTHING;
