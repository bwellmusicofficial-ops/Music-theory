import { handleSignOut } from '@/accounts/handlers';
import { routeDeps } from '@/accounts/route-deps';

export const dynamic = 'force-dynamic';

export function POST(req: Request): Promise<Response> {
  return handleSignOut(req, routeDeps);
}
