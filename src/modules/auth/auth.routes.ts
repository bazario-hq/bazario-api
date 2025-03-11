import { Router } from 'express';
import { route } from '../../lib/route.js';
import { authService } from './auth.service.js';
import {
  AuthResponse,
  ChangePasswordBody,
  LoginBody,
  MeSchema,
  RefreshBody,
  SignupBody,
  UpdateMeBody,
} from './auth.schemas.js';

export const authRouter = Router();
const mount = '/auth';
const tags = ['Auth'];

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/signup',
    summary: 'Create a buyer account',
    tags,
    body: SignupBody,
    status: 201,
    responses: { 201: { description: 'Account created', schema: AuthResponse }, 409: { description: 'Email taken' } },
  },
  ({ body, req }) => authService.signup(body, req.get('user-agent') ?? null),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/login',
    summary: 'Log in with email and password',
    tags,
    body: LoginBody,
    responses: { 200: { description: 'Logged in', schema: AuthResponse }, 401: { description: 'Bad credentials' } },
  },
  ({ body, req }) => authService.login(body, req.get('user-agent') ?? null),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/refresh',
    summary: 'Exchange a refresh token for a new token pair',
    tags,
    body: RefreshBody,
    responses: { 200: { description: 'New tokens', schema: AuthResponse }, 401: { description: 'Invalid token' } },
  },
  ({ body, req }) => authService.refresh(body.refreshToken, req.get('user-agent') ?? null),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/logout',
    summary: 'Revoke a refresh token',
    tags,
    body: RefreshBody,
    responses: { 204: { description: 'Logged out' } },
  },
  async ({ body }) => {
    await authService.logout(body.refreshToken);
  },
);

route(
  authRouter,
  mount,
  {
    method: 'get',
    path: '/me',
    summary: 'Current user profile',
    tags,
    auth: 'required',
    responses: { 200: { description: 'Profile', schema: MeSchema } },
  },
  ({ user }) => authService.me(user.id),
);

route(
  authRouter,
  mount,
  {
    method: 'patch',
    path: '/me',
    summary: 'Update profile',
    tags,
    auth: 'required',
    body: UpdateMeBody,
    responses: { 200: { description: 'Profile', schema: MeSchema } },
  },
  ({ user, body }) => authService.updateMe(user.id, body),
);

route(
  authRouter,
  mount,
  {
    method: 'post',
    path: '/password',
    summary: 'Change password (signs out other sessions)',
    tags,
    auth: 'required',
    body: ChangePasswordBody,
    responses: { 204: { description: 'Password changed' } },
  },
  async ({ user, body }) => {
    await authService.changePassword(user.id, body);
  },
);
