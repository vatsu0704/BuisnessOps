import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import TabBarIcon from '@/components/TabBarIcon';
import AlertsScreen from '@/screens/AlertsScreen';
import HomeScreen from '@/screens/HomeScreen';
import ReportsScreen from '@/screens/ReportsScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import { colors } from '@/theme';

export type AppTabParamList = {
  Home: undefined;
  Reports: undefined;
  Alerts: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

export default function AppNavigator() {
  const { t } = useTranslation();

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
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.home'),
          tabBarIcon: (props) => <TabBarIcon {...props} name="chatbubble-ellipses-outline" />,
        }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          tabBarLabel: t('tabs.reports'),
          tabBarIcon: (props) => <TabBarIcon {...props} name="bar-chart-outline" />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarLabel: t('tabs.alerts'),
          tabBarIcon: (props) => <TabBarIcon {...props} name="notifications-outline" />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: t('tabs.settings'),
          tabBarIcon: (props) => <TabBarIcon {...props} name="options-outline" />,
        }}
      />
    </Tab.Navigator>
  );
}
