import nodemailer, { type Transporter } from "nodemailer";
import type { RenderedMessage } from "./template.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/** Leser SMTP-oppsett fra miljøet. Returnerer undefined hvis ikke satt opp. */
export function loadSmtp(): SmtpConfig | undefined {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return undefined;
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    user: SMTP_USER,
    pass: SMTP_PASS,
  };
}

export class Sender {
  private transport: Transporter | undefined;

  constructor(private smtp: SmtpConfig | undefined) {}

  private getTransport(): Transporter {
    if (!this.smtp) {
      throw new Error(
        "SMTP er ikke konfigurert. Sett SMTP_HOST, SMTP_USER og SMTP_PASS i .env " +
          "(for Gmail: smtp.gmail.com + et app-passord).",
      );
    }
    if (!this.transport) {
      this.transport = nodemailer.createTransport({
        host: this.smtp.host,
        port: this.smtp.port,
        secure: this.smtp.port === 465,
        auth: { user: this.smtp.user, pass: this.smtp.pass },
      });
    }
    return this.transport;
  }

  /**
   * Sender én melding. Ved dryRun gjøres ingenting reelt – kun logging.
   * Returnerer true hvis (tilsynelatende) sendt.
   */
  async send(msg: RenderedMessage, dryRun: boolean): Promise<boolean> {
    if (dryRun) {
      console.log(`  [TØRR] ville sendt til ${msg.to} – «${msg.subject}»`);
      return true;
    }
    // Gmail tvinger ofte avsender til den autentiserte kontoen; bruk SMTP-bruker
    // som from når den finnes, men behold visningsnavnet fra pitchen.
    const fromEmail = this.smtp?.user ?? msg.fromEmail;
    await this.getTransport().sendMail({
      from: `"${msg.fromName}" <${fromEmail}>`,
      replyTo: msg.fromEmail,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    console.log(`  [SENDT] ${msg.to} – «${msg.subject}»`);
    return true;
  }
}
