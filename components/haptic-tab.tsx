import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';

export function HapticTab(props: BottomTabBarButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <PlatformPressable
      {...props}
      onPressIn={(e) => {
        setPressed(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        props.onPressOut?.(e);
      }}
      style={[
        props.style,
        pressed && { opacity: 0.7 },
      ]}
    />
  );
}
