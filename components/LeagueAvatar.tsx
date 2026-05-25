import { Image, Text, View, StyleSheet } from 'react-native';

type Props = {
  photoUrl?: string;
  leagueName?: string;
  size?: number;
};

export default function LeagueAvatar({ photoUrl, leagueName, size = 48 }: Props) {
  const radius = size / 2;
  const fontSize = Math.floor(size * 0.45);

  if (photoUrl) {
    return (
      <View style={[styles.circle, { width: size, height: size, borderRadius: radius }]}>
        <Image source={{ uri: photoUrl }} style={{ width: size, height: size, borderRadius: radius }} />
      </View>
    );
  }

  const initial = (leagueName || '').trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.circle, styles.placeholder, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.initial, { fontSize }]}>{initial || '🏆'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a' },
  placeholder: { backgroundColor: '#1a1a1a' },
  initial: { color: '#ffffff', fontWeight: '700' },
});
