import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useGame } from '../context/GameContext';

export default function MessagerieScreen() {
  const { user, messages, loadMessages, sendMessage } = useGame();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);
    await sendMessage(input.trim());
    setInput('');
    setSending(false);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function renderMessage({ item }) {
    const isMe = item.sponsorId === user?.id;
    const authorLine = item.champName
      ? `${item.username}  ⚔️ ${item.champName}`
      : item.username;
    return (
      <View style={[styles.msgWrapper, isMe && styles.msgWrapperMe]}>
        {!isMe && <Text style={styles.msgAuthor}>{authorLine}</Text>}
        {isMe && item.champName && (
          <Text style={[styles.msgAuthor, styles.msgAuthorMe]}>{item.champName} ⚔️</Text>
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
        </View>
        <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>{formatTime(item.createdAt)}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucun message — sois le premier à parler !</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Barre de saisie */}
      <View style={styles.inputBar}>
        {!user && (
          <Text style={styles.loginWarning}>Connecte-toi pour envoyer des messages</Text>
        )}
        {user && (
          <>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Message..."
              placeholderTextColor="#444"
              maxLength={200}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.sendBtnText}>Envoyer</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#444', fontSize: 14 },
  list: { padding: 12, paddingBottom: 8 },

  msgWrapper: { marginBottom: 12, maxWidth: '80%', alignSelf: 'flex-start' },
  msgWrapperMe: { alignSelf: 'flex-end' },
  msgAuthor:   { color: '#e2b96f', fontSize: 11, marginBottom: 3, marginLeft: 4 },
  msgAuthorMe: { textAlign: 'right', marginRight: 4, marginLeft: 0 },
  bubble: {
    borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12,
  },
  bubbleOther: { backgroundColor: '#1a1a2e' },
  bubbleMe: { backgroundColor: '#e2b96f' },
  msgText: { color: '#ddd', fontSize: 14, lineHeight: 20 },
  msgTextMe: { color: '#0d0d1a' },
  msgTime: { color: '#444', fontSize: 10, marginTop: 3, marginLeft: 4 },
  msgTimeMe: { textAlign: 'right', marginRight: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, backgroundColor: '#111122',
    borderTopWidth: 1, borderTopColor: '#1a1a2e',
  },
  loginWarning: { color: '#555', fontSize: 13, flex: 1, textAlign: 'center' },
  input: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 14,
    color: '#fff', fontSize: 14,
  },
  sendBtn: {
    backgroundColor: '#e2b96f', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#0d0d1a', fontWeight: 'bold', fontSize: 13 },
});
