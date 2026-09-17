import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddBranchScreen from '@/screens/AddBranchScreen';
import UploadScreen from '@/screens/UploadScreen';
import TabNavigator from './TabNavigator';

export type AppStackParamList = {
  Tabs: undefined;
  AddBranch: undefined;
  Upload: undefined;
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
    </Stack.Navigator>
  );
}
