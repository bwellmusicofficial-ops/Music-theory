import { routeDeps } from '@/accounts/route-deps';
import { handleDelete } from '@/accounts/privacy-handlers';

export const dynamic = 'force-dynamic';

export function POST(req: Request): Promise<Response> {
  return handleDelete(req, routeDeps);
}
