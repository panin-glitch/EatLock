/**
 * mealLogger — writes completed meal data to Supabase.
 *
 * Inserts into:
 *   - meal_sessions (update status/ended_at/distraction_rating)
 *   - meal_nutrition (calories + macros)
 *   - meal_logs (for planner crossout + stats)
 */

import { supabase } from './supabaseClient';
import type { MealSession } from '../types/models';
import type { NutritionEstimate, SessionStatus } from './vision/types';
import { mealTypeToDb, dbToMealType } from '../types/models';

export async function logCompletedMeal(session: MealSession): Promise<void> {
  try {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.user?.id) {
      console.warn('[mealLogger] No auth session, skipping Supabase write');
      return;
    }
    const userId = authSession.user.id;
    const mealType = mealTypeToDb(session.mealType);
    const logDate = new Date(session.startedAt).toISOString().slice(0, 10);
    const isForfeited = session.status === 'FORFEITED' || session.overrideUsed;

    // 1. Upsert meal_sessions
    const sessionRow = {
      id: session.id,
      user_id: userId,
      meal_type: mealType,
      plan_date: logDate,
      started_at: session.startedAt,
      ended_at: session.endedAt || new Date().toISOString(),
      status: isForfeited ? 'cancelled' : 'completed',
      notes: session.note || null,
      distraction_rating: session.distractionRating ?? null,
    };

    await supabase.from('meal_sessions').upsert(sessionRow, { onConflict: 'id' });

    // 2. Insert meal_nutrition if we have nutrition data
    const n = session.preNutrition;
    if (n) {
      await supabase.from('meal_nutrition').insert({
        meal_session_id: session.id,
        user_id: userId,
        food_label: n.food_label,
        estimated_calories: n.estimated_calories,
        min_calories: n.min_calories,
        max_calories: n.max_calories,
        confidence: n.confidence,
        source: n.source || 'vision',
        protein_g: n.protein_g ?? null,
        carbs_g: n.carbs_g ?? null,
        fat_g: n.fat_g ?? null,
      });
    }

    // 3. Insert meal_logs row (supports multiple per day+type)
    if (!isForfeited) {
      await supabase.from('meal_logs').insert({
        user_id: userId,
        meal_session_id: session.id,
        log_date: logDate,
        meal_type: mealType,
        food_label: n?.food_label || session.foodName || null,
        calories: n?.estimated_calories ?? null,
        protein_g: n?.protein_g ?? null,
        carbs_g: n?.carbs_g ?? null,
        fat_g: n?.fat_g ?? null,
        source: n?.source || 'vision',
        barcode: session.barcode || null,
        completed: true,
      });
    }

  } catch (e: any) {
    console.error('[mealLogger] Failed to log meal:', e?.message || e);
  }
}

/**
 * Fetch meal_logs for a given date. Returns array of completed meal log entries.
 */
export async function fetchMealLogsForDate(date: Date): Promise<Array<{
  id: string;
  meal_type: string;
  food_label: string | null;
  calories: number | null;
  source: string;
  created_at: string;
}>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return [];

    const logDate = date.toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('meal_logs')
      .select('id, meal_type, food_label, calories, source, created_at')
      .eq('user_id', session.user.id)
      .eq('log_date', logDate)
      .eq('completed', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[mealLogger] fetchMealLogsForDate error:', error.message);
      return [];
    }
    return data || [];
  } catch (e: any) {
    console.warn('[mealLogger] fetchMealLogsForDate failed:', e?.message);
    return [];
  }
}

/**
 * Fetch total calories for date range (for stats).
 */
export async function fetchCaloriesByDateRange(startDate: Date, endDate: Date): Promise<Array<{
  log_date: string;
  total_calories: number;
}>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return [];

    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('meal_logs')
      .select('log_date, calories')
      .eq('user_id', session.user.id)
      .gte('log_date', start)
      .lte('log_date', end)
      .eq('completed', true);

    if (error || !data) return [];

    // Aggregate by date
    const dayMap: Record<string, number> = {};
    for (const row of data) {
      const d = row.log_date;
      dayMap[d] = (dayMap[d] || 0) + (row.calories || 0);
    }

    return Object.entries(dayMap).map(([log_date, total_calories]) => ({
      log_date,
      total_calories,
    }));
  } catch {
    return [];
  }
}

