/** Curated portable facade. No raw identity factory, catalogs, stores, fixture or production wiring. */
export { BD2_PROFILE } from './contracts';
export type { CanonicalPrincipal, Bd2Context, Bd2User, Bd2Session, CapturedSessionPolicy, SessionPolicyConfig } from './contracts';
export { validateCanonicalPrincipal, validateBd2Context, validateBd2User, validateBd2Session, validateSessionPolicyConfig } from './validation';
export { createPortablePermissionAdapter } from './portable-permission-adapter';
export type { TrustedBd2AuthorizationReader, PortablePermissionAdapter, PortablePermissionAdapterOptions } from './portable-permission-adapter';
