import { useState, useEffect } from "react";
import { supabase } from './supabaseClient';

const DEMO_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';

const SLIDES = [
  { id: 'inbox', icon: '💬', label: 'Live Inbox', desc: 'Every channel in one place' },
  { id: 'pipeline', icon: '⚡', label: 'Pipeline', desc: 'AI-powered lead tracking' },
  { id: 'sequences', icon: '📧', label: 'Sequences', desc: 'Automated outreach' },
  { id: 'ai', icon: '🤖', label: 'AI Agent', desc: 'Responds 24/7 automatically' },
  { id: 'analytics', icon: '📈', label: 'Analytics', desc: 'Real-time performance' },
];

const STATS = [
  { label: 'Messages Sent', value: '12,847', delta: '+23%', color: '#00C9FF' },
  { label: 'Response Rate', value: '94%', delta: '+8%', color: '#10b981' },
  { label: 'Active Leads', value: '143', delta: '+12', color: '#E040FB' },
  { label: 'Avg Response', value: '0.3s', delta: 'AI', color: '#f59e0b' },
];

const DEMO_CONVERSATIONS = [
  { name: 'David Hess', company: 'Airespring', channel: 'SMS', msg: 'Hey, loved the demo. When can we talk pricing?', time: '2m', hot: true },
  { name: 'Veronica H.', company: 'LinkedIn Lead', channel: 'Email', msg: 'Thanks for reaching out — yes I\'d love to see a demo', time: '14m', hot: false },
  { name: 'Philip Cannis', company: 'Primo Dialer', channel: 'WhatsApp', msg: 'Can the platform handle 500+ agents?', time: '1h', hot: true },
  { name: 'Keith M.', company: 'Partner Lead', channel: 'SMS', msg: 'We have 200 SMB clients — this could be huge', time: '2h', hot: false },
  { name: 'FORA Travel', company: 'FORA', channel: 'Email', msg: 'Our agents need this. Can we book a call?', time: '3h', hot: false },
];

const CHANNEL_COLOR = { SMS: '#10b981', Email: '#6366f1', WhatsApp: '#25D366' };

function ChannelBadge({ channel }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: CHANNEL_COLOR[channel] + '22', color: CHANNEL_COLOR[channel], border: '1px solid ' + CHANNEL_COLOR[channel] + '44', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{channel}</span>
  );
}

