/**
 * Placeholder contract for plugging in SSO providers later.
 *
 * @param {Object} options
 * @param {string} options.provider Provider ID (e.g. "okta", "google-workspace").
 * @param {Object} options.payload Raw provider callback payload.
 * @param {Object} options.hooks
 * @param {(payload: Object) => Promise<{externalId: string, email?: string, roles?: string[]}>} options.hooks.resolveIdentity
 * @param {(identity: {externalId: string, email?: string, roles?: string[]}) => Promise<Object>} options.hooks.upsertUser
 * @returns {Promise<Object>} Persisted user object from hooks.upsertUser.
 */
export async function runSsoHook({ provider, payload, hooks }) {
  if (!provider) throw new Error('provider is required');
  if (!payload) throw new Error('payload is required');
  if (!hooks?.resolveIdentity || !hooks?.upsertUser) {
    throw new Error('hooks.resolveIdentity and hooks.upsertUser are required');
  }

  const identity = await hooks.resolveIdentity(payload);
  return hooks.upsertUser({ ...identity, provider });
}
