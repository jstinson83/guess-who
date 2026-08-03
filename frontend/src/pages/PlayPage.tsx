import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Board, Character } from '../types';
import CharacterCard from '../components/CharacterCard';

function pickRandom(characters: Character[]): Character {
  return characters[Math.floor(Math.random() * characters.length)];
}

export default function PlayPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [board, setBoard] = useState<Board | null>(null);
  const [mystery, setMystery] = useState<Character | null>(null);
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [guessId, setGuessId] = useState('');
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (!boardId) return;
    api.getBoard(boardId).then((b) => {
      setBoard(b);
      setMystery(pickRandom(b.characters));
    });
  }, [boardId]);

  function newGame() {
    if (!board) return;
    setMystery(pickRandom(board.characters));
    setEliminated(new Set());
    setGuessId('');
    setResult(null);
    setReveal(false);
  }

  function toggleEliminated(id: string) {
    setEliminated((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!guessId || !mystery) return;
    setResult(guessId === mystery.id ? 'win' : 'lose');
    setReveal(true);
  }

  if (!board || !mystery) return <p className="text-neutral-500">Loading…</p>;

  const remaining = board.characters.filter((c) => !eliminated.has(c.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Playing: {board.name}</h1>
          <p className="text-neutral-500">
            One player secretly knows the mystery person. Ask yes/no questions and tap a card to flip it down when
            it's eliminated.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setReveal((r) => !r)}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-500 dark:border-neutral-700"
          >
            {reveal ? 'Hide' : 'Peek at'} mystery person
          </button>
          <button
            onClick={newGame}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            New game
          </button>
          <Link
            to={`/boards/${board.id}`}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-500 dark:border-neutral-700"
          >
            Back to board
          </Link>
        </div>
      </div>

      {reveal && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
          Mystery person is <strong>{mystery.name}</strong>.
        </div>
      )}

      {result && (
        <div
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            result === 'win'
              ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {result === 'win' ? `Correct! It was ${mystery.name}.` : `Not quite — it was ${mystery.name}.`}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {board.characters.map((c) => (
          <CharacterCard key={c.id} character={c} eliminated={eliminated.has(c.id)} onClick={() => toggleEliminated(c.id)} />
        ))}
      </div>

      <form onSubmit={handleGuess} className="flex max-w-md items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium">Ready to guess?</label>
          <select
            value={guessId}
            onChange={(e) => setGuessId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="">Choose a person…</option>
            {remaining.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!guessId}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Guess
        </button>
      </form>
    </div>
  );
}
