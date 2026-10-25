/** No Web visitor identity is integrated in Slice 1. Execution identity never grants a role. */
export function adminApplicationStatus(): 'BLOCKED' { return 'BLOCKED'; }
export function requireAdminBusinessAccess(): never { throw Error('ACCESS_DENIED'); }
