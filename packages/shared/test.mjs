import test from 'node:test';
import assert from 'node:assert/strict';
import { userSchema } from './dist/index.js';

test('user schema validates valid payloads', () => {
  const parsed = userSchema.parse({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Ada',
    email: 'ada@example.com'
  });

  assert.equal(parsed.name, 'Ada');
});
