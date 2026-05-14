import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useGame } from '../context/GameContext';
import TrainingAnimation from '../components/TrainingAnimation';
import api from '../utils/api';

const STAT_META = {
  strength:  { label: 'Force',      icon: '💪', color: '#e74c3c' },
  speed:     { label: 'Vitesse',    icon: '⚡', color: '#3498db' },
  defense:   { label: 'Défense',    icon: '🛡️', color: '#f39c12' },
  endurance: { label: 'Endurance',  icon: '❤️', color: '#2ecc71' },
  instinct:  { label: 'Instinct',   icon: '🎯', color: '#9b59b6' },
  survival:  { label: 'Survie',     icon: '🌿', color: '#1abc9c' },
};

const SUPPLY_ITEMS = [
  {
    id: 'supply_soin',
    name: 'Kit de soins',        icon: '🧪',
    description: 'Colis largué sur la carte · ton champion y court pour +30 HP',
    price: 50,  type: 'soin',
  },
  {
    id: 'supply_force',
    name: 'Poudre de Force',     icon: '🔥',
    description: 'Colis · +3 Force pendant 5 ticks après récupération',
    price: 80,  type: 'force',
  },
  {
    id: 'supply_vitesse',
    name: 'Potion de Vitesse',   icon: '🌀',
    description: 'Colis · +3 Vitesse pendant 5 ticks après récupération',
    price: 80,  type: 'vitesse',
  },
  {
    id: 'supply_armure',
    name: 'Armure légère',       icon: '🛡️',
    description: 'Colis · +4 Défense pendant 5 ticks après récupération',
    price: 90,  type: 'armure',
  },
  {
    id: 'supply_adrenaline',
    name: 'Adrénaline',          icon: '💉',
    description: 'Colis · +2 Force +2 Vitesse pendant 3 ticks — effet court mais brutal',
    price: 120, type: 'adrenaline',
  },
  {
    id: 'supply_festin',
    name: 'Festin royal',        icon: '🍖',
    description: 'Colis · +60 HP et retire la fatigue pour les 5 prochains ticks',
    price: 100, type: 'festin',
  },
  {
    id: 'supply_antidote',
    name: 'Antidote',            icon: '💊',
    description: 'Colis · annule tous les malus actifs sur ton champion',
    price: 70,  type: 'antidote',
  },
  {
    id: 'supply_camouflage',
    name: 'Cape de camouflage',  icon: '🌑',
    description: 'Colis · ton champion évite les combats pendant 4 ticks',
    price: 110, type: 'camouflage',
  },
  {
    id: 'supply_carte',
    name: 'Carte tactique',      icon: '🗺️',
    description: 'Colis · révèle les positions ennemies pour ton champion pendant 5 ticks',
    price: 90,  type: 'carte',
  },
  {
    id: 'supply_arbalete',
    name: 'Arbalète',            icon: '🏹',
    description: 'Colis · +5 dégâts à distance pendant 3 ticks de combat',
    price: 130, type: 'arbalete',
  },
];

const COST_PER_HOUR = 10;
const GAIN_PER_HOUR = 0.1;

