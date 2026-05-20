import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, TextInput } from 'react-native';
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
  const [sendingSupply, setSendingSupply] = useState(null);
  const [lastBattle, setLastBattle] = useState(null);
  const [adminGoldUser, setAdminGoldUser] = useState('');
  const [adminGoldAmt, setAdminGoldAmt] = useState('50');
  const [adminResetUser, setAdminResetUser] = useState('');

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
      const [activeRes, lastRes] = await Promise.allSettled([
        api.get('/api/battle/active'),
        api.get('/api/battle/last'),
      ]);
      if (activeRes.status === 'fulfilled' && activeRes.value.data.battleId)
        setBattleId(activeRes.value.data.battleId);
      if (lastRes.status === 'fulfilled' && lastRes.value.data.last)
        setLastBattle(lastRes.value.data.last);
    } catch {}
    finally { setChecking(false); }
  }

  async function adminGiveGold() {
    if (!adminGoldUser || !adminGoldAmt) return;
    try {
      await api.post('/api/battle/admin/gold', {
        username: adminGoldUser, amount: Number(adminGoldAmt),
        adminUsername: user.username,
      });
      Alert.alert('✓', `+${adminGoldAmt} 🪙 à ${adminGoldUser}`);
      setAdminGoldUser('');
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Impossible');
    }
  }

  async function adminResetChampion() {
    if (!adminResetUser) return;
    try {
      await api.post('/api/battle/admin/reset-champion', {
        username: adminResetUser, adminUsername: user.username,
      });
      Alert.alert('✓', `Champion de ${adminResetUser} marqué mort`);
      setAdminResetUser('');
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Impossible');
    }
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
      <ScrollView style={styles.container} contentContainerStyle={styles.waitScroll}>
        <Text style={styles.waitIcon}>⚔️</Text>
        <Text style={styles.waitTitle}>Aucune bataille en cours</Text>
        <Text style={styles.waitSub}>La prochaine bataille sera annoncée prochainement.</Text>

        {/* Dernier match */}
        {lastBattle && (
          <View style={styles.lastBattleCard}>
            <Text style={styles.lastBattleLabel}>DERNIER MATCH</Text>
            <Text style={styles.lastBattleWinner}>👑 {lastBattle.winnerName}</Text>
            <Text style={styles.lastBattleSponsor}>sponsorisé par {lastBattle.winnerSponsor}</Text>
            <View style={styles.lastBattleRow}>
              <View style={styles.lastBattleChip}>
                <Text style={styles.lastBattleVal}>{lastBattle.winnerKills}</Text>
                <Text style={styles.lastBattleLbl}>Kills</Text>
              </View>
              <View style={styles.lastBattleChip}>
                <Text style={styles.lastBattleVal}>{lastBattle.ticks}</Text>
                <Text style={styles.lastBattleLbl}>Ticks</Text>
              </View>
              <View style={styles.lastBattleChip}>
                <Text style={styles.lastBattleVal}>{lastBattle.participants}</Text>
                <Text style={styles.lastBattleLbl}>Combattants</Text>
              </View>
              <View style={styles.lastBattleChip}>
                <Text style={styles.lastBattleVal}>{lastBattle.biome}</Text>
                <Text style={styles.lastBattleLbl}>Biome</Text>
              </View>
            </View>
          </View>
        )}

        {/* Bouton lancer */}
        {isAdmin && (
          <TouchableOpacity
            style={[styles.adminBtn, loading && styles.btnDisabled]}
            onPress={startBattle} disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#0d0d1a" />
              : <Text style={styles.adminBtnText}>⚡ LANCER LA BATAILLE</Text>}
          </TouchableOpacity>
        )}

        {/* Panel GameMaster */}
        {isAdmin && (
          <View style={styles.adminPanel}>
            <Text style={styles.adminPanelTitle}>⚙️ PANEL GAMEMASTER</Text>

            <Text style={styles.adminPanelLabel}>Donner de l'or</Text>
            <View style={styles.adminRow}>
              <TextInput
                style={[styles.adminInput, { flex: 2 }]}
                placeholder="username" placeholderTextColor="#333"
                value={adminGoldUser} onChangeText={setAdminGoldUser}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.adminInput, { flex: 1 }]}
                placeholder="quantité" placeholderTextColor="#333"
                value={adminGoldAmt} onChangeText={setAdminGoldAmt}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.adminActionBtn} onPress={adminGiveGold}>
                <Text style={styles.adminActionTxt}>🪙</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.adminPanelLabel}>Tuer le champion d'un sponsor</Text>
            <View style={styles.adminRow}>
              <TextInput
                style={[styles.adminInput, { flex: 1 }]}
                placeholder="username" placeholderTextColor="#333"
                value={adminResetUser} onChangeText={setAdminResetUser}
                autoCapitalize="none"
              />
              <TouchableOpacity style={[styles.adminActionBtn, { backgroundColor: '#c0392b' }]} onPress={adminResetChampion}>
                <Text style={styles.adminActionTxt}>💀</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
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

  waitScroll: { padding: 32, alignItems: 'center', paddingBottom: 48 },

  adminBtn: {
    marginTop: 24, backgroundColor: '#e2b96f',
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32,
  },
  btnDisabled: { opacity: 0.5 },
  adminBtnText: { color: '#0d0d1a', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },

  lastBattleCard: {
    width: '100%', backgroundColor: '#111122', borderRadius: 14,
    padding: 18, marginTop: 24, borderWidth: 1, borderColor: '#e2b96f33',
    alignItems: 'center',
  },
  lastBattleLabel:   { color: '#555', fontSize: 10, letterSpacing: 2, marginBottom: 10 },
  lastBattleWinner:  { color: '#e2b96f', fontSize: 22, fontWeight: 'bold' },
  lastBattleSponsor: { color: '#555', fontSize: 12, marginBottom: 14, marginTop: 2 },
  lastBattleRow:     { flexDirection: 'row', gap: 8, width: '100%' },
  lastBattleChip:    {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  lastBattleVal: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  lastBattleLbl: { color: '#444', fontSize: 9, marginTop: 2 },

  adminPanel: {
    width: '100%', backgroundColor: '#0d0d1a', borderRadius: 14,
    padding: 16, marginTop: 24, borderWidth: 1, borderColor: '#333355',
  },
  adminPanelTitle: { color: '#e2b96f', fontSize: 11, letterSpacing: 2, marginBottom: 16 },
  adminPanelLabel: { color: '#555', fontSize: 11, marginBottom: 6, marginTop: 10 },
  adminRow:        { flexDirection: 'row', gap: 8, alignItems: 'center' },
  adminInput: {
    backgroundColor: '#1a1a2e', borderRadius: 8, borderWidth: 1, borderColor: '#2a2a4a',
    color: '#fff', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
  },
  adminActionBtn: {
    backgroundColor: '#e2b96f', borderRadius: 8,
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  adminActionTxt: { fontSize: 16 },

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