function SlideInbox() {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ padding: '0 16px 16px' }}>
        {DEMO_CONVERSATIONS.map(function(c, i) {
          return (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid ' + (c.hot ? '#ef4444' : 'rgba(255,255,255,0.1)'), borderRadius: 10, padding: '12px 14px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #E040FB)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{c.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{c.name}</span>
                    {c.hot && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 800 }}>🔥</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <ChannelBadge channel={c.channel} />
                    <span style={{ fontSize: 10, color: '#475569' }}>{c.time}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.company}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.msg}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlidePipeline() {
  var stages = [
    { label: 'Inquiry', count: 8, color: '#6366f1' },
    { label: 'Demo Shared', count: 5, color: '#8b5cf6' },
    { label: 'Sandbox', count: 3, color: '#a855f7' },
    { label: 'Opportunity', count: 4, color: '#ec4899' },
    { label: 'Customer', count: 12, color: '#10b981' },
  ];
  return (
    <div style={{ flex: 1, padding: '0 16px 16px', overflowY: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {STATS.map(function(s) {
          return (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{s.label}</div>
              <div style={{ fontSize: 10, color: '#10b981', marginTop: 4, fontWeight: 700 }}>{s.delta} this month</div>
            </div>
          );
        })}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Pipeline Stages</div>
        {stages.map(function(s) {
          return (
            <div key={s.label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.count}</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: (s.count / 12 * 100) + '%', background: s.color, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideSequences() {
  var seqs = [
    { name: 'CPExpo 2026 Follow-up', enrolled: 6, steps: 7, active: 4 },
    { name: 'General Outreach', enrolled: 12, steps: 5, active: 9 },
    { name: 'Demo Follow-up', enrolled: 3, steps: 4, active: 2 },
  ];
  return (
    <div style={{ flex: 1, padding: '0 16px 16px', overflowY: 'auto' }}>
      {seqs.map(function(s) {
        return (
          <div key={s.name} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>{s.name}</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><div style={{ fontSize: 18, fontWeight: 800, color: '#00C9FF' }}>{s.enrolled}</div><div style={{ fontSize: 10, color: '#475569' }}>Enrolled</div></div>
              <div><div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{s.active}</div><div style={{ fontSize: 10, color: '#475569' }}>Active</div></div>
              <div><div style={{ fontSize: 18, fontWeight: 800, color: '#E040FB' }}>{s.steps}</div><div style={{ fontSize: 10, color: '#475569' }}>Steps</div></div>
            </div>
            <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: (s.active / s.enrolled * 100) + '%', background: 'linear-gradient(90deg, #00C9FF, #E040FB)', borderRadius: 2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SlideAI() {
  var [msgs, setMsgs] = useState([
    { from: 'lead', text: 'Hi, I saw your platform. What does it cost?' },
    { from: 'ai', text: 'Hi! Thanks for reaching out. We have plans starting at $99/month — would you like me to send over our pricing breakdown?' },
    { from: 'lead', text: 'Yes please. Also do you support WhatsApp?' },
    { from: 'ai', text: 'Absolutely! EngageWorx supports SMS, WhatsApp, Email, Voice and RCS — all in one platform. I\'ll send pricing now. Would a quick 15-min call help?' },
  ]);
  var [typing, setTyping] = useState(false);

  function simulate() {
    setTyping(true);
    setTimeout(function() {
      setMsgs(function(prev) {
        return prev.concat([
          { from: 'lead', text: 'What about reseller options?' },
        ]);
      });
      setTimeout(function() {
        setTyping(false);
        setMsgs(function(prev) {
          return prev.concat([
            { from: 'ai', text: 'Great question! Our CSP Partner program lets you white-label and resell EngageWorx under your own brand. Margins up to 40%. Want details?' },
          ]);
        });
      }, 1500);
    }, 500);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 16px 16px', overflowY: 'auto' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {msgs.map(function(m, i) {
          var isAI = m.from === 'ai';
          return (
            <div key={i} style={{ display: 'flex', justifyContent: isAI ? 'flex-start' : 'flex-end' }}>
              <div style={{ maxWidth: '80%', padding: '10px 12px', borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px', background: isAI ? 'rgba(0,201,255,0.12)' : 'rgba(99,102,241,0.2)', border: '1px solid ' + (isAI ? 'rgba(0,201,255,0.2)' : 'rgba(99,102,241,0.3)'), fontSize: 12, color: '#f1f5f9', lineHeight: 1.5 }}>
                {isAI && <div style={{ fontSize: 9, color: '#00C9FF', fontWeight: 800, marginBottom: 4, letterSpacing: '0.05em' }}>🤖 AI AGENT</div>}
                {m.text}
              </div>
            </div>
          );
        })}
        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '4px 12px 12px 12px', background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.15)', fontSize: 12, color: '#00C9FF' }}>
              🤖 typing...
            </div>
          </div>
        )}
      </div>
      <button onClick={simulate} disabled={typing} style={{ padding: '10px', borderRadius: 8, border: 'none', background: typing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #00C9FF, #E040FB)', color: typing ? '#475569' : '#000', fontWeight: 800, fontSize: 13, cursor: typing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
        {typing ? 'AI responding...' : 'Simulate Inbound Message →'}
      </button>
    </div>
  );
}

function SlideAnalytics() {
  var days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var values = [65, 82, 54, 91, 78, 43, 67];
  var max = Math.max.apply(null, values);
  return (
    <div style={{ flex: 1, padding: '0 16px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Messages This Week</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
          {values.map(function(v, i) {
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: (v / max * 64) + 'px', background: 'linear-gradient(180deg, #00C9FF, #E040FB)', borderRadius: '3px 3px 0 0', minHeight: 4 }} />
                <div style={{ fontSize: 9, color: '#475569' }}>{days[i]}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Open Rate', value: '68%', color: '#00C9FF' },
          { label: 'Click Rate', value: '24%', color: '#10b981' },
          { label: 'Opt-outs', value: '0.2%', color: '#f59e0b' },
          { label: 'AI Handled', value: '94%', color: '#E040FB' },
        ].map(function(s) {
          return (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MobileDemo({ C, onExit }) {
  var [slide, setSlide] = useState(0);
  var current = SLIDES[slide];

  var slideContent = {
    inbox: <SlideInbox />,
    pipeline: <SlidePipeline />,
    sequences: <SlideSequences />,
    ai: <SlideAI />,
    analytics: <SlideAnalytics />,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#080d1a', fontFamily: "'DM Sans', sans-serif", color: '#f1f5f9', display: 'flex', flexDirection: 'column', zIndex: 2000 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #00C9FF, #E040FB)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#000' }}>EW</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>EngageWorx</div>
            <div style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>● Live Demo</div>
          </div>
        </div>
        {onExit && <button onClick={onExit} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 10px', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Exit</button>}
      </div>

      <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{current.icon} {current.label}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{current.desc}</div>
      </div>

      {slideContent[current.id]}

      <div style={{ padding: '10px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {SLIDES.map(function(s, i) {
            var isActive = i === slide;
            return (
              <button key={s.id} onClick={function() { setSlide(i); }} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: '1px solid ' + (isActive ? 'rgba(0,201,255,0.4)' : 'rgba(255,255,255,0.07)'), background: isActive ? 'rgba(0,201,255,0.12)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <span style={{ fontSize: 9, color: isActive ? '#00C9FF' : '#475569', fontWeight: isActive ? 700 : 400, fontFamily: 'inherit' }}>{s.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
