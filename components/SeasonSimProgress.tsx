import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { functions } from '@/constants/firebase';

type SeasonSimProgress = {
  leagueId: string;
  leagueName: string;
  status: 'running' | 'complete' | 'cancelled';
  finalGames: number;
  totalGames: number;
  remainingGames: number;
};

type StartSeasonSimInput = {
  leagueId: string;
  leagueName?: string;
  totalGames: number;
  remainingGames: number;
};

type SeasonSimContextValue = {
  progress: SeasonSimProgress | null;
  startSeasonSim: (input: StartSeasonSimInput) => Promise<void>;
  cancelSeasonSim: () => Promise<void>;
  isSimmingLeague: (leagueId?: string | null) => boolean;
};

const SeasonSimContext = createContext<SeasonSimContextValue | null>(null);
const SEASON_SIM_BATCH_SIZE = 15;
const SEASON_SIM_STEP_DELAY_MS = 25;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function SeasonSimProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<SeasonSimProgress | null>(null);
  const progressRef = useRef<SeasonSimProgress | null>(null);
  const cancelRequestedRef = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setCurrentProgress = useCallback((next: SeasonSimProgress | null) => {
    progressRef.current = next;
    setProgress(next);
  }, []);

  const scheduleClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      setCurrentProgress(null);
    }, 1800);
  }, [setCurrentProgress]);

  const startSeasonSim = useCallback(async ({ leagueId, leagueName = 'League', totalGames, remainingGames }: StartSeasonSimInput) => {
    if (!leagueId) return;
    const active = progressRef.current;
    if (active?.status === 'running') {
      if (active.leagueId !== leagueId) {
        Alert.alert('Season sim running', `${active.leagueName} is still simming. Stop it before starting another season sim.`);
      }
      return;
    }

    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }

    cancelRequestedRef.current = false;
    const safeTotal = Math.max(1, Number(totalGames || 0));
    const safeRemaining = Math.max(0, Number(remainingGames || 0));
    const maxSteps = Math.max(Math.ceil(Math.max(safeRemaining, safeTotal) / SEASON_SIM_BATCH_SIZE) + 8, 12);
    setCurrentProgress({
      leagueId,
      leagueName,
      status: 'running',
      finalGames: Math.max(0, safeTotal - safeRemaining),
      totalGames: safeTotal,
      remainingGames: safeRemaining,
    });

    try {
      const simBatch = httpsCallable(functions, 'simScheduleBatch');
      let action = 'start';
      for (let step = 0; step < maxSteps && !cancelRequestedRef.current; step += 1) {
        const result: any = await simBatch({
          leagueId,
          action,
          competition: 'regular',
          batchSize: SEASON_SIM_BATCH_SIZE,
        });
        const control = result.data || {};
        const nextProgress: SeasonSimProgress = {
          leagueId,
          leagueName,
          status: control.status === 'cancelled' ? 'cancelled' : control.status === 'complete' ? 'complete' : 'running',
          finalGames: Number(control.finalGames || 0),
          totalGames: Number(control.totalGames || safeTotal),
          remainingGames: Number(control.remainingGames || 0),
        };
        setCurrentProgress(nextProgress);
        if (nextProgress.status === 'complete' || nextProgress.status === 'cancelled') {
          scheduleClear();
          break;
        }
        action = 'step';
        if (SEASON_SIM_STEP_DELAY_MS > 0) await wait(SEASON_SIM_STEP_DELAY_MS);
      }
    } catch (error: any) {
      setCurrentProgress(null);
      Alert.alert('Season sim stopped', error.message || 'Please try again.');
    } finally {
      cancelRequestedRef.current = false;
    }
  }, [scheduleClear, setCurrentProgress]);

  const cancelSeasonSim = useCallback(async () => {
    const active = progressRef.current;
    if (!active?.leagueId || active.status !== 'running') return;
    cancelRequestedRef.current = true;
    try {
      const simBatch = httpsCallable(functions, 'simScheduleBatch');
      await simBatch({ leagueId: active.leagueId, action: 'cancel', competition: 'regular' });
      setCurrentProgress({ ...active, status: 'cancelled' });
      scheduleClear();
    } catch (error: any) {
      Alert.alert('Cancel not sent', error.message || 'Please try again.');
    }
  }, [scheduleClear, setCurrentProgress]);

  const isSimmingLeague = useCallback((leagueId?: string | null) => (
    Boolean(leagueId && progressRef.current?.status === 'running' && progressRef.current.leagueId === leagueId)
  ), []);

  const percent = progress?.totalGames
    ? Math.max(0, Math.min(100, Math.round((progress.finalGames / progress.totalGames) * 100)))
    : 0;
  const visible = Boolean(progress);

  return (
    <SeasonSimContext.Provider value={{ progress, startSeasonSim, cancelSeasonSim, isSimmingLeague }}>
      {children}
      {visible ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.titleRow}>
                {progress?.status === 'running' ? (
                  <ActivityIndicator color="#00e58b" size="small" />
                ) : (
                  <Ionicons color={progress?.status === 'complete' ? '#00e58b' : '#ff6b6b'} name={progress?.status === 'complete' ? 'checkmark-circle' : 'stop-circle'} size={16} />
                )}
                <Text style={styles.title}>
                  {progress?.status === 'complete' ? 'Season sim complete' : progress?.status === 'cancelled' ? 'Season sim stopped' : 'Season sim running'}
                </Text>
              </View>
              {progress?.status === 'running' ? (
                <TouchableOpacity style={styles.stopButton} onPress={cancelSeasonSim}>
                  <Ionicons color="#fff" name="stop-circle" size={14} />
                  <Text style={styles.stopText}>Stop</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {progress?.leagueName || 'League'} · {progress?.finalGames || 0}/{progress?.totalGames || 0} final · {progress?.remainingGames || 0} left
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
          </View>
        </View>
      ) : null}
    </SeasonSimContext.Provider>
  );
}

export function useSeasonSimProgress() {
  const context = useContext(SeasonSimContext);
  if (!context) throw new Error('useSeasonSimProgress must be used within SeasonSimProgressProvider');
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 86,
    zIndex: 1000,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00e58b55',
    backgroundColor: '#07120df2',
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 12, fontWeight: '900' },
  meta: { color: '#8f9a94', fontSize: 10, fontWeight: '800', marginTop: 6 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: '#183126', marginTop: 8 },
  fill: { height: '100%', borderRadius: 999, backgroundColor: '#00e58b' },
  stopButton: { minHeight: 28, borderRadius: 8, backgroundColor: '#e53950', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  stopText: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
