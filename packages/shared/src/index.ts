import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email()
});

export type UserDto = z.infer<typeof userSchema>;

export const healthSchema = z.object({
  status: z.literal('ok')
});

export type HealthDto = z.infer<typeof healthSchema>;
