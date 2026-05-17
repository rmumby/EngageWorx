-- 20260515_005: tenant_knowledge_documents + wedding_kb_articles.source_document_id + surfaces
-- Supports: upload a source document → AI extracts → creates KB articles linked to source

-- ─── tenant_knowledge_documents ─────────────────────────────────────────────
create table if not exists public.tenant_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  filename text not null,
  file_path text not null,
  file_size integer not null,
  mime_type text not null,
  surfaces text[] not null default '{}',

  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'processed', 'failed', 'archived')),
  error_message text,
  article_count integer default 0,

  uploaded_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tkd_tenant on public.tenant_knowledge_documents(tenant_id, status);

alter table public.tenant_knowledge_documents enable row level security;

create policy "tenant members manage own kb docs"
  on public.tenant_knowledge_documents for all
  using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and status = 'active'
    )
  )
  with check (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- ─── Extend wedding_kb_articles ─────────────────────────────────────────────
alter table public.wedding_kb_articles
  add column if not exists source_document_id uuid references public.tenant_knowledge_documents(id) on delete set null;

alter table public.wedding_kb_articles
  add column if not exists surface text not null default 'concierge'
  check (surface in ('concierge', 'enquiry', 'supplier'));

create index if not exists idx_wkba_source_doc on public.wedding_kb_articles(source_document_id);
create index if not exists idx_wkba_surface on public.wedding_kb_articles(tenant_id, surface, is_published);

-- ─── Enquiry safeguards (placeholder columns for future use) ────────────────
alter table public.wedding_kb_articles
  add column if not exists priority integer default 0;

alter table public.wedding_kb_articles
  add column if not exists tags text[] default '{}';
