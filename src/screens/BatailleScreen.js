import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useGame } from '../context/GameContext';
import BattleMap from '../components/BattleMap';
import api from '../utils/api';

const ADMIN = 'stan';

export default function BatailleScreen() {
  const { battleState, battleId, setBattleId, champion, sendSupply, user } = useGame();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const isAdmin = user?.username === ADMIN;

  // Cherche une bataille active au démarrage
  useEffect(() => {
    checkActiveBattle();
  }, []);

  async function checkActiveBattle() {
    try {
      setChecking(true);
      const res = await api.get('/api/battle/active');
      if (res.data.battleId) setBattleId(res.data.battleId);
    } catch {}
    finally { setChecking(false); }
  }

  async function startBattle() {
    Alert.alert(
      'Lancer la bataille ?',
      'Tous les champions inscrits en Firestore vont entrer sur la carte. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: '⚔️ Lancer', onPress: async () => {
            try {
              setLoading(true);
              const res = await api.post('/api/battle/start');
              setBattleId(res.data.battleId);
            } catch (e) {
              Alert.alert('Erreur', e.response?.data?.error || 'Impossible de lancer la bataille');
            } finally {
              setLoading(false);
            }
          }
        },
      ]
    );
  }

  const alive = battleState?.champions?.filter(c => c.hp > 0) || [];
  const myChamp = battleState?.champions?.find(c => c.id === champion?.id);
  const isAlive = myChamp && myChamp.hp > 0;
  const recentEvents = battleState?.events?.slice(-6).reverse() || [];
  const isFinished = battleState?.status === 'finished';

  if (checking) return (
    <View style={styles.center}>
      <ActivityIndicator color="#e2b96f" size="large" />
    </View>
  );

  // Pas de bataille en cours
  if (!battleId) {
    return (
      <View style={styles.center}>
        <Text style={styles.waitIcon}>⚔️</Text>
        <Text style={styles.waitTitle}>Aucune bataille en cours</Text>
        <Text style={styles.waitSub}>La prochaine bataille sera annoncée prochainement.</Text>

        {isAdmin && (
          <TouchableOpacity
            style={[styles.adminBtn, loading && styles.btnDisabled]}
            onPress={startBattle}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#0d0d1a" />
              : <Text style={styles.adminBtnText}>⚡ LANCER LA BATAILLE</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Bataille terminée
  if (isFinished) {
    const winner = battleState?.champions?.find(c => c.id === battleState.winner);
    return (
      <View style={styles.center}>
        <Text style={styles.waitIcon}>👑</Text>
        <Text style={styles.waitTitle}>Bataille terminée !</Text>
        {winner && (
          <>
            <Text style={styles.winnerName}>{winner.name}</Text>
            <Text style={styles.waitSub}>sponsorisé par {winner.sponsorUsername || '?'}</Text>
          </>
        )}
        {isAdmin && (
          <TouchableOpacity style={styles.adminBtn} onPress={startBattle}>
            <Text style={styles.adminBtnText}>⚡ NOUVELLE BATAILLE</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Bataille en cours
  return (
    <View style={styles.container}>

      {/* Carte 3D */}
      <View style={styles.mapContainer}>
        <BattleMap battleState={battleState} />
      </View>

      {/* Barre de stats */}
      <View style={styles.statsBar}>
        <View style={styles.statChip}>
          <Text style={styles.statChipVal}>{alive.length}</Text>
          <Text style={styles.statChipLabel}>Vivants</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statChipVal}>{battleState?.tick || 0}</Text>
          <Text style={styles.statChipLabel}>Tick</Text>
        </View>
        {myChamp && (
          <View style={[styles.statChip, { borderColor: isAlive ? '#2ecc71' : '#e74c3c' }]}>
            <Text style={[styles.statChipVal, { color: isAlive ? '#2ecc71' : '#e74c3c' }]}>
              {isAlive ? `${Math.max(0, Math.round(myChamp.hp))} HP` : '💀'}
            </Text>
            <Text style={styles.statChipLabel}>{myChamp.name}</Text>
          </View>
        )}
      </View>

      {/* Colis si champion vivant */}
      {isAlive && champion && (
        <View style={styles.supplies}>
          <Text style={styles.suppliesLabel}>Envoyer un colis</Text>
          <View style={styles.suppliesRow}>
            {[
              { type: 'soin', label: '🧪 Soin', color: '#2ecc71' },
              { type: 'force', label: '💪 Force', color: '#e74c3c' },
              { type: 'vitesse', label: '⚡ Vitesse', color: '#3498db' },
            ].map(s => (
              <TouchableOpacity
                key={s.type}
                style={[styles.supplyBtn, { borderColor: s.color + '66' }]}
                onPress={() => sendSupply(champion.id, s.type)}
              >
                <Text style={[styles.supplyBtnText, { color: s.color }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Événements récents */}
      {recentEvents.length > 0 && (
        <ScrollView style={styles.events} contentContainerStyle={{ padding: 10 }}>
          {recentEvents.map((e, i) => (
            <Text key={i} style={styles.eventText}>
              {e.type === 'death'
                ? `💀 ${e.name || e.champion} éliminé par ${e.killedByName || e.killedBy}`
                : e.type === 'combat'
                ? `⚔️ ${e.aName || e.a} vs ${e.bName || e.b}`
                : e.type === 'collect'
                ? `📦 ${e.name || e.champion} récupère un colis (${e.supply})`
                : `⚔️ Combat`}
            </Text>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  center: { flex: 1, backgroundColor: '#0d0d1a', alignItems: 'center', justifyContent: 'center', padding: 32 },
  waitIcon: { fontSize: 52, marginBottom: 16 },
  waitTitle: { color: '#e2b96f', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  waitSub: { color: '#555', fontSize: 13, marginTop: 8, textAlign: 'center' },
  winnerName: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginTop: 12 },

  adminBtn: {
    marginTop: 32, backgroundColor: '#e2b96f',
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32,
  },
  btnDisabled: { opacity: 0.5 },
  adminBtnText: { color: '#0d0d1a', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },

  mapContainer: { flex: 1 },

  statsBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#111122', paddingVertical: 8, paddingHorizontal: 12, gap: 8,
  },
  statChip: {
    flex: 1, alignItems: 'center', backgroundColor: '#1a1a2e',
    borderRadius: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  statChipVal: { color: '#e2b96f', fontSize: 14, fontWeight: 'bold' },
  statChipLabel: { color: '#555', fontSize: 10, marginTop: 1 },

  supplies: { backgroundColor: '#111122', paddingHorizontal: 12, paddingVertical: 8 },
  suppliesLabel: { color: '#444', fontSize: 10, marginBottom: 6 },
  suppliesRow: { flexDirection: 'row', gap: 8 },
  supplyBtn: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
    borderWidth: 1,
  },
  supplyBtnText: { fontSize: 12, fontWeight: 'bold' },

  events: { maxHeight: 80, backgroundColor: '#0a0a14' },
  eventText: { color: '#555', fontSize: 11, marginBottom: 2 },
});
