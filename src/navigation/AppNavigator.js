import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BatailleScreen from '../screens/BatailleScreen';
import LoungeScreen from '../screens/LoungeScreen';
import MessagerieScreen from '../screens/MessagerieScreen';
import BoutiqueScreen from '../screens/BoutiqueScreen';
import ChampionScreen from '../screens/ChampionScreen';
import SimulateurScreen from '../screens/SimulateurScreen';
import AuthScreen from '../screens/AuthScreen';
import { useGame } from '../context/GameContext';

const { width: SW } = Dimensions.get('window');

const ONBOARDING_SLIDES = [
  {
    icon: '👑', title: 'Deviens Sponsor',
    body: 'Recrute un champion dans l\'onglet Champion. Il combattra pour toi dans l\'arène jusqu\'à sa mort.',
  },
  {
    icon: '⚔️', title: 'La Bataille en direct',
    body: 'Suis la carte en temps réel. Zoom, panoramique, et utilise ◀ ▶ pour suivre ton champion. La zone rétrécit — les retardataires meurent.',
  },
  {
    icon: '📦', title: 'Envoie des Colis',
    body: 'Depuis la Boutique ou l\'écran Bataille, achète des colis avec ton or. Soins, camouflage, arbalète… ils sont largués sur la carte.',
  },
  {
    icon: '🏆', title: 'Le Valhalla t\'attend',
    body: 'Si ton champion survit à tous les autres, sa victoire est gravée dans le Valhalla pour l\'éternité. Bonne chance, sponsor.',
  },
];

function OnboardingModal({ visible, onDone }) {
  const [slide, setSlide] = useState(0);
  const scrollRef = useRef(null);

  function goNext() {
    if (slide < ONBOARDING_SLIDES.length - 1) {
      const next = slide + 1;
      setSlide(next);
      scrollRef.current?.scrollTo({ x: next * SW, animated: true });
    } else {
      onDone();
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={ob.overlay}>
        <View style={ob.card}>
          <ScrollView
            ref={scrollRef}
            horizontal pagingEnabled scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={{ width: SW * 0.85 }}
          >
            {ONBOARDING_SLIDES.map((s, i) => (
              <View key={i} style={[ob.slide, { width: SW * 0.85 }]}>
                <Text style={ob.slideIcon}>{s.icon}</Text>
                <Text style={ob.slideTitle}>{s.title}</Text>
                <Text style={ob.slideBody}>{s.body}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Dots */}
          <View style={ob.dots}>
            {ONBOARDING_SLIDES.map((_, i) => (
              <View key={i} style={[ob.dot, i === slide && ob.dotActive]} />
            ))}
          </View>

          <TouchableOpacity style={ob.btn} onPress={goNext}>
            <Text style={ob.btnText}>
              {slide < ONBOARDING_SLIDES.length - 1 ? 'Suivant →' : 'Commencer'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ob = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    width: SW * 0.85, backgroundColor: '#111122',
    borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2b96f33',
    overflow: 'hidden',
  },
  slide:      { alignItems: 'center', paddingBottom: 8 },
  slideIcon:  { fontSize: 52, marginBottom: 16 },
  slideTitle: { color: '#e2b96f', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  slideBody:  { color: '#aaa', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  dots:       { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 20 },
  dot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: '#333' },
  dotActive:  { backgroundColor: '#e2b96f', width: 20 },
  btn: {
    backgroundColor: '#e2b96f', borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 40,
  },
  btnText: { color: '#0d0d1a', fontWeight: 'bold', fontSize: 15 },
});

const Tab = createBottomTabNavigator();

const ICONS = {
  Bataille: { focused: 'flame', unfocused: 'flame-outline' },
  Valhalla: { focused: 'trophy', unfocused: 'trophy-outline' },
  Messages: { focused: 'chatbubbles', unfocused: 'chatbubbles-outline' },
  Boutique: { focused: 'storefront', unfocused: 'storefront-outline' },
  Champion:    { focused: 'shield',    unfocused: 'shield-outline'    },
  Simulateur:  { focused: 'flask',     unfocused: 'flask-outline'     },
};

function LogoutButton() {
  const { logout } = useGame();
  return (
    <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
      <Ionicons name="log-out-outline" size={22} color="#555" />
    </TouchableOpacity>
  );
}

export default function AppNavigator() {
  const { user, ready } = useGame();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const prevUser = useRef(null);

  // Affiche l'onboarding à la première connexion
  useEffect(() => {
    if (user && !prevUser.current) {
      // Nouvel utilisateur connecté — vérifie si onboarding déjà vu
      AsyncStorage.getItem('onboarding_done').then(done => {
        if (!done) setShowOnboarding(true);
      });
    }
    prevUser.current = user;
  }, [user]);

  async function finishOnboarding() {
    await AsyncStorage.setItem('onboarding_done', '1');
    setShowOnboarding(false);
  }

  if (!ready) return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#e2b96f" size="large" />
    </View>
  );

  if (!user) return <AuthScreen />;

  return (
    <>
    <OnboardingModal visible={showOnboarding} onDone={finishOnboarding} />
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            const icon = ICONS[route.name];
            return (
              <Ionicons
                name={focused ? icon.focused : icon.unfocused}
                size={size}
                color={color}
              />
            );
          },
          tabBarActiveTintColor: '#e2b96f',
          tabBarInactiveTintColor: '#555',
          tabBarStyle: {
            backgroundColor: '#0d0d1a',
            borderTopColor: '#1a1a2e',
          },
          headerStyle: { backgroundColor: '#0d0d1a' },
          headerTintColor: '#e2b96f',
          headerTitleStyle: { fontWeight: 'bold' },
        })}
      >
        <Tab.Screen name="Bataille" component={BatailleScreen} />
        <Tab.Screen name="Valhalla" component={LoungeScreen} />
        <Tab.Screen name="Messages" component={MessagerieScreen} />
        <Tab.Screen name="Boutique" component={BoutiqueScreen} />
        <Tab.Screen
          name="Champion"
          component={ChampionScreen}
          options={{ headerRight: () => <LogoutButton /> }}
        />
        <Tab.Screen name="Simulateur" component={SimulateurScreen} />
      </Tab.Navigator>
    </NavigationContainer>
    </>
  );
}
