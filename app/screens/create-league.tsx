import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { draftBaseYearFor } from '@/constants/draftPicks';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { goToTeamSelect } from '@/utils/teamSelectNav';
import { getEraCap } from '@/constants/eraCaps';
import { buildLeagueDefaults, seasonLabel } from '@/domain/sports/rules';
import { getCreateLeagueIntro, shouldShowSportPicker } from '@/domain/createLeague/flow';
import GlobalNav from '@/components/GlobalNav';

const NBA_ERAS = [
  { label: 'Current Rosters', value: 'current', desc: 'Start with todays NBA rosters', icon: '📅' },
  { label: 'Steph Era', value: 'steph', desc: '2016-17 · Warriors dynasty, KD, Curry, Klay, Draymond', icon: '🍿' },
  { label: 'LeBron Era', value: 'lebron', desc: '2010-11 · LeBron, Wade & Bosh form the Heatles', icon: '👑' },
  { label: 'Kobe Era', value: 'kobe', desc: '2002-03 · Shaq & Kobe Lakers three-peat window', icon: '🐍' },
  { label: 'Jordan Era', value: 'jordan', desc: '1991-92 · MJ & the Bulls dynasty', icon: '🐐' },
  { label: 'Magic vs Bird Era', value: 'magic_bird', desc: '1983-84 · Showtime Lakers vs Celtics rivalry', icon: '✨' },
];

const TEAM_MODES = [
  { label: 'Current Rosters', value: 'current', desc: 'Each GM picks from current teams', icon: '🏆' },
  { label: 'Randomize Teams', value: 'random', desc: 'Teams randomly assigned to GMs', icon: '🎲' },
  { label: 'Fantasy Draft', value: 'draft', desc: 'GMs draft players from scratch', icon: '🎯' },
];

const NFL_MODES = [
  { label: 'Current Rosters', value: 'current', desc: 'Start with current NFL rosters', icon: '📅' },
  { label: 'Randomize Teams', value: 'random', desc: 'Teams randomly assigned to GMs', icon: '🎲' },
  { label: 'Fantasy Draft', value: 'draft', desc: 'Draft players from scratch before the season', icon: '🎯' },
];

const MLB_MODES = [
  { label: 'Current Rosters', value: 'current', desc: 'Start with todays MLB rosters', icon: '📅' },
  { label: 'Randomize Teams', value: 'random', desc: 'Teams randomly assigned to GMs', icon: '🎲' },
  { label: 'Fantasy Draft', value: 'draft', desc: 'Draft players from scratch before the season', icon: '🎯' },
];

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', desc: 'Anyone can find and join your league' },
  { value: 'private', label: 'Private', desc: 'Joinable with a passcode' },
];

const TRADE_MODES = [
  { value: 'instant', label: 'Instant', desc: 'Trades execute as soon as both GMs confirm', disabled: false },
  { value: 'veto', label: 'Commissioner Veto', desc: '24h window for a commissioner to veto before a trade goes through', disabled: false },
  { value: 'vote', label: 'League Vote', desc: 'The league votes to approve or reject each trade', disabled: false },
];

const VOTE_THRESHOLDS = [
  { value: 'majority', label: 'Majority', desc: 'More than half of voting GMs must approve' },
  { value: 'two_thirds', label: 'Two-Thirds', desc: 'At least ⅔ of voting GMs must approve' },
  { value: 'unanimous', label: 'Unanimous', desc: 'Every voting GM must approve' },
];

