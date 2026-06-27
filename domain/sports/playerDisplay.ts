export function playerJerseyDisplay(player: any): string {
  const jersey = player?.jersey_number ?? player?.jerseyNumber ?? player?.number;
  const value = String(jersey ?? '').trim();
  return value ? `#${value}` : '';
}
