import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useGame } from '../context/GameContext';
import api from '../utils/api';
import RadarChart from '../components/RadarChart';
import ChampionSprite from '../components/ChampionSprite';

const STAT_LABELS = {
  strength: 'Force',
  speed: 'Vitesse',
  defense: 'Défense',
  endurance: 'Endurance',
  instinct: 'Instinct',
  survival: 'Survie',
};

const CHAMP_PALETTE = [
  '#e74c3c','#3498db','#2ecc71','#f39c12',
  '#9b59b6','#1abc9c','#e67e22','#ff6b9d',
  '#00b894','#fd79a8','#6c5ce7','#fdcb6e',
];

const ARCH_META = {
  guerrier:   { icon:'⚔️',  desc:'Combattant équilibré' },
  chasseur:   { icon:'🏹',  desc:'Rapide, mortel à distance' },
  colosse:    { icon:'🛡️',  desc:'Résistance maximale' },
  ombre:      { icon:'🌑',  desc:'Camouflage et discrétion' },
  médecin:    { icon:'💊',  desc:'Récupération et survie' },
  berserk:    { icon:'💥',  desc:'Attaque sans limite' },
  rôdeur:     { icon:'🌿',  desc:'Maître du terrain' },
};

export default function ChampionScreen() {
  const { champion, setChampion, user } = useGame();
  const [weeklyBatch, setWeeklyBatch] = useState([]);
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!champion) loadWeeklyBatch();
    else setInstructions(champion.instructions || '');
  }, [champion]);

  async function loadWeeklyBatch() {
    try {
      setLoading(true);
      const res = await api.get('/api/champions/weekly-batch');
      setWeeklyBatch(res.data.batch);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de charger le batch hebdomadaire');
    } finally {
      setLoading(false);
    }
  }

  async function recruitChampion(template) {
    if (!user) return Alert.alert('Connexion requise');
    try {
      setLoading(true);
      const res = await api.post('/api/champions/recruit', {
        sponsorId: user.id,
        username: user.username,
        championTemplate: template,
      });
      setChampion(res.data);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de recruter ce champion');
    } finally {
      setLoading(false);
    }
  }

  async function saveInstructions() {
    try {
      await api.patch(`/api/champions/${champion.id}/instructions`, { instructions });
      setChampion({ ...champion, instructions });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  async function changeColor(color) {
    try {
      await api.patch(`/api/champions/${champion.id}/color`, { color });
      setChampion({ ...champion, color });
    } catch {}
  }

  // ── Champion mort : écran de deuil + possibilité de recruter ─────────────
  if (champion && champion.status === 'dead') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.deathBanner}>
          <Text style={styles.deathSkull}>💀</Text>
          <Text style={styles.deathTitle}>{champion.name} est tombé</Text>
          <Text style={styles.deathSub}>
            {champion.battles || 0} batailles · {champion.victories || 0} victoires
          </Text>
        </View>
        <View style={styles.deathCard}>
          <Text style={styles.deathMsg}>
            Ton champion est mort au combat. Son histoire est gravée dans le Valhalla.
            Tu peux maintenant recruter un nouveau combattant dans le batch de la semaine.
          </Text>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => { setChampion(null); loadWeeklyBatch(); }}
          >
            <Text style={styles.saveBtnText}>⚔️ Recruter un nouveau champion</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (!champion) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>BATCH DE LA SEMAINE</Text>
          <Text style={styles.subtitle}>Choisis ton champion — il sera le tien jusqu'à sa mort</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#e2b96f" size="large" style={{ marginTop: 40 }} />
        ) : (
          weeklyBatch.map((template, i) => (
            <TouchableOpacity
              key={i}
              style={styles.templateCard}
              onPress={() => Alert.alert(
                `Recruter ${template.name} ?`,
                `${template.archetype.toUpperCase()} — Ce choix est définitif jusqu'à sa mort.`,
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Recruter', onPress: () => recruitChampion(template) },
                ]
              )}
            >
              <View style={styles.templateHeader}>
                <Text style={styles.templateName}>{template.name}</Text>
                <Text style={styles.templateArchetype}>{template.archetype.toUpperCase()}</Text>
              </View>
              <ChampionSprite
                archetype={template.archetype}
                animState="idle"
                height={160}
                showTag={false}
                style={{ marginBottom: 8, borderRadius: 10 }}
              />
              <RadarChart stats={template.stats} size={120} />
              <View style={styles.templateStatsRow}>
                {Object.entries(STAT_LABELS).map(([key, label]) => (
                  <View key={key} style={styles.miniStat}>
                    <Text style={styles.miniStatVal}>{template.stats[key]}</Text>
                    <Text style={styles.miniStatLabel}>{label.slice(0, 3)}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    );
  }

  const archMeta = ARCH_META[champion.archetype] || { icon: '⚔️', desc: '' };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Bandeau identité champion */}
      <View style={[styles.champBanner, { borderLeftColor: champion.color || '#e2b96f' }]}>
        <Text style={styles.champBannerIcon}>{archMeta.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.champBannerName}>{champion.name}</Text>
          <Text style={styles.champBannerArch}>{champion.archetype?.toUpperCase()} · {archMeta.desc}</Text>
        </View>
        <View style={styles.champBadges}>
          <View style={styles.champBadge}>
            <Text style={styles.champBadgeVal}>{champion.victories || 0}</Text>
            <Text style={styles.champBadgeLbl}>Victoires</Text>
          </View>
          <View style={styles.champBadge}>
            <Text style={styles.champBadgeVal}>{champion.battles || 0}</Text>
            <Text style={styles.champBadgeLbl}>Batailles</Text>
          </View>
        </View>
      </View>

      {/* HP max calculé */}
      <View style={styles.hpBanner}>
        <Text style={styles.hpLabel}>❤️  {100 + (champion.stats?.endurance || 0) * 10} HP MAX</Text>
      </View>

      {/* Couleur du champion */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>COULEUR</Text>
        <View style={styles.colorRow}>
          {CHAMP_PALETTE.map(c => (
            <TouchableOpacity
              key={c} onPress={() => changeColor(c)}
              style={[
                styles.colorDot,
                { backgroundColor: c },
                champion.color === c && styles.colorDotActive,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Sprite champion */}
      <ChampionSprite
        name={champion.name}
        archetype={champion.archetype}
        isDead={champion.status === 'dead'}
        color={champion.color}
        animState="idle"
        height={220}
        showTag
      />

      {/* Radar chart */}
      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>PROFIL DE COMBAT</Text>
        <RadarChart stats={champion.stats} size={200} />
      </View>

      {/* Stats détaillées */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>STATISTIQUES</Text>
        <View style={styles.statsGrid}>
          {Object.entries(STAT_LABELS).map(([key, label]) => (
            <View key={key} style={styles.statCell}>
              <Text style={styles.statValue}>{champion.stats?.[key] || 0}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Consignes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CONSIGNES PRÉ-BATAILLE</Text>
        <TextInput
          style={styles.input}
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Ex : Évite les zones ouvertes, chasse les blessés..."
          placeholderTextColor="#444"
          multiline
          numberOfLines={4}
          maxLength={300}
        />
        <View style={styles.inputFooter}>
          <Text style={styles.charCount}>{instructions.length}/300</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={saveInstructions}>
            <Text style={styles.saveBtnText}>{saved ? '✓ Sauvegardé' : 'Sauvegarder'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { color: '#e2b96f', fontSize: 18, fontWeight: 'bold', letterSpacing: 2 },
  subtitle: { color: '#555', fontSize: 12, marginTop: 4 },

  templateCard: {
    backgroundColor: '#111122', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#2a2a4a',
    alignItems: 'center',
  },
  templateHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, alignSelf: 'flex-start' },
  templateName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  templateArchetype: { color: '#e2b96f', fontSize: 10, letterSpacing: 2 },
  templateStatsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  miniStat: { alignItems: 'center', minWidth: 36 },
  miniStatVal: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  miniStatLabel: { color: '#555', fontSize: 9 },

  champBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111122', borderRadius: 12, padding: 14,
    marginBottom: 10, borderLeftWidth: 4,
  },
  champBannerIcon: { fontSize: 28 },
  champBannerName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  champBannerArch: { color: '#666', fontSize: 11, marginTop: 2 },
  champBadges:     { flexDirection: 'row', gap: 8 },
  champBadge:      { alignItems: 'center', minWidth: 48 },
  champBadgeVal:   { color: '#e2b96f', fontSize: 18, fontWeight: 'bold' },
  champBadgeLbl:   { color: '#555', fontSize: 9 },

  hpBanner: {
    backgroundColor: '#111122', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14,
    marginBottom: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#2ecc7133',
  },
  hpLabel: { color: '#2ecc71', fontSize: 13, fontWeight: 'bold' },

  deathBanner: {
    alignItems: 'center', marginBottom: 20,
    paddingVertical: 24,
  },
  deathSkull:  { fontSize: 56, marginBottom: 12 },
  deathTitle:  { color: '#e74c3c', fontSize: 22, fontWeight: 'bold' },
  deathSub:    { color: '#555', fontSize: 12, marginTop: 6 },
  deathCard:   {
    backgroundColor: '#111122', borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: '#e74c3c33',
  },
  deathMsg:    { color: '#888', fontSize: 13, lineHeight: 22, marginBottom: 20 },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 2, borderColor: 'transparent',
  },
  colorDotActive: { borderColor: '#fff', transform: [{ scale: 1.2 }] },

  chartSection: { alignItems: 'center', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#555', fontSize: 11, letterSpacing: 2, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: {
    flex: 1, minWidth: 80, backgroundColor: '#111122',
    borderRadius: 8, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#1a1a2e',
  },
  statValue: { color: '#e2b96f', fontSize: 22, fontWeight: 'bold' },
  statLabel: { color: '#666', fontSize: 11, marginTop: 2 },

  input: {
    backgroundColor: '#111122', borderRadius: 8,
    borderWidth: 1, borderColor: '#2a2a4a',
    color: '#fff', padding: 12, fontSize: 13,
    textAlignVertical: 'top', minHeight: 100,
  },
  inputFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  charCount: { color: '#444', fontSize: 11 },
  saveBtn: { backgroundColor: '#e2b96f', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16 },
  saveBtnText: { color: '#0d0d1a', fontWeight: 'bold', fontSize: 13 },
});
