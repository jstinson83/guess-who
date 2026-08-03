import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Board, Character, FeatureAvailability, FeatureSet } from '../types';
import FeatureChecklist from '../components/FeatureChecklist';

export default function AddCharacterPage() {
  const { boardId, characterId } = useParams<{ boardId: string; characterId?: string }>();
  const navigate = useNavigate();
  const isEditing = !!characterId;

  const [board, setBoard] = useState<Board | null>(null);
  const [existing, setExisting] = useState<Character | null>(null);
  const [name, setName] = useState('');
  const [selection, setSelection] = useState<FeatureSet>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [availability, setAvailability] = useState<FeatureAvailability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!boardId) return;
    api.getBoard(boardId).then((b) => {
      setBoard(b);
      if (characterId) {
        const c = b.characters.find((ch) => ch.id === characterId);
        if (c) {
          setExisting(c);
          setName(c.name);
          setSelection(c.features);
        }
      }
    });
  }, [boardId, characterId]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!boardId) return;
    api
      .getFeatureAvailability(boardId, selection, characterId)
      .then(setAvailability)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, characterId, selection]);

  const selectedCount = useMemo(() => Object.values(selection).filter(Boolean).length, [selection]);

  function toggleFeature(featureId: string) {
    setSelection((prev) => ({ ...prev, [featureId]: !prev[featureId] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!boardId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (isEditing && characterId) {
        await api.updateCharacter(boardId, characterId, name.trim(), selection);
      } else {
        if (!photo) {
          setError('Please choose a photo.');
          setSubmitting(false);
          return;
        }
        await api.addCharacter(boardId, name.trim(), selection, photo);
      }
      navigate(`/boards/${boardId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!boardId || !characterId) return;
    if (!confirm(`Remove ${existing?.name ?? 'this person'} from the board?`)) return;
    await api.deleteCharacter(boardId, characterId);
    navigate(`/boards/${boardId}`);
  }

  if (!board) return <p className="text-neutral-500">Loading…</p>;

  const previewSrc = photoPreview ?? existing?.portraitUrl;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{isEditing ? `Edit ${existing?.name ?? 'person'}` : 'Add a person'}</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 md:grid-cols-[240px_1fr]">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>

          {!isEditing && (
            <div>
              <label className="mb-1 block text-sm font-medium">Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                required
                className="block w-full text-sm"
              />
            </div>
          )}

          {previewSrc && (
            <img
              src={previewSrc}
              alt="Portrait preview"
              className="aspect-square w-full rounded-lg border border-neutral-200 object-cover dark:border-neutral-800"
            />
          )}

          {isEditing && (
            <p className="text-xs text-neutral-500">
              The photo and illustration style can't be changed here — remove and re-add the person to use a
              different photo.
            </p>
          )}

          <p className="text-sm text-neutral-500">{selectedCount} feature(s) selected</p>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create portrait'}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="w-full rounded-md border border-red-300 px-4 py-2 font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              Remove from board
            </button>
          )}
        </div>

        <div>
          <p className="mb-4 text-sm text-neutral-500">
            Checked features are locked in. Greyed-out features are unavailable right now — either the board is
            already at its target for that feature, or it would exactly duplicate someone else.
          </p>
          <FeatureChecklist availability={availability} selection={selection} onToggle={toggleFeature} />
        </div>
      </form>
    </div>
  );
}
