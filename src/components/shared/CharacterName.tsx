import { CLASS_COLORS } from '~/lib/wow/classes';

export function CharacterName({ character }: { character: { name: string; classId: number } }) {
  const classInfo = CLASS_COLORS[character.classId];
  return (
    <span className="font-medium text-sm" style={{ color: classInfo?.color }}>
      {character.name}
    </span>
  );
}
