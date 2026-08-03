import type { FeatureAvailability, FeatureCategory, FeatureSet } from '../types';

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  Accessories: 'Accessories',
  Hair: 'Hair',
  Face: 'Face',
  FacialHair: 'Facial Hair',
  Clothing: 'Clothing',
};

const CATEGORY_ORDER: FeatureCategory[] = ['Accessories', 'Hair', 'Face', 'FacialHair', 'Clothing'];

interface Props {
  availability: FeatureAvailability[];
  selection: FeatureSet;
  onToggle: (featureId: string) => void;
}

export default function FeatureChecklist({ availability, selection, onToggle }: Props) {
  const byCategory = new Map<FeatureCategory, FeatureAvailability[]>();
  for (const item of availability) {
    const list = byCategory.get(item.feature.category) ?? [];
    list.push(item);
    byCategory.set(item.feature.category, list);
  }

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => (
        <div key={category}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {CATEGORY_LABELS[category]}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {byCategory.get(category)!.map(({ feature, available, reason }) => {
              const checked = !!selection[feature.id];
              const disabled = !available && !checked;
              return (
                <label
                  key={feature.id}
                  className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                    disabled
                      ? 'border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50'
                      : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(feature.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium">{feature.label}</span>
                    {disabled && reason ? <span className="block text-xs text-neutral-400">{reason}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
