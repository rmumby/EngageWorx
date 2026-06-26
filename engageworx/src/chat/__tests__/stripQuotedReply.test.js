// Tests for src/chat/stripQuotedReply — plaintext quoted-reply + signature trimming.
// The two prod-shaped fixtures encode the behaviour the LiveInboxV2 email render path
// relies on. (Fixtures reconstructed from the described prod cases; swap in exact bytes
// if captured.)
var { stripQuotedReply } = require('../stripQuotedReply');

// FIXTURE 1 — outbound "wall": a one-line reply, a standard "-- " signature, then the
// Gmail-quoted original the recipient's client appended. The whole thing is stored as the
// message body; the visible reply should be just the one line.
var OUTBOUND_WALL = [
  'When works for a demo?',
  '',
  '-- ',
  'Rob Mumby',
  'EngageWorx',
  '',
  'On Mon, Jun 23, 2026 at 9:14 AM Jane Doe <jane@acme.com> wrote:',
  '> Thanks so much for reaching out about the platform.',
  '> We\'d love to learn more about how it could help our team.',
  '>',
  '> Best,',
  '> Jane',
].join('\n');

// FIXTURE 2 — Delamere inbound that arrived already trimmed (no quote marker, no signature
// delimiter). Stripping must be a pure no-op: visible === body.
var DELAMERE_INBOUND_TRIMMED =
  'Hi there, yes — 2pm on Thursday works perfectly for the venue tour. ' +
  'We are really looking forward to seeing Delamere Manor in person. See you then!';

describe('stripQuotedReply', function() {
  describe('prod fixtures', function() {
    test('outbound "When works for a demo?" wall → visible is just the reply', function() {
      var r = stripQuotedReply(OUTBOUND_WALL, { trimSignature: true });
      expect(r.visible).toBe('When works for a demo?');
      expect(r.quoted).toMatch(/^On Mon, Jun 23, 2026/);   // quoted original preserved for the expander
      expect(r.sigTrimmed).toMatch(/^-- /);                // signature captured, not lost
    });

    test('Delamere already-trimmed inbound → visible === body (no-op)', function() {
      var r = stripQuotedReply(DELAMERE_INBOUND_TRIMMED, { trimSignature: true });
      expect(r.visible).toBe(DELAMERE_INBOUND_TRIMMED);
      expect(r.quoted).toBe('');
      expect(r.sigTrimmed).toBe('');
    });
  });

  describe('guarantees', function() {
    test('no quote marker → untouched, no trimming', function() {
      var r = stripQuotedReply('Just a fresh note, no quotes here.', { trimSignature: true });
      expect(r.visible).toBe('Just a fresh note, no quotes here.');
      expect(r.quoted).toBe('');
    });

    test('quote-only body (nothing before the marker) → never loses the words', function() {
      var quoteOnly = 'On Tue, Jan 1, 2026 at 8:00 AM A <a@x.com> wrote:\n> hello';
      var r = stripQuotedReply(quoteOnly, { trimSignature: true });
      expect(r.visible).toBe(quoteOnly); // cut skipped — visible would otherwise be empty
      expect(r.quoted).toBe('');
    });

    test('trimSignature defaults off → signature stays in visible, quote still cut', function() {
      var r = stripQuotedReply(OUTBOUND_WALL);
      expect(r.visible).toBe('When works for a demo?\n\n-- \nRob Mumby\nEngageWorx');
      expect(r.sigTrimmed).toBe('');
      expect(r.quoted).toMatch(/^On Mon, Jun 23, 2026/);
    });

    test('Outlook "-----Original Message-----" marker is recognised', function() {
      var body = 'Sounds good, thanks!\n\n-----Original Message-----\nFrom: x\nSubject: y\n\nold body';
      var r = stripQuotedReply(body, { trimSignature: true });
      expect(r.visible).toBe('Sounds good, thanks!');
      expect(r.quoted).toMatch(/-----Original Message-----/);
    });

    test('empty / null inputs are returned as-is', function() {
      expect(stripQuotedReply('').visible).toBe('');
      expect(stripQuotedReply(null).visible).toBe(null);
      expect(stripQuotedReply(undefined).visible).toBe(undefined);
    });
  });
});
