// src/BrandingEditor.jsx — Canonical branding editor.
// Used at three render locations:
//   1. Settings → Branding tab (own tenant, no tenantId prop)
//   2. OnboardingWizard step 2 (own tenant, wizardMode=true)
//   3. TenantManagement → Configure → Branding (cross-tenant, tenantId prop)
//
// Saves via update_tenant_branding RPC which enforces cascade permission
// rules server-side (SP > CSP > Agent/MA with MSP+LOA > own entity).

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';

export const BRAND_FIELDS = [
  { key: 'brand_name',        label: 'Display Name',     placeholder: 'Acme Telecom', type: 'text' },
  { key: 'portal_name',       label: 'Portal Name',      placeholder: 'Acme Portal',  type: 'text' },
  { key: 'brand_logo_url',    label: 'Logo URL',         placeholder: 'https://example.com/logo.png', type: 'url' },
  { key: 'brand_favicon_url', label: 'Favicon URL',      placeholder: 'https://example.com/favicon.ico', type: 'url' },
  { key: 'brand_primary',     label: 'Primary Color',    placeholder: '#00C9FF', type: 'color' },
  { key: 'brand_secondary',   label: 'Secondary Color',  placeholder: '#E040FB', type: 'color' },
  { key: 'website_url',       label: 'Website URL',      placeholder: 'https://example.com', type: 'url' },
  { key: 'custom_domain',     label: 'Custom Domain',    placeholder: 'portal.acme.com', type: 'text', spAdminOnly: true },
  { key: 'powered_by_visible', label: 'Show platform attribution', placeholder: '', type: 'toggle' },
  { key: 'custom_css',        label: 'Custom CSS',       placeholder: '/* Custom overrides */', type: 'textarea', spAdminOnly: true },
];

// Any one of these being set counts as "customized"
var CUSTOMIZATION_KEYS = ['brand_name', 'brand_logo_url', 'brand_favicon_url', 'brand_primary', 'brand_secondary', 'portal_name'];

/**
 * Permission check: can the actor edit branding for the given entity?
 * Client-side gate only — the RPC re-enforces this server-side.
 */
export function canEditBranding(actor, entity) {
  if (!actor || !entity) return { allowed: false, reason: 'no actor or entity' };
  if (actor.isSuperAdmin) return { allowed: true, reason: 'super admin' };
  if (actor.tenantId === entity.id) return { allowed: true, reason: 'own entity' };

  var isDirectChild = entity.parent_entity_id === actor.tenantId;

  if (actor.entityTier === 'csp') {
    if (isDirectChild) return { allowed: true, reason: 'CSP editing tenant under them' };
    return { allowed: false, reason: 'CSP can only edit tenants directly under them' };
  }

  if (actor.entityTier === 'master_agent' || actor.entityTier === 'agent') {
    if (!actor.mspEnabled || !actor.loaOnFile) {
      return { allowed: false, reason: 'Letter of Agency required. Ask SP admin to enable MSP access.' };
    }
    if (isDirectChild) return { allowed: true, reason: (actor.entityTier === 'master_agent' ? 'Master agent' : 'Agent') + ' with MSP editing child entity' };
    return { allowed: false, reason: 'Can only edit entities directly under you' };
  }

  return { allowed: false, reason: 'insufficient permissions' };
}

function isCustomized(entity) {
  if (!entity) return false;
  for (var k of CUSTOMIZATION_KEYS) {
    if (entity[k] && String(entity[k]).trim().length > 0) return true;
  }
  return false;
}

async function resolveInheritedBranding(entity) {
  var current = entity;
  for (var i = 0; i < 5; i++) {
    var parentId = current.parent_entity_id;
    if (!parentId) return null;
    var r = await supabase.from('tenants').select('*').eq('id', parentId).maybeSingle();
    if (!r.data) return null;
    current = r.data;
    if (isCustomized(current)) return current;
  }
  return null;
}

/**
 * @param {object} props
 * @param {string} [props.tenantId]    Target tenant UUID. If omitted, uses current user's tenant.
 * @param {string} [props.entityId]    Alias for tenantId (backward compat with existing callers).
 * @param {object} [props.actor]       Caller context for client-side permission check.
 *                                     If omitted, derived from AuthContext.
 * @param {object} [props.C]          Color palette.
 * @param {boolean} [props.wizardMode] Suppress save/clear chrome for wizard embedding.
 * @param {function} [props.onSaved]   Callback after successful save.
 */
