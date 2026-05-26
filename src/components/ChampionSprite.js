/**
 * ChampionSprite — Affichage sprite animé d'un champion
 * Utilise LPCSpriteCanvas (Skia) — sprites LPC natifs, 5 couches composées.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LPCSpriteCanvas from './LPCSpriteCanvas';

// ── Couleurs par archétype ────────────────────────────────────────────────
const ARCH_COLORS = {
  berserker: '#e74c3c', hunter: '#27ae60', opportunist: '#f39c12',
  survivor:  '#1abc9c', tank:   '#8e44ad', soldier:    '#3498db',
  guerrier:  '#c0392b', chasseur:'#27ae60', colosse:   '#8e44ad',
  ombre:     '#2c3e50', médecin: '#2980b9', berserk:   '#e67e22',
  rôdeur:    '#16a085',
};

// ── Mapping stat → animation ──────────────────────────────────────────────
const STAT_ANIM = {
  strength: 'attack', speed: 'run', defense: 'hurt',
  endurance: 'walk',  instinct: 'idle', survival: 'idle',
};
const STAT_LABEL = {
  strength:'Force', speed:'Vitesse', defense:'Défense',
  endurance:'Endurance', instinct:'Instinct', survival:'Survie',
};
const STAT_COLOR = {
  strength:'#e74c3c', speed:'#3498db', defense:'#f39c12',
  endurance:'#2ecc71', instinct:'#9b59b6', survival:'#1abc9c',
};

// ═══════════════════════════════════════════════════════════════════════════
export default function ChampionSprite({
  name,
  archetype,
  isDead = false,
  look,          // { bodyType, hair, torso, legs, ... } — optionnel
  animState,     // 'idle'|'walk'|'run'|'attack'|'hurt'|'death'
  trainStat,
  height = 220,
  showTag = true,
  style,
}) {
  const col       = ARCH_COLORS[archetype] || '#e2b96f';
  // Mapping stat d'entraînement → animation adaptée
  const anim      = isDead ? 'death'
    : trainStat   ? (STAT_ANIM[trainStat] || 'idle')
    : animState   || 'idle';
  const accentCol = trainStat ? (STAT_COLOR[trainStat] || col) : col;
  // Direction : face au joueur (row 2 = droite, LPC natif)
  const sprWidth  = Math.round(height * 0.75);

  return (
    <View style={[styles.container, { height }, style]}>
      {/* ── Sprite LPC Skia ───────────────────────────────────────────── */}
      <LPCSpriteCanvas
        championId={name || archetype || 'default'}
        look={look}
        animState={anim}
        dirRow={2}        /* LPC standard : row 2 = front/face */
        width={sprWidth}
        height={height}
        bgColor="#0d0d1a"
      />
      {showTag && (
        <View style={styles.tag}>
          {name ? <Text style={styles.name}>{name}</Text> : null}
          {archetype ? (
            <Text style={[styles.arch, { color: col }]}>
              {archetype.toUpperCase()}
            </Text>
          ) : null}
          {trainStat ? (
            <Text style={[styles.statLabel, { color: accentCol }]}>
              ▸ {STAT_LABEL[trainStat]?.toUpperCase()}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14, overflow: 'hidden', position: 'relative',
    marginBottom: 10, backgroundColor: '#0d0d1a',
    alignItems: 'center', justifyContent: 'center',
  },
  tag: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 8, paddingTop: 5, backgroundColor: '#0d0d1a99',
  },
  name:      { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  arch:      { fontSize: 9,  letterSpacing: 2, marginTop: 1 },
  statLabel: { fontSize: 10, letterSpacing: 1.5, marginTop: 2, fontWeight: 'bold' },
});
