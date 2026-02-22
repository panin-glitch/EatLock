import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  Modal,
  FlatList,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppState } from '../state/AppStateContext';
import { AVAILABLE_APPS, AppInfo } from '../types/models';

export default function BlockScreen() {
  const { theme } = useTheme();
  const { blockConfig, updateBlockConfig } = useAppState();
  const [showAddApp, setShowAddApp] = useState(false);
  const [newWebsite, setNewWebsite] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

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

  const toggleShort = (key: keyof typeof blockConfig.blockShortsFlags) => {
    updateBlockConfig({
      ...blockConfig,
      blockShortsFlags: {
        ...blockConfig.blockShortsFlags,
        [key]: !blockConfig.blockShortsFlags[key],
      },
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

  const addWebsite = () => {
    if (!newWebsite.trim()) return;
    updateBlockConfig({
      ...blockConfig,
      blockWebsites: [...blockConfig.blockWebsites, newWebsite.trim()],
    });
    setNewWebsite('');
  };

  const removeWebsite = (url: string) => {
    updateBlockConfig({
      ...blockConfig,
      blockWebsites: blockConfig.blockWebsites.filter((w) => w !== url),
    });
  };

  const availableToAdd = AVAILABLE_APPS.filter(
    (app) => !blockConfig.blockedApps.find((a) => a.id === app.id)
  );

  const styles = makeStyles(theme);

  const shortsItems = [
    { key: 'ytShorts' as const, name: 'YouTube Shorts', icon: 'play-circle-outline' },
    { key: 'igReels' as const, name: 'IG Reels', icon: 'camera' },
    { key: 'snapSpotlight' as const, name: 'Snapchat Spotlight', icon: 'chat-bubble' },
    { key: 'fbReels' as const, name: 'Facebook Reels', icon: 'people' },
  ];

  const protectionItems = [
    { key: 'blockUninstall' as const, label: 'Block app uninstall during strict mode', icon: 'delete-forever' },
    { key: 'blockSplitScreen' as const, label: 'Block split screen', icon: 'view-column' },
    { key: 'blockFloatingWindow' as const, label: 'Block floating window', icon: 'picture-in-picture' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Blocks</Text>
        <TouchableOpacity onPress={() => setShowHelpModal(true)}>
          <MaterialIcons name="help-outline" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Locked During Meals */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Locked During Meals</Text>
            <TouchableOpacity
              style={styles.addAction}
              onPress={() => setShowAddApp(true)}
            >
              <MaterialIcons name="add" size={18} color={theme.primary} />
              <Text style={styles.addActionText}>Add App</Text>
            </TouchableOpacity>
          </View>

          {blockConfig.blockedApps.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="lock-open" size={36} color={theme.textMuted} />
              <Text style={styles.emptyText}>No apps blocked yet</Text>
            </View>
          ) : (
            blockConfig.blockedApps.map((app) => (
              <View key={app.id} style={styles.appRow}>
                <View style={styles.appRowLeft}>
                  <View style={styles.appIcon}>
                    <MaterialIcons name={app.icon as any} size={22} color={theme.primary} />
                  </View>
                  <Text style={styles.appName}>{app.name}</Text>
                </View>
                <TouchableOpacity onPress={() => removeApp(app.id)}>
                  <MaterialIcons name="remove-circle-outline" size={22} color={theme.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Section 2: Block Shorts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Block Shorts</Text>
          <Text style={styles.sectionHint}>
            Block short-form video content during meals
          </Text>
          {shortsItems.map((item) => (
            <View key={item.key} style={styles.toggleRow}>
              <View style={styles.toggleRowLeft}>
                <MaterialIcons name={item.icon as any} size={20} color={theme.text} />
                <Text style={styles.toggleRowLabel}>{item.name}</Text>
              </View>
              {blockConfig.blockShortsFlags[item.key] ? (
                <TouchableOpacity
                  style={styles.addedBadge}
                  onPress={() => toggleShort(item.key)}
                >
                  <MaterialIcons name="check" size={16} color={theme.primary} />
                  <Text style={styles.addedBadgeText}>Added</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.addBadge}
                  onPress={() => toggleShort(item.key)}
                >
                  <MaterialIcons name="add" size={16} color={theme.primary} />
                  <Text style={styles.addBadgeText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Section 3: Other blocks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Other Blocks</Text>

          {/* Block Websites */}
          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Block Websites</Text>
            <View style={styles.websiteInputRow}>
              <TextInput
                style={styles.websiteInput}
                value={newWebsite}
                onChangeText={setNewWebsite}
                placeholder="e.g. reddit.com"
                placeholderTextColor={theme.textMuted}
                onSubmitEditing={addWebsite}
              />
              <TouchableOpacity style={styles.websiteAddBtn} onPress={addWebsite}>
                <MaterialIcons name="add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            {blockConfig.blockWebsites.map((url) => (
              <View key={url} style={styles.websiteRow}>
                <MaterialIcons name="language" size={18} color={theme.textSecondary} />
                <Text style={styles.websiteText}>{url}</Text>
                <TouchableOpacity onPress={() => removeWebsite(url)}>
                  <MaterialIcons name="close" size={18} color={theme.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Block Notifications */}
          <View style={styles.toggleCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleCardLabel}>Block Notifications</Text>
              <Text style={styles.toggleCardHint}>
                Silence notifications during strict mode meals
              </Text>
            </View>
            <Switch
              value={blockConfig.blockNotificationsEnabled}
              onValueChange={(val) =>
                updateBlockConfig({ ...blockConfig, blockNotificationsEnabled: val })
              }
              trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
              thumbColor={blockConfig.blockNotificationsEnabled ? theme.primary : theme.textMuted}
            />
          </View>
        </View>

        {/* Section 4: Block Protections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Block Protections</Text>
          <Text style={styles.sectionHint}>
            Requires device permission to enforce
          </Text>
          {protectionItems.map((item) => (
            <View key={item.key} style={styles.toggleCard}>
              <View style={styles.toggleCardLeft}>
                <MaterialIcons name={item.icon as any} size={20} color={theme.text} />
                <Text style={styles.toggleCardLabel}>{item.label}</Text>
              </View>
              <Switch
                value={blockConfig.protections[item.key]}
                onValueChange={() => toggleProtection(item.key)}
                trackColor={{ false: theme.inputBg, true: theme.primaryDim }}
                thumbColor={blockConfig.protections[item.key] ? theme.primary : theme.textMuted}
              />
            </View>
          ))}
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
              When you start a Strict Mode meal, EatLock will block access to your
              selected apps. Currently, blocking is simulated within the app.
              {'\n\n'}
              For full device-level blocking, OS permissions (Android Accessibility
              Service / iOS Screen Time API) will be integrated in a future update.
              {'\n\n'}
              All your block settings are saved locally and ready for when OS-level
              enforcement becomes available.
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 8,
    },
    title: { fontSize: 28, fontWeight: '700', color: theme.text },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
    section: {
      marginTop: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
    },
    sectionHint: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 12,
    },
    addAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    addActionText: { color: theme.primary, fontSize: 14, fontWeight: '600' },
    appRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    appRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    appIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: theme.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    appName: { fontSize: 15, fontWeight: '500', color: theme.text },
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
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    toggleRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    toggleRowLabel: { fontSize: 15, color: theme.text },
    addBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    addBadgeText: { color: theme.primary, fontSize: 13, fontWeight: '600' },
    addedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.primaryDim,
    },
    addedBadgeText: { color: theme.primary, fontSize: 13, fontWeight: '600' },
    subsection: { marginBottom: 12 },
    subsectionTitle: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.text,
      marginBottom: 8,
    },
    websiteInputRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    websiteInput: {
      flex: 1,
      backgroundColor: theme.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.text,
      fontSize: 14,
    },
    websiteAddBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      width: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    websiteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    websiteText: { flex: 1, color: theme.text, fontSize: 14 },
    toggleCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    toggleCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      paddingRight: 10,
    },
    toggleCardLabel: { fontSize: 14, fontWeight: '500', color: theme.text, flex: 1 },
    toggleCardHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
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
      borderRadius: 20,
      padding: 24,
      margin: 32,
      alignSelf: 'center',
      maxWidth: 360,
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
