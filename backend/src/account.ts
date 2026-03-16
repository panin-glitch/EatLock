import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './index';
import { serviceKey } from './limits';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function getUser(
  request: Request,
  env: Env,
): Promise<{ user_id: string } | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return err('Missing or invalid Authorization header', 401);
  }
  const jwt = authHeader.slice(7).trim();
  if (jwt.split('.').length !== 3) {
    return err('Invalid or expired token', 401);
  }

  const whoamiRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceKey(env),
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (whoamiRes.status === 401 || !whoamiRes.ok) {
    return err('Invalid or expired token', 401);
  }

  const whoami = (await whoamiRes.json().catch(() => null)) as { id?: string } | null;
  if (!whoami?.id) {
    return err('Invalid or expired token', 401);
  }

  return { user_id: whoami.id };
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function extractStoragePath(urlOrPath: string | null | undefined, bucket: string): string | null {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return null;

  const publicPathMarker = `/storage/v1/object/public/${bucket}/`;
  const directBucketPrefix = `${bucket}/`;

  if (raw.includes(publicPathMarker)) {
    const start = raw.indexOf(publicPathMarker) + publicPathMarker.length;
    return decodeURIComponent(raw.slice(start)).replace(/^\/+/, '') || null;
  }

  if (raw.startsWith(directBucketPrefix)) {
    return raw.slice(directBucketPrefix.length).replace(/^\/+/, '') || null;
  }

  return raw.startsWith('/') ? raw.slice(1) : raw;
}

function isBucketPathWithinFolder(path: string | null | undefined, folder: string): path is string {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const normalizedFolder = String(folder || '').replace(/^\/+|\/+$/g, '');
  return normalizedPath.length > 0 && normalizedFolder.length > 0 && normalizedPath.startsWith(`${normalizedFolder}/`);
}

async function listStorageFolderPaths(
  supabase: SupabaseClient<any, any, any>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  if (!normalizedPrefix) return [];

  const found: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(normalizedPrefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      console.warn(`[account/delete] Failed to list ${bucket}/${normalizedPrefix}:`, error.message);
      break;
    }

    if (!data?.length) break;

    for (const entry of data) {
      if (!entry?.name) continue;
      found.push(`${normalizedPrefix}/${entry.name}`);
    }

    if (data.length < 1000) break;
    offset += data.length;
  }

  return found;
}

async function removeStoragePaths(
  supabase: SupabaseClient<any, any, any>,
  bucket: string,
  paths: string[],
): Promise<void> {
  const uniquePaths = unique(paths).filter((path) => path.length > 0);
  if (uniquePaths.length === 0) return;

  const { error } = await supabase.storage.from(bucket).remove(uniquePaths);
  if (error) {
    console.warn(`[account/delete] Failed to remove ${bucket} objects:`, error.message);
  }
}

async function deleteR2UploadsForUser(env: Env, userId: string): Promise<void> {
  const prefix = `uploads/${userId}/`;
  let cursor: string | undefined;

  do {
    const listed = await env.IMAGES.list({ prefix, cursor, limit: 500 });
    await Promise.allSettled(listed.objects.map((object) => env.IMAGES.delete(object.key)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function cleanupSupabaseStorage(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<void> {
  const avatarFolderPaths = await listStorageFolderPaths(supabase, 'avatars', userId);

  const [profileResult, groupsResult] = await Promise.all([
    supabase.from('profiles').select('avatar_url').eq('user_id', userId).maybeSingle(),
    supabase.from('groups').select('id, avatar_url').eq('owner_id', userId),
  ]);
  const profile = profileResult.data as { avatar_url?: string | null } | null;
  const groups = groupsResult.data as Array<{ id: string; avatar_url?: string | null }> | null;

  const ownedGroupAvatarFolderPaths = (
    await Promise.all(
      (groups || []).map((group) => listStorageFolderPaths(supabase, 'group-avatars', group.id)),
    )
  ).flat();

  const profileAvatarPath = extractStoragePath(profile?.avatar_url, 'avatars');
  const groupAvatarPaths = (groups || [])
    .map((group) => {
      const path = extractStoragePath(group.avatar_url, 'group-avatars');
      return isBucketPathWithinFolder(path, group.id) ? path : null;
    });

  await Promise.all([
    removeStoragePaths(
      supabase,
      'avatars',
      [
        ...avatarFolderPaths,
        isBucketPathWithinFolder(profileAvatarPath, userId) ? profileAvatarPath : null,
      ].filter(Boolean) as string[],
    ),
    removeStoragePaths(
      supabase,
      'group-avatars',
      [...ownedGroupAvatarFolderPaths, ...groupAvatarPaths].filter(Boolean) as string[],
    ),
  ]);
}

export async function handleDeleteAccount(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  const supabase = createClient(env.SUPABASE_URL, serviceKey(env), {
    auth: { persistSession: false },
  });

  try {
    await Promise.all([
      deleteR2UploadsForUser(env, auth.user_id),
      cleanupSupabaseStorage(supabase, auth.user_id),
    ]);

    const { error } = await supabase.auth.admin.deleteUser(auth.user_id, false);
    if (error) {
      console.error('[account/delete] Auth delete failed:', error.message);
      return err('Failed to delete account', 500);
    }

    return json({ ok: true });
  } catch (error: any) {
    console.error('[account/delete] Unexpected failure:', error?.message || error);
    return err('Failed to delete account', 500);
  }
}
