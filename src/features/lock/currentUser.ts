// 10-21: the id of whoever is signed in right now, read after a re-sign-in (D-29). Lazy import, like signOut.ts: the
// Supabase client reads env at module load, so a static import would make every importer throw under Jest.
export async function currentUserId(): Promise<string | null> {
  const { supabase } = await import('@/services/supabase');
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
