import type { BoardQuality } from '../types';
import StarRating from './StarRating';

export default function QualityPanel({ quality }: { quality: BoardQuality }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Board Quality</h2>
      <div className="mb-4">
        <StarRating rating={quality.starRating} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Average guesses</dt>
        <dd className="text-right font-medium">{quality.averageGuesses}</dd>

        <dt className="text-neutral-500">Duplicate combinations</dt>
        <dd className="text-right font-medium">{quality.duplicateCombinations}</dd>

        <dt className="text-neutral-500">Feature balance</dt>
        <dd className="text-right font-medium">{quality.featureBalance}</dd>

        <dt className="text-neutral-500">Remaining unique combinations</dt>
        <dd className="text-right font-medium">{quality.remainingUniqueCombinations}</dd>
      </dl>
    </div>
  );
}
