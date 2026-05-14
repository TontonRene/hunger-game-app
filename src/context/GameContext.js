import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setAuthToken, updateBaseUrl } from '../utils/api';

const SERVER_URL = 'https://hunger-game-backend.onrender.com';
const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [ready, setReady] = useState(false); // false = encore en train de charger
  const [user, setUser] = useState(null);
  const [champion, setChampion] = useState(null);
  const [battleState, setBattleState] = useState(null);
  const [battleId, setBattleId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [serverUrl, setServerUrlState] = useState(SERVER_URL);
  const socketRef = useRef(null);

  // Restaure la session au démarrage
  useEffect(() => {
    async function restoreSession() {
      try {
        const [savedUrl, savedUser, savedToken, savedChampion] = await Promise.all([
          AsyncStorage.getItem('server_url'),
          AsyncStorage.getItem('user'),
          AsyncStorage.getItem('token'),
          AsyncStorage.getItem('champion'),
        ]);

        const url = savedUrl || SERVER_URL;
        setServerUrlState(url);
        updateBaseUrl(url);

        if (savedToken && savedUser) {
          setAuthToken(savedToken);
          setUser(JSON.parse(savedUser));
        }

        if (savedChampion) {
          setChampion(JSON.parse(savedChampion));
        }
      } catch (e) {
        console.warn('Erreur restauration session:', e);
      } finally {
        setReady(true);
      }
    }
    restoreSession();
  }, []);

  // Sauvegarde le champion dans AsyncStorage dès qu'il change
  useEffect(() => {
    if (champion) AsyncStorage.setItem('champion', JSON.stringify(champion));
    else AsyncStorage.removeItem('champion');
  }, [champion]);

  // WebSocket quand une bataille est active
  useEffect(() => {
    if (!battleId || !serverUrl) return;
    const socket = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join_battle', battleId));
    socket.on('battle_state', (state) => setBattleState(state));
    return () => socket.disconnect();
  }, [battleId, serverUrl]);

  function setServerUrl(url) {
    setServerUrlState(url);
    updateBaseUrl(url);
    AsyncStorage.setItem('server_url', url);
  }

  async function login(username, password) {
    const res = await api.post('/api/auth/login', { username, password });
    const { user: u, token } = res.data;
    setAuthToken(token);
    setUser(u);
    await AsyncStorage.setItem('user', JSON.stringify(u));
    await AsyncStorage.setItem('token', token);
    return res.data;
  }

  async function register(username, password) {
    const res = await api.post('/api/auth/register', { username, password });
    const { user: u, token } = res.data;
    setAuthToken(token);
    setUser(u);
    await AsyncStorage.setItem('user', JSON.stringify(u));
    await AsyncStorage.setItem('token', token);
    return res.data;
  }

  async function logout() {
    setUser(null);
    setChampion(null);
    await AsyncStorage.multiRemove(['user', 'token', 'champion']);
  }

  async function loadChampion(id) {
    const res = await api.get(`/api/champions/${id}`);
    setChampion(res.data);
  }

  async function sendSupply(champId, supplyType) {
    if (!battleId || !socketRef.current) return;
    socketRef.current.emit('send_supply', { battleId, champId, supplyType });
  }

  async function loadMessages() {
    try {
      const res = await api.get('/api/messages');
      setMessages(res.data);
    } catch {}
  }

  async function sendMessage(text) {
    if (!user) return;
    const res = await api.post('/api/messages', {
      sponsorId: user.id,
      username: user.username,
      text,
    });
    setMessages((prev) => [...prev, res.data]);
  }

  return (
    <GameContext.Provider
      value={{
        ready,
        user, setUser,
        champion, setChampion, loadChampion,
        battleState, battleId, setBattleId,
        messages, loadMessages, sendMessage,
        sendSupply,
        login, register, logout,
        serverUrl, setServerUrl,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
