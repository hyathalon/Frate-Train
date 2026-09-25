import { useRef, useState, useMemo, useCallback } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RACES_STORAGE_KEY = '@fratetrain/race_results_v1';

// ─── Unit helpers ────────────────────────────────────────────────────────────
function speedToPace(speedKmh) { return speedKmh > 0 ? 3600 / speedKmh : 0; }
function paceToSpeed(paceSec)  { return paceSec > 0 ? 3600 / paceSec : 0; }

function secsToMMSS(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return { m: '', s: '' };
  const m = Math.floor(totalSecs / 60);
  const s = Math.round(totalSecs % 60);
  return { m: String(m), s: String(s).padStart(2, '0') };
}

function mmssToSecs(m, s) {
  const mins = parseInt(m, 10) || 0;
  const secs = parseInt(s, 10) || 0;
  return mins * 60 + secs;
}

function secsToHHMMSS(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return { h: '', m: '', s: '' };
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.round(totalSecs % 60);
  return { h: String(h), m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') };
}

function hhmmssToSecs(h, m, s) {
  return (parseInt(h, 10) || 0) * 3600 + (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
}

function fmtTime(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return '—';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.round(totalSecs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Shared input components ─────────────────────────────────────────────────
function FieldLabel({ icon, label, colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

function TimeInput({ value, onChange, fields, colors, styles }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {fields.map((f, i) => (
        <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            style={[styles.input, { width: f.width || 56 }]}
            value={value[f.key]}
            onChangeText={(t) => onChange({ ...value, [f.key]: t.replace(/[^0-9]/g, '') })}
            keyboardType="number-pad"
            placeholder={f.placeholder}
            placeholderTextColor={colors.textMuted + '80'}
            maxLength={f.max || 2}
          />
          {i < fields.length - 1 && (
            <Text style={{ color: colors.textMuted, fontSize: 18, fontWeight: '700',
              marginHorizontal: 4 }}>:</Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── PAGE 1: Pace Calculator ─────────────────────────────────────────────────
function PaceCalculator({ useMetric, colors, styles }) {
  const unitLabel = useMetric ? 'km' : 'mi';
  const speedUnit = useMetric ? 'km/h' : 'mi/h';
  const paceUnit  = useMetric ? 'mm:ss/km' : 'mm:ss/mi';

  const [speed, setSpeed]     = useState('');
  const [pace, setPace]       = useState({ m: '', s: '' });
  const [distance, setDist]   = useState('');
  const [time, setTime]       = useState({ h: '', m: '', s: '' });

  const calcFromSpeed = () => {
    const spd = parseFloat(speed);
    if (!spd) return;
    const paceSec = speedToPace(spd);
    setPace(secsToMMSS(paceSec));
    const dist = parseFloat(distance);
    if (dist) setTime(secsToHHMMSS((dist / spd) * 3600));
  };

  const calcFromPace = () => {
    const paceSec = mmssToSecs(pace.m, pace.s);
    if (!paceSec) return;
    const spd = paceToSpeed(paceSec);
    setSpeed(spd.toFixed(2));
    const dist = parseFloat(distance);
    if (dist) setTime(secsToHHMMSS(paceSec * dist));
  };

  const calcFromDist = () => {
    const dist = parseFloat(distance);
    if (!dist) return;
    const spd = parseFloat(speed);
    if (spd) setTime(secsToHHMMSS((dist / spd) * 3600));
    else {
      const paceSec = mmssToSecs(pace.m, pace.s);
      if (paceSec) setTime(secsToHHMMSS(paceSec * dist));
    }
  };

  const calcFromTime = () => {
    const timeSec = hhmmssToSecs(time.h, time.m, time.s);
    if (!timeSec) return;
    const dist = parseFloat(distance);
    if (dist) {
      const paceSec = timeSec / dist;
      setPace(secsToMMSS(paceSec));
      setSpeed(paceToSpeed(paceSec).toFixed(2));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.fieldBlock}>
        <FieldLabel icon="🏃" label={`Speed [${speedUnit}]`} colors={colors} />
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={speed}
            onChangeText={setSpeed}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted + '80'}
          />
          <TouchableOpacity style={styles.calcBtn} onPress={() => { Keyboard.dismiss(); calcFromSpeed(); }}>
            <Text style={styles.calcBtnText}>CALC</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel icon="⏱" label={`Pace [${paceUnit}]`} colors={colors} />
        <View style={styles.inputRow}>
          <TimeInput value={pace} onChange={setPace}
            fields={[{ key: 'm', placeholder: 'mm', width: 64 }, { key: 's', placeholder: 'ss', width: 64 }]}
            colors={colors} styles={styles} />
          <TouchableOpacity style={styles.calcBtn} onPress={() => { Keyboard.dismiss(); calcFromPace(); }}>
            <Text style={styles.calcBtnText}>CALC</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.fieldBlock}>
        <FieldLabel icon="📍" label={`Distance [${unitLabel}]`} colors={colors} />
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={distance}
            onChangeText={setDist}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textMuted + '80'}
          />
          <TouchableOpacity style={styles.calcBtn} onPress={() => { Keyboard.dismiss(); calcFromDist(); }}>
            <Text style={styles.calcBtnText}>CALC</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel icon="🕐" label="Time [hh:mm:ss]" colors={colors} />
        <View style={styles.inputRow}>
          <TimeInput value={time} onChange={setTime}
            fields={[
              { key: 'h', placeholder: 'hh', width: 52 },
              { key: 'm', placeholder: 'mm', width: 52 },
              { key: 's', placeholder: 'ss', width: 52 },
            ]}
            colors={colors} styles={styles} />
          <TouchableOpacity style={styles.calcBtn} onPress={() => { Keyboard.dismiss(); calcFromTime(); }}>
            <Text style={styles.calcBtnText}>CALC</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick distances</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(useMetric
            ? [['5K','5'],['10K','10'],['Half','21.0975'],['Hyrox Run','8'],['Marathon','42.195']]
            : [['5K','3.11'],['10K','6.21'],['Half','13.11'],['Marathon','26.22']]
          ).map(([label, val]) => (
            <TouchableOpacity
              key={label}
              style={[styles.quickChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setDist(val)}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ─── PAGE 2: HYROX Race Predictor ────────────────────────────────────────────
const HYROX_STATIONS = [
  { key: 'skierg',   label: 'Ski Erg',           emoji: '🎿' },
  { key: 'sledpush', label: 'Sled Push',          emoji: '🛷' },
  { key: 'sledpull', label: 'Sled Pull',          emoji: '🔗' },
  { key: 'burpee',   label: 'Burpee Broad Jumps', emoji: '💥' },
  { key: 'rowing',   label: 'Rowing',             emoji: '🚣' },
  { key: 'farmers',  label: 'Farmers Carry',      emoji: '🏋️' },
  { key: 'sandbag',  label: 'Sandbag Lunges',     emoji: '🎒' },
  { key: 'wallball', label: 'Wall Balls',          emoji: '🏀' },
];

// Evidence-based % targets per finish-time bracket (running ~49%, stations ~43%, transitions ~8%)
// Source: Roxmetric analysis of 93k results; research paper (Gutiérrez-Hellín et al. 2026 top-50 PRO MEN)
// These are used to identify over/under performance vs. goal
const TARGET_PROFILES = {
  // category: { run, stations by key, transition } all as % of total
  open: {
    run: 0.49,
    skierg: 0.068, sledpush: 0.042, sledpull: 0.060, burpee: 0.052,
    rowing: 0.068, farmers: 0.030, sandbag: 0.058, wallball: 0.072,
    transition: 0.08,
  },
  pro: {
    run: 0.53,
    skierg: 0.065, sledpush: 0.038, sledpull: 0.055, burpee: 0.047,
    rowing: 0.065, farmers: 0.025, sandbag: 0.052, wallball: 0.065,
    transition: 0.063,
  },
};

function HyroxPredictor({ colors, styles }) {
  const [runPace, setRunPace]       = useState({ m: '', s: '' });
  const [stations, setStations]     = useState(
    Object.fromEntries(HYROX_STATIONS.map((s) => [s.key, { m: '', s: '' }]))
  );
  const [transition, setTransition] = useState('30');
  const [result, setResult]         = useState(null);

  const updateStation = (key, val) =>
    setStations((prev) => ({ ...prev, [key]: val }));

  const calculate = () => {
    Keyboard.dismiss();
    const runSec   = mmssToSecs(runPace.m, runPace.s);
    const runTotal = runSec * 8;
    const stationTotal = HYROX_STATIONS.reduce((sum, s) =>
      sum + mmssToSecs(stations[s.key].m, stations[s.key].s), 0);
    const transitionSec   = parseInt(transition, 10) || 0;
    const transitionTotal = transitionSec * 8;
    const total = runTotal + stationTotal + transitionTotal;
    setResult({
      runTotal, stationTotal, transitionTotal, total,
      breakdown: HYROX_STATIONS.map((s) => ({
        label: s.label, emoji: s.emoji,
        secs: mmssToSecs(stations[s.key].m, stations[s.key].s),
      })),
    });
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.fieldBlock}>
        <FieldLabel icon="🏃" label="1km Run Pace (mm:ss per km)" colors={colors} />
        <TimeInput value={runPace} onChange={setRunPace}
          fields={[{ key: 'm', placeholder: 'mm', width: 72 }, { key: 's', placeholder: 'ss', width: 72 }]}
          colors={colors} styles={styles} />
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>Applied to all 8 × 1km runs</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Station Times (mm:ss)</Text>
      {HYROX_STATIONS.map((s) => (
        <View key={s.key} style={styles.fieldBlock}>
          <FieldLabel icon={s.emoji} label={s.label} colors={colors} />
          <TimeInput value={stations[s.key]} onChange={(v) => updateStation(s.key, v)}
            fields={[{ key: 'm', placeholder: 'mm', width: 72 }, { key: 's', placeholder: 'ss', width: 72 }]}
            colors={colors} styles={styles} />
        </View>
      ))}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.fieldBlock}>
        <FieldLabel icon="⚡" label="Avg Transition Time (seconds per station)" colors={colors} />
        <TextInput
          style={[styles.input, { width: 120 }]}
          value={transition}
          onChangeText={setTransition}
          keyboardType="number-pad"
          placeholder="30"
          placeholderTextColor={colors.textMuted + '80'}
          maxLength={3}
        />
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
          Total Rox Zone = {transition || 0}s × 8 = {((parseInt(transition,10)||0)*8)}s ({fmtTime((parseInt(transition,10)||0)*8)})
        </Text>
      </View>

      <TouchableOpacity style={[styles.bigCalcBtn, { backgroundColor: colors.primary }]} onPress={calculate}>
        <Text style={styles.bigCalcBtnText}>CALCULATE TOTAL TIME</Text>
      </TouchableOpacity>

      {result && (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.resultTotal, { color: colors.text }]}>🏁 {fmtTime(result.total)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm }}>
            Predicted finish time
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.sm }]} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>🏃 8 × 1km runs</Text>
            <Text style={[styles.breakdownVal, { color: colors.text }]}>{fmtTime(result.runTotal)}</Text>
          </View>
          {result.breakdown.map((b) => (
            <View key={b.label} style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>{b.emoji} {b.label}</Text>
              <Text style={[styles.breakdownVal, { color: colors.text }]}>{fmtTime(b.secs)}</Text>
            </View>
          ))}
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>⚡ Transitions (×8)</Text>
            <Text style={[styles.breakdownVal, { color: colors.text }]}>{fmtTime(result.transitionTotal)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.sm }]} />
          <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
            💡 Cutting 10s per transition saves{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{fmtTime(80)}</Text> off your total
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── PAGE 3: Custom Race Predictor ───────────────────────────────────────────
function CustomPredictor({ colors, styles }) {
  const [eventName, setEventName]   = useState('');
  const [entries, setEntries]       = useState([]);
  const [transition, setTransition] = useState('30');
  const [result, setResult]         = useState(null);

  const addEntry = (type) => {
    setEntries((prev) => [...prev, {
      id: Date.now(), type,
      name: type === 'run' ? 'Run' : 'Station',
      distance: '', pace: { m: '', s: '' }, time: { m: '', s: '' },
    }]);
  };

  const updateEntry = (id, patch) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const removeEntry = (id) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  const calculate = () => {
    Keyboard.dismiss();
    let total = 0;
    const breakdown = [];
    entries.forEach((e) => {
      if (e.type === 'run') {
        const paceSec = mmssToSecs(e.pace.m, e.pace.s);
        const dist    = parseFloat(e.distance) || 0;
        const secs    = paceSec * dist;
        total += secs;
        breakdown.push({ label: `🏃 ${e.name} (${dist}km)`, secs });
      } else {
        const secs = mmssToSecs(e.time.m, e.time.s);
        total += secs;
        breakdown.push({ label: `🏋️ ${e.name}`, secs });
      }
    });
    const stationCount    = entries.filter((e) => e.type === 'station').length;
    const transitionTotal = (parseInt(transition, 10) || 0) * stationCount;
    total += transitionTotal;
    setResult({ total, breakdown, transitionTotal, stationCount });
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.fieldBlock}>
        <FieldLabel icon="🏅" label="Event name" colors={colors} />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={eventName}
          onChangeText={setEventName}
          placeholder="e.g. Spartan Sprint, Hyathlon Relay…"
          placeholderTextColor={colors.textMuted + '80'}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel icon="⚡" label="Avg transition time (seconds)" colors={colors} />
        <TextInput
          style={[styles.input, { width: 120 }]}
          value={transition}
          onChangeText={setTransition}
          keyboardType="number-pad"
          placeholder="30"
          placeholderTextColor={colors.textMuted + '80'}
          maxLength={3}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {entries.map((e) => (
        <View key={e.id} style={[styles.entryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <TextInput
              style={[styles.entryNameInput, { color: colors.text, borderBottomColor: colors.border }]}
              value={e.name}
              onChangeText={(t) => updateEntry(e.id, { name: t })}
              placeholder={e.type === 'run' ? 'Run name' : 'Station name'}
              placeholderTextColor={colors.textMuted + '80'}
            />
            <TouchableOpacity onPress={() => removeEntry(e.id)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {e.type === 'run' ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, width: 70 }}>Distance (km)</Text>
                <TextInput
                  style={[styles.input, { width: 80 }]}
                  value={e.distance}
                  onChangeText={(t) => updateEntry(e.id, { distance: t })}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor={colors.textMuted + '80'}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, width: 70 }}>Pace /km</Text>
                <TimeInput value={e.pace} onChange={(v) => updateEntry(e.id, { pace: v })}
                  fields={[{ key: 'm', placeholder: 'mm', width: 60 }, { key: 's', placeholder: 'ss', width: 60 }]}
                  colors={colors} styles={styles} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, width: 70 }}>Time (mm:ss)</Text>
              <TimeInput value={e.time} onChange={(v) => updateEntry(e.id, { time: v })}
                fields={[{ key: 'm', placeholder: 'mm', width: 60 }, { key: 's', placeholder: 'ss', width: 60 }]}
                colors={colors} styles={styles} />
            </View>
          )}
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addEntry('run')}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Run</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addEntry('station')}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Station</Text>
        </TouchableOpacity>
      </View>

      {entries.length > 0 && (
        <TouchableOpacity style={[styles.bigCalcBtn, { backgroundColor: colors.primary }]} onPress={calculate}>
          <Text style={styles.bigCalcBtnText}>CALCULATE TOTAL TIME</Text>
        </TouchableOpacity>
      )}

      {result && (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.resultTotal, { color: colors.text }]}>🏁 {fmtTime(result.total)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm }}>
            {eventName || 'Custom race'} predicted finish
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.sm }]} />
          {result.breakdown.map((b, i) => (
            <View key={i} style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>{b.label}</Text>
              <Text style={[styles.breakdownVal, { color: colors.text }]}>{fmtTime(b.secs)}</Text>
            </View>
          ))}
          {result.stationCount > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>⚡ Transitions (×{result.stationCount})</Text>
              <Text style={[styles.breakdownVal, { color: colors.text }]}>{fmtTime(result.transitionTotal)}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ─── PAGE 4: Race Analysis ────────────────────────────────────────────────────

const CATEGORIES = ['Open Men', 'Open Women', 'Pro Men', 'Pro Women', 'Doubles Men', 'Doubles Women', 'Doubles Mixed'];

function emptyRaceForm() {
  return {
    id: null,
    date: new Date().toISOString().split('T')[0],
    eventName: '',
    category: 'Open Men',
    // 8 run splits
    runs: Array.from({ length: 8 }, (_, i) => ({ m: '', s: '' })),
    // 8 station times
    skierg:   { m: '', s: '' },
    sledpush: { m: '', s: '' },
    sledpull: { m: '', s: '' },
    burpee:   { m: '', s: '' },
    rowing:   { m: '', s: '' },
    farmers:  { m: '', s: '' },
    sandbag:  { m: '', s: '' },
    wallball: { m: '', s: '' },
    // avg transition (seconds)
    avgTransition: '30',
  };
}

function analyseRace(form) {
  const runTotal = form.runs.reduce((sum, r) => sum + mmssToSecs(r.m, r.s), 0);
  const stationTotals = {};
  let stationTotal = 0;
  HYROX_STATIONS.forEach((s) => {
    const secs = mmssToSecs(form[s.key].m, form[s.key].s);
    stationTotals[s.key] = secs;
    stationTotal += secs;
  });
  const transitionTotal = (parseInt(form.avgTransition, 10) || 0) * 8;
  const total = runTotal + stationTotal + transitionTotal;

  if (total === 0) return null;

  const isProCat = form.category.toLowerCase().includes('pro');
  const targets  = isProCat ? TARGET_PROFILES.pro : TARGET_PROFILES.open;

  // For each segment, compute actual % vs target %
  const segments = [
    {
      key: 'run', label: '8 × Runs', emoji: '🏃',
      actual: runTotal, target: targets.run * total,
      actualPct: runTotal / total, targetPct: targets.run,
    },
    ...HYROX_STATIONS.map((s) => ({
      key: s.key, label: s.label, emoji: s.emoji,
      actual: stationTotals[s.key], target: targets[s.key] * total,
      actualPct: stationTotals[s.key] / total, targetPct: targets[s.key],
    })),
    {
      key: 'transition', label: 'Transitions', emoji: '⚡',
      actual: transitionTotal, target: targets.transition * total,
      actualPct: transitionTotal / total, targetPct: targets.transition,
    },
  ];

  // Identify limiters: segments where actual > target by >10%
  const limiters = segments
    .filter((seg) => seg.actual > 0 && (seg.actual - seg.target) / seg.target > 0.10)
    .sort((a, b) => (b.actual - b.target) - (a.actual - a.target));

  return { total, runTotal, stationTotal, transitionTotal, segments, limiters, stationTotals };
}

function RaceForm({ initial, onSave, onCancel, colors, styles }) {
  const [form, setForm] = useState(initial || emptyRaceForm());

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setRun = (i, val) => setForm((f) => {
    const runs = [...f.runs];
    runs[i] = val;
    return { ...f, runs };
  });
  const setStation = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = () => {
    Keyboard.dismiss();
    const analysis = analyseRace(form);
    if (!analysis || analysis.total === 0) {
      Alert.alert('Missing data', 'Please enter at least your run times and a few station times.');
      return;
    }
    onSave({ ...form, id: form.id || String(Date.now()) });
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Event + date */}
      <View style={styles.fieldBlock}>
        <FieldLabel icon="🏅" label="Event name" colors={colors} />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={form.eventName}
          onChangeText={(t) => setField('eventName', t)}
          placeholder="e.g. HYROX Melbourne 2026"
          placeholderTextColor={colors.textMuted + '80'}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel icon="📅" label="Race date (YYYY-MM-DD)" colors={colors} />
        <TextInput
          style={[styles.input, { width: 160 }]}
          value={form.date}
          onChangeText={(t) => setField('date', t)}
          placeholder="2026-09-01"
          placeholderTextColor={colors.textMuted + '80'}
          maxLength={10}
        />
      </View>

      {/* Category */}
      <View style={styles.fieldBlock}>
        <FieldLabel icon="👤" label="Category" colors={colors} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -4 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.quickChip,
                  { borderColor: form.category === cat ? colors.primary : colors.border,
                    backgroundColor: form.category === cat ? colors.primaryMuted : colors.surface },
                ]}
                onPress={() => setField('category', cat)}
              >
                <Text style={{ color: form.category === cat ? colors.primary : colors.textMuted,
                  fontSize: 12, fontWeight: '600' }}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Run splits */}
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Run Splits (mm:ss per 1km)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {form.runs.map((r, i) => (
          <View key={i} style={{ alignItems: 'center', gap: 4, width: (SCREEN_WIDTH - spacing.md * 2 - spacing.sm * 3) / 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Run {i + 1}</Text>
            <TimeInput value={r} onChange={(v) => setRun(i, v)}
              fields={[{ key: 'm', placeholder: 'mm', width: 38 }, { key: 's', placeholder: 'ss', width: 38 }]}
              colors={colors} styles={styles} />
          </View>
        ))}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Station times */}
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Station Times (mm:ss)</Text>
      {HYROX_STATIONS.map((s) => (
        <View key={s.key} style={[styles.fieldBlock, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{s.label}</Text>
          </View>
          <TimeInput value={form[s.key]} onChange={(v) => setStation(s.key, v)}
            fields={[{ key: 'm', placeholder: 'mm', width: 52 }, { key: 's', placeholder: 'ss', width: 52 }]}
            colors={colors} styles={styles} />
        </View>
      ))}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Transitions */}
      <View style={styles.fieldBlock}>
        <FieldLabel icon="⚡" label="Avg transition time (seconds per station)" colors={colors} />
        <TextInput
          style={[styles.input, { width: 120 }]}
          value={form.avgTransition}
          onChangeText={(t) => setField('avgTransition', t)}
          keyboardType="number-pad"
          placeholder="30"
          placeholderTextColor={colors.textMuted + '80'}
          maxLength={3}
        />
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
        <TouchableOpacity
          style={[styles.addBtn, { flex: 1, borderColor: colors.border }]}
          onPress={onCancel}
        >
          <Text style={[styles.addBtnText, { color: colors.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bigCalcBtn, { flex: 2, marginTop: 0 }]}
          onPress={handleSave}
        >
          <Text style={styles.bigCalcBtnText}>💾  Save Race</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function RaceCard({ race, onEdit, onDelete, colors, styles }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = useMemo(() => analyseRace(race), [race]);

  return (
    <View style={[styles.raceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{race.eventName || 'HYROX Race'}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {fmtDate(race.date)} · {race.category}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {analysis && (
              <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {fmtTime(analysis.total)}
              </Text>
            )}
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </View>
        </View>
      </TouchableOpacity>

      {expanded && analysis && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {/* Limiter callout */}
          {analysis.limiters.length > 0 && (
            <View style={[styles.limiterBox, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '40' }]}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 4 }}>
                🎯 Focus areas vs. target splits
              </Text>
              {analysis.limiters.slice(0, 3).map((lim) => (
                <View key={lim.key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                  <Text style={{ color: colors.text, fontSize: 13 }}>{lim.emoji} {lim.label}</Text>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                    +{fmtTime(lim.actual - lim.target)} over
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Segment breakdown with bar */}
          {analysis.segments.map((seg) => {
            if (seg.actual === 0) return null;
            const over = seg.actual > seg.target;
            return (
              <View key={seg.key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{seg.emoji} {seg.label}</Text>
                  <Text style={{ color: over ? '#E74C3C' : colors.success, fontSize: 12, fontWeight: '600' }}>
                    {fmtTime(seg.actual)}
                    {over ? ` (+${fmtTime(seg.actual - seg.target)})` : ' ✓'}
                  </Text>
                </View>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
                  <View style={{
                    height: 4, borderRadius: 2,
                    backgroundColor: over ? '#E74C3C' : colors.success,
                    width: `${Math.min((seg.actualPct / Math.max(seg.targetPct * 1.5, 0.01)) * 100, 100)}%`,
                  }} />
                </View>
              </View>
            );
          })}

          {/* Edit / Delete */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
            <TouchableOpacity
              style={[styles.addBtn, { flex: 1, borderColor: colors.border }]}
              onPress={() => onEdit(race)}
            >
              <Ionicons name="pencil" size={14} color={colors.textMuted} />
              <Text style={[styles.addBtnText, { color: colors.textMuted }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, { flex: 1, borderColor: '#E74C3C40' }]}
              onPress={() => onDelete(race.id)}
            >
              <Ionicons name="trash-outline" size={14} color="#E74C3C" />
              <Text style={[styles.addBtnText, { color: '#E74C3C' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Race History Graph ───────────────────────────────────────────────────────
const GRAPH_SEGS = [
  { key: 'runTotal',        label: 'Running',     color: '#4A90D9' },
  { key: 'stationTotal',    label: 'Stations',    color: '#E67E22' },
  { key: 'transitionTotal', label: 'Transitions', color: '#9B59B6' },
];

// Draws a polyline as a series of absolutely-positioned line segments using Views.
// Each segment is a thin rectangle rotated to connect two points.
function PolyLine({ points, color, strokeWidth = 2.5 }) {
  if (points.length < 2) return null;
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    segments.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: x1,
          top: y1 - strokeWidth / 2,
          width: length,
          height: strokeWidth,
          backgroundColor: color,
          borderRadius: strokeWidth,
          transformOrigin: '0 50%',
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    );
  }
  return <>{segments}</>;
}

function RaceHistoryGraph({ races, colors }) {
  const [view, setView] = useState('total'); // 'total' | 'segments'

  const data = useMemo(() => {
    return [...races]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => {
        const a = analyseRace(r);
        if (!a) return null;
        return {
          date: r.date,
          total: a.total,
          runTotal: a.runTotal,
          stationTotal: a.stationTotal,
          transitionTotal: a.transitionTotal,
        };
      })
      .filter(Boolean);
  }, [races]);

  if (data.length < 2) return null;

  const CHART_H = 140;
  const LABEL_W = 44;
  const BOTTOM_H = 24;
  const chartW = SCREEN_WIDTH - spacing.md * 4 - LABEL_W; // account for card padding + label col
  const plotH = CHART_H - BOTTOM_H;

  const allVals = view === 'total'
    ? data.map((d) => d.total)
    : data.flatMap((d) => [d.runTotal, d.stationTotal, d.transitionTotal]);
  const yMin = Math.max(0, Math.min(...allVals) * 0.90);
  const yMax = Math.max(...allVals) * 1.06;

  const xScale = (i) => (i / (data.length - 1)) * chartW;
  const yScale = (v) => plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  const getPoints = (key) => data.map((d, i) => [xScale(i), yScale(d[key])]);

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Race History</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[['total', 'Total'], ['segments', 'Breakdown']].map(([v, lbl]) => (
            <TouchableOpacity
              key={v}
              onPress={() => setView(v)}
              style={{
                paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: radii.full,
                backgroundColor: view === v ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: view === v ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: view === v ? '#fff' : colors.textMuted }}>
                {lbl}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Chart area */}
      <View style={{ flexDirection: 'row' }}>
        {/* Y-axis labels */}
        <View style={{ width: LABEL_W, height: CHART_H, justifyContent: 'space-between', paddingBottom: BOTTOM_H }}>
          {[...yTicks].reverse().map((v, i) => (
            <Text key={i} style={{ fontSize: 9, color: colors.textMuted, textAlign: 'right', paddingRight: 4 }}>
              {fmtTime(Math.round(v))}
            </Text>
          ))}
        </View>

        {/* Plot */}
        <View style={{ flex: 1 }}>
          {/* Grid lines */}
          <View style={{ position: 'relative', height: CHART_H }}>
            {yTicks.map((v, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: 0, right: 0,
                  top: yScale(v),
                  height: 1,
                  backgroundColor: colors.border,
                  opacity: 0.5,
                }}
              />
            ))}

            {/* Lines */}
            {view === 'total' ? (
              <PolyLine points={getPoints('total')} color={colors.primary} strokeWidth={2.5} />
            ) : (
              GRAPH_SEGS.map(({ key, color }) => (
                <PolyLine key={key} points={getPoints(key)} color={color} strokeWidth={2} />
              ))
            )}

            {/* Dots */}
            {view === 'total'
              ? data.map((d, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: xScale(i) - 5,
                      top: yScale(d.total) - 5,
                      width: 10, height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.primary,
                      borderWidth: 2, borderColor: colors.card,
                    }}
                  />
                ))
              : GRAPH_SEGS.map(({ key, color }) =>
                  data.map((d, i) => (
                    <View
                      key={`${key}-${i}`}
                      style={{
                        position: 'absolute',
                        left: xScale(i) - 4,
                        top: yScale(d[key]) - 4,
                        width: 8, height: 8,
                        borderRadius: 4,
                        backgroundColor: color,
                        borderWidth: 1.5, borderColor: colors.card,
                      }}
                    />
                  ))
                )
            }

            {/* X-axis date labels */}
            {data.map((d, i) => (
              <Text
                key={i}
                style={{
                  position: 'absolute',
                  left: xScale(i),
                  top: plotH + 6,
                  fontSize: 8,
                  color: colors.textMuted,
                  transform: [{ translateX: -16 }],
                  width: 34,
                  textAlign: 'center',
                }}
              >
                {fmtDate(d.date).split(' ').slice(0, 2).join('\n')}
              </Text>
            ))}
          </View>
        </View>
      </View>

      {/* Legend */}
      {view === 'segments' && (
        <View style={{ flexDirection: 'row', gap: spacing.md, justifyContent: 'center', marginTop: 8 }}>
          {GRAPH_SEGS.map(({ key, label, color }) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: color }} />
              <Text style={{ fontSize: 10, color: colors.textMuted }}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function RaceAnalysis({ colors, styles }) {
  const [races, setRaces]       = useState([]);
  const [loaded, setLoaded]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editRace, setEditRace] = useState(null);

  // Load from storage
  useMemo(() => {
    AsyncStorage.getItem(RACES_STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setRaces(JSON.parse(raw)); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((updated) => {
    setRaces(updated);
    AsyncStorage.setItem(RACES_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  const handleSave = (form) => {
    const existing = races.find((r) => r.id === form.id);
    const updated  = existing
      ? races.map((r) => (r.id === form.id ? form : r))
      : [form, ...races];
    persist(updated.sort((a, b) => b.date.localeCompare(a.date)));
    setShowForm(false);
    setEditRace(null);
  };

  const handleDelete = (id) => {
    Alert.alert('Delete race', 'Remove this result from your history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(races.filter((r) => r.id !== id)) },
    ]);
  };

  const handleEdit = (race) => {
    setEditRace(race);
    setShowForm(true);
  };

  if (showForm) {
    return (
      <RaceForm
        initial={editRace}
        onSave={handleSave}
        onCancel={() => { setShowForm(false); setEditRace(null); }}
        colors={colors}
        styles={styles}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>My Race Results</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Log splits → see your limiters
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.calcBtn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
          onPress={() => { setEditRace(null); setShowForm(true); }}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.calcBtnText}>Log Race</Text>
        </TouchableOpacity>
      </View>

      {!loaded ? (
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl }}>Loading…</Text>
      ) : races.length === 0 ? (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 36 }}>🏁</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: spacing.sm }}>
            No races logged yet
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 4 }}>
            Log your HYROX splits and we'll show you exactly where you're leaving time on the course.
          </Text>
          <TouchableOpacity
            style={[styles.bigCalcBtn, { backgroundColor: colors.primary, marginTop: spacing.md, width: '100%' }]}
            onPress={() => { setEditRace(null); setShowForm(true); }}
          >
            <Text style={styles.bigCalcBtnText}>Log my first race</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Summary strip */}
          {races.length > 1 && (() => {
            const totals = races.map((r) => analyseRace(r)?.total).filter(Boolean);
            const best   = Math.min(...totals);
            const latest = totals[0];
            const diff   = latest - best;
            return (
              <View style={[styles.raceCard, { backgroundColor: colors.primaryMuted, borderColor: colors.primary + '40', flexDirection: 'row', gap: spacing.md }]}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>PB</Text>
                  <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmtTime(best)}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: colors.border }} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Latest</Text>
                  <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmtTime(latest)}</Text>
                  {diff > 0 && <Text style={{ color: '#E74C3C', fontSize: 11 }}>+{fmtTime(diff)} off PB</Text>}
                  {diff === 0 && <Text style={{ color: colors.success, fontSize: 11 }}>= PB 🎉</Text>}
                </View>
                <View style={{ width: 1, backgroundColor: colors.border }} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Races</Text>
                  <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{races.length}</Text>
                </View>
              </View>
            );
          })()}

          {/* History Graph */}
          {races.length >= 2 && (
            <RaceHistoryGraph races={races} colors={colors} />
          )}

          {races.map((race) => (
            <RaceCard
              key={race.id}
              race={race}
              onEdit={handleEdit}
              onDelete={handleDelete}
              colors={colors}
              styles={styles}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
const TABS = ['Pace', 'HYROX', 'Custom', 'Races'];

export default function PaceCalculatorScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState(0);
  const scrollRef = useRef(null);

  const useMetric = true;

  const goToTab = (i) => {
    setActiveTab(i);
    scrollRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: true });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Race Tools</Text>
        <Text style={styles.subtitle}>Pace · HYROX · Custom · Race Analysis</Text>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === i && styles.tabActive]}
            onPress={() => goToTab(i)}
          >
            <Text style={[styles.tabText, { color: activeTab === i ? colors.primary : colors.textMuted }]}>
              {tab}
            </Text>
            {activeTab === i && (
              <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: SCREEN_WIDTH }}>
          <PaceCalculator useMetric={useMetric} colors={colors} styles={styles} />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <HyroxPredictor colors={colors} styles={styles} />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <CustomPredictor colors={colors} styles={styles} />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <RaceAnalysis colors={colors} styles={styles} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      gap: 2,
    },
    title: { color: colors.text, fontSize: 26, fontWeight: '700' },
    subtitle: { color: colors.textMuted, fontSize: 13 },
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      paddingHorizontal: spacing.md,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      position: 'relative',
    },
    tabActive: {},
    tabText: { fontSize: 13, fontWeight: '700' },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '10%',
      right: '10%',
      height: 2,
      borderRadius: 1,
    },
    fieldBlock: { gap: 6 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: Platform.OS === 'ios' ? 10 : 7,
      color: colors.textOnSurface || colors.text,
      fontSize: 17,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    calcBtn: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    },
    calcBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    divider: { height: 1, marginVertical: spacing.xs },
    quickChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
    },
    bigCalcBtn: {
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
    },
    bigCalcBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
    resultCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.lg,
      alignItems: 'center',
      gap: 4,
    },
    resultTotal: { fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      paddingVertical: 3,
    },
    breakdownLabel: { fontSize: 13 },
    breakdownVal: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
    entryCard: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md },
    entryNameInput: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      borderBottomWidth: 1,
      paddingBottom: 4,
      marginRight: spacing.sm,
    },
    addBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 1,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
    },
    addBtnText: { fontSize: 14, fontWeight: '700' },
    raceCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.md,
      gap: spacing.xs,
    },
    limiterBox: {
      borderRadius: radii.md,
      borderWidth: 1,
      padding: spacing.sm,
      gap: 2,
    },
  });
}
