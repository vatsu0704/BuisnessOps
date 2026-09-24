import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import TabBarIcon from '@/components/TabBarIcon';
import CounterScreen from '@/screens/CounterScreen';
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
  Counter: undefined;
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
  labelKey: 'tabs.home' | 'tabs.counter' | 'tabs.products' | 'tabs.staff' | 'tabs.reports' | 'tabs.settings';
  capability: Capability | null;
  /**
   * Give up the tab slot when the viewer also holds this, because the surface
   * is not their daily work. It stays reachable as a stack route and from Home.
   *
   * This exists for one reason: **five tabs is the budget.** At six, a 320dp
   * phone gives each tab about 53dp, and the labels do not fit — "ઉત્પાદનો",
   * "કાઉન્ટર" and their Hindi and Marathi equivalents truncate before the
   * English ones do, so the languages most likely to be used are the ones that
   * break first. A tab bar is not the place to discover that.
   */
  demoteWhen?: Capability;
}[] = [
  // The icon was `chatbubble-ellipses-outline`, borrowed from the AI ask bar
  // that requirement 7 hides. A chat bubble on a tab that now opens a product
  // catalog would promise the one thing this release deliberately removed.
  { name: 'Home', component: HomeScreen, icon: 'home-outline', labelKey: 'tabs.home', capability: null },
  // The till. Sits immediately after Home because for a cashier it is the job.
  //
  // An owner or manager may ring up too (requirement 1 names the manager), but
  // it is not what their day is — so for them it comes off the tab bar and
  // stays on Home and as a route. That is what keeps everyone inside the
  // five-tab budget above.
  {
    name: 'Counter',
    component: CounterScreen,
    icon: 'calculator-outline',
    labelKey: 'tabs.counter',
    capability: 'counterOrder:create',
    demoteWhen: 'analytics:viewBusiness',
  },
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

  const tabs = TAB_CATALOGUE.filter(
    (tab) =>
      (!tab.capability || hasCapability(membership, tab.capability)) &&
      !(tab.demoteWhen && hasCapability(membership, tab.demoteWhen))
  );

  // The budget is a rule, not a hope. If a later task adds a sixth tab for some
  // role, this is where that gets noticed — in development, immediately —
  // rather than in a screenshot of truncated Gujarati labels.
  if (__DEV__ && tabs.length > 5) {
    // eslint-disable-next-line no-console
    console.warn(
      `[tabs] ${tabs.length} tabs for role ${membership?.role}: ${tabs.map((t) => t.name).join(', ')}. ` +
        `Five is the budget — labels truncate at six on a narrow phone. Give one a demoteWhen.`
    );
  }

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
