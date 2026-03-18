import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ── STYLES ────────────────────────────────────────────────────
var COLORS = {
  bg: '#0f0f1a',
  surface: '#1a1a2e',
  border: '#2a2a3e',
  primary: '#00c9ff',
  text: '#ffffff',
  muted: '#8888aa',
  accent: '#00c9ff',
};

// ── RENDER CONTENT (supports ## headers, **bold**, paragraphs) ─
function renderContent(text) {
  if (!text) return null;
  return text.split('\n\n').map(function(para, i) {
    if (!para || !para.trim()) return null;
    // Handle ## headers
    if (para.trim().startsWith('## ')) {
      return (
        <h2 key={i} style={{ color: COLORS.primary, fontSize: 22, fontWeight: 800, marginTop: 36, marginBottom: 12 }}>
          {para.trim().replace('## ', '')}
        </h2>
      );
    }
    // Skip # headers — we use the post title as h1
    if (para.trim().startsWith('# ')) {
      return null;
    }
    // Handle bullet points (lines starting with * or -)
    if (para.trim().startsWith('* ') || para.trim().startsWith('- ')) {
      var items = para.split('\n').filter(function(l) { return l.trim(); });
      return (
        <ul key={i} style={{ color: COLORS.text, fontSize: 16, lineHeight: 1.75, marginBottom: 20, paddingLeft: 24 }}>
          {items.map(function(item, j) {
            var text = item.replace(/^[\s]*[*-]\s*/, '');
            var parts = text.split(/(\*\*.*?\*\*)/g);
            return (
              <li key={j} style={{ marginBottom: 8 }}>
                {parts.map(function(part, k) {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={k} style={{ color: COLORS.primary, fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
                  }
                  return part;
                })}
              </li>
            );
          })}
        </ul>
      );
    }
    // Handle numbered lists
    if (/^\d+\.\s/.test(para.trim())) {
      var items = para.split('\n').filter(function(l) { return l.trim(); });
      return (
        <ol key={i} style={{ color: COLORS.text, fontSize: 16, lineHeight: 1.75, marginBottom: 20, paddingLeft: 24 }}>
          {items.map(function(item, j) {
            var text = item.replace(/^[\s]*\d+\.\s*/, '');
            var parts = text.split(/(\*\*.*?\*\*)/g);
            return (
              <li key={j} style={{ marginBottom: 8 }}>
                {parts.map(function(part, k) {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={k} style={{ color: COLORS.primary, fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
                  }
                  return part;
                })}
              </li>
            );
          })}
        </ol>
      );
    }
    // Regular paragraphs with **bold** support
    var parts = para.split(/(\*\*.*?\*\*)/g);
    return (
      <p key={i} style={{ color: COLORS.text, fontSize: 16, lineHeight: 1.75, marginBottom: 20 }}>
        {parts.map(function(part, j) {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j} style={{ color: COLORS.primary, fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
      </p>
    );
  });
}

// ── BLOG INDEX ────────────────────────────────────────────────
function BlogIndex(props) {
  var posts = props.posts;
  var onSelectPost = props.onSelectPost;
  var loading = props.loading;

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ color: COLORS.muted, fontSize: 16 }}>Loading posts...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 20px' }}>
      <h1 style={{ color: COLORS.text, fontSize: 36, fontWeight: 800, marginBottom: 8 }}>
        Blog
      </h1>
      <p style={{ color: COLORS.muted, fontSize: 16, marginBottom: 48 }}>
        Insights on AI-powered customer communications for businesses and service providers.
      </p>

      {posts.length === 0 && (
        <div style={{ color: COLORS.muted, fontSize: 14, textAlign: 'center', padding: 40 }}>No posts yet. Check back soon!</div>
      )}

      {posts.map(function(post) {
        return (
          <article
            key={post.slug}
            onClick={function() { onSelectPost(post.slug); }}
            style={{
              background: COLORS.surface,
              border: '1px solid ' + COLORS.border,
              borderRadius: 12,
              padding: 32,
              marginBottom: 24,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={function(e) { e.currentTarget.style.borderColor = COLORS.primary; }}
            onMouseLeave={function(e) { e.currentTarget.style.borderColor = COLORS.border; }}
          >
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <span style={{
                background: COLORS.primary + '22',
                color: COLORS.primary,
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
              }}>
                {post.category}
              </span>
              <span style={{ color: COLORS.muted, fontSize: 13 }}>
                {post.date} · {post.read_time}
              </span>
            </div>
            <h2 style={{ color: COLORS.text, fontSize: 22, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>
              {post.title}
            </h2>
            <p style={{ color: COLORS.muted, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
              {post.excerpt}
            </p>
          </article>
        );
      })}
    </div>
  );
}

// ── BLOG POST ─────────────────────────────────────────────────
function BlogPost(props) {
  var post = props.post;
  var onBack = props.onBack;

  if (!post) return <div style={{ color: COLORS.text, padding: 40 }}>Post not found.</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: COLORS.primary,
          cursor: 'pointer',
          fontSize: 14,
          marginBottom: 32,
          padding: 0,
        }}
      >
        ← Back to Blog
      </button>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <span style={{
          background: COLORS.primary + '22',
          color: COLORS.primary,
          padding: '4px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {post.category}
        </span>
        <span style={{ color: COLORS.muted, fontSize: 13 }}>
          {post.date} · {post.read_time}
        </span>
      </div>

      <h1 style={{ color: COLORS.text, fontSize: 32, fontWeight: 800, lineHeight: 1.3, marginBottom: 32 }}>
        {post.title}
      </h1>

      {renderContent(post.content)}

      {/* CTA */}
      <div style={{
        background: COLORS.surface,
        border: '1px solid ' + COLORS.border,
        borderRadius: 12,
        padding: 32,
        marginTop: 48,
        textAlign: 'center',
      }}>
        <h3 style={{ color: COLORS.text, fontSize: 20, marginBottom: 8 }}>
          Ready to see EngageWorx in action?
        </h3>
        <p style={{ color: COLORS.muted, fontSize: 15, marginBottom: 20 }}>
          AI chatbot + SMS + WhatsApp + Email + Voice. One platform. From $99/mo.
        </p>
        <a
          href="https://www.engwx.com"
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #00c9ff, #e040fb)',
            color: '#000',
            padding: '12px 32px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          Start Free Trial
        </a>
      </div>
    </div>
  );
}

// ── MAIN BLOG COMPONENT ──────────────────────────────────────
export default function Blog(props) {
  var onBack = props.onBack;
  var selectedPostState = useState(null);
  var selectedSlug = selectedPostState[0];
  var setSelectedSlug = selectedPostState[1];

  var postsState = useState([]);
  var posts = postsState[0];
  var setPosts = postsState[1];

  var loadingState = useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  // Load published posts from Supabase
  useEffect(function() {
    (async function() {
      try {
        var result = await supabase
          .from('blog_posts')
          .select('*')
          .eq('status', 'published')
          .order('created_at', { ascending: false });
        if (result.data) {
          setPosts(result.data);
        }
      } catch (e) {
        console.warn('Blog load error:', e.message);
      }
      setLoading(false);
    })();
  }, []);

  var selectedPost = selectedSlug ? posts.find(function(p) { return p.slug === selectedSlug; }) : null;

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid ' + COLORS.border,
      }}>
        <div
          onClick={function() { if (onBack) onBack(); else window.location.href = '/'; }}
          style={{ cursor: 'pointer' }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.text }}>
            Engage<span style={{ color: COLORS.primary }}>Worx</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span
            onClick={function() { if (onBack) onBack(); else window.location.href = '/'; }}
            style={{ color: COLORS.muted, cursor: 'pointer', fontSize: 14 }}
          >
            Home
          </span>
          <span
            onClick={function() { setSelectedSlug(null); }}
            style={{ color: COLORS.primary, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            Blog
          </span>
          <a
            href="https://www.engwx.com"
            style={{
              background: 'linear-gradient(135deg, #00c9ff, #e040fb)',
              color: '#000',
              padding: '8px 20px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Start Free Trial
          </a>
        </div>
      </div>

      {/* Content */}
      {selectedPost
        ? <BlogPost post={selectedPost} onBack={function() { setSelectedSlug(null); }} />
        : <BlogIndex posts={posts} onSelectPost={setSelectedSlug} loading={loading} />
      }

      {/* Footer */}
      <div style={{
        borderTop: '1px solid ' + COLORS.border,
        padding: '24px',
        textAlign: 'center',
        color: COLORS.muted,
        fontSize: 13,
      }}>
        © 2026 EngageWorx · AI-Powered Customer Communications · engwx.com
      </div>
    </div>
  );
}
