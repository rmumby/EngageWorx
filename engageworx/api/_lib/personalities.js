// api/_lib/personalities.js — Shared personality presets for AI chatbot
// Used by: frontend (AIChatbot.js), backend (build-system-prompt.js)

var PERSONALITIES = [
  { id: 'professional', name: 'Professional', icon: '👔', desc: 'Formal, business-appropriate tone', temperature: 0.3, tone_instruction: 'Respond in a clear, professional tone. Stay focused and businesslike. Avoid slang or casual expressions.' },
  { id: 'friendly', name: 'Friendly', icon: '😊', desc: 'Warm, conversational, approachable', temperature: 0.6, tone_instruction: 'Respond in a warm, conversational tone. Use everyday language and feel free to be personable. Light emoji use is fine.' },
  { id: 'concise', name: 'Concise', icon: '⚡', desc: 'Brief, direct, efficient responses', temperature: 0.2, tone_instruction: 'Keep responses brief and to the point. Avoid elaboration unless asked. One to two sentences per reply when possible.' },
  { id: 'empathetic', name: 'Empathetic', icon: '💙', desc: 'Understanding, supportive, patient', temperature: 0.5, tone_instruction: 'Respond with empathy and patience. Acknowledge the person\'s feelings before solving their problem. Take a supportive, unhurried tone.' },
  { id: 'sales', name: 'Sales-Driven', icon: '🎯', desc: 'Persuasive, benefit-focused, conversion-oriented', temperature: 0.7, tone_instruction: 'Respond in a persuasive, benefit-focused tone. Highlight value, create urgency where appropriate, and guide toward conversion. Be enthusiastic but not pushy.' },
  { id: 'technical', name: 'Technical', icon: '🔧', desc: 'Detailed, precise, documentation-style', temperature: 0.2, tone_instruction: 'Be precise and technical. Use industry terminology where appropriate. Provide step-by-step instructions and reference specifics.' },
];

function getPersonality(id) {
  return PERSONALITIES.find(function(p) { return p.id === id; }) || null;
}

module.exports = { PERSONALITIES: PERSONALITIES, getPersonality: getPersonality };
