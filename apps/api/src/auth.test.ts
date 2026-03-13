import { describe, expect, it } from 'vitest';

describe('getEffectiveExecutiveScope', () => {
  it('falls back to user email when executive scope email is not configured', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/test';
    const { getEffectiveExecutiveScope } = await import('./auth.js');

    const user = {
      email: 'Executive.One@Demo.com',
      role: 'executive' as const,
      executiveName: 'Executive One',
      executiveEmail: null,
      isActive: true
    };

    expect(getEffectiveExecutiveScope(user)).toEqual({
      executiveEmail: 'executive.one@demo.com'
    });
  });

  it('keeps explicit executive scope email when configured', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/test';
    const { getEffectiveExecutiveScope } = await import('./auth.js');

    const user = {
      email: 'executive@demo.com',
      role: 'executive' as const,
      executiveName: null,
      executiveEmail: 'scope@demo.com',
      isActive: true
    };

    expect(getEffectiveExecutiveScope(user)).toEqual({
      executiveEmail: 'scope@demo.com'
    });
  });
});
