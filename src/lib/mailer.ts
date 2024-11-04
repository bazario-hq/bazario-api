import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Messages sent with the JSON transport (no SMTP configured) are kept here so
// tests and local scripts can inspect them.
export const sentMail: MailMessage[] = [];

const transport = config.SMTP_HOST
  ? nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: false })
  : nodemailer.createTransport({ jsonTransport: true });

export async function sendMail(message: MailMessage): Promise<void> {
  await transport.sendMail({ from: config.MAIL_FROM, ...message });
  if (!config.SMTP_HOST) {
    sentMail.push(message);
    if (sentMail.length > 200) sentMail.shift();
  }
  logger.debug({ to: message.to, subject: message.subject }, 'mail sent');
}
