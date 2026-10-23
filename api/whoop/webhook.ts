import { applyCors } from '../_lib/cors.js';
// Vercel Serverless Function: Optional WHOOP Webhook Receiver
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method === 'POST') {
    // Optional webhook notifications: recovery.updated, sleep.updated, workout.updated
    // Webhooks are not required for Treise's on-demand recovery sync, but this endpoint acknowledges any events.
    return res.status(200).json({ status: 'ok', received: true });
  }

  return res.status(200).json({
    status: 'ok',
    message: 'Treise WHOOP Webhook Endpoint. Webhooks are optional in Treise.',
  });
}
