import { isRole, type Role, type User, type UserRepository } from './permission-service';
export interface DirectoryUser extends User { email: string }
export interface PropertyReader { getProperty(key: string): string | null }
/** Read-only adapter port for ScriptProperties; no GAS access at module load or real records supplied. */
export class PropertyUserRepository implements UserRepository {
  constructor(private readonly properties: PropertyReader) {}
  find(issuer: string, subject: string): Readonly<DirectoryUser> | undefined {
    const fail = (): never => { throw new Error('ACCESS_DENIED'); };
    try {
      const raw = this.properties.getProperty('KUB_SECURITY_USERS_V1');
      if (!raw) return undefined;
      const doc = JSON.parse(raw);
      if (doc.version !== 1 || !Array.isArray(doc.users) || doc.users.length > 20) return fail();
      const keys = new Set<string>(); let found: DirectoryUser | undefined;
      for (const row of doc.users) {
        if (!row || row.issuer !== 'https://accounts.google.com' || typeof row.subject !== 'string' || !row.subject ||
          typeof row.email !== 'string' || typeof row.active !== 'boolean' || !Array.isArray(row.roles) ||
          !row.roles.every(isRole) ||
          new Set(row.roles).size !== row.roles.length || !Number.isSafeInteger(row.authorizationVersion) || row.authorizationVersion < 0) return fail();
        const key = JSON.stringify([row.issuer, row.subject]);
        if (keys.has(key)) return fail(); keys.add(key);
        if (row.issuer === issuer && row.subject === subject) found = Object.freeze({ issuer: row.issuer, subject: row.subject,
          email: row.email, active: row.active, roles: Object.freeze([...row.roles]) as readonly Role[], authorizationVersion: row.authorizationVersion });
      }
      return found;
    } catch { return fail(); }
  }
}
