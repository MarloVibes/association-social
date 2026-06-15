import { useState } from 'react';
import { Image, View, Text } from 'react-native';
import { getTeamLogoLocal, getTeamLogoUrl } from '@/constants/teamColors';
import { getSportLogoUrl } from '@/constants/sportTeams';

// Sport-aware team logo. NBA uses the existing local-asset/era system; MLB/NFL
// use the ESPN CDN. If a remote logo fails to load, falls back to a colored
// abbreviation badge so nothing renders blank.
export default function SportTeamLogo({
  sport, abbr, era, style, textColor = '#ffffff', fontSize = 14,
}: {
  sport?: string; abbr?: string; era?: any; style?: any; textColor?: string; fontSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!abbr) return null;

  if (!sport || sport === 'nba') {
    return (
      <Image
        source={getTeamLogoLocal(abbr, era) || { uri: getTeamLogoUrl(abbr, era) }}
        style={style}
        resizeMode="contain"
      />
    );
  }

  const url = getSportLogoUrl(sport, abbr);
  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={style}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 8 }]}>
      <Text style={{ color: textColor, fontWeight: '900', fontSize }}>{abbr}</Text>
    </View>
  );
}
