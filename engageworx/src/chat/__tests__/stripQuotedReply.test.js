// Tests for src/chat/stripQuotedReply — plaintext quoted-reply + signature trimming.
// Fixtures use prod-shaped bodies. Line endings are normalized to \n internally, so
// expected `visible`/`quoted` are asserted in \n form even when the input is CRLF.
var { stripQuotedReply } = require('../stripQuotedReply');

// FIXTURE 1 — outbound "wall" with CRLF line endings: a one-line reply, the EngageWorx
// signature block, then the Gmail-quoted original the client appended. The \r\n is
// load-bearing here — without normalization the "On … wrote:" marker would miss.
var OUTBOUND_WALL =
  'When works for a demo?\r\n\r\n\r\n' +
  'Rob Mumby\r\n' +
  'Founder & CEO  |  EngageWorx <https://engwx.com>\r\n' +
  '+1 (786) 982-7800\r\n\r\n\r\n' +
  'On Wed, Jun 10, 2026 at 7:40 AM Rob Mumby <rob@engwx.com> wrote:\r\n\r\n' +
  "> I'm available later today...\r\n";

// FIXTURE 2 — Delamere inbound that DOES carry a quoted chain: a fresh reply, then a
// British-format attribution with LEADING WHITESPACE. Must strip at the attribution.
var DELAMERE_QUOTED =
  'Hi, thank you — Wednesday at 3pm suits us well for the tour.\n\n' +
  '    On Wednesday, 17 June 2026 at 15:02:11 BST, Delamere Manor <weddings@delameremanor.co.uk> wrote:\n\n' +
  '    Hello, just confirming your appointment request for the venue tour...\n';

// FIXTURE 3 — genuinely clean inbound: no quote marker, no signature → pure no-op.
var CLEAN_INBOUND = 'Hi, if weather looks grim, can we pivot to have the wedding indoors?';

describe('stripQuotedReply', function() {
  describe('prod fixtures', function() {
    test('outbound CRLF wall → quote cut, signature kept (trimSignature off)', function() {
      var r = stripQuotedReply(OUTBOUND_WALL); // trimSignature default off
      expect(r.visible).toBe(
        'When works for a demo?\n\n\nRob Mumby\nFounder & CEO  |  EngageWorx <https://engwx.com>\n+1 (786) 982-7800'
      );
      expect(r.quoted).toMatch(/^On Wed, Jun 10, 2026/);
    });

    test('Delamere quoted chain → cut at the leading-whitespace British attribution', function() {
      var r = stripQuotedReply(DELAMERE_QUOTED);
      expect(r.visible).toBe('Hi, thank you — Wednesday at 3pm suits us well for the tour.');
      expect(r.quoted).toMatch(/^ {4}On Wednesday, 17 June 2026 at 15:02:11 BST,/);
    });

    test('genuinely clean inbound → visible === body (no-op)', function() {
      var r = stripQuotedReply(CLEAN_INBOUND, { trimSignature: true });
      expect(r.visible).toBe(CLEAN_INBOUND);
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

    test('trimSignature trims a "-- " delimiter signature', function() {
      var body = 'Thanks!\n\n-- \nRob\nEngageWorx';
      var r = stripQuotedReply(body, { trimSignature: true });
      expect(r.visible).toBe('Thanks!');
      expect(r.sigTrimmed).toMatch(/^-- /);
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
