import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import BatailleScreen from '../screens/BatailleScreen';
import LoungeScreen from '../screens/LoungeScreen';
import MessagerieScreen from '../screens/MessagerieScreen';
import BoutiqueScreen from '../screens/BoutiqueScreen';
import ChampionScreen from '../screens/ChampionScreen';
import SimulateurScreen from '../screens/SimulateurScreen';
import AuthScreen from '../screens/AuthScreen';
import { useGame } from '../context/GameContext';

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

  if (!ready) return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#e2b96f" size="large" />
    </View>
  );

  if (!user) return <AuthScreen />;

  return (
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
  );
}
