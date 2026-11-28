import { SEED_EXERCISES } from '../../services/seedData';
import { getExerciseBiomechanicalMeta } from '../knowledgeGraph';
import { getMovementVectorId, getVectorImplementOptions } from '../progression';
import { isTimedExercise, toCombinedExternalLoadKg, usesOneDumbbell, usesTwoDumbbells } from '../e1rm';
import { rankSwapRecommendations, resolvePlaneAngle } from '../../services/swapRecommendations';
import { getExerciseFormClip } from '../../services/exerciseFormClips';
import { parseCompetitorCsv } from '../../services/competitorCsvImport';
import { runReadAloudQaGate } from '../contentStrategy';
import { ExerciseSession, TrainHeroicCategory } from '../types';

function makeSessionForDef(exerciseId: string, weightKg = 60): ExerciseSession {
  const def = SEED_EXERCISES.find((e) => e.id === exerciseId)!;
  return {
    id: `th-${exerciseId}`,
    exerciseId: def.id,
    name: def.name,
    pillar: def.pillar,
    equipment: def.equipment,
    isRdl: def.isRdl,
    isWeightedCalisthenic: def.isWeightedCalisthenic,
    isAssisted: def.isAssisted,
    isIsolation: def.isIsolation,
    movementFamily: def.movementFamily,
    movementFamilyLabel: def.movementFamilyLabel,
    minReps: def.defaultRepRange[0],
    maxReps: def.defaultRepRange[1],
    sets: [1, 2, 3].map((setNumber) => ({
      id: `th-s-${exerciseId}-${setNumber}`,
      setNumber,
      targetWeightKg: def.equipment === 'bodyweight' ? 0 : weightKg,
      targetReps: def.defaultRepRange[0],
      targetRir: 2,
      completed: false,
      setType: 'working' as const,
    })),
  };
}

