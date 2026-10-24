import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const C = { bg: "#090c1c", active: "#e333ff", muted: "#7f87a8", border: "#252043" };

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 7);
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.active,
      tabBarInactiveTintColor: C.muted,
      tabBarStyle: { position: "relative", height: 59 + bottomPadding, paddingTop: 7, paddingBottom: bottomPadding, backgroundColor: C.bg, borderTopColor: C.border, borderTopWidth: 1 },
      tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
    }}>
      <Tabs.Screen name="index" options={{ title: "Biblioteca", tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="favorites" options={{ title: "Favoritos", tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "Mais", tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
