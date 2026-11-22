import { handleProgressSync } from '@/accounts/progress-handlers';
import { routeDeps } from '@/accounts/route-deps';

export const dynamic = 'force-dynamic';

export function POST(req: Request): Promise<Response> {
  return handleProgressSync(req, routeDeps);
}
