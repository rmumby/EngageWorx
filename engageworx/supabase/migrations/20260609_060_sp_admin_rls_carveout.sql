-- Migration: SP-admin carve-out for tenant-scoped RLS (view-as-tenant)
-- Generated 2026-06-09 from live policy definitions (project cnqasinqnjwrlfrquvbo).
--
-- Adds `is_sp_admin(auth.uid()) OR (<existing clause>)` to every membership-gated
-- policy on the 41 remaining tenant tables. ADDITIVE ONLY: never widens access for
-- non-SP users; existing role-gating, status filters, casts and parent-walks are
-- preserved verbatim. Companion to the earlier `sequences` fix and the
-- `platform_updates` pattern.
--
-- Scope: only policies that gate on tenant_members are rewritten. Service-role and
-- non-membership policies are left untouched. The child tables (agent_activity,
-- call_messages, commissions, conversation_messages, referrals, ticket_messages,
-- ticket_watchers) get the SP carve-out but STILL carry the separate SECURITY DEFINER
-- parent-walk hardening tracked on the backlog -- this migration does not address that.

BEGIN;

DROP POLICY IF EXISTS "Tenant members read tenant action items" ON public.action_items;
CREATE POLICY "Tenant members read tenant action items" ON public.action_items
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS agent_activity_tenant_access ON public.agent_activity;
CREATE POLICY agent_activity_tenant_access ON public.agent_activity
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM (support_tickets t
     JOIN tenant_members tm ON ((tm.tenant_id = t.tenant_id)))
  WHERE ((t.id = agent_activity.ticket_id) AND (tm.user_id = auth.uid()))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM (support_tickets t
     JOIN tenant_members tm ON ((tm.tenant_id = t.tenant_id)))
  WHERE ((t.id = agent_activity.ticket_id) AND (tm.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Tenant members can read own sessions" ON public.ai_config_sessions;
CREATE POLICY "Tenant members can read own sessions" ON public.ai_config_sessions
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own ai usage" ON public.ai_usage_log;
CREATE POLICY "Members can read own ai usage" ON public.ai_usage_log
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Access call_messages via calls" ON public.call_messages;
CREATE POLICY "Access call_messages via calls" ON public.call_messages
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((call_id IN ( SELECT calls.id
   FROM calls
  WHERE (calls.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid())))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((call_id IN ( SELECT calls.id
   FROM calls
  WHERE (calls.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid())))))));

DROP POLICY IF EXISTS "Superadmins full access calls" ON public.calls;
CREATE POLICY "Superadmins full access calls" ON public.calls
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text))))));

DROP POLICY IF EXISTS "Tenant access calls" ON public.calls;
CREATE POLICY "Tenant access calls" ON public.calls
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));

DROP POLICY IF EXISTS commissions_referrer_read ON public.commissions;
CREATE POLICY commissions_referrer_read ON public.commissions
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM (referrals r
     JOIN tenant_members tm ON ((tm.tenant_id = r.referrer_id)))
  WHERE ((r.id = commissions.referral_id) AND (tm.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Members can modify own companies" ON public.companies;
CREATE POLICY "Members can modify own companies" ON public.companies
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own companies" ON public.companies;
CREATE POLICY "Members can read own companies" ON public.companies
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS conversation_messages_tenant_access ON public.conversation_messages;
CREATE POLICY conversation_messages_tenant_access ON public.conversation_messages
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM (conversations c
     JOIN tenant_members tm ON ((tm.tenant_id = c.tenant_id)))
  WHERE ((c.id = conversation_messages.conversation_id) AND (tm.user_id = auth.uid()))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM (conversations c
     JOIN tenant_members tm ON ((tm.tenant_id = c.tenant_id)))
  WHERE ((c.id = conversation_messages.conversation_id) AND (tm.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Tenant admins insert training examples" ON public.conversation_training_examples;
CREATE POLICY "Tenant admins insert training examples" ON public.conversation_training_examples
  FOR INSERT TO public
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))));

DROP POLICY IF EXISTS "Tenant members read own training examples" ON public.conversation_training_examples;
CREATE POLICY "Tenant members read own training examples" ON public.conversation_training_examples
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Tenant admins update training examples" ON public.conversation_training_examples;
CREATE POLICY "Tenant admins update training examples" ON public.conversation_training_examples
  FOR UPDATE TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))));

