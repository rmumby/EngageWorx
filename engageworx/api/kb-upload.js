// api/kb-upload.js — Upload a knowledge document for AI processing into KB articles
// POST /api/kb-upload (multipart/form-data: file + surfaces[])
// Auth: JWT → tenant_members check
// Returns: { document: { id, filename, status, ... } }

var { createClient } = require('@supabase/supabase-js');
var { randomUUID } = require('crypto');

var ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/html',
  'message/rfc822',
];
var ALLOWED_SURFACES = ['concierge', 'enquiry', 'supplier'];
var MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Auth: extract user from JWT
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' });

  // Parse multipart body (Vercel provides parsed body for multipart with config)
  var file = req.body?.file || req.files?.file;
  var surfacesRaw = req.body?.surfaces;

  // Handle raw multipart parsing if needed
  if (!file && req.headers['content-type']?.includes('multipart/form-data')) {
    // Use busboy for manual parsing
    var parsed = await parseMultipart(req);
    file = parsed.file;
    surfacesRaw = parsed.surfaces;
  }

  if (!file) return res.status(400).json({ error: 'No file provided' });

  var fileBuffer = file.buffer || file.data || (Buffer.isBuffer(file) ? file : null);
  var filename = file.originalname || file.name || 'document';
  var mimeType = file.mimetype || file.type || 'application/octet-stream';
  var fileSize = fileBuffer ? fileBuffer.length : 0;

  // Validate mime type
  if (!ALLOWED_MIMES.includes(mimeType)) {
    return res.status(400).json({ error: 'Unsupported file type: ' + mimeType + '. Allowed: PDF, DOCX, TXT, MD, HTML, EML' });
  }

  // Validate file size
  if (fileSize > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File too large. Maximum 25MB.' });
  }

  // Parse surfaces
  var surfaces = [];
  if (typeof surfacesRaw === 'string') {
    try { surfaces = JSON.parse(surfacesRaw); } catch (e) { surfaces = surfacesRaw.split(',').map(function(s) { return s.trim(); }); }
  } else if (Array.isArray(surfacesRaw)) {
    surfaces = surfacesRaw;
  }
  surfaces = surfaces.filter(function(s) { return ALLOWED_SURFACES.includes(s); });
  if (surfaces.length === 0) return res.status(400).json({ error: 'At least one surface required (concierge, enquiry, supplier)' });

  // Resolve tenant from membership
  var { data: membership } = await supabase
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!membership) return res.status(403).json({ error: 'No active tenant membership' });
  var tenantId = membership.tenant_id;

  // Generate doc ID and storage path
  var docId = randomUUID();
  var ext = filename.split('.').pop() || 'bin';
  var storagePath = tenantId + '/' + docId + '.' + ext;

  // Upload to Supabase Storage
  var { error: uploadErr } = await supabase.storage
    .from('tenant-kb-docs')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

  if (uploadErr) {
    console.error('[kb-upload] Storage upload failed:', uploadErr.message);
    return res.status(500).json({ error: 'File upload failed' });
  }

  // Insert document record
  var { data: doc, error: insertErr } = await supabase
    .from('tenant_knowledge_documents')
    .insert({
      id: docId,
      tenant_id: tenantId,
      filename: filename,
      file_path: storagePath,
      file_size: fileSize,
      mime_type: mimeType,
      surfaces: surfaces,
      status: 'uploaded',
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertErr) {
    console.error('[kb-upload] DB insert failed:', insertErr.message);
    return res.status(500).json({ error: 'Failed to create document record' });
  }

  console.log('[kb-upload] Document uploaded:', { id: docId, tenant_id: tenantId, filename: filename, surfaces: surfaces });

  // Fire-and-forget: trigger processing
  var processUrl = (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000') + '/api/kb-process';
  fetch(processUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (process.env.SUPABASE_SERVICE_ROLE_KEY || '') },
    body: JSON.stringify({ document_id: docId }),
  }).catch(function(e) { console.warn('[kb-upload] Process trigger failed (non-fatal):', e.message); });

  return res.status(200).json({ document: doc });
};

// Disable default body parser for multipart
module.exports.config = { api: { bodyParser: false } };

// Simple multipart parser using busboy
async function parseMultipart(req) {
  return new Promise(function(resolve, reject) {
    var Busboy = require('busboy');
    var busboy = Busboy({ headers: req.headers });
    var result = { file: null, surfaces: null };
    var chunks = [];

    busboy.on('file', function(fieldname, stream, info) {
      stream.on('data', function(chunk) { chunks.push(chunk); });
      stream.on('end', function() {
        result.file = {
          buffer: Buffer.concat(chunks),
          originalname: info.filename,
          mimetype: info.mimeType,
        };
      });
    });

    busboy.on('field', function(fieldname, value) {
      if (fieldname === 'surfaces') result.surfaces = value;
    });

    busboy.on('finish', function() { resolve(result); });
    busboy.on('error', reject);

    req.pipe(busboy);
  });
}
