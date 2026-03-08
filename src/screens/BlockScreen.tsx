import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  FlatList,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { AVAILABLE_APPS, AppInfo } from '../types/models';
import ScreenHeader from '../components/common/ScreenHeader';
import { blockingEngine } from '../services/blockingEngine';
import type { BlockingSupport } from '../services/blockingSupport';

export default function BlockScreen() {
  const { theme, themeName } = useTheme();
  const { blockConfig, updateBlockConfig } = useAppState();
  const [showAddApp, setShowAddApp] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [support, setSupport] = useState<BlockingSupport | null>(null);

  useEffect(() => {
    let cancelled = false;
    blockingEngine.getSupport().then((next) => {
      if (!cancelled) {
        setSupport(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const addApp = (app: AppInfo) => {
    if (blockConfig.blockedApps.find((a) => a.id === app.id)) return;
    updateBlockConfig({
      ...blockConfig,
      blockedApps: [...blockConfig.blockedApps, app],
    });
    setShowAddApp(false);
  };

  const removeApp = (appId: string) => {
    updateBlockConfig({
      ...blockConfig,
      blockedApps: blockConfig.blockedApps.filter((a) => a.id !== appId),
    });
  };

  const toggleProtection = (key: keyof typeof blockConfig.protections) => {
    updateBlockConfig({
      ...blockConfig,
      protections: {
        ...blockConfig.protections,
        [key]: !blockConfig.protections[key],
      },
    });
  };

  const availableToAdd = AVAILABLE_APPS.filter(
    (app) => !blockConfig.blockedApps.find((a) => a.id === app.id)
  );

  const styles = makeStyles(theme);

  const protectionItems = [
    {
      key: 'blockUninstall' as const,
      label: 'Block app uninstall',
      subtitle: 'Planned protection. Not enforced in this build.',
      icon: 'delete-forever',
    },
    {
      key: 'blockSplitScreen' as const,
      label: 'Block split screen',
      subtitle: 'Planned protection. Not enforced in this build.',
      icon: 'view-column',
    },
    {
      key: 'blockFloatingWindow' as const,
      label: 'Block floating window',
      subtitle: 'Planned protection. Not enforced in this build.',
      icon: 'picture-in-picture',
    },
  ];

  const enabledProtectionCount = 0;
  const progressPct = Math.min(100, blockConfig.blockedApps.length * 20 + enabledProtectionCount * 6);
  const blockedMinutes = blockConfig.blockedApps.length * 63;
  const blockedHours = Math.floor(blockedMinutes / 60);
  const blockedMinsRemainder = blockedMinutes % 60;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <StatusBar
        barStyle={themeName === 'Light' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.background}
      />
      <ScreenHeader
        title="Blocks"
        rightActions={[
          <TouchableOpacity key="help" onPress={() => setShowHelpModal(true)}>
            <MaterialIcons name="help-outline" size={24} color={theme.textSecondary} />
          </TouchableOpacity>,
        ]}
      />

      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>{support?.headline || 'Checking blocker support'}</Text>
          <Text style={styles.supportText}>
            {support?.detail || 'EatLock is checking whether this build can enforce device-level app blocking.'}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Distracting Apps</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{blockConfig.blockedApps.length} ACTIVE</Text>
            </View>
          </View>

          <View style={styles.appsGrid}>
            {blockConfig.blockedApps.map((app) => (
              <View key={app.id} style={styles.appTile}>
                <TouchableOpacity style={styles.appRemoveBtn} onPress={() => removeApp(app.id)}>
                  <MaterialIcons name="close" size={14} color={theme.textMuted} />
                </TouchableOpacity>
                <View style={styles.appTileIconWrap}>
                  <MaterialIcons name={app.icon as any} size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.appTileName} numberOfLines={1}>{app.name}</Text>
              </View>
            ))}

            <TouchableOpacity style={styles.addTile} onPress={() => setShowAddApp(true)}>
              <View style={styles.addTileIcon}>
                <MaterialIcons name="add" size={22} color={theme.textMuted} />
              </View>
              <Text style={styles.addTileText}>Add</Text>
            </TouchableOpacity>
          </View>

          {blockConfig.blockedApps.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="lock-open" size={36} color={theme.textMuted} />
              <Text style={styles.emptyText}>No distracting apps selected yet</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Planned Protections</Text>
          {protectionItems.map((item) => (
            <View key={item.key} style={styles.toggleCard}>
              <View style={styles.toggleCardLeft}>
                <MaterialIcons name={item.icon as any} size={20} color={theme.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleCardLabel}>{item.label}</Text>
                  <Text style={styles.toggleCardHint}>{item.subtitle}</Text>
                </View>
              </View>
              <Switch
                value={blockConfig.protections[item.key]}
                onValueChange={() => toggleProtection(item.key)}
                disabled
                trackColor={{ false: theme.inputBg, true: `${theme.primary}66` }}
                thumbColor={blockConfig.protections[item.key] ? theme.primary : '#FFFFFF'}
              />
            </View>
          ))}
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressGlow} />
          <View style={styles.progressTopRow}>
            <Text style={styles.progressLabel}>Today's Progress</Text>
            <Text style={styles.progressPct}>{progressPct}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressSub}>
            You've blocked {blockedHours}h {blockedMinsRemainder}m of distractions today.
          </Text>
        </View>
      </ScrollView>

      {/* Add App Modal */}
      <Modal visible={showAddApp} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add App to Block</Text>
              <TouchableOpacity onPress={() => setShowAddApp(false)}>
                <MaterialIcons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableToAdd}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalAppRow}
                  onPress={() => addApp(item)}
                >
                  <View style={styles.appIcon}>
                    <MaterialIcons name={item.icon as any} size={22} color={theme.primary} />
                  </View>
                  <Text style={styles.modalAppName}>{item.name}</Text>
                  <MaterialIcons name="add-circle-outline" size={22} color={theme.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>All apps have been added</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Help Modal */}
      <Modal visible={showHelpModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowHelpModal(false)}
        >
          <View style={styles.helpContent}>
            <Text style={styles.helpTitle}>How Blocking Works</Text>
            <Text style={styles.helpText}>
              {support?.detail || 'Device-level app blocking depends on a supported Android build with native blocker modules.'}
              {'\n\n'}
              Your selected app list is still saved locally for meal tracking and for supported builds.
              {'\n\n'}
              The uninstall, split-screen, and floating-window toggles shown here are planned protections and are not enforced in this build.
            </Text>
            <TouchableOpacity
              style={styles.helpBtn}
              onPress={() => setShowHelpModal(false)}
            >
              <Text style={styles.helpBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 110 },
    section: { marginTop: 22 },
    supportCard: {
      marginTop: 18,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 16,
    },
    supportTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 6,
    },
    supportText: {
      fontSize: 13,
      lineHeight: 20,
      color: theme.textSecondary,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.text,
    },
    activeBadge: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.chipBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    activeBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textMuted,
      letterSpacing: 0.5,
    },
    appsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    appTile: {
      width: '31%',
      minHeight: 112,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      paddingVertical: 14,
      alignItems: 'center',
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    appRemoveBtn: {
      position: 'absolute',
      right: 6,
      top: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
      zIndex: 2,
    },
    appTileIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 14,
      marginBottom: 10,
    },
    appTileName: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    addTile: {
      width: '31%',
      minHeight: 112,
      borderRadius: 18,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      backgroundColor: `${theme.surface}AA`,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 14,
    },
    addTileIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 8,
    },
    addTileText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
    },
    toggleCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#0F172A',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    toggleCardLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      flex: 1,
      paddingRight: 10,
    },
    toggleCardLabel: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1 },
    toggleCardHint: { fontSize: 12, color: theme.textMuted, marginTop: 2, lineHeight: 16 },
    progressCard: {
      marginTop: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: `${theme.primary}33`,
      backgroundColor: `${theme.primary}14`,
      paddingHorizontal: 16,
      paddingVertical: 16,
      overflow: 'hidden',
    },
    progressGlow: {
      position: 'absolute',
      width: 140,
      height: 140,
      borderRadius: 70,
      right: -60,
      top: -60,
      backgroundColor: `${theme.primary}2A`,
    },
    progressTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 10,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    progressPct: { fontSize: 28, fontWeight: '800', color: theme.text },
    progressTrack: {
      width: '100%',
      height: 8,
      borderRadius: 999,
      backgroundColor: `${theme.border}99`,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    progressSub: {
      marginTop: 8,
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '600',
    },
    appIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: theme.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 20,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: { fontSize: 20, fontWeight: '600', color: theme.text },
    modalAppRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalAppName: { flex: 1, fontSize: 16, color: theme.text },
    helpContent: {
      backgroundColor: theme.surface,
      borderRadius: 22,
      padding: 24,
      margin: 32,
      alignSelf: 'center',
      maxWidth: 360,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#0F172A',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    helpTitle: { fontSize: 20, fontWeight: '700', color: theme.text, marginBottom: 12 },
    helpText: { fontSize: 14, color: theme.textSecondary, lineHeight: 22 },
    helpBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 20,
    },
    helpBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  });
