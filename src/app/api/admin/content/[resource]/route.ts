import { requireAdmin } from '@/lib/server/auth';
import { isDemo, invalidatePublicGuide } from '@/lib/server/guide';
import { demoResourceRows } from '@/lib/server/admin';
import { contentActions } from '@/lib/server/content-actions';

const actions = contentActions({ authorize: requireAdmin, invalidate: invalidatePublicGuide, demoRows: resource => isDemo() ? demoResourceRows(resource) : null });
export const GET = actions.GET;
export const POST = actions.POST;
export const PATCH = actions.PATCH;
export const DELETE = actions.DELETE;
