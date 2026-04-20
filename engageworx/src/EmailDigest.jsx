import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import DigestStore from './digestStore';

var ACTION_STYLE = {
  advance_stage:   { label: 'Advance Stage',  color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  enroll_sequence: { label: 'Enroll Sequence', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  review:          { label: 'Needs Review',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  auto_reply:      { label: 'Auto-Reply',      color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  no_action:       { label: 'No Action',       color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

var SP_TENANT_ID = process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';

export default function EmailDigest({ C, currentTenantId }) {
  var resolvedTenantId = currentTenantId || SP_TENANT_ID;
  var colors = C || { bg: '#080d1a', surface: '#0d1425', border: '#182440', primary: '#00C9FF', accent: '#E040FB', text: '#E8F4FD', muted: '#6B8BAE' };
  var [items, setItems] = useState([]);
  var [loading, setLoading] = useState(true);
  var [filter, setFilter] = useState('pending');
  var [editingId, setEditingId] = useState(null);
  var [editDraft, setEditDraft] = useState('');
  var [sending, setSending] = useState(null);
  var [delayOpenFor, setDelayOpenFor] = useState(null);
  var [customPickerFor, setCustomPickerFor] = useState(null);
  var [customValue, setCustomValue] = useState('');
  var [improveOpenFor, setImproveOpenFor] = useState(null);
  var [improveContext, setImproveContext] = useState('');
  var [improving, setImproving] = useState(false);
  var [improveErr, setImproveErr] = useState(null);

  // ── Follow-up Generator state (backed by DigestStore singleton) ──
  var [followups, setFollowupsRaw] = useState(function() { return DigestStore.getFuCards(); });
  function setFollowups(valOrFn) {
    setFollowupsRaw(function(prev) {
      var next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      DigestStore.saveFuCards(next);
      next.forEach(function(f) { if (f.draft || f.generated) DigestStore.setDraft(f.id, { draft: f.draft || '', channel: f.channel || 'email', generated: f.generated || false }); });
      return next;
    });
  }
  var [fuLoading, setFuLoading] = useState(false);
  var [fuGenerating, setFuGenerating] = useState(null);
  var [fuGeneratingAll, setFuGeneratingAll] = useState(false);
  var [fuSending, setFuSending] = useState(null);
  var [fuSelected, setFuSelected] = useState({});
  var [fuFilter, setFuFilter] = useState('all');
  var [fuTagFilter, setFuTagFilter] = useState('');
  var [fuAvailableTags, setFuAvailableTags] = useState([]);
  var [fuSearchOpen, setFuSearchOpen] = useState(false);
  var [fuSearchQuery, setFuSearchQuery] = useState('');
  var [fuSearchResults, setFuSearchResults] = useState([]);
  var [fuSearching, setFuSearching] = useState(false);
  var [fuImproving, setFuImproving] = useState(null);
  var [fuPreview, setFuPreview] = useState(null);

  // ── VIP Outreach state (backed by DigestStore singleton) ──
  var [vipContacts, setVipContactsRaw] = useState(function() { return DigestStore.getVipCards(); });
  function setVipContacts(valOrFn) {
    setVipContactsRaw(function(prev) {
      var next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      DigestStore.saveVipCards(next);
      return next;
    });
  }
  var [vipSearchOpen, setVipSearchOpen] = useState(false);
  var [vipSearchQuery, setVipSearchQuery] = useState('');
  var [vipSearchResults, setVipSearchResults] = useState([]);
  var [vipSearching, setVipSearching] = useState(false);
  var [vipResearching, setVipResearching] = useState(null);
  var [vipSending, setVipSending] = useState(null);
  var [vipPreview, setVipPreview] = useState(null);
  var [vipFollowingUp, setVipFollowingUp] = useState(null);
  var [vipFollowupDays, setVipFollowupDays] = useState(5);
  var [vipDatePicker, setVipDatePicker] = useState(null);

  function makeVipCard(c, extra) {
    return {
      id: c.id, first_name: c.first_name, last_name: c.last_name,
      email: c.email, phone: c.phone || c.mobile_phone, company: c.company,
      title: c.title || '', notes: c.notes || '', context: '',
      emailDraft: '', smsDraft: '', subject: '', fromEmail: 'rob@engwx.com',
      research: null, researched: false, channel: 'email',
      calendly_cta: '', signature_first: '', signature_reply: '', sig_type: 'first',
      last_contacted_at: c.last_contacted_at || null,
      vip_followup_at: (DigestStore.getVipOverride(c.id) && DigestStore.getVipOverride(c.id).vip_followup_at) || c.vip_followup_at || null,
      has_reply: (extra && extra.has_reply) || false,
    };
  }

  async function loadVipContacts() {
    if (!resolvedTenantId) return;
    try {
      // Load tenant follow-up days setting
      try {
        var tR = await supabase.from('tenants').select('vip_followup_days').eq('id', resolvedTenantId).maybeSingle();
        if (tR.data && tR.data.vip_followup_days) setVipFollowupDays(tR.data.vip_followup_days);
      } catch (e) {}
      var r = await supabase.from('contacts').select('id, first_name, last_name, email, phone, mobile_phone, company, title, notes, last_contacted_at, vip_followup_at')
        .eq('tenant_id', resolvedTenantId).eq('is_vip', true);
      var contactIds = (r.data || []).map(function(c) { return c.id; });
      var replyMap = {};
      if (contactIds.length > 0) {
        try {
          var inbound = await supabase.from('messages').select('contact_id')
            .eq('tenant_id', resolvedTenantId).eq('direction', 'inbound')
            .in('contact_id', contactIds).limit(200);
          (inbound.data || []).forEach(function(m) { replyMap[m.contact_id] = true; });
        } catch (e) {}
      }
      var dbContacts = (r.data || []).map(function(c) { return makeVipCard(c, { has_reply: !!replyMap[c.id] }); });
      var queued = null;
      try {
        var raw = localStorage.getItem('engwx_vip_queue');
        if (raw) { localStorage.removeItem('engwx_vip_queue'); queued = JSON.parse(raw); }
      } catch (e) {}
      setVipContacts(function(prev) {
        var prevMap = {};
        prev.forEach(function(c) { prevMap[c.id] = c; });
        var ids = {};
        var merged = [];
        // Keep prev cards that have local state (drafts, research, local followup date)
        prev.forEach(function(c) {
          if (c.emailDraft || c.researched || c.context) { ids[c.id] = true; merged.push(c); }
        });
        // Add DB cards, merging local vip_followup_at if prev had it
        dbContacts.forEach(function(c) {
          if (!ids[c.id]) {
            var p = prevMap[c.id];
            if (p && p.vip_followup_at) c = Object.assign({}, c, { vip_followup_at: p.vip_followup_at });
            ids[c.id] = true; merged.push(c);
          }
        });
        if (queued && queued.id && !ids[queued.id]) merged.push(makeVipCard(queued));
        return merged;
      });
    } catch (e) { console.warn('[VIP] load error:', e.message); }
  }

  useEffect(function() { loadVipContacts(); }, [resolvedTenantId]);

  useEffect(function() {
    function onVisible() { if (!document.hidden) loadVipContacts(); }
    document.addEventListener('visibilitychange', onVisible);
    return function() { document.removeEventListener('visibilitychange', onVisible); };
  }, [resolvedTenantId]);

  function openImprove(a) {
    var existing = (a.action_payload && a.action_payload.user_context) || '';
    setImproveOpenFor(a.id);
    setImproveContext(existing);
    setImproveErr(null);
  }
  function closeImprove() {
    setImproveOpenFor(null);
    setImproveContext('');
    setImproveErr(null);
  }
  async function regenerate(a) {
    if (!improveContext.trim()) { setImproveErr('Add some context first.'); return; }
    setImproving(true);
    setImproveErr(null);
    try {
      var r = await fetch('/api/improve-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: a.id, context: improveContext.trim() }),
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Improve failed');
      setItems(function(prev) { return prev.map(function(x) {
        if (x.id !== a.id) return x;
        var np = Object.assign({}, x.action_payload || {}, { user_context: d.user_context, original_draft: d.original_draft, improved_at: new Date().toISOString() });
        return Object.assign({}, x, { claude_reply_draft: d.improved_draft, action_payload: np });
      }); });
      if (editingId === a.id) setEditDraft(d.improved_draft);
    } catch (e) { setImproveErr(e.message); }
    setImproving(false);
  }
  async function restoreOriginal(a) {
    var orig = a.action_payload && a.action_payload.original_draft;
    if (!orig) return;
    if (!window.confirm('Restore the original Claude-drafted reply? Your improved version will be lost.')) return;
    try {
      var newPayload = Object.assign({}, a.action_payload || {});
      delete newPayload.original_draft;
      delete newPayload.user_context;
      delete newPayload.improved_at;
      await supabase.from('email_actions').update({ claude_reply_draft: orig, action_payload: newPayload }).eq('id', a.id);
      setItems(function(prev) { return prev.map(function(x) {
        return x.id === a.id ? Object.assign({}, x, { claude_reply_draft: orig, action_payload: newPayload }) : x;
      }); });
      if (editingId === a.id) setEditDraft(orig);
      closeImprove();
    } catch (e) { alert('Restore failed: ' + e.message); }
  }

  // ── Follow-up candidate loader ──
  async function loadFollowups() {
    if (!resolvedTenantId) return;
    setFuLoading(true);
    try {
      var fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      var r = await supabase.from('contacts').select('id, first_name, last_name, email, phone, company, tags, notes')
        .eq('tenant_id', resolvedTenantId).limit(200);
      var allContacts = r.data || [];
      console.log('[Followups] DB returned ' + allContacts.length + ' contacts for tenant ' + resolvedTenantId);
      if (allContacts.length > 0) {
        console.log('[Followups] sample contacts:', allContacts.slice(0, 3).map(function(c) { return { id: c.id, name: (c.first_name || '') + ' ' + (c.last_name || ''), email: c.email, tags: c.tags }; }));
      }
      if (r.error) console.error('[Followups] query error:', r.error.message);
      var tagSet = {};
      allContacts.forEach(function(c) {
        (c.tags || []).forEach(function(t) { tagSet[t] = true; });
      });
      setFuAvailableTags(Object.keys(tagSet).sort());
      console.log('[Followups] available tags:', Object.keys(tagSet));
      var contacts = allContacts;
      if (fuTagFilter) {
        contacts = contacts.filter(function(c) {
          return (c.tags || []).indexOf(fuTagFilter) > -1;
        });
        console.log('[Followups] after tag filter "' + fuTagFilter + '": ' + contacts.length + ' contacts');
      }
      var ids = contacts.map(function(c) { return c.id; });
      if (ids.length === 0) { console.log('[Followups] 0 contacts after tag filter, setting empty'); setFollowups([]); setFuLoading(false); return; }
      var convR = await supabase.from('conversations').select('contact_id, last_message_at')
        .eq('tenant_id', resolvedTenantId).in('contact_id', ids)
        .order('last_message_at', { ascending: false });
      console.log('[Followups] conversations found: ' + (convR.data || []).length);
      var lastConvMap = {};
      (convR.data || []).forEach(function(c) {
        if (!lastConvMap[c.contact_id]) lastConvMap[c.contact_id] = c.last_message_at;
      });
      var candidates = contacts.filter(function(c) {
        var lastMsg = lastConvMap[c.id];
        return !lastMsg || lastMsg < fourteenDaysAgo;
      });
      console.log('[Followups] candidates after conversation filter: ' + candidates.length + ' (from ' + contacts.length + ')');
      setFollowups(function(prev) {
        var prevMap = {};
        prev.forEach(function(f) { prevMap[f.id] = f; });
        return candidates.map(function(c) {
          var existing = prevMap[c.id];
          var cached = DigestStore.getDraft(c.id);
          return {
            id: c.id, first_name: c.first_name, last_name: c.last_name,
            email: c.email, phone: c.phone, company: c.company,
            tags: c.tags || [], notes: c.notes,
            draft: (existing && existing.draft) || (cached && cached.draft) || '',
            channel: (existing && existing.channel) || (cached && cached.channel) || (c.email ? 'email' : 'sms'),
            generated: (existing && existing.generated) || (cached && cached.generated) || false,
            signature_first: (existing && existing.signature_first) || (cached && cached.signature_first) || '',
            signature_reply: (existing && existing.signature_reply) || (cached && cached.signature_reply) || '',
            sig_type: (existing && existing.sig_type) || (cached && cached.sig_type) || 'first',
            manual: existing ? existing.manual : false,
          };
        });
      });
    } catch (e) { console.error('[Followup] load error:', e.message); }
    setFuLoading(false);
  }
  useEffect(function() { if (resolvedTenantId) loadFollowups(); }, [resolvedTenantId, fuTagFilter]);

  async function generateFollowup(contact) {
    console.log('[FuGenerate] function entered, contact:', contact ? contact.id : 'NULL');
    if (!contact || !contact.id) { console.error('[FuGenerate] no contact or id'); return; }
    console.log('[FuGenerate] contact:', contact.first_name, contact.last_name, 'company:', contact.company);
    setFuGenerating(contact.id);
    console.log('[FuGenerate] setFuGenerating done, about to fetch, tenantId:', resolvedTenantId);
    try {
      var name = ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() || 'there';
      console.log('[FuGenerate] calling /api/generate-followup for', name);
      var r = await fetch('/api/generate-followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: name, company: contact.company || '',
          notes: contact.notes || '',
          channel: contact.channel || 'email', tenant_id: resolvedTenantId,
        }),
      });
      console.log('[FuGenerate] API response status:', r.status);
      var d = await r.json();
      if (!r.ok) { console.error('[FuGenerate] API error:', d.error); throw new Error(d.error || 'Generation failed'); }
      console.log('[FuGenerate] draft received, length:', (d.draft || '').length);
      // Write to DigestStore immediately (survives remount)
      DigestStore.setDraft(contact.id, { draft: d.draft || '', channel: contact.channel || 'email', generated: true, signature_first: d.signature_first || '', signature_reply: d.signature_reply || '' });
      var updated = DigestStore.getFuCards().map(function(f) {
        return f.id === contact.id ? Object.assign({}, f, { draft: d.draft, generated: true, signature_first: d.signature_first || '', signature_reply: d.signature_reply || '', sig_type: 'first' }) : f;
      });
      DigestStore.saveFuCards(updated);
      setFollowupsRaw(updated);
    } catch (e) { console.error('[FuGenerate] error:', e.message); alert('Generate error: ' + e.message); }
    setFuGenerating(null);
  }

  async function generateAllFollowups() {
    var pending = followups.filter(function(f) { return !f.draft; });
    if (pending.length === 0) return;
    setFuGeneratingAll(true);
    for (var c of pending) {
      await generateFollowup(c);
    }
    setFuGeneratingAll(false);
  }

  async function improveFollowup(contact) {
    setFuImproving(contact.id);
    try {
      var name = ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() || 'there';
      var r = await fetch('/api/generate-followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: name, company: contact.company || '',
          notes: contact.notes || '',
          channel: contact.channel || 'email', tenant_id: resolvedTenantId,
          existing_draft: contact.draft, improve: true,
        }),
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Improve failed');
      setFollowups(function(prev) { return prev.map(function(f) {
        return f.id === contact.id ? Object.assign({}, f, { draft: d.draft }) : f;
      }); });
    } catch (e) { alert('Improve error: ' + e.message); }
    setFuImproving(null);
  }

  async function sendFollowup(contact) {
    if (!contact.draft) { alert('Generate a message first.'); return; }
    setFuSending(contact.id);
    try {
      var name = ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim();
      // Build full body with signature for email
      var fullBody = contact.draft;
      if (contact.channel === 'email') {
        var selectedSig = contact.sig_type === 'reply' ? contact.signature_reply : contact.signature_first;
        if (selectedSig) fullBody = contact.draft + '\n\n' + selectedSig;
      }
      var convRes = await supabase.from('conversations').insert({
        tenant_id: resolvedTenantId, contact_id: contact.id,
        channel: contact.channel, status: 'active',
        subject: 'Follow-up: ' + name,
        last_message_at: new Date().toISOString(), unread_count: 0,
      }).select('id').single();
      if (!convRes.data) throw new Error('Failed to create conversation');
      await supabase.from('messages').insert({
        tenant_id: resolvedTenantId, conversation_id: convRes.data.id,
        contact_id: contact.id, channel: contact.channel,
        direction: 'outbound', sender_type: 'agent',
        body: fullBody, status: 'delivered',
        metadata: { source: 'followup_generator', from_email: 'rob@engwx.com' },
        created_at: new Date().toISOString(),
      });
      if (contact.channel === 'email' && contact.email) {
        await fetch('/api/send-digest-reply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: contact.email, subject: 'Following up', body: fullBody, from: 'rob@engwx.com' }),
        });
      } else if (contact.channel === 'sms' && contact.phone) {
        await fetch('/api/sms', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', to: contact.phone, body: contact.draft, tenant_id: resolvedTenantId }),
        });
      }
      // Remove from list
      setFollowups(function(prev) { return prev.filter(function(f) { return f.id !== contact.id; }); });
      setFuSelected(function(prev) { var n = Object.assign({}, prev); delete n[contact.id]; return n; });
    } catch (e) { alert('Send error: ' + e.message); }
    setFuSending(null);
  }

  async function sendSelectedFollowups() {
    var sel = followups.filter(function(f) { return fuSelected[f.id] && f.draft; });
    if (sel.length === 0) { alert('Select contacts with generated messages first.'); return; }
    if (!window.confirm('Send ' + sel.length + ' follow-up message(s)?')) return;
    setFuSending('bulk');
    for (var c of sel) {
      try { await sendFollowup(c); } catch (e) { console.error('Bulk send error:', c.id, e); }
    }
    setFuSending(null);
  }

  function toggleFuSelect(id) {
    setFuSelected(function(prev) { var n = Object.assign({}, prev); n[id] = !n[id]; return n; });
  }
  function selectAllFu() {
    var all = {};
    followups.forEach(function(f) { all[f.id] = true; });
    setFuSelected(all);
  }
  function deselectAllFu() { setFuSelected({}); }

  async function searchContacts(query) {
    if (!query.trim() || !resolvedTenantId) return;
    setFuSearching(true);
    try {
      var q = query.trim();
      var words = q.split(/\s+/);
      var r;
      if (words.length > 1) {
        // Multi-word: search first word in first_name AND second in last_name, plus full string in other fields
        var pattern = '%' + q + '%';
        var firstP = '%' + words[0] + '%';
        var lastP = '%' + words.slice(1).join(' ') + '%';
        r = await supabase.from('contacts').select('id, first_name, last_name, email, phone, company, tags, notes')
          .eq('tenant_id', resolvedTenantId)
          .or('first_name.ilike.' + firstP + ',last_name.ilike.' + lastP + ',email.ilike.' + pattern + ',company.ilike.' + pattern)
          .limit(20);
      } else {
        var pattern = '%' + q + '%';
        r = await supabase.from('contacts').select('id, first_name, last_name, email, phone, company, tags, notes')
          .eq('tenant_id', resolvedTenantId)
          .or('first_name.ilike.' + pattern + ',last_name.ilike.' + pattern + ',email.ilike.' + pattern + ',company.ilike.' + pattern)
          .limit(20);
      }
      var existingIds = {};
      followups.forEach(function(f) { existingIds[f.id] = true; });
      setFuSearchResults((r.data || []).filter(function(c) { return !existingIds[c.id]; }));
    } catch (e) { console.error('[Followup] search error:', e); }
    setFuSearching(false);
  }

  function addContactToFollowups(contact) {
    setFollowups(function(prev) {
      if (prev.find(function(f) { return f.id === contact.id; })) return prev;
      return prev.concat([{
        id: contact.id, first_name: contact.first_name, last_name: contact.last_name,
        email: contact.email, phone: contact.phone, company: contact.company,
        tags: contact.tags || [], notes: contact.notes,
        draft: '', channel: contact.email ? 'email' : 'sms', generated: false, manual: true,
      }]);
    });
    setFuSearchResults(function(prev) { return prev.filter(function(c) { return c.id !== contact.id; }); });
  }

  // ── VIP Outreach functions ──
  async function vipSearch(query) {
    if (!query.trim() || !resolvedTenantId) return;
    setVipSearching(true);
    try {
      var q = query.trim();
      var pattern = '%' + q + '%';
      var r = await supabase.from('contacts').select('id, first_name, last_name, email, phone, mobile_phone, company, title, notes')
        .eq('tenant_id', resolvedTenantId)
        .or('first_name.ilike.' + pattern + ',last_name.ilike.' + pattern + ',email.ilike.' + pattern + ',company.ilike.' + pattern)
        .limit(20);
      var existingIds = {};
      vipContacts.forEach(function(c) { existingIds[c.id] = true; });
      setVipSearchResults((r.data || []).filter(function(c) { return !existingIds[c.id]; }));
    } catch (e) { console.error('[VIP] search error:', e); }
    setVipSearching(false);
  }

  function addVipContact(contact) {
    setVipContacts(function(prev) {
      if (prev.find(function(c) { return c.id === contact.id; })) return prev;
      return prev.concat([{
        id: contact.id, first_name: contact.first_name, last_name: contact.last_name,
        email: contact.email, phone: contact.phone, company: contact.company,
        title: contact.title, notes: contact.notes,
        emailDraft: '', smsDraft: '', subject: '', fromEmail: 'rob@engwx.com',
        research: null, researched: false, channel: 'email',
      }]);
    });
    setVipSearchResults(function(prev) { return prev.filter(function(c) { return c.id !== contact.id; }); });
  }

  async function researchAndGenerate(contact) {
    setVipResearching(contact.id);
    try {
      var name = ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() || 'there';
      var r = await fetch('/api/vip-research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: name, title: contact.title || '',
          company: contact.company || '', email: contact.email || '',
          notes: contact.notes || '', context: contact.context || '',
          tenant_id: resolvedTenantId,
        }),
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Research failed');
      setVipContacts(function(prev) { return prev.map(function(c) {
        if (c.id !== contact.id) return c;
        return Object.assign({}, c, {
          emailDraft: d.email_body || '', smsDraft: d.sms_body || '',
          subject: d.subject || '', research: d.research || '',
          calendly_cta: d.calendly_cta || '', signature_first: d.signature_first || '', signature_reply: d.signature_reply || '',
          researched: true,
        });
      }); });
    } catch (e) { alert('Research error: ' + e.message); }
    setVipResearching(null);
  }

  async function sendVipOutreach(contact) {
    var draft = contact.channel === 'sms' ? contact.smsDraft : contact.emailDraft;
    if (!draft) { alert('Generate a message first.'); return; }
    setVipSending(contact.id);
    try {
      // For email: combine draft + calendly CTA + signature
      var fullBody = draft;
      if (contact.channel === 'email') {
        var parts = [draft];
        if (contact.calendly_cta) parts.push(contact.calendly_cta);
        var selectedSig = contact.sig_type === 'reply' ? contact.signature_reply : contact.signature_first;
        if (selectedSig) parts.push(selectedSig);
        fullBody = parts.join('\n\n');
      }
      var name = ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim();
      var convRes = await supabase.from('conversations').insert({
        tenant_id: resolvedTenantId, contact_id: contact.id,
        channel: contact.channel, status: 'active',
        subject: 'VIP Outreach: ' + name,
        last_message_at: new Date().toISOString(), unread_count: 0,
      }).select('id').single();
      if (!convRes.data) throw new Error('Failed to create conversation');
      await supabase.from('messages').insert({
        tenant_id: resolvedTenantId, conversation_id: convRes.data.id,
        contact_id: contact.id, channel: contact.channel,
        direction: 'outbound', sender_type: 'agent',
        body: fullBody, status: 'delivered',
        metadata: { source: 'vip_outreach', research: contact.research || '' },
        created_at: new Date().toISOString(),
      });
      if (contact.channel === 'email' && contact.email) {
        await fetch('/api/send-digest-reply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: contact.email, subject: contact.subject || 'Quick intro', body: fullBody, from: contact.fromEmail }),
        });
      } else if (contact.channel === 'sms' && contact.phone) {
        await fetch('/api/sms', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', to: contact.phone, body: draft, tenant_id: resolvedTenantId }),
        });
      }
      // Update last_contacted_at on the contact
      var now = new Date().toISOString();
      try { await supabase.from('contacts').update({ last_contacted_at: now }).eq('id', contact.id); } catch (e) {}
      // Update card to show sent status instead of removing
      setVipContacts(function(prev) { return prev.map(function(c) {
        if (c.id !== contact.id) return c;
        return Object.assign({}, c, { last_contacted_at: now, emailDraft: '', smsDraft: '', researched: false, research: null });
      }); });
    } catch (e) { alert('Send error: ' + e.message); }
    setVipSending(null);
  }

  async function generateVipFollowup(contact) {
    setVipFollowingUp(contact.id);
    try {
      var name = ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() || 'there';
      var r = await fetch('/api/vip-followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contact.id, contact_name: name,
          company: contact.company || '', tenant_id: resolvedTenantId,
        }),
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Follow-up generation failed');
      setVipContacts(function(prev) { return prev.map(function(c) {
        if (c.id !== contact.id) return c;
        return Object.assign({}, c, {
          emailDraft: d.email_body || '', subject: d.subject || '',
          fromEmail: d.from_email || c.fromEmail,
          calendly_cta: d.calendly_cta || '', signature_first: d.signature_first || '', signature_reply: d.signature_reply || '', sig_type: 'reply',
          researched: true, channel: 'email',
        });
      }); });
    } catch (e) { alert('Follow-up error: ' + e.message); }
    setVipFollowingUp(null);
  }

  useEffect(function() { load(); }, [currentTenantId]);

  var [trackingGap, setTrackingGap] = useState(null);
  useEffect(function() {
    if (!currentTenantId) return;
    (async function() {
      try {
        var t = await supabase.from('tenants').select('email_tracking_slug, email_tracking_remind').eq('id', currentTenantId).maybeSingle();
        if (!t.data || t.data.email_tracking_remind === false) { setTrackingGap(null); return; }
        var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        var outbound = await supabase.from('messages').select('id').eq('tenant_id', currentTenantId).eq('channel', 'email').eq('direction', 'outbound').contains('metadata', { source: 'bcc_tracking' }).gte('created_at', sevenDaysAgo).limit(1);
        var inbound = await supabase.from('email_actions').select('id, email_from').eq('tenant_id', currentTenantId).eq('source', 'inbound_email').gte('created_at', sevenDaysAgo).limit(5);
        var inboundCount = (inbound.data || []).length;
        var outboundCount = (outbound.data || []).length;
        if (inboundCount > 0 && outboundCount === 0) {
          setTrackingGap({ slug: t.data.email_tracking_slug, inboundCount: inboundCount, sample: inbound.data[0] && inbound.data[0].email_from });
        } else {
          setTrackingGap(null);
        }
      } catch (e) {}
    })();
  }, [currentTenantId]);

  async function load() {
    setLoading(true);
    try {
      var cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      var q = supabase.from('email_actions').select('*').gte('created_at', cutoff).order('created_at', { ascending: false });
      if (currentTenantId) q = q.eq('tenant_id', currentTenantId);
      var r = await q;
      setItems(r.data || []);
    } catch (e) { console.error('[Digest] Load error:', e.message); }
    setLoading(false);
  }

  async function markActioned(id) {
    try {
      await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', id);
      load();
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function markDismissed(id) {
    try {
      await supabase.from('email_actions').update({ status: 'dismissed' }).eq('id', id);
      load();
    } catch (e) { alert('Error: ' + e.message); }
  }

  function delayOptions() {
    var now = Date.now();
    var tomorrow9 = new Date(); tomorrow9.setDate(tomorrow9.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
    return [
      { id: 'now',  label: 'Send Now',   ts: null },
      { id: '1h',   label: 'In 1 hour',  ts: new Date(now + 1 * 3600000).toISOString() },
      { id: '2h',   label: 'In 2 hours', ts: new Date(now + 2 * 3600000).toISOString() },
      { id: '4h',   label: 'In 4 hours', ts: new Date(now + 4 * 3600000).toISOString() },
      { id: '8h',   label: 'In 8 hours', ts: new Date(now + 8 * 3600000).toISOString() },
      { id: 'tmr',  label: 'Tomorrow 9am', ts: tomorrow9.toISOString() },
      { id: 'custom', label: '📅 Custom date/time…', ts: '__custom__' },
    ];
  }

  function defaultCustomValue() {
    var d = new Date(Date.now() + 60 * 60000);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  async function scheduleAction(a, ts) {
    setSending(a.id);
    try {
      if (!ts) { await executeAction(a); setDelayOpenFor(null); return; }
      // If the user edited the draft, persist it first
      var patch = { scheduled_at: ts };
      if (editingId === a.id && editDraft && editDraft !== a.claude_reply_draft) {
        patch.claude_reply_draft = editDraft;
      }
      await supabase.from('email_actions').update(patch).eq('id', a.id);
      setDelayOpenFor(null);
      setEditingId(null);
      load();
    } catch (e) { alert('Error: ' + e.message); }
    setSending(null);
  }

  async function executeAction(a) {
    setSending(a.id);
    try {
      if (a.claude_action === 'advance_stage' && a.lead_id && a.action_payload?.new_stage) {
        await supabase.from('leads').update({ stage: a.action_payload.new_stage, last_activity_at: new Date().toISOString() }).eq('id', a.lead_id);
        await markActioned(a.id);
      } else if (a.claude_action === 'enroll_sequence' && a.lead_id && a.tenant_id && a.action_payload?.sequence_name) {
        var seq = await supabase.from('sequences').select('id').eq('tenant_id', a.tenant_id).ilike('name', '%' + a.action_payload.sequence_name + '%').limit(1).maybeSingle();
        if (!seq.data) { alert('Sequence "' + a.action_payload.sequence_name + '" not found in tenant.'); setSending(null); return; }
        var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seq.data.id).eq('step_number', 1).single();
        var nextAt = new Date(Date.now() + ((fs.data && fs.data.delay_days) || 0) * 86400000).toISOString();
        await supabase.from('lead_sequences').upsert({ tenant_id: a.tenant_id, lead_id: a.lead_id, sequence_id: seq.data.id, current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: nextAt }, { onConflict: 'lead_id,sequence_id' });
        await markActioned(a.id);
      } else if (a.claude_action === 'auto_reply' || a.claude_action === 'review') {
        var body = editingId === a.id ? editDraft : (a.claude_reply_draft || '');
        if (!body) { alert('No reply draft available. Click "Edit & Send" to write one.'); setSending(null); return; }
        var resp = await fetch('/api/send-digest-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: a.email_from, subject: (a.email_subject && a.email_subject.startsWith('Re:')) ? a.email_subject : ('Re: ' + (a.email_subject || 'your message')), body: body }),
        });
        var data = await resp.json();
        if (!data.success) throw new Error(data.error || 'send failed');
        await markActioned(a.id);
        setEditingId(null);
      } else {
        await markActioned(a.id);
      }
    } catch (e) { alert('Action error: ' + e.message); }
    setSending(null);
  }

  var today = new Date().toISOString().split('T')[0];
  var todayItems = items.filter(function(i) { return (i.created_at || '').startsWith(today); });
  var filtered = filter === 'all' ? items : items.filter(function(i) { return i.status === filter; });
  // Split by source
  var healthItems = filtered.filter(function(i) { return i.source === 'tenant_health'; });
  var staleItems = filtered.filter(function(i) { return i.source === 'stale_lead'; });
  var inboundItems = filtered.filter(function(i) { return i.source !== 'stale_lead' && i.source !== 'tenant_health'; });
  var pendingStale = staleItems.filter(function(i) { return i.status === 'pending'; });

  async function bulkApproveStale() {
    if (pendingStale.length === 0) return;
    if (!window.confirm('Approve and execute ' + pendingStale.length + ' stale lead action(s)?')) return;
    setSending('bulk');
    for (var a of pendingStale) {
      try { await executeAction(a); } catch (e) { console.error('Bulk approve error:', a.id, e); }
    }
    setSending(null);
    load();
  }

  var stats = {
    processed: todayItems.length,
    actioned: items.filter(function(i) { return i.status === 'actioned' && (i.actioned_at || '').startsWith(today); }).length,
    pending: items.filter(function(i) { return i.status === 'pending'; }).length,
    auto: items.filter(function(i) { return i.status === 'actioned' && i.claude_action === 'auto_reply'; }).length,
  };

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18 };

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>📡 AI Omnichannel Digest</h1>
          <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Claude-analyzed inbound email, WhatsApp, SMS, and voice with recommended actions</p>
        </div>
        <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>🔄 Refresh</button>
      </div>

      {trackingGap && trackingGap.slug && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.35)', borderRadius: 10, marginBottom: 18 }}>
          <div style={{ fontSize: 22 }}>💡</div>
          <div style={{ flex: 1, color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
            <strong style={{ color: '#0ea5e9' }}>Tracking tip —</strong> you received {trackingGap.inboundCount} reply{trackingGap.inboundCount === 1 ? '' : 'ies'} in the last 7 days{trackingGap.sample ? ' (latest from ' + trackingGap.sample + ')' : ''} but none of your outbound emails were tracked. Add <code style={{ color: '#0ea5e9', background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>track+{trackingGap.slug}@engwx.com</code> to your BCC to see the full thread.
            <a href="#" onClick={function(e) { e.preventDefault(); window.location.href = '/?page=settings&tab=channels'; }} style={{ color: '#0ea5e9', marginLeft: 8, fontWeight: 700 }}>Setup →</a>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Processed Today',   v: stats.processed, color: '#00C9FF' },
          { label: 'Auto-Resolved',     v: stats.auto,       color: '#10b981' },
          { label: 'Actioned Today',    v: stats.actioned,  color: '#6366f1' },
          { label: 'Pending Review',    v: stats.pending,   color: '#f59e0b' },
        ].map(function(s, i) {
          return <div key={i} style={Object.assign({}, card, { textAlign: 'center' })}>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.v}</div>
            <div style={{ fontSize: 11, color: colors.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
          </div>;
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'pending',   label: 'Pending ' + items.filter(function(i) { return i.status === 'pending'; }).length },
          { id: 'actioned',  label: 'Actioned' },
          { id: 'dismissed', label: 'Dismissed' },
          { id: 'all',       label: 'All (7d)' },
        ].map(function(tab) {
          var active = filter === tab.id;
          return <button key={tab.id} onClick={function() { setFilter(tab.id); }} style={{
            background: active ? colors.primary + '20' : 'transparent',
            border: '1px solid ' + (active ? colors.primary + '44' : 'rgba(255,255,255,0.1)'),
            borderRadius: 8, padding: '6px 14px', color: active ? colors.primary : colors.muted,
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>{tab.label}</button>;
        })}
      </div>

      {loading ? (
        <div style={{ color: colors.muted, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>No emails in this view</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ═══════════ Pending Follow-ups Section ═══════════ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>📋 Pending Follow-ups <span style={{ color: colors.muted, fontSize: 13, fontWeight: 400 }}>· {followups.length}</span></h2>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={fuTagFilter} onChange={function(e) { setFuTagFilter(e.target.value); }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}>
                  <option value="">All pending (14+ days)</option>
                  {fuAvailableTags.map(function(tag) { return <option key={tag} value={tag}>{tag}</option>; })}
                </select>
                <button onClick={function() { setFuSearchOpen(true); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>＋ Add Contact</button>
                {followups.length > 0 && (
                  <button onClick={generateAllFollowups} disabled={fuGeneratingAll} style={{ background: 'linear-gradient(135deg, #E040FB, #A855F7)', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 12, opacity: fuGeneratingAll ? 0.6 : 1 }}>
                    {fuGeneratingAll ? '⏳ Generating…' : '✨ Generate All'}
                  </button>
                )}
              </div>
            </div>
            <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 8px' }}>Contacts with no reply or conversation in the last 7 days. Claude generates personalized follow-ups using event context.</p>

            {followups.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <button onClick={selectAllFu} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 10px', color: colors.muted, cursor: 'pointer', fontSize: 11 }}>Select All</button>
                <button onClick={deselectAllFu} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 10px', color: colors.muted, cursor: 'pointer', fontSize: 11 }}>Deselect All</button>
                {fuAvailableTags.length > 0 && (
                  <select onChange={function(e) {
                    if (!e.target.value) return;
                    var tag = e.target.value;
                    var sel = {};
                    followups.forEach(function(f) { if ((f.tags || []).indexOf(tag) > -1) sel[f.id] = true; });
                    setFuSelected(sel);
                    e.target.value = '';
                  }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', color: colors.muted, fontSize: 11, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}>
                    <option value="">Select by tag…</option>
                    {fuAvailableTags.map(function(t) { return <option key={t} value={t}>{t}</option>; })}
                  </select>
                )}
                {Object.keys(fuSelected).filter(function(k) { return fuSelected[k]; }).length > 0 && (
                  <button onClick={sendSelectedFollowups} disabled={fuSending === 'bulk'} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: 12, opacity: fuSending === 'bulk' ? 0.6 : 1 }}>
                    {fuSending === 'bulk' ? '⏳ Sending…' : '✉️ Send Selected (' + Object.keys(fuSelected).filter(function(k) { return fuSelected[k]; }).length + ')'}
                  </button>
                )}
              </div>
            )}

            {fuLoading ? (
              <div style={{ color: colors.muted, textAlign: 'center', padding: 20 }}>Loading follow-up candidates…</div>
            ) : followups.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 30 })}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>No pending follow-ups</div>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>All contacts have been recently engaged, or use "Add Contact" to manually queue someone.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {followups.map(function(fu) {
                  var name = ((fu.first_name || '') + ' ' + (fu.last_name || '')).trim() || fu.email || fu.phone || 'Unknown';
                  var isGenerating = fuGenerating === fu.id || fuGeneratingAll;
                  if (fu.draft) console.log('[FuCard]', fu.first_name, 'sig_first=' + (fu.signature_first || '').length + ' sig_reply=' + (fu.signature_reply || '').length + ' sig_type=' + (fu.sig_type || 'none'));
                  var isImproving = fuImproving === fu.id;
                  var isSending = fuSending === fu.id || fuSending === 'bulk';
                  return (
                    <div key={fu.id} id={'followup-card-' + fu.id} style={Object.assign({}, card, { borderLeft: '3px solid ' + (fu.draft ? '#10b981' : '#f59e0b') })}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ paddingTop: 2 }}>
                          <input type="checkbox" checked={!!fuSelected[fu.id]} onChange={function() { toggleFuSelect(fu.id); }} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{name}</span>
                            {fu.company && <span style={{ color: colors.muted, fontSize: 12 }}>· {fu.company}</span>}
                            {(fu.tags || []).length > 0 && (fu.tags || []).slice(0, 2).map(function(tag) { return <span key={tag} style={{ background: 'rgba(224,64,251,0.12)', color: '#E040FB', border: '1px solid rgba(224,64,251,0.4)', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{tag}</span>; })}
                            {fu.manual && <span style={{ background: 'rgba(14,165,233,0.12)', color: '#0ea5e9', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>Manual</span>}
                          </div>
                          <div style={{ color: colors.muted, fontSize: 11, marginBottom: 8 }}>
                            {fu.email && <span>{fu.email}</span>}
                            {fu.email && fu.phone && <span> · </span>}
                            {fu.phone && <span>{fu.phone}</span>}
                          </div>

                          {fu.draft ? (<>
                            <textarea value={fu.draft} onChange={function(e) {
                              var val = e.target.value;
                              setFollowups(function(prev) { return prev.map(function(f) { return f.id === fu.id ? Object.assign({}, f, { draft: val }) : f; }); });
                            }} rows={4} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: 10, color: '#fff', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
                            {(fu.signature_first || fu.signature_reply) && (
                              <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ color: colors.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Auto-appended on send</span>
                                  {fu.signature_first && fu.signature_reply && (
                                    <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 2 }}>
                                      <button type="button" onMouseDown={function() { setFollowups(function(p) { return p.map(function(f) { return f.id === fu.id ? Object.assign({}, f, { sig_type: 'first' }) : f; }); }); }} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, background: (fu.sig_type || 'first') === 'first' ? colors.primary + '22' : 'transparent', color: (fu.sig_type || 'first') === 'first' ? colors.primary : colors.muted }}>✉️ Full</button>
                                      <button type="button" onMouseDown={function() { setFollowups(function(p) { return p.map(function(f) { return f.id === fu.id ? Object.assign({}, f, { sig_type: 'reply' }) : f; }); }); }} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, background: fu.sig_type === 'reply' ? colors.primary + '22' : 'transparent', color: fu.sig_type === 'reply' ? colors.primary : colors.muted }}>↩️ Reply</button>
                                    </div>
                                  )}
                                </div>
                                <div style={{ marginTop: 8, padding: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: (fu.sig_type === 'reply' ? fu.signature_reply : fu.signature_first) || '' }} />
                              </div>
                            )}
                          </>) : (
                            <div style={{ color: colors.muted, fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>No message generated yet — click Generate or ✨ Generate All</div>
                          )}

                          <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select value={fu.channel} onChange={function(e) {
                              var val = e.target.value;
                              setFollowups(function(prev) { return prev.map(function(f) { return f.id === fu.id ? Object.assign({}, f, { channel: val }) : f; }); });
                            }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
                              <option value="email">📧 Email</option>
                              <option value="sms">📱 SMS</option>
                            </select>
                            {!fu.draft && (
                              <button type="button" onMouseDown={function() { console.log('[FuGenerate] mousedown for', fu.id, 'typeof generateFollowup:', typeof generateFollowup); try { generateFollowup(fu); } catch(err) { console.error('[FuGenerate] SYNC ERROR:', err); } }} disabled={isGenerating} style={{ background: colors.primary + '22', border: '1px solid ' + colors.primary + '44', borderRadius: 6, padding: '5px 12px', color: colors.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700, opacity: isGenerating ? 0.5 : 1 }}>
                                {isGenerating ? '⏳ Generating…' : '✨ Generate'}
                              </button>
                            )}
                            {fu.draft && (
                              <button type="button" onMouseDown={function() { console.log('[FuImprove] mousedown for', fu.id); improveFollowup(fu); }} disabled={isImproving} style={{ background: 'rgba(224,64,251,0.12)', border: '1px solid rgba(224,64,251,0.4)', borderRadius: 6, padding: '5px 12px', color: '#E040FB', cursor: 'pointer', fontSize: 11, fontWeight: 700, opacity: isImproving ? 0.5 : 1 }}>
                                {isImproving ? '⏳ Improving…' : '✨ Improve'}
                              </button>
                            )}
                            {fu.draft && (
                              <button type="button" onMouseDown={function() { console.log('[FuPreview] opening for', fu.id, fu.first_name, 'channel=' + fu.channel); setFuPreview(fu); }} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, padding: '5px 12px', color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>👁 Preview</button>
                            )}
                            {fu.draft && (
                              <button type="button" onMouseDown={function() { if (!isSending) sendFollowup(fu); }} disabled={isSending} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 6, padding: '5px 14px', color: '#000', cursor: 'pointer', fontSize: 11, fontWeight: 800, opacity: isSending ? 0.5 : 1 }}>
                                {isSending ? '⏳…' : '✉️ Send'}
                              </button>
                            )}
                            <button type="button" onClick={function() {
                              setFollowups(function(prev) { return prev.filter(function(f) { return f.id !== fu.id; }); });
                              setFuSelected(function(prev) { var n = Object.assign({}, prev); delete n[fu.id]; return n; });
                            }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '5px 10px', color: colors.muted, cursor: 'pointer', fontSize: 11 }}>✗ Dismiss</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══════════ Follow-up Preview Modal ═══════════ */}
          {fuPreview && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setFuPreview(null); }}>
              <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#fff', borderRadius: 14, width: 640, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Preview</span>
                    <button type="button" onClick={function() { console.log('[FuPreview] close X clicked'); setFuPreview(null); }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>To: {fuPreview.email || '—'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>From: rob@engwx.com</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Following up</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                  <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{fuPreview.draft}</div>
                  {(fuPreview.signature_first || fuPreview.signature_reply) && (
                    <div style={{ marginTop: 12, padding: 12, border: '1px solid #e8eaf0', borderRadius: 8, backgroundColor: '#fafafa' }} dangerouslySetInnerHTML={{ __html: (fuPreview.sig_type === 'reply' ? fuPreview.signature_reply : fuPreview.signature_first) || '' }} />
                  )}
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={function(e) {
                    console.log('[Followup Edit] RAW CLICK fired');
                    e.stopPropagation();
                    var snapshot = fuPreview;
                    var cId = snapshot && snapshot.id;
                    var draftText = snapshot && snapshot.draft;
                    console.log('[Followup Edit] id=' + cId + ' draft len=' + (draftText || '').length);
                    // Write to DigestStore + React state directly (bypass wrapper to avoid race)
                    if (cId && draftText) {
                      DigestStore.setDraft(cId, { draft: draftText, channel: snapshot.channel || 'email', generated: true });
                      var updatedFu = followups.map(function(f) {
                        if (f.id !== cId) return f;
                        return Object.assign({}, f, { draft: draftText, generated: true });
                      });
                      DigestStore.saveFuCards(updatedFu);
                      setFollowupsRaw(updatedFu);
                    }
                    setFuPreview(null);
                    if (cId) {
                      setTimeout(function() {
                        var el = document.getElementById('followup-card-' + cId);
                        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); var ta = el.querySelector('textarea'); if (ta) ta.focus(); }
                      }, 200);
                    }
                  }} style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 20px', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✏️ Edit</button>
                  <button type="button" onClick={function() { console.log('[FuPreview] Send clicked'); var contact = fuPreview; setFuPreview(null); sendFollowup(contact); }} style={{ background: '#10b981', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✉️ Send</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ Contact Search Modal ═══════════ */}
          {fuSearchOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setFuSearchOpen(false); }}>
              <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#0d1425', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 800 }}>＋ Add Contact to Follow-ups</h3>
                  <button onClick={function() { setFuSearchOpen(false); }} style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={fuSearchQuery} onChange={function(e) { setFuSearchQuery(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') searchContacts(fuSearchQuery); }} placeholder="Search by name, email, or company…" style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={function() { searchContacts(fuSearchQuery); }} disabled={fuSearching} style={{ background: colors.primary + '22', border: '1px solid ' + colors.primary + '44', borderRadius: 8, padding: '8px 14px', color: colors.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{fuSearching ? '…' : '🔍 Search'}</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {fuSearchResults.length === 0 ? (
                    <div style={{ color: colors.muted, textAlign: 'center', padding: 20, fontSize: 13 }}>
                      {fuSearchQuery ? 'No results — try a different query' : 'Type a name, email, or company to search'}
                    </div>
                  ) : fuSearchResults.map(function(c) {
                    var cName = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email || 'Unknown';
                    return (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{cName}</div>
                          <div style={{ color: colors.muted, fontSize: 11 }}>{c.email || c.phone}{c.company ? ' · ' + c.company : ''}</div>
                        </div>
                        <button onClick={function() { addContactToFollowups(c); }} style={{ background: colors.primary + '22', border: '1px solid ' + colors.primary + '44', borderRadius: 6, padding: '5px 12px', color: colors.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>＋ Add</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ VIP Outreach Section ═══════════ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>⭐ VIP Outreach <span style={{ color: colors.muted, fontSize: 13, fontWeight: 400 }}>· {vipContacts.length}</span></h2>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={function() { loadVipContacts(); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>🔄</button>
              <button onClick={function() { setVipSearchOpen(true); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>＋ Add Contact</button>
              </div>
            </div>
            <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 10px' }}>AI-researched, hyper-personalized outreach. Claude uses web search to learn about each company and crafts a tailored message.</p>

            {vipContacts.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 30 })}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>No VIP contacts queued</div>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Use "Add Contact" to search and select high-value contacts for personalized outreach.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {vipContacts.map(function(vc) {
                  var name = ((vc.first_name || '') + ' ' + (vc.last_name || '')).trim() || vc.email || 'Unknown';
                  var isResearching = vipResearching === vc.id;
                  var isSending = vipSending === vc.id;
                  var daysSinceContact = vc.last_contacted_at ? Math.floor((Date.now() - new Date(vc.last_contacted_at).getTime()) / 86400000) : null;
                  var followupDue;
                  if (vc.vip_followup_at) {
                    followupDue = Date.now() >= new Date(vc.vip_followup_at).getTime() && !vc.has_reply;
                  } else {
                    followupDue = daysSinceContact !== null && daysSinceContact >= vipFollowupDays && !vc.has_reply;
                  }
                  var noReply = daysSinceContact !== null && !vc.has_reply && !followupDue;
                  return (
                    <div key={vc.id} id={'vip-card-' + vc.id} style={Object.assign({}, card, { borderLeft: '3px solid ' + (followupDue ? '#FF3B30' : '#FFD600') })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{name}</span>
                        {vc.title && <span style={{ color: colors.muted, fontSize: 12 }}>· {vc.title}</span>}
                        {vc.company && <span style={{ background: 'rgba(255,214,0,0.12)', color: '#FFD600', border: '1px solid rgba(255,214,0,0.4)', borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>{vc.company}</span>}
                        {followupDue && <span style={{ background: 'rgba(255,59,48,0.12)', color: '#FF3B30', border: '1px solid rgba(255,59,48,0.4)', borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>⏰ Follow-up due</span>}
                        {noReply && !followupDue && <span style={{ background: 'rgba(255,152,0,0.12)', color: '#FF9800', border: '1px solid rgba(255,152,0,0.4)', borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>No reply yet</span>}
                        {vc.has_reply && <span style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676', border: '1px solid rgba(0,230,118,0.4)', borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>✓ Replied</span>}
                      </div>
                      <div style={{ color: colors.muted, fontSize: 11, marginBottom: 10 }}>
                        {vc.email && <span>{vc.email}</span>}
                        {vc.email && vc.phone && <span> · </span>}
                        {vc.phone && <span>{vc.phone}</span>}
                        {daysSinceContact !== null && <span style={{ marginLeft: 8, color: followupDue ? '#FF3B30' : 'rgba(255,255,255,0.3)' }}>· Last contacted {daysSinceContact === 0 ? 'today' : daysSinceContact + 'd ago'}</span>}
                        {vc.vip_followup_at && <span style={{ marginLeft: 8, color: '#6366f1', fontWeight: 600 }}>· ⏰ Follow-up: {new Date(vc.vip_followup_at).toLocaleDateString()}</span>}
                      </div>

                      {daysSinceContact !== null && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', position: 'relative', zIndex: 2 }}>
                          <span style={{ color: colors.muted, fontSize: 11 }}>⏰ Follow up in:</span>
                          {[3, 5, 7].map(function(d) {
                            return <button type="button" key={d} onClick={function(e) {
                              e.stopPropagation();
                              e.preventDefault();
                              var dt = new Date(Date.now() + d * 86400000).toISOString();
                              console.log('[VIP] ' + d + 'd button clicked for ' + vc.id);
                              DigestStore.setVipOverride(vc.id, { vip_followup_at: dt });
                              var updated = vipContacts.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { vip_followup_at: dt }) : c; });
                              DigestStore.saveVipCards(updated);
                              setVipContactsRaw(updated);
                              supabase.from('contacts').update({ vip_followup_at: dt }).eq('id', vc.id).then(function() { console.log('[VIP] DB saved'); });
                            }} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{d}d</button>;
                          })}
                          <button type="button" onClick={function(e) { e.stopPropagation(); setVipDatePicker(vipDatePicker === vc.id ? null : vc.id); }} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>📅 Date</button>
                          {vipDatePicker === vc.id && (
                            <input type="date" onChange={async function(e) {
                              if (!e.target.value) return;
                              var dt = new Date(e.target.value + 'T09:00:00').toISOString();
                              setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { vip_followup_at: dt }) : c; }); });
                              setVipDatePicker(null);
                              try { await supabase.from('contacts').update({ vip_followup_at: dt }).eq('id', vc.id); } catch (e2) {}
                            }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }} />
                          )}
                        </div>
                      )}

                      {vc.research && (
                        <div style={{ padding: '10px 12px', background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.2)', borderRadius: 8, marginBottom: 10 }}>
                          <div style={{ color: '#FFD600', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🔍 Company Research</div>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.5 }}>{vc.research}</div>
                        </div>
                      )}

                      <div style={{ marginBottom: 10 }}>
                        <textarea value={vc.context || ''} onChange={function(e) { var val = e.target.value; setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { context: val }) : c; }); }); }} rows={2} placeholder="Add context: e.g. Met at CPExpo, interested in WhatsApp, has 50 agents..." style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.4 }} />
                      </div>

                      {!vc.researched ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onMouseDown={function() { console.log('[VIP] Research clicked for', vc.id); if (!isResearching) researchAndGenerate(vc); }} disabled={isResearching || vipFollowingUp === vc.id} style={{ flex: 1, background: 'linear-gradient(135deg, #FFD600, #F59E0B)', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: 13, opacity: isResearching ? 0.6 : 1 }}>
                            {isResearching ? '🔍 Researching…' : '🔍 Research & Generate'}
                          </button>
                          {(followupDue || noReply) && (
                            <button type="button" onMouseDown={function() { console.log('[VIP] Follow-up clicked for', vc.id); if (vipFollowingUp !== vc.id) generateVipFollowup(vc); }} disabled={vipFollowingUp === vc.id} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 13, opacity: vipFollowingUp === vc.id ? 0.6 : 1 }}>
                              {vipFollowingUp === vc.id ? '⏳…' : '🔄 Follow-up'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3 }}>
                              <button onClick={function() { setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { channel: 'email' }) : c; }); }); }} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: vc.channel === 'email' ? colors.primary + '22' : 'transparent', color: vc.channel === 'email' ? colors.primary : colors.muted }}>📧 Email</button>
                              <button onClick={function() { setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { channel: 'sms' }) : c; }); }); }} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: vc.channel === 'sms' ? '#00E676' + '22' : 'transparent', color: vc.channel === 'sms' ? '#00E676' : colors.muted }}>📱 SMS</button>
                            </div>
                            {vc.channel === 'email' && (
                              <select value={vc.fromEmail} onChange={function(e) { var val = e.target.value; setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { fromEmail: val }) : c; }); }); }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
                                <option value="rob@engwx.com">From: rob@engwx.com</option>
                                <option value="hello@engwx.com">From: hello@engwx.com</option>
                              </select>
                            )}
                          </div>

                          {vc.channel === 'email' && (
                            <div style={{ marginBottom: 8 }}>
                              <input value={vc.subject} onChange={function(e) { var val = e.target.value; setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { subject: val }) : c; }); }); }} placeholder="Subject line…" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,214,0,0.25)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                            </div>
                          )}

                          {vc.channel === 'sms' ? (<>
                            <textarea value={vc.smsDraft} onChange={function(e) { var val = e.target.value; setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { smsDraft: val }) : c; }); }); }} rows={2} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,214,0,0.25)', borderRadius: 6, padding: 10, color: '#fff', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
                            <div style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right' }}>{(vc.smsDraft || '').length}/160 chars</div>
                          </>) : (<>
                            <textarea value={vc.emailDraft} onChange={function(e) { var val = e.target.value; setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { emailDraft: val }) : c; }); }); }} rows={5} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,214,0,0.25)', borderRadius: 6, padding: 10, color: '#fff', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
                            {(vc.calendly_cta || vc.signature_first || vc.signature_reply) && (
                              <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ color: colors.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Auto-appended on send</span>
                                  {vc.signature_first && vc.signature_reply && (
                                    <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 2 }}>
                                      <button type="button" onMouseDown={function() { setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { sig_type: 'first' }) : c; }); }); }} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, background: (vc.sig_type || 'first') === 'first' ? colors.primary + '22' : 'transparent', color: (vc.sig_type || 'first') === 'first' ? colors.primary : colors.muted }}>✉️ Full</button>
                                      <button type="button" onMouseDown={function() { setVipContacts(function(p) { return p.map(function(c) { return c.id === vc.id ? Object.assign({}, c, { sig_type: 'reply' }) : c; }); }); }} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, background: vc.sig_type === 'reply' ? colors.primary + '22' : 'transparent', color: vc.sig_type === 'reply' ? colors.primary : colors.muted }}>↩️ Reply</button>
                                    </div>
                                  )}
                                </div>
                                {vc.calendly_cta && <div style={{ color: colors.primary, fontSize: 12, marginBottom: 8 }}>{vc.calendly_cta}</div>}
                                <div style={{ marginTop: 8, padding: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: (vc.sig_type === 'reply' ? vc.signature_reply : vc.signature_first) || '' }} />
                              </div>
                            )}
                          </>)}

                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            <button type="button" onMouseDown={function() { if (!isResearching) researchAndGenerate(vc); }} disabled={isResearching} style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.4)', borderRadius: 6, padding: '6px 12px', color: '#FFD600', cursor: 'pointer', fontSize: 11, fontWeight: 700, opacity: isResearching ? 0.5 : 1 }}>
                              {isResearching ? '⏳…' : '🔄 Regenerate'}
                            </button>
                            {vc.channel === 'email' && vc.emailDraft && <button type="button" onMouseDown={function() { setVipPreview(vc); }} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, padding: '6px 12px', color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>👁 Preview</button>}
                            <button type="button" onMouseDown={function() { if (!isSending) sendVipOutreach(vc); }} disabled={isSending} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 6, padding: '6px 14px', color: '#000', cursor: 'pointer', fontSize: 11, fontWeight: 800, opacity: isSending ? 0.5 : 1 }}>
                              {isSending ? '⏳…' : '✉️ Send'}
                            </button>
                            <button type="button" onMouseDown={function() { setVipContacts(function(p) { return p.filter(function(c) { return c.id !== vc.id; }); }); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 10px', color: colors.muted, cursor: 'pointer', fontSize: 11 }}>✗ Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══════════ VIP Email Preview Modal ═══════════ */}
          {vipPreview && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setVipPreview(null); }}>
              <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#fff', borderRadius: 14, width: 640, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Preview</span>
                    <button onClick={function() { setVipPreview(null); }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>To: {vipPreview.email || '—'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>From: {vipPreview.fromEmail || 'rob@engwx.com'}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{vipPreview.subject || '(no subject)'}</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                  <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{vipPreview.emailDraft}</div>
                  {vipPreview.calendly_cta && (
                    <div style={{ marginTop: 16, fontSize: 14, color: '#374151' }}>
                      <a href={vipPreview.calendly_cta.replace('Book a quick call: ', '')} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>{vipPreview.calendly_cta}</a>
                    </div>
                  )}
                  {(vipPreview.signature_first || vipPreview.signature_reply) && (
                    <div style={{ marginTop: 12, padding: 12, border: '1px solid #e8eaf0', borderRadius: 8, backgroundColor: '#fafafa' }} dangerouslySetInnerHTML={{ __html: (vipPreview.sig_type === 'reply' ? vipPreview.signature_reply : vipPreview.signature_first) || '' }} />
                  )}
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={function() {
                    var contactId = vipPreview && vipPreview.id;
                    setVipPreview(null);
                    if (contactId) {
                      setTimeout(function() {
                        var el = document.getElementById('vip-card-' + contactId);
                        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); var ta = el.querySelector('textarea'); if (ta) ta.focus(); }
                      }, 100);
                    }
                  }} style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 20px', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✏️ Edit</button>
                  <button onClick={function() { var contact = vipPreview; setVipPreview(null); sendVipOutreach(contact); }} style={{ background: '#10b981', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✉️ Send</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ VIP Contact Search Modal ═══════════ */}
          {vipSearchOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setVipSearchOpen(false); }}>
              <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#0d1425', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 800 }}>⭐ Add VIP Contact</h3>
                  <button onClick={function() { setVipSearchOpen(false); }} style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={vipSearchQuery} onChange={function(e) { setVipSearchQuery(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') vipSearch(vipSearchQuery); }} placeholder="Search by name, email, or company…" style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={function() { vipSearch(vipSearchQuery); }} disabled={vipSearching} style={{ background: '#FFD600' + '22', border: '1px solid #FFD600' + '44', borderRadius: 8, padding: '8px 14px', color: '#FFD600', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{vipSearching ? '…' : '🔍'}</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {vipSearchResults.length === 0 ? (
                    <div style={{ color: colors.muted, textAlign: 'center', padding: 20, fontSize: 13 }}>
                      {vipSearchQuery ? 'No results found' : 'Search for a contact to add'}
                    </div>
                  ) : vipSearchResults.map(function(c) {
                    var cName = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email || 'Unknown';
                    return (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{cName}{c.title ? ' · ' + c.title : ''}</div>
                          <div style={{ color: colors.muted, fontSize: 11 }}>{c.email || c.phone}{c.company ? ' · ' + c.company : ''}</div>
                        </div>
                        <button onClick={function() { addVipContact(c); }} style={{ background: '#FFD600' + '22', border: '1px solid #FFD600' + '44', borderRadius: 6, padding: '5px 12px', color: '#FFD600', cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>⭐ Add</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {healthItems.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>🩺 Tenant Health <span style={{ color: colors.muted, fontSize: 13, fontWeight: 400 }}>· {healthItems.length}</span></h2>
              </div>
              <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 10px' }}>Tenants who haven't finished setup or have gone quiet — review and edit Aria's drafted re-engagement message before sending.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {healthItems.map(function(a) { return renderActionCard(a); })}
              </div>
            </div>
          )}
          {staleItems.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>🔄 Stale Lead Actions <span style={{ color: colors.muted, fontSize: 13, fontWeight: 400 }}>· {staleItems.length}</span></h2>
                {pendingStale.length > 0 && (
                  <button onClick={bulkApproveStale} disabled={sending === 'bulk'} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: 12, opacity: sending === 'bulk' ? 0.6 : 1 }}>
                    {sending === 'bulk' ? '⏳ Approving…' : '✅ Approve all ' + pendingStale.length}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {staleItems.map(function(a) { return renderActionCard(a); })}
              </div>
            </div>
          )}
          {inboundItems.length > 0 && (
            <div>
              {staleItems.length > 0 && <h2 style={{ color: '#fff', margin: '0 0 10px', fontSize: 18, fontWeight: 800 }}>📨 Inbound Emails <span style={{ color: colors.muted, fontSize: 13, fontWeight: 400 }}>· {inboundItems.length}</span></h2>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {inboundItems.map(function(a) { return renderActionCard(a); })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function channelMeta(a) {
    var ch = (a.action_payload && a.action_payload.channel) || '';
    if (!ch) {
      var s = a.source || '';
      if (s === 'inbound_email') ch = 'email';
      else if (s === 'whatsapp_inbound') ch = 'whatsapp';
      else if (s === 'sms_inbound') ch = 'sms';
      else if (s === 'voice_inbound') ch = 'voice';
      else if (s === 'stale_lead') ch = 'lead';
      else if (s === 'tenant_health') ch = 'health';
    }
    var map = {
      email:    { icon: '📧', label: 'Email',       color: '#0ea5e9' },
      whatsapp: { icon: '💬', label: 'WhatsApp',    color: '#25D366' },
      sms:      { icon: '📱', label: 'SMS',         color: '#00E676' },
      voice:    { icon: '📞', label: 'Voice',       color: '#FFD600' },
      lead:     { icon: '🔄', label: 'Stale Lead',  color: '#6366f1' },
      health:   { icon: '🩺', label: 'Tenant Health', color: '#ec4899' },
    };
    return map[ch] || { icon: '📨', label: 'Inbound', color: '#94a3b8' };
  }

  function renderActionCard(a) {
            var style = ACTION_STYLE[a.claude_action] || ACTION_STYLE.no_action;
            var editing = editingId === a.id;
            var ch = channelMeta(a);
            return (
              <div key={a.id} style={Object.assign({}, card, { borderLeft: '3px solid ' + style.color })}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ background: ch.color + '22', color: ch.color, border: '1px solid ' + ch.color + '55', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{ch.icon} {ch.label}</span>
                      <span style={{ background: style.bg, color: style.color, border: '1px solid ' + style.color + '44', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{style.label}</span>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
                      {a.status === 'actioned' && <span style={{ color: '#10b981', fontSize: 11, fontWeight: 700 }}>✓ Actioned</span>}
                      {a.status === 'dismissed' && <span style={{ color: colors.muted, fontSize: 11 }}>Dismissed</span>}
                    </div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{a.email_from}</div>
                    <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{a.email_subject || '(no subject)'}</div>
                    <div style={{ color: colors.text, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{a.email_body_summary || ''}</div>
                    {a.claude_reasoning && <div style={{ color: colors.muted, fontSize: 12, marginTop: 10, fontStyle: 'italic', padding: '8px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6 }}>🤖 {a.claude_reasoning}</div>}
                    {a.action_payload && (a.action_payload.new_stage || a.action_payload.sequence_name) && (
                      <div style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
                        {a.action_payload.new_stage && <span>→ Stage: <code style={{ color: '#00E676' }}>{a.action_payload.new_stage}</code> </span>}
                        {a.action_payload.sequence_name && <span>→ Sequence: <code style={{ color: '#a5b4fc' }}>{a.action_payload.sequence_name}</code></span>}
                      </div>
                    )}
                    {a.claude_reply_draft && !editing && (
                      <div style={{ color: colors.text, fontSize: 12, marginTop: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Suggested reply{a.action_payload && a.action_payload.improved_at ? ' · ✨ improved with context' : ''}</span>
                          {a.action_payload && a.action_payload.original_draft && (
                            <button onClick={function() { restoreOriginal(a); }} style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>↩ Restore original</button>
                          )}
                        </div>
                        {a.claude_reply_draft}
                      </div>
                    )}
                    {editing && (
                      <div style={{ marginTop: 10 }}>
                        <textarea value={editDraft} onChange={function(e) { setEditDraft(e.target.value); }} style={{ width: '100%', minHeight: 140, background: 'rgba(0,0,0,0.3)', border: '1px solid ' + colors.primary + '44', borderRadius: 6, padding: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                    )}
                    {improveOpenFor === a.id && (
                      <div style={{ marginTop: 10, padding: 12, background: 'rgba(224,64,251,0.06)', border: '1px solid rgba(224,64,251,0.3)', borderRadius: 8 }}>
                        <div style={{ color: '#E040FB', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>✨ Add context for Claude</div>
                        <textarea value={improveContext} onChange={function(e) { setImproveContext(e.target.value); }} placeholder="e.g. Met at CPExpo, interested in CSP model, has 500 agents, follow up about Poland SMS" rows={3} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(224,64,251,0.3)', borderRadius: 6, padding: 10, color: '#fff', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                          <button onClick={function() { regenerate(a); }} disabled={improving} style={{ background: 'linear-gradient(135deg,#E040FB,#A855F7)', border: 'none', borderRadius: 6, padding: '8px 14px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12, opacity: improving ? 0.5 : 1 }}>{improving ? 'Rewriting…' : '✨ Regenerate Draft'}</button>
                          <button onClick={closeImprove} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', color: colors.muted, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                          {improveErr && <span style={{ color: '#dc2626', fontSize: 11 }}>{improveErr}</span>}
                        </div>
                        <div style={{ color: colors.muted, fontSize: 10, marginTop: 6 }}>Context is saved with the action — it'll be here next time you open this card.</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {a.status === 'pending' && (
                      <>
                        <button onClick={function() { executeAction(a); }} disabled={sending === a.id} style={{ background: style.color + '22', border: '1px solid ' + style.color + '66', borderRadius: 8, padding: '8px 12px', color: style.color, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{sending === a.id ? '...' : '✅ Action It'}</button>
                        {(a.claude_action === 'auto_reply' || a.claude_action === 'review') && (
                          <button onClick={function() { setEditingId(editing ? null : a.id); setEditDraft(a.claude_reply_draft || ''); }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{editing ? 'Cancel Edit' : '✏️ Edit & Send'}</button>
                        )}
                        {(a.claude_action === 'auto_reply' || a.claude_action === 'review') && a.claude_reply_draft && (
                          <button onClick={function() { if (improveOpenFor === a.id) closeImprove(); else openImprove(a); }} style={{ background: 'rgba(224,64,251,0.12)', border: '1px solid rgba(224,64,251,0.4)', borderRadius: 8, padding: '8px 12px', color: '#E040FB', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{improveOpenFor === a.id ? 'Close ✕' : '✨ Improve with context'}</button>
                        )}
                        <div style={{ position: 'relative' }}>
                          <button onClick={function() { setDelayOpenFor(delayOpenFor === a.id ? null : a.id); }} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, padding: '8px 12px', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%' }}>⏱️ Send in…</button>
                          {delayOpenFor === a.id && (
                            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#0f172a', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, padding: 4, zIndex: 50, minWidth: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                              {delayOptions().map(function(opt) {
                                return <button key={opt.id} onClick={function() {
                                  if (opt.ts === '__custom__') {
                                    setCustomPickerFor(a.id);
                                    setCustomValue(defaultCustomValue());
                                  } else {
                                    scheduleAction(a, opt.ts);
                                  }
                                }} style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', padding: '8px 10px', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, textAlign: 'left', borderRadius: 6 }} onMouseEnter={function(e) { e.target.style.background = 'rgba(99,102,241,0.15)'; }} onMouseLeave={function(e) { e.target.style.background = 'transparent'; }}>{opt.label}</button>;
                              })}
                              {customPickerFor === a.id && (
                                <div style={{ borderTop: '1px solid rgba(99,102,241,0.25)', marginTop: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <input type="datetime-local" value={customValue} onChange={function(e) { setCustomValue(e.target.value); }} style={{ background: '#1e293b', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={function() {
                                      if (!customValue) return;
                                      var d = new Date(customValue);
                                      if (isNaN(d.getTime())) { alert('Invalid date/time.'); return; }
                                      if (d.getTime() <= Date.now()) { alert('Pick a future date/time.'); return; }
                                      setCustomPickerFor(null);
                                      scheduleAction(a, d.toISOString());
                                    }} style={{ flex: 1, background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.55)', borderRadius: 6, padding: '6px 10px', color: '#c7d2fe', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Confirm</button>
                                    <button onClick={function() { setCustomPickerFor(null); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <button onClick={function() { markDismissed(a.id); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: colors.muted, cursor: 'pointer', fontSize: 12 }}>👁️ Dismiss</button>
                      </>
                    )}
                    {a.scheduled_at && a.status === 'pending' && (
                      <div style={{ fontSize: 10, color: '#a5b4fc', marginTop: 4, textAlign: 'right', fontStyle: 'italic' }}>⏱️ Scheduled {new Date(a.scheduled_at).toLocaleString()}</div>
                    )}
                    {(a.contact_id || a.lead_id || a.tenant_id) && (
                      <div style={{ fontSize: 10, color: colors.muted, marginTop: 6, textAlign: 'right' }}>
                        {a.contact_id && <div>👤 Contact</div>}
                        {a.lead_id && <div>📈 Lead</div>}
                        {a.tenant_id && <div>🏢 Tenant</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
  }
}
