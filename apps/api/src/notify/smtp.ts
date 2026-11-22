/**
 * Minimal SMTP client for the email notification channel.
 *
 * Uses only Node built-ins: no external relay, no paid provider, no new
 * dependency. Supports implicit TLS, STARTTLS, AUTH PLAIN and AUTH LOGIN.
 * Credentials are read from the environment and never written to logs.
 */
import { once } from "node:events";
import { connect as connectNet, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";

export interface SmtpOptions {
  host: string;
  port: number;
  from: string;
  to: string;
  user?: string;
  password?: string;
  secure?: boolean;
  timeoutMs?: number;
}

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

interface ReplyGate {
  promise: Promise<string>;
  resolve: (reply: string) => void;
  reject: (error: Error) => void;
}

class SmtpSession {
  private buffer = "";
  private lines: string[] = [];
  private gate: ReplyGate | null = null;

  constructor(public socket: Socket, private timeoutMs: number) {
    socket.setTimeout(timeoutMs, () => this.fail(new Error("SMTP timeout")));
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  private onData = (chunk: Buffer): void => {
    this.buffer += chunk.toString("utf8");
    let end: number;
    while ((end = this.buffer.indexOf("\r\n")) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      this.lines.push(line);
      if (/^\d{3} /.test(line)) {
        const reply = this.lines.join("\r\n");
        this.lines = [];
        const gate = this.gate;
        this.gate = null;
        gate?.resolve(reply);
      }
    }
  };

  private onError = (error: Error): void => this.fail(error);

  private onClose = (): void => this.fail(new Error("SMTP connection closed"));

  private fail(error: Error): void {
    const gate = this.gate;
    this.gate = null;
    gate?.reject(error);
  }

  detach(): void {
    this.socket.removeListener("data", this.onData);
    this.socket.removeListener("error", this.onError);
    this.socket.removeListener("close", this.onClose);
  }

  async readReply(): Promise<string> {
    const last = this.lines.at(-1);
    if (last && /^\d{3} /.test(last)) {
      const reply = this.lines.join("\r\n");
      this.lines = [];
      return reply;
    }
    const gate = Promise.withResolvers<string>();
    this.gate = gate;
    return gate.promise;
  }

  async command(line: string, expected: number, logLabel = line.split(" ")[0] ?? "command"): Promise<string> {
    this.socket.write(`${line}\r\n`);
    const reply = await this.readReply();
    const code = Number(reply.slice(0, 3));
    if (code !== expected) throw new Error(`SMTP ${logLabel} failed: ${reply.slice(0, 200)}`);
    return reply;
  }

  async data(body: string): Promise<void> {
    await this.command("DATA", 354);
    const stuffed = body
      .replace(/\r?\n/g, "\n")
      .split("\n")
      .map((line) => (line.startsWith(".") ? `.${line}` : line))
      .join("\r\n");
    this.socket.write(`${stuffed}\r\n.\r\n`);
    const reply = await this.readReply();
    if (Number(reply.slice(0, 3)) !== 250) throw new Error(`SMTP DATA failed: ${reply.slice(0, 200)}`);
  }
}

/** Send one text email through a reachable SMTP server. */
export async function sendSmtpEmail(options: SmtpOptions, subject: string, text: string): Promise<void> {
  const { host, port, from, to } = options;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid SMTP host or port");
  if (!ADDRESS.test(from) || !ADDRESS.test(to)) throw new Error("invalid SMTP address");

  const timeoutMs = options.timeoutMs ?? 15_000;
  const socket: Socket = options.secure
    ? connectTls({ host, port, servername: host, timeout: timeoutMs })
    : connectNet({ host, port });
  await once(socket, options.secure ? "secureConnect" : "connect");

  let session = new SmtpSession(socket, timeoutMs);
  try {
    const greeting = await session.readReply();
    if (Number(greeting.slice(0, 3)) !== 220) throw new Error(`SMTP greeting failed: ${greeting.slice(0, 200)}`);

    let ehlo: string;
    try {
      ehlo = await session.command("EHLO localhost", 250);
    } catch {
      ehlo = await session.command("HELO localhost", 250);
    }

    if (!options.secure && /\bSTARTTLS\b/i.test(ehlo)) {
      await session.command("STARTTLS", 220);
      session.detach();
      const tlsSocket = connectTls({ socket, servername: host, rejectUnauthorized: true });
      await once(tlsSocket, "secureConnect");
      session = new SmtpSession(tlsSocket, timeoutMs);
      ehlo = await session.command("EHLO localhost", 250);
    }

    if (options.user && options.password) {
      if (/\bPLAIN\b/i.test(ehlo)) {
        const token = Buffer.from(`\0${options.user}\0${options.password}`).toString("base64");
        await session.command(`AUTH PLAIN ${token}`, 235, "AUTH PLAIN");
      } else if (/\bLOGIN\b/i.test(ehlo)) {
        await session.command("AUTH LOGIN", 334, "AUTH LOGIN");
        await session.command(Buffer.from(options.user).toString("base64"), 334, "AUTH user");
        await session.command(Buffer.from(options.password).toString("base64"), 235, "AUTH password");
      } else {
        throw new Error("SMTP server does not advertise authentication");
      }
    }

    await session.command(`MAIL FROM:<${from}>`, 250, "MAIL FROM");
    await session.command(`RCPT TO:<${to}>`, 250, "RCPT TO");
    const safeSubject = subject.replace(/[\r\n]+/g, " ").slice(0, 200);
    await session.data(
      `From: ${from}\r\nTo: ${to}\r\nSubject: ${safeSubject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`,
    );
    await session.command("QUIT", 221).catch(() => undefined);
  } finally {
    session.detach();
    socket.destroy();
  }
}
