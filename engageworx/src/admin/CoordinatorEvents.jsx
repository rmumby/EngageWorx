import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

var EVENT_TYPES = [
  { id: 'wedding', label: 'Wedding' },
  { id: 'corporate', label: 'Corporate Event' },
  { id: 'party', label: 'Private Party' },
  { id: 'other', label: 'Other' },
];

var STATUS_OPTIONS = [
  { id: 'planning', label: 'Planning' },
  { id: 'locked', label: 'Confirmed' },
  { id: 'day_of', label: 'Day Of' },
  { id: 'complete', label: 'Complete' },
  { id: 'cancelled', label: 'Cancelled' },
];

var STATUS_COLORS = {
  planning: { bg: '#3b82f620', color: '#3b82f6' },
  locked: { bg: '#10b98120', color: '#10b981' },
  day_of: { bg: '#f59e0b20', color: '#f59e0b' },
  complete: { bg: '#6b728020', color: '#6b7280' },
  cancelled: { bg: '#ef444420', color: '#ef4444' },
  archived: { bg: '#9ca3af20', color: '#9ca3af' },
};

export default function CoordinatorEvents({ tenantId, C }) {
  var colors = C || { bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8', primary: '#6366f1' };
  var [events, setEvents] = useState([]);
  var [loading, setLoading] = useState(true);
  var [showCreate, setShowCreate] = useState(false);
  var [contacts, setContacts] = useState([]);
  var [filter, setFilter] = useState('active'); // active | archived | all
  var [search, setSearch] = useState('');

  var loadEvents = useCallback(async function() {
    if (!tenantId) return;
    var { data } = await supabase
      .from('weddings')
      .select('*, primary_contact:primary_contact_id(id, first_name, last_name, email), partner_contact:partner_contact_id(id, first_name, last_name, email)')
      .eq('tenant_id', tenantId)
      .order('wedding_date', { ascending: true });
    setEvents(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(function() { loadEvents(); }, [loadEvents]);

  var filtered = events.filter(function(e) {
    if (filter === 'active' && (e.status === 'archived' || e.status === 'cancelled')) return false;
    if (filter === 'archived' && e.status !== 'archived') return false;
    if (search) {
      var q = search.toLowerCase();
      return (e.display_name || '').toLowerCase().includes(q) ||
        (e.primary_contact && (e.primary_contact.first_name + ' ' + e.primary_contact.last_name).toLowerCase().includes(q)) ||
        (e.primary_contact && e.primary_contact.email && e.primary_contact.email.toLowerCase().includes(q));
    }
    return true;
  });

  async function handleArchive(event) {
    var action = event.status === 'archived' ? 'restore' : 'archive';
    if (!window.confirm(action === 'archive' ? 'Archive "' + event.display_name + '"? This hides it from the active list.' : 'Restore "' + event.display_name + '" to active?')) return;
    var session = await supabase.auth.getSession();
    var token = session.data?.session?.access_token;
    var archiveResp = await fetch('/api/weddings/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ event_id: event.id }),
    });
    if (archiveResp.ok) {
      // Optimistic update while background refresh catches up
      setEvents(function(prev) { return prev.map(function(e) { return e.id === event.id ? Object.assign({}, e, { status: action === 'archive' ? 'archived' : 'planning' }) : e; }); });
    }
    setTimeout(loadEvents, 300);
  }

  var card = { background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 12, padding: 20 };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + colors.primary + ', ' + (colors.accent || colors.primary) + ')', color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: colors.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: colors.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Events</h2>
          <p style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Manage weddings, parties, corporate events and other bookings.</p>
        </div>
        <button onClick={function() { setShowCreate(true); loadContacts(); }} style={btnPrimary}>+ New Event</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Search events..." style={Object.assign({}, inputStyle, { width: 280 })} />
        {['active', 'archived', 'all'].map(function(f) {
          return <button key={f} onClick={function() { setFilter(f); }} style={{ background: filter === f ? colors.primary + '22' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (filter === f ? colors.primary + '55' : 'rgba(255,255,255,0.08)'), borderRadius: 8, padding: '7px 14px', color: filter === f ? colors.primary : colors.muted, fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{f}</button>;
        })}
        <div style={{ marginLeft: 'auto', color: colors.muted, fontSize: 12 }}>{filtered.length} event{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Event list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.muted }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ color: colors.text, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No events yet</div>
          <div style={{ color: colors.muted, fontSize: 13 }}>Click "+ New Event" to create your first event.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(function(ev) {
            var st = STATUS_COLORS[ev.status] || STATUS_COLORS.planning;
            var evType = EVENT_TYPES.find(function(t) { return t.id === ev.event_type; });
            var dateStr = ev.wedding_date ? new Date(ev.wedding_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            var primaryName = ev.primary_contact ? (ev.primary_contact.first_name + ' ' + ev.primary_contact.last_name).trim() : '—';
            var partnerName = ev.partner_contact ? (ev.partner_contact.first_name + ' ' + ev.partner_contact.last_name).trim() : null;

            return (
              <div key={ev.id} style={Object.assign({}, card, { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px' })}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: (evType && evType.id === 'wedding' ? '#ec4899' : colors.primary) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {ev.event_type === 'wedding' ? '💒' : ev.event_type === 'corporate' ? '🏢' : ev.event_type === 'party' ? '🎉' : '📅'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: colors.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.display_name}</div>
                  <div style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                    {dateStr} · {primaryName}{partnerName ? ' & ' + partnerName : ''} · {evType ? evType.label : ev.event_type}
                  </div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color, flexShrink: 0 }}>{ev.status}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={function() { handleArchive(ev); }} style={{ background: 'transparent', border: '1px solid ' + colors.border, borderRadius: 6, padding: '5px 10px', color: colors.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {ev.status === 'archived' ? 'Restore' : 'Archive'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Event Modal */}
      {showCreate && <CreateEventModal colors={colors} tenantId={tenantId} contacts={contacts} inputStyle={inputStyle} onClose={function() { setShowCreate(false); setTimeout(loadEvents, 300); }} />}
    </div>
  );

  async function loadContacts() {
    if (contacts.length > 0) return;
    var { data } = await supabase.from('contacts')
      .select('id, first_name, last_name, email')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('first_name');
    setContacts(data || []);
  }
}

function CreateEventModal({ colors, tenantId, contacts, inputStyle, onClose }) {
  var [form, setForm] = useState({
    event_type: 'wedding',
    display_name: '',
    event_date: '',
    status: 'planning',
    primary_contact_id: '',
    primary_first_name: '',
    primary_last_name: '',
    primary_email: '',
    partner_contact_id: '',
    partner_first_name: '',
    partner_last_name: '',
    partner_email: '',
    guest_count_day: '',
    guest_count_evening: '',
  });
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState('');
  var [contactSearch, setContactSearch] = useState('');
  var [partnerSearch, setPartnerSearch] = useState('');
  var [primaryMode, setPrimaryMode] = useState('search'); // search | new
  var [partnerMode, setPartnerMode] = useState('search');

  function update(key, val) { setForm(function(prev) { var u = {}; u[key] = val; return Object.assign({}, prev, u); }); }

  var isWedding = form.event_type === 'wedding';

  var filteredContacts = contacts.filter(function(c) {
    if (!contactSearch) return true;
    var q = contactSearch.toLowerCase();
    return (c.first_name + ' ' + c.last_name + ' ' + (c.email || '')).toLowerCase().includes(q);
  }).slice(0, 8);

  var filteredPartners = contacts.filter(function(c) {
    if (!partnerSearch) return true;
    var q = partnerSearch.toLowerCase();
    return (c.first_name + ' ' + c.last_name + ' ' + (c.email || '')).toLowerCase().includes(q);
  }).slice(0, 8);

  function autoDisplayName() {
    var p1 = form.primary_first_name || '';
    var p2 = form.partner_first_name || '';
    if (p1 && p2) return p1 + ' & ' + p2;
    if (p1) return p1;
    return '';
  }

  var hasPrimaryContact = form.primary_contact_id || form.primary_first_name.trim();

  async function handleSave() {
    if (!hasPrimaryContact) { setError('Primary contact is required. Select an existing contact or click "+ New" to create one.'); return; }
    if (!form.display_name && !autoDisplayName()) { setError('Display name is required'); return; }
    if (!form.event_date) { setError('Event date is required'); return; }
    setError('');
    setSaving(true);

    try {
      var session = await supabase.auth.getSession();
      var token = session.data?.session?.access_token || '';

      var payload = {
        tenant_id: tenantId,
        event_type: form.event_type,
        display_name: form.display_name || autoDisplayName(),
        event_date: form.event_date,
        status: form.status,
        guest_count_day: parseInt(form.guest_count_day) || 0,
        guest_count_evening: parseInt(form.guest_count_evening) || 0,
      };

      if (form.primary_contact_id) {
        payload.primary_contact_id = form.primary_contact_id;
      } else if (form.primary_first_name) {
        payload.primary_first_name = form.primary_first_name;
        payload.primary_last_name = form.primary_last_name;
        payload.primary_email = form.primary_email;
      }

      if (form.partner_contact_id) {
        payload.partner_contact_id = form.partner_contact_id;
      } else if (form.partner_first_name) {
        payload.partner_first_name = form.partner_first_name;
        payload.partner_last_name = form.partner_last_name;
        payload.partner_email = form.partner_email;
      }

      var resp = await fetch('/api/weddings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Create failed');

      onClose();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  var labelStyle = { color: colors.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };
  var btnSec = { background: 'transparent', border: '1px solid ' + colors.border, borderRadius: 6, padding: '5px 10px', color: colors.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 16, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
        <h2 style={{ color: colors.text, margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Create Event</h2>

        {/* Event Type */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Event Type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {EVENT_TYPES.map(function(t) {
              var active = form.event_type === t.id;
              return <button key={t.id} onClick={function() { update('event_type', t.id); }} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: active ? colors.primary + '20' : 'transparent', color: active ? colors.primary : colors.muted, border: '1px solid ' + (active ? colors.primary + '55' : colors.border) }}>{t.label}</button>;
            })}
          </div>
        </div>

        {/* Display Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Hosts / Display Name *</label>
          <input value={form.display_name} onChange={function(e) { update('display_name', e.target.value); }} placeholder={isWedding ? 'e.g. Sarah & James' : 'e.g. Acme Corp Annual Gala'} style={inputStyle} />
          {!form.display_name && autoDisplayName() && <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Auto: "{autoDisplayName()}"</div>}
        </div>

        {/* Event Date + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Event Date *</label>
            <input type="date" value={form.event_date} onChange={function(e) { update('event_date', e.target.value); }} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={function(e) { update('status', e.target.value); }} style={inputStyle}>
              {STATUS_OPTIONS.filter(function(s) { return s.id !== 'day_of' && s.id !== 'complete'; }).map(function(s) {
                return <option key={s.id} value={s.id}>{s.label}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Primary Contact */}
        <div style={{ marginBottom: 16, padding: 14, background: 'rgba(0,0,0,0.15)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={Object.assign({}, labelStyle, { margin: 0, color: !hasPrimaryContact ? '#ef4444' : colors.muted })}>Primary Contact *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={function() { setPrimaryMode('search'); }} style={Object.assign({}, btnSec, primaryMode === 'search' ? { color: colors.primary, borderColor: colors.primary + '55' } : {})}>Search</button>
              <button onClick={function() { setPrimaryMode('new'); }} style={Object.assign({}, btnSec, primaryMode === 'new' ? { color: colors.primary, borderColor: colors.primary + '55' } : {})}>+ New</button>
            </div>
          </div>
          {primaryMode === 'search' ? (
            <div>
              <input value={contactSearch} onChange={function(e) { setContactSearch(e.target.value); update('primary_contact_id', ''); }} placeholder="Search contacts..." style={inputStyle} />
              {contactSearch && filteredContacts.length > 0 && (
                <div style={{ marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                  {filteredContacts.map(function(c) {
                    var selected = form.primary_contact_id === c.id;
                    return <div key={c.id} onClick={function() { update('primary_contact_id', c.id); update('primary_first_name', c.first_name); update('primary_last_name', c.last_name); update('primary_email', c.email || ''); setContactSearch(c.first_name + ' ' + c.last_name); }} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: selected ? colors.primary + '15' : 'transparent', color: selected ? colors.primary : colors.text, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</span>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{c.email || ''}</span>
                    </div>;
                  })}
                </div>
              )}
              {form.primary_contact_id && <div style={{ color: '#10b981', fontSize: 11, marginTop: 4 }}>Selected: {form.primary_first_name} {form.primary_last_name}</div>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={labelStyle}>First Name</label><input value={form.primary_first_name} onChange={function(e) { update('primary_first_name', e.target.value); }} style={inputStyle} /></div>
              <div><label style={labelStyle}>Last Name</label><input value={form.primary_last_name} onChange={function(e) { update('primary_last_name', e.target.value); }} style={inputStyle} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Email</label><input value={form.primary_email} onChange={function(e) { update('primary_email', e.target.value); }} placeholder="email@example.com" style={inputStyle} /></div>
            </div>
          )}
        </div>

        {/* Partner / Co-Host Contact */}
        <div style={{ marginBottom: 16, padding: 14, background: 'rgba(0,0,0,0.15)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={Object.assign({}, labelStyle, { margin: 0 })}>{isWedding ? 'Partner Contact' : 'Co-Host (optional)'}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={function() { setPartnerMode('search'); }} style={Object.assign({}, btnSec, partnerMode === 'search' ? { color: colors.primary, borderColor: colors.primary + '55' } : {})}>Search</button>
              <button onClick={function() { setPartnerMode('new'); }} style={Object.assign({}, btnSec, partnerMode === 'new' ? { color: colors.primary, borderColor: colors.primary + '55' } : {})}>+ New</button>
            </div>
          </div>
          {partnerMode === 'search' ? (
            <div>
              <input value={partnerSearch} onChange={function(e) { setPartnerSearch(e.target.value); update('partner_contact_id', ''); }} placeholder="Search contacts..." style={inputStyle} />
              {partnerSearch && filteredPartners.length > 0 && (
                <div style={{ marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                  {filteredPartners.map(function(c) {
                    var selected = form.partner_contact_id === c.id;
                    return <div key={c.id} onClick={function() { update('partner_contact_id', c.id); update('partner_first_name', c.first_name); update('partner_last_name', c.last_name); update('partner_email', c.email || ''); setPartnerSearch(c.first_name + ' ' + c.last_name); }} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: selected ? colors.primary + '15' : 'transparent', color: selected ? colors.primary : colors.text, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</span>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{c.email || ''}</span>
                    </div>;
                  })}
                </div>
              )}
              {form.partner_contact_id && <div style={{ color: '#10b981', fontSize: 11, marginTop: 4 }}>Selected: {form.partner_first_name} {form.partner_last_name}</div>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={labelStyle}>First Name</label><input value={form.partner_first_name} onChange={function(e) { update('partner_first_name', e.target.value); }} style={inputStyle} /></div>
              <div><label style={labelStyle}>Last Name</label><input value={form.partner_last_name} onChange={function(e) { update('partner_last_name', e.target.value); }} style={inputStyle} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Email</label><input value={form.partner_email} onChange={function(e) { update('partner_email', e.target.value); }} placeholder="email@example.com" style={inputStyle} /></div>
            </div>
          )}
        </div>

        {/* Wedding-specific fields */}
        {isWedding && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Expected Guests (Day)</label>
              <input type="number" value={form.guest_count_day} onChange={function(e) { update('guest_count_day', e.target.value); }} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Expected Guests (Evening)</label>
              <input type="number" value={form.guest_count_evening} onChange={function(e) { update('guest_count_evening', e.target.value); }} placeholder="0" style={inputStyle} />
            </div>
          </div>
        )}

        {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: '#ef444410', borderRadius: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', color: colors.muted, border: '1px solid ' + colors.border, borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !hasPrimaryContact} style={{ background: (hasPrimaryContact && !saving) ? 'linear-gradient(135deg, ' + colors.primary + ', ' + (colors.accent || colors.primary) + ')' : 'rgba(255,255,255,0.06)', color: (hasPrimaryContact && !saving) ? '#000' : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: hasPrimaryContact ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Creating...' : 'Create Event'}</button>
        </div>
      </div>
    </div>
  );
}
