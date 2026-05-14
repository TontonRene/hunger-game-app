import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGame } from '../context/GameContext';

export default function AuthScreen() {
  const { login, register, setServerUrl } = useGame();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUrlConfig, setShowUrlConfig] = useState(false);
  const [serverInput, setServerInput] = useState('');

  async function saveServerUrl() {
    const url = serverInput.trim().replace(/\/$/, '');
    if (!url.startsWith('http')) return Alert.alert('URL invalide', 'Commence par http:// ou https://');
    await AsyncStorage.setItem('server_url', url);
    setServerUrl(url);
    setShowUrlConfig(false);
    Alert.alert('✓ Serveur configuré', url);
  }

  async function handleSubmit() {
    if (!username.trim() || !password.trim()) return Alert.alert('Champs manquants');
    setLoading(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), password);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Serveur inaccessible';
      Alert.alert('Erreur', `${msg}\n\nVérifie l'URL du serveur (⚙️ en bas).`);
    } finally {
      setLoading(false);
    }
  }

  if (showUrlConfig) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>⚙️</Text>
          <Text style={styles.title}>SERVEUR</Text>
          <Text style={styles.subtitle}>Entre l'URL affichée dans le terminal</Text>
          <TextInput
            style={styles.input}
            placeholder="https://xxxx.loca.lt"
            placeholderTextColor="#444"
            value={serverInput}
            onChangeText={setServerInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.submitBtn} onPress={saveServerUrl}>
            <Text style={styles.submitBtnText}>Sauvegarder</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn} onPress={() => setShowUrlConfig(false)}>
            <Text style={styles.backBtnText}>← Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>⚔️</Text>
        <Text style={styles.title}>HUNGER GAME</Text>
        <Text style={styles.subtitle}>Devenez sponsor. Survivez.</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Connexion</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'register' && styles.tabActive]}
            onPress={() => setMode('register')}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Inscription</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Pseudo"
          placeholderTextColor="#444"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          placeholderTextColor="#444"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitBtnText}>
            {loading ? '...' : mode === 'login' ? 'Se connecter' : "S'inscrire"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.configBtn} onPress={() => setShowUrlConfig(true)}>
          <Text style={styles.configBtnText}>⚙️ Configurer le serveur</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { fontSize: 52, marginBottom: 12 },
  title: { color: '#e2b96f', fontSize: 26, fontWeight: 'bold', letterSpacing: 4 },
  subtitle: { color: '#555', fontSize: 13, marginBottom: 36, letterSpacing: 1 },

  tabs: { flexDirection: 'row', marginBottom: 24, gap: 0, width: '100%' },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: '#1a1a2e',
  },
  tabActive: { borderBottomColor: '#e2b96f' },
  tabText: { color: '#555', fontWeight: 'bold' },
  tabTextActive: { color: '#e2b96f' },

  input: {
    width: '100%', backgroundColor: '#111122',
    borderRadius: 10, padding: 14, marginBottom: 12,
    color: '#fff', fontSize: 15,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  submitBtn: {
    width: '100%', backgroundColor: '#e2b96f',
    borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#0d0d1a', fontWeight: 'bold', fontSize: 16 },
  configBtn: { marginTop: 20, padding: 10 },
  configBtnText: { color: '#444', fontSize: 13 },
  backBtn: { marginTop: 16, padding: 10 },
  backBtnText: { color: '#888', fontSize: 14 },
});
