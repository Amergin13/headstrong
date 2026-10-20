// Vercel Serverless Function: Optional WHOOP Webhook Receiver
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

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
