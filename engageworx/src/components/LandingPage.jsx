import React, { useState, useEffect, useRef } from 'react';

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

  // Legal page content
  const legalContent = {
    privacy: {
      title: 'Privacy Policy',
      updated: 'February 26, 2026',
      content: "EngageWorx (\"we,\" \"us,\" or \"our\") operates the EngageWorx platform (engwx.com and portal.engwx.com). This Privacy Policy explains how we collect, use, store, and protect your personal data. It applies to all users regardless of location, including the United States, United Kingdom, and European Economic Area (EEA).\n\nData Controller\nFor the purposes of UK GDPR and EU GDPR, the data controller is EngageWorx, based in Miami, Florida, USA. You can contact our data protection team at privacy@engwx.com.\n\nInformation We Collect\nWe collect the following categories of personal data: account information (name, email address, company name, phone number), billing and payment data (processed securely by Stripe — we do not store full card numbers), platform usage data (features accessed, session duration, device and browser information), communication data (messages sent through the platform on behalf of your business), technical data (IP address, cookies, log files, and analytics identifiers), and marketing preferences (opt-in status for newsletters and product updates).\n\nLegal Bases for Processing (UK & EU)\nUnder UK GDPR and EU GDPR, we process personal data on the following legal bases: contractual necessity — to provide the EngageWorx platform and fulfill our service agreement with you, legitimate interests — to improve our services, prevent fraud, and ensure platform security, consent — for marketing communications and non-essential cookies (you may withdraw consent at any time), and legal obligation — to comply with tax, accounting, telecommunications, and anti-spam regulations.\n\nHow We Use Your Information\nWe use your data to: provide, operate, and maintain the EngageWorx platform, process subscriptions and billing through Stripe, send transactional notifications (account alerts, security notices, service updates), improve platform performance and develop new features, comply with applicable laws including TCPA (US), PECR (UK), ePrivacy Directive (EU), CAN-SPAM (US), and GDPR (UK/EU), respond to support requests and communicate with you, and detect and prevent fraud, abuse, and security incidents.\n\nData Sharing & Third Parties\nWe share data with the following categories of service providers, each operating under data processing agreements: Twilio — message delivery (SMS, RCS, WhatsApp), Stripe — payment processing (PCI DSS Level 1 certified), Supabase — database hosting and authentication, and analytics providers — platform usage insights (anonymized where possible). We do not sell your personal data to third parties. We may disclose data if required by law, court order, or to protect our legal rights.\n\nInternational Data Transfers\nIf you are located in the UK or EEA, your data may be transferred to the United States where our servers and service providers are located. We safeguard these transfers using: Standard Contractual Clauses (SCCs) approved by the European Commission, UK International Data Transfer Agreements (IDTAs) where applicable, and data processing agreements with all sub-processors. We assess the data protection laws of recipient countries and implement supplementary measures where necessary, in line with the Schrems II ruling.\n\nData Retention\nWe retain your personal data for as long as your account is active or as needed to provide services. After account deletion, we retain data for up to 12 months for legal compliance and dispute resolution, billing records for up to 7 years as required by tax laws, and anonymized analytics data indefinitely for service improvement. Message content sent through the platform is retained according to your account settings and applicable telecommunications regulations.\n\nYour Rights\nDepending on your location, you have the following rights:\n\nAll Users (US, UK, EU): access your personal data, correct inaccurate data, request deletion of your data, object to or restrict certain processing, and receive a copy of your data in a portable format.\n\nCalifornia Residents (CCPA/CPRA): right to know what data is collected and how it is used, right to delete personal information, right to opt out of the sale of personal data (we do not sell data), right to non-discrimination for exercising your rights, and right to limit use of sensitive personal information.\n\nUK & EU Residents (GDPR): all rights listed above, plus the right to withdraw consent at any time (without affecting prior processing), right to lodge a complaint with your supervisory authority (UK: ICO at ico.org.uk — EU: your local Data Protection Authority), and the right not to be subject to solely automated decision-making with legal effects.\n\nTo exercise any of these rights, contact us at privacy@engwx.com. We will respond within 30 days (or within one calendar month for UK/EU GDPR requests).\n\nCookies & Tracking\nWe use essential cookies required for platform functionality (no consent needed), analytics cookies to understand usage patterns (consent required in UK/EU), and preference cookies to remember your settings. You can manage cookie preferences through your browser settings or our cookie banner. We respect Do Not Track (DNT) browser signals.\n\nChildren\'s Privacy\nEngageWorx is not directed at individuals under 16 years of age (or under 13 in the US under COPPA). We do not knowingly collect data from children. If we become aware that we have collected data from a child, we will delete it promptly.\n\nSecurity\nWe implement industry-standard security measures including: TLS 1.3 encryption for all data in transit, AES-256 encryption for data at rest, row-level security in our database, regular security audits and penetration testing, role-based access controls, and incident response procedures with breach notification within 72 hours as required by GDPR.\n\nChanges to This Policy\nWe may update this Privacy Policy periodically. Material changes will be communicated via email and a prominent notice on our website. Continued use of the platform after changes constitutes acceptance, except where consent is required by law.\n\nContact Us\nFor privacy inquiries, data subject requests, or complaints:\nEmail: privacy@engwx.com\nData Protection Team, EngageWorx, Miami, Florida, USA\n\nIf you are in the UK, you may also contact the Information Commissioner\'s Office (ICO) at ico.org.uk. If you are in the EU, you may contact your local Data Protection Authority."
    },
    terms: {
      title: 'Terms of Service',
      updated: 'February 26, 2026',
      content: "These Terms of Service (\"Terms\") govern your access to and use of the EngageWorx platform, including all related websites, APIs, and services (collectively, the \"Service\"). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.\n\nThese Terms apply to users worldwide, including in the United States, United Kingdom, and European Union.\n\n1. Definitions\n\"EngageWorx,\" \"we,\" \"us,\" and \"our\" refer to the operator of the EngageWorx platform, based in Miami, Florida, USA. \"You\" and \"your\" refer to the individual or entity accessing or using the Service. \"Platform\" refers to the EngageWorx web application, APIs, and all associated tools and services. \"Content\" refers to any text, images, data, or other material transmitted through the Platform. \"Messages\" refers to SMS, MMS, RCS, WhatsApp, Email, or other communications sent through the Service.\n\n2. Eligibility\nYou must be at least 18 years old (or the age of legal majority in your jurisdiction) to use the Service. By using the Service, you represent that you have the legal authority to bind the entity on whose behalf you are acting.\n\n3. Account Registration\nYou agree to provide accurate and complete information during registration, maintain the security and confidentiality of your login credentials, notify us immediately of any unauthorized access to your account, and accept responsibility for all activity under your account.\n\n4. Description of Service\nEngageWorx provides an AI-powered customer engagement platform including: omnichannel messaging (SMS, RCS, WhatsApp, Email), AI chatbot and automation tools, visual flow builder for conversation workflows, campaign management and analytics, contact management and CSV import, compliance tools for TCR/10DLC registration (US) and messaging regulations, and white-label branding for service providers.\n\n5. Acceptable Use\nYou agree to use the Service only for lawful purposes. Specifically, you shall not: send unsolicited, unwanted, or spam messages, send messages without proper recipient consent as required by applicable law, transmit content that is illegal, harmful, threatening, abusive, defamatory, or infringing, use the Service to facilitate fraud, phishing, or deceptive practices, attempt to gain unauthorized access to other accounts or systems, reverse-engineer, decompile, or disassemble the Service, use the Service in violation of export control or sanctions laws, or exceed rate limits or abuse the API in a way that degrades service for others.\n\n6. Messaging Compliance\nYou are solely responsible for ensuring your messaging activities comply with all applicable laws and regulations, including:\n\nUnited States: Telephone Consumer Protection Act (TCPA), CAN-SPAM Act, Cellular Telecommunications Industry Association (CTIA) guidelines, TCR/10DLC registration requirements, and state-level privacy and communications laws.\n\nUnited Kingdom: Privacy and Electronic Communications Regulations (PECR), UK GDPR, Ofcom regulations, and the ICO\'s direct marketing guidance.\n\nEuropean Union: ePrivacy Directive (2002/58/EC), EU GDPR, national implementations of ePrivacy rules, and any sector-specific regulations in your jurisdiction.\n\nEngageWorx provides compliance tools to assist you, but compliance remains your responsibility. We may suspend accounts that violate messaging regulations.\n\n7. Intellectual Property\nThe Service, including its code, design, trademarks, and documentation, is owned by EngageWorx and protected by intellectual property laws. Your subscription grants you a limited, non-exclusive, non-transferable license to use the Service for your business purposes. You retain ownership of your content and data. By using the Service, you grant us a limited license to process your data as necessary to provide the Service.\n\n8. Billing & Payments\nSubscription fees are billed monthly or annually through Stripe. All fees are exclusive of taxes unless stated otherwise. You authorize us to charge your payment method on file. Price changes will be communicated at least 30 days in advance. You may cancel at any time; cancellation takes effect at the end of the current billing period. Refunds are provided at our discretion or as required by applicable consumer protection laws.\n\nEU/UK Consumer Rights: If you are a consumer in the EU or UK, you may have a right to cancel within 14 days of purchase under the Consumer Contracts Regulations. This right may not apply once you have begun using the Service with your express consent.\n\n9. Data Protection\nOur collection and use of personal data is governed by our Privacy Policy. Where we process personal data on your behalf (as a data processor), we do so under a Data Processing Agreement in compliance with UK GDPR and EU GDPR. You are responsible for ensuring you have a lawful basis to share customer data with us for messaging purposes.\n\n10. Service Availability & SLA\nWe target 99.9% platform uptime but do not guarantee uninterrupted service. Scheduled maintenance windows will be communicated in advance. We are not liable for downtime caused by factors outside our control, including third-party provider outages, internet connectivity issues, or force majeure events.\n\n11. Limitation of Liability\nTo the maximum extent permitted by applicable law: the Service is provided \"as is\" and \"as available\" without warranties of any kind, we are not liable for indirect, incidental, special, consequential, or punitive damages, our total aggregate liability shall not exceed the fees you paid in the 12 months preceding the claim, and we are not liable for the content of messages you send through the Platform.\n\nNothing in these Terms excludes or limits liability for: death or personal injury caused by negligence, fraud or fraudulent misrepresentation, or any liability that cannot be excluded by applicable law (including UK Consumer Rights Act 2015 and EU consumer protection directives).\n\n12. Indemnification\nYou agree to indemnify and hold EngageWorx harmless from any claims, damages, or expenses arising from your use of the Service, your violation of these Terms, your violation of messaging regulations, or the content of messages sent through your account.\n\n13. Suspension & Termination\nWe may suspend or terminate your account if you breach these Terms, your messaging activity violates applicable laws, your payment is overdue by more than 14 days, or your use poses a security risk to the Platform or other users. Upon termination, you may export your data within 30 days. After that period, we may delete your data in accordance with our retention policies.\n\n14. Dispute Resolution\nUnited States: Disputes shall be resolved through binding arbitration under the rules of the American Arbitration Association (AAA) in Miami, Florida. You waive the right to participate in class actions.\n\nUnited Kingdom: These Terms are governed by the laws of England and Wales. Disputes shall be subject to the exclusive jurisdiction of the English courts.\n\nEuropean Union: These Terms are governed by the laws of the EU member state in which you are resident. Nothing in these Terms affects your rights under mandatory consumer protection laws. EU consumers may also use the Online Dispute Resolution platform at ec.europa.eu/odr.\n\n15. Modifications\nWe may update these Terms at any time. Material changes will be notified by email at least 30 days before they take effect. Continued use after changes constitutes acceptance, except where applicable law requires explicit consent.\n\n16. Severability\nIf any provision of these Terms is found unenforceable, the remaining provisions shall continue in full force and effect.\n\n17. Entire Agreement\nThese Terms, together with our Privacy Policy and any Data Processing Agreement, constitute the entire agreement between you and EngageWorx.\n\nContact\nFor questions about these Terms: legal@engwx.com\nEngageWorx, Miami, Florida, USA"
    },
    smsconsent: {
      title: 'SMS Consent Policy',
      updated: 'March 5, 2026',
      content: "How We Collect Consent\nEngageWorx and its service provider partners collect consent to send SMS messages through the following methods:\n\nWeb Form Opt-In: When a customer submits a form on a business\'s website powered by EngageWorx, they are presented with a clear SMS consent checkbox. The checkbox is not pre-checked. The customer must actively opt in before any messages are sent.\n\nKeyword Opt-In: Customers may text START to a business\'s dedicated phone number to opt in to receive SMS messages.\n\nPoint of Service: Customers may provide verbal or written consent during in-person interactions, which is recorded by the business in the EngageWorx platform.\n\nWhat Messages You Will Receive\nOnce opted in, you may receive the following types of SMS messages from the business you consented to: transactional notifications (appointment confirmations, order updates, service alerts), customer support responses to your enquiries, AI-assisted responses to your questions, and promotional messages and offers (only if you specifically consent to marketing messages).\n\nMessage Frequency\nMessage frequency varies based on your interactions with the business. Transactional messages are sent as needed. Marketing messages, if opted in, are typically limited to 4-8 per month. You can adjust your preferences at any time.\n\nHow to Opt Out\nYou can stop receiving messages at any time by replying STOP to any message, or by replying CANCEL, END, QUIT, UNSUBSCRIBE, or OPTOUT. You may also contact the business directly. After opting out, you will receive a confirmation message and no further messages will be sent. You can opt back in at any time by texting START.\n\nHow to Get Help\nReply HELP or INFO to any message for assistance. You can also contact the business directly or email support@engwx.com.\n\nCosts\nMessage and data rates may apply. Check with your mobile carrier for details about your text messaging plan.\n\nPrivacy\nYour phone number and personal information are handled in accordance with our Privacy Policy. We do not sell or share your phone number with third parties for marketing purposes. Consent data is securely stored and auditable.\n\nAbout EngageWorx\nEngageWorx is an AI-powered omnichannel customer communications platform. Businesses use EngageWorx to manage customer messaging across SMS, email, and voice channels. For more information, visit www.engwx.com.\n\nContact\nFor questions about SMS consent or messaging practices:\nEmail: support@engwx.com\nWeb: www.engwx.com"
    },
    accessibility: {
      title: 'Accessibility Statement',
      updated: 'February 26, 2026',
      content: "EngageWorx is committed to ensuring digital accessibility for people of all abilities. We believe everyone should have equal access to our platform and services, regardless of disability, impairment, or assistive technology used.\n\nThis statement applies to the EngageWorx website (engwx.com) and the EngageWorx platform (portal.engwx.com).\n\nStandards & Compliance\nWe strive to conform to the following accessibility standards: Web Content Accessibility Guidelines (WCAG) 2.1 Level AA (international standard), Section 508 of the Rehabilitation Act (United States), the Americans with Disabilities Act (ADA) (United States), the Equality Act 2010 (United Kingdom), EN 301 549 — the European standard for ICT accessibility (European Union), and the European Accessibility Act (Directive 2019/882).\n\nMeasures We Have Taken\nWe have implemented the following accessibility measures across our platform:\n\nPerceivable: sufficient color contrast ratios (minimum 4.5:1 for text), text alternatives for non-text content, responsive design that adapts to different screen sizes and zoom levels, content that can be presented in different ways without losing meaning, and no content that relies solely on color to convey information.\n\nOperable: full keyboard navigation support throughout the platform, no keyboard traps — users can navigate freely, visible focus indicators on interactive elements, sufficient time for users to read and interact with content, no content that flashes more than three times per second, and skip navigation links for screen reader users.\n\nUnderstandable: clear and consistent navigation patterns, form labels and error messages that are descriptive and helpful, consistent behavior of interactive components, and language of the page is programmatically set.\n\nRobust: compatibility with major screen readers (JAWS, NVDA, VoiceOver, TalkBack), valid and semantic HTML markup, ARIA landmarks and labels where appropriate, and regular testing with assistive technologies.\n\nKnown Limitations\nWhile we strive for comprehensive accessibility, we are aware of the following limitations: some third-party embedded content (e.g., Stripe payment forms) may have accessibility gaps — we work with these providers to improve, certain complex data visualizations in analytics may not be fully accessible to screen readers — we provide text alternatives where possible, and older PDF documents may not be fully tagged for accessibility — we are working to remediate these.\n\nWe are actively working to address these limitations and improve accessibility across all areas of the platform.\n\nTesting & Evaluation\nWe regularly evaluate our accessibility through: automated testing tools (axe, Lighthouse, WAVE), manual testing with keyboard-only navigation, screen reader testing (VoiceOver, NVDA), user testing with individuals who use assistive technologies, and periodic third-party accessibility audits.\n\nFeedback & Contact\nWe welcome feedback on the accessibility of EngageWorx. If you encounter any barriers, need information in an alternative format, or have suggestions for improvement, please contact us:\n\nEmail: accessibility@engwx.com\n\nWe aim to acknowledge accessibility feedback within 2 business days and to provide a resolution or timeline within 10 business days.\n\nEnforcement & Complaints\nIf you are not satisfied with our response, you may escalate your concern to:\n\nUnited States: File a complaint under the ADA with the U.S. Department of Justice at ada.gov, or under Section 508 with the relevant federal agency.\n\nUnited Kingdom: Contact the Equality Advisory Support Service (EASS) at equalityadvisoryservice.com, or the Equality and Human Rights Commission (EHRC) at equalityhumanrights.com.\n\nEuropean Union: Contact your national equality body or the European Commission. Under the European Accessibility Act, enforcement mechanisms vary by member state.\n\nContinuous Improvement\nAccessibility is an ongoing effort. We are committed to regularly reviewing and improving our platform to ensure the best possible experience for all users. This statement is reviewed and updated at least annually."
    }
  };

  // If showing a legal page, render it
  if (legalPage) {
    const legalData = legalContent[legalPage];
    const paragraphs = legalData && legalData.content ? legalData.content.split(String.fromCharCode(10) + String.fromCharCode(10)) : [];
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", background: '#050810', color: '#E8F4FD', minHeight: '100vh', padding: '60px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <button onClick={() => setLegalPage(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #1a2540', borderRadius: 8, padding: '10px 24px', color: '#E8F4FD', fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: "'Outfit', sans-serif", marginBottom: 40 }}>&larr; Back to Home</button>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, marginBottom: 8, color: '#E8F4FD' }}>{legalData ? legalData.title : 'Page Not Found'}</h1>
          <p style={{ color: '#6B8BAE', fontSize: 14, marginBottom: 40 }}>{legalData ? 'Last updated: ' + legalData.updated : 'The requested page could not be loaded.'}</p>
          {paragraphs.map((para, i) => {
            const trimmed = para.trim();
            if (!trimmed) return null;
            const isHeading = trimmed.length < 80 && !trimmed.includes('. ') && !trimmed.includes(',');
            return isHeading
              ? <h2 key={i} style={{ fontSize: 20, fontWeight: 800, marginTop: 40, marginBottom: 12, color: '#00C9FF' }}>{trimmed}</h2>
              : <p key={i} style={{ color: '#9BB0C7', fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>{trimmed}</p>;
          })}
          {paragraphs.length === 0 && <p style={{ color: '#FF3B30' }}>Debug: legalPage="{legalPage}", hasData={legalData ? 'yes' : 'no'}, keys={Object.keys(legalContent).join(',')}</p>}
        </div>
      </div>
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
