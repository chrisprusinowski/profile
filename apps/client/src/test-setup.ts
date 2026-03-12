import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (!('createObjectURL' in URL)) {
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:mock',
    writable: true
  });
}
if (!('revokeObjectURL' in URL)) {
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => undefined,
    writable: true
  });
}
