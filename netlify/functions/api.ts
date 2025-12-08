import type { Context, Config } from '@netlify/functions';
import { handleWebhookRequest } from '../../src/handlers/webhook';

export default async (req: Request, _context: Context): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/^\/.netlify\/functions\/api/, '');

  // Health check endpoint
  if (req.method === 'GET' && (path === '/health' || path === '')) {
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'caltodoist',
    });
  }

  // Cal.com webhook endpoint
  if (req.method === 'POST' && path === '/cal/webhook') {
    return handleWebhookRequest(req);
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
};

export const config: Config = {
  path: ['/api/*', '/api/health'],
};