export default function BrandingEditor({ tenantId: tenantIdProp, entityId, actor: actorProp, C, wizardMode, onSaved }) {
  var auth = useAuth();
  var resolvedTenantId = tenantIdProp || entityId || (auth.profile ? auth.profile.tenant_id : null);

  // Derive actor from AuthContext if not passed explicitly
  var actor = actorProp;
  if (!actor && auth.profile) {
    actor = {
      tenantId: auth.profile.tenant_id,
      entityTier: auth.profile.entity_tier || 'tenant',
      isSuperAdmin: auth.isSuperAdmin,
      mspEnabled: false,
      loaOnFile: false,
    };
  }

  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE', text: '#E8F4FD', bg: '#0d1425', border: 'rgba(255,255,255,0.08)' };
  var [entity, setEntity] = useState(null);
  var [inherited, setInherited] = useState(null);
  var [form, setForm] = useState({});
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [savedFlash, setSavedFlash] = useState(false);
  var [error, setError] = useState(null);

  useEffect(function() { load(); }, [resolvedTenantId]);

  async function load() {
    if (!resolvedTenantId) { setLoading(false); return; }
    setLoading(true);
    try {
      var r = await supabase.from('tenants').select('*').eq('id', resolvedTenantId).maybeSingle();
      if (r.error || !r.data) { setError('Failed to load entity'); setLoading(false); return; }
      setEntity(r.data);
      setForm({
        brand_name: r.data.brand_name || '',
        portal_name: r.data.portal_name || '',
        brand_logo_url: r.data.brand_logo_url || '',
        brand_favicon_url: r.data.brand_favicon_url || '',
        brand_primary: r.data.brand_primary || '',
        brand_secondary: r.data.brand_secondary || '',
        website_url: r.data.website_url || '',
        custom_domain: r.data.custom_domain || '',
        powered_by_visible: r.data.powered_by_visible !== false,
        custom_css: r.data.custom_css || '',
      });
      if (!isCustomized(r.data)) {
        var inh = await resolveInheritedBranding(r.data);
        setInherited(inh);
      } else {
        setInherited(null);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  var perm = canEditBranding(actor || {}, entity || {});
  var canEdit = perm.allowed;
  var entityName = entity ? (entity.name || entity.brand_name || 'Unknown') : '';

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      var rpcParams = {
        p_tenant_id: resolvedTenantId,
        p_brand_name: (form.brand_name || '').trim() || null,
        p_brand_primary: (form.brand_primary || '').trim() || null,
        p_brand_secondary: (form.brand_secondary || '').trim() || null,
        p_brand_logo_url: (form.brand_logo_url || '').trim() || null,
        p_brand_favicon_url: (form.brand_favicon_url || '').trim() || null,
        p_portal_name: (form.portal_name || '').trim() || null,
        p_website_url: (form.website_url || '').trim() || null,
        p_custom_domain: (form.custom_domain || '').trim() || null,
        p_powered_by_visible: form.powered_by_visible,
        p_custom_css: (form.custom_css || '').trim() || null,
        p_clear_logo: !(form.brand_logo_url || '').trim() && !!(entity.brand_logo_url),
        p_clear_favicon: !(form.brand_favicon_url || '').trim() && !!(entity.brand_favicon_url),
        p_clear_website: !(form.website_url || '').trim() && !!(entity.website_url),
        p_clear_custom_domain: !(form.custom_domain || '').trim() && !!(entity.custom_domain),
        p_clear_custom_css: !(form.custom_css || '').trim() && !!(entity.custom_css),
      };
      var r = await supabase.rpc('update_tenant_branding', rpcParams);
      if (r.error) throw r.error;
      setSavedFlash(true);
      setTimeout(function() { setSavedFlash(false); }, 2000);
      if (onSaved) onSaved();
      load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function handleClearToInherit() {
    if (!canEdit) return;
    if (!window.confirm('Clear this entity\'s custom branding and inherit from the parent? This cannot be undone.')) return;
    setSaving(true);
    try {
      var r = await supabase.rpc('clear_tenant_branding', { p_tenant_id: resolvedTenantId });
      if (r.error) throw r.error;
      load();
      if (onSaved) onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  if (!resolvedTenantId) return <div style={{ padding: 20, color: colors.muted }}>No tenant selected</div>;
  if (loading) return <div style={{ padding: 20, color: colors.muted }}>Loading branding…</div>;

  // If actor doesn't have permission, don't render the form at all
  if (!canEdit) {
    return (
      <div style={{ background: '#FF3B3012', border: '1px solid #FF3B3033', borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ color: '#FF3B30', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Branding locked</div>
        <div style={{ color: colors.muted, fontSize: 12 }}>{perm.reason}</div>
      </div>
    );
  }

  if (!entity) return <div style={{ padding: 20, color: colors.muted }}>{error || 'Entity not found'}</div>;

  var input = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var label = { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 };

  var previewPrimary = form.brand_primary || (inherited ? inherited.brand_primary : null) || '#00C9FF';
  var previewSecondary = form.brand_secondary || (inherited ? inherited.brand_secondary : null) || '#E040FB';
  var previewName = form.portal_name || form.brand_name || (inherited ? (inherited.portal_name || inherited.brand_name) : null) || entityName;
  var previewLogo = form.brand_logo_url || (inherited ? inherited.brand_logo_url : null);
  var previewUrl = form.custom_domain || form.website_url || '';

  return (
    <div>
      {inherited && (
        <div style={{ background: 'rgba(0,201,255,0.06)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ color: '#00C9FF', fontSize: 13, fontWeight: 700 }}>Using inherited branding from {inherited.name}</div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Set any field below to override the inherited value.</div>
        </div>
      )}

      {/* Live preview */}
      {!wizardMode && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Live Preview</div>
          <div style={{ background: 'linear-gradient(135deg, ' + previewPrimary + ', ' + previewSecondary + ')', borderRadius: 12, padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            {previewLogo ? (
              <img src={previewLogo} alt="logo" style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(0,0,0,0.2)', objectFit: 'contain' }} onError={function(e) { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20 }}>{(previewName || '??').substring(0, 2).toUpperCase()}</div>
            )}
            <div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{previewName}</div>
              {previewUrl && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{previewUrl}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {BRAND_FIELDS.map(function(f) {
          var disabled = f.spAdminOnly && !(actor && actor.isSuperAdmin);
          if (disabled) return null; // hide SP-only fields from non-SP users

          if (f.type === 'toggle') {
            return (
              <div key={f.key} style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <label style={label}>{f.label}</label>
                <div onClick={function() { setForm(Object.assign({}, form, { [f.key]: !form[f.key] })); }} style={{
                  width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer',
                  background: form[f.key] ? '#00E676' : 'rgba(255,255,255,0.15)', transition: 'background 0.2s',
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form[f.key] ? 23 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>
            );
          }

          if (f.type === 'textarea') {
            return (
              <div key={f.key} style={{ gridColumn: '1 / -1' }}>
                <label style={label}>{f.label}</label>
                <textarea value={form[f.key] || ''} onChange={function(e) { setForm(Object.assign({}, form, { [f.key]: e.target.value })); }} placeholder={f.placeholder} rows={4} style={Object.assign({}, input, { fontFamily: 'monospace', fontSize: 12, resize: 'vertical' })} />
              </div>
            );
          }

          if (f.type === 'color') {
            return (
              <div key={f.key}>
                <label style={label}>{f.label}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form[f.key] || '#000000'} onChange={function(e) { setForm(Object.assign({}, form, { [f.key]: e.target.value })); }} style={{ width: 42, height: 38, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                  <input value={form[f.key] || ''} onChange={function(e) { setForm(Object.assign({}, form, { [f.key]: e.target.value })); }} placeholder={f.placeholder} style={Object.assign({}, input, { fontFamily: 'monospace' })} />
                </div>
              </div>
            );
          }

          return (
            <div key={f.key} style={{ gridColumn: f.key === 'brand_logo_url' || f.key === 'brand_favicon_url' || f.key === 'custom_domain' || f.key === 'website_url' ? '1 / -1' : undefined }}>
              <label style={label}>{f.label}</label>
              <input value={form[f.key] || ''} onChange={function(e) { setForm(Object.assign({}, form, { [f.key]: e.target.value })); }} placeholder={f.placeholder} style={input} />
            </div>
          );
        })}
      </div>

      {error && <div style={{ color: '#FF3B30', fontSize: 12, marginTop: 12 }}>{error}</div>}

      {!wizardMode && (
        <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
          <button onClick={handleSave} disabled={saving} style={{
            background: saving ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, ' + previewPrimary + ', ' + previewSecondary + ')',
            border: 'none', borderRadius: 10, padding: '10px 24px',
            color: saving ? colors.muted : '#000',
            fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13,
          }}>{saving ? 'Saving…' : 'Save Branding'}</button>
          {isCustomized(entity) && (
            <button onClick={handleClearToInherit} disabled={saving} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 16px', color: colors.muted, cursor: 'pointer', fontSize: 12 }}>Clear & Inherit</button>
          )}
          {savedFlash && <span style={{ color: '#00E676', fontSize: 12, fontWeight: 700 }}>Saved</span>}
        </div>
      )}

      {wizardMode && (
        <button onClick={handleSave} disabled={saving} style={{
          background: saving ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, ' + previewPrimary + ', ' + previewSecondary + ')',
          border: 'none', borderRadius: 10, padding: '10px 24px', marginTop: 16,
          color: saving ? colors.muted : '#000',
          fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13,
        }}>{saving ? 'Saving…' : (savedFlash ? 'Saved' : 'Save Branding')}</button>
      )}
    </div>
  );
}