DROP POLICY IF EXISTS "Members can read own email actions" ON public.email_actions;
CREATE POLICY "Members can read own email actions" ON public.email_actions
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS escalation_rules_tenant_isolation ON public.escalation_rules;
CREATE POLICY escalation_rules_tenant_isolation ON public.escalation_rules
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Members can modify own canned responses" ON public.helpdesk_canned_responses;
CREATE POLICY "Members can modify own canned responses" ON public.helpdesk_canned_responses
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own canned responses" ON public.helpdesk_canned_responses;
CREATE POLICY "Members can read own canned responses" ON public.helpdesk_canned_responses
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS kb_articles_access ON public.helpdesk_kb_articles;
CREATE POLICY kb_articles_access ON public.helpdesk_kb_articles
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id IS NULL) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR (((tenant_id IS NULL) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "tenant members read own classifications" ON public.inbound_email_classifications;
CREATE POLICY "tenant members read own classifications" ON public.inbound_email_classifications
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Tenant members read own inbound email messages" ON public.inbound_email_messages;
CREATE POLICY "Tenant members read own inbound email messages" ON public.inbound_email_messages
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can modify own integrations" ON public.integrations;
CREATE POLICY "Members can modify own integrations" ON public.integrations
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own integrations" ON public.integrations;
CREATE POLICY "Members can read own integrations" ON public.integrations
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can modify own knowledge base" ON public.knowledge_base;
CREATE POLICY "Members can modify own knowledge base" ON public.knowledge_base
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own knowledge base" ON public.knowledge_base;
CREATE POLICY "Members can read own knowledge base" ON public.knowledge_base
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can modify own lead sequences" ON public.lead_sequences;
CREATE POLICY "Members can modify own lead sequences" ON public.lead_sequences
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own lead sequences" ON public.lead_sequences;
CREATE POLICY "Members can read own lead sequences" ON public.lead_sequences
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Tenant members delete own leads" ON public.leads;
CREATE POLICY "Tenant members delete own leads" ON public.leads
  FOR DELETE TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superadmin'::text)))))));

DROP POLICY IF EXISTS "Tenant members write own leads" ON public.leads;
CREATE POLICY "Tenant members write own leads" ON public.leads
  FOR INSERT TO public
  WITH CHECK (is_sp_admin(auth.uid()) OR (((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superadmin'::text)))))));

DROP POLICY IF EXISTS "Tenant members read own leads" ON public.leads;
CREATE POLICY "Tenant members read own leads" ON public.leads
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superadmin'::text)))))));

DROP POLICY IF EXISTS "Tenant members update own leads" ON public.leads;
CREATE POLICY "Tenant members update own leads" ON public.leads
  FOR UPDATE TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superadmin'::text)))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR (((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superadmin'::text)))))));

DROP POLICY IF EXISTS "Tenant admins can write pipeline_stages" ON public.pipeline_stages;
CREATE POLICY "Tenant admins can write pipeline_stages" ON public.pipeline_stages
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));

DROP POLICY IF EXISTS "Tenant admins modify own pipeline stages" ON public.pipeline_stages;
CREATE POLICY "Tenant admins modify own pipeline stages" ON public.pipeline_stages
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))));

DROP POLICY IF EXISTS "Pipeline stages read access" ON public.pipeline_stages;
CREATE POLICY "Pipeline stages read access" ON public.pipeline_stages
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'superadmin'::text)))))));

DROP POLICY IF EXISTS "Members can read own plan changes" ON public.plan_changes;
CREATE POLICY "Members can read own plan changes" ON public.plan_changes
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Admins can modify poland configs" ON public.poland_carrier_configs;
CREATE POLICY "Admins can modify poland configs" ON public.poland_carrier_configs
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))));

DROP POLICY IF EXISTS "Admins can read poland configs" ON public.poland_carrier_configs;
CREATE POLICY "Admins can read poland configs" ON public.poland_carrier_configs
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))));

DROP POLICY IF EXISTS referrals_referrer_read ON public.referrals;
CREATE POLICY referrals_referrer_read ON public.referrals
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.tenant_id = referrals.referrer_id))))));

DROP POLICY IF EXISTS "Admins can modify own sp settings" ON public.sp_settings;
CREATE POLICY "Admins can modify own sp settings" ON public.sp_settings
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))));

