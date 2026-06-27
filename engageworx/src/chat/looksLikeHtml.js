// src/chat/looksLikeHtml.js
// True only when text contains a real HTML tag.
//
// The previous inline heuristic in LiveInboxV2 (/<[a-z][\s\S]*>/i) mis-classified PLAINTEXT
// email bodies that merely contain an angle-bracketed email address or URL — e.g. a Gmail
// attribution "… Rick Beckers <rb@channelsales.pro> wrote:" or a signature "EngageWorx
// <https://engwx.com>" — as HTML. That routed the body past the plaintext quoted-reply /
// signature strip (gated on !isHtml) and rendered the raw wall (quote + sig) in the bubble.
//
// A real tag has <name …> / </name> / <name/> shape: an ASCII letter immediately after "<",
// then a tag name, then optional attributes, then ">". "<rb@channelsales.pro>" fails (the "@"
// breaks the tag-name run before any ">"), and "<https://…>" fails (the ":" does likewise) —
// while "<div>", "<br/>", "<p style=…>", "</a>" all match.
var HTML_TAG = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*?)?\/?>/i;

function looksLikeHtml(text) {
  return !!text && HTML_TAG.test(text);
}

module.exports = { looksLikeHtml: looksLikeHtml };
