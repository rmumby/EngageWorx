import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ChatThread, ChatInput } from './chat';

/**
 * AIConfigBuilder — conversational AI-driven config builder.
 *
 * Props:
 *   configType         — string identifier (e.g. "escalation_rules")
 *   schema             — JSON schema the AI must produce
 *   systemPromptSlice  — feature-specific instructions appended to shell prompt
 *   initialConfig      — existing config for edit mode (null for new)
 *   initialNLDescription — existing NL description for edit mode (null for new)
 *   exampleGenerator   — (config) => [{input, will_trigger, behavior}]
 *   onSave             — async (nlSummary, structuredConfig) => void
 *   onCancel           — () => void
 *   tenantId           — required
 *   colors             — theme object { primary, accent, muted }
 */
export default function AIConfigBuilder({
  configType,
  schema,
  systemPromptSlice,
  initialConfig = null,
  initialNLDescription = null,
  exampleGenerator,
  onSave,
  onCancel,
  tenantId,
  colors = {},
}) {
  var primary = colors.primary || '#00C9FF';
  var accent = colors.accent || primary;
  var C = { primary: primary, accent: accent, muted: colors.muted || 'rgba(255,255,255,0.4)' };

  // Conversation state
  var [messages, setMessages] = useState(function () {
    var initial = [];
    if (initialConfig && initialNLDescription) {
      initial.push({
        role: 'user',
        content: 'I want to edit an existing configuration. Here is the current setup:\n\n' +
          initialNLDescription + '\n\nCurrent config: ' + JSON.stringify(initialConfig, null, 2),
      });
    }
    return initial;
  });
  var [inputValue, setInputValue] = useState('');
  var [isLoading, setIsLoading] = useState(false);
  var [error, setError] = useState(null);
  var [sessionId, setSessionId] = useState(null);
  var [lastResponse, setLastResponse] = useState(null);
  var [selectedOptions, setSelectedOptions] = useState([]);
  var [saving, setSaving] = useState(false);

  // Team members for recipient_picker
  var [teamMembers, setTeamMembers] = useState([]);
  var [selectedRecipients, setSelectedRecipients] = useState([]);
  var [showAddNew, setShowAddNew] = useState(false);
  var [newMemberForm, setNewMemberForm] = useState({ full_name: '', email: '', phone_number: '' });
  var [addingMember, setAddingMember] = useState(false);

  useEffect(function () {
    if (!tenantId) return;
    (async function () {
      try {
        var { data: members } = await supabase
          .from('tenant_members')
          .select('user_id, role, notify_email, notify_on_escalation')
          .eq('tenant_id', tenantId)
          .eq('status', 'active');
        if (!members || members.length === 0) { setTeamMembers([]); return; }
        var userIds = members.map(function (m) { return m.user_id; });
        var { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, phone_number')
          .in('id', userIds);
        var profileMap = {};
        (profiles || []).forEach(function (p) { profileMap[p.id] = p; });
        setTeamMembers(members.map(function (m) {
          var p = profileMap[m.user_id] || {};
          return {
            id: m.user_id,
            full_name: p.full_name || p.email || 'Unknown',
            email: m.notify_email || p.email || '',
            phone_number: p.phone_number || '',
            role: m.role,
            notify_on_escalation: m.notify_on_escalation,
          };
        }));
      } catch (e) {
        console.warn('[AIConfigBuilder] team members load error:', e.message);
      }
    })();
  }, [tenantId]);

  // Send a message to the AI config builder API
  var sendMessage = useCallback(async function (userContent) {
    if (!userContent.trim() || !tenantId || isLoading) return;
    setError(null);

    var userMsg = { role: 'user', content: userContent.trim() };
    var updatedMessages = messages.concat([userMsg]);
    setMessages(updatedMessages);
    setIsLoading(true);

    var session;
    try {
      var result = await supabase.auth.getSession();
      session = result.data.session;
    } catch (_) {}
    if (!session || !session.access_token) {
      setError('Not authenticated — please sign in');
      setIsLoading(false);
      return;
    }

    try {
      var res = await fetch('/api/ai-config-builder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          config_type: configType,
          messages: updatedMessages,
          system_prompt_slice: systemPromptSlice,
          schema: schema,
          session_id: sessionId,
        }),
      });

      if (!res.ok) {
        var errData;
        try { errData = await res.json(); } catch (_) { errData = {}; }
        throw new Error(errData.error || 'Request failed (' + res.status + ')');
      }

      var data = await res.json();
      if (data.session_id) setSessionId(data.session_id);

      var aiResponse = data.response;
      setLastResponse(aiResponse);
      setSelectedOptions([]);

      // Add assistant message
      setMessages(function (prev) {
        return prev.concat([{ role: 'assistant', content: JSON.stringify(aiResponse) }]);
      });
    } catch (err) {
      setError(err.message);
    }

    setIsLoading(false);
  }, [tenantId, messages, isLoading, configType, systemPromptSlice, schema, sessionId]);

  // Handle user input
  function handleSend() {
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue('');
  }

  // Handle expansion option toggle
  function toggleOption(opt) {
    setSelectedOptions(function (prev) {
      return prev.indexOf(opt) >= 0 ? prev.filter(function (o) { return o !== opt; }) : prev.concat([opt]);
    });
  }

  // Send selected expansion options
  function submitOptions(action) {
    var text;
    if (action === 'approve') {
      text = selectedOptions.length > 0
        ? 'I want these: ' + selectedOptions.join(', ')
        : 'Those all look good, include them all.';
    } else if (action === 'more') {
      text = 'Can you suggest more options?' + (selectedOptions.length > 0 ? ' I like: ' + selectedOptions.join(', ') : '');
    } else {
      text = 'None of these fit. Let me describe what I want differently.';
    }
    sendMessage(text);
  }

  // Handle proposal actions
  function handleProposalAction(action) {
    if (action === 'save') {
      handleSave();
    } else if (action === 'refine') {
      sendMessage('I want to refine this. Let me tell you what to change.');
    }
  }

  // Save final config
  async function handleSave() {
    if (!lastResponse || !lastResponse.config) return;
    setSaving(true);

    // If AI gave a proposal, ask it to finalize
    if (lastResponse.type === 'proposal') {
      await sendMessage('Looks good. Finalize this configuration.');
      // The onSave will be triggered when we get a "final" response back
      setSaving(false);
      return;
    }

    // If already final, save directly
    if (lastResponse.type === 'final' && onSave) {
      try {
        await onSave(lastResponse.nl_summary || '', lastResponse.config);
      } catch (err) {
        setError('Save failed: ' + err.message);
      }
    }
    setSaving(false);
  }

  // Auto-save when we receive a "final" response
  var prevLastResponse = useMemo(function () { return lastResponse; }, [lastResponse]);
  if (lastResponse && lastResponse.type === 'final' && lastResponse.config && !saving) {
    // Trigger save on next render cycle
    if (onSave && !error) {
      setSaving(true);
      onSave(lastResponse.nl_summary || '', lastResponse.config)
        .then(function () { setSaving(false); })
        .catch(function (err) { setError('Save failed: ' + err.message); setSaving(false); });
    }
  }

  // Parse AI messages for rich rendering
  function parseAIMessage(msg) {
    if (msg.role !== 'assistant') return null;
    try { return JSON.parse(msg.content); } catch (_) { return null; }
  }

  // Build thread messages for ChatThread (display layer)
  var threadMessages = useMemo(function () {
    return messages.map(function (m, i) {
      var parsed = m.role === 'assistant' ? parseAIMessage(m) : null;
      return {
        id: i,
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: parsed ? parsed.text : m.content,
        metadata: m.role === 'assistant' ? { botName: 'Config AI', avatar: '⚙️' } : {},
      };
    });
  }, [messages]);

  // Render expansion options (below the last message)
  function renderExpansion(response) {
    if (!response || response.type !== 'expansion' || !response.options) return null;
    return (
      <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {response.options.map(function (opt, i) {
            var isSelected = selectedOptions.indexOf(opt) >= 0;
            return (
              <button key={i} onClick={function () { toggleOption(opt); }} style={{
                background: isSelected ? primary + '22' : 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (isSelected ? primary + '55' : 'rgba(255,255,255,0.08)'),
                borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
                transition: 'all 0.15s',
              }}>
                <span style={{ marginRight: 8 }}>{isSelected ? '☑' : '☐'}</span>
                {opt}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={function () { submitOptions('approve'); }} style={actionBtn(primary)}>
            Approve{selectedOptions.length > 0 ? ' (' + selectedOptions.length + ')' : ''}
          </button>
          <button onClick={function () { submitOptions('more'); }} style={actionBtn('rgba(255,255,255,0.15)')}>
            Suggest more
          </button>
          <button onClick={function () { submitOptions('none'); }} style={actionBtn('rgba(255,255,255,0.08)')}>
            None of these
          </button>
        </div>
      </div>
    );
  }

  // Render proposal preview
  function renderProposal(response) {
    if (!response || (response.type !== 'proposal' && response.type !== 'final') || !response.config) return null;
    var examples = response.examples || [];
    if (examples.length === 0 && exampleGenerator) {
      try { examples = exampleGenerator(response.config); } catch (_) {}
    }

    return (
      <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Config preview */}
        <div style={{
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: 14, maxHeight: 200, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Structured Config
          </div>
          <pre style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(response.config, null, 2)}
          </pre>
        </div>

        {/* Examples */}
        {examples.length > 0 && (
          <div style={{
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Examples
            </div>
            {examples.map(function (ex, i) {
              return (
                <div key={i} style={{
                  padding: '8px 0', borderBottom: i < examples.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: ex.will_trigger ? '#00E676' : '#FF5252', fontWeight: 700, marginRight: 6 }}>
                      {ex.will_trigger ? '✓ Triggers' : '✗ No trigger'}
                    </span>
                    "{ex.input}"
                  </div>
                  {ex.behavior && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2, paddingLeft: 20 }}>
                      → {ex.behavior}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* NL Summary for final */}
        {response.type === 'final' && response.nl_summary && (
          <div style={{
            background: primary + '12', border: '1px solid ' + primary + '33',
            borderRadius: 10, padding: '10px 14px',
          }}>
            <div style={{ fontSize: 10, color: primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Summary
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{response.nl_summary}</div>
          </div>
        )}

        {/* Action buttons */}
        {response.type === 'proposal' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={function () { handleProposalAction('save'); }} disabled={saving} style={actionBtn(primary)}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            <button onClick={function () { handleProposalAction('refine'); }} style={actionBtn('rgba(255,255,255,0.15)')}>
              Refine
            </button>
          </div>
        )}

        {response.type === 'final' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saving ? (
              <span style={{ color: primary, fontSize: 13, fontWeight: 600 }}>Saving...</span>
            ) : (
              <span style={{ color: '#00E676', fontSize: 13, fontWeight: 600 }}>✓ Configuration saved</span>
            )}
          </div>
        )}
      </div>
    );
  }

  function actionBtn(bg) {
    return {
      background: bg, border: 'none', borderRadius: 8, padding: '8px 18px',
      color: bg === primary ? '#000' : '#fff', fontWeight: 700, cursor: 'pointer',
      fontSize: 12, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
    };
  }

  // ── Recipient picker ───────────────────────────────────────────────
  function toggleRecipient(member) {
    setSelectedRecipients(function (prev) {
      return prev.find(function (r) { return r.id === member.id; })
        ? prev.filter(function (r) { return r.id !== member.id; })
        : prev.concat([member]);
    });
  }

  async function handleAddNewMember() {
    if (!newMemberForm.full_name.trim()) return;
    if (!newMemberForm.email.trim() && !newMemberForm.phone_number.trim()) return;
    setAddingMember(true);
    try {
      var session = (await supabase.auth.getSession()).data.session;
      var res = await fetch('/api/team-members/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({
          tenant_id: tenantId,
          full_name: newMemberForm.full_name.trim(),
          email: newMemberForm.email.trim(),
          phone_number: newMemberForm.phone_number.trim(),
          notify_channels: [
            newMemberForm.email.trim() ? 'email' : null,
            newMemberForm.phone_number.trim() ? 'sms' : null,
          ].filter(Boolean),
        }),
      });
      if (!res.ok) { var d = await res.json(); throw new Error(d.error || 'Failed'); }
      var data = await res.json();
      var newMember = {
        id: data.member.id,
        full_name: data.member.full_name,
        email: data.member.email || '',
        phone_number: data.member.phone_number || '',
        role: 'notification_only',
        notify_on_escalation: true,
      };
      setTeamMembers(function (prev) { return prev.concat([newMember]); });
      setSelectedRecipients(function (prev) { return prev.concat([newMember]); });
      setShowAddNew(false);
      setNewMemberForm({ full_name: '', email: '', phone_number: '' });
    } catch (err) {
      setError('Add member failed: ' + err.message);
    }
    setAddingMember(false);
  }

  function submitRecipientSelection() {
    if (selectedRecipients.length === 0) return;
    var desc = selectedRecipients.map(function (r) {
      var channels = [];
      if (r.email) channels.push('email: ' + r.email);
      if (r.phone_number) channels.push('SMS: ' + r.phone_number);
      return r.full_name + ' (' + (channels.join(', ') || 'no contact info') + ')';
    }).join('; ');
    sendMessage('Route notifications to: ' + desc);
    setSelectedRecipients([]);
  }

  function renderRecipientPicker() {
    return (
      <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Select team members to notify
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
          {teamMembers.map(function (m) {
            var isSelected = selectedRecipients.find(function (r) { return r.id === m.id; });
            return (
              <button key={m.id} onClick={function () { toggleRecipient(m); }} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                background: isSelected ? primary + '18' : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (isSelected ? primary + '44' : 'rgba(255,255,255,0.06)'),
                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
              }}>
                <span style={{ color: isSelected ? primary : 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                  {isSelected ? '☑' : '☐'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{m.full_name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                    {m.role === 'notification_only' ? '🔔 Notification only' : m.role}
                    {m.email ? ' · ' + m.email : ''}
                    {m.phone_number ? ' · ' + m.phone_number : ''}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Add someone new */}
          {!showAddNew ? (
            <button onClick={function () { setShowAddNew(true); }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 8, cursor: 'pointer', color: primary, fontSize: 13,
              fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            }}>
              + Add someone new
            </button>
          ) : (
            <div style={{
              padding: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <input
                value={newMemberForm.full_name}
                onChange={function (e) { setNewMemberForm(Object.assign({}, newMemberForm, { full_name: e.target.value })); }}
                placeholder="Full name *"
                style={pickerInput}
              />
              <input
                value={newMemberForm.email}
                onChange={function (e) { setNewMemberForm(Object.assign({}, newMemberForm, { email: e.target.value })); }}
                placeholder="Email"
                style={pickerInput}
              />
              <input
                value={newMemberForm.phone_number}
                onChange={function (e) { setNewMemberForm(Object.assign({}, newMemberForm, { phone_number: e.target.value })); }}
                placeholder="Phone number"
                style={pickerInput}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddNewMember} disabled={addingMember || !newMemberForm.full_name.trim()} style={actionBtn(primary)}>
                  {addingMember ? 'Adding...' : 'Add'}
                </button>
                <button onClick={function () { setShowAddNew(false); }} style={actionBtn('rgba(255,255,255,0.08)')}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Confirm selection */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={submitRecipientSelection} disabled={selectedRecipients.length === 0} style={{
            ...actionBtn(primary),
            opacity: selectedRecipients.length === 0 ? 0.4 : 1,
            cursor: selectedRecipients.length === 0 ? 'not-allowed' : 'pointer',
          }}>
            Confirm ({selectedRecipients.length})
          </button>
        </div>
      </div>
    );
  }

  var pickerInput = {
    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 12,
    fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box',
  };

  // Determine what rich UI to show below the thread
  var richUI = null;
  if (lastResponse && !isLoading) {
    if (lastResponse.type === 'expansion') richUI = renderExpansion(lastResponse);
    if (lastResponse.type === 'proposal' || lastResponse.type === 'final') richUI = renderProposal(lastResponse);
    if (lastResponse.type === 'recipient_picker') richUI = renderRecipientPicker();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>⚙️ AI Config Builder</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginLeft: 10 }}>{configType}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {messages.length > 0 && (
            <button onClick={function () {
              setMessages([]);
              setLastResponse(null);
              setSessionId(null);
              setError(null);
              setSelectedOptions([]);
            }} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '4px 12px', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif",
            }}>
              Start Over
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '4px 12px', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif",
            }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '8px 20px', background: 'rgba(255,59,48,0.1)',
          borderBottom: '1px solid rgba(255,59,48,0.2)', color: '#FF3B30', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Chat thread */}
      <ChatThread
        messages={threadMessages}
        isTyping={isLoading}
        typingAvatar="⚙️"
        colors={C}
        botName="Config AI"
        showAvatars={true}
        maxWidth="80%"
        emptyState={
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⚙️</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              {initialConfig ? 'Edit Configuration' : 'New Configuration'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
              Describe what you want in plain English. I'll ask clarifying questions and build a structured config for you.
            </div>
          </div>
        }
      />

      {/* Rich UI (expansion options, proposal preview) */}
      {richUI}

      {/* Input */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          placeholder={
            lastResponse && lastResponse.type === 'final'
              ? 'Configuration saved. Type to make changes, or close.'
              : 'Describe what you want...'
          }
          submitMode="enter"
          rows={1}
          disabled={isLoading}
          colors={C}
        />
      </div>
    </div>
  );
}
