import type { Board, BoardQuality, BoardTemplate, Character, FeatureAvailability, FeatureDef, FeatureSet } from './types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getFeatures: (): Promise<FeatureDef[]> => fetch('/api/features').then((r) => json(r)),

  listBoards: (): Promise<Board[]> => fetch('/api/boards').then((r) => json(r)),

  getBoard: (boardId: string): Promise<Board> => fetch(`/api/boards/${boardId}`).then((r) => json(r)),

  createBoard: (name: string, template: BoardTemplate, targetSize: number): Promise<Board> =>
    fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, template, targetSize }),
    }).then((r) => json(r)),

  getFeatureAvailability: (
    boardId: string,
    selection: FeatureSet,
    excludeCharacterId?: string,
  ): Promise<FeatureAvailability[]> =>
    fetch(`/api/boards/${boardId}/feature-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection, excludeCharacterId }),
    }).then((r) => json(r)),

  getQuality: (boardId: string): Promise<BoardQuality> =>
    fetch(`/api/boards/${boardId}/quality`).then((r) => json(r)),

  addCharacter: (boardId: string, name: string, features: FeatureSet, photo: File): Promise<Character> => {
    const form = new FormData();
    form.append('name', name);
    form.append('features', JSON.stringify(features));
    form.append('photo', photo);
    return fetch(`/api/boards/${boardId}/characters`, { method: 'POST', body: form }).then((r) => json(r));
  },

  updateCharacter: (boardId: string, characterId: string, name: string | null, features: FeatureSet): Promise<Character> =>
    fetch(`/api/boards/${boardId}/characters/${characterId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, features }),
    }).then((r) => json(r)),

  deleteCharacter: (boardId: string, characterId: string): Promise<void> =>
    fetch(`/api/boards/${boardId}/characters/${characterId}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    }),
};
