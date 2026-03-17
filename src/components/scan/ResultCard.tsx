import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ThemeColors } from '../../theme/colors';
import { isColorDark, withAlpha } from '../../theme/colorUtils';
import type { NutritionEstimate } from '../../services/vision/types';

export interface ResultCardButton {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}

export interface CaloriesRowData {
  nutrition: NutritionEstimate | null;
  loading?: boolean;
  error?: boolean;
  onEdit?: () => void;
}

export interface ResultCardProps {
  theme: ThemeColors;
  title: string;
  accentColor: string;
  roast?: string;
  subtext?: string;
  calories?: CaloriesRowData;
  buttons: ResultCardButton[];
  bottomInset?: number;
  confidencePercent?: number;
  mealTypeLabel?: string;
  variant?: 'default' | 'meal-detail';
}

function clampPercent(value?: number): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getConfidencePercent(
  explicit: number | undefined,
  nutrition: NutritionEstimate | null | undefined,
): number | null {
  const provided = clampPercent(explicit);
  if (provided != null) return provided;
  if (nutrition?.confidence == null) return null;
  return clampPercent(nutrition.confidence * 100);
}

export function ResultCard({
  theme,
  accentColor,
  title,
  roast,
  subtext,
  calories,
  buttons,
  bottomInset = 24,
  confidencePercent,
  mealTypeLabel,
  variant = 'default',
}: ResultCardProps) {
  const isDark = isColorDark(theme.background);
  const styles = makeStyles(theme, isDark, bottomInset);
  const nutrition = calories?.nutrition;
  const confidence = getConfidencePercent(confidencePercent, nutrition);

  if (variant === 'meal-detail') {
    const primaryAction = buttons.find((button) => !button.secondary) || buttons[0];
    const [portion, setPortion] = useState(1);

    const scale = (value?: number | null) => Math.round((value ?? 0) * portion);
    const calorieValue = scale(nutrition?.estimated_calories);
    const proteinValue = scale(nutrition?.protein_g);
    const carbsValue = scale(nutrition?.carbs_g);
    const fatValue = scale(nutrition?.fat_g);

    return (
      <View style={styles.mealDetailCard}>
        <View style={styles.mealDetailHandleWrap}>
          <View style={styles.mealDetailHandle} />
        </View>

        <View style={styles.mealDetailContent}>
          <View style={styles.mealInfoCenter}>
            <Text style={styles.mealTypeText}>{mealTypeLabel || 'Meal'}</Text>
            <Text style={styles.mealTitleText}>{title}</Text>
          </View>

          <View style={styles.portionCard}>
            <View style={styles.portionLeft}>
              <View style={styles.portionIconWrap}>
                <MaterialIcons name="restaurant" size={17} color={theme.success} />
              </View>
              <Text style={styles.portionLabel}>Portion Size</Text>
            </View>

            <View style={styles.portionRight}>
              <TouchableOpacity
                style={styles.portionMinus}
                onPress={() => setPortion((prev) => Math.max(1, prev - 1))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Decrease portion size"
              >
                <MaterialIcons name="remove" size={18} color={theme.textSecondary} />
              </TouchableOpacity>

              <Text style={styles.portionCount}>{portion}</Text>

              <TouchableOpacity
                style={styles.portionPlus}
                onPress={() => setPortion((prev) => prev + 1)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Increase portion size"
              >
                <MaterialIcons name="add" size={18} color={theme.onPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.detailNutritionGrid}>
            <DetailMetricTile theme={theme} label="CALORIES" value={String(calorieValue)} unit="cal" onEdit={calories?.onEdit} />
            <DetailMetricTile theme={theme} label="PROTEIN" value={String(proteinValue)} unit="g" onEdit={calories?.onEdit} />
            <DetailMetricTile theme={theme} label="CARBS" value={String(carbsValue)} unit="g" onEdit={calories?.onEdit} />
            <DetailMetricTile theme={theme} label="FAT" value={String(fatValue)} unit="g" onEdit={calories?.onEdit} />
          </View>

          {primaryAction ? (
            <TouchableOpacity
              style={styles.logMealBtn}
              onPress={primaryAction.onPress}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={primaryAction.label}
            >
              <MaterialIcons name="check-circle" size={18} color={theme.onPrimary} />
              <Text style={styles.logMealBtnText}>{primaryAction.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  const hasNutrition = !!(calories && !calories.loading && !calories.error && nutrition);

  return (
    <View style={styles.card}>
      <View style={styles.handle} />

      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {hasNutrition ? <Text style={styles.headerLabel}>Meal details</Text> : null}
          <Text style={[styles.titleText, { color: accentColor }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {confidence != null ? (
          <View
            style={[
              styles.percentBadge,
              { backgroundColor: `${theme.primary}1A`, borderColor: `${theme.primary}40` },
            ]}
          >
            <Text style={[styles.percentText, { color: theme.primary }]}>{confidence}%</Text>
          </View>
        ) : null}
      </View>

      {roast ? (
        <Text style={styles.roast} numberOfLines={2}>
          {roast}
        </Text>
      ) : null}

      {subtext ? (
        <Text style={styles.subtext} numberOfLines={2}>
          {subtext}
        </Text>
      ) : null}

      {calories ? (
        <View style={styles.nutritionWrap}>
          {calories.loading ? (
            <View style={styles.loadingRow}>
              <Text style={styles.loadingText}>Estimating nutrition…</Text>
            </View>
          ) : calories.error || !nutrition ? (
            <View style={styles.loadingRow}>
              <Text style={styles.loadingText}>Nutrition details unavailable</Text>
            </View>
          ) : (
            <>
              <View style={styles.nutritionGrid}>
                <NutrientCell
                  label="Calories"
                  value={String(Math.round(nutrition.estimated_calories))}
                  unit="kcal"
                  theme={theme}
                />
                <NutrientCell
                  label="Protein"
                  value={String(Math.round(nutrition.protein_g ?? 0))}
                  unit="g"
                  theme={theme}
                />
                <NutrientCell
                  label="Carbs"
                  value={String(Math.round(nutrition.carbs_g ?? 0))}
                  unit="g"
                  theme={theme}
                />
                <NutrientCell
                  label="Fat"
                  value={String(Math.round(nutrition.fat_g ?? 0))}
                  unit="g"
                  theme={theme}
                />
              </View>

              {calories.onEdit ? (
                <TouchableOpacity style={styles.editPill} onPress={calories.onEdit}>
                  <Text style={styles.editPillText}>Edit nutrition</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {buttons.length > 0 ? (
        <View style={styles.buttonsRow}>
          {buttons.map((button, index) => (
            <TouchableOpacity
              key={index}
              disabled={button.disabled}
              style={[
                styles.button,
                button.secondary
                  ? {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.border,
                    }
                  : {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                button.disabled && styles.buttonDisabled,
              ]}
              onPress={button.onPress}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.buttonText,
                  button.secondary && { color: theme.textSecondary },
                  !button.secondary && { color: theme.onPrimary },
                  button.disabled && styles.buttonTextDisabled,
                ]}
              >
                {button.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DetailMetricTile({
  theme,
  label,
  value,
  unit,
  onEdit,
}: {
  theme: ThemeColors;
  label: string;
  value: string;
  unit: string;
  onEdit?: () => void;
}) {
  const styles = makeDetailTileStyles(theme);
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          disabled={!onEdit}
          onPress={onEdit}
          activeOpacity={0.7}
          accessibilityRole={onEdit ? 'button' : undefined}
          accessibilityLabel={onEdit ? `Edit ${label.toLowerCase()}` : undefined}
        >
          <Text style={styles.edit}>EDIT</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

function NutrientCell({
  label,
  value,
  unit,
  theme,
}: {
  label: string;
  value: string;
  unit: string;
  theme: ThemeColors;
}) {
  return (
    <View style={[cellStyles.cell, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <Text style={[cellStyles.label, { color: theme.textMuted }]}>{label}</Text>
      <View style={cellStyles.valueRow}>
        <Text style={[cellStyles.value, { color: theme.text }]}>{value}</Text>
        <Text style={[cellStyles.unit, { color: theme.textSecondary }]}>{unit}</Text>
      </View>
    </View>
  );
}

const makeDetailTileStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      width: '48.4%',
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 3,
    },
    label: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    edit: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    value: {
      color: theme.text,
      fontSize: 28,
      fontWeight: '800',
      marginRight: 4,
      lineHeight: 32,
    },
    unit: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
  });

const cellStyles = StyleSheet.create({
  cell: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
  },
  unit: {
    fontSize: 11,
    fontWeight: '500',
  },
});

const makeStyles = (colors: ThemeColors, isDark: boolean, bottomInset: number) =>
  StyleSheet.create({
    card: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: Math.max(bottomInset, 18),
      backgroundColor: colors.card,
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 14,
      ...(isDark
        ? { borderWidth: 1, borderColor: withAlpha(colors.text, 0.08) }
        : {
            shadowColor: withAlpha(colors.text, 0.3),
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.14,
            shadowRadius: 20,
            elevation: 12,
          }),
      zIndex: 30,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginTop: 4,
      marginBottom: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    headerLeft: {
      flex: 1,
      marginRight: 10,
    },
    headerLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginBottom: 2,
    },
    titleText: {
      fontSize: 22,
      fontWeight: '800',
      lineHeight: 28,
    },
    percentBadge: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    percentText: {
      fontSize: 12,
      fontWeight: '700',
    },
    roast: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
      marginBottom: 2,
    },
    subtext: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 6,
    },
    nutritionWrap: {
      marginTop: 6,
      marginBottom: 10,
    },
    nutritionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    loadingRow: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    editPill: {
      alignSelf: 'flex-end',
      marginTop: 8,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    buttonsRow: {
      gap: 8,
      marginTop: 2,
    },
    button: {
      width: '100%',
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    buttonTextDisabled: {
      color: colors.textMuted,
    },

    mealDetailCard: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: colors.border,
      shadowColor: withAlpha(colors.text, 0.22),
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
      elevation: 16,
      paddingBottom: Math.max(bottomInset, 16),
      zIndex: 32,
    },
    mealDetailHandleWrap: {
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mealDetailHandle: {
      width: 48,
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.border,
    },
    mealDetailContent: {
      paddingHorizontal: 20,
      paddingTop: 6,
    },
    mealInfoCenter: {
      alignItems: 'center',
      marginBottom: 18,
    },
    mealTypeText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    mealTitleText: {
      marginTop: 8,
      color: colors.text,
      fontSize: 31,
      lineHeight: 38,
      fontWeight: '800',
      textAlign: 'center',
    },
    portionCard: {
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    portionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    portionIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: withAlpha(colors.primary, 0.16),
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    portionLabel: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    portionRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    portionMinus: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    portionPlus: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    portionCount: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
      marginHorizontal: 16,
    },
    detailNutritionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    logMealBtn: {
      marginTop: 2,
      height: 56,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
    },
    logMealBtnText: {
      color: colors.onPrimary,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
  });
