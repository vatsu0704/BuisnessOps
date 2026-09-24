import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import TabBarIcon from '@/components/TabBarIcon';
import HomeScreen from '@/screens/HomeScreen';
import ProductsScreen from '@/screens/ProductsScreen';
import ReportsScreen from '@/screens/ReportsScreen';
import StaffHubScreen from '@/screens/StaffHubScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import { useMembership } from '@/hooks/useBusinessId';
import { hasCapability } from '@/utils/permissions';
import type { Capability } from '@/permissions';
import { colors } from '@/theme';

export type AppTabParamList = {
  Home: undefined;
  Products: undefined;
  Staff: undefined;
  Reports: undefined;
  Settings: undefined;
};

// Staff replaces the Alerts placeholder. Alerts is Phase 5 and not started,
// while attendance and payroll are used every day and were four taps deep
// under Settings. AlertsScreen and its alerts.* translations are deliberately
// kept on disk so Phase 5 reinstates a tab rather than rewriting a screen.

/**
 * Every tab the app has, in the order they appear, each with the capability it
 * needs. A given role mounts the subset it holds.
 *
 * `capability: null` means everyone gets it. Home and Settings are always
 * there: Home because a role with nothing else still needs somewhere to land,
 * and Settings because it holds the language, the business switcher and the
 * way out.
 *
 * Adding a role adds no rows here. Adding a *surface* adds one row, and every
 * role that holds its capability gets it — which is what stops this becoming
 * one tab bar per role.
 */
const TAB_CATALOGUE: {
  name: keyof AppTabParamList;
  component: ComponentType<any>;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: 'tabs.home' | 'tabs.products' | 'tabs.staff' | 'tabs.reports' | 'tabs.settings';
  capability: Capability | null;
}[] = [
  // The icon was `chatbubble-ellipses-outline`, borrowed from the AI ask bar
  // that requirement 7 hides. A chat bubble on a tab that now opens a product
  // catalog would promise the one thing this release deliberately removed.
  { name: 'Home', component: HomeScreen, icon: 'home-outline', labelKey: 'tabs.home', capability: null },
  {
    name: 'Products',
    component: ProductsScreen,
    icon: 'pricetags-outline',
    labelKey: 'tabs.products',
    capability: 'product:view',
  },
  { name: 'Staff', component: StaffHubScreen, icon: 'people-outline', labelKey: 'tabs.staff', capability: null },
  {
    name: 'Reports',
    component: ReportsScreen,
    icon: 'bar-chart-outline',
    labelKey: 'tabs.reports',
    capability: 'analytics:viewBusiness',
  },
  {
    name: 'Settings',
    component: SettingsScreen,
    icon: 'options-outline',
    labelKey: 'tabs.settings',
    capability: null,
  },
];

const Tab = createBottomTabNavigator<AppTabParamList>();

export default function TabNavigator() {
  const { t } = useTranslation();
  // The navigator had no access to the session at all before this. useMembership
  // reads the zustand store directly, so this needs no provider and no
  // restructuring above it.
  const membership = useMembership();

  const tabs = TAB_CATALOGUE.filter((tab) => !tab.capability || hasCapability(membership, tab.capability));

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {tabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarLabel: t(tab.labelKey),
            tabBarIcon: (props) => <TabBarIcon {...props} name={tab.icon} />,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
