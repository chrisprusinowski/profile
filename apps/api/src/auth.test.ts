import { describe, expect, it } from 'vitest';

describe('getEffectiveManagerScope', () => {
  it('falls back to user email when manager scope email is not configured', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/test';
    const { getEffectiveManagerScope } = await import('./auth.js');

    const user = {
      email: 'Manager.One@Demo.com',
      role: 'manager' as const,
      managerName: 'Manager One',
      managerEmail: null,
      isActive: true
    };

    expect(getEffectiveManagerScope(user)).toEqual({
      managerName: 'Manager One',
      managerEmail: 'manager.one@demo.com'
    });
  });

  it('keeps explicit manager scope email when configured', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/test';
    const { getEffectiveManagerScope } = await import('./auth.js');

    const user = {
      email: 'manager@demo.com',
      role: 'manager' as const,
      managerName: null,
      managerEmail: 'scope@demo.com',
      isActive: true
    };

    expect(getEffectiveManagerScope(user)).toEqual({
      managerName: null,
      managerEmail: 'scope@demo.com'
    });
  });
});
