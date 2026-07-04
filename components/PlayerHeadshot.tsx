import { useState } from 'react';
import { Image } from 'react-native';

// Sport-aware player headshot. NBA uses basketball-reference (derived from
// bref_id/player_id), MLB derives from the MLB person id, NFL uses a stored
// photo url. If no photo (or it fails to load), renders the provided fallback
// node (e.g. a position circle or initial badge).
export default function PlayerHeadshot({ player, sport, imageStyle, fallback }: {
  player: any; sport?: string; imageStyle?: any; fallback: any;
}) {
  const [failed, setFailed] = useState(false);

  let uri = player?.photo_url || player?.photoUrl || player?.photo || player?.headshot_url || '';
  if (!uri && (!sport || sport === 'nba')) {
    let brefId = player.bref_id || '';
    if (!brefId && player.player_id) {
      const m = String(player.player_id).match(/^(?:current|pool_\d+)_([a-z0-9]+)$/i);
      if (m) brefId = m[1];
    }
    uri = brefId ? 'https://www.basketball-reference.com/req/202106291/images/headshots/' + brefId + '.jpg' : '';
  } else if (!uri && sport === 'mlb') {
    uri = player.player_id ? `https://midfield.mlbstatic.com/v1/people/${player.player_id}/spots/120` : '';
  }

  if (uri && !failed) {
    return <Image source={{ uri }} style={imageStyle} onError={() => setFailed(true)} />;
  }
  return fallback;
}
