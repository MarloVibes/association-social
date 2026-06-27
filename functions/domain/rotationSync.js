'use strict';

function playerKey(player) {
  return String(player && (player.player_id || player.playerId || player.id || player.bref_id || player.full_name || player.name) || '');
}

function slotKey(slot) {
  return String(slot && slot.playerId || '');
}

function rotationForRoster(rotation, players) {
  if (!Array.isArray(rotation)) return undefined;
  const rosterIds = new Set((players || []).map(playerKey).filter(Boolean));
  const seen = new Set();
  return rotation.filter((slot) => {
    const id = slotKey(slot);
    if (!id || !rosterIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function reconcileTeamRotation(team, players) {
  const nextPlayers = Array.isArray(players) ? players : [];
  const next = { players: nextPlayers };
  const rotation = rotationForRoster(team && team.rotation, nextPlayers);
  if (rotation) next.rotation = rotation;
  return next;
}

module.exports = {
  playerKey,
  reconcileTeamRotation,
  rotationForRoster,
};
