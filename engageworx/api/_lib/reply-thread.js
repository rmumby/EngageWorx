// api/_lib/reply-thread.js — Reply-to threading for inbound capture
// Generates unique reply-to addresses and resolves incoming replies to conversations.

var crypto = require('crypto');

function generateThreadId() {
  return crypto.randomBytes(8).toString('hex');
}

function makeReplyToAddress(threadId) {
  return 'reply+' + threadId + '@track.engwx.com';
}

function extractThreadId(address) {
  var m = (address || '').match(/reply\+([a-f0-9]+)@/i);
  return m ? m[1] : null;
}

async function resolveReplyThread(supabase, threadId) {
  if (!threadId) return null;
  try {
    var r = await supabase.from('messages')
      .select('id, conversation_id, tenant_id, contact_id, metadata')
      .contains('metadata', { reply_thread_id: threadId })
      .limit(1)
      .maybeSingle();
    return r.data || null;
  } catch (e) {
    console.error('[reply-thread] resolve error:', e.message);
    return null;
  }
}

module.exports = {
  generateThreadId: generateThreadId,
  makeReplyToAddress: makeReplyToAddress,
  extractThreadId: extractThreadId,
  resolveReplyThread: resolveReplyThread,
};
