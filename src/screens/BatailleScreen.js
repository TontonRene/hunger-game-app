import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useGame } from '../context/GameContext';
import BattleMap from '../components/BattleMap';
import api from '../utils/api';

const ALL_SUPPLIES = [
  { type:'soin',        icon:'🧪', label:'Soins',      price:50,  color:'#2ecc71' },
  { type:'festin',      icon:'🍖', label:'Festin',     price:100, color:'#27ae60' },
  { type:'force',       icon:'🔥', label:'Force',      price:80,  color:'#e74c3c' },
  { type:'vitesse',     icon:'🌀', label:'Vitesse',    price:80,  color:'#3498db' },
  { type:'armure',      icon:'🛡️', label:'Armure',     price:90,  color:'#f39c12' },
  { type:'adrenaline',  icon:'💉', label:'Adrénaline', price:120, color:'#9b59b6' },
  { type:'antidote',    icon:'💊', label:'Antidote',   price:70,  color:'#1abc9c' },
  { type:'camouflage',  icon:'🌑', label:'Camouflage', price:110, color:'#636e72' },
  { type:'carte',       icon:'🗺️', label:'Carte',      price:90,  color:'#e17055' },
  { type:'arbalete',    icon:'🏹', label:'Arbalète',   price:130, color:'#d35400' },
];

const ADMIN = 'GameMaster';

export default function BatailleScreen() {
  const { battleState, battleId, setBattleId, champion, sendSupply, user, setUser } = useGame();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sendingSupply, setSendingSupply] = useState(null); // type en cours d'envoi

  const gold = user?.gold ?? 0;

  async function buyColis(supplyType, price) {
    if (!user || !champion) return;
    if (gold < price) return Alert.alert('Or insuffisant', `Il te faut ${price} 🪙`);
    try {
      setSendingSupply(supplyType);
      const res = await api.post('/api/shop/buy', {
        username: user.username, itemId: `supply_${supplyType}`,
      });
      setUser(u => ({ ...u, gold: res.data.newGold }));
      sendSupply(champion.id, supplyType);
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Envoi impossible');
    } finally {
      setSendingSupply(null);
    }
  }

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
  const recentEvents = battleState?.events?.slice(-10).reverse() || [];
  const isFinished = battleState?.status === 'finished';

  function eventStyle(e) {
    if (e.type === 'death')   return styles.eventDeath;
    if (e.type === 'combat')  return styles.eventCombat;
    if (e.type === 'collect') return styles.eventCollect;
    return styles.eventText;
  }
  function eventLabel(e) {
    if (e.type === 'death')
      return `💀  ${e.name || e.champion} éliminé par ${e.killedByName || e.killedBy}`;
    if (e.type === 'combat')
      return `⚔️  ${e.aName || e.a} vs ${e.bName || e.b}  (${e.dmgA ?? '?'}/${e.dmgB ?? '?'} dmg)`;
    if (e.type === 'collect')
      return `📦  ${e.name || e.champion} récupère ${e.supply}`;
    if (e.type === 'narr')
      return `📜  ${e.text || ''}`;
    return `⚡  ${e.type}`;
  }

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
          <View style={styles.suppliesHeader}>
            <Text style={styles.suppliesLabel}>Envoyer un colis</Text>
            <Text style={styles.goldBadge}>🪙 {gold}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suppliesRow}>
            {ALL_SUPPLIES.map(s => {
              const canAfford = gold >= s.price;
              const isSending = sendingSupply === s.type;
              return (
                <TouchableOpacity
                  key={s.type}
                  style={[styles.supplyBtn, { borderColor: s.color + (canAfford ? '99' : '33') }]}
                  onPress={() => buyColis(s.type, s.price)}
                  disabled={!canAfford || !!sendingSupply}
                  activeOpacity={0.7}
                >
                  {isSending
                    ? <ActivityIndicator size="small" color={s.color} />
                    : <Text style={styles.supplyBtnIcon}>{s.icon}</Text>}
                  <Text style={[styles.supplyBtnLabel, { color: canAfford ? s.color : '#444' }]}>
                    {s.label}
                  </Text>
                  <Text style={[styles.supplyBtnPrice, { color: canAfford ? '#e2b96f' : '#333' }]}>
                    🪙{s.price}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Événements récents */}
      {recentEvents.length > 0 && (
        <View style={styles.eventsContainer}>
          <Text style={styles.eventsHeader}>
            JOURNAL  ·  Tick {battleState?.tick || 0}  ·  {alive.length} vivants
          </Text>
          <ScrollView style={styles.events} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            {recentEvents.map((e, i) => (
              <Text key={i} style={eventStyle(e)} numberOfLines={2}>
                {eventLabel(e)}
              </Text>
            ))}
          </ScrollView>
        </View>
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

  supplies: { backgroundColor: '#111122', paddingVertical: 8 },
  suppliesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, marginBottom: 6 },
  suppliesLabel: { color: '#444', fontSize: 10 },
  goldBadge: { color: '#e2b96f', fontSize: 12, fontWeight: 'bold' },
  suppliesRow: { paddingHorizontal: 12, gap: 8 },
  supplyBtn: {
    backgroundColor: '#1a1a2e', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 10,
    alignItems: 'center', width: 72,
    borderWidth: 1,
  },
  supplyBtnIcon:  { fontSize: 20, marginBottom: 2 },
  supplyBtnLabel: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
  supplyBtnPrice: { fontSize: 9 },

  eventsContainer: { backgroundColor: '#0a0a14', borderTopWidth: 1, borderTopColor: '#1a1a2e' },
  eventsHeader: { color: '#333', fontSize: 9, letterSpacing: 1.5, paddingHorizontal: 10, paddingTop: 5 },
  events: { maxHeight: 130 },
  eventText:    { color: '#666', fontSize: 11, marginBottom: 3, lineHeight: 16 },
  eventDeath:   { color: '#c0392b', fontSize: 11, marginBottom: 3, fontWeight: '600', lineHeight: 16 },
  eventCombat:  { color: '#e67e22', fontSize: 11, marginBottom: 3, lineHeight: 16 },
  eventCollect: { color: '#27ae60', fontSize: 11, marginBottom: 3, lineHeight: 16 },
});
