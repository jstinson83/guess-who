import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Board, BoardTemplate } from '../types';
import { BOARD_TEMPLATES } from '../types';

export default function HomePage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [template, setTemplate] = useState<BoardTemplate>('Family');
  const [targetSize, setTargetSize] = useState(24);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listBoards()
      .then(setBoards)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const board = await api.createBoard(name.trim(), template, targetSize);
      navigate(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-1 text-2xl font-semibold">Your boards</h1>
        <p className="mb-4 text-neutral-500">Pick up a board you already started, or create a new one below.</p>
        {loading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : boards.length === 0 ? (
          <p className="text-neutral-500">No boards yet — create your first one below.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {boards.map((board) => (
              <a
                key={board.id}
                href={`/boards/${board.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/boards/${board.id}`);
                }}
                className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
              >
                <div className="font-semibold">{board.name}</div>
                <div className="text-sm text-neutral-500">
                  {board.template} · {board.characters.length}/{board.targetSize} people
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-md rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold">Create a board</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Board name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Smith Family"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as BoardTemplate)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            >
              {BOARD_TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Target board size</label>
            <input
              type="number"
              min={4}
              max={48}
              value={targetSize}
              onChange={(e) => setTargetSize(Number(e.target.value))}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {creating ? 'Creating…' : 'Create board'}
          </button>
        </form>
      </section>
    </div>
  );
}
