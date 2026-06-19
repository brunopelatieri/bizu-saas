import { getSupabase } from "@/lib/supabase/client";

type UploadOptions = {
  contentType?: string;
  upsert?: boolean;
};

export async function uploadFile(
  bucket: string,
  path: string,
  body: File | Blob | ArrayBuffer,
  options: UploadOptions = {},
) {
  const supabase = getSupabase();

  return supabase.storage.from(bucket).upload(path, body, {
    contentType: options.contentType,
    upsert: options.upsert ?? false,
  });
}

export function getPublicStorageUrl(bucket: string, path: string) {
  const supabase = getSupabase();
  return supabase.storage.from(bucket).getPublicUrl(path);
}

export async function removeFile(bucket: string, paths: string[]) {
  const supabase = getSupabase();
  return supabase.storage.from(bucket).remove(paths);
}

export async function listFiles(bucket: string, path = "") {
  const supabase = getSupabase();
  return supabase.storage.from(bucket).list(path);
}
