// src/BrandingContext.js — Hostname-based white-label branding
// Resolves tenants.custom_domain on mount, caches result in context.
// Child components use useBranding() to read brand values.
// Known EngageWorx hostnames skip the lookup and use platform defaults.

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var PLATFORM_HOSTNAMES = ['engwx.com', 'www.engwx.com', 'portal.engwx.com', 'localhost', '127.0.0.1'];

var DEFAULT_BRANDING = {
  isWhiteLabel: false,
  tenantId: null,
  brandName: 'EngageWorx',
  brandShort: 'EW',
  brandPrimary: '#00BFFF',
  brandSecondary: '#A855F7',
  brandLogoUrl: null,
  brandFaviconUrl: null,
  loading: false,
  resolved: true,
};

var BrandingContext = createContext(DEFAULT_BRANDING);

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }) {
  var hostname = window.location.hostname;
  var isPlatform = PLATFORM_HOSTNAMES.some(function(h) { return hostname === h || hostname.endsWith('.' + h); });
  var [branding, setBranding] = useState(isPlatform ? DEFAULT_BRANDING : Object.assign({}, DEFAULT_BRANDING, { loading: true, resolved: false }));

  useEffect(function() {
    if (isPlatform) return;

    // Custom domain — look up tenant
    supabase
      .rpc('get_tenant_branding_by_domain', { p_hostname: hostname })
      .maybeSingle()
      .then(function(result) {
        if (result.error) console.error('Branding lookup failed:', result.error);
        if (result.data) {
          var t = result.data;
          var name = t.brand_name || t.name || hostname;
          var short = name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase() || 'WL';
          var b = {
            isWhiteLabel: true,
            tenantId: t.id,
            brandName: name,
            brandShort: short,
            brandPrimary: t.brand_primary || '#00BFFF',
            brandSecondary: t.brand_secondary || '#A855F7',
            brandLogoUrl: t.brand_logo_url || null,
            brandFaviconUrl: t.brand_favicon_url || null,
            loading: false,
            resolved: true,
          };
          setBranding(b);

          // Apply CSS variables
          document.documentElement.style.setProperty('--brand-primary', b.brandPrimary);
          document.documentElement.style.setProperty('--brand-secondary', b.brandSecondary);

          // Swap favicon
          if (b.brandFaviconUrl) {
            var link = document.querySelector("link[rel='icon']") || document.querySelector("link[rel='shortcut icon']");
            if (link) link.href = b.brandFaviconUrl;
            var appleLink = document.querySelector("link[rel='apple-touch-icon']");
            if (appleLink) appleLink.href = b.brandFaviconUrl;
          }

          // Update page title
          document.title = name;
        } else {
          // Unknown hostname — redirect to marketing site
          window.location.href = 'https://engwx.com';
        }
      })
      .catch(function() {
        window.location.href = 'https://engwx.com';
      });
  }, [hostname, isPlatform]);

  return (
    <BrandingContext.Provider value={branding}>
      {branding.loading ? (
        <div style={{ minHeight: '100vh', background: '#0A0E1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#6B7280', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Loading...</div>
        </div>
      ) : children}
    </BrandingContext.Provider>
  );
}
