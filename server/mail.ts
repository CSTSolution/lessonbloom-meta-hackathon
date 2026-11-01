// Sign-in codes by email through CST's Brevo SMTP (the server's mail.env). Plain text, the code in
// the subject too (phones show it in the notification), never in a link. Without SMTP settings
// (local development) the code is printed to the server log instead.
import nodemailer from 'nodemailer';
import { config } from './config.ts';

// send: a plain-text note to the team (a new feedback, Chi #62); optional, so test mailers can leave it out
export interface Mailer { sendCode(to: string, code: string, lang: 'vi' | 'en'): Promise<void>; send?(to: string, subject: string, text: string): Promise<void> }

const TEXT = {
  vi: (c: string) => ({ subject: `Mã đăng nhập LessonBloom: ${c}`, text: `Mã đăng nhập LessonBloom của cô là ${c}.\nMã dùng được trong 10 phút.\n\nNếu cô không yêu cầu mã này, cô cứ bỏ qua email nhé.` }),
  en: (c: string) => ({ subject: `Your LessonBloom sign-in code: ${c}`, text: `Your LessonBloom sign-in code is ${c}.\nIt works for 10 minutes.\n\nIf you did not ask for it, you can ignore this email.` }),
};

export function smtpMailer(): Mailer {
  const m = config.mail;
  if (!m.host || !m.user || !m.key) {
    return {
      async sendCode(to, code) { console.log(`[mail] no SMTP configured: code for ${to.replace(/(.).*@/, '$1…@')} is ${code}`); },
      async send(_to, subject) { console.log(`[mail] no SMTP configured: not sent: ${subject}`); },
    };
  }
  const t = nodemailer.createTransport({ host: m.host, port: m.port, secure: false, auth: { user: m.user, pass: m.key } });
  return {
    async sendCode(to, code, lang) {
      await t.sendMail({ from: `"${m.fromName}" <${m.from}>`, to, ...TEXT[lang](code) });
    },
    async send(to, subject, text) { await t.sendMail({ from: `"${m.fromName}" <${m.from}>`, to, subject, text }); },
  };
}