export default function CreateLeagueScreen() {
  const params = useLocalSearchParams<{ sport?: string }>();
  const selectedSport = ['nba', 'madden', 'mlb'].includes(String(params.sport || ''))
    ? String(params.sport)
    : '';
  const [step, setStep] = useState(1);
  const [leagueName, setLeagueName] = useState('');
  const [sport, setSport] = useState(selectedSport);
  const [mode, setMode] = useState('');
  const [era, setEra] = useState('');
  const [teamMode, setTeamMode] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [inviteCode, setInviteCode] = useState('');
  const [tradeApprovalMode, setTradeApprovalMode] = useState('instant');
  const [maxPlayersPerTrade, setMaxPlayersPerTrade] = useState('6');
  const [tradeApronTolerance, setTradeApronTolerance] = useState('1.25');
  const [spinChoices, setSpinChoices] = useState('1');
  const [votePassThreshold, setVotePassThreshold] = useState('majority');
  const [voteDeadlineDays, setVoteDeadlineDays] = useState('2');
  const [draftPickMode, setDraftPickMode] = useState('standard');
  const [stepienRule, setStepienRule] = useState(false);
  const [scheduleGamesPerTeam, setScheduleGamesPerTeam] = useState('29');
  const [loading, setLoading] = useState(false);

  const sports = [
    { label: 'NBA Franchise', value: 'nba', emoji: '🏀' },
    { label: 'NFL Franchise', value: 'madden', emoji: '🏈' },
    { label: 'MLB Franchise', value: 'mlb', emoji: '⚾' },
  ];

  // NBA has 4 steps: Name+Sport -> Era -> Team Mode -> Review
  // Others have 3 steps: Name+Sport -> Mode -> Review
  const totalSteps = sport === 'nba' ? 4 : 3;

  const getModeOptions = () => {
    if (sport === 'madden') return NFL_MODES;
    if (sport === 'mlb') return MLB_MODES;
    return [];
  };

  const handleCreate = async () => {
    const user = auth.currentUser;
    if (!user) { router.replace('/(tabs)/auth'); return; }
    setLoading(true);
    try {
      if (privacy === 'private' && !inviteCode.trim()) {
        Alert.alert('Passcode required', 'Private leagues need a join passcode.');
        setLoading(false); return;
      }
      const maxTrade = parseInt(maxPlayersPerTrade, 10);
      if (isNaN(maxTrade) || maxTrade < 1 || maxTrade > 15) {
        Alert.alert('Invalid', 'Max players per trade must be between 1 and 15.');
        setLoading(false); return;
      }
      const tolNum = parseFloat(tradeApronTolerance) || 1.25;
      if (tolNum < 1.0 || tolNum > 2.0) {
        Alert.alert('Invalid', 'Trade tolerance must be between 1.0 and 2.0.');
        setLoading(false); return;
      }
      const leagueId = doc(collection(db, 'leagues')).id;
      const finalMode = sport === 'nba' ? teamMode : mode;
      const finalEra = sport === 'nba' ? era : null;
      const defaults = buildLeagueDefaults(sport);
      const historicalNbaYear = era === 'magic_bird' ? 1983
        : era === 'jordan' ? 1991
          : era === 'kobe' ? 2002
            : era === 'lebron' ? 2010
              : era === 'steph' ? 2016
                : null;
      const leagueSeasonYear = sport === 'nba' && historicalNbaYear !== null
        ? historicalNbaYear
        : defaults.currentYear;
      const currentSeason = sport === 'nba' && historicalNbaYear !== null
        ? seasonLabel(sport, historicalNbaYear)
        : defaults.currentSeason;
      const initialFinanceLimit = sport === 'nba'
        ? getEraCap(finalEra)
        : defaults.defaultFinanceLimit;

      await setDoc(doc(db, 'leagues', leagueId), {
        name: leagueName.trim(),
        privacy,
        inviteCode: privacy === 'private' ? inviteCode.trim() : '',
        tradeApprovalMode,
        maxPlayersPerTrade: maxTrade,
        tradeApronTolerance: tolNum,
        votePassThreshold,
        voteDeadlineDays: Math.max(1, Math.min(14, parseInt(voteDeadlineDays, 10) || 2)),
        spinChoices: (sport === 'nba' ? teamMode : mode) === 'random' ? (parseInt(spinChoices, 10) || 1) : 1,
        currentYear: leagueSeasonYear,
        currentSeason,
        sport,
        mode: finalMode,
        era: finalEra,
        draftPickMode,
        stepienRule: sport === 'nba' ? stepienRule : false,
        gamesPerTeam: sport === 'nba' ? Number(scheduleGamesPerTeam) : null,
        scheduleLocked: false,
        draftBaseYear: draftBaseYearFor(leagueSeasonYear),
        rosterLimit: defaults.rosterLimit,
        twoWayLimit: defaults.twoWayLimit,
        draftRounds: defaults.draftRounds,
        draftTimerSeconds: defaults.draftTimerSeconds,
        draftStatus: finalMode === 'draft' ? 'setup' : 'none',
        draftSeasonYear: leagueSeasonYear,
        startupDraftRounds: defaults.rosterLimit,
        financeMode: defaults.financeMode,
        salaryCap: initialFinanceLimit,
        ...(sport === 'mlb' ? { teamBudget: initialFinanceLimit } : {}),
        commissionerId: user.uid,
        coCommissioners: [],
        members: [user.uid],
        maxMembers: defaults.maxMembers,
        invites: [],
        createdAt: serverTimestamp(),
        status: 'active',
      });

      await updateDoc(doc(db, 'users', user.uid), {
        leagues: arrayUnion(leagueId),
      });

      goToTeamSelect({ leagueId, sport, era: finalEra || '', mode: finalMode });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const getSummaryMode = () => {
    if (sport === 'nba') {
      const e = NBA_ERAS.find(x => x.value === era);
      const t = TEAM_MODES.find(x => x.value === teamMode);
      return (e ? e.label : '') + (t ? ' · ' + t.label : '');
    }
    const m = getModeOptions().find(x => x.value === mode);
    return m ? m.label : '';
  };

  const StepDots = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s, i) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flex: i < totalSteps - 1 ? 1 : 0 }}>
          <View style={[styles.stepDot, step === s && styles.stepDotActive, step > s && styles.stepDotDone]} />
          {i < totalSteps - 1 && <View style={[styles.stepLine, step > s && styles.stepLineDone]} />}
        </View>
      ))}
    </View>
  );

  const handleBack = () => {
    if (step === 1) router.back();
    else setStep(step - 1);
  };
  const intro = getCreateLeagueIntro(selectedSport);
  const showSportPicker = shouldShowSportPicker(selectedSport);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 90 }}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={handleBack} style={styles.topBack}>
          <Text style={styles.topBackText}>← Back</Text>
        </TouchableOpacity>

        <StepDots />

        {step === 1 && (
          <>
            <Text style={styles.title}>{intro.title}</Text>
            <Text style={styles.subtitle}>{intro.subtitle}</Text>
            <Text style={styles.label}>League Name</Text>
            <TextInput
              style={styles.input}
              placeholder='e.g. Friday Night Association'
              placeholderTextColor='#555'
              value={leagueName}
              onChangeText={setLeagueName}
              autoFocus
            />
            {showSportPicker && (
              <>
                <Text style={styles.label}>Select Sport</Text>
                <View style={styles.optionList}>
                  {sports.map(s => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.sportCard, sport === s.value && styles.sportCardActive]}
                      onPress={() => { setSport(s.value); setMode(''); setEra(''); setTeamMode(''); }}
                    >
                      <Text style={styles.sportCardEmoji}>{s.emoji}</Text>
                      <Text style={[styles.sportCardLabel, sport === s.value && styles.sportCardLabelActive]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, (!leagueName.trim() || !sport) && styles.primaryButtonDisabled]}
              onPress={() => setStep(2)}
              disabled={!leagueName.trim() || !sport}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && sport === 'nba' && (
          <>
            <Text style={styles.title}>Choose Your Era</Text>
            <Text style={styles.subtitle}>Which era of NBA history will your league be set in?</Text>
            <View style={styles.optionList}>
              {NBA_ERAS.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeCard, era === m.value && styles.modeCardActive]}
                  onPress={() => setEra(m.value)}
                >
                  <View style={styles.modeCardInner}>
                    <Text style={styles.modeCardEmoji}>{m.icon}</Text>
                    <View style={[styles.modeRadio, era === m.value && styles.modeRadioActive]}>
                      {era === m.value && <View style={styles.modeRadioDot} />}
                    </View>
                    <View style={styles.modeCardText}>
                      <Text style={[styles.modeCardTitle, era === m.value && styles.modeCardTitleActive]}>{m.label}</Text>
                      <Text style={styles.modeCardDesc}>{m.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, !era && styles.primaryButtonDisabled]}
              onPress={() => setStep(3)}
              disabled={!era}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && sport !== 'nba' && (
          <>
            <Text style={styles.title}>League Mode</Text>
            <Text style={styles.subtitle}>How will teams be set up?</Text>
            <View style={styles.optionList}>
              {getModeOptions().map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeCard, mode === m.value && styles.modeCardActive]}
                  onPress={() => setMode(m.value)}
                >
                  <View style={styles.modeCardInner}>
                    <Text style={styles.modeCardEmoji}>{m.icon}</Text>
                    <View style={[styles.modeRadio, mode === m.value && styles.modeRadioActive]}>
                      {mode === m.value && <View style={styles.modeRadioDot} />}
                    </View>
                    <View style={styles.modeCardText}>
                      <Text style={[styles.modeCardTitle, mode === m.value && styles.modeCardTitleActive]}>{m.label}</Text>
                      <Text style={styles.modeCardDesc}>{m.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, !mode && styles.primaryButtonDisabled]}
              onPress={() => setStep(3)}
              disabled={!mode}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 3 && sport === 'nba' && (
          <>
            <Text style={styles.title}>Team Assignment</Text>
            <Text style={styles.subtitle}>How will teams be assigned to GMs?</Text>
            <View style={styles.optionList}>
              {TEAM_MODES.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeCard, teamMode === m.value && styles.modeCardActive]}
                  onPress={() => setTeamMode(m.value)}
                >
                  <View style={styles.modeCardInner}>
                    <Text style={styles.modeCardEmoji}>{m.icon}</Text>
                    <View style={[styles.modeRadio, teamMode === m.value && styles.modeRadioActive]}>
                      {teamMode === m.value && <View style={styles.modeRadioDot} />}
                    </View>
                    <View style={styles.modeCardText}>
                      <Text style={[styles.modeCardTitle, teamMode === m.value && styles.modeCardTitleActive]}>{m.label}</Text>
                      <Text style={styles.modeCardDesc}>{m.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, !teamMode && styles.primaryButtonDisabled]}
              onPress={() => setStep(4)}
              disabled={!teamMode}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {((step === 3 && sport !== 'nba') || (step === 4 && sport === 'nba')) && (
          <>
            <Text style={styles.title}>Review & Create</Text>
            <Text style={styles.subtitle}>Everything look good?</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>League Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Name</Text>
                <Text style={styles.summaryValue}>{leagueName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Sport</Text>
                <Text style={styles.summaryValue}>{sports.find(s => s.value === sport)?.label}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Setup</Text>
                <Text style={styles.summaryValue}>{getSummaryMode()}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>League Privacy</Text>
            {PRIVACY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionRow, privacy === opt.value && styles.optionRowActive]}
                onPress={() => setPrivacy(opt.value)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, privacy === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                  <Text style={styles.optionDesc}>{opt.desc}</Text>
                </View>
                {privacy === opt.value && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))}
            {privacy === 'private' && (
              <TextInput
                style={styles.settingInput}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder='Join passcode (e.g. HOOPS24)'
                placeholderTextColor='#555'
                autoCapitalize='characters'
              />
            )}

            <Text style={styles.sectionLabel}>Trade Approval</Text>
            {TRADE_MODES.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionRow, tradeApprovalMode === opt.value && styles.optionRowActive, opt.disabled && { opacity: 0.4 }]}
                onPress={() => { if (!opt.disabled) setTradeApprovalMode(opt.value); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, tradeApprovalMode === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                  <Text style={styles.optionDesc}>{opt.desc}</Text>
                </View>
                {tradeApprovalMode === opt.value && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))}

            <Text style={styles.sectionLabel}>Max Players Per Trade Side</Text>
            <TextInput
              style={styles.settingInput}
              value={maxPlayersPerTrade}
              onChangeText={setMaxPlayersPerTrade}
              keyboardType='number-pad'
              placeholder='6'
              placeholderTextColor='#555'
            />

            <Text style={styles.sectionLabel}>Trade Tolerance Multiplier</Text>
            <TextInput
              style={styles.settingInput}
              value={tradeApronTolerance}
              onChangeText={setTradeApronTolerance}
              keyboardType='decimal-pad'
              placeholder='1.25'
              placeholderTextColor='#555'
            />
            <Text style={styles.helperSmall}>How close in value trade sides must be (1.0 = exact, 1.25 = within 25%). You can change any of these later in League Settings.</Text>

            {tradeApprovalMode === 'vote' && (
              <>
                <Text style={styles.sectionLabel}>Vote Pass Threshold</Text>
                {VOTE_THRESHOLDS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionRow, votePassThreshold === opt.value && styles.optionRowActive]}
                    onPress={() => setVotePassThreshold(opt.value)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, votePassThreshold === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </View>
                    {votePassThreshold === opt.value && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                ))}
                <Text style={styles.sectionLabel}>Voting Window (days)</Text>
                <TextInput
                  style={styles.settingInput}
                  value={voteDeadlineDays}
                  onChangeText={setVoteDeadlineDays}
                  keyboardType='number-pad'
                  placeholder='2'
                  placeholderTextColor='#555'
                />
                <Text style={styles.helperSmall}>How long GMs have to vote before the trade auto-resolves (1–14 days). Voters exclude the two GMs in the trade.</Text>
              </>
            )}

            <Text style={styles.sectionLabel}>Draft Pick Ownership</Text>
            {[
              { value: 'standard', label: 'Standard', desc: 'Every team owns its own picks for the next 7 drafts. Fair and balanced.', disabled: false },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionRow, draftPickMode === opt.value && styles.optionRowActive, opt.disabled && { opacity: 0.4 }]}
                onPress={() => { if (!opt.disabled) setDraftPickMode(opt.value); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, draftPickMode === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                  <Text style={styles.optionDesc}>{opt.desc}</Text>
                </View>
                {draftPickMode === opt.value && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))}

            {sport === 'nba' && (
              <>
                <Text style={styles.sectionLabel}>NBA Schedule</Text>
                {['14', '29', '58', '82'].map(value => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.optionRow, scheduleGamesPerTeam === value && styles.optionRowActive]}
                    onPress={() => setScheduleGamesPerTeam(value)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, scheduleGamesPerTeam === value && styles.optionLabelActive]}>{value} games</Text>
                      <Text style={styles.optionDesc}>{value === '82' ? 'Full-length season' : 'Condensed league season'}</Text>
                    </View>
                    {scheduleGamesPerTeam === value && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                ))}
                <Text style={styles.helperSmall}>Your schedule will be created after you claim your team.</Text>

                <Text style={styles.sectionLabel}>Stepien Rule</Text>
                {[
                  { value: true, label: 'On', desc: "Can't trade away first-rounders in back-to-back drafts (real NBA rule)." },
                  { value: false, label: 'Off', desc: 'No restriction on trading first-round picks.' },
                ].map(opt => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.optionRow, stepienRule === opt.value && styles.optionRowActive]}
                    onPress={() => setStepienRule(opt.value)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, stepienRule === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </View>
                    {stepienRule === opt.value && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </>
            )}

            {(sport === 'nba' ? teamMode : mode) === 'random' && (
              <>
                <Text style={styles.sectionLabel}>Random Spins</Text>
                <View style={styles.spinPickRow}>
                  {['1', '2', '3'].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.spinPick, spinChoices === n && styles.spinPickActive]}
                      onPress={() => setSpinChoices(n)}
                    >
                      <Text style={[styles.spinPickText, spinChoices === n && styles.spinPickTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.helperSmall}>
                  {spinChoices === '1'
                    ? 'Each GM gets one spin and locks in the team they land on — no do-overs.'
                    : 'Each GM spins up to ' + spinChoices + ' times and picks one of the teams they land on.'}
                </Text>
              </>
            )}

            <View style={styles.infoCard}>
              <Text style={styles.infoText}>Once created you will go straight to your league. Invite friends from the league screen.</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color='#000' /> : <Text style={styles.primaryButtonText}>Create League</Text>}
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 100 }} />
      </View>
      <GlobalNav />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60 },
  topBack: { marginBottom: 16 },
  topBackText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#444' },
  sectionLabel: { color: '#F5A623', fontSize: 13, fontWeight: '800', marginTop: 22, marginBottom: 10, textTransform: 'uppercase' },
  optionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  optionRowActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  optionLabel: { color: '#ddd', fontSize: 15, fontWeight: '700' },
  optionLabelActive: { color: '#00ff87' },
  optionDesc: { color: '#777', fontSize: 12, marginTop: 2 },
  check: { color: '#00ff87', fontSize: 18, fontWeight: '800', marginLeft: 10 },
  settingInput: { backgroundColor: '#141414', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 4 },
  helperSmall: { color: '#777', fontSize: 12, marginTop: 6, lineHeight: 17 },
  spinPickRow: { flexDirection: 'row', gap: 10 },
  spinPick: { flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 12, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2a2a2a' },
  spinPickActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  spinPickText: { color: '#888', fontSize: 20, fontWeight: '800' },
  spinPickTextActive: { color: '#00ff87' },
  stepDotActive: { backgroundColor: '#00ff87', borderColor: '#00ff87' },
  stepDotDone: { backgroundColor: '#005533', borderColor: '#00ff87' },
  stepLine: { flex: 1, height: 1, backgroundColor: '#2a2a2a' },
  stepLineDone: { backgroundColor: '#005533' },
  title: { fontSize: 30, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 28 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  optionList: { gap: 10, marginBottom: 32 },
  sportCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 14 },
  sportCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  sportCardEmoji: { fontSize: 24 },
  lockedSportText: { flex: 1, gap: 3 },
  lockedSportHint: { color: '#66c695', fontSize: 12, fontWeight: '700' },
  sportCardLabel: { color: '#888888', fontSize: 16, fontWeight: '600' },
  sportCardLabelActive: { color: '#00ff87' },
  modeCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 2 },
  modeCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  modeCardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modeCardEmoji: { fontSize: 22, marginTop: 2 },
  modeRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#444', alignItems: 'center', justifyContent: 'center', marginTop: 4, flexShrink: 0 },
  modeRadioActive: { borderColor: '#00ff87' },
  modeRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00ff87' },
  modeCardText: { flex: 1 },
  modeCardTitle: { fontSize: 15, fontWeight: '700', color: '#888888', marginBottom: 3 },
  modeCardTitleActive: { color: '#00ff87' },
  modeCardDesc: { fontSize: 13, color: '#555555', lineHeight: 18 },
  summaryCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryLabel: { fontSize: 14, color: '#666666' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  infoCard: { backgroundColor: '#0a1a0a', borderRadius: 12, padding: 16, marginBottom: 32, borderWidth: 1, borderColor: '#1a3a1a' },
  infoText: { color: '#4a8a4a', fontSize: 13, lineHeight: 20 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
