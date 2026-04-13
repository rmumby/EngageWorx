// src/BrandingEditor.jsx — Shared branding panel used across SP admin,
// CSP, Master Agent, Agent, and Tenant portals. Enforces the cascading
// permission rules from the Phase 2 spec.

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export const BRAND_FIELDS = [
  { key: 'brand_name',        label: 'Display Name',     placeholder: 'Acme Telecom', type: 'text' },
  { key: 'portal_name',       label: 'Portal Name',      placeholder: 'Acme Portal',  type: 'text' },
  { key: 'brand_logo_url',    label: 'Logo URL',         placeholder: 'https://example.com/logo.png', type: 'url' },
  { key: 'brand_favicon_url', label: 'Favicon URL',      placeholder: 'https://example.com/favicon.ico', type: 'url' },
  { key: 'brand_primary',     label: 'Primary Color',    placeholder: '#00C9FF', type: 'color' },
  { key: 'brand_secondary',   label: 'Secondary Color',  placeholder: '#E040FB', type: 'color' },
  { key: 'website_url',       label: 'Website URL',      placeholder: 'https://example.com', type: 'url' },
  { key: 'custom_domain',     label: 'Custom Domain',    placeholder: 'portal.acme.com', type: 'text', spAdminOnly: true },
];

// Any one of these being set counts as "customized"
var CUSTOMIZATION_KEYS = ['brand_name', 'brand_logo_url', 'brand_favicon_url', 'brand_primary', 'brand_secondary', 'portal_name'];

/**
 * Permission check: can the actor edit branding for the given entity?
 * @param {object} actor - { tenantId, entityTier, isSuperAdmin, mspEnabled, loaOnFile }
 * @param {object} entity - the target tenant row (needs id, parent_tenant_id, parent_entity_id, entity_tier)
 */
