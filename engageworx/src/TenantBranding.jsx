// src/TenantBranding.jsx
//
// Self-serve branding settings page.
//
// Renders a form + live preview for editing the active tenant's brand_name,
// brand_primary, brand_secondary, brand_logo_url, and brand_favicon_url.
//
// Calls the public.update_tenant_branding RPC on save — that function gates
// access to tenant admins (tenant_members.role IN ('admin', 'superadmin'))
// or platform superadmins (user_profiles.role = 'superadmin').
//
// Drop into src/ and route it from your settings/admin area.

import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // adjust if your client lives elsewhere

// ----- palette + styling (matches EngageWorx defaults; respects var() if available) -----
const C = {
  text:    '#0D1117',
  muted:   '#6B7280',
  faint:   '#9CA3AF',
  border:  '#E8EAF0',
  bg:      '#F9FAFB',
  cardBg:  '#FFFFFF',
  primary: 'var(--brand-primary, #00BFFF)',
  secondary: 'var(--brand-secondary, #A855F7)',
  errBg:   '#FEF2F2',
  errText: '#B91C1C',
  okBg:    '#F0FDF4',
  okText:  '#15803D',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

const styles = {
  container: {
    fontFamily: FONT,
    maxWidth: 1100,
    margin: '0 auto',
    padding: '32px 24px',
    color: C.text,
  },
  h1: { fontSize: 26, fontWeight: 700, margin: '0 0 6px', letterSpacing: -0.3 },
  sub: { fontSize: 14, color: C.muted, margin: '0 0 24px', lineHeight: 1.6, maxWidth: 720 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 360px',
    gap: 32,
    alignItems: 'start',
  },
  form: {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 28,
  },
  field: { marginBottom: 22 },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.faint,
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: '11px 13px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    fontSize: 14,
    fontFamily: FONT,
    color: C.text,
    boxSizing: 'border-box',
    background: '#fff',
  },
  hint: { fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.5 },
  colorRow: { display: 'flex', gap: 10, alignItems: 'center' },
  colorPicker: {
    width: 48,
    height: 44,
    padding: 0,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    cursor: 'pointer',
    background: 'transparent',
  },
  colorHex: {
    flex: 1,
    padding: '11px 13px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    fontSize: 14,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: C.text,
    boxSizing: 'border-box',
    background: '#fff',
    textTransform: 'uppercase',
  },
  btn: {
    width: '100%',
    padding: '13px 22px',
    borderRadius: 8,
    border: 'none',
    background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: FONT,
    marginTop: 8,
  },
  alertError: {
    background: C.errBg,
    color: C.errText,
    border: '1px solid #FECACA',
    padding: '11px 13px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16,
  },
  alertSuccess: {
    background: C.okBg,
    color: C.okText,
    border: '1px solid #BBF7D0',
    padding: '11px 13px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16,
  },
  preview: {
    position: 'sticky',
    top: 24,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.faint,
    marginBottom: 10,
  },
  previewCard: {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 28,
    textAlign: 'center',
  },
  previewLogo: {
    maxWidth: 140,
    maxHeight: 60,
    objectFit: 'contain',
    margin: '0 auto 16px',
    display: 'block',
  },
  previewName: { fontSize: 18, fontWeight: 700, margin: '0 0 20px', wordBreak: 'break-word' },
  previewBtn: {
    width: '100%',
    padding: '12px 20px',
    borderRadius: 8,
    border: 'none',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'default',
    fontFamily: FONT,
    marginBottom: 18,
  },
  previewBars: { display: 'flex', gap: 8 },
  previewBar: {
    flex: 1,
    padding: '10px 8px',
    borderRadius: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notAuthorized: {
    fontFamily: FONT,
    maxWidth: 600,
    margin: '60px auto',
    padding: 32,
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    textAlign: 'center',
    color: C.muted,
  },
  loading: {
    fontFamily: FONT,
    textAlign: 'center',
    padding: 60,
    color: C.muted,
  },
};

// ----- component -----

/**
 * @param {Object} props
 * @param {string} props.tenantId       UUID of the tenant whose branding to manage
 * @param {string} [props.userRole]     Caller's role — 'admin', 'superadmin', or other.
 *                                      Used for client-side gating only; server enforces real auth.
 */
export default function TenantBranding({ tenantId, userRole }) {
  const [brandName, setBrandName] = useState('');
  const [brandPrimary, setBrandPrimary] = useState('#00BFFF');
  const [brandSecondary, setBrandSecondary] = useState('#A855F7');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandFaviconUrl, setBrandFaviconUrl] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isAdmin = ['admin', 'superadmin'].includes(userRole);

  // Load existing branding for this tenant
  useEffect(() => {
    let cancelled = false;
    if (!tenantId) { setLoading(false); return; }

    (async () => {
      const { data, error: loadErr } = await supabase
        .from('tenants')
        .select('brand_name, brand_primary, brand_secondary, brand_logo_url, brand_favicon_url')
        .eq('id', tenantId)
        .maybeSingle();

      if (cancelled) return;

      if (loadErr) {
        setError('Failed to load current branding: ' + loadErr.message);
      } else if (data) {
        setBrandName(data.brand_name || '');
        setBrandPrimary(data.brand_primary || '#00BFFF');
        setBrandSecondary(data.brand_secondary || '#A855F7');
        setBrandLogoUrl(data.brand_logo_url || '');
        setBrandFaviconUrl(data.brand_favicon_url || '');
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [tenantId]);

  // Basic hex validation: # followed by 3 or 6 hex chars
  function isValidHex(value) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
  }

  async function handleSave() {
    setError('');
    setSuccess('');

    if (!isValidHex(brandPrimary)) {
      setError('Primary color must be a valid hex value (e.g., #1E3A5F)');
      return;
    }
    if (!isValidHex(brandSecondary)) {
      setError('Secondary color must be a valid hex value (e.g., #4A90D9)');
      return;
    }

    setSaving(true);

    const { error: rpcErr } = await supabase.rpc('update_tenant_branding', {
      p_tenant_id:        tenantId,
      p_brand_name:       brandName || null,
      p_brand_primary:    brandPrimary,
      p_brand_secondary:  brandSecondary,
      p_brand_logo_url:   brandLogoUrl || null,
      p_brand_favicon_url: brandFaviconUrl || null,
    });

    setSaving(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setSuccess('Branding saved. Refresh the page to see your changes everywhere.');
    setTimeout(() => setSuccess(''), 6000);
  }

  // ----- render gates -----

  if (!isAdmin) {
    return (
      <div style={styles.notAuthorized}>
        Only tenant admins can manage branding. Contact your admin to request changes.
      </div>
    );
  }

  if (loading) {
    return <div style={styles.loading}>Loading branding settings…</div>;
  }

  // ----- main render -----

  return (
    <div style={styles.container}>
      <h1 style={styles.h1}>Branding</h1>
      <p style={styles.sub}>
        Customize how your portal looks for users on your custom domain. Changes apply to
        all users in your tenant on the next page load.
      </p>

      {error && <div style={styles.alertError}>{error}</div>}
      {success && <div style={styles.alertSuccess}>{success}</div>}

      <div style={styles.grid}>
        {/* Form */}
        <div style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Brand Name</label>
            <input
              type="text"
              style={styles.input}
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g., 46 Labs"
            />
            <div style={styles.hint}>Shown in the page title and header.</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Primary Color</label>
            <div style={styles.colorRow}>
              <input
                type="color"
                style={styles.colorPicker}
                value={isValidHex(brandPrimary) ? brandPrimary : '#00BFFF'}
                onChange={(e) => setBrandPrimary(e.target.value.toUpperCase())}
              />
              <input
                type="text"
                style={styles.colorHex}
                value={brandPrimary}
                onChange={(e) => setBrandPrimary(e.target.value)}
                placeholder="#1E3A5F"
                maxLength={7}
              />
            </div>
            <div style={styles.hint}>Used in buttons, links, and key UI accents.</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Secondary Color</label>
            <div style={styles.colorRow}>
              <input
                type="color"
                style={styles.colorPicker}
                value={isValidHex(brandSecondary) ? brandSecondary : '#A855F7'}
                onChange={(e) => setBrandSecondary(e.target.value.toUpperCase())}
              />
              <input
                type="text"
                style={styles.colorHex}
                value={brandSecondary}
                onChange={(e) => setBrandSecondary(e.target.value)}
                placeholder="#4A90D9"
                maxLength={7}
              />
            </div>
            <div style={styles.hint}>Used in gradients and complementary accents.</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Logo URL</label>
            <input
              type="text"
              style={styles.input}
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.svg"
            />
            <div style={styles.hint}>
              Direct URL to your logo. SVG or PNG with transparent background recommended.
              Host it anywhere publicly accessible (your website, a CDN, etc.).
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Favicon URL</label>
            <input
              type="text"
              style={styles.input}
              value={brandFaviconUrl}
              onChange={(e) => setBrandFaviconUrl(e.target.value)}
              placeholder="https://example.com/favicon.ico"
            />
            <div style={styles.hint}>Browser tab icon. 32×32 PNG or ICO.</div>
          </div>

          <button
            style={{ ...styles.btn, opacity: saving ? 0.5 : 1, cursor: saving ? 'wait' : 'pointer' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Branding'}
          </button>
        </div>

        {/* Live Preview */}
        <div style={styles.preview}>
          <div style={styles.previewLabel}>Live Preview</div>
          <div style={styles.previewCard}>
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt="Logo"
                style={styles.previewLogo}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div style={{
                ...styles.previewLogo,
                background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})`,
                width: 60, height: 60, borderRadius: 12, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 20,
              }}>
                {(brandName || '?').charAt(0).toUpperCase()}
              </div>
            )}

            <h3 style={{ ...styles.previewName, color: brandPrimary }}>
              {brandName || 'Your Brand'}
            </h3>

            <button
              style={{
                ...styles.previewBtn,
                background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})`,
              }}
              type="button"
              onClick={(e) => e.preventDefault()}
            >
              Sign In →
            </button>

            <div style={styles.previewBars}>
              <div style={{ ...styles.previewBar, background: brandPrimary }}>
                Primary
              </div>
              <div style={{ ...styles.previewBar, background: brandSecondary }}>
                Secondary
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
