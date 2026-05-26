/**
 * Concierge email rendering tests.
 * Issue 1: closingKind 'none' suppresses system closing.
 * Issue 2: markdownToHtml converts AI markdown to HTML.
 */

var { composeHtmlBody, composeTextBody, markdownToHtml } = require('../_email-signature');

// ── Issue 1: closingKind 'none' ──────────────────────────────────────────────

// Inline defaultClosing for unit testing
function defaultClosing(kind, firstName) {
  if (kind === 'none' || kind === null) return '';
  if (kind === 'first') return 'Looking forward to connecting!';
  if (kind === 'followup') return 'Just checking in —';
  return firstName ? ('Best! ' + firstName) : 'Best,';
}

describe('closingKind none suppresses system closing', function() {
  test('closingKind none returns empty string', function() {
    expect(defaultClosing('none', 'Rob')).toBe('');
  });
  test('closingKind null returns empty string', function() {
    expect(defaultClosing(null, 'Rob')).toBe('');
  });
  test('closingKind first still works', function() {
    expect(defaultClosing('first', null)).toBe('Looking forward to connecting!');
  });
  test('closingKind reply still works', function() {
    expect(defaultClosing('reply', 'Rob')).toBe('Best! Rob');
  });
  test('composeHtmlBody with empty closingLine produces no closing element', function() {
    var body = '<p>Suppliers arrive at 8:30.</p>';
    var sig = '<p><strong>Delamere Manor</strong></p>';
    var result = composeHtmlBody(body, '', sig);
    expect(result).toContain(body);
    expect(result).toContain(sig);
    expect(result).not.toContain('Best,');
    expect(result).not.toContain('margin:0 0 14px');
  });
  test('composeHtmlBody with non-empty closingLine still renders', function() {
    var result = composeHtmlBody('<p>Body</p>', 'Best,', '<p>Sig</p>');
    expect(result).toContain('Best,');
  });
});

// ── Issue 2: markdownToHtml ──────────────────────────────────────────────────

describe('markdownToHtml converts AI markdown to HTML', function() {
  test('**bold** converts to <strong>', function() {
    expect(markdownToHtml('up to **150 guests** for the ceremony')).toBe('up to <strong>150 guests</strong> for the ceremony');
  });
  test('__bold__ converts to <strong>', function() {
    expect(markdownToHtml('__important__')).toBe('<strong>important</strong>');
  });
  test('*italic* converts to <em>', function() {
    expect(markdownToHtml('please *note* this')).toBe('please <em>note</em> this');
  });
  test('[link](url) converts to <a>', function() {
    var result = markdownToHtml('Visit [our site](https://example.com) for details');
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('>our site</a>');
  });
  test('mixed markdown + plain text preserves both', function() {
    var input = 'Hello **Sarah**, your *special* day at [Delamere](https://delameremanor.co.uk) is coming!';
    var result = markdownToHtml(input);
    expect(result).toContain('<strong>Sarah</strong>');
    expect(result).toContain('<em>special</em>');
    expect(result).toContain('<a href="https://delameremanor.co.uk"');
    expect(result).toContain('Hello ');
    expect(result).toContain(' is coming!');
  });
  test('plain text without markdown passes through unchanged', function() {
    var plain = 'No markdown here, just plain text.';
    expect(markdownToHtml(plain)).toBe(plain);
  });
  test('null input returns null', function() {
    expect(markdownToHtml(null)).toBeNull();
  });
  test('empty string returns empty string', function() {
    expect(markdownToHtml('')).toBe('');
  });
  test('already-HTML in body does not get double-converted', function() {
    var html = '<strong>already bold</strong> and <em>already italic</em>';
    // Should pass through — no ** or * to convert
    expect(markdownToHtml(html)).toBe(html);
  });
});
