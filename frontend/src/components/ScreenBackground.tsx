import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

type BlobProps = {
  id: string;
  size: number;
  color: string;
  opacity: number;
  top: number;
  left: number;
  driftX: number;
  driftY: number;
  duration: number;
};

function Blob({ id, size, color, opacity, top, left, driftX, driftY, duration }: BlobProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * driftX }, { translateY: progress.value * driftY }],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top, left, width: size, height: size }, animatedStyle]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

export default function ScreenBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#FCFCFF', '#EEF0FB']} style={StyleSheet.absoluteFill} />
      <Blob
        id="bgIndigo"
        size={width * 1.15}
        color="#6366F1"
        opacity={0.3}
        top={-width * 0.5}
        left={width * 0.15}
        driftX={14}
        driftY={10}
        duration={9000}
      />
      <Blob
        id="bgViolet"
        size={width}
        color="#8B5CF6"
        opacity={0.24}
        top={height * 0.58}
        left={-width * 0.38}
        driftX={-12}
        driftY={-14}
        duration={11000}
      />
      <Blob
        id="bgSky"
        size={width * 0.75}
        color="#38BDF8"
        opacity={0.18}
        top={height * 0.28}
        left={width * 0.5}
        driftX={10}
        driftY={-10}
        duration={13000}
      />
    </View>
  );
}
