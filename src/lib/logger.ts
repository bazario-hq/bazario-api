import { pino } from 'pino';
import { config, isProd } from '../config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'bazario-api' },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword', 'req.body.refreshToken', 'req.body.payment'],
  ...(isProd || config.NODE_ENV === 'test'
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});
