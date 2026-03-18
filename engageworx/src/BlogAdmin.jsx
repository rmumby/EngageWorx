import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function BlogAdmin({ C }) {
  var postsState = useState([]);
  var posts = postsState[0];
  var setPosts = postsState[1];

  var loadingState = useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var editingState = useState(null);
  var editing = editingState[0];
  var setEditing = editingState[1];

  var savingState = useState(false);
  var saving = savingState[0];
  var setSaving = savingState[1];

  var showEditorState = useState(false);
  var showEditor = showEditorState[0];
  var setShowEditor = showEditorState[1];

  var formState = useState({
    title: '', slug: '', date: '', read_time: '5 min read',
    category: 'General', excerpt: '', content: '', status: 'draft', featured: false,
  });
  var form = formState[0];
  var setForm = formState[1];

  var previewState = useState(false);
  var showPreview = previewState[0];
  var setShowPreview = previewState[1];

  // Load all posts
  function loadPosts() {
    setLoading(true);
    supabase.from('blog_posts').select('*').order('created_at', { ascending: false })
      .then(function(result) {
        if (result.data) setPosts(result.data);
        setLoading(false);
      });
  }

  useEffect(function() { loadPosts(); }, []);

  // Auto-generate slug from title
  function updateTitle(title) {
    var slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    setForm(Object.assign({}, form, { title: title, slug: slug }));
  }

  // Save post
  async function savePost() {
    if (!form.title || !form.content) {
      alert('Title and content are required');
      return;
    }
    setSaving(true);

    var now = new Date();
    var dateStr = form.date || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    var slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]/g, '-');

    var payload = {
      title: form.title,
      slug: slug,
      date: dateStr,
      read_time: form.read_time || '5 min read',
      category: form.category || 'General',
      excerpt: form.excerpt || form.content.substring(0, 160) + '...',
      content: form.content,
      status: form.status,
      featured: form.featured,
      updated_at: new Date().toISOString(),
    };

    var result;
    if (editing) {
      result = await supabase.from('blog_posts').update(payload).eq('id', editing);
    } else {
      result = await supabase.from('blog_posts').insert(payload);
    }

    if (result.error) {
      alert('Error saving: ' + result.error.message);
    } else {
      setShowEditor(false);
      setEditing(null);
      setForm({ title: '', slug: '', date: '', read_time: '5 min read', category: 'General', excerpt: '', content: '', status: 'draft', featured: false });
      loadPosts();
    }
    setSaving(false);
  }

  // Edit post
  function editPost(post) {
    setForm({
      title: post.title || '',
      slug: post.slug || '',
      date: post.date || '',
      read_time: post.read_time || '5 min read',
      category: post.category || 'General',
      excerpt: post.excerpt || '',
      content: post.content || '',
      status: post.status || 'draft',
      featured: post.featured || false,
    });
    setEditing(post.id);
    setShowEditor(true);
    setShowPreview(false);
  }

  // Delete post
  async function deletePost(id) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    var result = await supabase.from('blog_posts').delete().eq('id', id);
    if (result.error) alert('Error: ' + result.error.message);
    else loadPosts();
  }

  // Toggle publish
  async function togglePublish(post) {
    var newStatus = post.status === 'published' ? 'draft' : 'published';
    await supabase.from('blog_posts').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', post.id);
    loadPosts();
  }

  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + C.primary + ', ' + (C.accent || C.primary) + ')', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var label = { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 };

  // ── RENDER ──
  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>Blog Manager</h1>
          <p style={{ color: C.muted || '#888', marginTop: 4, fontSize: 14 }}>{posts.length} posts · {posts.filter(function(p) { return p.status === 'published'; }).length} published</p>
        </div>
        <button onClick={function() { setEditing(null); setForm({ title: '', slug: '', date: '', read_time: '5 min read', category: 'General', excerpt: '', content: '', status: 'draft', featured: false }); setShowEditor(true); setShowPreview(false); }} style={btnPrimary}>+ New Post</button>
      </div>

      {/* ── EDITOR ── */}
      {showEditor && (
        <div style={Object.assign({}, card, { marginBottom: 24, border: '1px solid ' + C.primary + '44' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ color: '#fff', margin: 0, fontSize: 18 }}>{editing ? 'Edit Post' : 'New Post'}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={function() { setShowPreview(!showPreview); }} style={btnSec}>{showPreview ? 'Edit' : 'Preview'}</button>
              <button onClick={function() { setShowEditor(false); setEditing(null); }} style={btnSec}>Cancel</button>
            </div>
          </div>

          {showPreview ? (
            <div style={{ background: '#0f0f1a', borderRadius: 12, padding: 32, maxHeight: 500, overflowY: 'auto' }}>
              <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, marginBottom: 16 }}>{form.title || 'Untitled'}</h1>
              <div style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>{form.date || 'No date'} · {form.read_time} · {form.category}</div>
              {renderContent(form.content)}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={label}>Title</label>
                  <input value={form.title} onChange={function(e) { updateTitle(e.target.value); }} placeholder="Post title" style={inputStyle} />
                </div>
                <div>
                  <label style={label}>Slug (auto-generated)</label>
                  <input value={form.slug} onChange={function(e) { setForm(Object.assign({}, form, { slug: e.target.value })); }} placeholder="post-slug" style={Object.assign({}, inputStyle, { fontFamily: 'monospace', fontSize: 12 })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={label}>Date</label>
                  <input value={form.date} onChange={function(e) { setForm(Object.assign({}, form, { date: e.target.value })); }} placeholder="March 18, 2026" style={inputStyle} />
                </div>
                <div>
                  <label style={label}>Read Time</label>
                  <input value={form.read_time} onChange={function(e) { setForm(Object.assign({}, form, { read_time: e.target.value })); }} placeholder="5 min read" style={inputStyle} />
                </div>
                <div>
                  <label style={label}>Category</label>
                  <select value={form.category} onChange={function(e) { setForm(Object.assign({}, form, { category: e.target.value })); }} style={inputStyle}>
                    <option>General</option>
                    <option>MSPs</option>
                    <option>Agencies</option>
                    <option>Service Providers</option>
                    <option>Product Updates</option>
                    <option>AI & Automation</option>
                    <option>Case Studies</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Status</label>
                  <select value={form.status} onChange={function(e) { setForm(Object.assign({}, form, { status: e.target.value })); }} style={inputStyle}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Excerpt (shown on blog index)</label>
                <textarea value={form.excerpt} onChange={function(e) { setForm(Object.assign({}, form, { excerpt: e.target.value })); }} rows={2} placeholder="A short description for the blog listing..." style={Object.assign({}, inputStyle, { resize: 'vertical' })} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Content (use ## for headers, **bold** for emphasis, blank lines for paragraphs)</label>
                <textarea value={form.content} onChange={function(e) { setForm(Object.assign({}, form, { content: e.target.value })); }} rows={16} placeholder="## Introduction

Write your blog post content here.

Use ## for section headers.
Use **bold text** for emphasis.
Separate paragraphs with blank lines.
Use * or - for bullet points.
Use 1. 2. 3. for numbered lists." style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, minHeight: 300 })} />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={savePost} disabled={saving} style={Object.assign({}, btnPrimary, { opacity: saving ? 0.6 : 1 })}>
              {saving ? 'Saving...' : editing ? 'Update Post' : 'Save Post'}
            </button>
            <button onClick={function() { setForm(Object.assign({}, form, { status: 'published' })); setTimeout(savePost, 100); }} disabled={saving} style={Object.assign({}, btnPrimary, { background: '#00E676' })}>
              Publish Now
            </button>
          </div>
        </div>
      )}

      {/* ── POST LIST ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted || '#888' }}>Loading posts...</div>
      ) : posts.length === 0 ? (
        <div style={Object.assign({}, card, { textAlign: 'center', padding: 40 })}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No blog posts yet</div>
          <div style={{ color: C.muted || '#888', fontSize: 13, marginBottom: 16 }}>Create your first post to start publishing content.</div>
          <button onClick={function() { setShowEditor(true); }} style={btnPrimary}>Create First Post</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {posts.map(function(post) {
            return (
              <div key={post.id} style={Object.assign({}, card, {
                display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px auto',
                alignItems: 'center', gap: 14,
                borderLeft: '4px solid ' + (post.status === 'published' ? '#00E676' : post.status === 'draft' ? '#FFD600' : '#888'),
              })}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{post.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 }}>{post.date} · {post.read_time} · {post.category}</div>
                  <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>/{post.slug}</div>
                </div>
                <div>
                  <span style={{
                    display: 'inline-block',
                    background: (post.status === 'published' ? '#00E676' : post.status === 'draft' ? '#FFD600' : '#888') + '18',
                    color: post.status === 'published' ? '#00E676' : post.status === 'draft' ? '#FFD600' : '#888',
                    border: '1px solid ' + (post.status === 'published' ? '#00E676' : post.status === 'draft' ? '#FFD600' : '#888') + '44',
                    borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                  }}>
                    {post.status === 'published' ? '● Published' : post.status === 'draft' ? '◉ Draft' : '○ Archived'}
                  </span>
                </div>
                <div>
                  <button onClick={function() { togglePublish(post); }} style={Object.assign({}, btnSec, { padding: '6px 10px', fontSize: 11 })}>
                    {post.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
                <div>
                  <button onClick={function() { editPost(post); }} style={Object.assign({}, btnSec, { padding: '6px 10px', fontSize: 11 })}>Edit</button>
                </div>
                <div>
                  <button onClick={function() { deletePost(post.id); }} style={Object.assign({}, btnSec, { padding: '6px 10px', fontSize: 11, color: '#FF3B30' })}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, lineHeight: 1.6 }}>
          <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Formatting Guide:</strong> Use <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3 }}>## Header</code> for section headers · <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3 }}>**bold**</code> for emphasis · Blank lines for paragraph breaks · <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3 }}>* item</code> for bullet lists · <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3 }}>1. item</code> for numbered lists
        </div>
      </div>
    </div>
  );
}
