import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Board, BoardQuality } from '../types';
import CharacterCard from '../components/CharacterCard';
import QualityPanel from '../components/QualityPanel';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [board, setBoard] = useState<Board | null>(null);
  const [quality, setQuality] = useState<BoardQuality | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!boardId) return;
    Promise.all([api.getBoard(boardId), api.getQuality(boardId)])
      .then(([b, q]) => {
        setBoard(b);
        setQuality(q);
      })
      .catch((e) => setError(e.message));
  }, [boardId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!board || !quality) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{board.name}</h1>
          <p className="text-neutral-500">
            {board.template} · {board.characters.length}/{board.targetSize} people
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/boards/${board.id}/add`}
            className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Add person
          </Link>
          {board.characters.length >= 2 && (
            <Link
              to={`/boards/${board.id}/play`}
              className="rounded-md border border-neutral-300 px-4 py-2 font-medium hover:border-neutral-500 dark:border-neutral-700"
            >
              Play
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {board.characters.length === 0 ? (
            <p className="text-neutral-500">
              No one on this board yet. Click <strong>Add person</strong> to upload the first photo.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {board.characters.map((c) => (
                <Link key={c.id} to={`/boards/${board.id}/edit/${c.id}`}>
                  <CharacterCard character={c} />
                </Link>
              ))}
            </div>
          )}
        </div>
        <QualityPanel quality={quality} />
      </div>
    </div>
  );
}
