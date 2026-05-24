/**
 * ChampionModel — Affichage profil champion
 * Délègue à ChampionSprite (sprite 2D animé) qui remplace l'ancien modèle FBX/Three.js.
 */
import React from 'react';
import ChampionSprite from './ChampionSprite';

export default function ChampionModel({ name, archetype, isDead, color, stats }) {
  return (
    <ChampionSprite
      name={name}
      archetype={archetype}
      isDead={!!isDead}
      color={color}
      animState="idle"
      height={220}
      showTag
    />
  );
}
