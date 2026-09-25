import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';
import AddBranchScreen from '@/screens/AddBranchScreen';
import AddBusinessScreen from '@/screens/AddBusinessScreen';
import AddProductScreen from '@/screens/AddProductScreen';
import EditProductScreen from '@/screens/EditProductScreen';
import BranchSettingsScreen from '@/screens/BranchSettingsScreen';
import UploadScreen from '@/screens/UploadScreen';
import AttendanceScreen from '@/screens/AttendanceScreen';
import AddStaffScreen from '@/screens/AddStaffScreen';
import EditStaffScreen from '@/screens/EditStaffScreen';
import StaffDetailScreen from '@/screens/StaffDetailScreen';
import PayrollRunScreen from '@/screens/PayrollRunScreen';
import WorkCalendarScreen from '@/screens/WorkCalendarScreen';
import TeamScreen from '@/screens/TeamScreen';
import InviteMemberScreen from '@/screens/InviteMemberScreen';
import ProductsScreen from '@/screens/ProductsScreen';
import CounterScreen from '@/screens/CounterScreen';
import SupplyCatalogScreen from '@/screens/SupplyCatalogScreen';
import SupplyCartScreen from '@/screens/SupplyCartScreen';
import SupplyOrdersScreen from '@/screens/SupplyOrdersScreen';
import SupplyOrderDetailScreen from '@/screens/SupplyOrderDetailScreen';
import SupplyItemFormScreen from '@/screens/SupplyItemFormScreen';
import WarehouseDeskScreen from '@/screens/WarehouseDeskScreen';
import DeliveryQueueScreen from '@/screens/DeliveryQueueScreen';
import ExpensesScreen from '@/screens/ExpensesScreen';
import AddExpenseScreen from '@/screens/AddExpenseScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import { useMembership } from '@/hooks/useBusinessId';
import TabNavigator from './TabNavigator';
import { canOpenRoute } from './routeAccess';
import { usePushRegistration } from '@/hooks/usePushRegistration';

export type AppStackParamList = {
  Tabs: undefined;
  AddBusiness: undefined;
  AddBranch: undefined;
  BranchSettings: { branchId: string };
  Upload: undefined;
  Attendance: undefined;
  AddStaff: undefined;
  StaffDetail: { staffMemberId: string };
  EditStaff: { staffMemberId: string };
  PayrollRun: { month: number; year: number; branchId?: string | null };
  WorkCalendar: undefined;
  Team: undefined;
  InviteMember: undefined;
  Products: { branchId?: string } | undefined;
  AddProduct: { branchId?: string } | undefined;
  EditProduct: { productId: string };
  Counter: undefined;
  // Supply orders (requirements 3, 5, 5.1, 9, 11, 12).
  SupplyCatalog: undefined;
  SupplyCart: { supplyOrderId: string };
  SupplyOrders: undefined;
  SupplyOrderDetail: { supplyOrderId: string };
  SupplyItemForm: { inventoryItemId?: string } | undefined;
  SupplyDesk: undefined;
  SupplyDeliveries: undefined;
  // Branch expenses (requirement 10). Both take a branch so the back office
  // can follow a branch it is chasing straight into that branch's figures.
  Expenses: { branchId?: string } | undefined;
  AddExpense: { branchId?: string } | undefined;
  // Requirement 8. Open to everyone: it lists your OWN notifications, and
  // there is nobody to withhold that from.
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

// The tabs are the app; anything that should sit over them (forms, detail sheets)
// becomes a screen here rather than another tab.
//
// The old `Staff` modal is gone — its list is now the Staff tab
// (StaffHubScreen). Keeping both would have meant two routes named Staff, one a
// tab and one a modal, and every navigate('Staff') would be ambiguous to read.
const MODAL_SCREENS: { name: keyof AppStackParamList; component: ComponentType<any> }[] = [
  { name: 'AddBusiness', component: AddBusinessScreen },
  { name: 'AddBranch', component: AddBranchScreen },
  { name: 'BranchSettings', component: BranchSettingsScreen },
  { name: 'Upload', component: UploadScreen },
  { name: 'Attendance', component: AttendanceScreen },
  { name: 'AddStaff', component: AddStaffScreen },
  { name: 'StaffDetail', component: StaffDetailScreen },
  { name: 'EditStaff', component: EditStaffScreen },
  { name: 'PayrollRun', component: PayrollRunScreen },
  { name: 'WorkCalendar', component: WorkCalendarScreen },
  { name: 'Team', component: TeamScreen },
  { name: 'InviteMember', component: InviteMemberScreen },
  { name: 'Products', component: ProductsScreen },
  { name: 'AddProduct', component: AddProductScreen },
  { name: 'EditProduct', component: EditProductScreen },
  // Also a tab for a cashier. Registered here as well so an owner or manager,
  // who trades the tab slot for Reports, can still reach the till from Home.
  { name: 'Counter', component: CounterScreen },
  // Same story as Counter: each of these is a tab for the role whose daily
  // work it is, and a pushed screen for everyone who reaches it from Home.
  { name: 'SupplyCatalog', component: SupplyCatalogScreen },
  { name: 'SupplyCart', component: SupplyCartScreen },
  { name: 'SupplyOrders', component: SupplyOrdersScreen },
  { name: 'SupplyOrderDetail', component: SupplyOrderDetailScreen },
  { name: 'SupplyItemForm', component: SupplyItemFormScreen },
  { name: 'SupplyDesk', component: WarehouseDeskScreen },
  { name: 'SupplyDeliveries', component: DeliveryQueueScreen },
  { name: 'Expenses', component: ExpensesScreen },
  { name: 'AddExpense', component: AddExpenseScreen },
  { name: 'Notifications', component: NotificationsScreen },
];

/**
 * Only the routes this person may actually open are registered.
 *
 * Gating registration rather than only hiding the buttons means a stale deep
 * link or a push notification for a screen they have since lost access to
 * cannot open a screen whose every request would 403.
 *
 * `Products` is registered here as well as being a tab, so a branch-scoped
 * catalog can be pushed over the tabs with a `branchId` from elsewhere.
 */
export default function AppNavigator() {
  const membership = useMembership();

  // Registers this device and routes a notification tap. Here rather than in
  // App.tsx because it needs a navigator in scope, and because this component
  // is mounted for exactly as long as somebody is signed in.
  usePushRegistration();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      {MODAL_SCREENS.filter((screen) => canOpenRoute(membership, screen.name)).map((screen) => (
        <Stack.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={{ presentation: 'modal' }}
        />
      ))}
    </Stack.Navigator>
  );
}
