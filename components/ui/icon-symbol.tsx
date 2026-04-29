import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

type Props = ComponentProps<typeof Ionicons>;

export function IconSymbol(props: Props) {
  return <Ionicons {...props} />;
}
