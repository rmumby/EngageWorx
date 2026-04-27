// api/cron-weekly-update.js
// Monday 14:00 UTC (10am ET): pulls the last 7 days of git commits from GitHub,
// asks Claude to write a polished platform update, saves it as a DRAFT in
// platform_updates, and emails rob@engwx.com to review + publish.

var { createClient } = require('@supabase/supabase-js');

var GITHUB_REPO = process.env.GITHUB_REPO || 'rmumby/EngageWorx';
var GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function fetchRecentCommits(days) {
  if (!GITHUB_TOKEN) return { commits: [], source: 'none' };
  try {
    var since = new Date(Date.now() - days * 86400000).toISOString();
    var url = 'https://api.github.com/repos/' + GITHUB_REPO + '/commits?since=' + since + '&per_page=100';
    var res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'EngageWorx-Weekly-Update',
      },
    });
    if (!res.ok) { console.warn('[WeeklyUpdate] GitHub API', res.status, await res.text().catch(function() { return ''; })); return { commits: [], source: 'github-error' }; }
    var arr = await res.json();
    var commits = (arr || []).map(function(c) {
      return { message: (c.commit && c.commit.message) || '', date: c.commit && c.commit.author && c.commit.author.date, author: c.commit && c.commit.author && c.commit.author.name };
    }).filter(function(c) { return c.message && !/^merge\s/i.test(c.message); });
    return { commits: commits, source: 'github' };
  } catch (e) { console.warn('[WeeklyUpdate] GitHub fetch:', e.message); return { commits: [], source: 'github-fail' }; }
}

async function generateWithClaude(commits) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  var commitLines = commits.slice(0, 80).map(function(c) {
    var firstLine = c.message.split('\n')[0];
    return '- ' + firstLine;
  }).join('\n');

  var systemPrompt = 'You write warm, concise weekly product updates for EngageWorx — an AI-powered multi-channel communications platform (SMS, WhatsApp, Email, Voice, RCS) with a CSP/agent/tenant hierarchy. Your audience is Rob Mumby\'s customers (business owners, CSP partners, agents).' +
    '\n\nReturn STRICT Markdown with these exact four H2 sections and nothing else before or after:' +
    '\n## What\'s New\n- (2-4 bullets about headline features)' +
    '\n## Improvements\n- (2-4 bullets about quality-of-life changes and fixes)' +
    '\n## Coming Next\n- (1-3 bullets speculating on what\'s next, honest and non-committal)' +
    '\n## Tip of the Week\n- (one short actionable tip for the reader)' +
    '\n\nRules: no emoji overload (one or two per section max), no corporate fluff, no "we\'re excited" language, no commit SHAs, no internal jargon. Group related commits. Skip chore/refactor commits unless they\'re user-visible.';

  var prompt = 'Last 7 days of commits on the EngageWorx repo (most recent first):\n\n' + (commitLines || '(no commits found)') + '\n\nWrite the weekly update markdown now.';

  try {
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, system: systemPrompt, messages: [{ role: 'user', content: prompt }] }),
    });
    var data = await aiRes.json();
    var txt = (data.content || []).find(function(b) { return b.type === 'text'; });
    return txt ? txt.text.trim() : null;
  } catch (e) { console.warn('[WeeklyUpdate] Claude error:', e.message); return null; }
}

function weekStamp() {
  var d = new Date();
  return d.getUTCFullYear() + '-W' + String(Math.ceil(((d - new Date(d.getUTCFullYear(), 0, 1)) / 86400000 + new Date(d.getUTCFullYear(), 0, 1).getUTCDay() + 1) / 7)).padStart(2, '0');
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = getSupabase();
  var dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var stamp = weekStamp();

  try {
    // 1. Pull recent release notes (preferred) or fall back to GitHub API
    var releaseNotes = [];
    try {
      var rnRes = await supabase.from('release_notes').select('title, summary, feature_area, commit_message').eq('tenant_facing', true).gte('shipped_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('shipped_at', { ascending: false });
      releaseNotes = rnRes.data || [];
    } catch (e) {}

    var commits; var source;
    if (releaseNotes.length > 0) {
      commits = releaseNotes.map(function(rn) { return { message: (rn.title || '') + ': ' + (rn.summary || rn.commit_message || '') }; });
      source = 'release_notes';
    } else {
      var fetched = await fetchRecentCommits(7);
      commits = fetched.commits;
      source = fetched.source;
    }
    console.log('[WeeklyUpdate] Source:', source, 'items:', commits.length);

    // 2. Ask Claude for the draft
    var markdown = await generateWithClaude(commits);
    if (!markdown) {
      markdown = '## What\'s New\n- (Claude could not generate a draft — review the changelog manually)\n\n## Improvements\n- —\n\n## Coming Next\n- —\n\n## Tip of the Week\n- —';
    }

    // 3. Save as draft
    var title = 'Weekly platform update — ' + dateLabel;
    var ins = await supabase.from('platform_updates').insert({
      title: title,
      body: markdown,
      target_audience: 'all',
      published_at: null,
    }).select('id').single();
    var draftId = ins.data && ins.data.id;
    console.log('[WeeklyUpdate] Draft saved:', draftId);

    // 4. Email Rob
    if (process.env.SENDGRID_API_KEY) {
      try {
        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        var preview = markdown.substring(0, 800).replace(/</g, '&lt;').replace(/\n/g, '<br>');
        var html = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f9fafb;">' +
          '<div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">' +
          '<h1 style="font-size:20px;color:#111;margin:0 0 6px;">📝 Weekly platform update draft ready</h1>' +
          '<p style="color:#475569;font-size:13px;margin:0 0 16px;">Week of ' + dateLabel + ' · ' + commits.length + ' commits analysed · source: ' + source + '</p>' +
          '<div style="background:#f3f4f6;border-radius:8px;padding:16px;font-size:13px;color:#1e293b;line-height:1.6;white-space:pre-wrap;max-height:400px;overflow:auto;">' + preview + (markdown.length > 800 ? '…' : '') + '</div>' +
          '<div style="text-align:center;margin-top:20px;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Review & publish →</a></div>' +
          '<p style="color:#94a3b8;font-size:11px;margin-top:16px;">Go to SP Admin → Platform Updates to edit or publish this draft.</p>' +
          '</div></div>';
        await sgMail.send({
          to: (process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'),
          from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
          subject: '📝 Weekly platform update draft — ' + dateLabel,
          html: html,
        });
      } catch (e) { console.warn('[WeeklyUpdate] Email send error:', e.message); }
    }

    return res.status(200).json({ success: true, draft_id: draftId, commits: commits.length, source: source, week: stamp });
  } catch (err) {
    console.error('[WeeklyUpdate] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
