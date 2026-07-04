import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import PlayerHeadshot from '@/components/PlayerHeadshot';
import { getSportArchetypeForYear } from '@/constants/sportArchetype';
import type { NbaGrade, VisibleNbaIdentity } from '@/domain/nba/identity';
import { gradeRank } from '@/domain/nba/gradeScale';
import { selectRosterRatingProfile } from '@/domain/nba/rosterProfile';
import { buildScoutingGrades, gradeColors, type ScoutingGradeKey } from '@/domain/nba/scoutingGrades';
import { buildSportGradePreview } from '@/domain/sports/playerIdentity';

type PlayerRowStatus = {
  label: string;
  tone?: 'good' | 'warn' | 'danger' | 'info';
  color?: string;
};

type PlayerRowAction = {
  label: string;
  onPress?: (event?: any) => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'neutral' | 'danger';
};

type PlayerRowProps = {
  player: any;
  index?: number;
  sport?: string;
  era?: string | null;
  currentYear?: number | string | null;
  leagueDate?: string | Date | null;
  profilesByName?: Record<string, any>;
  salary?: number | string | null;
  salaryLabel?: string;
  meta?: string;
  statusLabels?: PlayerRowStatus[];
  action?: PlayerRowAction | null;
  disabled?: boolean;
  selected?: boolean;
  gradeCount?: 3 | 6;
  showRank?: boolean;
  showSalary?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

const PLAYER_GRADE_PREVIEW: { key: ScoutingGradeKey; label: string }[] = [
  { key: 'closeShot', label: 'Fin' },
  { key: 'midRange', label: 'Mid' },
  { key: 'threePoint', label: '3PT' },
  { key: 'dunking', label: 'Dunk' },
  { key: 'passing', label: 'Pass' },
  { key: 'ballHandle', label: 'Handle' },
  { key: 'offenseIq', label: 'Off IQ' },
  { key: 'perimeterDefense', label: 'Per D' },
  { key: 'postDefense', label: 'Post D' },
  { key: 'blocking', label: 'Block' },
  { key: 'steals', label: 'Steal' },
  { key: 'defenseIq', label: 'Def IQ' },
  { key: 'speed', label: 'Speed' },
  { key: 'rebounding', label: 'Reb' },
  { key: 'postOffense', label: 'Post' },
  { key: 'potential', label: 'Pot' },
];

export function formatFranchisePlayerMoney(value: any) {
  const salary = Number(value);
  if (!Number.isFinite(salary) || salary <= 0) return '$--';
  if (salary <= 1_500_000) return '$Min';
  return '$' + (salary / 1_000_000).toFixed(salary >= 10_000_000 ? 0 : 1) + 'M';
}

function playerKey(player: any) {
  return player?.player_id || player?.id || player?.bref_id || player?.full_name || '';
}

function gradePreview(player: any, profile: any, count: 3 | 6) {
  const grades = buildScoutingGrades(player || {}, profile || null);
  return PLAYER_GRADE_PREVIEW
    .map(item => ({
      ...item,
      grade: grades[item.key],
      colors: gradeColors(grades[item.key]),
    }))
    .sort((left, right) => (
      gradeRank(right.grade) - gradeRank(left.grade)
      || left.label.localeCompare(right.label)
    ))
    .slice(0, count);
}

function statusColor(status: PlayerRowStatus) {
  if (status.color) return status.color;
  if (status.tone === 'danger') return '#ff6464';
  if (status.tone === 'warn') return '#F5A623';
  if (status.tone === 'info') return '#5b9bff';
  return '#00ff87';
}

function actionStyles(variant: PlayerRowAction['variant']) {
  if (variant === 'ghost') return { box: styles.actionGhost, text: styles.actionGhostText };
  if (variant === 'neutral') return { box: styles.actionNeutral, text: styles.actionNeutralText };
  if (variant === 'danger') return { box: styles.actionDanger, text: styles.actionDangerText };
  return { box: styles.actionPrimary, text: styles.actionPrimaryText };
}

function visibleNbaIdentity(player: any, profile: any): VisibleNbaIdentity | null {
  const rowIdentity = profile?.identity || player?.identity || profile?.visibleIdentity || player?.visibleIdentity;
  if (!rowIdentity || typeof rowIdentity !== 'object' || rowIdentity.overall !== undefined) return null;
  if (!rowIdentity.grades || typeof rowIdentity.grades !== 'object') return null;
  return rowIdentity as VisibleNbaIdentity;
}

export default function FranchisePlayerRow({
  player,
  index,
  sport = 'nba',
  era,
  currentYear,
  leagueDate,
  profilesByName = {},
  salary,
  salaryLabel,
  meta,
  statusLabels = [],
  action = null,
  disabled = false,
  selected = false,
  gradeCount = 3,
  showRank = true,
  showSalary = true,
  onPress,
  onLongPress,
}: PlayerRowProps) {
  const profile = selectRosterRatingProfile(player, profilesByName, { era, currentYear, leagueDate });
  const isNbaSport = !sport || sport === 'nba';
  const grades = isNbaSport ? buildScoutingGrades(player || {}, profile || null) : null;
  const preview = (isNbaSport ? gradePreview(player, profile, gradeCount) : buildSportGradePreview(player, sport, gradeCount))
    .map(item => ({
      ...item,
      colors: gradeColors(item.grade),
    }));
  const badgeGrade = grades?.overall || preview[0]?.grade || 'C';
  const badgeColors = gradeColors(badgeGrade as NbaGrade);
  const accentColor = preview[0]?.colors.borderColor || badgeColors.borderColor || '#00ff87';
  const archetypeYear = typeof currentYear === 'number' ? currentYear : Number(currentYear);
  const archetype = getSportArchetypeForYear(
    player,
    profile,
    Number.isFinite(archetypeYear) ? archetypeYear : undefined,
    sport,
  );
  const rowIdentity = isNbaSport ? visibleNbaIdentity(player, profile) : null;
  const tierLabel = rowIdentity?.tier || archetype.label;
  const archetypeLabel = rowIdentity?.archetypes?.length ? rowIdentity.archetypes.slice(0, 2).join(' / ') : '';
  const salaryText = salaryLabel || (showSalary ? `${formatFranchisePlayerMoney(salary ?? player?.salary ?? player?.contract?.salary ?? player?.currentSalary)} salary` : '');
  const metaText = meta || [player?.position, player?.jersey_number ? '#' + player.jersey_number : null, player?.age ? 'Age ' + player.age : null]
    .filter(Boolean)
    .join(' · ');
  const currentAction = action && !action.disabled ? action : action;
  const actionStyle = currentAction ? actionStyles(currentAction.variant) : null;
  const disabledAction = disabled || !!currentAction?.disabled;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        selected && { borderColor: accentColor, backgroundColor: badgeColors.backgroundColor },
        disabled && styles.cardDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.78}
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      {showRank ? (
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{typeof index === 'number' ? index + 1 : '-'}</Text>
        </View>
      ) : null}

      <View style={styles.photoWrap}>
        <PlayerHeadshot
          player={player}
          sport={sport}
          imageStyle={[styles.photo, { borderColor: accentColor }]}
          fallback={
            <View style={[styles.photoFallback, { borderColor: accentColor }]}>
              <Text style={styles.photoInitial}>{String(player?.full_name || player?.name || '?')[0]}</Text>
            </View>
          }
        />
        <View testID={`gradeBadge-${playerKey(player)}`} style={[styles.gradeBadge, { borderColor: badgeColors.borderColor, backgroundColor: '#050505' }]}>
          <Text style={[styles.gradeBadgeText, { color: badgeColors.textColor }]}>{badgeGrade}</Text>
        </View>
      </View>

      <View style={styles.info}>
        <View style={styles.headerRow}>
          <Text style={[styles.position, { color: accentColor }]}>{player?.position || '?'}</Text>
          <View style={[styles.tierBadge, { borderColor: archetype.color + '88', backgroundColor: archetype.color + '18' }]}>
            <Text style={[styles.tierText, { color: archetype.color }]} numberOfLines={1}>
              {tierLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.name} numberOfLines={1}>{player?.full_name || player?.name || 'Unknown Player'}</Text>
        {archetypeLabel ? <Text style={styles.archetypeMeta} numberOfLines={1}>{archetypeLabel}</Text> : null}
        {metaText ? <Text style={styles.meta} numberOfLines={1}>{metaText}</Text> : null}
        {showSalary && salaryText ? <Text style={styles.salary} numberOfLines={1}>{salaryText}</Text> : null}
        {preview.length > 0 ? (
          <View style={styles.gradeRow}>
            {preview.map(item => (
              <View
                key={item.key}
                style={[
                  styles.gradePill,
                  { borderColor: item.colors.borderColor, backgroundColor: item.colors.backgroundColor },
                ]}
              >
                <Text style={[styles.gradeLabel, { color: item.colors.textColor }]}>{item.label}</Text>
                <Text style={[styles.gradeValue, { color: item.colors.textColor }]}>{item.grade}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {statusLabels.length > 0 ? (
          <View style={styles.statusRow}>
            {statusLabels.map(status => (
              <Text key={status.label} style={[styles.statusText, { color: statusColor(status) }]}>
                {status.label}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {currentAction ? (
        <TouchableOpacity
          style={[styles.actionBase, actionStyle?.box, disabledAction && styles.actionDisabled]}
          disabled={disabledAction}
          onPress={(event) => {
            event?.stopPropagation?.();
            currentAction.onPress?.(event);
            if (!currentAction.onPress && onPress) onPress();
          }}
        >
          <Text style={[styles.actionText, actionStyle?.text]}>{currentAction.label}</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 96,
    padding: 12,
    paddingLeft: 14,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242424',
    backgroundColor: '#111',
  },
  cardDisabled: { opacity: 0.58 },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  rankBadge: {
    width: 30,
    height: 38,
    borderRadius: 9,
    backgroundColor: '#1d1d1d',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2d2d2d',
  },
  rankText: { color: '#777', fontSize: 12, fontWeight: '900' },
  photoWrap: { width: 58, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: '#171717' },
  photoFallback: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  photoInitial: { color: '#888', fontSize: 18, fontWeight: '900' },
  gradeBadge: { marginTop: -8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  gradeBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  info: { flex: 1, minWidth: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  position: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  tierBadge: { maxWidth: 132, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tierText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  name: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 2 },
  archetypeMeta: { color: '#9cf5c3', fontSize: 10, fontWeight: '900', marginTop: 2 },
  meta: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 2 },
  salary: { color: '#00ff87', fontSize: 12, fontWeight: '900', marginTop: 2, textTransform: 'capitalize' },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  gradePill: { minWidth: 58, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  gradeLabel: { fontSize: 9, fontWeight: '900' },
  gradeValue: { fontSize: 10, fontWeight: '900' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  statusText: { fontSize: 10, fontWeight: '900' },
  actionBase: { minWidth: 54, minHeight: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1 },
  actionText: { fontSize: 12, fontWeight: '900' },
  actionPrimary: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  actionPrimaryText: { color: '#00ff87' },
  actionGhost: { backgroundColor: 'transparent', borderColor: 'transparent', minWidth: 24 },
  actionGhostText: { color: '#777', fontSize: 24, fontWeight: '500' },
  actionNeutral: { backgroundColor: '#1a1a2a', borderColor: '#4444ff' },
  actionNeutralText: { color: '#8888ff', fontSize: 18 },
  actionDanger: { backgroundColor: '#2a0a0a', borderColor: '#ff3333' },
  actionDangerText: { color: '#ff6464' },
  actionDisabled: { opacity: 0.45 },
});
