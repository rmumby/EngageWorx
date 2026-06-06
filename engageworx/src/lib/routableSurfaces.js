// Surfaces the inbound email handler (api/email-inbound-concierge.js) can
// actually route to. Only these should show Reply Mode controls in the UI.
// Keep in sync with CONCIERGE_SURFACES in the handler until lane-routing lands.

var ROUTABLE_INBOUND_SURFACES = ['wedding_concierge', 'helpdesk'];

module.exports = { ROUTABLE_INBOUND_SURFACES: ROUTABLE_INBOUND_SURFACES };
