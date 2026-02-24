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
import type { NutritionEstimate } from './vision/types';
import { mealTypeToDb } from '../types/models';

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

    // 1. Upsert meal_sessions
    const sessionRow = {
      id: session.id,
      user_id: userId,
      meal_type: mealType,
      plan_date: logDate,
      started_at: session.startedAt,
      ended_at: session.endedAt || new Date().toISOString(),
      status: 'completed',
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
      barcode: (session as any).barcode || null,
      completed: true,
    });

    console.log('[mealLogger] Logged meal to Supabase:', session.id);
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
