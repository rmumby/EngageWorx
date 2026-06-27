// Tests for src/chat/stripQuotedReply — plaintext quote strip + registered-signature trimming.
// Line endings normalize to \n internally, so expected `visible`/`quoted` are asserted in \n
// form even when the input is CRLF. Signature trimming is driven by the per-tenant marker set
// from signatureRegistry (v1: EngageWorx). `sigTrimmed` is a boolean; the full original is
// always recoverable by the caller from the untrimmed input.
var { stripQuotedReply } = require('../stripQuotedReply');
var { signaturesFor, ENGAGEWORX } = require('../signatureRegistry');
var { looksLikeHtml } = require('../looksLikeHtml');

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

  test('team-name closing ("EngageWorx Team") is trimmed', function() {
    var input =
      'Want to try it free? Head to portal.engwx.com — no credit card needed.\r\n\r\n' +
      "What's your use case?\r\n\r\nEngageWorx Team";
    var r = stripQuotedReply(input, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe(
      "Want to try it free? Head to portal.engwx.com — no credit card needed.\n\nWhat's your use case?"
    );
    expect(r.sigTrimmed).toBe(true);
  });

  test('structured template (EW logo + Best! stacked above name) collapses fully', function() {
    var input =
      'Better to ship with rough numbers than wait for perfect ones.\r\n\r\n' +
      'Best!\r\n\r\nEW\r\nRob Mumby   AI-Powered CX\r\nFounder & CEO, EngageWorx\r\n' +
      'PHONE\r\n+1 (786) 982-7800\r\nWEBSITE\r\nengwx.com\r\nLINKEDIN\r\nlinkedin.com/company/engwx\r\n';
    var r = stripQuotedReply(input, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe('Better to ship with rough numbers than wait for perfect ones.');
    expect(r.sigTrimmed).toBe(true);
  });

  test('terse one-liner where the sig dominates → content survives', function() {
    var input =
      'Vercel\r\n\r\nEW\r\nRob Mumby   AI-Powered CX\r\nFounder & CEO, EngageWorx\r\n' +
      'PHONE\r\n+1 (786) 982-7800\r\n';
    var r = stripQuotedReply(input, { trimSignature: true, signatures: EWX() });
    expect(r.visible).toBe('Vercel');
    expect(r.sigTrimmed).toBe(true);
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

// Regression: an OUTBOUND reply whose Gmail attribution carries a bracketed email
// ("Rick Beckers <rb@channelsales.pro>") reached prod rendered RAW. Root cause was the
// HTML heuristic (looksLikeHtml) mis-classifying the plaintext body as HTML, gating off the
// strip. The util always handled the body — so the classification check is the real guard.
describe('outbound regression — bracketed-email attribution (prod leak)', function() {
  var OUTBOUND_RICK =
    "Thanks Rick — that timeline works on our end. I'll get the SOW over by Friday.\r\n\r\n" +
    'On Thu, Jun 25, 2026 at 2:12 PM Rick Beckers <rb@channelsales.pro> wrote:\r\n' +
    '> Hi Rob, following up on the partnership timeline.\r\n' +
    '> Can we target end of month for kickoff?\r\n\r\n' +
    'Best, Rob\r\n\r\n' +
    'Rob Mumby\r\n' +
    'Founder & CEO | EngageWorx\r\n' +
    '+1 (786) 982-7800\r\n';

  test('the bracketed email no longer trips the HTML heuristic', function() {
    expect(looksLikeHtml(OUTBOUND_RICK)).toBe(false);          // was true → skipped the strip
    expect(looksLikeHtml('EngageWorx <https://engwx.com>')).toBe(false);
    expect(looksLikeHtml('<div>real html</div>')).toBe(true);  // genuine HTML still detected
    expect(looksLikeHtml('<br/>plain<p style="x">')).toBe(true);
  });

  test('strips to just the new reply; quote + sig sit behind the expander', function() {
    var r = stripQuotedReply(OUTBOUND_RICK, { trimSignature: true, signatures: signaturesFor(ENGAGEWORX) });
    expect(r.visible).toBe("Thanks Rick — that timeline works on our end. I'll get the SOW over by Friday.");
    expect(r.quoted).toMatch(/^On Thu, Jun 25, 2026 at 2:12 PM Rick Beckers <rb@channelsales\.pro> wrote:/);
    expect(r.quoted).toContain('Rob Mumby'); // signature recoverable via the expander, not in visible
  });
});

// Two LIVE outbound rows (tenant c1bc59a8…) that rendered via the isHtml path and walled in
// prod. Both are plaintext with ZERO real HTML tags (verified by Postgres open/close-tag probes)
// — they only carry angle-bracketed URL/email tokens and a Gmail [image: …] placeholder. Every
// bracket-bearing line below is verbatim from the row; the long quoted deal-strategy thread in
// row 53d775db is elided for confidentiality (it contains no tags, so classification is identical).
describe('looksLikeHtml — live plaintext rows must classify as NOT html', function() {
  // row 53d775db-f080-4c50-8650-1174251242b4
  var ROW_53D =
    'Hi David,\r\n\r\n' +
    'Hope you had a nice weekend.\r\n\r\n' +
    "How's a follow-up call Tuesday or Wednesday?\r\n\r\n\r\n" +
    'Rob Mumby\r\n' +
    'Founder & CEO  |  EngageWorx <https://engwx.com>\r\n' +
    '+1 (786) 982-7800\r\n\r\n\r\n' +
    'On Thu, Jun 11, 2026 at 6:52 PM Rob Mumby <rob@engwx.com> wrote:\r\n\r\n' +
    '> David,\r\n>\r\n' +
    '> [quoted deal-strategy thread elided for confidentiality — contains no HTML tags]\r\n>\r\n';

  // row a26f5327-8153-4ed9-8929-a2e1a1b6c988 (carries a Gmail [image: …] placeholder)
  var ROW_A26 =
    'Hey David,\r\n\r\n' +
    "I reached out to Tyler and didn't get a response.  I'll continue to try him.\r\n\r\n" +
    "How's next week look to dig into the EngageWorx platform to set-up?\r\n\r\n" +
    'Best!\r\n\r\n\r\n' +
    'Rob Mumby\r\n' +
    'Founder & CEO  |  EngageWorx <https://engwx.com>\r\n' +
    '+1 (786) 982-7800\r\n\r\n\r\n' +
    'On Fri, Jun 26, 2026 at 11:35 PM iCatholic Mobile <david@icatholicmobile.com>\r\n' +
    'wrote:\r\n\r\n' +
    '> Hello  Any updates on the discussion and next steps on our contract?\r\n>\r\n' +
    '> [image: iCatholic-Mobile-email copy.jpg]\r\n>\r\n';

  test('row 53d775db (bracketed URL + email) is not HTML', function() {
    expect(looksLikeHtml(ROW_53D)).toBe(false);
  });

  test('row a26f5327 (bracketed URL + email + [image:] placeholder) is not HTML', function() {
    expect(looksLikeHtml(ROW_A26)).toBe(false);
  });

  test('bare bracket tokens individually are not HTML', function() {
    expect(looksLikeHtml('<https://engwx.com>')).toBe(false);   // scheme
    expect(looksLikeHtml('<david@icatholicmobile.com>')).toBe(false); // email local-part with @
    expect(looksLikeHtml('[image: iCatholic-Mobile-email copy.jpg]')).toBe(false); // [image: placeholder
  });

  test('genuine HTML still classifies as html', function() {
    expect(looksLikeHtml('<div>hello</div>')).toBe(true);
    expect(looksLikeHtml('<img src="x.jpg">')).toBe(true);
    expect(looksLikeHtml('text <p style="m:0">para</p> more')).toBe(true);
    expect(looksLikeHtml('a closing only </a> tag')).toBe(true);
  });
});

// Quoted-reply hardening, verified against the live corpus (EngageWorx + Delamere, plaintext
// only). Bracket-bearing attribution lines are verbatim from the cited rows; long quoted bodies
// are shortened (no effect on where the cut fires). Each asserts the cut fires (quote removed).
var GENERIC = function() { return signaturesFor(undefined); }; // non-EW tenants: generic sig markers only

describe('quoted-reply hardening — wrapped attributions', function() {
  // req 1 — row 086f9bac: Gmail soft-wrap puts "wrote:" on its own line after the <email>.
  test('wrapped US-date attribution (086f9bac)', function() {
    var body =
      'how many people can be seated?\r\n\r\n\r\n' +
      'On Sun, Jun 7, 2026 at 11:04 AM Delamere Manor <weddings@delameremanor.co.uk>\r\n' +
      'wrote:\r\n\r\n' +
      '> Delamere Manor\r\n>\r\n> Hi Rob — yes, absolutely, there\'s a solid wet weather plan.\r\n';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe('how many people can be seated?');
    expect(r.quoted).toMatch(/^On Sun, Jun 7, 2026 at 11:04 AM Delamere Manor/);
  });

  // req 1 — row 149b1765: wrapped attribution + an EngageWorx signature above it.
  test('wrapped attribution + EW signature both removed (149b1765)', function() {
    var body =
      'Hey Vitaly,\r\n\r\nHope you had a good weekend.\r\n\r\n' +
      "Just circling up to see if you've spent time in the portal.\r\n\r\n" +
      'Best!\r\n\r\n\r\nRob Mumby\r\nFounder & CEO  |  EngageWorx <https://engwx.com>\r\n+1 (786) 982-7800\r\n\r\n\r\n' +
      'On Mon, Jun 8, 2026 at 5:20 PM Vitaly Potapov <vitaly@rangetelecom.com>\r\n' +
      'wrote:\r\n\r\n> Rob,\r\n>\r\n> I will be doing some digging later this week.\r\n';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: signaturesFor(ENGAGEWORX) });
    expect(r.visible).toBe("Hey Vitaly,\n\nHope you had a good weekend.\n\nJust circling up to see if you've spent time in the portal.");
    expect(r.sigTrimmed).toBe(true);
  });

  // req 3 — British-Gmail hybrid date, wrapped (Delamere "Sam / Wedding Team" thread).
  test('wrapped British-Gmail hybrid attribution', function() {
    var body =
      'Hi, that all sounds perfect, thank you!\r\n\r\n' +
      'On Tue, 23 Jun 2026 at 15:22, The Wedding Team <weddings@delameremanor.co.uk>\r\n' +
      'wrote:\r\n\r\n> Hi Sam,\r\n>\r\n> Thank you for your email, 8.30am is great for arrival.\r\n';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe('Hi, that all sounds perfect, thank you!');
    expect(r.quoted).toMatch(/^On Tue, 23 Jun 2026 at 15:22, The Wedding Team/);
  });
});

describe('quoted-reply hardening — additional single-line date formats', function() {
  // req 3 — iOS, row 05805982
  test('iOS "On 17 Jun 2026, at 14:29," format (05805982)', function() {
    var body =
      'Hi Darren,\r\n\r\nThank you for the update. Please let me know how you get on.\r\n\r\n' +
      'On 15 Jun 2026, at 08:48, Ninie <nita.ninie@gmail.com> wrote:\r\n>\r\n> Hi Darren,\r\n>\r\n> Hope you are well.\r\n';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe('Hi Darren,\n\nThank you for the update. Please let me know how you get on.');
    expect(r.quoted).toMatch(/^On 15 Jun 2026, at 08:48, Ninie/);
  });

  // req 3 — British long-form / BST (149b1765 was cited; format per spec)
  test('British long-form "On Friday, 12 June 2026 at 18:27:57 BST," format', function() {
    var body =
      'Thanks so much for organising everything.\r\n\r\n' +
      'On Friday, 12 June 2026 at 18:27:57 BST, Lucy Mcnay <lucy.mcnay@example.co.uk> wrote:\r\n' +
      '> Hi,\r\n> Please find attached the final schedule.\r\n';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe('Thanks so much for organising everything.');
    expect(r.quoted).toMatch(/^On Friday, 12 June 2026 at 18:27:57 BST, Lucy Mcnay/);
  });

  // req 3 — numeric / Yahoo dd/mm/yyyy
  test('numeric/Yahoo "On 19/06/2026 12:39 BST e-mail …" format', function() {
    var body =
      'Yes please, that works for us.\r\n\r\n' +
      'On 19/06/2026 12:39 BST e-mail becky.naish <becky.naish@example.com> wrote:\r\n' +
      '> Hello,\r\n> Confirming your booking details below.\r\n';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe('Yes please, that works for us.');
    expect(r.quoted).toMatch(/^On 19\/06\/2026 12:39 BST e-mail becky\.naish/);
  });
});

describe('quoted-reply hardening — >-quoted-block backstop', function() {
  // req 2 — row 1d60aa98: the attribution is itself >-quoted ("> On 10/06/2026 … wrote:"), so the
  // "On … wrote:" marker can't anchor it. The contiguous >-block is the independent cut point.
  test('>-quoted attribution is cut by the block backstop (1d60aa98)', function() {
    var body =
      'Hi Darren\r\n\r\n' +
      'Hope all is well, could we visit this Sunday to show our parents round?\r\n\r\n' +
      'Cheers\r\nBen and Isobel\r\n\r\n' +
      '> On 10/06/2026 15:59 BST Darren Wells <darren@delameremanor.co.uk> wrote:\r\n' +
      '>\r\n> Hi Isobel and Ben,\r\n>\r\n> Thank you for coming into the manor today.\r\n';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe('Hi Darren\n\nHope all is well, could we visit this Sunday to show our parents round?\n\nCheers\nBen and Isobel');
    expect(r.quoted).toMatch(/^> On 10\/06\/2026 15:59 BST Darren Wells/);
  });

  test('a lone stray ">" line in a reply does NOT trigger the backstop', function() {
    var body = 'I agree with the point below:\r\n> just one quoted line, no block\r\nLet me know.';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.quoted).toBe('');                 // single > line is not a ≥2-line block
    expect(r.visible).toBe(body.replace(/\r\n/g, '\n'));
  });
});

// Three real inbound rows from Delamere conversation 4ac2ce5a-8b5b-4d70-8d70-87f4a7dcdde2
// (messages.body, LF line endings as stored). Each `REPLY_*` is reused as BOTH the head of the
// fixture body AND the expected `visible`, so there's no transcription drift between input and
// expectation. Long quoted tails are shortened (no effect on the cut point); the attribution /
// header lines that DO drive the cut are verbatim.
describe('quoted-reply hardening — Delamere 4ac2ce5a real rows (Outlook forward leak)', function() {
  // Row 1d60aa98 (752B): fresh reply + a >-quoted "> On 10/06/2026 … wrote:" block. Cut by the
  // >-block backstop. MUST stay passing.
  var REPLY_1D =
    'Hi Darren\n \n' +
    'Hope all is well, we were just wondering if it\'s possible for us to come and visit this ' +
    'Sunday (28th June) so we can show our parents round before the big day! No worries if ' +
    'you\'re not available this weekend, I\'m sure we can find a date :) \n \n' +
    'Cheers\nBen and Isobel';
  var BODY_1D = REPLY_1D + '\n\n' +
    '> On 10/06/2026 15:59 BST Darren Wells <darren@delameremanor.co.uk> wrote:\n' +
    '>  \n>  \n> Hi Isobel and Ben, \n>  \n> Best wishes,\n>  \n> Darren\n> Delamere Manor\n>';

  test('1d60aa98 — >-quoted attribution cut, reply preserved (must not regress)', function() {
    var r = stripQuotedReply(BODY_1D, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe(REPLY_1D);
    expect(r.quoted).toMatch(/^> On 10\/06\/2026 15:59 BST Darren Wells/);
  });

  // Row 98cdfca9 (1375B): fresh reply + a >-quoted "> On 24/06/2026 … wrote:" block. Cut by the
  // >-block backstop. MUST stay passing.
  var REPLY_98 =
    'Hi Sarah\n \n' +
    'Thank you for getting in touch. We have been through a plan with Joy when we visited 2 ' +
    'weeks ago, are there more details that we need to confirm? In either case, we would love ' +
    'to come back to the manor to show our parents so they can see it before the big day! We ' +
    'were ideally hoping for 4th/5th July but I notice that isn\'t on your list. If not, I\'m ' +
    'sure we can find another date!\n \n' +
    'Cheers\nBen and Isobel';
  var BODY_98 = REPLY_98 + '\n\n' +
    '> On 24/06/2026 14:25 BST The Wedding Team <weddings@delameremanor.co.uk> wrote:\n' +
    '>  \n>  \n> Good afternoon Isobel & Ben,\n>  \n> Kind Regards\n>  \n> Sarah Pennington\n' +
    '> Delamere Manor\n>';

  test('98cdfca9 — >-quoted attribution cut, reply preserved (must not regress)', function() {
    var r = stripQuotedReply(BODY_98, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe(REPLY_98);
    expect(r.quoted).toMatch(/^> On 24\/06\/2026 14:25 BST The Wedding Team/);
  });

  // Row 8f67af9a (2825B): fresh reply, then 5 blank lines, then an 80-char "----" forward divider,
  // then TWO stacked Outlook From:/Sent:/To:/Subject: blocks, then a >-quoted "On 24/06…" block.
  // Verbatim detail that's load-bearing: Outlook stamps a U+00A0 NON-BREAKING SPACE after each
  // header colon ("From:\u00a0…", "Sent:\u00a0…"), NOT a plain space. The From:/Sent: marker must
  // be NBSP-tolerant or the cut drops through to the deep >-block and the ENTIRE forward leaks.
  // THE FIX TARGET: cut lands at the FIRST From: block (Fix B, NBSP-tolerant), and the dangling
  // blank lines + "----" divider above it must NOT leak into `visible` (Fix A).
  var REPLY_8F =
    'Hi Sarah\n\n\n' +
    'We have decided who is in which room, is it best if we send that via email?\n\n\n' +
    'We are happy showing ourselves around if you are! If we get to the Manor for\n' +
    '2/2:30 would that be okay?\n\n\n' +
    'Cheers\nBen and Isobel';
  var BODY_8F = REPLY_8F + '\n\n\n\n\n' + '-'.repeat(80) + '\n\n' +
    'From:\u00a0The Wedding Team <weddings@delameremanor.co.uk>\n' +
    'Sent:\u00a0Friday, June 26, 2026 5:49 pm\n' +
    'To:\u00a0Ben Shelbourne <wedding@shelbourne.org>\n' +
    'Subject:\u00a0RE: Final Details Meeting - Wedding 08.08.2026\n\u00a0\n\n' +
    'Hi Ben and Isobel,\n\n\u00a0\n\nKind Regards\n\n\u00a0\n\nSarah Pennington\n\nDelamere Manor\n\n\u00a0\n\n' +
    'From:\u00a0Ben Shelbourne <wedding@shelbourne.org>\n' +
    'Sent:\u00a025 June 2026 20:34\n' +
    'To:\u00a0The Wedding Team <weddings@delameremanor.co.uk>\n' +
    'Subject:\u00a0Re: Final Details Meeting - Wedding 08.08.2026\n\n\u00a0\n\n' +
    'Hi Sarah\n\n\u00a0\n\nCheers\n\nBen and Isobel\n\n' +
    '> On 24/06/2026 14:25 BST The Wedding Team <weddings@delameremanor.co.uk\n' +
    '> [weddings@delameremanor.co.uk]> wrote:\n>  \n> \n>  \n';

  test('8f67af9a — cut at FIRST From: block; NBSP header tolerated; no divider/header leak (fix target)', function() {
    var r = stripQuotedReply(BODY_8F, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe(REPLY_8F);                 // ends at "Cheers\nBen and Isobel"
    expect(r.visible).not.toMatch(/-{2,}\s*$/);       // no dangling "----" forward divider
    expect(r.visible).not.toMatch(/^From:/m);         // no Outlook From: header survived
    expect(r.visible).not.toMatch(/^Sent:/m);         // no Outlook Sent: header survived
    // quoted begins at the FIRST From:/Sent: block (Fix B), not a deeper one or the >-block
    expect(r.quoted).toMatch(/^From:\u00a0The Wedding Team <weddings@delameremanor\.co\.uk>\nSent:\u00a0Friday/);
  });

  // Guard: Fix A's divider trim is scoped to `beforeQ` INSIDE the quote-cut branch. With no quote
  // marker (qAt === -1) the branch is skipped entirely, so a message that simply ENDS in "----"
  // keeps its trailing dashes — the trim must never fire on an arbitrary tail.
  test('no quote marker → trailing "----" is preserved (Fix A does not fire on arbitrary tails)', function() {
    var body = 'Hi\n\nthanks\n\n----';
    var r = stripQuotedReply(body, { trimSignature: true, signatures: GENERIC() });
    expect(r.visible).toBe(body);   // unchanged — dashes intact
    expect(r.quoted).toBe('');      // nothing was cut
    expect(r.sigTrimmed).toBe(false);
  });
});
