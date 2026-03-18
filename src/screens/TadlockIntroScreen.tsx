import React from 'react';
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/colorUtils';

const INTRO_ART = require('../../assets/tadlock-sleeping.png');

const ONBOARDING_POINTS = [
  {
    icon: 'photo-camera',
    title: 'Take a before photo',
    body: 'Start each meal with a quick scan so TadLock knows the session is real.',
  },
  {
    icon: 'lock',
    title: 'Stay off distractions',
    body: 'Use meal sessions to keep social apps out of the way while you eat.',
  },
  {
    icon: 'done-all',
    title: 'Finish and check out',
    body: 'Wrap the meal with an after photo and keep your streak moving.',
  },
] as const;

export default function TadlockIntroScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const openMainApp = () => {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          state: {
            index: 0,
            routes: [{ name: 'HomeTab' }],
          },
        },
      ],
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={styles.container.backgroundColor} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroShell}>
          <View style={styles.heroGlow} />
          <Image source={INTRO_ART} style={styles.heroArt} resizeMode="contain" />
        </View>

        <View style={styles.headlineBlock}>
          <Text style={styles.eyebrow}>Welcome to TadLock</Text>
          <Text style={styles.title}>Eat first. Scroll later.</Text>
          <Text style={styles.subtitle}>
            Start with a short splash, run through setup, then lock into calmer meals.
          </Text>
        </View>

        <View style={styles.pointsList}>
          {ONBOARDING_POINTS.map((point) => (
            <View key={point.title} style={styles.pointCard}>
              <View style={styles.pointIcon}>
                <MaterialIcons name={point.icon} size={22} color={theme.primary} />
              </View>
              <View style={styles.pointCopy}>
                <Text style={styles.pointTitle}>{point.title}</Text>
                <Text style={styles.pointBody}>{point.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={openMainApp} activeOpacity={0.88}>
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('PermissionsOnboarding')}
          activeOpacity={0.84}
        >
          <Text style={styles.secondaryButtonText}>Blocking permissions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F8F6EC',
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 36,
      paddingBottom: 188,
    },
    heroShell: {
      height: 312,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 18,
    },
    heroGlow: {
      position: 'absolute',
      width: 284,
      height: 284,
      borderRadius: 142,
      backgroundColor: 'rgba(92,200,107,0.18)',
      transform: [{ scaleX: 1.06 }],
    },
    heroArt: {
      width: 280,
      height: 280,
    },
    headlineBlock: {
      gap: 8,
      marginBottom: 22,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: '#5A9C5E',
    },
    title: {
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '900',
      letterSpacing: -0.8,
      color: '#0F172A',
    },
    subtitle: {
      fontSize: 16,
      lineHeight: 24,
      color: '#516074',
    },
    pointsList: {
      gap: 12,
    },
    pointCard: {
      flexDirection: 'row',
      gap: 14,
      padding: 16,
      borderRadius: 22,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: withAlpha('#0F172A', 0.06),
    },
    pointIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.primary, 0.18),
    },
    pointCopy: {
      flex: 1,
      gap: 4,
    },
    pointTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: '#0F172A',
    },
    pointBody: {
      fontSize: 14,
      lineHeight: 20,
      color: '#5B677A',
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 34,
      backgroundColor: 'rgba(248,246,236,0.96)',
      borderTopWidth: 1,
      borderTopColor: withAlpha('#0F172A', 0.06),
      gap: 10,
    },
    primaryButton: {
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0F172A',
    },
    primaryButtonText: {
      fontSize: 17,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    secondaryButton: {
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: withAlpha('#0F172A', 0.08),
    },
    secondaryButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#253141',
    },
  });
