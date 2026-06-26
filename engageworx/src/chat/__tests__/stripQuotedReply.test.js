// Tests for src/chat/stripQuotedReply — plaintext quote strip + registered-signature trimming.
// Line endings normalize to \n internally, so expected `visible`/`quoted` are asserted in \n
// form even when the input is CRLF. Signature trimming is driven by the per-tenant marker set
// from signatureRegistry (v1: EngageWorx). `sigTrimmed` is a boolean; the full original is
// always recoverable by the caller from the untrimmed input.
var { stripQuotedReply } = require('../stripQuotedReply');
var { signaturesFor, ENGAGEWORX } = require('../signatureRegistry');

var EWX = function() { return signaturesFor(ENGAGEWORX); };

// FIXTURE — outbound "wall" (CRLF): one-line reply, the EngageWorx signature block, then the
// Gmail-quoted original. With the EngageWorx signature set, visible is just the reply.
var DEMO_WALL =
  'When works for a demo?\r\n\r\n\r\n' +
  'Rob Mumby\r\n' +
  'Founder & CEO  |  EngageWorx <https://engwx.com>\r\n' +
  '+1 (786) 982-7800\r\n\r\n\r\n' +
  'On Wed, Jun 10, 2026 at 7:40 AM Rob Mumby <rob@engwx.com> wrote:\r\n\r\n' +
  "> I'm available later today...\r\n";

// FIXTURE — phone-only sig (real prod bytes; quoted tail truncated). Exercises the
// `\+\s?1[\s().\-]*\d` arm of the lookahead (no "Founder & CEO" line, just "+1-305-…") and the
// bare "Best!" sign-off consumption, plus the attribution-first cut.
var MOHAN_PHONE_SIG =
  'Hi Mohan,\r\n\r\n' +
  'Just touching base to see if you have any questions.\r\n\r\n' +
  'Best!\r\n\r\n' +
  'Rob Mumby\r\n' +
  '+1-305-464-6560\r\n\r\n\r\n' +
  'On Wed, Apr 29, 2026 at 3:57 PM Rob Mumby <rob@engwx.com> wrote:\r\n\r\n' +
  '> Hi Mohan,\r\n>\r\n> Great speaking with you today — really enjoyed hearing about Tochenet...\r\n';

// FIXTURE — genuinely clean inbound: no quote marker, no signature → pure no-op.
var CLEAN_INBOUND = 'Hi, if weather looks grim, can we pivot to have the wedding indoors?';

// FIXTURE — body that is ONLY a signature: trimming would empty it → never-lose guard skips.
var SIG_ONLY = 'Rob Mumby\n+1 (786) 982-7800';

describe('stripQuotedReply (registered signatures)', function() {
  test('demo wall → visible is just the reply (quote + EngageWorx sig stripped)', function() {
    var r = stripQuotedReply(DEMO_WALL, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe('When works for a demo?');
    expect(r.sigTrimmed).toBe(true);
    expect(r.quoted).toMatch(/^On Wed, Jun 10, 2026/);
  });

  test('phone-only sig (Mohan) → cut at attribution, sign-off + sig consumed', function() {
    var r = stripQuotedReply(MOHAN_PHONE_SIG, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe('Hi Mohan,\n\nJust touching base to see if you have any questions.');
    expect(r.sigTrimmed).toBe(true);
    expect(r.quoted).toMatch(/^On Wed, Apr 29, 2026 at 3:57 PM/);
  });

  test('clean inbound → visible === body (no-op)', function() {
    var r = stripQuotedReply(CLEAN_INBOUND, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe(CLEAN_INBOUND);
    expect(r.sigTrimmed).toBe(false);
    expect(r.quoted).toBe('');
  });

  test('signature-only body → cut would empty → skipped (never-lose guard)', function() {
    var r = stripQuotedReply(SIG_ONLY, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe(SIG_ONLY);
    expect(r.sigTrimmed).toBe(false);
  });
});

describe('stripQuotedReply (guarantees)', function() {
  test('no signatures passed → quote still cut, no signature trimming', function() {
    var r = stripQuotedReply(DEMO_WALL); // trimSignature/ signatures both absent
    expect(r.visible).toBe(
      'When works for a demo?\n\n\nRob Mumby\nFounder & CEO  |  EngageWorx <https://engwx.com>\n+1 (786) 982-7800'
    );
    expect(r.sigTrimmed).toBe(false);
    expect(r.quoted).toMatch(/^On Wed, Jun 10, 2026/);
  });

  test('generic "-- " delimiter is trimmed for any tenant', function() {
    var body = 'Thanks!\n\n-- \nJane Doe\nAcme Inc';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: signaturesFor(undefined) });
    expect(r.visible).toBe('Thanks!');
    expect(r.sigTrimmed).toBe(true);
  });

  test('leading-whitespace British attribution is cut', function() {
    var body = 'Wednesday at 3pm suits us.\n\n    On Wednesday, 17 June 2026 at 15:02:11 BST, X <x@y.co.uk> wrote:\n\n    old';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe('Wednesday at 3pm suits us.');
    expect(r.quoted).toMatch(/^ {4}On Wednesday, 17 June 2026/);
  });

  test('quote-only body (nothing before marker) → never loses the words', function() {
    var quoteOnly = 'On Tue, Jan 1, 2026 at 8:00 AM A <a@x.com> wrote:\n> hello';
    var r = stripQuotedReply(quoteOnly, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe(quoteOnly);
    expect(r.quoted).toBe('');
  });

  test('empty / null inputs are returned as-is', function() {
    expect(stripQuotedReply('').visible).toBe('');
    expect(stripQuotedReply(null).visible).toBe(null);
    expect(stripQuotedReply(undefined).visible).toBe(undefined);
  });
});
