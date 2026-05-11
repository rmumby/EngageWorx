import React, { useState } from 'react';
import { VERTICALS, ENTITY_TYPES } from '../../../tcrTemplates';

var inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' };
var selectStyle = Object.assign({}, inputStyle, { appearance: 'auto', colorScheme: 'dark' });
var labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 6, fontWeight: 700 };

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#EC4899', marginLeft: 3 }}>*</span>}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function StepBrand({ brand, onUpdate, onNext, C }) {
  var [errors, setErrors] = useState({});

  function set(field, value) {
    var patch = {};
    patch[field] = value;
    onUpdate(Object.assign({}, brand, patch));
  }

  function validate() {
    var e = {};
    if (!brand.displayName || brand.displayName.trim().length < 2) e.displayName = true;
    if (!brand.ein) e.ein = true;
    if (!brand.vertical) e.vertical = true;
    if (!brand.entityType) e.entityType = true;
    if (!brand.street) e.street = true;
    if (!brand.city) e.city = true;
    if (!brand.state) e.state = true;
    if (!brand.postalCode) e.postalCode = true;
    if (!brand.phone) e.phone = true;
    if (!brand.email) e.email = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  var [showErrors, setShowErrors] = useState(false);

  function handleNext() {
    if (validate()) { setShowErrors(false); onNext(); }
    else {
      setShowErrors(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 };
  var errBorder = function(field) { return errors[field] ? { borderColor: '#EC4899' } : {}; };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Brand Details</h2>
          <div style={{ color: C.muted, fontSize: 13 }}>Your business identity for carrier registration</div>
        </div>
        {/* AI assist removed from Step 1 per Phase 4.5 R5 — form-based input only */}
      </div>
      {showErrors && Object.keys(errors).length > 0 && (
        <div style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, color: '#EC4899', fontSize: 13, lineHeight: 1.5 }}>
          Please fill all required fields to continue: {Object.keys(errors).map(function(k) { return k.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); }); }).join(', ')}.
        </div>
      )}
      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginBottom: 16 }}>All fields marked * are required to continue.</div>

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Field label="Display Name" required hint="Your customer-facing brand name — must match what appears on your website and opt-in page">
            <input style={Object.assign({}, inputStyle, errBorder('displayName'))} value={brand.displayName || ''} onChange={function(e) { set('displayName', e.target.value); }} placeholder="e.g. Acme Health Services" />
          </Field>
          <Field label="Company Name"><input style={inputStyle} value={brand.companyName || ''} onChange={function(e) { set('companyName', e.target.value); }} placeholder="Legal entity name (if different)" /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Field label="EIN" required hint="XX-XXXXXXX"><input style={Object.assign({}, inputStyle, errBorder('ein'))} value={brand.ein || ''} onChange={function(e) { set('ein', e.target.value); }} placeholder="12-3456789" /></Field>
          <Field label="Entity Type" required><select style={Object.assign({}, selectStyle, errBorder('entityType'))} value={brand.entityType || ''} onChange={function(e) { set('entityType', e.target.value); }}><option value="">Select...</option>{ENTITY_TYPES.map(function(t) { return <option key={t.value} value={t.value}>{t.label}</option>; })}</select></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Field label="Vertical" required><select style={Object.assign({}, selectStyle, errBorder('vertical'))} value={brand.vertical || ''} onChange={function(e) { set('vertical', e.target.value); }}><option value="">Select...</option>{VERTICALS.map(function(v) { return <option key={v} value={v}>{v}</option>; })}</select></Field>
          <Field label="Website"><input style={inputStyle} value={brand.website || ''} onChange={function(e) { set('website', e.target.value); }} placeholder="https://..." /></Field>
        </div>
      </div>
      <div style={card}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Business Address</div>
        <Field label="Street" required><input style={Object.assign({}, inputStyle, errBorder('street'))} value={brand.street || ''} onChange={function(e) { set('street', e.target.value); }} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 16px' }}>
          <Field label="City" required><input style={Object.assign({}, inputStyle, errBorder('city'))} value={brand.city || ''} onChange={function(e) { set('city', e.target.value); }} /></Field>
          <Field label="State" required><input style={Object.assign({}, inputStyle, errBorder('state'))} value={brand.state || ''} onChange={function(e) { set('state', e.target.value); }} maxLength={2} placeholder="FL" /></Field>
          <Field label="ZIP" required><input style={Object.assign({}, inputStyle, errBorder('postalCode'))} value={brand.postalCode || ''} onChange={function(e) { set('postalCode', e.target.value); }} /></Field>
        </div>
      </div>
      <div style={card}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Contact</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Field label="Business Phone" required>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Backlog: PHONE-INPUT-CONSOLIDATE to merge with Settings.js country codes. Sorted alphabetically. */}
              <select style={Object.assign({}, selectStyle, { width: 130, flex: 'none' })} value={brand.phoneCountry || '+1'} onChange={function(e) { set('phoneCountry', e.target.value); }}>
                <option value="+54">🇦🇷 Argentina +54</option><option value="+61">🇦🇺 Australia +61</option><option value="+43">🇦🇹 Austria +43</option>
                <option value="+32">🇧🇪 Belgium +32</option><option value="+55">🇧🇷 Brazil +55</option><option value="+1-CA">🇨🇦 Canada +1</option>
                <option value="+56">🇨🇱 Chile +56</option><option value="+86">🇨🇳 China +86</option><option value="+57">🇨🇴 Colombia +57</option>
                <option value="+420">🇨🇿 Czechia +420</option><option value="+45">🇩🇰 Denmark +45</option><option value="+20">🇪🇬 Egypt +20</option>
                <option value="+358">🇫🇮 Finland +358</option><option value="+33">🇫🇷 France +33</option><option value="+49">🇩🇪 Germany +49</option>
                <option value="+30">🇬🇷 Greece +30</option><option value="+504">🇭🇳 Honduras +504</option><option value="+852">🇭🇰 Hong Kong +852</option>
                <option value="+36">🇭🇺 Hungary +36</option><option value="+91">🇮🇳 India +91</option><option value="+62">🇮🇩 Indonesia +62</option>
                <option value="+353">🇮🇪 Ireland +353</option><option value="+972">🇮🇱 Israel +972</option><option value="+39">🇮🇹 Italy +39</option>
                <option value="+81">🇯🇵 Japan +81</option><option value="+254">🇰🇪 Kenya +254</option><option value="+60">🇲🇾 Malaysia +60</option>
                <option value="+52">🇲🇽 Mexico +52</option><option value="+212">🇲🇦 Morocco +212</option><option value="+31">🇳🇱 Netherlands +31</option>
                <option value="+64">🇳🇿 New Zealand +64</option><option value="+234">🇳🇬 Nigeria +234</option><option value="+47">🇳🇴 Norway +47</option>
                <option value="+51">🇵🇪 Peru +51</option><option value="+63">🇵🇭 Philippines +63</option><option value="+48">🇵🇱 Poland +48</option>
                <option value="+351">🇵🇹 Portugal +351</option><option value="+40">🇷🇴 Romania +40</option><option value="+7">🇷🇺 Russia +7</option>
                <option value="+966">🇸🇦 Saudi Arabia +966</option><option value="+65">🇸🇬 Singapore +65</option><option value="+252">🇸🇴 Somalia +252</option>
                <option value="+27">🇿🇦 South Africa +27</option><option value="+82">🇰🇷 South Korea +82</option><option value="+34">🇪🇸 Spain +34</option>
                <option value="+46">🇸🇪 Sweden +46</option><option value="+41">🇨🇭 Switzerland +41</option><option value="+66">🇹🇭 Thailand +66</option>
                <option value="+90">🇹🇷 Turkey +90</option><option value="+971">🇦🇪 UAE +971</option><option value="+380">🇺🇦 Ukraine +380</option>
                <option value="+44">🇬🇧 United Kingdom +44</option><option value="+1">🇺🇸 United States +1</option><option value="+58">🇻🇪 Venezuela +58</option>
                <option value="+84">🇻🇳 Vietnam +84</option>
              </select>
              <input style={Object.assign({}, inputStyle, { flex: 1 }, errBorder('phone'))} value={brand.phone || ''} onChange={function(e) { set('phone', e.target.value); }} placeholder="7869827800" />
            </div>
          </Field>
          <Field label="Business Email" required><input style={Object.assign({}, inputStyle, errBorder('email'))} type="email" value={brand.email || ''} onChange={function(e) { set('email', e.target.value); }} /></Field>
        </div>
        {brand.entityType === 'PUBLIC_PROFIT' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Field label="Stock Symbol" required hint="Verified by carrier during brand vetting"><input style={inputStyle} value={brand.stockSymbol || ''} onChange={function(e) { set('stockSymbol', e.target.value); }} placeholder="e.g. AAPL" /></Field>
          <Field label="Stock Exchange" required><input style={inputStyle} value={brand.stockExchange || ''} onChange={function(e) { set('stockExchange', e.target.value); }} placeholder="e.g. NASDAQ" /></Field>
        </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleNext} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Continue →</button>
      </div>
    </div>
  );
}
