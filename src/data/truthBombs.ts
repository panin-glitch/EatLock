export const TRUTH_BOMBS = {
  mindfulEating: [
    "Chewing food 20-30 times per bite can improve digestion by up to 40%.",
    "It takes about 20 minutes for your brain to register that your stomach is full.",
    "Eating without screens can reduce calorie intake by 10-25%.",
    "Mindful eaters report 50% more satisfaction from their meals.",
    "The color of your plate can affect how much you eat. Blue plates may reduce appetite.",
    "Putting your fork down between bites naturally slows eating pace.",
    "Eating at a table instead of a desk reduces mindless snacking by 30%.",
    "People who eat slowly consume 88 fewer calories per meal on average.",
    "Focusing on texture and flavor activates more pleasure centers in the brain.",
    "Taking 3 deep breaths before eating helps engage the parasympathetic nervous system.",
  ],
  nutritionBasics: [
    "Your body absorbs nutrients more efficiently when you eat without stress.",
    "Protein takes 4-6 hours to digest, keeping you fuller longer.",
    "Eating fiber-rich foods first can reduce blood sugar spikes by 40%.",
    "Hydrating 30 minutes before meals aids in proper nutrient absorption.",
    "Your gut produces 95% of your body's serotonin — eating well lifts your mood.",
    "Eating a rainbow of colors ensures a wider range of micronutrients.",
    "Healthy fats help absorb vitamins A, D, E, and K more effectively.",
    "Your metabolism is most active between 10 AM and 2 PM.",
  ],
  motivation: [
    "Every distraction-free meal is a step toward a healthier relationship with food.",
    "You're not just eating — you're fueling your potential.",
    "Small changes in eating habits compound into life-changing results.",
    "Consistency beats perfection. One mindful meal at a time.",
    "Your phone can wait. This moment with your food is yours.",
    "The best investment you can make is in how you nourish yourself.",
    "Each streak day proves you can prioritize what truly matters.",
    "Distraction-free dining is a form of self-respect.",
  ],
};

export function getRandomTruthBomb(categories: {
  mindfulEating: boolean;
  nutritionBasics: boolean;
  motivation: boolean;
}): string {
  const pool: string[] = [];
  if (categories.mindfulEating) pool.push(...TRUTH_BOMBS.mindfulEating);
  if (categories.nutritionBasics) pool.push(...TRUTH_BOMBS.nutritionBasics);
  if (categories.motivation) pool.push(...TRUTH_BOMBS.motivation);
  if (pool.length === 0) pool.push(...TRUTH_BOMBS.mindfulEating);
  return pool[Math.floor(Math.random() * pool.length)];
}
