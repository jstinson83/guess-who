export type FeatureCategory = 'Accessories' | 'Hair' | 'Face' | 'FacialHair' | 'Clothing';

export interface FeatureDef {
  id: string;
  label: string;
  category: FeatureCategory;
  question: string;
  targetRate: number;
}

export type BoardTemplate = 'Family' | 'Friends' | 'Office' | 'Classroom' | 'SportsTeam' | 'Custom';

export const BOARD_TEMPLATES: { value: BoardTemplate; label: string }[] = [
  { value: 'Family', label: 'Family' },
  { value: 'Friends', label: 'Friends' },
  { value: 'Office', label: 'Office' },
  { value: 'Classroom', label: 'Classroom' },
  { value: 'SportsTeam', label: 'Sports team' },
  { value: 'Custom', label: 'Custom' },
];

export type FeatureSet = Record<string, boolean>;

export interface Character {
  id: string;
  boardId: string;
  name: string;
  sourcePhotoUrl: string;
  portraitUrl: string;
  features: FeatureSet;
  createdAt: number;
}

export interface Board {
  id: string;
  name: string;
  template: BoardTemplate;
  targetSize: number;
  createdAt: number;
  characters: Character[];
}

export interface FeatureAvailability {
  feature: FeatureDef;
  available: boolean;
  reason?: string;
  currentCount: number;
  targetCount: number;
}

export interface FeatureDistributionRow {
  feature: FeatureDef;
  yes: number;
  no: number;
  targetYes: number;
  targetNo: number;
}

export interface BoardQuality {
  starRating: number;
  averageGuesses: number;
  duplicateCombinations: number;
  featureBalance: string;
  remainingUniqueCombinations: number;
  distribution: FeatureDistributionRow[];
}
