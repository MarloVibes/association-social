import { StyleSheet, View } from 'react-native';
import { getChannelTheme } from '@/domain/sports/rules';

export default function SportBackground({ sport }: { sport?: string | null }) {
  const theme = getChannelTheme(sport);

  if (theme === 'field') {
    return (
      <View pointerEvents="none" style={[styles.fill, styles.field]}>
        <View style={[styles.verticalLine, styles.fieldMidline]} />
        {[15, 32, 49, 66, 83].map(top => (
          <View key={top} style={[styles.horizontalLine, { top: `${top}%` }]} />
        ))}
        <View style={[styles.endZone, styles.endZoneTop]} />
        <View style={[styles.endZone, styles.endZoneBottom]} />
      </View>
    );
  }

  if (theme === 'diamond') {
    return (
      <View pointerEvents="none" style={[styles.fill, styles.diamondField]}>
        <View style={styles.infieldDiamond} />
        <View style={[styles.foulLine, styles.foulLineLeft]} />
        <View style={[styles.foulLine, styles.foulLineRight]} />
        <View style={styles.mound} />
      </View>
    );
  }

  return null;
}

const LINE = 'rgba(255,255,255,0.075)';

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  court: { backgroundColor: '#17120f' },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINE,
  },
  centerCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 120,
    height: 120,
    marginLeft: -60,
    marginTop: -60,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: LINE,
  },
  key: {
    position: 'absolute',
    left: '50%',
    width: 150,
    height: 125,
    marginLeft: -75,
    borderWidth: 1,
    borderColor: LINE,
  },
  keyTop: { top: -1 },
  keyBottom: { bottom: -1 },
  field: { backgroundColor: '#0d1b13' },
  horizontalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINE,
  },
  verticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: LINE,
  },
  fieldMidline: { left: '50%' },
  endZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '9%',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderColor: LINE,
  },
  endZoneTop: { top: 0, borderBottomWidth: 1 },
  endZoneBottom: { bottom: 0, borderTopWidth: 1 },
  diamondField: { backgroundColor: '#101a13' },
  infieldDiamond: {
    position: 'absolute',
    top: '34%',
    left: '50%',
    width: 150,
    height: 150,
    marginLeft: -75,
    transform: [{ rotate: '45deg' }],
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: 'rgba(123,82,48,0.07)',
  },
  foulLine: {
    position: 'absolute',
    bottom: '24%',
    left: '50%',
    width: 1,
    height: '55%',
    backgroundColor: LINE,
    transformOrigin: 'bottom',
  },
  foulLineLeft: { transform: [{ rotate: '-42deg' }] },
  foulLineRight: { transform: [{ rotate: '42deg' }] },
  mound: {
    position: 'absolute',
    top: '48%',
    left: '50%',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: LINE,
  },
});
