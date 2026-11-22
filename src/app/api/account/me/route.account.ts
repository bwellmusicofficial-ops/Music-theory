import { handleMe } from '@/accounts/handlers';
import { routeDeps } from '@/accounts/route-deps';

export const dynamic = 'force-dynamic';

export function GET(req: Request): Promise<Response> {
  return handleMe(req, routeDeps);
}
