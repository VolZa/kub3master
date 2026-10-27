import { timestamp, addTime, invalid } from '../identity-contracts/validation';

/** Trusted scheduling port ONLY. No timer/runtime implementation is shipped here.
 * expires resolves at the deadline even when the read never settles; cancel releases resources.
 * A real adapter must be reviewed. A lying injected timer is not authenticated by this interface. */
export interface ReadDeadlinePort {
  start(deadlineAt: number): { readonly expires: Promise<void>; cancel(): void };
}
/** I/O wait budget only. Does not change any identity/grant/session TTL or commit semantics. */
export const AUTHORITATIVE_READ_TIMEOUT_MS = 5000;
export async function authoritativeRead<T>(deadline: ReadDeadlinePort, now: number, read: () => Promise<T>): Promise<T> {
  const end = deadline.start(addTime(timestamp(now), AUTHORITATIVE_READ_TIMEOUT_MS));
  try { return await Promise.race([read(), end.expires.then(() => invalid())]); }
  finally { end.cancel(); }
}
