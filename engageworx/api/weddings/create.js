// api/weddings/create.js — Create event (wedding/corporate/party/other)
// POST /api/weddings/create
// Auth: superadmin OR active tenant member

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var body = req.body || {};

  // Auth
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' });

  var tenantId = body.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
  if (!body.display_name) return res.status(400).json({ error: 'display_name required' });
  if (!body.event_date) return res.status(400).json({ error: 'event_date required' });

  // Verify caller access
  var { data: callerProfile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSA = callerProfile && (callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin' || callerProfile.role === 'sp_admin');
  if (!isSA) {
    var { data: mem } = await supabase.from('tenant_members').select('id').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!mem) return res.status(403).json({ error: 'Not authorized for this tenant' });
  }

  // Primary contact is required — either existing ID or inline create fields
  var hasPrimaryContact = body.primary_contact_id || body.primary_first_name;
  if (!hasPrimaryContact) {
    console.warn('[weddings/create] Rejected: no primary contact provided. tenant:', tenantId, 'display_name:', body.display_name);
    return res.status(400).json({ error: 'Primary contact is required. Select an existing contact or fill in the name fields.' });
  }

  try {
    var eventType = body.event_type || 'wedding';

    // (a) Create/find primary contact
    var primaryContactId = body.primary_contact_id || null;
    var partnerContactId = body.partner_contact_id || null;

    // If creating a new primary contact inline
    if (!primaryContactId && body.primary_first_name) {
      var { data: pc, error: pcErr } = await supabase.from('contacts').insert({
        tenant_id: tenantId,
        first_name: body.primary_first_name,
        last_name: body.primary_last_name || '',
        email: body.primary_email || null,
        status: 'active',
        source: 'event_admin',
        is_wedding_couple: eventType === 'wedding',
      }).select('id').single();
      if (pcErr) throw new Error('Primary contact create failed: ' + pcErr.message);
      primaryContactId = pc.id;
    }

    // If creating a new partner/co-host contact inline
    if (!partnerContactId && body.partner_first_name) {
      var { data: ptc, error: ptcErr } = await supabase.from('contacts').insert({
        tenant_id: tenantId,
        first_name: body.partner_first_name,
        last_name: body.partner_last_name || '',
        email: body.partner_email || null,
        status: 'active',
        source: 'event_admin',
        is_wedding_couple: eventType === 'wedding',
      }).select('id').single();
      if (ptcErr) throw new Error('Partner contact create failed: ' + ptcErr.message);
      partnerContactId = ptc.id;
    }

    // (b) Create wedding/event row
    var { data: event, error: eventErr } = await supabase.from('weddings').insert({
      tenant_id: tenantId,
      display_name: body.display_name,
      wedding_date: body.event_date,
      status: body.status || 'planning',
      event_type: eventType,
      primary_contact_id: primaryContactId,
      partner_contact_id: partnerContactId,
      meta: body.meta || {},
    }).select('id').single();
    if (eventErr) throw new Error('Event create failed: ' + eventErr.message);

    // (c) Create empty wedding_plans row (used for all event types)
    var { error: planErr } = await supabase.from('wedding_plans').insert({
      wedding_id: event.id,
      tenant_id: tenantId,
      ceremony: {},
      evening: {},
      guests: body.guest_count ? { day: body.guest_count_day || 0, evening: body.guest_count_evening || 0 } : {},
    });
    if (planErr) console.warn('[weddings/create] wedding_plans insert error (non-fatal):', planErr.message);

    // (d) Update contacts with wedding_id
    if (primaryContactId) {
      await supabase.from('contacts').update({
        wedding_id: event.id,
        is_wedding_couple: eventType === 'wedding',
      }).eq('id', primaryContactId);
    }
    if (partnerContactId) {
      await supabase.from('contacts').update({
        wedding_id: event.id,
        is_wedding_couple: eventType === 'wedding',
      }).eq('id', partnerContactId);
    }

    console.log('[weddings/create] Event created:', { id: event.id, type: eventType, tenant: tenantId, display_name: body.display_name });

    return res.status(200).json({
      success: true,
      event_id: event.id,
      primary_contact_id: primaryContactId,
      partner_contact_id: partnerContactId,
    });
  } catch (err) {
    console.error('[weddings/create] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
