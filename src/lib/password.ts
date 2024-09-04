import bcrypt from 'bcrypt';
import { config } from '../config.js';

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, config.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}
