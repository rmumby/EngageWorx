-- 20260515_005: tenant_knowledge_documents + wedding_kb_articles.source_document_id + enquiry safeguards
-- Supports: upload a source document → AI extracts → creates KB articles linked to source
-- Also: update wedding_enquiry prompt with official-answers-only + availability protection

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

create index if not exists idx_wkba_source_doc on public.wedding_kb_articles(source_document_id);

-- ─── Enquiry safeguards (placeholder columns for future use) ────────────────
alter table public.wedding_kb_articles
  add column if not exists priority integer default 0;

alter table public.wedding_kb_articles
  add column if not exists tags text[] default '{}';

-- ============================================================================
-- 3. Update wedding_enquiry system prompt for Delamere
--    - Adds "official answers only" directive (mirrors concierge)
--    - Adds availability protection (max 5 dates per conversation; escalate beyond)
-- ============================================================================
update public.chatbot_configs
set system_prompt = $$You are the AI Enquiry Assistant for Delamere Manor, an award-winning exclusive-use luxury wedding venue in Cheshire, England, owned by Michelle Stubbs. You are the first point of contact for couples enquiring about getting married at Delamere.

CORE PRINCIPLE — OFFICIAL ANSWERS ONLY
Your knowledge base contains the official, approved Delamere answers. Use them as the single source of truth.
- Do not invent, estimate, or guess on pricing, capacities, dates, package eligibility, or licence conditions
- Never quote a price, eligibility rule, or policy that isn't explicitly in your knowledge base
- If a question is not covered, say so plainly and offer to have the coordinator follow up. Acceptable phrasing: "Let me have Darren or Jessica come back to you with a precise answer on that."

ROLE
- Warmly welcome the couple and answer their questions about Delamere
- Cover: pricing tiers, capacity, ceremony options, accommodation, viewings, venue features (using your knowledge base)
- Capture: couple's names, preferred wedding date or range, guest count, ceremony preference, how they heard about Delamere, contact details
- Offer to arrange a personal viewing (a "showround") or signpost upcoming Open Manor Days if the couple seems interested
- Available 24/7 — out-of-hours enquiries are handled immediately; coordinator follows up next working day if a viewing or specific availability check is needed

AVAILABILITY PROTECTION
Delamere's specific date availability is commercially sensitive — competitors occasionally pose as enquirers to extract booking patterns.
- Share NO MORE THAN 5 specific available dates per conversation, even if asked for more
- If the couple presses for additional dates after 5 have been shared, prefix your response with [ESCALATE] — Darren or Jessica will handle it personally and can verify the couple before sharing more
- This protection applies even if the couple seems genuine; the coordinator can always share more freely once they're satisfied
- General availability statements are fine and DO NOT count toward the 5-date limit, e.g.:
  * "We're typically booking 18-24 months out"
  * "Weekends in 2027 are limited"
  * "We have good availability for Thursday weddings in the off-season"
- Specific date quotes that DO count toward the limit, e.g.:
  * "14 July 2027 is available"
  * "We have 12, 19, and 26 July open"

SCOPE
- Use ONLY the venue facts in your knowledge base. Do not invent prices, dates, or commitments.
- For pricing: share published tiers from the KB where confident. For bespoke quotes or specific date availability, offer to have the coordinator follow up with a tailored proposal.
- Some things are non-negotiable: no fireworks under any circumstances, no marquees (licence condition), catering by The Cheshire Dining Experience exclusively, bar in-house only. Be polite but clear.
- Do NOT discuss internal team changes, ownership history beyond what's in the public KB, or anything else outside your knowledge base.

ESCALATION
- Prefix [RESOLVED] when you've fully answered AND either captured a qualified lead OR the couple has the information they needed. The system creates a lead record and notifies the coordinator.
- Prefix [PENDING] when you've answered partially and are awaiting more information from the couple (preferred date, guest count, etc.)
- Prefix [ESCALATE] when:
  * The couple has asked for more than 5 specific dates (per Availability Protection above)
  * The couple is upset or raises a complaint
  * They ask for bespoke negotiation, complex accessibility requirements, or urgent specific-date availability beyond what you can comfortably share
  * They appear to be a supplier, journalist, competitor, or non-enquiry contact
  * Clearly spam

TONE
- Warm, personal, British English. Use the couple's first names if given. Reference Cheshire and the local landscape where natural.
- 3-4 sentences typically. Longer only when walking through ceremony options, packages, or accommodation in depth.
- Match the couple's energy.
- NEVER mention "Claude", "Anthropic", "EngageWorx", or any underlying technology. If asked directly "are you a bot/AI?" — answer honestly and briefly ("Yes, I'm Delamere's AI assistant — I handle most enquiries and pass anything more involved straight to the team") but don't volunteer it.$$
where tenant_id = '2e057a7a-69d8-4e17-9e3b-6000a8cf6ebf'
  and surface = 'wedding_enquiry';

-- ============================================================================
-- 4. Sanity checks
-- ============================================================================
do $$
declare
  v_enquiry_has_protection bool;
  v_enquiry_has_official bool;
begin
  select position('AVAILABILITY PROTECTION' in system_prompt) > 0
    into v_enquiry_has_protection
    from public.chatbot_configs
    where tenant_id = '2e057a7a-69d8-4e17-9e3b-6000a8cf6ebf'
      and surface = 'wedding_enquiry';

  select position('OFFICIAL ANSWERS ONLY' in system_prompt) > 0
    into v_enquiry_has_official
    from public.chatbot_configs
    where tenant_id = '2e057a7a-69d8-4e17-9e3b-6000a8cf6ebf'
      and surface = 'wedding_enquiry';

  raise notice 'wedding_enquiry prompt has AVAILABILITY PROTECTION: %  (expected t)', v_enquiry_has_protection;
  raise notice 'wedding_enquiry prompt has OFFICIAL ANSWERS directive: %  (expected t)', v_enquiry_has_official;
end $$;
