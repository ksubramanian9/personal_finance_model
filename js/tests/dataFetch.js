// A fetch that works for repo-relative paths ("data/...") in both the browser
// (tests.html at the repo root) and Node (reads from disk).
export async function getFetch() {
  if (typeof window !== 'undefined') return (path) => fetch(path);

  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const root = new URL('../../', import.meta.url);
  return async (path) => {
    try {
      const text = await readFile(fileURLToPath(new URL(path, root)), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
}
