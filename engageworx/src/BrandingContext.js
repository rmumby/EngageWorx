// src/BrandingContext.js — Hostname-based white-label branding
// Resolves tenants.custom_domain on mount, caches result in context.
// Child components use useBranding() to read brand values.
// Known EngageWorx hostnames skip the lookup and use platform defaults.
// setActiveTenantBranding(tenantId) — switch branding for CSP impersonation.
// resetToHostBranding() — revert to hostname-resolved branding.

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

var PLATFORM_HOSTNAMES = ['engwx.com', 'www.engwx.com', 'portal.engwx.com', 'localhost', '127.0.0.1'];

var DEFAULT_BRANDING = {
  isWhiteLabel: false,
  tenantId: null,
  parentTenantId: null,
  brandName: 'EngageWorx',
  brandShort: 'EW',
  brandPrimary: '#00BFFF',
  brandSecondary: '#A855F7',
  brandLogoUrl: null,
  brandFaviconUrl: null,
  chatbotName: 'Aria',
  loading: false,
  resolved: true,
};

var BrandingContext = createContext(DEFAULT_BRANDING);

export function useBranding() {
  return useContext(BrandingContext);
}

function parseBrandingRow(t, hostname) {
  var name = t.brand_name || t.name || hostname || 'Portal';
  var short = name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase() || 'WL';
  return {
    isWhiteLabel: true,
    tenantId: t.id,
    parentTenantId: t.parent_tenant_id || null,
    brandName: name,
    brandShort: short,
    brandPrimary: t.brand_primary || '#00BFFF',
    brandSecondary: t.brand_secondary || '#A855F7',
    brandLogoUrl: t.brand_logo_url || null,
    brandFaviconUrl: t.brand_favicon_url || null,
    chatbotName: t.chatbot_name || 'Aria',
    loading: false,
    resolved: true,
  };
}

function applyBrandingToDOM(b) {
  document.documentElement.style.setProperty('--brand-primary', b.brandPrimary);
  document.documentElement.style.setProperty('--brand-secondary', b.brandSecondary);

  if (b.brandFaviconUrl) {
    var link = document.querySelector("link[rel='icon']") || document.querySelector("link[rel='shortcut icon']");
    if (link) link.href = b.brandFaviconUrl;
    var appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (appleLink) appleLink.href = b.brandFaviconUrl;
  }

  document.title = b.brandName || 'EngageWorx';
}

export function BrandingProvider({ children }) {
  var hostname = window.location.hostname;
  var isPlatform = PLATFORM_HOSTNAMES.some(function(h) { return hostname === h || hostname.endsWith('.' + h); });
  var [branding, setBranding] = useState(isPlatform ? DEFAULT_BRANDING : Object.assign({}, DEFAULT_BRANDING, { loading: true, resolved: false }));
  var hostBranding = useRef(null); // cache hostname-resolved branding for resetToHostBranding

  useEffect(function() {
    if (isPlatform) return;

    supabase
      .rpc('get_tenant_branding_by_domain', { p_hostname: hostname })
      .maybeSingle()
      .then(function(result) {
        if (result.error) console.error('Branding lookup failed:', result.error);
        if (result.data) {
          var b = parseBrandingRow(result.data, hostname);
          setBranding(b);
          hostBranding.current = b;
          applyBrandingToDOM(b);
        } else {
          window.location.href = 'https://engwx.com';
        }
      })
      .catch(function() {
        window.location.href = 'https://engwx.com';
      });
  }, [hostname, isPlatform]);

  var setActiveTenantBranding = useCallback(function(tenantId) {
    if (!tenantId) return;
    // Do NOT set loading: true — that unmounts children and resets their state
    supabase
      .rpc('get_tenant_branding_by_id', { p_tenant_id: tenantId })
      .maybeSingle()
      .then(function(result) {
        if (result.data) {
          var b = parseBrandingRow(result.data, hostname);
          setBranding(b);
          applyBrandingToDOM(b);
        }
        // If no data found, keep current branding (don't change anything)
      })
      .catch(function() {
        // On error, keep current branding
      });
  }, [hostname]);

  var resetToHostBranding = useCallback(function() {
    if (hostBranding.current) {
      setBranding(hostBranding.current);
      applyBrandingToDOM(hostBranding.current);
    } else if (isPlatform) {
      setBranding(DEFAULT_BRANDING);
      document.documentElement.style.setProperty('--brand-primary', '#00BFFF');
      document.documentElement.style.setProperty('--brand-secondary', '#A855F7');
      document.title = 'EngageWorx';
    }
  }, [isPlatform]);

  var contextValue = Object.assign({}, branding, {
    setActiveTenantBranding: setActiveTenantBranding,
    resetToHostBranding: resetToHostBranding,
  });

  return (
    <BrandingContext.Provider value={contextValue}>
      {branding.loading ? (
        <div style={{ minHeight: '100vh', background: '#0A0E1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#6B7280', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Loading...</div>
        </div>
      ) : children}
    </BrandingContext.Provider>
  );
}
