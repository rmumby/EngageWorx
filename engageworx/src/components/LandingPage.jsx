import React, { useState, useEffect, useRef } from 'react';

const PORTAL_URL = 'https://portal.engwx.com';

const LandingPage = () => {
  const observerRef = useRef(null);
  const [legalPage, setLegalPage] = useState(null);

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

  // Legal page content
  const legalContent = {
    privacy: {
      title: 'Privacy Policy',
      updated: 'February 26, 2026',
      content: `EngageWorx ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.

Information We Collect
We collect information you provide directly, including: account registration details (name, email, company name), billing information processed securely through Stripe, communication data sent through our platform on behalf of your business, and usage analytics to improve our services.

How We Use Your Information
We use collected information to: provide and maintain our messaging platform, process transactions and send billing notifications, improve and personalize your experience, comply with legal obligations including TCPA and telecommunications regulations, and communicate service updates and security alerts.

Data Storage & Security
All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We use Supabase for secure database hosting with row-level security. Message content is retained per your account settings and applicable regulations.

Third-Party Services
We integrate with: Twilio (message delivery), Stripe (payment processing), and Supabase (data storage). Each provider maintains their own privacy policies and security certifications.

Your Rights
You may request access to, correction of, or deletion of your personal data at any time by contacting privacy@engwx.com. California residents have additional rights under the CCPA.

Contact
For privacy-related inquiries: privacy@engwx.com`
    },
    terms: {
      title: 'Terms of Service',
      updated: 'February 26, 2026',
      content: `Welcome to EngageWorx. By accessing or using our platform, you agree to be bound by these Terms of Service.

Acceptance of Terms
By creating an account or using EngageWorx services, you agree to these terms. If you do not agree, do not use our services.

Description of Service
EngageWorx provides an AI-powered customer engagement platform including SMS, RCS, WhatsApp, and Email messaging services, automation tools, analytics, and related features.

Account Responsibilities
You are responsible for maintaining the confidentiality of your account credentials, all activities under your account, ensuring your use complies with applicable laws including TCPA, CAN-SPAM, and telecommunications regulations, and the content of messages sent through the platform.

Acceptable Use
You agree not to: send unsolicited messages (spam), transmit harmful, illegal, or deceptive content, violate any applicable laws or regulations, attempt to access other users' accounts or data, or reverse-engineer or disrupt the platform.

Billing & Payments
Subscription fees are billed monthly or annually through Stripe. You may cancel at any time; cancellation takes effect at the end of the current billing period. Refunds are handled on a case-by-case basis.

Limitation of Liability
EngageWorx is provided "as is." We are not liable for indirect, incidental, or consequential damages. Our total liability shall not exceed the amount paid by you in the twelve months preceding the claim.

Modifications
We may update these terms at any time. Continued use after changes constitutes acceptance. Material changes will be communicated via email.

Contact
For questions about these terms: legal@engwx.com`
    },
    accessibility: {
      title: 'Accessibility Statement',
      updated: 'February 26, 2026',
      content: `EngageWorx is committed to ensuring digital accessibility for people of all abilities. We continually improve the user experience for everyone and apply relevant accessibility standards.

Our Commitment
We strive to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. These guidelines explain how to make web content more accessible to people with disabilities.

Measures Taken
We have taken the following measures to ensure accessibility: keyboard navigation support throughout the platform, sufficient color contrast ratios for text and interactive elements, screen reader compatibility with ARIA labels, responsive design that works across devices and screen sizes, and clear, consistent navigation patterns.

Feedback
We welcome your feedback on the accessibility of EngageWorx. If you encounter any barriers or have suggestions for improvement, please contact us:

Email: accessibility@engwx.com

We aim to respond to accessibility feedback within 2 business days and to resolve issues as quickly as possible.

Limitations
While we strive for full accessibility, some third-party integrations may have their own accessibility limitations. We actively work with our partners to improve these experiences.`
    }
  };

  // If showing a legal page, render it
  if (legalPage) {
    const page = legalContent[legalPage];
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', minHeight: '100vh', padding: '0' }}>
        <style>{`
          .lp-legal-nav {
            position: fixed; top: 0; left: 0; right: 0; z-index: 100;
            padding: 16px 40px; display: flex; align-items: center; justify-content: space-between;
            background: rgba(5,8,16,0.95); backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(26,37,64,0.5);
          }
          .lp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; cursor: pointer; }
          .lp-logo-icon {
            width: 36px; height: 36px; background: linear-gradient(135deg, #00C9FF, #E040FB);
            border-radius: 10px; display: flex; align-items: center; justify-content: center;
            font-weight: 900; font-size: 16px; color: #000;
          }
          .lp-logo-text { font-size: 20px; font-weight: 800; color: #E8F4FD; letter-spacing: -0.5px; }
          .lp-logo-text span { color: #00C9FF; }
        `}</style>
        <nav className="lp-legal-nav">
          <div className="lp-logo" onClick={() => setLegalPage(null)} style={{ cursor: 'pointer' }}>
            <div className="lp-logo-icon">EW</div>
            <div className="lp-logo-text">Engage<span>Worx</span></div>
          </div>
          <button onClick={() => setLegalPage(null)} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid #1a2540', borderRadius: 8,
            padding: '8px 20px', color: '#E8F4FD', fontWeight: 600, cursor: 'pointer', fontSize: 14,
            fontFamily: "'Outfit', sans-serif"
          }}>← Back to Home</button>
        </nav>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '120px 40px 80px' }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>{page.title}</h1>
          <p style={{ color: '#6B8BAE', fontSize: 14, marginBottom: 40 }}>Last updated: {page.updated}</p>
          {page.content.split('\n\n').map((para, i) => {
            const isHeading = para.length < 60 && !para.includes('.');
            return isHeading
              ? <h2 key={i} style={{ fontSize: 20, fontWeight: 800, marginTop: 40, marginBottom: 12, color: '#00C9FF' }}>{para}</h2>
              : <p key={i} style={{ color: '#9BB0C7', fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>{para}</p>;
          })}
        </div>
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
            <li><span onClick={() => scrollTo('lp-pricing')}>Pricing</span></li>
            <li><span onClick={() => scrollTo('lp-how')}>How It Works</span></li>
            <li><a href={PORTAL_URL} style={{ color: '#E8F4FD', fontWeight: 600 }}>Login</a></li>
            <li><span className="lp-nav-cta" onClick={goToSignup}>Get Started Free</span></li>
          </ul>
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
              <div className="lp-price-amount">$49<span>/mo</span></div>
              <div className="lp-price-desc">Perfect for small teams getting started with messaging.</div>
              <ul className="lp-price-features">
                <li>1,000 messages/month</li>
                <li>SMS + Email channels</li>
                <li>AI Chatbot (basic)</li>
                <li>5 automation flows</li>
                <li>1 team member</li>
              </ul>
              <button className="lp-price-btn lp-price-btn-outline" onClick={goToSignup}>Start Free Trial</button>
            </div>
            <div className="lp-price-card lp-featured lp-fade-up">
              <div className="lp-price-name">Growth</div>
              <div className="lp-price-amount">$149<span>/mo</span></div>
              <div className="lp-price-desc">For growing teams that need full omnichannel power.</div>
              <ul className="lp-price-features">
                <li>10,000 messages/month</li>
                <li>All channels (SMS, RCS, WhatsApp, Email)</li>
                <li>AI Chatbot (advanced)</li>
                <li>Unlimited flows</li>
                <li>5 team members</li>
                <li>Priority support</li>
              </ul>
              <button className="lp-price-btn lp-price-btn-primary" onClick={goToSignup}>Start Free Trial</button>
            </div>
            <div className="lp-price-card lp-fade-up">
              <div className="lp-price-name">Enterprise</div>
              <div className="lp-price-amount">Custom</div>
              <div className="lp-price-desc">White-label, unlimited volume, and dedicated support.</div>
              <ul className="lp-price-features">
                <li>Unlimited messages</li>
                <li>All channels + API access</li>
                <li>White-label branding</li>
                <li>Custom integrations</li>
                <li>Unlimited team members</li>
                <li>Dedicated account manager</li>
              </ul>
              <button className="lp-price-btn lp-price-btn-outline" onClick={() => window.location.href='mailto:sales@engwx.com'}>Contact Sales</button>
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
              <a onClick={() => scrollTo('lp-pricing')}>Pricing</a>
              <a href={PORTAL_URL}>Login</a>
            </div>
            <div className="lp-footer-col">
              <h4>Company</h4>
              <a onClick={goToSignup}>Get Started</a>
              <a href={PORTAL_URL}>Customer Portal</a>
              <a href="mailto:support@engwx.com">Support</a>
              <a href="mailto:sales@engwx.com">Contact Sales</a>
            </div>
            <div className="lp-footer-col">
              <h4>Legal</h4>
              <a onClick={() => { setLegalPage('privacy'); window.scrollTo(0,0); }}>Privacy Policy</a>
              <a onClick={() => { setLegalPage('terms'); window.scrollTo(0,0); }}>Terms of Service</a>
              <a onClick={() => { setLegalPage('accessibility'); window.scrollTo(0,0); }}>Accessibility</a>
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
