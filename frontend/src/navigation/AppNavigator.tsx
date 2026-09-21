import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddBranchScreen from '@/screens/AddBranchScreen';
import UploadScreen from '@/screens/UploadScreen';
import AttendanceScreen from '@/screens/AttendanceScreen';
import AddStaffScreen from '@/screens/AddStaffScreen';
import EditStaffScreen from '@/screens/EditStaffScreen';
import StaffDetailScreen from '@/screens/StaffDetailScreen';
import PayrollRunScreen from '@/screens/PayrollRunScreen';
import WorkCalendarScreen from '@/screens/WorkCalendarScreen';
import TeamScreen from '@/screens/TeamScreen';
import InviteMemberScreen from '@/screens/InviteMemberScreen';
import TabNavigator from './TabNavigator';

export type AppStackParamList = {
  Tabs: undefined;
  AddBranch: undefined;
  Upload: undefined;
  Attendance: undefined;
  AddStaff: undefined;
  StaffDetail: { staffMemberId: string };
  EditStaff: { staffMemberId: string };
  PayrollRun: { month: number; year: number; branchId?: string | null };
  WorkCalendar: undefined;
  Team: undefined;
  InviteMember: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

// The tabs are the app; anything that should sit over them (forms, detail sheets)
// becomes a screen here rather than another tab.
//
// The old `Staff` modal is gone — its list is now the Staff tab
// (StaffHubScreen). Keeping both would have meant two routes named Staff, one a
// tab and one a modal, and every navigate('Staff') would be ambiguous to read.
export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="AddBranch" component={AddBranchScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Upload" component={UploadScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AddStaff" component={AddStaffScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="StaffDetail" component={StaffDetailScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EditStaff" component={EditStaffScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="PayrollRun" component={PayrollRunScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="WorkCalendar" component={WorkCalendarScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Team" component={TeamScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="InviteMember" component={InviteMemberScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
