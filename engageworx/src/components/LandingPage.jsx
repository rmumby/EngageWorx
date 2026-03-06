import React, { useState, useEffect, useRef } from 'react';
import { legalPages } from './legalContent';

const PORTAL_URL = 'https://portal.engwx.com';

const LandingPage = () => {
  const observerRef = useRef(null);
  const [legalPage, setLegalPage] = useState(null);
  const [page, setPage] = useState('home');
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', type: 'general', message: '' });
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const navigateTo = (p) => {
    setPage(p);
    setLegalPage(null);
    window.scrollTo(0, 0);
  };

  // Handle direct URL paths for TCR/legal reviewers
  useEffect(() => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/privacypolicy' || path === '/privacy') {
      setLegalPage('privacy');
    } else if (path === '/termsandconditions' || path === '/terms') {
      setLegalPage('terms');
    } else if (path === '/accessibility') {
      setLegalPage('accessibility');
    } else if (path === '/smsconsent' || path === '/sms-consent') {
      setLegalPage('smsconsent');
    }
  }, []);

  useEffect(() => {
    // Scroll reveal observer
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('lp-visible'), i * 100);
          observerRef.current.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.lp-fade-up').forEach(el => observerRef.current.observe(el));

    // Nav scroll effect
    const handleScroll = () => {
      const nav = document.getElementById('lp-navbar');
      if (nav) nav.classList.toggle('lp-scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);

    // Load Outfit font
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (observerRef.current) observerRef.current.disconnect();
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Navigate to signup page
  const goToSignup = () => {
    window.location.href = PORTAL_URL;
  };

  const goToLogin = () => {
    window.location.href = PORTAL_URL;
  };


    // If showing a legal page, render it
  if (legalPage) {
    var pageData = legalPages[legalPage];
    if (!pageData) {
      return React.createElement('div', {style: {fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', minHeight: '100vh', padding: '120px 40px', textAlign: 'center'}},
        React.createElement('h1', {style: {fontSize: 36, fontWeight: 900}}, 'Page Not Found'),
        React.createElement('button', {onClick: function() { setLegalPage(null); }, style: {marginTop: 20, background: 'linear-gradient(135deg, #00C9FF, #E040FB)', border: 'none', borderRadius: 8, padding: '12px 24px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14}}, 'Back to Home')
      );
    }
    var elements = [
      React.createElement('button', {key: 'back', onClick: function() { setLegalPage(null); }, style: {background: 'rgba(255,255,255,0.06)', border: '1px solid #1a2540', borderRadius: 8, padding: '10px 24px', color: '#E8F4FD', fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: "'Outfit', sans-serif", marginBottom: 40}}, 'Back to Home'),
      React.createElement('h1', {key: 'title', style: {fontSize: 36, fontWeight: 900, letterSpacing: -1, marginBottom: 8, color: '#E8F4FD'}}, pageData.title),
      React.createElement('p', {key: 'date', style: {color: '#6B8BAE', fontSize: 14, marginBottom: 40}}, 'Last updated: ' + pageData.updated),
    ];
    pageData.sections.forEach(function(s, i) {
      if (s.type === 'h') {
        elements.push(React.createElement('h2', {key: 'h' + i, style: {fontSize: 20, fontWeight: 800, marginTop: 40, marginBottom: 12, color: '#00C9FF'}}, s.text));
      } else {
        elements.push(React.createElement('p', {key: 'p' + i, style: {color: '#9BB0C7', fontSize: 15, lineHeight: 1.8, marginBottom: 16}}, s.text));
      }
    });
    return React.createElement('div', {style: {fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', minHeight: '100vh', padding: '60px 24px'}},
      React.createElement('div', {style: {maxWidth: 760, margin: '0 auto'}}, elements)
    );
  }


  // Shared sub-page wrapper with nav
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const SubPageNav = () => (
    <>
      <style>{`
        .lp-sub-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 16px 40px; display: flex; align-items: center; justify-content: space-between;
          background: rgba(5,8,16,0.95); backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(26,37,64,0.5);
        }
        .lp-sub-nav-links { display: flex; align-items: center; gap: 24px; list-style: none; }
        .lp-sub-nav-links a, .lp-sub-nav-links span {
          color: #6B8BAE; text-decoration: none; font-size: 14px; font-weight: 500;
          cursor: pointer; transition: color 0.2s;
        }
        .lp-sub-nav-links a:hover, .lp-sub-nav-links span:hover { color: #E8F4FD; }
        .lp-sub-cta {
          background: linear-gradient(135deg, #00C9FF, #E040FB) !important;
          color: #000 !important; padding: 10px 24px !important; border-radius: 8px;
          font-weight: 700 !important; font-size: 14px !important; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif;
        }
        .lp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; cursor: pointer; }
        .lp-logo-icon {
          width: 36px; height: 36px; background: linear-gradient(135deg, #00C9FF, #E040FB);
          border-radius: 10px; display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 16px; color: #000;
        }
        .lp-logo-text { font-size: 20px; font-weight: 800; color: #E8F4FD; letter-spacing: -0.5px; }
        .lp-logo-text span { color: #00C9FF; }
        @media (max-width: 768px) {
          .lp-sub-nav { padding: 12px 20px; }
          .lp-sub-nav-links { display: none !important; }
          .lp-sub-hamburger { display: block !important; }
        }
      `}</style>
      <nav className="lp-sub-nav">
        <div className="lp-logo" onClick={() => navigateTo('home')}>
          <div className="lp-logo-icon">EW</div>
          <div className="lp-logo-text">Engage<span>Worx</span></div>
        </div>
        <ul className="lp-sub-nav-links">
          <li><span onClick={() => navigateTo('pricing')}>Pricing</span></li>
          <li><span onClick={() => navigateTo('about')}>About</span></li>
          <li><span onClick={() => navigateTo('contact')}>Contact</span></li>
          <li><a href={PORTAL_URL} style={{ color: '#E8F4FD', fontWeight: 600 }}>Login</a></li>
          <li><button className="lp-sub-cta" onClick={goToSignup}>Get Started Free</button></li>
        </ul>
        <button className="lp-sub-hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>☰</button>
        {mobileMenuOpen && (
          <div style={{ position: 'fixed', inset: 0, background: '#080d1aee', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <button onClick={() => setMobileMenuOpen(false)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>
            <span onClick={() => { navigateTo('pricing'); setMobileMenuOpen(false); }} style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>Pricing</span>
            <span onClick={() => { navigateTo('about'); setMobileMenuOpen(false); }} style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>About</span>
            <span onClick={() => { navigateTo('contact'); setMobileMenuOpen(false); }} style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>Contact</span>
            <a href="https://portal.engwx.com" style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, textDecoration: 'none' }}>Login</a>
            <button onClick={() => { goToSignup(); setMobileMenuOpen(false); }} style={{ background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Get Started Free</button>
          </div>
        )}
      </nav>
    </>
  );

  // Shared sub-page footer
  const SubPageFooter = () => (
    <footer style={{ borderTop: '1px solid #1a2540', padding: '40px 40px 30px', marginTop: 80 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span onClick={() => navigateTo('home')} style={{ color: '#6B8BAE', fontSize: 13, cursor: 'pointer' }}>Home</span>
          <span onClick={() => navigateTo('pricing')} style={{ color: '#6B8BAE', fontSize: 13, cursor: 'pointer' }}>Pricing</span>
          <span onClick={() => navigateTo('about')} style={{ color: '#6B8BAE', fontSize: 13, cursor: 'pointer' }}>About</span>
          <span onClick={() => navigateTo('contact')} style={{ color: '#6B8BAE', fontSize: 13, cursor: 'pointer' }}>Contact</span>
          <span onClick={() => { setLegalPage('privacy'); window.scrollTo(0,0); }} style={{ color: '#6B8BAE', fontSize: 13, cursor: 'pointer' }}>Privacy</span>
          <span onClick={() => { setLegalPage('terms'); window.scrollTo(0,0); }} style={{ color: '#6B8BAE', fontSize: 13, cursor: 'pointer' }}>Terms</span>
        </div>
        <span style={{ color: '#3A5068', fontSize: 13 }}>© 2026 EngageWorx. All rights reserved.</span>
      </div>
    </footer>
  );

  // ─── PRICING PAGE ───────────────────────────────────────────────────────────
  if (page === 'pricing') {
    const plans = [
      {
        name: 'Starter', price: '$99', period: '/mo', desc: '1 phone number, 1,000 SMS/month, AI bot included.',
        features: ['1,000 SMS/month', 'SMS + Email channels', 'AI Chatbot included', '5 automation flows', '1 phone number', 'Email support', 'Analytics dashboard'],
        cta: 'Start Free Trial', featured: false
      },
      {
        name: 'Growth', price: '$249', period: '/mo', desc: '3 phone numbers, 5,000 SMS/month, AI bot included.',
        features: ['5,000 SMS/month', 'SMS + Email channels', 'AI Chatbot included', 'Unlimited automation flows', '3 phone numbers', 'Priority support', 'Advanced analytics'],
        cta: 'Start Free Trial', featured: true
      },
      {
        name: 'Pro', price: '$499', period: '/mo', desc: '10 phone numbers, 20,000 SMS/month, AI bot included.',
        features: ['20,000 SMS/month', 'All channels + API access', 'White-label branding', 'Custom integrations', '10 phone numbers', 'Dedicated support', 'Full analytics suite', 'Custom domain', 'Multi-tenant management'],
        cta: 'Start Free Trial', featured: false
      }
    ];
    const faqs = [
      { q: 'Is there a free trial?', a: 'Yes! All paid plans come with a 14-day free trial. No credit card required to start.' },
      { q: 'Can I change plans later?', a: 'Absolutely. You can upgrade or downgrade at any time. Changes take effect at your next billing cycle.' },
      { q: 'What counts as a message?', a: 'Each SMS segment, email, WhatsApp message, or RCS message counts as one message. MMS counts as 3 messages.' },
      { q: 'Do you offer annual billing?', a: 'Yes — save 20% with annual billing on Starter and Growth plans. Contact us for custom enterprise pricing.' },
      { q: 'What happens if I exceed my message limit?', a: 'We will notify you at 80% and 100% usage. Overage messages are billed at $0.025/SMS across all plans.' },
      { q: 'Is there a setup fee?', a: 'No. There are no setup fees, hidden charges, or long-term contracts on Starter and Growth plans.' },
    ];

    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', minHeight: '100vh' }}>
        <SubPageNav />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '120px 40px 0' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#131b2e', border: '1px solid #1a2540', borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#00C9FF', marginBottom: 16 }}>💎 Pricing</div>
            <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1.1, marginBottom: 16 }}>Simple, transparent<br />pricing.</h1>
            <p style={{ color: '#6B8BAE', fontSize: 18, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>Start free, scale as you grow. No hidden fees, no surprises, no long-term contracts.</p>
          </div>

          {/* Plan Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 80 }}>
            {plans.map((p, i) => (
              <div key={i} style={{
                background: '#0d1220', border: p.featured ? '2px solid #00C9FF' : '1px solid #1a2540',
                borderRadius: 20, padding: '36px 28px', position: 'relative',
                boxShadow: p.featured ? '0 0 40px rgba(0,201,255,0.15), 0 20px 60px rgba(0,0,0,0.3)' : 'none'
              }}>
                {p.featured && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '4px 16px', borderRadius: 100, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>MOST POPULAR</div>}
                <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6B8BAE', marginBottom: 12 }}>{p.name}</div>
                <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -2, marginBottom: 4 }}>{p.price}<span style={{ fontSize: 16, fontWeight: 500, color: '#6B8BAE', letterSpacing: 0 }}>{p.period}</span></div>
                <p style={{ color: '#6B8BAE', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>{p.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, marginBottom: 28 }}>
                  {p.features.map((f, j) => (
                    <li key={j} style={{ padding: '8px 0', fontSize: 14, color: '#6B8BAE', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#00E676', fontWeight: 800, fontSize: 14 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={p.cta === 'Contact Sales' ? () => navigateTo('contact') : goToSignup} style={{
                  display: 'block', width: '100%', padding: 14, borderRadius: 10, textAlign: 'center',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: "'Outfit', sans-serif",
                  background: p.featured ? 'linear-gradient(135deg, #00C9FF, #E040FB)' : 'transparent',
                  color: p.featured ? '#000' : '#E8F4FD',
                  ...(p.featured ? {} : { border: '1px solid #1a2540' })
                }}>{p.cta}</button>
              </div>
            ))}
          </div>

          {/* Feature Comparison */}
          <div style={{ marginBottom: 80 }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, textAlign: 'center', marginBottom: 40 }}>Compare plans</h2>
            <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '16px 24px', borderBottom: '1px solid #1a2540', color: '#6B8BAE', fontSize: 13, fontWeight: 600 }}>Feature</th>
                    {['Starter', 'Growth', 'Pro'].map(h => (
                      <th key={h} style={{ textAlign: 'center', padding: '16px 24px', borderBottom: '1px solid #1a2540', color: '#00C9FF', fontSize: 13, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Monthly SMS', '1,000', '5,000', '20,000'],
                    ['SMS & Email', '✓', '✓', '✓'],
                    ['RCS & WhatsApp', '—', '✓', '✓'],
                    ['AI Chatbot', 'Basic', 'Advanced', 'Custom'],
                    ['Automation flows', '5', 'Unlimited', 'Unlimited'],
                    ['Team members', '1', '5', 'Unlimited'],
                    ['Analytics', 'Basic', 'Advanced', 'Custom'],
                    ['A/B testing', '—', '✓', '✓'],
                    ['White-label branding', '—', '—', '✓'],
                    ['Custom domain', '—', '—', '✓'],
                    ['API access', '—', '✓', '✓'],
                    ['SSO / SAML', '—', '—', '✓'],
                    ['Dedicated support', '—', '—', '✓'],
                    ['SLA guarantee', '—', '—', '99.9%'],
                    ['TCR/10DLC registration', '✓', '✓', '✓'],
                    ['GDPR compliance tools', '✓', '✓', '✓'],
                  ].map(([feature, ...vals], i) => (
                    <tr key={i}>
                      <td style={{ padding: '12px 24px', borderBottom: '1px solid rgba(26,37,64,0.5)', color: '#E8F4FD', fontSize: 14 }}>{feature}</td>
                      {vals.map((v, j) => (
                        <td key={j} style={{ textAlign: 'center', padding: '12px 24px', borderBottom: '1px solid rgba(26,37,64,0.5)', color: v === '✓' ? '#00E676' : v === '—' ? '#3A5068' : '#6B8BAE', fontSize: 14, fontWeight: v === '✓' || v === '—' ? 400 : 600 }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FAQ */}
          <div style={{ marginBottom: 60 }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, textAlign: 'center', marginBottom: 40 }}>Frequently asked questions</h2>
            <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 16 }}>
              {faqs.map((f, i) => (
                <div key={i} style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 12, padding: '24px 28px' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.q}</h3>
                  <p style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 1.7 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', background: '#0d1220', border: '1px solid #1a2540', borderRadius: 24, padding: '60px 48px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #00C9FF, #E040FB, #00E676)' }} />
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, marginBottom: 12 }}>Ready to get started?</h2>
            <p style={{ color: '#6B8BAE', fontSize: 17, marginBottom: 28 }}>Start your free 14-day trial. No credit card required.</p>
            <button onClick={goToSignup} style={{ background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '16px 36px', borderRadius: 12, fontSize: 16, fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Start Free Trial →</button>
          </div>
        </div>
        <SubPageFooter />
      </div>
    );
  }

  // ─── ABOUT PAGE ─────────────────────────────────────────────────────────────
  if (page === 'about') {
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', minHeight: '100vh' }}>
        <SubPageNav />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '120px 40px 0' }}>
          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#131b2e', border: '1px solid #1a2540', borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#00C9FF', marginBottom: 16 }}>🏢 About Us</div>
            <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1.1, marginBottom: 20 }}>We're building the future of<br /><span style={{ background: 'linear-gradient(135deg, #00C9FF, #E040FB)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>customer engagement.</span></h1>
            <p style={{ color: '#6B8BAE', fontSize: 18, maxWidth: 640, margin: '0 auto', lineHeight: 1.8 }}>
              EngageWorx was born from a simple frustration: businesses shouldn't need five different tools, a dedicated engineering team, and a six-figure budget to have great customer conversations.
            </p>
          </div>

          {/* Mission */}
          <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 20, padding: '48px 40px', marginBottom: 48, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #00C9FF, #E040FB, #00E676)' }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16, color: '#00C9FF' }}>Our Mission</h2>
            <p style={{ color: '#9BB0C7', fontSize: 16, lineHeight: 1.8 }}>
              To democratize customer engagement by providing an all-in-one, AI-powered communication platform that any business can deploy in minutes — not months. We believe every company, regardless of size, deserves enterprise-grade messaging capabilities.
            </p>
          </div>

          {/* What We Do */}
          <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 24 }}>What we do</h2>
          <p style={{ color: '#9BB0C7', fontSize: 16, lineHeight: 1.8, marginBottom: 40 }}>
            EngageWorx is an AI-powered Communication Platform as a Service (CPaaS) that unifies SMS, RCS, WhatsApp, and Email into a single intelligent platform. Our tools include AI chatbots that handle conversations automatically, visual automation builders, smart campaign management, and real-time analytics — all wrapped in a beautiful, white-label-ready interface.
          </p>

          {/* Values */}
          <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 24 }}>What drives us</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 48 }}>
            {[
              { icon: '⚡', title: 'Speed Over Complexity', desc: 'We obsess over reducing time-to-value. If it takes more than 10 minutes to set up, we haven\'t done our job.' },
              { icon: '🤖', title: 'AI That Helps, Not Hypes', desc: 'We use AI where it genuinely saves you time — generating campaigns, handling conversations, and surfacing insights.' },
              { icon: '🌍', title: 'Global By Default', desc: 'Built for businesses operating across the US, UK, and EU with compliance tools for TCPA, GDPR, PECR, and more.' },
              { icon: '🔒', title: 'Trust & Security', desc: 'End-to-end encryption, SOC 2 practices, GDPR compliance, and row-level data isolation. Your data is yours.' },
              { icon: '🎨', title: 'Your Brand, Not Ours', desc: 'Full white-label capabilities mean your customers see your brand, your colors, your domain — never ours.' },
              { icon: '💬', title: 'Conversations, Not Broadcasts', desc: 'We believe the best customer engagement is two-way. Our platform is built for dialogue, not just delivery.' },
            ].map((v, i) => (
              <div key={i} style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '28px 24px' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{v.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{v.title}</h3>
                <p style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 1.7 }}>{v.desc}</p>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: '#1a2540', borderRadius: 16, overflow: 'hidden', border: '1px solid #1a2540', marginBottom: 48 }}>
            {[
              { num: '50M+', label: 'Messages delivered' },
              { num: '500+', label: 'Businesses trust us' },
              { num: '99.9%', label: 'Uptime SLA' },
              { num: '6', label: 'Channels supported' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#0d1220', padding: '32px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, background: 'linear-gradient(135deg, #00C9FF, #E040FB)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.num}</div>
                <div style={{ fontSize: 13, color: '#6B8BAE', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Location */}
          <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 20, padding: '40px', marginBottom: 48, display: 'flex', alignItems: 'center', gap: 32 }}>
            <div style={{ fontSize: 48 }}>☀️</div>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Based in Miami, serving the world</h3>
              <p style={{ color: '#6B8BAE', fontSize: 15, lineHeight: 1.7 }}>
                Our team operates from Miami, Florida with a global infrastructure spanning the US, Europe, and beyond. We serve businesses across North America, the United Kingdom, and the European Union with localized compliance and support.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', background: '#0d1220', border: '1px solid #1a2540', borderRadius: 24, padding: '60px 48px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #00C9FF, #E040FB, #00E676)' }} />
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, marginBottom: 12 }}>Want to learn more?</h2>
            <p style={{ color: '#6B8BAE', fontSize: 17, marginBottom: 28 }}>Get in touch or start your free trial today.</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button onClick={goToSignup} style={{ background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '16px 36px', borderRadius: 12, fontSize: 16, fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Start Free Trial →</button>
              <button onClick={() => navigateTo('contact')} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1a2540', color: '#E8F4FD', padding: '16px 36px', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Contact Us</button>
            </div>
          </div>
        </div>
        <SubPageFooter />
      </div>
    );
  }

  // ─── CONTACT PAGE ───────────────────────────────────────────────────────────
  if (page === 'contact') {
    const handleSubmit = (e) => {
      e.preventDefault();
      const subject = encodeURIComponent(`[${contactForm.type}] Inquiry from ${contactForm.name}`);
      const body = encodeURIComponent(`Name: ${contactForm.name}\nEmail: ${contactForm.email}\nCompany: ${contactForm.company}\nType: ${contactForm.type}\n\nMessage:\n${contactForm.message}`);
      window.location.href = `mailto:hello@engwx.com?subject=${subject}&body=${body}`;
      setContactSubmitted(true);
    };

    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', minHeight: '100vh' }}>
        <SubPageNav />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '120px 40px 0' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#131b2e', border: '1px solid #1a2540', borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#00C9FF', marginBottom: 16 }}>✉️ Contact</div>
            <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1.1, marginBottom: 16 }}>Let's talk.</h1>
            <p style={{ color: '#6B8BAE', fontSize: 18, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>Have a question, want a demo, or ready to get started? We'd love to hear from you.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 48, alignItems: 'start' }}>
            {/* Contact Form */}
            <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 20, padding: '40px' }}>
              {contactSubmitted ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Thanks for reaching out!</h2>
                  <p style={{ color: '#6B8BAE', fontSize: 15 }}>Your email client should open with your message. We'll get back to you within one business day.</p>
                  <button onClick={() => setContactSubmitted(false)} style={{ marginTop: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid #1a2540', borderRadius: 8, padding: '10px 24px', color: '#E8F4FD', fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Send another message</button>
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Send us a message</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', color: '#6B8BAE', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Your Name</label>
                      <input type="text" value={contactForm.name} onChange={(e) => setContactForm({...contactForm, name: e.target.value})} placeholder="John Smith" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #1a2540', borderRadius: 10, padding: '12px 16px', color: '#E8F4FD', fontSize: 14, fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#6B8BAE', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Email Address</label>
                      <input type="email" value={contactForm.email} onChange={(e) => setContactForm({...contactForm, email: e.target.value})} placeholder="john@company.com" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #1a2540', borderRadius: 10, padding: '12px 16px', color: '#E8F4FD', fontSize: 14, fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', color: '#6B8BAE', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Company</label>
                      <input type="text" value={contactForm.company} onChange={(e) => setContactForm({...contactForm, company: e.target.value})} placeholder="Acme Corp" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #1a2540', borderRadius: 10, padding: '12px 16px', color: '#E8F4FD', fontSize: 14, fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#6B8BAE', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Inquiry Type</label>
                      <select value={contactForm.type} onChange={(e) => setContactForm({...contactForm, type: e.target.value})} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #1a2540', borderRadius: 10, padding: '12px 16px', color: '#E8F4FD', fontSize: 14, fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box', appearance: 'auto' }}>
                        <option value="general">General Inquiry</option>
                        <option value="demo">Request a Demo</option>
                        <option value="sales">Sales / Enterprise</option>
                        <option value="support">Technical Support</option>
                        <option value="partnership">Partnership</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', color: '#6B8BAE', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Message</label>
                    <textarea value={contactForm.message} onChange={(e) => setContactForm({...contactForm, message: e.target.value})} rows={5} placeholder="Tell us how we can help..." style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #1a2540', borderRadius: 10, padding: '12px 16px', color: '#E8F4FD', fontSize: 14, fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box', resize: 'vertical' }} />
                  </div>
                  <button onClick={handleSubmit} style={{ width: '100%', background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '16px', borderRadius: 12, fontSize: 16, fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Send Message →</button>
                </>
              )}
            </div>

            {/* Contact Info Sidebar */}
            <div>
              <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '28px', marginBottom: 20 }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>📧</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Email Us</h3>
                <p style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 1.7 }}>
                  General: <a href="mailto:hello@engwx.com" style={{ color: '#00C9FF', textDecoration: 'none' }}>hello@engwx.com</a><br />
                  Sales: <a href="mailto:sales@engwx.com" style={{ color: '#00C9FF', textDecoration: 'none' }}>sales@engwx.com</a><br />
                  Support: <a href="mailto:support@engwx.com" style={{ color: '#00C9FF', textDecoration: 'none' }}>support@engwx.com</a>
                </p>
              </div>

              <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '28px', marginBottom: 20 }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>⏰</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Response Time</h3>
                <p style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 1.7 }}>
                  We respond to all inquiries within one business day. Enterprise and demo requests are prioritized.
                </p>
              </div>

              <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '28px', marginBottom: 20 }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>📍</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Location</h3>
                <p style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 1.7 }}>
                  Miami, Florida, USA<br />
                  Serving customers in the US, UK & EU
                </p>
              </div>

              <div style={{ background: '#0d1220', border: '1px solid #1a2540', borderRadius: 16, padding: '28px' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>🚀</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Ready to start?</h3>
                <p style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
                  Skip the form and jump straight in. 14-day free trial, no credit card required.
                </p>
                <button onClick={goToSignup} style={{ width: '100%', background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Start Free Trial →</button>
              </div>
            </div>
          </div>
        </div>
        <SubPageFooter />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', overflowX: 'hidden', WebkitFontSmoothing: 'antialiased', minHeight: '100vh' }}>
      <style>{`
        /* ── LANDING PAGE SCOPED STYLES ──────────────── */
        .lp-root * { margin: 0; padding: 0; box-sizing: border-box; }
        .lp-root ::selection { background: #00C9FF; color: #000; }

        /* Noise overlay */
        .lp-noise {
          position: fixed; inset: 0; z-index: 0; opacity: 0.025; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        .lp-grid-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(0,201,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,201,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        /* Animations */
        @keyframes lp-fadeUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lp-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes lp-pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(0,201,255,0.15), 0 0 60px rgba(0,201,255,0.05); }
          50% { box-shadow: 0 0 40px rgba(0,201,255,0.15), 0 0 100px rgba(0,201,255,0.1); }
        }
        @keyframes lp-gradient-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

        .lp-fade-up { opacity: 0; transform: translateY(40px); transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
        .lp-fade-up.lp-visible { opacity: 1; transform: translateY(0); }

        /* Nav */
        .lp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 16px 40px; display: flex; align-items: center; justify-content: space-between;
          background: rgba(5,8,16,0.8); backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(26,37,64,0.5); transition: all 0.3s;
        }
        .lp-nav.lp-scrolled { padding: 12px 40px; background: rgba(5,8,16,0.95); }

        .lp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; cursor: pointer; }
        .lp-logo-icon {
          width: 36px; height: 36px; background: linear-gradient(135deg, #00C9FF, #E040FB);
          border-radius: 10px; display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 16px; color: #000;
        }
        .lp-logo-text { font-size: 20px; font-weight: 800; color: #E8F4FD; letter-spacing: -0.5px; }
        .lp-logo-text span { color: #00C9FF; }

        .lp-nav-links { display: flex; align-items: center; gap: 32px; list-style: none; }
        .lp-nav-links a, .lp-nav-links span {
          color: #6B8BAE; text-decoration: none; font-size: 14px; font-weight: 500;
          transition: color 0.2s; position: relative; cursor: pointer;
        }
        .lp-nav-links a:hover, .lp-nav-links span:hover { color: #E8F4FD; }
        .lp-nav-links a::after, .lp-nav-links span::after {
          content: ""; position: absolute; bottom: -4px; left: 0; width: 0; height: 2px;
          background: #00C9FF; transition: width 0.3s;
        }
        .lp-nav-links a:hover::after, .lp-nav-links span:hover::after { width: 100%; }

        .lp-nav-cta {
          background: linear-gradient(135deg, #00C9FF, #E040FB) !important;
          color: #000 !important; padding: 10px 24px !important; border-radius: 8px;
          font-weight: 700 !important; font-size: 14px !important;
          transition: transform 0.2s, box-shadow 0.2s !important;
        }
        .lp-nav-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,201,255,0.15); }
        .lp-nav-cta::after { display: none !important; }

        /* Hero */
        .lp-hero {
          position: relative; min-height: 100vh; display: flex; align-items: center;
          justify-content: center; padding: 120px 40px 80px; overflow: hidden;
        }
        .lp-hero-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
        .lp-hero-orb-1 {
          width: 600px; height: 600px; top: -100px; right: -200px;
          background: radial-gradient(circle, rgba(0,201,255,0.12), transparent 70%);
          animation: lp-float 8s ease-in-out infinite;
        }
        .lp-hero-orb-2 {
          width: 500px; height: 500px; bottom: -100px; left: -150px;
          background: radial-gradient(circle, rgba(224,64,251,0.08), transparent 70%);
          animation: lp-float 10s ease-in-out infinite 2s;
        }
        .lp-hero-content { position: relative; z-index: 2; text-align: center; max-width: 900px; }

        .lp-hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: #131b2e; border: 1px solid #1a2540; border-radius: 100px;
          padding: 6px 18px 6px 8px; font-size: 13px; color: #6B8BAE;
          margin-bottom: 32px; animation: lp-fadeUp 0.8s ease both;
        }
        .lp-hero-badge-dot {
          width: 8px; height: 8px; background: #00E676; border-radius: 50%;
          animation: lp-pulse-glow 2s infinite;
        }
        .lp-hero-badge strong { color: #00C9FF; font-weight: 600; }

        .lp-hero h1 {
          font-size: clamp(48px, 7vw, 86px); font-weight: 900; line-height: 1.05;
          letter-spacing: -3px; margin-bottom: 24px; animation: lp-fadeUp 0.8s ease 0.1s both;
        }
        .lp-gradient-text {
          background: linear-gradient(135deg, #00C9FF, #E040FB, #00E676);
          background-size: 200% 200%;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text; animation: lp-gradient-shift 4s ease infinite;
        }
        .lp-hero-sub {
          font-size: clamp(16px, 2vw, 20px); color: #6B8BAE; line-height: 1.7;
          max-width: 640px; margin: 0 auto 40px; animation: lp-fadeUp 0.8s ease 0.2s both;
        }
        .lp-hero-actions {
          display: flex; gap: 16px; justify-content: center; animation: lp-fadeUp 0.8s ease 0.3s both;
        }

        .lp-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #00C9FF, #E040FB); color: #000;
          padding: 16px 36px; border-radius: 12px; font-size: 16px; font-weight: 800;
          text-decoration: none; transition: all 0.3s; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif;
        }
        .lp-btn-primary:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,201,255,0.15); }

        .lp-btn-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.04); border: 1px solid #1a2540; color: #E8F4FD;
          padding: 16px 36px; border-radius: 12px; font-size: 16px; font-weight: 600;
          text-decoration: none; transition: all 0.3s; cursor: pointer;
          font-family: 'Outfit', sans-serif;
        }
        .lp-btn-secondary:hover { background: rgba(255,255,255,0.08); border-color: #00C9FF; transform: translateY(-2px); }

        /* Floating badges */
        .lp-hero-floating { position: absolute; z-index: 1; pointer-events: none; }
        .lp-float-badge {
          background: #131b2e; border: 1px solid #1a2540; border-radius: 12px;
          padding: 12px 16px; display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #6B8BAE; white-space: nowrap;
          animation: lp-float 6s ease-in-out infinite; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .lp-float-badge .lp-emoji { font-size: 18px; }
        .lp-float-badge strong { color: #E8F4FD; font-weight: 700; }
        .lp-fb-1 { top: 25%; left: 5%; animation-delay: 0s; }
        .lp-fb-2 { top: 35%; right: 3%; animation-delay: 1.5s; }
        .lp-fb-3 { bottom: 25%; left: 8%; animation-delay: 3s; }
        .lp-fb-4 { bottom: 20%; right: 6%; animation-delay: 0.8s; }

        /* Stats bar */
        .lp-stats-bar {
          position: relative; z-index: 2; max-width: 1000px; margin: -40px auto 0;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
          background: #1a2540; border-radius: 16px; overflow: hidden; border: 1px solid #1a2540;
        }
        .lp-stat-item { background: #0d1220; padding: 32px 24px; text-align: center; }
        .lp-stat-number {
          font-size: 36px; font-weight: 900; letter-spacing: -1px;
          background: linear-gradient(135deg, #00C9FF, #E040FB);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .lp-stat-label { font-size: 13px; color: #6B8BAE; margin-top: 4px; font-weight: 500; }

        /* Sections */
        .lp-section { position: relative; z-index: 2; padding: 120px 40px; }
        .lp-section-label {
          display: inline-flex; align-items: center; gap: 8px;
          background: #131b2e; border: 1px solid #1a2540; border-radius: 100px;
          padding: 6px 16px; font-size: 12px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1.5px; color: #00C9FF; margin-bottom: 16px;
        }
        .lp-section-title {
          font-size: clamp(32px, 5vw, 52px); font-weight: 900;
          letter-spacing: -2px; line-height: 1.1; margin-bottom: 16px;
        }
        .lp-section-sub { font-size: 18px; color: #6B8BAE; max-width: 600px; line-height: 1.7; }

        /* Channels grid */
        .lp-channels-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; max-width: 1100px; margin: 60px auto 0; }
        .lp-channel-card {
          background: #0d1220; border: 1px solid #1a2540; border-radius: 16px;
          padding: 32px 24px; text-align: center;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden;
        }
        .lp-channel-card:hover {
          transform: translateY(-8px); border-color: rgba(0,201,255,0.3);
          box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(0,201,255,0.15);
        }
        .lp-channel-icon {
          width: 56px; height: 56px; border-radius: 14px; display: flex;
          align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px;
        }
        .lp-channel-card h3 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
        .lp-channel-card p { color: #6B8BAE; font-size: 14px; line-height: 1.6; }
        .lp-channel-badge {
          display: inline-block; margin-top: 12px; padding: 4px 10px;
          border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
        }

        /* Features grid */
        .lp-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 1100px; margin: 60px auto 0; }
        .lp-feature-card {
          background: #0d1220; border: 1px solid #1a2540; border-radius: 16px;
          padding: 32px 28px; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .lp-feature-card:hover {
          transform: translateY(-4px); border-color: rgba(0,201,255,0.2);
          box-shadow: 0 12px 40px rgba(0,0,0,0.2);
        }
        .lp-feature-icon {
          width: 48px; height: 48px; border-radius: 12px; display: flex;
          align-items: center; justify-content: center; font-size: 24px; margin-bottom: 16px;
          background: #131b2e; border: 1px solid #1a2540;
        }
        .lp-feature-card h3 { font-size: 17px; font-weight: 800; margin-bottom: 8px; }
        .lp-feature-card p { color: #6B8BAE; font-size: 14px; line-height: 1.7; }

        /* Steps */
        .lp-steps {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px;
          max-width: 1000px; margin: 60px auto 0; position: relative;
        }
        .lp-steps::before {
          content: ""; position: absolute; top: 40px; left: 15%; right: 15%; height: 2px;
          background: linear-gradient(90deg, #00C9FF, #E040FB, #00E676); opacity: 0.3;
        }
        .lp-step { text-align: center; position: relative; }
        .lp-step-num {
          width: 64px; height: 64px; border-radius: 50%; background: #0d1220;
          border: 2px solid #00C9FF; display: flex; align-items: center; justify-content: center;
          font-size: 24px; font-weight: 900; color: #00C9FF; margin: 0 auto 20px;
          position: relative; z-index: 2;
        }
        .lp-step h3 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
        .lp-step p { color: #6B8BAE; font-size: 14px; line-height: 1.7; }

        /* Pricing */
        .lp-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1000px; margin: 60px auto 0; }
        .lp-price-card {
          background: #0d1220; border: 1px solid #1a2540; border-radius: 20px;
          padding: 36px 28px; position: relative; transition: all 0.4s;
        }
        .lp-price-card:hover { transform: translateY(-4px); }
        .lp-price-card.lp-featured {
          border-color: #00C9FF;
          box-shadow: 0 0 40px rgba(0,201,255,0.15), 0 20px 60px rgba(0,0,0,0.3);
        }
        .lp-price-card.lp-featured::before {
          content: "MOST POPULAR"; position: absolute; top: -12px; left: 50%;
          transform: translateX(-50%); background: linear-gradient(135deg, #00C9FF, #E040FB);
          color: #000; padding: 4px 16px; border-radius: 100px;
          font-size: 10px; font-weight: 800; letter-spacing: 1px;
        }
        .lp-price-name { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6B8BAE; margin-bottom: 12px; }
        .lp-price-amount { font-size: 48px; font-weight: 900; letter-spacing: -2px; margin-bottom: 4px; }
        .lp-price-amount span { font-size: 16px; font-weight: 500; color: #6B8BAE; letter-spacing: 0; }
        .lp-price-desc { color: #6B8BAE; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
        .lp-price-features { list-style: none; margin-bottom: 28px; padding: 0; }
        .lp-price-features li {
          padding: 8px 0; font-size: 14px; color: #6B8BAE;
          display: flex; align-items: center; gap: 10px;
        }
        .lp-price-features li::before { content: "✓"; color: #00E676; font-weight: 800; font-size: 14px; }

        .lp-price-btn {
          display: block; width: 100%; padding: 14px; border-radius: 10px;
          text-align: center; font-size: 15px; font-weight: 700; text-decoration: none;
          transition: all 0.3s; cursor: pointer; border: none; font-family: 'Outfit', sans-serif;
        }
        .lp-price-btn-primary { background: linear-gradient(135deg, #00C9FF, #E040FB); color: #000; }
        .lp-price-btn-primary:hover { box-shadow: 0 8px 30px rgba(0,201,255,0.15); transform: translateY(-2px); }
        .lp-price-btn-outline { background: transparent; border: 1px solid #1a2540; color: #E8F4FD; }
        .lp-price-btn-outline:hover { border-color: #00C9FF; background: rgba(0,201,255,0.05); }

        /* Testimonials */
        .lp-testimonial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 1100px; margin: 60px auto 0; }
        .lp-testimonial-card { background: #131b2e; border: 1px solid #1a2540; border-radius: 16px; padding: 28px; }
        .lp-testimonial-stars { color: #FFD600; font-size: 14px; letter-spacing: 2px; margin-bottom: 12px; }
        .lp-testimonial-text { color: #E8F4FD; font-size: 15px; line-height: 1.7; margin-bottom: 16px; font-style: italic; }
        .lp-testimonial-author { display: flex; align-items: center; gap: 10px; }
        .lp-testimonial-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: linear-gradient(135deg, #00C9FF, #E040FB); display: flex;
          align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: #000;
        }
        .lp-testimonial-name { font-size: 14px; font-weight: 700; }
        .lp-testimonial-role { font-size: 12px; color: #3A5068; }

        /* CTA */
        .lp-cta-box {
          max-width: 800px; margin: 0 auto; background: #0d1220;
          border: 1px solid #1a2540; border-radius: 24px; padding: 60px 48px;
          position: relative; overflow: hidden;
        }
        .lp-cta-box::before {
          content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #00C9FF, #E040FB, #00E676);
        }
        .lp-cta-box h2 { font-size: 40px; font-weight: 900; letter-spacing: -1.5px; margin-bottom: 12px; position: relative; }
        .lp-cta-box p { color: #6B8BAE; font-size: 17px; margin-bottom: 32px; line-height: 1.6; position: relative; }

        /* Footer */
        .lp-footer { position: relative; z-index: 2; border-top: 1px solid #1a2540; padding: 60px 40px 30px; }
        .lp-footer-grid {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 40px;
          max-width: 1100px; margin: 0 auto 40px;
        }
        .lp-footer-brand p { color: #6B8BAE; font-size: 14px; line-height: 1.7; margin-top: 12px; max-width: 280px; }
        .lp-footer-col h4 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #E8F4FD; margin-bottom: 16px; }
        .lp-footer-col a {
          display: block; color: #6B8BAE; text-decoration: none; font-size: 14px;
          padding: 4px 0; transition: color 0.2s; cursor: pointer;
        }
        .lp-footer-col a:hover { color: #00C9FF; }
        .lp-footer-bottom {
          max-width: 1100px; margin: 0 auto; padding-top: 24px;
          border-top: 1px solid #1a2540; display: flex;
          justify-content: space-between; align-items: center; color: #3A5068; font-size: 13px;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .lp-nav { padding: 12px 20px; }
          .lp-nav-links { display: none !important; }
          .lp-main-hamburger { display: block !important; }
          .lp-hero { padding: 100px 20px 60px; }
          .lp-hero h1 { letter-spacing: -1.5px; }
          .lp-hero-actions { flex-direction: column; align-items: center; }
          .lp-hero-floating { display: none; }
          .lp-stats-bar { grid-template-columns: repeat(2, 1fr); margin: -20px 20px 0; }
          .lp-section { padding: 80px 20px; }
          .lp-channels-grid, .lp-features-grid, .lp-pricing-grid, .lp-testimonial-grid, .lp-steps { grid-template-columns: 1fr; }
          .lp-steps::before { display: none; }
          .lp-footer-grid { grid-template-columns: 1fr 1fr; }
          .lp-cta-box { padding: 40px 24px; }
          .lp-cta-box h2 { font-size: 28px; }
          .lp-float-badge { display: none; }
        }
      `}</style>

      <div className="lp-root">
        <div className="lp-noise" />
        <div className="lp-grid-bg" />

        {/* NAV */}
        <nav className="lp-nav" id="lp-navbar">
          <div className="lp-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="lp-logo-icon">EW</div>
            <div className="lp-logo-text">Engage<span>Worx</span></div>
          </div>
          <ul className="lp-nav-links">
            <li><span onClick={() => scrollTo('lp-channels')}>Channels</span></li>
            <li><span onClick={() => scrollTo('lp-features')}>Features</span></li>
            <li><span onClick={() => navigateTo('pricing')}>Pricing</span></li>
            <li><span onClick={() => navigateTo('about')}>About</span></li>
            <li><span onClick={() => navigateTo('contact')}>Contact</span></li>
            <li><a href={PORTAL_URL} style={{ color: '#E8F4FD', fontWeight: 600 }}>Login</a></li>
            <li><span className="lp-nav-cta" onClick={goToSignup}>Get Started Free</span></li>
          </ul>
        <button className="lp-main-hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>☰</button>
        {mobileMenuOpen && (
          <div style={{ position: 'fixed', inset: 0, background: '#080d1aee', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <button onClick={() => setMobileMenuOpen(false)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>
            <span onClick={() => scrollTo('lp-channels')} style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>Channels</span>
            <span onClick={() => scrollTo('lp-features')} style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>Features</span>
            <span onClick={() => { navigateTo('pricing'); setMobileMenuOpen(false); }} style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>Pricing</span>
            <span onClick={() => { navigateTo('about'); setMobileMenuOpen(false); }} style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, cursor: 'pointer' }}>About</span>
            <a href="https://portal.engwx.com" style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 600, textDecoration: 'none' }}>Login</a>
            <button onClick={() => { goToSignup(); setMobileMenuOpen(false); }} style={{ background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Get Started Free</button>
          </div>
        )}
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-hero-orb lp-hero-orb-1" />
          <div className="lp-hero-orb lp-hero-orb-2" />

          <div className="lp-hero-floating lp-fb-1">
            <div className="lp-float-badge"><span className="lp-emoji">💬</span> <strong>2.4M</strong>&nbsp;messages sent today</div>
          </div>
          <div className="lp-hero-floating lp-fb-2">
            <div className="lp-float-badge"><span className="lp-emoji">🤖</span> <strong>94%</strong>&nbsp;AI resolution rate</div>
          </div>
          <div className="lp-hero-floating lp-fb-3">
            <div className="lp-float-badge"><span className="lp-emoji">⚡</span> <strong>0.3s</strong>&nbsp;avg response time</div>
          </div>
          <div className="lp-hero-floating lp-fb-4">
            <div className="lp-float-badge"><span className="lp-emoji">📈</span> <strong>3.2x</strong>&nbsp;conversion lift</div>
          </div>

          <div className="lp-hero-content">
            <div className="lp-hero-badge">
              <div className="lp-hero-badge-dot" />
              Now with <strong>RCS Business Messaging</strong>
            </div>
            <h1>Conversations that<br /><span className="lp-gradient-text">close deals.</span></h1>
            <p className="lp-hero-sub">
              The AI-powered engagement platform for SMS, RCS, WhatsApp, and Email.
              Automate conversations, build campaigns, and delight customers at scale.
            </p>
            <div className="lp-hero-actions">
              <button className="lp-btn-primary" onClick={goToSignup}>Start Free Trial →</button>
              <button className="lp-btn-secondary" onClick={() => scrollTo('lp-how')}>See How It Works</button>
            </div>
          </div>
        </section>

        {/* STATS BAR */}
        <div className="lp-stats-bar lp-fade-up">
          <div className="lp-stat-item"><div className="lp-stat-number">99.9%</div><div className="lp-stat-label">Uptime SLA</div></div>
          <div className="lp-stat-item"><div className="lp-stat-number">50M+</div><div className="lp-stat-label">Messages Delivered</div></div>
          <div className="lp-stat-item"><div className="lp-stat-number">2.1s</div><div className="lp-stat-label">Avg Delivery Speed</div></div>
          <div className="lp-stat-item"><div className="lp-stat-number">500+</div><div className="lp-stat-label">Businesses Trust Us</div></div>
        </div>

        {/* CHANNELS */}
        <section className="lp-section" id="lp-channels">
          <div style={{ textAlign: 'center' }} className="lp-fade-up">
            <div className="lp-section-label">📡 Channels</div>
            <h2 className="lp-section-title">Every channel.<br />One platform.</h2>
            <p className="lp-section-sub" style={{ margin: '0 auto' }}>
              Reach customers wherever they are — SMS, RCS, WhatsApp, or Email — all managed from a single intelligent inbox.
            </p>
          </div>
          <div className="lp-channels-grid">
            <div className="lp-channel-card lp-fade-up">
              <div className="lp-channel-icon" style={{ background: 'rgba(0,201,255,0.1)', border: '1px solid rgba(0,201,255,0.2)' }}>💬</div>
              <h3>SMS</h3>
              <p>Reliable, universal messaging with 98% open rates. A2P compliant with 10DLC registration built in.</p>
              <div className="lp-channel-badge" style={{ background: 'rgba(0,230,118,0.1)', color: '#00E676' }}>LIVE</div>
            </div>
            <div className="lp-channel-card lp-fade-up">
              <div className="lp-channel-icon" style={{ background: 'rgba(224,64,251,0.1)', border: '1px solid rgba(224,64,251,0.2)' }}>✨</div>
              <h3>RCS</h3>
              <p>Rich cards, carousels, and branded messaging. The future of business texting is here.</p>
              <div className="lp-channel-badge" style={{ background: 'rgba(0,201,255,0.1)', color: '#00C9FF' }}>NEW</div>
            </div>
            <div className="lp-channel-card lp-fade-up">
              <div className="lp-channel-icon" style={{ background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.2)' }}>📱</div>
              <h3>WhatsApp</h3>
              <p>Connect with 2B+ users globally. Templates, media, and interactive buttons included.</p>
              <div className="lp-channel-badge" style={{ background: 'rgba(0,230,118,0.1)', color: '#00E676' }}>LIVE</div>
            </div>
            <div className="lp-channel-card lp-fade-up">
              <div className="lp-channel-icon" style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)' }}>📧</div>
              <h3>Email</h3>
              <p>Transactional and marketing email with templates, tracking, and deliverability monitoring.</p>
              <div className="lp-channel-badge" style={{ background: 'rgba(0,230,118,0.1)', color: '#00E676' }}>LIVE</div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="lp-section" id="lp-features">
          <div style={{ textAlign: 'center' }} className="lp-fade-up">
            <div className="lp-section-label">⚡ Features</div>
            <h2 className="lp-section-title">Built for teams<br />that move fast.</h2>
            <p className="lp-section-sub" style={{ margin: '0 auto' }}>
              Everything you need to engage customers, automate workflows, and scale conversations — without the enterprise complexity.
            </p>
          </div>
          <div className="lp-features-grid">
            {[
              { icon: '🤖', title: 'AI Chatbot', desc: 'Configure personality, tone, and escalation rules. Your AI agent handles 90%+ of conversations automatically.' },
              { icon: '📊', title: 'Real-Time Analytics', desc: 'Message volume, sentiment analysis, conversion tracking, and agent performance — all in one dashboard.' },
              { icon: '⚡', title: 'Visual Flow Builder', desc: 'Drag-and-drop automation workflows. Triggers, conditions, delays, and AI classification — no code required.' },
              { icon: '🎯', title: 'Smart Campaigns', desc: 'AI generates your copy, picks the best send time, and A/B tests variants. Just describe what you want.' },
              { icon: '💬', title: 'Unified Inbox', desc: 'Every conversation across every channel in one live inbox. Assign agents, track sentiment, resolve fast.' },
              { icon: '📋', title: 'Compliance Built-In', desc: 'TCR/10DLC registration, opt-in/opt-out management, TCPA compliance, and consent tracking — all handled.' },
            ].map((f, i) => (
              <div className="lp-feature-card lp-fade-up" key={i}>
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="lp-section" id="lp-how" style={{ background: 'linear-gradient(180deg, #050810, #131b2e, #050810)' }}>
          <div style={{ textAlign: 'center' }} className="lp-fade-up">
            <div className="lp-section-label">🚀 How It Works</div>
            <h2 className="lp-section-title">Live in minutes,<br />not months.</h2>
            <p className="lp-section-sub" style={{ margin: '0 auto' }}>
              From sign-up to sending your first campaign in under 10 minutes. No engineering team required.
            </p>
          </div>
          <div className="lp-steps">
            {[
              { num: '1', title: 'Sign Up & Connect', desc: 'Create your account, verify your business, and connect your phone number in minutes.' },
              { num: '2', title: 'Import & Configure', desc: 'Upload contacts via CSV, configure your AI chatbot, and set up automation flows.' },
              { num: '3', title: 'Engage & Scale', desc: 'Launch campaigns, monitor analytics, and let AI handle conversations while you grow.' },
            ].map((s, i) => (
              <div className="lp-step lp-fade-up" key={i}>
                <div className="lp-step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section className="lp-section" id="lp-pricing">
          <div style={{ textAlign: 'center' }} className="lp-fade-up">
            <div className="lp-section-label">💎 Pricing</div>
            <h2 className="lp-section-title">Simple, transparent<br />pricing.</h2>
            <p className="lp-section-sub" style={{ margin: '0 auto' }}>Start free, scale as you grow. No hidden fees, no surprises.</p>
          </div>
          <div className="lp-pricing-grid">
            <div className="lp-price-card lp-fade-up">
              <div className="lp-price-name">Starter</div>
              <div className="lp-price-amount">$99<span>/mo</span></div>
              <div className="lp-price-desc">1 phone number, 1,000 SMS/month, AI bot included.</div>
              <ul className="lp-price-features">
                <li>1,000 SMS/month</li>
                <li>SMS + Email channels</li>
                <li>AI Chatbot included</li>
                <li>1 phone number</li>
                <li>Overage: $0.025/SMS</li>
              </ul>
              <button className="lp-price-btn lp-price-btn-outline" onClick={goToSignup}>Start Free Trial</button>
            </div>
            <div className="lp-price-card lp-featured lp-fade-up">
              <div className="lp-price-name">Growth</div>
              <div className="lp-price-amount">$249<span>/mo</span></div>
              <div className="lp-price-desc">3 phone numbers, 5,000 SMS/month, AI bot included.</div>
              <ul className="lp-price-features">
                <li>5,000 SMS/month</li>
                <li>SMS + Email channels</li>
                <li>AI Chatbot included</li>
                <li>3 phone numbers</li>
                <li>Overage: $0.025/SMS</li>
                <li>Priority support</li>
              </ul>
              <button className="lp-price-btn lp-price-btn-primary" onClick={goToSignup}>Start Free Trial</button>
            </div>
            <div className="lp-price-card lp-fade-up">
              <div className="lp-price-name">Pro</div>
              <div className="lp-price-amount">$499<span>/mo</span></div>
              <div className="lp-price-desc">10 phone numbers, 20,000 SMS/month, AI bot included.</div>
              <ul className="lp-price-features">
                <li>20,000 SMS/month</li>
                <li>All channels + API access</li>
                <li>White-label branding</li>
                <li>Custom integrations</li>
                <li>10 phone numbers</li>
                <li>Overage: $0.025/SMS</li>
              </ul>
              <button className="lp-price-btn lp-price-btn-outline" onClick={goToSignup}>Start Free Trial</button>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="lp-section" style={{ background: 'linear-gradient(180deg, #050810, #0d1220, #050810)' }}>
          <div style={{ textAlign: 'center' }} className="lp-fade-up">
            <div className="lp-section-label">💬 Testimonials</div>
            <h2 className="lp-section-title">Trusted by teams<br />who ship fast.</h2>
          </div>
          <div className="lp-testimonial-grid">
            {[
              { initials: 'JM', text: '"We replaced three separate tools with EngageWorx. The AI chatbot alone saves us 20 hours per week. Game changer for our support team."', name: 'Jake Morrison', role: 'Head of CX, TechFlow' },
              { initials: 'SR', text: '"The visual flow builder is incredible. We built our entire onboarding sequence in an afternoon — no developers needed."', name: 'Sarah Rodriguez', role: 'Marketing Director, GreenLeaf' },
              { initials: 'AP', text: '"RCS support put us ahead of every competitor. Our click-through rates tripled compared to plain SMS. The ROI is unreal."', name: 'Alex Park', role: 'CEO, SwiftShip' },
            ].map((t, i) => (
              <div className="lp-testimonial-card lp-fade-up" key={i}>
                <div className="lp-testimonial-stars">★★★★★</div>
                <p className="lp-testimonial-text">{t.text}</p>
                <div className="lp-testimonial-author">
                  <div className="lp-testimonial-avatar">{t.initials}</div>
                  <div>
                    <div className="lp-testimonial-name">{t.name}</div>
                    <div className="lp-testimonial-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SMS CONSENT & OPT-IN — Required for TCR/A2P compliance */}
        <section className="lp-section" id="lp-sms-consent" style={{ background: 'linear-gradient(180deg, #050810, #0a1018, #050810)' }}>
          <div style={{ textAlign: 'center', maxWidth: 800, margin: '0 auto' }} className="lp-fade-up">
            <div className="lp-section-label">📱 SMS Communications</div>
            <h2 className="lp-section-title">Stay connected<br />via SMS.</h2>
            <p className="lp-section-sub" style={{ margin: '0 auto 40px' }}>
              EngageWorx enables businesses to communicate with their customers through compliant, consent-based SMS messaging.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, textAlign: 'left', maxWidth: 700, margin: '0 auto' }}>
              {/* How to Opt In */}
              <div style={{ background: 'rgba(0,201,255,0.04)', border: '1px solid rgba(0,201,255,0.15)', borderRadius: 16, padding: 28 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>✅</div>
                <h3 style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>How to Opt In</h3>
                <ul style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 2, paddingLeft: 18 }}>
                  <li>Text <strong style={{ color: '#00C9FF' }}>START</strong> to a business's dedicated EngageWorx number</li>
                  <li>Submit your phone number through a business's web form with SMS consent checkbox</li>
                  <li>Provide verbal or written consent to the business</li>
                </ul>
                <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, fontSize: 12, color: '#6B8BAE', lineHeight: 1.6 }}>
                  <strong style={{ color: '#E8F4FD' }}>Consent language:</strong> "I agree to receive SMS messages from [Business Name] powered by EngageWorx. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help."
                </div>
              </div>

              {/* How to Opt Out */}
              <div style={{ background: 'rgba(255,59,48,0.04)', border: '1px solid rgba(255,59,48,0.15)', borderRadius: 16, padding: 28 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>🛑</div>
                <h3 style={{ color: '#E8F4FD', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>How to Opt Out</h3>
                <ul style={{ color: '#6B8BAE', fontSize: 14, lineHeight: 2, paddingLeft: 18 }}>
                  <li>Reply <strong style={{ color: '#FF3B30' }}>STOP</strong> to any message to unsubscribe instantly</li>
                  <li>Reply <strong style={{ color: '#FF3B30' }}>CANCEL</strong>, <strong style={{ color: '#FF3B30' }}>END</strong>, <strong style={{ color: '#FF3B30' }}>QUIT</strong>, or <strong style={{ color: '#FF3B30' }}>UNSUBSCRIBE</strong></li>
                  <li>Reply <strong style={{ color: '#FFD600' }}>HELP</strong> for assistance at any time</li>
                </ul>
                <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, fontSize: 12, color: '#6B8BAE', lineHeight: 1.6 }}>
                  <strong style={{ color: '#E8F4FD' }}>Opt-out confirmation:</strong> "You have been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe."
                </div>
              </div>
            </div>

            {/* Compliance details */}
            <div style={{ maxWidth: 700, margin: '32px auto 0', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, textAlign: 'left' }}>
              <h3 style={{ color: '#E8F4FD', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📋 SMS Messaging Compliance</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13, color: '#6B8BAE', lineHeight: 1.8 }}>
                <div>
                  <div style={{ color: '#E8F4FD', fontWeight: 600, marginBottom: 4 }}>Message Types</div>
                  Transactional notifications, appointment reminders, customer support responses, account alerts, and marketing messages (with explicit consent).
                </div>
                <div>
                  <div style={{ color: '#E8F4FD', fontWeight: 600, marginBottom: 4 }}>Message Frequency</div>
                  Message frequency varies by the type of communication and the business you've opted in with. Typically 1-10 messages per month.
                </div>
                <div>
                  <div style={{ color: '#E8F4FD', fontWeight: 600, marginBottom: 4 }}>Data Rates</div>
                  Message and data rates may apply. Contact your wireless carrier for details about your messaging plan.
                </div>
                <div>
                  <div style={{ color: '#E8F4FD', fontWeight: 600, marginBottom: 4 }}>Supported Carriers</div>
                  EngageWorx supports all major US carriers including AT&T, T-Mobile, Verizon, and their subsidiaries.
                </div>
              </div>
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#6B8BAE', lineHeight: 1.7 }}>
                For questions about SMS messaging, contact us at <a href="mailto:support@engwx.com" style={{ color: '#00C9FF', textDecoration: 'none' }}>support@engwx.com</a>. 
                View our <span onClick={() => { setLegalPage('privacy'); window.scrollTo(0,0); }} style={{ color: '#00C9FF', cursor: 'pointer' }}>Privacy Policy</span> and <span onClick={() => { setLegalPage('terms'); window.scrollTo(0,0); }} style={{ color: '#00C9FF', cursor: 'pointer' }}>Terms of Service</span> for complete details on data handling and compliance.
                EngageWorx complies with TCPA, CTIA guidelines, and 10DLC/A2P messaging standards.
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-cta-box lp-fade-up">
            <h2>Ready to <span className="lp-gradient-text">transform</span> your<br />customer engagement?</h2>
            <p>Start your free trial today. No credit card required.<br />Set up in under 10 minutes.</p>
            <div className="lp-hero-actions" style={{ marginTop: 0 }}>
              <button className="lp-btn-primary" onClick={goToSignup}>Start Free Trial →</button>
              <button className="lp-btn-secondary" onClick={() => window.location.href='mailto:sales@engwx.com'}>Book a Demo</button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <div className="lp-logo">
                <div className="lp-logo-icon">EW</div>
                <div className="lp-logo-text">Engage<span>Worx</span></div>
              </div>
              <p>AI-powered customer engagement across every channel. Built for teams that move fast.</p>
            </div>
            <div className="lp-footer-col">
              <h4>Product</h4>
              <a onClick={() => scrollTo('lp-channels')}>Channels</a>
              <a onClick={() => scrollTo('lp-features')}>Features</a>
              <a onClick={() => navigateTo('pricing')}>Pricing</a>
              <a href={PORTAL_URL}>Login</a>
            </div>
            <div className="lp-footer-col">
              <h4>Company</h4>
              <a onClick={() => navigateTo('about')}>About Us</a>
              <a onClick={() => navigateTo('contact')}>Contact</a>
              <a href={PORTAL_URL}>Customer Portal</a>
              <a onClick={goToSignup}>Get Started</a>
            </div>
            <div className="lp-footer-col">
              <h4>Legal</h4>
              <a href="#" onClick={(e) => { e.preventDefault(); setLegalPage('privacy'); window.scrollTo(0,0); }}>Privacy Policy</a>
              <a href="#" onClick={(e) => { e.preventDefault(); setLegalPage('terms'); window.scrollTo(0,0); }}>Terms of Service</a>
              <a onClick={() => { const el = document.getElementById('lp-sms-consent'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>SMS Consent</a>
              <a href="#" onClick={(e) => { e.preventDefault(); setLegalPage('accessibility'); window.scrollTo(0,0); }}>Accessibility</a>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span>© 2026 EngageWorx. All rights reserved.</span>
            <span>Built with 🤖 in Miami</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
