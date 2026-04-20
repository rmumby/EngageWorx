// src/digestStore.js
// Singleton store for EmailDigest mutable state — lives outside React,
// immune to re-renders, remounts, and parent state management.

var DigestStore = {
  fuDrafts: {},       // { contactId: { draft, channel, generated } }
  vipOverrides: {},   // { contactId: { vip_followup_at, ... } }
  vipCards: [],       // full VIP card objects (survive remount)
  fuCards: [],        // full followup card objects (survive remount)

  setDraft: function(contactId, data) {
    this.fuDrafts[contactId] = data;
  },
  getDraft: function(contactId) {
    return this.fuDrafts[contactId] || null;
  },
  clearDraft: function(contactId) {
    delete this.fuDrafts[contactId];
  },

  setVipOverride: function(contactId, data) {
    this.vipOverrides[contactId] = Object.assign(this.vipOverrides[contactId] || {}, data);
  },
  getVipOverride: function(contactId) {
    return this.vipOverrides[contactId] || null;
  },

  saveVipCards: function(cards) { this.vipCards = cards; },
  getVipCards: function() { return this.vipCards; },

  saveFuCards: function(cards) { this.fuCards = cards; },
  getFuCards: function() { return this.fuCards; },

  // Dismissed follow-up contact IDs (persisted to localStorage)
  _dismissedKey: 'engwx_dismissed_followups',
  getDismissed: function(tenantId) {
    try { var raw = localStorage.getItem(this._dismissedKey + '_' + tenantId); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  },
  dismiss: function(tenantId, contactId) {
    var list = this.getDismissed(tenantId);
    if (list.indexOf(contactId) === -1) list.push(contactId);
    try { localStorage.setItem(this._dismissedKey + '_' + tenantId, JSON.stringify(list)); } catch (e) {}
  },
  undismiss: function(tenantId, contactId) {
    var list = this.getDismissed(tenantId).filter(function(id) { return id !== contactId; });
    try { localStorage.setItem(this._dismissedKey + '_' + tenantId, JSON.stringify(list)); } catch (e) {}
  },
  resetDismissed: function(tenantId) {
    try { localStorage.removeItem(this._dismissedKey + '_' + tenantId); } catch (e) {}
  },
  isDismissed: function(tenantId, contactId) {
    return this.getDismissed(tenantId).indexOf(contactId) > -1;
  },
};

export default DigestStore;
