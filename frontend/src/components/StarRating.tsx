export default function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="text-xl text-amber-500" aria-label={`${rating} out of ${max} stars`}>
      {'★'.repeat(rating)}
      <span className="text-neutral-300 dark:text-neutral-700">{'★'.repeat(max - rating)}</span>
    </span>
  );
}
