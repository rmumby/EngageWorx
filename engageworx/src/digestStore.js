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
};

export default DigestStore;