DROP POLICY IF EXISTS "Members can read own sp settings" ON public.sp_settings;
CREATE POLICY "Members can read own sp settings" ON public.sp_settings
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS tickets_tenant_access ON public.support_tickets;
CREATE POLICY tickets_tenant_access ON public.support_tickets
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Members can modify own support triage" ON public.support_triage;
CREATE POLICY "Members can modify own support triage" ON public.support_triage
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own support triage" ON public.support_triage;
CREATE POLICY "Members can read own support triage" ON public.support_triage
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Members can read own tcr templates" ON public.tcr_approved_templates;
CREATE POLICY "Members can read own tcr templates" ON public.tcr_approved_templates
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Admins can modify own tcr submissions" ON public.tcr_submissions;
CREATE POLICY "Admins can modify own tcr submissions" ON public.tcr_submissions
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))));

DROP POLICY IF EXISTS "Members can read own tcr submissions" ON public.tcr_submissions;
CREATE POLICY "Members can read own tcr submissions" ON public.tcr_submissions
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Tenant members access own wizard sessions" ON public.tcr_wizard_sessions;
CREATE POLICY "Tenant members access own wizard sessions" ON public.tcr_wizard_sessions
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Tenant members read own notifications" ON public.tenant_admin_notifications;
CREATE POLICY "Tenant members read own notifications" ON public.tenant_admin_notifications
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS tenant_ai_surfaces_read ON public.tenant_ai_surfaces;
CREATE POLICY tenant_ai_surfaces_read ON public.tenant_ai_surfaces
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.role = ANY (ARRAY['superadmin'::text, 'super_admin'::text, 'sp_admin'::text]))))))));

DROP POLICY IF EXISTS "Admins can modify own branding" ON public.tenant_branding;
CREATE POLICY "Admins can modify own branding" ON public.tenant_branding
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id)::uuid IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR (((tenant_id)::uuid IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))));

DROP POLICY IF EXISTS "Members can read own branding" ON public.tenant_branding;
CREATE POLICY "Members can read own branding" ON public.tenant_branding
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR (((tenant_id)::uuid IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "tenant members manage own filter settings" ON public.tenant_inbound_filter_settings;
CREATE POLICY "tenant members manage own filter settings" ON public.tenant_inbound_filter_settings
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS ticket_messages_access ON public.ticket_messages;
CREATE POLICY ticket_messages_access ON public.ticket_messages
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((ticket_id IN ( SELECT support_tickets.id
   FROM support_tickets
  WHERE (support_tickets.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid())))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((ticket_id IN ( SELECT support_tickets.id
   FROM support_tickets
  WHERE (support_tickets.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid())))))));

DROP POLICY IF EXISTS ticket_watchers_self_insert ON public.ticket_watchers;
CREATE POLICY ticket_watchers_self_insert ON public.ticket_watchers
  FOR INSERT TO public
  WITH CHECK (is_sp_admin(auth.uid()) OR (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (support_tickets t
     JOIN tenant_members tm ON ((tm.tenant_id = t.tenant_id)))
  WHERE ((t.id = ticket_watchers.ticket_id) AND (tm.user_id = auth.uid())))))));

DROP POLICY IF EXISTS ticket_watchers_tenant_read ON public.ticket_watchers;
CREATE POLICY ticket_watchers_tenant_read ON public.ticket_watchers
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((EXISTS ( SELECT 1
   FROM (support_tickets t
     JOIN tenant_members tm ON ((tm.tenant_id = t.tenant_id)))
  WHERE ((t.id = ticket_watchers.ticket_id) AND (tm.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Members can read own usage alerts" ON public.usage_alerts;
CREATE POLICY "Members can read own usage alerts" ON public.usage_alerts
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text))))));

DROP POLICY IF EXISTS "Tenants can read own usage" ON public.usage_metering;
CREATE POLICY "Tenants can read own usage" ON public.usage_metering
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Tenants can read own topups" ON public.usage_topups;
CREATE POLICY "Tenants can read own topups" ON public.usage_topups
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Tenant admins read team preferences" ON public.user_notification_preferences;
CREATE POLICY "Tenant admins read team preferences" ON public.user_notification_preferences
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))))));

DROP POLICY IF EXISTS "Admins can modify users" ON public.users;
CREATE POLICY "Admins can modify users" ON public.users
  FOR ALL TO public
  USING (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))))
  WITH CHECK (is_sp_admin(auth.uid()) OR ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text])))))));

DROP POLICY IF EXISTS "Users can read own row or tenant peers" ON public.users;
CREATE POLICY "Users can read own row or tenant peers" ON public.users
  FOR SELECT TO public
  USING (is_sp_admin(auth.uid()) OR (((id = auth.uid()) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.status = 'active'::text)))))));

COMMIT;
