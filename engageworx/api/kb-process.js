// api/kb-process.js — Process an uploaded knowledge document into KB articles
// POST /api/kb-process { document_id }
// Internal-only (called by kb-upload fire-and-forget, or reprocess action)
// Extracts text → Claude structures → inserts wedding_kb_articles

var { createClient } = require('@supabase/supabase-js');

var STRUCTURING_PROMPT = `You are extracting knowledge from a venue document into discrete, self-contained knowledge base articles. Each article will be loaded individually as context for an AI assistant answering customer questions.

RULES:
- One topic per article. Aim for 10-30 articles total per document; consolidate related topics if you'd otherwise have more.
- Each article: title (short, specific — e.g. "Bar opening hours" not "Bar info"), content (50-300 words, self-contained, written so it makes sense WITHOUT other articles loaded as context).
- Preserve exact facts verbatim — prices, dates, capacities, eligibility rules, licence conditions. Never paraphrase numbers or rules in ways that change meaning.
- If the document has pricing tables, capacity tables, or schedules, preserve them as markdown tables inside the article content.
- If the document is structured as Q&A, preserve the question-answer pattern.
- Skip page numbers, headers, marketing fluff, repeated boilerplate, and contact footers (those go in their own "Contact details" article if present).

Return ONLY a JSON array, no preamble or postamble. Format:
[
  { "title": "string", "content": "string" },
  ...
]`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var documentId = req.body?.document_id;
  if (!documentId) return res.status(400).json({ error: 'document_id required' });

  // Load document record
  var { data: doc, error: docErr } = await supabase
    .from('tenant_knowledge_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docErr || !doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.status === 'processing') return res.status(409).json({ error: 'Already processing' });

  // Set status to processing
  await supabase.from('tenant_knowledge_documents').update({ status: 'processing', error_message: null }).eq('id', documentId);

  try {
    // Download file from Storage
    var { data: fileData, error: dlErr } = await supabase.storage
      .from('tenant-kb-docs')
      .download(doc.file_path);

    if (dlErr || !fileData) throw new Error('File download failed: ' + (dlErr ? dlErr.message : 'no data'));

    var fileBuffer = Buffer.from(await fileData.arrayBuffer());

    // Extract text based on mime type
    var extractedText = await extractText(fileBuffer, doc.mime_type, doc.filename);
    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error('Extracted text too short or empty (' + (extractedText || '').length + ' chars)');
    }

    // Truncate if very long (Claude context limit safety)
    var maxChars = 120000;
    if (extractedText.length > maxChars) {
      extractedText = extractedText.substring(0, maxChars) + '\n\n[Document truncated at ' + maxChars + ' characters]';
    }

    // Call Claude to structure into articles
    var articles = await structureWithClaude(extractedText, doc.filename);
    if (!articles || articles.length === 0) {
      throw new Error('No articles extracted from document');
    }

    // Insert articles for each surface
    var surfaces = doc.surfaces || ['concierge'];
    var insertRows = [];
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      for (var j = 0; j < surfaces.length; j++) {
        insertRows.push({
          tenant_id: doc.tenant_id,
          title: article.title,
          content: article.content,
          category: null,
          surface: surfaces[j],
          source_document_id: doc.id,
          is_published: true,
        });
      }
    }

    // Batch insert (Supabase handles arrays)
    var { error: insertErr } = await supabase.from('wedding_kb_articles').insert(insertRows);
    if (insertErr) throw new Error('Article insert failed: ' + insertErr.message);

    // Update document status
    await supabase.from('tenant_knowledge_documents').update({
      status: 'processed',
      article_count: articles.length,
      processed_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', documentId);

    console.log('[kb-process] Success:', { id: documentId, articles: articles.length, surfaces: surfaces });
    return res.status(200).json({ success: true, article_count: articles.length });

  } catch (err) {
    console.error('[kb-process] Error:', { id: documentId, error: err.message });
    await supabase.from('tenant_knowledge_documents').update({
      status: 'failed',
      error_message: err.message,
    }).eq('id', documentId);
    return res.status(500).json({ error: 'Processing failed' });
  }
};

async function extractText(buffer, mimeType, filename) {
  if (mimeType === 'application/pdf') {
    var pdfParse = require('pdf-parse');
    var pdfData = await pdfParse(buffer);
    return pdfData.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    var mammoth = require('mammoth');
    var result = await mammoth.extractRawText({ buffer: buffer });
    return result.value;
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'text/html') {
    var html = buffer.toString('utf-8');
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (mimeType === 'message/rfc822') {
    var { simpleParser } = require('mailparser');
    var parsed = await simpleParser(buffer);
    var parts = [];
    if (parsed.subject) parts.push('Subject: ' + parsed.subject);
    if (parsed.from?.text) parts.push('From: ' + parsed.from.text);
    if (parsed.date) parts.push('Date: ' + parsed.date.toISOString());
    if (parsed.text) parts.push('\n' + parsed.text);
    else if (parsed.html) parts.push('\n' + parsed.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    return parts.join('\n');
  }

  throw new Error('Unsupported mime type: ' + mimeType);
}

async function structureWithClaude(text, filename) {
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: 'Document filename: ' + filename + '\n\n--- DOCUMENT CONTENT ---\n\n' + text,
        },
      ],
      system: STRUCTURING_PROMPT,
    }),
  });

  if (!response.ok) {
    var errBody = await response.text();
    throw new Error('API call failed (' + response.status + '): ' + errBody.substring(0, 200));
  }

  var data = await response.json();
  var content = (data.content || []).find(function(b) { return b.type === 'text'; });
  if (!content || !content.text) throw new Error('Empty response from structuring');

  // Parse JSON response
  var jsonText = content.text.trim();
  // Handle potential markdown code blocks
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  var articles = JSON.parse(jsonText);
  if (!Array.isArray(articles)) throw new Error('Response is not a JSON array');

  // Validate structure
  articles = articles.filter(function(a) {
    return a && typeof a.title === 'string' && a.title.trim() && typeof a.content === 'string' && a.content.trim();
  });

  return articles;
}
