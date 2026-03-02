import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const mockCheckDatabaseHealth = vi.fn();

vi.mock('./db.js', () => ({
  checkDatabaseHealth: mockCheckDatabaseHealth
}));

describe('createApp', async () => {
  const { createApp } = await import('./app.js');

  it('returns a healthy response when DB is connected', async () => {
    mockCheckDatabaseHealth.mockResolvedValueOnce(true);
    const app = createApp();
    const response = await request(app).get('/health');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok', dbConnected: true });
  });
});
