import type { Character } from '../types';

interface Props {
  character: Character;
  eliminated?: boolean;
  onClick?: () => void;
}

export default function CharacterCard({ character, eliminated, onClick }: Props) {
  const className = `flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition ${
    eliminated
      ? 'border-neutral-200 bg-neutral-100 opacity-40 dark:border-neutral-800 dark:bg-neutral-900'
      : 'border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600'
  }`;

  const content = (
    <>
      <img
        src={character.portraitUrl}
        alt={character.name}
        className={`aspect-square w-full rounded-md object-cover ${eliminated ? 'grayscale' : ''}`}
      />
      <span className="truncate text-sm font-medium">{character.name}</span>
    </>
  );

  if (!onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={`${className} w-full cursor-pointer`}>
      {content}
    </button>
  );
}
