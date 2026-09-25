import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RaceEditModal from '../components/RaceEditModal';
import { radii, spacing } from '../constants/theme';
import { useAthlete } from '../context/AthleteContext';
import { useAuth } from '../context/AuthContext';
import { daysUntil, formatRaceDate, useRace } from '../context/RaceContext';
import { useTheme } from '../context/ThemeContext';

const initialConnectedApps = [
  { id: 'strava', name: 'Strava', color: '#FC5200', connected: true },
  { id: 'garmin', name: 'Garmin', color: '#007BFF', connected: false },
  { id: 'apple-health', name: 'Apple Health', color: '#FF4D5A', connected: false },
  { id: 'whoop', name: 'Whoop', color: '#7C3AED', connected: false },
  { id: 'final-surge', name: 'Final Surge', color: '#F97316', connected: false },
  { id: 'training-peaks', name: 'TrainingPeaks', color: '#16A34A', connected: false },
];

const athlete = {
  name: 'Sam Carter',
  coach: 'Hyathlon Performance',
  division: 'Men’s Open',
};

const ATHLETE_TYPES = [
  { value: 'hyrox', label: 'Hyrox Athlete' },
  { value: 'runner', label: 'Runner' },
];

const personalBests = [
  { label: 'HYROX', value: '1:12:04' },
  { label: '5K', value: '18:42' },
  { label: '10K', value: '39:10' },
  { label: 'Half Marathon', value: '1:26:55' },
];

const MIN_PASSWORD_LENGTH = 8;

function roleLabel(account) {
  if (account?.role === 'coach') return 'Coach';
  if (account?.athlete?.tier === 'member') return 'Athlete · Coached';
  if (account?.athlete) return 'Athlete · App';
  return null;
}

