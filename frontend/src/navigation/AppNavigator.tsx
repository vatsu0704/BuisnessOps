import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddBranchScreen from '@/screens/AddBranchScreen';
import UploadScreen from '@/screens/UploadScreen';
import AttendanceScreen from '@/screens/AttendanceScreen';
import StaffScreen from '@/screens/StaffScreen';
import AddStaffScreen from '@/screens/AddStaffScreen';
import StaffDetailScreen from '@/screens/StaffDetailScreen';
import TeamScreen from '@/screens/TeamScreen';
import InviteMemberScreen from '@/screens/InviteMemberScreen';
import TabNavigator from './TabNavigator';

export type AppStackParamList = {
  Tabs: undefined;
  AddBranch: undefined;
  Upload: undefined;
  Attendance: undefined;
  Staff: undefined;
  AddStaff: undefined;
  StaffDetail: { staffMemberId: string };
  Team: undefined;
  InviteMember: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

// The tabs are the app; anything that should sit over them (forms, detail sheets)
// becomes a screen here rather than another tab.
export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="AddBranch" component={AddBranchScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Upload" component={UploadScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Staff" component={StaffScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AddStaff" component={AddStaffScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="StaffDetail" component={StaffDetailScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Team" component={TeamScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="InviteMember" component={InviteMemberScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
