import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import type { Edge } from 'react-native-safe-area-context';

const IN_TABS: Edge[] = ['top', 'left', 'right'];
const ON_ITS_OWN: Edge[] = ['top', 'left', 'right', 'bottom'];

/**
 * Which edges a screen's `SafeAreaView` should keep clear of.
 *
 * Several screens are a tab for one role and a pushed modal for another — the
 * counter is a cashier's tab and an owner's modal, the supply cart and catalog
 * the same. As a tab, the tab bar sits below the screen and already keeps clear
 * of the phone's navigation bar, so the screen must leave the bottom alone or
 * it would be padded twice. As a modal there is no tab bar, and the screen has to
 * keep clear of the navigation bar itself.
 *
 * Before Expo SDK 54 the second case did not matter: Android drew its navigation
 * bar outside the app. SDK 54 is edge-to-edge on every Android version, and
 * Android 16 allows no way out of it, so a modal that skipped `bottom` put its
 * last button under the bar.
 *
 * `BottomTabBarHeightContext` is set by the tab navigator for its own screens and
 * undefined everywhere else, which is exactly the question being asked.
 */
export function useScreenEdges(): Edge[] {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  return inTabs ? IN_TABS : ON_ITS_OWN;
}