const settingsItems = [
  { id: 'edit', label: 'Edit Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'units', label: 'Units — Metric' },
  { id: 'coach', label: 'Message Coach' },
  { id: 'logout', label: 'Log Out' },
];

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { athleteType, setAthleteType } = useAthlete();
  const { race, setRace } = useRace();
  const [raceModalVisible, setRaceModalVisible] = useState(false);
  const [connectedApps, setConnectedApps] = useState(initialConnectedApps);
  const { session, account, signOut, changePassword } = useAuth();
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const handleChangePassword = async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordMessage({ error: true, text: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ error: true, text: "The passwords don't match." });
      return;
    }
    setSavingPassword(true);
    const error = await changePassword(newPassword);
    setSavingPassword(false);
    if (error) {
      setPasswordMessage({ error: true, text: error });
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setPasswordFormOpen(false);
    setPasswordMessage({ error: false, text: 'Password changed.' });
  };

  const toggleConnectedApp = (id) => {
    setConnectedApps((prev) =>
      prev.map((app) => (app.id === id ? { ...app, connected: !app.connected } : app)),
    );
  };

  const displayName = account?.name || athlete.name;
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.coach}>Coached by {athlete.coach}</Text>
          <View style={styles.divisionTag}>
            <Text style={styles.divisionTagText}>{athlete.division}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Athlete Type</Text>
        <View style={styles.athleteTypeRow}>
          {ATHLETE_TYPES.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.athleteTypeChip,
                athleteType === option.value && styles.athleteTypeChipActive,
              ]}
              onPress={() => setAthleteType(option.value)}
            >
              <Text
                style={[
                  styles.athleteTypeChipText,
                  athleteType === option.value && styles.athleteTypeChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Upcoming Races</Text>
        <TouchableOpacity
          style={styles.raceCard}
          onPress={() => setRaceModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={styles.raceCardHeader}>
            <View style={styles.raceTypeTag}>
              <Text style={styles.raceTypeTagText}>{race.type}</Text>
            </View>
            <Text style={styles.raceDays}>{Math.max(daysUntil(race.date), 0)} days to go</Text>
          </View>
          <Text style={styles.raceName}>{race.name}</Text>
          <Text style={styles.raceMeta}>
            {formatRaceDate(race.date)} · {race.location}
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Personal Bests</Text>
        <View style={styles.pbGrid}>
          {personalBests.map((pb) => (
            <View key={pb.label} style={styles.pbCard}>
              <Text style={styles.pbValue}>{pb.value}</Text>
              <Text style={styles.pbLabel}>{pb.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.connectedAppsSection}>
          <Text style={styles.sectionTitle}>Connected Apps</Text>
          <View style={styles.connectedAppsCard}>
            {connectedApps.map((app) => (
              <View key={app.id} style={styles.connectedAppRow}>
                <View style={styles.connectedAppInfo}>
                  <View style={[styles.appIconBadge, { backgroundColor: app.color }]} />
                  <View style={styles.connectedAppLabelGroup}>
                    <Text style={styles.connectedAppName}>{app.name}</Text>
                    <Text
                      style={[
                        styles.connectedAppStatus,
                        app.connected
                          ? styles.connectedAppStatusConnected
                          : styles.connectedAppStatusDisconnected,
                      ]}
                    >
                      {app.connected ? 'Connected' : 'Disconnected'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={app.connected}
                  onValueChange={() => toggleConnectedApp(app.id)}
                  trackColor={{ false: colors.border, true: colors.primaryMuted }}
                  thumbColor={app.connected ? colors.primary : colors.textOnSurfaceFaint}
                />
              </View>
            ))}
          </View>
          <Text style={styles.connectedAppsWarning}>
            Only connect one app at a time, or a double upload may occur on your training calendar.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.settingsList}>
          <View style={styles.settingsRow}>
            <View style={styles.accountInfo}>
              <Text style={styles.settingsLabel}>{session?.user.email}</Text>
              {roleLabel(account) && <Text style={styles.accountRole}>{roleLabel(account)}</Text>}
            </View>
          </View>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              setPasswordFormOpen((open) => !open);
              setPasswordMessage(null);
            }}
          >
            <Text style={styles.settingsLabel}>Change Password</Text>
            <Text style={styles.chevron}>{passwordFormOpen ? 'v' : '>'}</Text>
          </TouchableOpacity>
          {passwordFormOpen && (
            <View style={styles.passwordForm}>
              <TextInput
                style={styles.input}
                placeholder="New password"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                onSubmitEditing={handleChangePassword}
              />
              <TouchableOpacity
                style={[styles.saveButton, savingPassword && styles.saveButtonDisabled]}
                onPress={handleChangePassword}
                disabled={savingPassword}
                activeOpacity={0.8}
              >
                {savingPassword ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Password</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          {passwordMessage && (
            <Text style={[styles.passwordMessage, passwordMessage.error && styles.passwordMessageError]}>
              {passwordMessage.text}
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsList}>
          <View style={styles.settingsRow}>
            <View style={styles.themeRowLabel}>
              <Ionicons
                name={isDark ? 'moon' : 'sunny'}
                size={18}
                color={isDark ? colors.textOnSurfaceMuted : colors.warning}
              />
              <Text style={styles.settingsLabel}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primaryMuted }}
              thumbColor={isDark ? colors.primary : colors.textOnSurfaceFaint}
            />
          </View>
          {settingsItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.settingsRow}
              onPress={item.id === 'logout' ? signOut : undefined}
            >
              <Text
                style={[
                  styles.settingsLabel,
                  item.id === 'logout' && styles.settingsLabelDanger,
                ]}
              >
                {item.label}
              </Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <RaceEditModal
        visible={raceModalVisible}
        race={race}
        onClose={() => setRaceModalVisible(false)}
        onSave={(updatedRace) => {
          setRace(updatedRace);
          setRaceModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  profileHeader: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  coach: {
    color: colors.textMuted,
    fontSize: 13,
  },
  divisionTag: {
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  divisionTagText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  athleteTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  athleteTypeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  athleteTypeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  athleteTypeChipText: {
    color: colors.textOnSurfaceMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  athleteTypeChipTextActive: {
    color: colors.primary,
  },
  raceCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  raceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  raceTypeTag: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  raceTypeTagText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  raceDays: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  raceName: {
    color: colors.textOnSurface,
    fontSize: 18,
    fontWeight: '700',
  },
  raceMeta: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
  },
  pbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pbCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  pbValue: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
  },
  pbLabel: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
  },
  connectedAppsSection: {
    gap: spacing.sm,
  },
  connectedAppsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  connectedAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  connectedAppInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
  },
  appIconBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectedAppLabelGroup: {
    gap: 2,
  },
  connectedAppName: {
    color: colors.textOnSurface,
    fontSize: 15,
    fontWeight: '600',
  },
  connectedAppStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  connectedAppStatusConnected: {
    color: colors.success,
  },
  connectedAppStatusDisconnected: {
    color: colors.textOnSurfaceFaint,
  },
  connectedAppsWarning: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
  settingsList: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  themeRowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsLabel: {
    color: colors.textOnSurface,
    fontSize: 15,
  },
  settingsLabelDanger: {
    color: colors.primary,
  },
  chevron: {
    color: colors.textOnSurfaceFaint,
    fontSize: 14,
  },
  accountInfo: {
    gap: 2,
  },
  accountRole: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  passwordForm: {
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textOnSurface,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  passwordMessage: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  passwordMessageError: {
    color: '#EF4444',
  },
  });
}
