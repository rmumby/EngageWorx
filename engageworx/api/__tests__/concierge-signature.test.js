/**
 * Concierge email signature tests.
 * Verifies the email-inbound-concierge flow uses _email-signature.js
 * to resolve and append the tenant's configured email signature.
 */

var { getSignature, composeHtmlBody, composeTextBody, isTeamAddress } = require('../_email-signature');

// ─── getSignature behavior for concierge (team address, reply) ───────────────

describe('getSignature for concierge emails', function() {
  // Mock supabase that returns configured signature fields
  function mockSupabase(chatbotConfig, tenantRow) {
    return {
      from: function(table) {
        var chain = {
          select: function() { return chain; },
          eq: function() { return chain; },
          limit: function() { return chain; },
          maybeSingle: function() {
            if (table === 'chatbot_configs') return Promise.resolve({ data: chatbotConfig, error: null });
            if (table === 'tenants') return Promise.resolve({ data: tenantRow, error: null });
            return Promise.resolve({ data: null, error: null });
          },
        };
        return chain;
      },
    };
  }

  test('reply email uses email_team_signature_reply', async function() {
    var sb = mockSupabase(
      { email_team_from_name: 'Delamere Manor — Concierge', email_team_signature_reply: '<p>Delamere Manor | Knutsford, Cheshire</p>' },
      { name: 'Delamere Manor', brand_name: 'Delamere Manor' }
    );
    var result = await getSignature(sb, { tenantId: 'dm-tenant', fromEmail: 'hello@delameremanor.co.uk', isFirstTouch: false, closingKind: 'reply' });
    expect(result.signatureHtml).toBe('<p>Delamere Manor | Knutsford, Cheshire</p>');
    expect(result.fromName).toBe('Delamere Manor — Concierge');
  });

  test('first-touch email uses email_team_signature_first', async function() {
    var sb = mockSupabase(
      { email_team_from_name: 'Delamere Concierge', email_team_signature_first: '<p>Welcome! Delamere Manor</p>', email_team_signature_reply: '<p>Reply sig</p>' },
      { name: 'Delamere Manor' }
    );
    var result = await getSignature(sb, { tenantId: 'dm-tenant', fromEmail: 'hello@delameremanor.co.uk', isFirstTouch: true, closingKind: 'first' });
    expect(result.signatureHtml).toBe('<p>Welcome! Delamere Manor</p>');
  });

  test('fromName uses email_team_from_name when set', async function() {
    var sb = mockSupabase(
      { email_team_from_name: 'My Custom Team Name' },
      { name: 'Tenant Corp', brand_name: 'Tenant Corp' }
    );
    var result = await getSignature(sb, { tenantId: 'x', fromEmail: 'hello@tenant.com', isFirstTouch: false, closingKind: 'reply' });
    expect(result.fromName).toBe('My Custom Team Name');
  });

  test('fromName falls back to brand_name + Team when email_team_from_name is empty', async function() {
    var sb = mockSupabase(
      { email_team_from_name: '' },
      { name: 'Acme', brand_name: 'Acme Engage' }
    );
    var result = await getSignature(sb, { tenantId: 'x', fromEmail: 'hello@acme.com', isFirstTouch: false, closingKind: 'reply' });
    expect(result.fromName).toBe('Acme Engage Team');
  });

  test('concierge address is classified as team address', function() {
    expect(isTeamAddress('weddings@delameremanor.co.uk')).toBe(true);
    expect(isTeamAddress('weddings@anydomain.com')).toBe(true);
    expect(isTeamAddress('hello@delameremanor.co.uk')).toBe(true);
    expect(isTeamAddress('support@tenant.com')).toBe(true);
  });
});

// ─── composeHtmlBody behavior ────────────────────────────────────────────────

describe('composeHtmlBody for concierge', function() {
  test('appends closing line and signature below body', function() {
    var body = '<p>Hi Sarah, your suppliers arrive at 8:30am.</p>';
    var closing = 'Best,';
    var sig = '<p><strong>Delamere Manor</strong> | Knutsford</p>';
    var result = composeHtmlBody(body, closing, sig);
    expect(result).toContain(body);
    expect(result).toContain('Best,');
    expect(result).toContain(sig);
    // Order: body first, then closing, then signature
    var bodyIdx = result.indexOf(body);
    var closingIdx = result.indexOf('Best,');
    var sigIdx = result.indexOf(sig);
    expect(bodyIdx).toBeLessThan(closingIdx);
    expect(closingIdx).toBeLessThan(sigIdx);
  });

  test('handles empty signature gracefully (no empty div)', function() {
    var body = '<p>Content here</p>';
    var result = composeHtmlBody(body, 'Best,', '');
    expect(result).toContain(body);
    expect(result).toContain('Best,');
    // Empty signature should not add anything extra
    expect(result).not.toContain('<p></p>');
  });

  test('handles empty closing line gracefully', function() {
    var body = '<p>Content</p>';
    var sig = '<p>Signature</p>';
    var result = composeHtmlBody(body, '', sig);
    expect(result).toContain(body);
    expect(result).toContain(sig);
  });

  test('handles both empty (body only)', function() {
    var body = '<p>Just body</p>';
    var result = composeHtmlBody(body, '', '');
    expect(result).toBe(body);
  });
});

// ─── composeTextBody behavior ────────────────────────────────────────────────

describe('composeTextBody for concierge', function() {
  test('appends closing and fromName to plain text', function() {
    var result = composeTextBody('Hi Sarah, suppliers at 8:30am.', 'Best,', 'Delamere Manor');
    expect(result).toContain('Hi Sarah');
    expect(result).toContain('Best,');
    expect(result).toContain('— Delamere Manor');
  });

  test('handles empty fromName', function() {
    var result = composeTextBody('Body text', 'Cheers,', '');
    expect(result).toContain('Body text');
    expect(result).toContain('Cheers,');
    expect(result).not.toContain('—');
  });
});
