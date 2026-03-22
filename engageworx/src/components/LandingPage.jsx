// ─── PATCH 1: Nav colour fix ─────────────────────────────────────────────────
// In LandingPage.jsx find the main nav <ul className="lp-nav-links"> block
// and replace the Blog, API Docs and Login <a> tags so they use the same
// muted colour as the other nav items (the CSS class already handles hover).
//
// FIND these three lines inside <ul className="lp-nav-links">:
//
//   <li><a href="/blog" style={{ color: '#E8F4FD' }}>Blog</a></li>
//   <li><a href="/api-docs" style={{ color: '#E8F4FD' }}>API Docs</a></li>
//   <li><a href={PORTAL_URL} style={{ color: '#E8F4FD', fontWeight: 600 }}>Login</a></li>
//
// REPLACE WITH:
//
//   <li><a href="/blog">Blog</a></li>
//   <li><a href="/api-docs">API Docs</a></li>
//   <li><a href={PORTAL_URL} style={{ fontWeight: 600 }}>Login</a></li>
//
// The lp-nav-links CSS class sets color: #6B8BAE by default and #E8F4FD on
// hover — removing the inline colour overrides lets the class take over and
// all items will match.
//
// Do the same in SubPageNav <ul className="lp-sub-nav-links">:
// FIND:
//   <li><a href="/blog" style={{ color: '#E8F4FD' }}>Blog</a></li>
//   <li><a href="/api-docs" style={{ color: '#E8F4FD' }}>API Docs</a></li>
//   <li><a href={PORTAL_URL} style={{ color: '#E8F4FD', fontWeight: 600 }}>Login</a></li>
// REPLACE WITH:
//   <li><a href="/blog">Blog</a></li>
//   <li><a href="/api-docs">API Docs</a></li>
//   <li><a href={PORTAL_URL} style={{ fontWeight: 600 }}>Login</a></li>


// ─── PATCH 2: Contact page layout ────────────────────────────────────────────
// Find the contact page section (if (page === 'contact')) and replace the
// entire content div (from <div style={{ maxWidth: 1100... to the closing
// </div> before <SubPageFooter />) with the improved version below.
//
// The improvements:
// - Tighter, more intentional two-column grid
// - DemoRequestForm given proper card treatment matching site style
// - Right column contact options tightened up
// - Header copy sharpened

// REPLACE the contact page inner content div with this:
/*
<div style={{ maxWidth: 1100, margin: '0 auto', padding: '120px 40px 0' }}>

  <div style={{ textAlign: 'center', marginBottom: 60 }}>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#131b2e', border: '1px solid #1a2540', borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#00C9FF', marginBottom: 16 }}>Get in Touch</div>
    <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1.1, marginBottom: 16 }}>Let's talk.</h1>
    <p style={{ color: '#6B8BAE', fontSize: 17, maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>Book a demo, ask a question, or just say hello. We respond fast.</p>
  </div>

  <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, alignItems: 'start', maxWidth: 1000, margin: '0 auto' }}>

    <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 20, padding: '36px 40px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #00C9FF, #E040FB)' }} />
      <DemoRequestForm />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>📧</div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Email</div>
        <p style={{ color: '#6B8BAE', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>AI-powered response in under 30 seconds.</p>
        <a href="mailto:hello@engwx.com" style={{ color: '#00C9FF', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>hello@engwx.com</a>
      </div>

      <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>📞</div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Call</div>
        <p style={{ color: '#6B8BAE', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>Speak directly with our team.</p>
        <a href="tel:+17869827800" style={{ color: '#00C9FF', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>+1 (786) 982-7800</a>
      </div>

      <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>📍</div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Location</div>
        <p style={{ color: '#6B8BAE', fontSize: 13, lineHeight: 1.6 }}>Miami, Florida, USA<br />Serving US, UK & EU</p>
      </div>

      <div style={{ background: 'linear-gradient(135deg, #131b2e, #0d1220)', border: '1px solid #E040FB33', borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>🚀</div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Self-service</div>
        <p style={{ color: '#6B8BAE', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>Skip the form — go live in under 5 minutes.</p>
        <button onClick={goToSignup} style={{ width: '100%', background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '11px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Start Free Trial →</button>
      </div>

    </div>
  </div>
</div>
*/
