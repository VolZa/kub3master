'use strict';
const { createFirestoreSessionCreationIntentStore } = require('./firestore-session-creation-intent-store.cjs');

/** D2-F1 data-only orchestration, internal to Node test composition.
 * Even NEW confirms only Intent creation. No result can be consumed as a permit.
 * Trusted D1 consumption and any issuance boundary belong to reviewed D2-F2 work.
 */
function createSessionCreationCoordinator(options) {
  const store = createFirestoreSessionCreationIntentStore(options);
  return Object.freeze({
    createOriginal: command => store.createOriginal(command),
    lookupIntent: descriptor => store.lookupIntent(descriptor),
  });
}

module.exports = { createSessionCreationCoordinator };
