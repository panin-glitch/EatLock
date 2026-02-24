/**
 * ResultCard — BiteWise-style floating card for scan results.
 *
 * Used in both PreScanCamera and PostScanCamera.
 * Supports Light/Dark themes via tokens.
 * Layout: Header (food+confidence | calories) → Roast → Macros → Buttons
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import type { NutritionEstimate } from '../../services/vision/types';

// ── Types ────────────────────────────────────

export interface ResultCardButton {
  label: string;
  onPress: () => void;
  /** If true, shown as secondary (dimmer bg) */
  secondary?: boolean;
}

export interface CaloriesRowData {
  nutrition: NutritionEstimate | null;
  loading?: boolean;
  error?: boolean;
  onEdit?: () => void;
}

export interface ResultCardProps {
  /** Theme tokens */
  theme: ThemeColors;
  /** Main title text, e.g. "Grilled chicken", "Not food", "AI unavailable" */
  title: string;
  /** Icon + title colour (verdict colour) */
  accentColor: string;
  /** Optional confidence string, e.g. "95%". */
  confidence?: string;
  /** The roast / praise line */
  roast?: string;
  /** Smaller sub-text (reason, retake hint, etc.) */
  subtext?: string;
  /** Calorie + macro data (only on BEFORE scan success) */
  calories?: CaloriesRowData;
  /** Action buttons (up to 2) */
  buttons: ResultCardButton[];
  /** Bottom inset from safe-area (default 24) */
  bottomInset?: number;
}

// ── Component ────────────────────────────────

export function ResultCard({
  theme,
  accentColor,
  title,
  confidence,
  roast,
  subtext,
  calories,
  buttons,
  bottomInset = 24,
}: ResultCardProps) {
  const isDark = theme.background === '#000' || theme.background.startsWith('#0') || theme.background.startsWith('#1');
  const s = makeStyles(theme, isDark, bottomInset);
  const n = calories?.nutrition;

  return (
    <View style={s.card}>
      {/* ── Header: two columns ── */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Text style={[s.titleText, { color: accentColor }]} numberOfLines={1}>
            {title}
          </Text>
          {confidence ? (
            <Text style={s.confidenceText}>{confidence} confidence</Text>
          ) : null}
        </View>

        {calories ? (
          <View style={s.headerRight}>
            {calories.loading ? (
              <Text style={s.calNumber}>…</Text>
            ) : calories.error || !n ? (
              <Text style={s.calNumber}>—</Text>
            ) : (
              <View style={s.calRow}>
                <Text style={s.calNumber}>{n.estimated_calories}</Text>
                <Text style={s.calUnit}>cal</Text>
              </View>
            )}
            {n && !calories.loading && calories.onEdit ? (
              <TouchableOpacity onPress={calories.onEdit} hitSlop={8}>
                <Text style={[s.editLink, { color: theme.primary }]}>Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ── Roast line ── */}
      {roast ? (
        <Text style={s.roast} numberOfLines={2}>{roast}</Text>
      ) : null}

      {/* ── Subtext / hint ── */}
      {subtext ? (
        <Text style={s.subtext} numberOfLines={2}>{subtext}</Text>
      ) : null}

      {/* ── Macro chips row ── */}
      {calories && !calories.loading && n ? (
        <View style={s.macroRow}>
          <MacroChip label="Protein" value={n.protein_g} unit="g" theme={theme} isDark={isDark} />
          <MacroChip label="Carbs"   value={n.carbs_g}   unit="g" theme={theme} isDark={isDark} />
          <MacroChip label="Fat"     value={n.fat_g}     unit="g" theme={theme} isDark={isDark} />
        </View>
      ) : null}

      {/* ── Footer Buttons ── */}
      {buttons.length > 0 && (
        <View style={s.buttonsRow}>
          {buttons.map((btn, i) => (
            <TouchableOpacity
              key={i}
              style={[
                s.button,
                btn.secondary
                  ? { backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0' }
                  : { backgroundColor: '#111' },
              ]}
              onPress={btn.onPress}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  s.buttonText,
                  btn.secondary && { color: isDark ? '#bbb' : '#555' },
                ]}
              >
                {btn.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Macro Chip ──

function MacroChip({
  label,
  value,
  unit,
  theme,
  isDark,
}: {
  label: string;
  value?: number | null;
  unit: string;
  theme: ThemeColors;
  isDark: boolean;
}) {
  const bg = isDark ? '#2a2a2a' : '#f0f0f0';
  const valText = value != null ? `${Math.round(value)}${unit}` : '—';
  return (
    <View style={[chipStyles.chip, { backgroundColor: bg }]}>
      <Text style={[chipStyles.chipVal, { color: theme.text }]}>{valText}</Text>
      <Text style={[chipStyles.chipLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  chipVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
});

// ── Styles ───────────────────────────────────

const makeStyles = (c: ThemeColors, isDark: boolean, bottomInset: number) =>
  StyleSheet.create({
    card: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: bottomInset,
      backgroundColor: c.card,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
      // Shadow for light, border for dark
      ...(isDark
        ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }
        : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
            elevation: 10,
          }),
      zIndex: 30,
    },
    // Header
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    headerLeft: {
      flex: 1,
      marginRight: 12,
    },
    titleText: {
      fontSize: 19,
      fontWeight: '700',
      marginBottom: 2,
    },
    confidenceText: {
      fontSize: 12,
      fontWeight: '500',
      color: c.textSecondary,
    },
    headerRight: {
      alignItems: 'flex-end',
    },
    calRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 3,
    },
    calNumber: {
      color: c.text,
      fontSize: 26,
      fontWeight: '700',
      lineHeight: 30,
    },
    calUnit: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    editLink: {
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    // Roast
    roast: {
      color: c.text,
      fontSize: 16,
      fontWeight: '500',
      lineHeight: 21,
      marginBottom: 4,
    },
    // Subtext
    subtext: {
      color: c.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      marginBottom: 4,
    },
    // Macros
    macroRow: {
      flexDirection: 'row',
      marginTop: 6,
      marginBottom: 10,
      marginHorizontal: -3,
    },
    // Buttons
    buttonsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 8,
    },
    button: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: '600',
    },
  });