export async function runTrainHeroicCatalogAndSwapScienceSuite(
  assert: (condition: boolean, message: string) => void
): Promise<void> {
  console.log('\n--- SUITE 82: TrainHeroic Catalog Parity & Biomechanical Swap Science ---');

  // 1. Catalog Breadth, Uniqueness, Categories, Specialty Implements & Offline Form Clips
  const ids = SEED_EXERCISES.map((e) => e.id);
  const uniqueIds = new Set(ids);
  assert(
    SEED_EXERCISES.length >= 280 && uniqueIds.size === SEED_EXERCISES.length,
    `Catalog reaches TrainHeroic coaching parity (${SEED_EXERCISES.length} exercises, 100% unique IDs)`
  );

  const requiredCategories: TrainHeroicCategory[] = [
    'Strength',
    'Olympic Weightlifting',
    'Gymnastics & Bodyweight',
    'Plyometrics & Power',
    'Conditioning & Carries',
    'Mobility & Prehab',
    'Core & Stability',
  ];
  const presentCategories = new Set(
    SEED_EXERCISES.map((e) => e.category).filter((c): c is TrainHeroicCategory => Boolean(c))
  );
  assert(
    requiredCategories.every((cat) => presentCategories.has(cat)),
    `All 7 TrainHeroic coaching categories populated (${Array.from(presentCategories).join(', ')})`
  );

  const requiredImplements = [
    'Trap Bar',
    'Kettlebell',
    'Double Kettlebells',
    'Safety Squat Bar',
    'Swiss Bar',
    'EZ-Bar',
    'Landmine',
    'Smith Machine',
    'Rings',
    'Resistance Bands',
    'Sled',
    'Erg',
    'Plyo Box',
    'Medicine Ball',
  ];
  const presentImplements = new Set(
    SEED_EXERCISES.map((e) => e.implementLabel).filter((i): i is string => Boolean(i))
  );
  assert(
    requiredImplements.every((imp) => presentImplements.has(imp)),
    `All 14 specialty real-world implements represented (${presentImplements.size} distinct implement labels)`
  );

  const allClipsValid = SEED_EXERCISES.every((def) => {
    const clip = getExerciseFormClip(def);
    return clip.muted && clip.loop && clip.offlineCached && clip.phases.length >= 2;
  });
  assert(
    allClipsValid,
    `All ${SEED_EXERCISES.length} exercises resolve to offline-cached, muted, looping biomechanical form clips`
  );

  // 2. Movement-Family Cleanliness & Strict Compound <-> Isolation Separation
  const dbFlySwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-db-fly', 14),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  assert(
    getMovementVectorId(SEED_EXERCISES.find((e) => e.id === 'ex-db-fly')!) === 'vector-iso-chest' &&
      dbFlySwap.recommended != null &&
      Boolean(dbFlySwap.recommended.exercise.isIsolation) &&
      !dbFlySwap.recommended.exercise.id.includes('bench'),
    `Isolation Dumbbell Chest Fly swaps to chest adduction isolation (${dbFlySwap.recommended?.exercise.name}), never heavy Barbell Bench Press`
  );

  const straightArmSwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-straight-arm-pulldown', 27.5),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  assert(
    straightArmSwap.recommended != null &&
      ['ex-cable-lat-prayer', 'ex-machine-pullover', 'ex-db-pullover'].includes(
        straightArmSwap.recommended.exercise.id
      ),
    `Straight-Arm Cable Pulldown recommends shoulder-extension lat isolation (${straightArmSwap.recommended?.exercise.name})`
  );

  const calfFamilyIds = getVectorImplementOptions(
    SEED_EXERCISES.find((e) => e.id === 'ex-standing-calf-raise')!,
    SEED_EXERCISES
  ).map((e) => e.id);
  const coreFamilyIds = getVectorImplementOptions(
    SEED_EXERCISES.find((e) => e.id === 'ex-cable-crunch')!,
    SEED_EXERCISES
  ).map((e) => e.id);
  assert(
    !calfFamilyIds.includes('ex-hiit-sprints') &&
      !coreFamilyIds.includes('ex-farmers-walk') &&
      !coreFamilyIds.includes('ex-suitcase-carry') &&
      getMovementVectorId(SEED_EXERCISES.find((e) => e.id === 'ex-farmers-walk')!) ===
        'vector-carry-conditioning' &&
      getMovementVectorId(SEED_EXERCISES.find((e) => e.id === 'ex-hiit-sprints')!) ===
        'vector-carry-conditioning',
    'HIIT Sprints and Loaded Carries live in vector-carry-conditioning and never contaminate Calf Raise or Ab Crunch families'
  );

  // 3. Biarticular Muscle-Length & External Torque-Profile Science
  // Calves (Kinoshita et al., 2023; Kassiano et al., 2023): Straight-knee gastroc ('lengthened') vs bent-knee soleus ('mid')
  const standingCalfMeta = getExerciseBiomechanicalMeta(
    SEED_EXERCISES.find((e) => e.id === 'ex-standing-calf-raise')!
  );
  const seatedCalfMeta = getExerciseBiomechanicalMeta(
    SEED_EXERCISES.find((e) => e.id === 'ex-seated-calf-raise')!
  );
  const standingCalfSwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-standing-calf-raise', 70),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  assert(
    standingCalfMeta.stretchBias === 'lengthened' &&
      seatedCalfMeta.stretchBias === 'mid' &&
      standingCalfSwap.recommended != null &&
      standingCalfSwap.recommended.exercise.id !== 'ex-seated-calf-raise' &&
      getExerciseBiomechanicalMeta(standingCalfSwap.recommended.exercise).stretchBias === 'lengthened',
    `Standing Calf Raise preserves straight-knee gastrocnemius stretch (${standingCalfSwap.recommended?.exercise.name}) over bent-knee Seated Calf Raise`
  );

  // Hamstrings (Maeo et al., 2021): Seated Leg Curl ('lengthened' flexed hip) vs Lying/Prone Leg Curl ('mid' extended hip)
  const seatedCurlMeta = getExerciseBiomechanicalMeta(
    SEED_EXERCISES.find((e) => e.id === 'ex-leg-curl')!
  );
  const lyingCurlMeta = getExerciseBiomechanicalMeta(
    SEED_EXERCISES.find((e) => e.id === 'ex-lying-leg-curl')!
  );
  const seatedCurlSwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-leg-curl', 50),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  assert(
    seatedCurlMeta.stretchBias === 'lengthened' &&
      lyingCurlMeta.stretchBias === 'mid' &&
      seatedCurlSwap.recommended != null &&
      getExerciseBiomechanicalMeta(seatedCurlSwap.recommended.exercise).stretchBias === 'lengthened',
    `Seated Leg Curl distinguishes flexed-hip biarticular stretch from Lying Leg Curl and recommends lengthened match (${seatedCurlSwap.recommended?.exercise.name})`
  );

  // Triceps Long Head (Maeo et al., 2023): Overhead extension ('lengthened') -> overhead/incline long-head match
  const ohTricepSwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-kneeling-overhead-tricep-ext', 25),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  assert(
    ohTricepSwap.recommended != null &&
      getExerciseBiomechanicalMeta(ohTricepSwap.recommended.exercise).stretchBias === 'lengthened',
    `Overhead Cable Triceps Extension preserves long-head shoulder-flexed stretch (${ohTricepSwap.recommended?.exercise.name})`
  );

  // Biceps Long Head (Pedrosa et al., 2023): Incline DB Curl <-> Bayesian Cable Curl / Preacher ('lengthened')
  const bayesianSwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-bayesian-cable-curl', 12.5),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  assert(
    bayesianSwap.recommended != null &&
      getExerciseBiomechanicalMeta(bayesianSwap.recommended.exercise).stretchBias === 'lengthened' &&
      bayesianSwap.recommended.exercise.id !== 'ex-concentration-curl',
    `Bayesian Cable Curl recommends lengthened long-head/distal biceps match (${bayesianSwap.recommended?.exercise.name}) over shortened Concentration Curl`
  );

  // 4. Regional Hypertrophy Plane Matching (Clavicular Incline vs Sternal Flat vs Costal Decline)
  const inclineBbSwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-incline-barbell-bench', 75),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  const declineBbSwap = rankSwapRecommendations({
    currentExercise: makeSessionForDef('ex-decline-barbell-bench', 85),
    exerciseCatalog: SEED_EXERCISES,
    bodyweightEmaKg: 82,
    location: 'gym',
  });
  assert(
    resolvePlaneAngle(inclineBbSwap.recommended!.exercise) === 'incline' &&
      resolvePlaneAngle(declineBbSwap.recommended!.exercise) === 'decline' &&
      runReadAloudQaGate(inclineBbSwap.recommended!.whyRecommended).passed,
    `Regional plane matching preserves clavicular incline (${inclineBbSwap.recommended?.exercise.name}) and costal decline (${declineBbSwap.recommended?.exercise.name}) pressing vectors`
  );

  // 5. Cut / Recomp Retention Shield & Axial Load Management (Belt Squat vs Back Squat)
  const beltSquatMeta = getExerciseBiomechanicalMeta(
    SEED_EXERCISES.find((e) => e.id === 'ex-belt-squat')!
  );
  const backSquatMeta = getExerciseBiomechanicalMeta(
    SEED_EXERCISES.find((e) => e.id === 'ex-barbell-squat')!
  );
  assert(
    beltSquatMeta.stability === 'high' && beltSquatMeta.axialLoadIndex < backSquatMeta.axialLoadIndex - 0.5,
    `Belt Squat models high external stability and near-zero spinal compression (${beltSquatMeta.axialLoadIndex} vs Back Squat ${backSquatMeta.axialLoadIndex})`
  );

  // 6. Single-Kettlebell (1x) vs Paired Double-Kettlebell (2x) Load & Tonnage Math + Timed Carries/Sleds
  const kbSwingDef = SEED_EXERCISES.find((e) => e.id === 'ex-kb-swing')!;
  const tguDef = SEED_EXERCISES.find((e) => e.id === 'ex-turkish-get-up')!;
  const doubleKbSqDef = SEED_EXERCISES.find((e) => e.id === 'ex-double-kb-front-squat')!;
  const sledPushDef = SEED_EXERCISES.find((e) => e.id === 'ex-sled-push')!;
  assert(
    usesOneDumbbell(kbSwingDef) &&
      usesOneDumbbell(tguDef) &&
      toCombinedExternalLoadKg(24, kbSwingDef) === 24 &&
      usesTwoDumbbells(doubleKbSqDef) &&
      toCombinedExternalLoadKg(20, doubleKbSqDef) === 40 &&
      isTimedExercise(sledPushDef),
    'Single-kettlebell (24 kg = 24 kg total) vs Double-kettlebell (20 kg/hand = 40 kg total) and timed sled/erg rules compute accurately'
  );

  // 7. Competitor / TrainHeroic CSV Import Resolution onto Expanded Catalog
  const csvSample = [
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
    'Athletic Strength,20 Nov 2026 09:00,20 Nov 2026 10:00,,Power Clean,,,0,normal,75,3,,,8',
    'Athletic Strength,20 Nov 2026 09:00,20 Nov 2026 10:00,,Trap Bar Deadlift,,,0,normal,140,5,,,8',
    'Athletic Strength,20 Nov 2026 09:00,20 Nov 2026 10:00,,Incline Bench Press (Barbell),,,0,normal,80,8,,,8',
    'Athletic Strength,20 Nov 2026 09:00,20 Nov 2026 10:00,,Lying Leg Curl,,,0,normal,45,12,,,8',
    'Athletic Strength,20 Nov 2026 09:00,20 Nov 2026 10:00,,Kettlebell Swing,,,0,normal,24,15,,,7',
  ].join('\n');
  const imported = parseCompetitorCsv(csvSample, { exerciseCatalog: SEED_EXERCISES });
  const importedIds = imported.workouts[0]?.exercises.map((e) => e.exerciseId) ?? [];
  assert(
    importedIds.includes('ex-power-clean') &&
      importedIds.includes('ex-trap-bar-deadlift') &&
      importedIds.includes('ex-incline-barbell-bench') &&
      importedIds.includes('ex-lying-leg-curl') &&
      importedIds.includes('ex-kb-swing'),
    `CSV importer resolves TrainHeroic/Hevy lifts directly to canonical expanded IDs (${importedIds.join(', ')})`
  );
}
