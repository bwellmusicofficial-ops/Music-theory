import { handleProgressGet } from '@/accounts/progress-handlers';
import { routeDeps } from '@/accounts/route-deps';

export const dynamic = 'force-dynamic';

export function GET(req: Request): Promise<Response> {
  return handleProgressGet(req, routeDeps);
}
