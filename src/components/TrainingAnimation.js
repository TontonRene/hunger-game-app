/**
 * TrainingAnimation — Animation d'entraînement par stat
 * Remplace l'ancien rendu FBX/Three.js par des sprites animés.
 */
import React from 'react';
import ChampionSprite from './ChampionSprite';

export default function TrainingAnimation({ stat, champion }) {
  const color     = champion?.color || '#e2b96f';
  const archetype = champion?.archetype;

  return (
    <ChampionSprite
      name={null}
      archetype={archetype}
      isDead={false}
      color={color}
      trainStat={stat}
      height={200}
      showTag
      style={{ marginBottom: 12 }}
    />
  );
}
