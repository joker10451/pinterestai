import type { IncomingMessage } from 'node:http';

/**
 * Reads the raw request body as a UTF-8 string.
 * Required for signature verification — `req.body` returns a parsed object
 * whose JSON-stringification may not byte-match what the sender signed.
 */
export async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}
