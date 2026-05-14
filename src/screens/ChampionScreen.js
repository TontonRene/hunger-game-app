import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useGame } from '../context/GameContext';
import api from '../utils/api';
import RadarChart from '../components/RadarChart';
import ChampionModel from '../components/ChampionModel';

const STAT_LABELS = {
  strength: 'Force',
  speed: 'Vitesse',
  defense: 'Défense',
  endurance: 'Endurance',
  instinct: 'Instinct',
  survival: 'Survie',
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Modèle 3D */}
      <ChampionModel stats={champion.stats} name={champion.name} archetype={champion.archetype} />

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
