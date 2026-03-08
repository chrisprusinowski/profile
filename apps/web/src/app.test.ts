import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('web app', () => {
  it('serves health endpoint', async () => {
    const app = createApp();
    const response = await request(app).get('/health');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