export async function updateSessionDistraction(
  sessionId: string,
  distractionRating: number | null,
  _estimatedDistractionMinutes: number | null,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const { error } = await supabase
      .from('meal_sessions')
      .update({
        distraction_rating: distractionRating,
      })
      .eq('id', sessionId)
      .eq('user_id', session.user.id);

    if (error) {
      console.warn('[mealLogger] updateSessionDistraction error:', error.message);
      return;
    }
  } catch (e: any) {
    console.warn('[mealLogger] updateSessionDistraction failed:', e?.message);
  }
}

function mapDbStatusToSessionStatus(dbStatus: string | null, endedAt?: string | null): SessionStatus {
  const status = String(dbStatus || '').toLowerCase();
  if (status === 'active' && !endedAt) return 'ACTIVE';
  if (status === 'cancelled') return 'FORFEITED';
  if (status === 'failed') return 'FAILED';
  return 'VERIFIED';
}

export async function fetchRemoteCompletedSessions(limit = 300): Promise<MealSession[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return [];

    const uid = session.user.id;
    const { data: rows, error } = await supabase
      .from('meal_sessions')
      .select('id, meal_type, started_at, ended_at, status, notes, distraction_rating')
      .eq('user_id', uid)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error || !rows?.length) return [];

    const ids = rows.map((r: any) => String(r.id)).filter(Boolean);
    const { data: nutritionRows } = await supabase
      .from('meal_nutrition')
      .select('meal_session_id, food_label, estimated_calories, min_calories, max_calories, confidence, source, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, saturated_fat_g, micronutrients')
      .eq('user_id', uid)
      .in('meal_session_id', ids);

    const nutritionBySession = new Map<string, any>();
    for (const row of nutritionRows || []) {
      const sid = String((row as any).meal_session_id || '');
      if (sid && !nutritionBySession.has(sid)) {
        nutritionBySession.set(sid, row);
      }
    }

    return rows.map((row: any) => {
      const sessionStatus = mapDbStatusToSessionStatus(row.status, row.ended_at);
      const nutrition = nutritionBySession.get(String(row.id));
      const preNutrition: NutritionEstimate | undefined = nutrition
        ? {
            food_label: nutrition.food_label || 'Meal',
            estimated_calories: Number(nutrition.estimated_calories || 0),
            min_calories: Number(nutrition.min_calories || 0),
            max_calories: Number(nutrition.max_calories || 0),
            confidence: Number(nutrition.confidence || 0),
            notes: '',
            protein_g: nutrition.protein_g,
            carbs_g: nutrition.carbs_g,
            fat_g: nutrition.fat_g,
            fiber_g: nutrition.fiber_g,
            sugar_g: nutrition.sugar_g,
            sodium_mg: nutrition.sodium_mg,
            saturated_fat_g: nutrition.saturated_fat_g,
            micronutrients: nutrition.micronutrients || {},
            source: (nutrition.source || 'vision') as 'vision' | 'barcode' | 'user',
          }
        : undefined;

      return {
        id: String(row.id),
        startedAt: row.started_at,
        endedAt: row.ended_at || undefined,
        mealType: dbToMealType(String(row.meal_type || 'custom')),
        foodName: preNutrition?.food_label,
        note: row.notes || '',
        strictMode: false,
        verification: {},
        status: sessionStatus,
        preNutrition,
        overrideUsed: sessionStatus === 'FORFEITED',
        blockedAppsAtTime: [],
        distractionRating: row.distraction_rating ?? undefined,
      } as MealSession;
    });
  } catch (e: any) {
    console.warn('[mealLogger] fetchRemoteCompletedSessions failed:', e?.message);
    return [];
  }
}
