# B/D2 local Google login proof — Slice 2C.4.1

Local implementation of the identity-verification boundary of accepted ADR-050.
This module does not enroll users, authorize ERP operations, issue sessions, serve HTTP,
set cookies, sign broker assertions, or connect to GAS. `server.cjs` stays unchanged.

`bd2-login-proof.cjs` reuses `security.cjs:createGoogleVerifier` and its existing
`google-auth-library@11.3.1` dependency. The custom RSA verifier in
`../google-token-verifier.cjs` remains a legacy reference, not this component's verifier.
The shared `requireBrowserProof` helper is also used by the existing broker.
`IdentityPrototype`/`LoginBridgePrototype` remain unchanged: their synchronous verifier,
legacy broker and session-issuance composition are not the new backend profile.

## Explicit interfaces

- Configuration pins `KUB_ERP_SESSION_BD2_V1`, Google client ID, environment, application
  audience and expected Script ID. Explicit attempt TTL is 1..120000 ms (the existing
  broker's two-minute maximum); this is not the ERP session lifetime.
- `createGoogleLoginProofValidator` selects the real maintained Google verifier, with
  no certificate/client/verifier/fixture override. No production composition is enabled.
- `createLoginProofValidator` accepts an explicit trusted verification port for isolated
  composition; it must never be selected or supplied through a browser request.
- The attempt store uses the existing broker `createOnce`/conditional `transition`
  pattern. Slice 2C.4.2 adds the isolated Firestore SDK adapter; no production composition.
  See [durable attempt contract and evidence](DURABLE_LOGIN_ATTEMPTS.md).
  Map stores and certificate substitutions are test-only; emulator integration uses the real SDK.

## Local flow and failure boundary

1. `begin({browserProofHash})` binds the SHA-256 of a browser-owned 256-bit secret to
   server-generated attempt ID/nonce, captured context and a short deadline.
2. `verify({attemptId, browserProof, nonce, idToken})` checks the bound context/deadline/proof
   inside an atomic `NEW -> CONSUMED` transition. Unknown/conflict/unavailable denies.
   The public nonce from begin is echoed, hashed against `nonceHash`, then checked by
   the unchanged Google verifier. Raw nonce/proof/token are never persisted by the adapter.
3. Google verification runs outside any retried store callback. Signature, pinned
   audience, Google issuer, token expiry, subject and the attempt nonce must pass.
   The existing verifier also checks issued-at and authorized-party consistency.
4. Fresh time checks after awaited work reject expired attempts/tokens. The returned
   frozen local value has canonical `principal: {issuer, sub}`, context, attempt ID and
   verification/token-expiry times. It contains no Google token, ERP bearer or roles.

`CONSUMED` does not mean successful Google authentication. Failed/UNKNOWN verification
or a crash leaves an unusable attempt; no reset, replay or automatic retry is provided.
No result is returned on uncertainty. A later independent login needs a new attempt
and matching Google nonce. Read-only storage outcome lookup is now available;
resuming verification or issuing a session from lookup metadata remains forbidden.
The returned object is local verification data, not a serialized authorization capability
or evidence sufficient to open a gate. Manual enrollment/current permissions remain required.

## Evidence and limitations

Run with Node >=22 (required by the existing pinned library/package):

```text
node --test test/*.test.cjs
```

Tests use the real library's RSA signature verification with locally generated test keys
and test-only certificate retrieval. They prove no live Google login, real browser/CSRF
transport, Google key fetching/rotation, distributed persistence or trusted clock.
Local clock high-water validation is not cross-worker/restart evidence or a strict
commit-time guarantee. Atomic store semantics, retention, timeouts and crash recovery
still require acceptance. The complete browser transport and freshness contract remain
subject to review before integration.

ADR-049 stays PROPOSED. Legacy ISSUE_SESSION/ACCEPT_ASSERTION stay STRICT_COMMIT_TIME.
Gate B is BLOCKED BY MISSING DECISION; PO-01–PO-14 are OPEN. Remote admission and
business mutations are BLOCKED. PRODUCTION, ADMIN deployment and TEST_RESET are NO-GO.
