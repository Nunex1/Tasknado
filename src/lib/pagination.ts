import { check } from "./supabase";
/** Read bounded API pages without silently truncating at PostgREST's row cap. */
export async function fetchPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string; code?: string } | null;
    status?: number;
  }>,
  limit = Infinity,
): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const size = Math.min(500, limit - rows.length);
    const result = await read(rows.length, rows.length + size - 1);
    const page = check(result) || [];
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}
