import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';

export const SignupBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
});

export const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshBody = z.object({ refreshToken: z.string().min(10) });

export const MeSchema = registry.register(
  'Me',
  z.object({
    id: z.number().int(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['buyer', 'seller', 'admin']),
    createdAt: z.string(),
    seller: z
      .object({
        id: z.number().int(),
        storeName: z.string(),
        slug: z.string(),
        status: z.enum(['pending', 'active', 'suspended']),
      })
      .nullable(),
  }),
);

export const AuthResponse = registry.register(
  'AuthResponse',
  z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.string(),
    user: MeSchema,
  }),
);
