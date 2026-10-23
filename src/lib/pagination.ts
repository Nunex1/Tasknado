/** Read bounded API pages without silently truncating at PostgREST's row cap. */
export async function fetchPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  limit = Infinity,
): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const size = Math.min(500, limit - rows.length);
    const result = await read(rows.length, rows.length + size - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data || [];
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}
