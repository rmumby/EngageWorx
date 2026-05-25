// api/_lib/assemble-system-prompt.js — Build system prompt from structured fields
// Falls back to legacy system_prompt if no structured fields are populated.
// Used by wedding-concierge.js and build-system-prompt.js.

function assembleSystemPrompt(config) {
  if (!config) return null;

  // Check if ANY structured field is populated
  var hasStructured = config.ai_persona || config.ai_voice || config.ai_scope ||
    config.ai_escalation_instructions || config.ai_custom_instructions;

  if (!hasStructured) {
    // Fall back to legacy system_prompt
    return config.system_prompt || null;
  }

  var sections = [];

  // Identity / Persona
  if (config.ai_persona) {
    sections.push('ROLE\n' + config.ai_persona);
  }

  // Voice / Tone
  if (config.ai_voice) {
    sections.push('TONE\n' + config.ai_voice);
  }

  // Scope — what the AI can/can't do
  if (config.ai_scope) {
    sections.push('SCOPE\n' + config.ai_scope);
  }

  // Escalation instructions (complements DB-driven rules)
  if (config.ai_escalation_instructions) {
    sections.push('ESCALATION\n' + config.ai_escalation_instructions);
  }

  // Coordinator names the AI should recognise
  if (config.coordinator_names && config.coordinator_names.length > 0) {
    sections.push('COORDINATOR NAMES\nThe venue/team coordinators are: ' + config.coordinator_names.join(', ') + '. If the customer mentions these names or asks to speak with them, treat it as a request to connect with a real person.');
  }

  // Custom instructions (freeform)
  if (config.ai_custom_instructions) {
    sections.push('ADDITIONAL INSTRUCTIONS\n' + config.ai_custom_instructions);
  }

  return sections.join('\n\n');
}

module.exports = { assembleSystemPrompt: assembleSystemPrompt };