export function canEditBranding(actor, entity) {
  if (!actor || !entity) return { allowed: false, reason: 'no actor or entity' };
  if (actor.isSuperAdmin) return { allowed: true, reason: 'super admin' };
  if (actor.tenantId === entity.id) return { allowed: true, reason: 'own entity' };

  var isDirectChild = entity.parent_tenant_id === actor.tenantId || entity.parent_entity_id === actor.tenantId;

  if (actor.entityTier === 'csp') {
    if (isDirectChild) return { allowed: true, reason: 'CSP → tenant under them' };
    return { allowed: false, reason: 'CSP can only edit tenants directly under them' };
  }

  if (actor.entityTier === 'master_agent' || actor.entityTier === 'agent') {
    if (!actor.mspEnabled || !actor.loaOnFile) {
      return { allowed: false, reason: 'Letter of Agency required. Ask SP admin to enable MSP access.' };
    }
    if (isDirectChild) return { allowed: true, reason: (actor.entityTier === 'master_agent' ? 'Master agent' : 'Agent') + ' with MSP → child entity' };
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
  // Walk parent_entity_id → parent_tenant_id chain, up to 5 hops
  var current = entity;
  for (var i = 0; i < 5; i++) {
    var parentId = current.parent_entity_id || current.parent_tenant_id;
    if (!parentId) return null;
    var r = await supabase.from('tenants').select('*').eq('id', parentId).maybeSingle();
    if (!r.data) return null;
    current = r.data;
    if (isCustomized(current)) return current;
  }
  return null;
}

export default function BrandingEditor({ entityId, actor, C, onSaved }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE', text: '#E8F4FD', bg: '#0d1425', border: 'rgba(255,255,255,0.08)' };
  var [entity, setEntity] = useState(null);
  var [inherited, setInherited] = useState(null);
  var [form, setForm] = useState({});
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [savedFlash, setSavedFlash] = useState(false);
  var [error, setError] = useState(null);

  useEffect(function() { load(); }, [entityId]);

  async function load() {
    if (!entityId) { setLoading(false); return; }
    setLoading(true);
    try {
      var r = await supabase.from('tenants').select('*').eq('id', entityId).maybeSingle();
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
      // SP-admin-only fields excluded from non-SP saves
      var payload = {};
      BRAND_FIELDS.forEach(function(f) {
        if (f.spAdminOnly && !actor.isSuperAdmin) return;
        payload[f.key] = (form[f.key] || '').trim() || null;
      });
      payload.updated_at = new Date().toISOString();
      var r = await supabase.from('tenants').update(payload).eq('id', entityId);
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
      var nullFields = {};
      CUSTOMIZATION_KEYS.forEach(function(k) { nullFields[k] = null; });
      nullFields.updated_at = new Date().toISOString();
      var r = await supabase.from('tenants').update(nullFields).eq('id', entityId);
      if (r.error) throw r.error;
      load();
      if (onSaved) onSaved();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: 20, color: colors.muted }}>Loading branding…</div>;
  if (!entity) return <div style={{ padding: 20, color: colors.muted }}>{error || 'Entity not found'}</div>;

  var input = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var label = { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 };
  var locked = !canEdit ? { opacity: 0.6, cursor: 'not-allowed' } : {};

  var previewPrimary = form.brand_primary || (inherited ? inherited.brand_primary : null) || '#00C9FF';
  var previewSecondary = form.brand_secondary || (inherited ? inherited.brand_secondary : null) || '#E040FB';
  var previewName = form.portal_name || form.brand_name || (inherited ? (inherited.portal_name || inherited.brand_name) : null) || entityName;
  var previewLogo = form.brand_logo_url || (inherited ? inherited.brand_logo_url : null);

  return (
    <div>
      {/* Status banner */}
      {!canEdit && (
        <div style={{ background: '#FF3B3012', border: '1px solid #FF3B3033', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ color: '#FF3B30', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>🔒 Branding locked</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>{perm.reason}</div>
        </div>
      )}
      {inherited && (
        <div style={{ background: 'rgba(0,201,255,0.06)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ color: '#00C9FF', fontSize: 13, fontWeight: 700 }}>ℹ️ Using inherited branding from {inherited.name}</div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Set any field below to override the inherited value.</div>
        </div>
      )}

      {/* Live preview */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Live Preview</div>
        <div style={{ background: 'linear-gradient(135deg, ' + previewPrimary + ', ' + previewSecondary + ')', borderRadius: 12, padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {previewLogo ? (
            <img src={previewLogo} alt="logo" style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(0,0,0,0.2)', objectFit: 'contain' }} onError={function(e) { e.target.style.display = 'none'; }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20 }}>{(previewName || 'EW').substring(0, 2).toUpperCase()}</div>
          )}
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{previewName}</div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{form.custom_domain || form.website_url || 'portal.engwx.com'}</div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, ...locked }}>
        {BRAND_FIELDS.map(function(f) {
          var disabled = !canEdit || (f.spAdminOnly && !actor.isSuperAdmin);
          if (f.type === 'color') {
            return (
              <div key={f.key}>
                <label style={label}>{f.label}{f.spAdminOnly && !actor.isSuperAdmin ? ' 🔒' : ''}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" disabled={disabled} value={form[f.key] || '#000000'} onChange={function(e) { setForm(Object.assign({}, form, { [f.key]: e.target.value })); }} style={{ width: 42, height: 38, border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', background: 'transparent' }} />
                  <input disabled={disabled} value={form[f.key] || ''} onChange={function(e) { setForm(Object.assign({}, form, { [f.key]: e.target.value })); }} placeholder={f.placeholder} style={Object.assign({}, input, { fontFamily: 'monospace' })} />
                </div>
              </div>
            );
          }
          return (
            <div key={f.key} style={{ gridColumn: f.key === 'brand_logo_url' || f.key === 'brand_favicon_url' || f.key === 'custom_domain' || f.key === 'website_url' ? '1 / -1' : undefined }}>
              <label style={label}>{f.label}{f.spAdminOnly && !actor.isSuperAdmin ? ' 🔒 SP Admin only' : ''}</label>
              <input disabled={disabled} value={form[f.key] || ''} onChange={function(e) { setForm(Object.assign({}, form, { [f.key]: e.target.value })); }} placeholder={f.placeholder} style={input} />
            </div>
          );
        })}
      </div>

      {error && <div style={{ color: '#FF3B30', fontSize: 12, marginTop: 12 }}>❌ {error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
        <button onClick={handleSave} disabled={!canEdit || saving} style={{
          background: canEdit && !saving ? 'linear-gradient(135deg, ' + previewPrimary + ', ' + previewSecondary + ')' : 'rgba(255,255,255,0.08)',
          border: 'none', borderRadius: 10, padding: '10px 24px',
          color: canEdit && !saving ? '#000' : colors.muted,
          fontWeight: 800, cursor: canEdit && !saving ? 'pointer' : 'not-allowed', fontSize: 13,
        }}>{saving ? 'Saving…' : '💾 Save Branding'}</button>
        {isCustomized(entity) && canEdit && (
          <button onClick={handleClearToInherit} disabled={saving} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 16px', color: colors.muted, cursor: 'pointer', fontSize: 12 }}>Clear & Inherit</button>
        )}
        {savedFlash && <span style={{ color: '#00E676', fontSize: 12, fontWeight: 700 }}>✓ Saved</span>}
      </div>
    </div>
  );
}