export default function BoutiqueScreen() {
  const { user, setUser, champion, sendSupply } = useGame();
  const [activeTab, setActiveTab]         = useState('Entraînement');
  const [training, setTraining]           = useState(null);   // { active, stat, startedAt }
  const [gold, setGold]                   = useState(user?.gold ?? 0);
  const [elapsed, setElapsed]             = useState(0);      // seconds since training start
  const [loadingTrain, setLoadingTrain]   = useState(false);
  const [loadingStop, setLoadingStop]     = useState(false);
  const [statusLoaded, setStatusLoaded]   = useState(false);
  const intervalRef = useRef(null);

  // ── Load training status on mount ─────────────────────────────────────────
  useEffect(() => {
    if (champion?.id && user?.username) fetchStatus();
  }, [champion?.id]);

  // ── Live timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (training?.active && training?.startedAt) {
      const tick = () => setElapsed(Math.floor((Date.now() - training.startedAt) / 1000));
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(intervalRef.current);
      setElapsed(0);
    }
    return () => clearInterval(intervalRef.current);
  }, [training?.active, training?.startedAt]);

  // ── Keep gold in sync with user context ───────────────────────────────────
  useEffect(() => { setGold(user?.gold ?? 0); }, [user?.gold]);

  async function fetchStatus() {
    try {
      const res = await api.get(`/api/training/status/${champion.id}/${user.username}`);
      setTraining(res.data.training);
      setGold(res.data.gold);
    } catch {}
    finally { setStatusLoaded(true); }
  }

  async function startTraining(stat) {
    if (!champion) return Alert.alert('Aucun champion', 'Recrute un champion d\'abord.');
    if (gold < COST_PER_HOUR) return Alert.alert('Or insuffisant', 'Il te faut au moins 10 pièces d\'or pour commencer.');
    try {
      setLoadingTrain(stat);
      const res = await api.post('/api/training/start', {
        champId: champion.id, stat, username: user.username,
      });
      setTraining(res.data.training);
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Impossible de démarrer');
    } finally {
      setLoadingTrain(false);
    }
  }

  async function stopTraining() {
    try {
      setLoadingStop(true);
      const res = await api.post('/api/training/stop', {
        champId: champion.id, username: user.username,
      });
      Alert.alert(
        'Entraînement terminé',
        `+${res.data.gain} ${STAT_META[training.stat]?.label}\n-${res.data.goldCost} 🪙\nStat finale : ${res.data.newStat}`,
      );
      setTraining({ active: false });
      setGold(res.data.newGold);
      setUser(u => ({ ...u, gold: res.data.newGold }));
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Impossible d\'arrêter');
    } finally {
      setLoadingStop(false);
    }
  }

  function buyColis(item) {
    if (!user) return Alert.alert('Connexion requise');
    if (gold < item.price) return Alert.alert('Or insuffisant', `Il te faut ${item.price} pièces d'or.`);
    if (!champion) return Alert.alert('Aucun champion', 'Recrute un champion d\'abord.');

    Alert.alert(
      `Envoyer ${item.name} ?`,
      `${item.description}\nCoût : ${item.price} 🪙`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer', onPress: async () => {
            try {
              const res = await api.post('/api/shop/buy', { username: user.username, itemId: item.id });
              setGold(res.data.newGold);
              setUser(u => ({ ...u, gold: res.data.newGold }));
              sendSupply(champion.id, item.type);
              Alert.alert('Colis largué !', 'Ton champion se dirige vers le paquet.');
            } catch (e) {
              Alert.alert('Erreur', e.response?.data?.error || 'Le colis n\'a pas pu être envoyé.');
            }
          },
        },
      ],
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const hoursElapsed    = elapsed / 3600;
  const previewGain     = Math.round(hoursElapsed * GAIN_PER_HOUR * 10) / 10;
  const previewCost     = Math.ceil(hoursElapsed * COST_PER_HOUR);
  const activeMeta      = training?.active ? STAT_META[training.stat] : null;

  // ── Render training tab ────────────────────────────────────────────────────
  function renderTraining() {
    if (!statusLoaded && champion) {
      return <ActivityIndicator color="#e2b96f" style={{ marginTop: 40 }} />;
    }

    if (training?.active) {
      const hh  = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const mm  = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const ss  = String(elapsed % 60).padStart(2, '0');
      return (
        <View>
          <TrainingAnimation stat={training.stat} />

          <View style={[styles.activeCard, { borderColor: activeMeta?.color + '66' }]}>
            <View style={styles.activeHeader}>
              <Text style={styles.activeIcon}>{activeMeta?.icon}</Text>
              <View>
                <Text style={[styles.activeStatName, { color: activeMeta?.color }]}>
                  {activeMeta?.label}
                </Text>
                <Text style={styles.activeTimer}>{hh}:{mm}:{ss}</Text>
              </View>
            </View>

            <View style={styles.previewRow}>
              <View style={styles.previewChip}>
                <Text style={styles.previewVal}>+{previewGain}</Text>
                <Text style={styles.previewLabel}>gain stat</Text>
              </View>
              <View style={styles.previewChip}>
                <Text style={[styles.previewVal, { color: '#e74c3c' }]}>-{previewCost} 🪙</Text>
                <Text style={styles.previewLabel}>coût actuel</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.stopBtn, loadingStop && styles.btnDisabled]}
              onPress={stopTraining}
              disabled={loadingStop}
            >
              {loadingStop
                ? <ActivityIndicator color="#0d0d1a" />
                : <Text style={styles.stopBtnText}>⏹ Arrêter l'entraînement</Text>}
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.sectionHint}>10 🪙/heure · +0.1 stat/heure · un seul à la fois</Text>
        {Object.entries(STAT_META).map(([stat, meta]) => {
          const currentVal = champion?.stats?.[stat] ?? 0;
          const isMax      = currentVal >= 10;
          const canAfford  = gold >= COST_PER_HOUR;
          const isLoading  = loadingTrain === stat;
          return (
            <View key={stat} style={[styles.trainCard, { borderColor: meta.color + '33' }]}>
              <Text style={styles.trainIcon}>{meta.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.trainStatName}>{meta.label}</Text>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${currentVal * 10}%`, backgroundColor: meta.color }]} />
                </View>
                <Text style={styles.trainStatVal}>{currentVal.toFixed(1)} / 10</Text>
              </View>
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: meta.color }, (!canAfford || isMax || !champion) && styles.btnDisabled]}
                onPress={() => startTraining(stat)}
                disabled={!canAfford || isMax || !champion || !!loadingTrain}
              >
                {isLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.startBtnText}>{isMax ? 'MAX' : '▶'}</Text>}
              </TouchableOpacity>
            </View>
          );
        })}
        {!champion && (
          <Text style={styles.nochampHint}>Va dans l'onglet Champion pour recruter ton combattant.</Text>
        )}
        {champion && gold < COST_PER_HOUR && (
          <Text style={styles.nochampHint}>Il te faut au moins 10 🪙 pour commencer un entraînement.</Text>
        )}
      </View>
    );
  }

  // ── Render supplies tab ────────────────────────────────────────────────────
  function renderSupplies() {
    return (
      <View>
        <Text style={styles.sectionHint}>Les colis sont largués sur la carte · ton champion s'y rend pour les ramasser</Text>
        {SUPPLY_ITEMS.map(item => (
          <View key={item.id} style={styles.supplyCard}>
            <Text style={styles.supplyIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supplyName}>{item.name}</Text>
              <Text style={styles.supplyDesc}>{item.description}</Text>
            </View>
            <TouchableOpacity
              style={[styles.buyBtn, gold < item.price && styles.buyBtnDisabled]}
              onPress={() => buyColis(item)}
              disabled={gold < item.price}
            >
              <Text style={styles.buyBtnText}>🪙 {item.price}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Gold bar */}
      <View style={styles.goldBar}>
        <Text style={styles.goldIcon}>🪙</Text>
        <Text style={styles.goldText}>{gold} pièces d'or</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['Entraînement', 'Colis bataille'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'Entraînement' ? renderTraining() : renderSupplies()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  content:   { padding: 16, paddingBottom: 40 },

  goldBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a2e', borderRadius: 10,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#e2b96f44',
  },
  goldIcon: { fontSize: 20 },
  goldText: { color: '#e2b96f', fontSize: 18, fontWeight: 'bold' },

  tabs: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#111122', alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  tabActive:     { backgroundColor: '#e2b96f22', borderColor: '#e2b96f' },
  tabText:       { color: '#555', fontWeight: 'bold', fontSize: 13 },
  tabTextActive: { color: '#e2b96f' },

  sectionHint: { color: '#444', fontSize: 11, textAlign: 'center', marginBottom: 14 },
  nochampHint: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 16 },

  // ── Training: inactive ──────────────────────────────────────
  trainCard: {
    backgroundColor: '#111122', borderRadius: 10, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 10, borderWidth: 1,
  },
  trainIcon:     { fontSize: 22 },
  trainStatName: { color: '#ccc', fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  trainStatVal:  { color: '#555', fontSize: 10, marginTop: 2 },
  barBg:   { height: 4, backgroundColor: '#1a1a2e', borderRadius: 2, overflow: 'hidden', width: '100%' },
  barFill: { height: 4, borderRadius: 2 },
  startBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  startBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnDisabled:  { opacity: 0.35 },

  // ── Training: active ────────────────────────────────────────
  activeCard: {
    backgroundColor: '#111122', borderRadius: 12, padding: 16,
    borderWidth: 1, marginTop: 4,
  },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  activeIcon:   { fontSize: 32 },
  activeStatName: { fontSize: 18, fontWeight: 'bold' },
  activeTimer:  { color: '#e2b96f', fontSize: 22, fontWeight: 'bold', fontVariant: ['tabular-nums'] },

  previewRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  previewChip: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 8,
    padding: 10, alignItems: 'center',
  },
  previewVal:   { color: '#2ecc71', fontSize: 16, fontWeight: 'bold' },
  previewLabel: { color: '#555', fontSize: 10, marginTop: 2 },

  stopBtn: {
    backgroundColor: '#e74c3c', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  stopBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  // ── Supplies ────────────────────────────────────────────────
  supplyCard: {
    backgroundColor: '#111122', borderRadius: 10, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 10, borderWidth: 1, borderColor: '#1a1a2e',
  },
  supplyIcon: { fontSize: 24 },
  supplyName: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  supplyDesc: { color: '#555', fontSize: 11, marginTop: 2, lineHeight: 16 },
  buyBtn: {
    backgroundColor: '#e2b96f', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 10,
  },
  buyBtnDisabled: { backgroundColor: '#333', opacity: 0.4 },
  buyBtnText: { color: '#0d0d1a', fontWeight: 'bold', fontSize: 12 },
});
