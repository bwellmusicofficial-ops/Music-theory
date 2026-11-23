import { routeDeps } from '@/accounts/route-deps';
import { handleExport } from '@/accounts/privacy-handlers';

export const dynamic = 'force-dynamic';

export function POST(req: Request): Promise<Response> {
  return handleExport(req, routeDeps);
}
