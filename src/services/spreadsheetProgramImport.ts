import {
  BiometricLog,
  EquipmentType,
  ExerciseDefinition,
  ExerciseSession,
  SavedPlanExercise,
  SavedPlanPhase,
  SavedPlanWorkout,
  SavedTrainingPlan,
  StrengthPillar,
  UserProfile,
  WorkoutSession,
  WorkoutSet,
} from '../engine/types';
import { planWorkoutLabel } from '../engine/muscleBuildingProgram';
import { canUseMusclePlan } from '../engine/trainingPlans';
import { SEED_EXERCISES } from './seedData';
import { localDateOffset, parseLocalDate } from '../utils/date';

export const OWNER_PHASE_1_BT_ID = 'custom:phase-1-bt' as const;
export const PHASE_1_BT_SHEET_MARKER = 'phase-1-bt-2017-v1';

/**
 * Owner's Phase 1 BT training spreadsheet (verbatim workout programming, logged 2017 sets,
 * and Week 1–2 bodyweight/circumference check-ins). Imported exclusively for the verified owner
 * account via hash-gated `canUseMusclePlan` or when manually imported via the Program menu.
 */
export const PHASE_1_BT_SPREADSHEET_CSV = `WORKOUT 1: LOWER BODY,,,,,,,,,,,,
Exercise,,Date,Workout,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4
,,,,,,,,,,,,
1A,Seated Leg Curls,,1,3,8 to 12,3010,90,,43 x 12,43 x 12,43 x 12,
,,,2,,,,,,48 x 12,48 x 12,48 x 12,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
1B,Dumbbell Front Foot Elevated Split Squats,,1,3,8 to 12,3010,90,,52 x 7 too heavy ,39 x 12,39 x 12,
,,,2,,,,,Leg Press (weight Plates) ,50 x 8 ,50 x 8 ,50 x 8 ,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
2,Back Squats,,1,3,6 to 8,4010,120-180,,50 x 8 ,50 x 8 ,50 x 8,
,,,2,,,,,,60 x 8 ,60 x 8 ,60 x 8 ,
,,,3,,,,,,,,,
,,,4,4,6 to 8,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
4,Incline Back Extensions,,1,3,10 to 12,2012,90,Initiate with glutes and hams,,,,
,,,2,,,,,,,,,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
5,Standing Calf Raises,,1,3,10 to 12,2212,60,Note tempo,80 x 12,80 x 12,80 x 12 ,Tough 
,,,2,,,,,,,,,
,,,3,,,,,,,,,
,,,4,4,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
6A,Rope Crunch,,1,3,8 to 12,,30,,77 x 12,77 x 12,77 x 12,
,,,2,,,,,,82 x 12,82 x 12,82 x 12,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
6B,Farmers Walks,,1,3,40 seconds,,60,"Strap up, use dumbbells",,,,
,,,2,,45 seconds,,,,,,,
,,,3,,50 seconds,,,,,,,
,,,4,,55 seconds,,,,,,,
,,,5,,60 seconds,,,,,,,
,,,6,,65 seconds,,,,,,,
WORKOUT 2: UPPER BODY,,,,,,,,,,,,
Exercise,,Date,,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4
,,,,,,,,,,,,
1A,Flat Bench Press,15/5/18,1,3,6 to 8,31X0,90,Pause 1 sec on chest,50 x 8,50 x 8,50 x 8,
,,,2,,,,,,60 x 8 ,60 x 8 ,60 x 8 ,
,,,3,,,,,,65 x 8 ,65 x 8 ,65 x 8 (big struggle last set),
,,,4,4,,,,,32.5 x 8 ,32.5 x 6 ,32.5 x 6 ,
,,2018-03-07,5,,,,,,65 x 8 ,65 x 6,65 x 6 ,
,,,6,,,,,,,,,
1B,One Arm Deadstop Dumbbell Row,,1,3,6 to 8,21X0,90,,25 x 8,25 x 8,25 x 8,
,,,2,,,,,,30 x 8 ,30 x 8 ,30 x 8 ,
,,,3,,,,,,32.5 x 8 ,32.5 x 8 ,32.5 x 8,
,,,4,4,,,,,35 x 8,35 x 8 ,35 x 8 ,
,,,5,,,,,,35 x 8 ,35 x 8 ,35 x 8 ,7
,,,6,,,,,,,,,
2A,Low Incline Dumbbell Press ,,1,3,8 to 10,3010,60,,20 x 10,20 x 10,20 x 10,
,,,2,,,,,,22.5 x 10,22.5 x 10,22.5 x 10 ,
,,,3,,,,,,25 x 10,25 x 8 ,25 x 6 ,
,,,4,,,,,,25 x 10 ,25 x 10,25 x 6 ,
,,,5,,,,,,25 x 10,25 x 9 ,25 x 5 ,
,,,6,,,,,,,,,
2B,Underhand Grip Pulldown,,1,3,8 to 10,3010,60,,41 x 10,41 x 10,41 x 10,
,,,2,,,,,,50 x 10,50 x 10,50 x 10 ,
,,,3,,,,,,54 x 10,54 x 10,54 x 10,
,,,4,,,,,,59 x 10 ,59 x 10,59 x 10,
,,,5,,,,,,64 x 10,64 x 10,64 x 10,
,,,6,,,,,,,,,
3A,Seated Hammer Curls,,1,2,8 to 10,2011,10,,10 x 10,10 x 10,,
,,,2,,,,,,12.5 x 10,12.5 x 10,,
,,,3,,,,,,15 x 10,15 x 10,,
,,,4,,,,,,15 x 10,15 x 10,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
3B,Lying EZ Extensions,,1,2,8 to 10,2010,60,,36 x 10,36 x 10,,
,,,2,,,,,,41 x 10,41 x 10,,
,,,3,,,,,,45 x 10,45 x 10,,
,,,4,,,,,,50 x 10,50 x 10,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
4,Face Pulls,,1,4,15,2011,45,,27 x 15,27 x 15,27 x 15,27 x 15
,,,2,,,,,,32 x 15,32 x 15 ,32 x 15 ,32 x 15
,,,3,,,,,,36 x 15,36 x 15 ,36 x 15,36 x 15
,,,4,,,,,,41 x 15,41 x 15,41 x 15 ,41 x 
,,,5,,,,,,20 x 15,20 x 15,20 x 15,20 x
,,,6,,,,,,,,, 
WORKOUT 3: LOWER BODY,,,,,,,,,,,,
Exercise,,Date,,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4
,,,,,,,,,,,,
1,Lying Leg Curls,,1,3,8 to 10,30X0,120,,52 x 10,52 x 10,52 x 10,
,,,2,,,,,,,,,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
2,Deadlift,,1,3,6 to 8,4010,120-180,Slow eccentric,90 x 8 ,90 x 8 ,90 x 8,
,,,2,,,,,,100 x 8,100 x 8 ,100 x 8,
,,,3,,,,,,,,,
,,,4,4,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
3,Hack Squat Machine,,1,3,6 to 8,3010,120,,110 x 8,110 x 8,110 x 8,
,,,2,,,,,,130 x 8 ,130 x 8 ,130 x 8 ,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
4,Leg Press,,1,3,12 to 15,2020,120,Constant tension,59 x 15,59 x 15 ,59 x 15,
,,,2,,,,,,66 x 15,66 x 15,66 x 15,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
5,Seated Calf Raise,,1,3,15 to 20,1111,60,Note tempo,66 x 20,66 x 20,66 x 20,
,,,2,,,,,,73 x 20,73 x 20,73 x 20,
,,,3,,,,,,,,,
,,,4,-,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
6,Swiss Ball Crunch,,1,3,8 to 12,,60,Squeeze abs as hard as possible,,,,
,,,2,,,,,,12,12,12,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
7,Decline Garhammer Raises,,1,3,8 to 12,,60,,12,12,12,
,,,2,,,,,,12,10,,
,,,3,,,,,,,,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
WORKOUT 4: UPPER BODY,,,,,,,,,,,,
Exercise,,Date,,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4
,,,,,,,,,,,,
1A,Incline BB Bench press,,1,3,6 to 8,30X0,90,,50 x 8 ,50 x 8,50 x 8,
,,,2,,,,,,60 x 8 (sloppy last rep),60 x 6 ,60 x 4,
,,,3,,,,,,30 x 8 ,30 x 7 ,30 x 6,
,,,4,4,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
1B,D Handle Pulldown or Chin Up,,1,3,6 to 8,30X0,90,,6,6,5,
,,,2,,,,,,6,6,5,
,,,3,,,,,,6 Chins ,6,6,
,,,4,4,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
2A,Seated Dumbbell Shoulder Press,,1,3,8 to 10,3010,60,,15 x 10,15 x 8 ,15 x 7,
,,,2,,,,,,17.5 x 10,17.5 x 10,17.5 x 8 ,
,,,3,,,,,,17.5 x 10,17.5 x 8 ,17.5 x 8 ,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
2B,Chest Supported Dumbbell Rows,,1,3,8 to 10,2011,60,Squeeze at top,25 x 8 ,25 x 8 ,25 x 8,
,,,2,,,,,,27.5 x 8 ,27.5 x 8 ,27.5 x 8 ,
,,,3,,,,,Machine due to tendons ,40 x 8 ,40 x 8 shit Machine ,40 x 8 dont use this machine again ,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
3A,Incline Dumbbell Curl,,1,2,8 to 10,2011,60,,12.5 x 8 ,12.5 x 8 ,,
,,,2,,,,,,12.5 x 10,12.5 x 10,,
,,,3,,,,,,15 x 9 ,15x 8,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
3B,Close Grip Bench Press,,1,2,8 to 10,2010,60,Shoulder width grip,40 x 10,40 x 10,,
,,,2,,,,,,45 x 10,45 x 10,,
,,,3,,,,,,50 x 10,50 x 10,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
4,Rear Delt Cable Flies,,1,4,15,2011,45,9 x 15,7 x 15,7 x 15,7 x 15,
,,,2,,,,,9 x 15,9 x 15,7 x 15,9 x 15,
,,,3,,,,,9 x 15,9 x 15,9 x 15,,
,,,4,,,,,,,,,
,,,5,,,,,,,,,
,,,6,,,,,,,,,
,Week 1 ,83.9 kg ,13.1 inch left bicep ,36 bellybutton ,,,,,,,,
,Week 2,84.3 kg ,13.1,35.5,,,,,,,,
WORKOUT 1: LOWER BODY,,,,,,,,,,,,,
Exercise,,Date,Workout,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4,
,,,,,,,,,,,,,
1A,Lying Leg Curls,,1,3,6 to 8,3010,90,,45 x 8 ,66 x 8 tough going ,66 x 8 very tough ,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
1B,Bulgarian Split Squats,,1,3,6 to 8,3010,90,,Leg press 107 x 8,127 x 8 ,127 x 8,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
2,Back Squats,,1,"3,1","5,10",20X0,180,Last set is 10 reps,70 x 5 no problem ,70 x 5 up weight for sure ,70 x 5 too light ,50 x 10 good burn but can definitely up intensity ,
,,,2,,,,,,,,,,
,,,3,"4,1","5,10",,,,,,,,
,,,4,,,,,,,,,,
,,,5,"3,1","3,10",,,,,,,,
,,,6,,,,,,,,,,
4,RDL,,1,3,6 to 8,3010,120,,60 x 8 too light ,60 x 8 ,60 x 8,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
5,Standing Calf Raises,,1,"3,1","6 to 8, 12 to 15",2311,60,,40 x 8 too light ,60 x 8 solid weight ,40 x 15,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
6,Farmers Walks,,1,3,40 seconds,,60,,,,,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
WORKOUT 2: UPPER BODY,,,,,,,,,,,,,
Exercise,,Date,Workout,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4,Set 5 
,,,,,,,,,,,,,
1A,Flat Bench Press,,1,4,5,31X0,90,Pause 1 sec on chest,70kg x 5 grand ,70 x 5 ,70 x 5 ,70 x 5 ,
,,,2,,,,,Up weight ,75kg x 5 good ,75 x 5,75 x 5 struggle on last rep,75 x 4,
,,,3,5,5,,,Keep 75 x ,,,,,
,,,4,,,,,,,,,,
,,,5,3,3,,,,,,,,
,,,6,,,,,,,,,,
1B,Chin Up,,1,4,5,30X0,90,,6 could have easily done more,6 too easy,6,6,
,,,2,,,,,Go for 7 add weight next week ,7,7,7,,
,,,3,5,5,,,,,,,,
,,,4,,,,,,,,,,
,,,5,3,3,,,,,,,,
,,,6,,,,,,,,,,
2A,Mid Incline Dumbbell Press ,,1,"2,1","6 to 8, 8 to 12",3010,120,"1st two sets 6 to 8, last set 8 to 12. Same incline as last time.",27.5 x 8 bit light ,27.5 x 8,22.5 x 12 definitely up this weight ,,
,,,2,,,,,,30 x 7 ,30 x 7 ,25 x 11 failed at 12,,
,,,3,,,,,Keep weight,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
2B,One Arm Dumbbell Row,,1,"2,1","6 to 8, 8 to 12",3010,120,"1st two sets 6 to 8, last set 8 to 12.",37.5 x 8 ,37.5 x 8 ,32.5 x 10 deeply tiring ,,
,,,2,,,,,,"40 x 8 right side, 6 left ",40 x 6 think my spine was about to explode ,"32.5 x 12 , 10",,
,,,3,,,,,Keep weight ,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
3A,Barbell Curls,,1,2,"6 to 8, 8 to 12",2011,60,1 set in each rep range,15 kg db x 8 ,10 kg db x 10,,,
,,,2,,,,,,15 x 8 ,10 x 10 ,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
3B,Dips,,1,2,"6 to 8, 8 to 12",2010,60,1 set in each rep range,54 kg push down x 8 ,45 kg push down x 12 ,,,
,,,2,,,,,,59 x 8 tough ,"50 x 8, 40 x 4",,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
4,Face Pulls,,1,4,15,2011,45,,36 x 15,36 x 15,36 x 15,36 x 15,
,,,2,,,,,,41 x 15,41 x 15 ,41 x 15 ,41 x 12,
,,,3,,,,,Felt good work on the medial delts ,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
WORKOUT 3: LOWER BODY,,,,,,,,,,,,,
Exercise,,Date,Workout,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4,
,,,,,,,,,,,,,
1,Glute Ham Raises,,1,3,6 to 8,4011,90,Slow eccentric,,,,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
2,Deadlift,,1,4,5,20X0,180,,110 x 5 fine but weirdly wide farmers bar,110 x 5 can definitely upnthis weight,110 x 5,110 x 5 did something to my spine :(,
,,,2,,,,,,,,,,
,,,3,5,5,,,,,,,,
,,,4,,,,,,,,,,
,,,5,3,3,,,,,,,,
,,,6,,,,,,,,,,
3,Hack Squat,,1,"2,1","6 to 8, 8 to 12",4110,120,Paused at bottom,90kg x 6 definitely up this weight ,90 x 12 ,86 x,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
4,Leg Press,,1,1,50,2020,180,Constant tension. Try minimise stops each time you do it.,52kg x 50 fucking burns ,,,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
5,Seated Calf Raise,,1,3,8 to 12,2211,60,Note tempo,86kg leg press calf x 12,86kg x 12,,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,-,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
6,Decline Garhammer Raises,,1,3,8 to 12,,60,10,10,10,,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
7,Rope Crunches,,1,3,8 to 12,,60,64kg x 12,64 x 12,64 x ,,,
,,,2,,,,,,,,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
WORKOUT 4: UPPER BODY,,,,,,,,,,,,,
Exercise,,Date,Workout,Sets,Reps,Tempo,Rest,Notes,Set 1,Set 2,Set 3,Set 4,
,,,,,,,,,,,,,
1A,Incline BB Bench press,,1,4,5,30X0,90,,60 x 5 ,60 x 5,60 x 5 up weight for sure ,60 x 5 way too light ,
,,,2,,,,,,65 x 5 ,65 x 5 , 65 x 5 ,65 x 5 ,
,,,3,5,5,,,Up to 67.5 ,35 x 5 ,35 x 5,35 x 5,Elbow is fucked from match yesterday ,
,,,4,,,,,,35 x 6,35 x 6,35 x 6,35 x 6,35 x 4
,,,5,3,3,,,,,,,,
,,,6,,,,,,,,,,
1B,Pull Up,,1,4,5,30X0,90,,5,5,5,5,
,,,2,,,,,,6,6,6,6,
,,,3,5,5,,,,8,7,7,,
,,,4,,,,,,8,8,7,7,7
,,,5,3,3,,,,,,,,
,,,6,,,,,,,,,,
2A,Seated BB Shoulder Press,,1,"2,1","6 to 8, 8 to 12",3010,120,"1st two sets 6 to 8, last set 8 to 12.",22.5 x 8 ,"22.5 x 8 neck is sore, feels like nerves ",17.5 x 12 ,,
,,,2,,,,,,25 x 5 absolutely no energy ,22.5 x 8 ,17.5 x 12 form is poor ,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
2B,Seated Cable Rows,,1,"2,1","6 to 8, 8 to 12",3010,120,"1st two sets 6 to 8, last set 8 to 12.","73kg x 8 not great range of motion, could drop the weight a bit ",73 x 8 tough going ,59 x 12 ,,
,,,2,,,,,,66 x 8 ,66 x 8,59 x 12,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
3A,Seated Hammer Curls,,1,2,"6 to 8, 8 to 12",2011,60,1 set in each rep range,15kg x 8 ,10kg x12,,,
,,,2,,,,,,17.5 x 6 ,12.5 x 12,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
3B,Dumbbell Floor Press,,1,2,"6 to 8, 8 to 12",2010,60,1 set in each rep range,20 x 8,17.5kg x 12,,,
,,,2,,,,,,22.5 x 8 ,20 x 12,,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,
4,Rear Delt Swings,,1,4,35/30/25/20,2011,45,5 x 35,5 x 30,5 x 25 ,5 x 20,,
,,,2,,,,,6 x 35 ,6 x 30 ,6 x 25,6 x ,,
,,,3,,,,,,,,,,
,,,4,,,,,,,,,,
,,,5,,,,,,,,,,
,,,6,,,,,,,,,,`;

export interface SpreadsheetImportOptions {
  programName?: string;
  programId?: `custom:${string}`;
  exerciseCatalog?: ExerciseDefinition[];
  importHistory?: boolean;
  historicalStartDate?: string;
  /** When true, ignore partial/stray sheet dates and anchor sessions chronologically from historicalStartDate. */
  preferHistoricalStartDate?: boolean;
  /** True when bilateral two-hand dumbbell cells (e.g. Incline DB Press 25 x 10) list per-hand weight. */
  doubleTwoHandDumbbells?: boolean;
}

export interface ParsedProgramImportSummary {
  programName: string;
  programId: `custom:${string}`;
  phasesCount: number;
  templateCount: number;
  weeksCount: number;
  loggedWorkoutsCount: number;
  totalSetsCount: number;
  totalVolumeKg: number;
  heaviestLiftLabel?: string;
  addedExerciseCount: number;
  biometricCount: number;
}

export interface ParsedProgramImport {
  savedPlan: SavedTrainingPlan;
  newExercises: ExerciseDefinition[];
  historicalWorkouts: WorkoutSession[];
  historicalBiometrics: BiometricLog[];
  summary: ParsedProgramImportSummary;
}

const KNOWN_ALIASES: Record<string, string> = {
  'flat bench press': 'ex-bench-press',
  'bench press': 'ex-bench-press',
  'barbell bench press': 'ex-bench-press',
  'back squats': 'ex-barbell-squat',
  'back squat': 'ex-barbell-squat',
  'barbell back squat': 'ex-barbell-squat',
  deadlift: 'ex-deadlift',
  'conventional deadlift': 'ex-deadlift',
  rdl: 'ex-rdl',
  'romanian deadlift': 'ex-rdl',
  'leg press': 'ex-leg-press',
  'leg press (weight plates)': 'ex-leg-press',
  'bulgarian split squats': 'ex-bulgarian-split-squat',
  'bulgarian split squat': 'ex-bulgarian-split-squat',
  'low incline dumbbell press': 'ex-db-bench-press',
  'mid incline dumbbell press': 'ex-db-bench-press',
  'incline dumbbell press': 'ex-db-bench-press',
  'seated dumbbell shoulder press': 'ex-db-shoulder-press',
  'seated db shoulder press': 'ex-db-shoulder-press',
  'chest supported dumbbell rows': 'ex-chest-supported-db-row',
  'chest supported dumbbell row': 'ex-chest-supported-db-row',
  'seated leg curls': 'ex-leg-curl',
  'seated leg curl': 'ex-leg-curl',
  'standing calf raises': 'ex-standing-calf-raise',
  'standing calf raise': 'ex-standing-calf-raise',
  'seated calf raise': 'ex-seated-calf-raise',
  'rope crunch': 'ex-cable-crunch',
  'rope crunches': 'ex-cable-crunch',
  'face pulls': 'ex-face-pull',
  'face pull': 'ex-face-pull',
  'incline dumbbell curl': 'ex-bicep-curl',
  'seated cable rows': 'ex-cable-row',
  'seated cable row': 'ex-cable-row',
  'chin up': 'ex-chinup',
  'chin-up': 'ex-chinup',
  'pull up': 'ex-chinup',
  'pull-up': 'ex-chinup',
  'd handle pulldown or chin up': 'ex-chinup',
  dips: 'ex-triceps-dip',
  'triceps dip': 'ex-triceps-dip',
  'triceps dips': 'ex-triceps-dip',
  'push down': 'ex-tricep-pushdown',
  pushdown: 'ex-tricep-pushdown',
};

interface SyntheticSpec {
  id: string;
  name: string;
  pillar: StrengthPillar;
  primaryMuscle: ExerciseDefinition['primaryMuscle'];
  secondaryMuscles?: ExerciseDefinition['secondaryMuscles'];
  equipment: EquipmentType;
  isIsolation?: boolean;
  isRdl?: boolean;
  isWeightedCalisthenic?: boolean;
  defaultRepRange: [number, number];
  environments?: ExerciseDefinition['environments'];
  perHandOnly?: boolean;
}

const SYNTHETIC_SPECS: Record<string, SyntheticSpec> = {
  'lying leg curls': {
    id: 'ex-lying-leg-curl',
    name: 'Lying Leg Curls',
    pillar: 'Hinge',
    primaryMuscle: 'Hamstrings',
    equipment: 'machine',
    isIsolation: true,
    defaultRepRange: [8, 12],
    environments: ['gym'],
  },
  'dumbbell front foot elevated split squats': {
    id: 'ex-ffe-split-squat',
    name: 'Dumbbell Front Foot Elevated Split Squats',
    pillar: 'Squat',
    primaryMuscle: 'Quads',
    secondaryMuscles: ['Glutes'],
    equipment: 'dumbbell',
    defaultRepRange: [8, 12],
    environments: ['gym', 'home'],
    perHandOnly: true, // Sheet logs combined load (52 -> 39 kg) matching 50 kg squat
  },
  'incline back extensions': {
    id: 'ex-back-extension',
    name: 'Incline Back Extensions',
    pillar: 'Hinge',
    primaryMuscle: 'Hamstrings',
    secondaryMuscles: ['Glutes'],
    equipment: 'bodyweight',
    isIsolation: true,
    defaultRepRange: [10, 12],
    environments: ['gym'],
  },
  'farmers walks': {
    id: 'ex-farmers-walk',
    name: 'Farmers Walks',
    pillar: 'Hinge',
    primaryMuscle: 'Core',
    equipment: 'dumbbell',
    defaultRepRange: [1, 1],
    environments: ['gym', 'home'],
  },
  'one arm deadstop dumbbell row': {
    id: 'ex-one-arm-deadstop-db-row',
    name: 'One Arm Deadstop Dumbbell Row',
    pillar: 'Horizontal Pull',
    primaryMuscle: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Delts'],
    equipment: 'dumbbell',
    defaultRepRange: [6, 8],
    environments: ['gym', 'home'],
    perHandOnly: true,
  },
  'one arm dumbbell row': {
    id: 'ex-one-arm-db-row',
    name: 'One Arm Dumbbell Row',
    pillar: 'Horizontal Pull',
    primaryMuscle: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Delts'],
    equipment: 'dumbbell',
    defaultRepRange: [6, 12],
    environments: ['gym', 'home'],
    perHandOnly: true,
  },
  'underhand grip pulldown': {
    id: 'ex-underhand-pulldown',
    name: 'Underhand Grip Pulldown',
    pillar: 'Vertical Pull',
    primaryMuscle: 'Back',
    secondaryMuscles: ['Biceps'],
    equipment: 'cable',
    defaultRepRange: [8, 10],
    environments: ['gym'],
  },
  'seated hammer curls': {
    id: 'ex-seated-hammer-curl',
    name: 'Seated Hammer Curls',
    pillar: 'Horizontal Pull',
    primaryMuscle: 'Biceps',
    equipment: 'dumbbell',
    isIsolation: true,
    defaultRepRange: [6, 12],
    environments: ['gym', 'home'],
  },
  'lying ez extensions': {
    id: 'ex-lying-ez-extension',
    name: 'Lying EZ Extensions',
    pillar: 'Horizontal Push',
    primaryMuscle: 'Triceps',
    equipment: 'barbell',
    isIsolation: true,
    defaultRepRange: [8, 10],
    environments: ['gym'],
  },
  'hack squat machine': {
    id: 'ex-hack-squat',
    name: 'Hack Squat Machine',
    pillar: 'Squat',
    primaryMuscle: 'Quads',
    secondaryMuscles: ['Glutes'],
    equipment: 'machine',
    defaultRepRange: [6, 12],
    environments: ['gym'],
  },
  'hack squat': {
    id: 'ex-hack-squat',
    name: 'Hack Squat Machine',
    pillar: 'Squat',
    primaryMuscle: 'Quads',
    secondaryMuscles: ['Glutes'],
    equipment: 'machine',
    defaultRepRange: [6, 12],
    environments: ['gym'],
  },
  'swiss ball crunch': {
    id: 'ex-swiss-ball-crunch',
    name: 'Swiss Ball Crunch',
    pillar: 'Squat',
    primaryMuscle: 'Core',
    equipment: 'bodyweight',
    isIsolation: true,
    defaultRepRange: [8, 12],
    environments: ['gym', 'home'],
  },
  'decline garhammer raises': {
    id: 'ex-decline-garhammer-raise',
    name: 'Decline Garhammer Raises',
    pillar: 'Squat',
    primaryMuscle: 'Core',
    equipment: 'bodyweight',
    isIsolation: true,
    defaultRepRange: [8, 12],
    environments: ['gym'],
  },
  'incline bb bench press': {
    id: 'ex-incline-bb-bench',
    name: 'Incline BB Bench Press',
    pillar: 'Horizontal Push',
    primaryMuscle: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps'],
    equipment: 'barbell',
    defaultRepRange: [5, 8],
    environments: ['gym'],
  },
  'close grip bench press': {
    id: 'ex-close-grip-bench',
    name: 'Close Grip Bench Press',
    pillar: 'Horizontal Push',
    primaryMuscle: 'Triceps',
    secondaryMuscles: ['Chest'],
    equipment: 'barbell',
    defaultRepRange: [8, 10],
    environments: ['gym'],
  },
  'rear delt cable flies': {
    id: 'ex-rear-delt-cable-fly',
    name: 'Rear Delt Cable Flies',
    pillar: 'Horizontal Pull',
    primaryMuscle: 'Rear Delts',
    equipment: 'cable',
    isIsolation: true,
    defaultRepRange: [12, 15],
    environments: ['gym'],
  },
  'glute ham raises': {
    id: 'ex-glute-ham-raise',
    name: 'Glute Ham Raises',
    pillar: 'Hinge',
    primaryMuscle: 'Hamstrings',
    secondaryMuscles: ['Glutes'],
    equipment: 'bodyweight',
    defaultRepRange: [6, 8],
    environments: ['gym'],
  },
  'barbell curls': {
    id: 'ex-barbell-curl',
    name: 'Barbell Curls',
    pillar: 'Horizontal Pull',
    primaryMuscle: 'Biceps',
    equipment: 'barbell',
    isIsolation: true,
    defaultRepRange: [6, 12],
    environments: ['gym'],
  },
  'seated bb shoulder press': {
    id: 'ex-seated-bb-shoulder-press',
    name: 'Seated BB Shoulder Press',
    pillar: 'Vertical Push',
    primaryMuscle: 'Shoulders',
    secondaryMuscles: ['Triceps'],
    equipment: 'barbell',
    defaultRepRange: [6, 12],
    environments: ['gym'],
  },
  'dumbbell floor press': {
    id: 'ex-db-floor-press',
    name: 'Dumbbell Floor Press',
    pillar: 'Horizontal Push',
    primaryMuscle: 'Chest',
    secondaryMuscles: ['Triceps'],
    equipment: 'dumbbell',
    defaultRepRange: [6, 12],
    environments: ['gym', 'home'],
  },
  'rear delt swings': {
    id: 'ex-rear-delt-swing',
    name: 'Rear Delt Swings',
    pillar: 'Horizontal Pull',
    primaryMuscle: 'Rear Delts',
    equipment: 'dumbbell',
    isIsolation: true,
    defaultRepRange: [20, 35],
    environments: ['gym', 'home'],
  },
};

function normalizeExerciseKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'imported';
}

function parseTabularRows(rawText: string): string[][] {
  const cleaned = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstNonEmpty = cleaned.split('\n').find((line) => line.trim().length > 0) || '';
  const tabCount = (firstNonEmpty.match(/\t/g) || []).length;
  const commaCount = (firstNonEmpty.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function inferExerciseMetadata(rawName: string): SyntheticSpec {
  const lower = normalizeExerciseKey(rawName);
  if (SYNTHETIC_SPECS[lower]) return SYNTHETIC_SPECS[lower];

  let equipment: EquipmentType = 'barbell';
  if (/dumbbell|\bdb\b/i.test(lower)) equipment = 'dumbbell';
  else if (/cable|pulldown|pushdown|rope/i.test(lower)) equipment = 'cable';
  else if (/machine|hack squat|leg press|leg curl|extension machine/i.test(lower)) equipment = 'machine';
  else if (/chin|pull up|pull-up|dip|crunch|raise|plank|pushup|push-up|glute ham/i.test(lower)) equipment = 'bodyweight';

  let pillar: StrengthPillar = 'Horizontal Push';
  let primaryMuscle: ExerciseDefinition['primaryMuscle'] = 'Chest';
  if (/squat|leg press|lunge/i.test(lower)) {
    pillar = 'Squat';
    primaryMuscle = 'Quads';
  } else if (/deadlift|rdl|leg curl|glute|back extension/i.test(lower)) {
    pillar = 'Hinge';
    primaryMuscle = 'Hamstrings';
  } else if (/calf/i.test(lower)) {
    pillar = 'Squat';
    primaryMuscle = 'Calves';
  } else if (/crunch|garhammer|plank|abs|farmers/i.test(lower)) {
    pillar = 'Squat';
    primaryMuscle = 'Core';
  } else if (/shoulder press|overhead|lateral/i.test(lower)) {
    pillar = 'Vertical Push';
    primaryMuscle = /lateral/i.test(lower) ? 'Side Delts' : 'Shoulders';
  } else if (/pulldown|chin|pull up|pull-up/i.test(lower)) {
    pillar = 'Vertical Pull';
    primaryMuscle = 'Back';
  } else if (/row|rear delt|face pull|curl/i.test(lower)) {
    pillar = 'Horizontal Pull';
    primaryMuscle = /curl/i.test(lower) ? 'Biceps' : /rear delt/i.test(lower) ? 'Rear Delts' : 'Back';
  } else if (/tricep|ez extension|dip|close grip|push down|pushdown/i.test(lower)) {
    pillar = 'Horizontal Push';
    primaryMuscle = 'Triceps';
  }

  return {
    id: `ex-import-${slugify(lower)}`,
    name: rawName.trim(),
    pillar,
    primaryMuscle,
    equipment,
    isIsolation: /curl|raise|extension|calf|crunch|fly|flies|face pull|swing/i.test(lower),
    isRdl: /\brdl\b|romanian deadlift/i.test(lower) || undefined,
    isWeightedCalisthenic: /chin|pull up|pull-up|dip/i.test(lower) || undefined,
    defaultRepRange: [8, 12],
    environments: equipment === 'dumbbell' || equipment === 'bodyweight' ? ['gym', 'home'] : ['gym'],
  };
}

function isOneHandOnlyExercise(nameOrId: string): boolean {
  return /one arm|single arm|single-arm|front foot elevated|ffe-split-squat|bulgarian/i.test(nameOrId);
}

function resolveSheetExercise(
  rawName: string,
  catalogMap: Map<string, ExerciseDefinition>,
  addedById: Map<string, ExerciseDefinition>
): { def: ExerciseDefinition; perHandOnly: boolean } {
  const key = normalizeExerciseKey(rawName);
  const aliasId = KNOWN_ALIASES[key];
  if (aliasId && catalogMap.has(aliasId)) {
    return { def: catalogMap.get(aliasId)!, perHandOnly: isOneHandOnlyExercise(key) };
  }

  for (const existing of catalogMap.values()) {
    if (normalizeExerciseKey(existing.name) === key) {
      return { def: existing, perHandOnly: isOneHandOnlyExercise(key) };
    }
  }

  const spec = inferExerciseMetadata(rawName);
  const existingSynthetic = catalogMap.get(spec.id) || addedById.get(spec.id);
  if (existingSynthetic) {
    return { def: existingSynthetic, perHandOnly: Boolean(spec.perHandOnly || isOneHandOnlyExercise(key)) };
  }

  const created: ExerciseDefinition = {
    id: spec.id,
    name: spec.name,
    pillar: spec.pillar,
    primaryMuscle: spec.primaryMuscle,
    secondaryMuscles: spec.secondaryMuscles,
    equipment: spec.equipment,
    isIsolation: spec.isIsolation,
    isRdl: spec.isRdl,
    isWeightedCalisthenic: spec.isWeightedCalisthenic,
    environments: spec.environments || ['gym'],
    defaultRepRange: spec.defaultRepRange,
  };
  addedById.set(created.id, created);
  return { def: created, perHandOnly: Boolean(spec.perHandOnly || isOneHandOnlyExercise(key)) };
}

function parseSetsCount(raw: string, fallback = 3): number {
  const nums = raw.match(/\d+/g)?.map((n) => parseInt(n, 10)) ?? [];
  if (!nums.length) return fallback;
  return Math.max(1, nums.reduce((a, b) => a + b, 0));
}

function parseRepsTarget(raw: string): { repsStr: string; defaultReps: number; durationSeconds?: number } {
  const cleaned = raw.trim();
  if (!cleaned) return { repsStr: '10', defaultReps: 10 };

  const secMatch = /(\d+)\s*(?:s|sec|seconds?)\b/i.exec(cleaned);
  if (secMatch) {
    const secs = parseInt(secMatch[1], 10);
    return { repsStr: `${secs}sec`, defaultReps: 1, durationSeconds: secs };
  }

  if (cleaned.includes('/')) {
    const first = parseInt(cleaned.split('/')[0], 10) || 15;
    return { repsStr: cleaned.replace(/\s+/g, ''), defaultReps: first };
  }

  // Dual scheme e.g. "6 to 8, 8 to 12" or "5,10"
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
    const allNums = parts.flatMap((p) => p.match(/\d+/g)?.map((n) => parseInt(n, 10)) ?? []);
    const lo = allNums.length ? Math.min(...allNums) : 6;
    const hi = allNums.length ? Math.max(...allNums) : 12;
    return { repsStr: lo === hi ? `${lo}` : `${lo}-${hi}`, defaultReps: lo };
  }

  const toMatch = /(\d+)\s*(?:to|-|–)\s*(\d+)/i.exec(cleaned);
  if (toMatch) {
    const lo = parseInt(toMatch[1], 10);
    const hi = parseInt(toMatch[2], 10);
    return { repsStr: `${lo}-${hi}`, defaultReps: hi };
  }

  const single = parseInt(cleaned, 10);
  if (!Number.isNaN(single) && single > 0) {
    return { repsStr: `${single}`, defaultReps: single };
  }
  return { repsStr: '10', defaultReps: 10 };
}

function parseRestSeconds(raw: string): number {
  const nums = raw.match(/\d+/g)?.map((n) => parseInt(n, 10)) ?? [];
  if (!nums.length) return 90;
  return nums[nums.length - 1];
}

function parseSheetDate(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const month = parseInt(slash[2], 10);
    let year = parseInt(slash[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return undefined;
}

interface ParsedCellSet {
  weightKg: number;
  reps: number;
  actualRepsLeft?: number;
  actualRepsRight?: number;
  swapHint?: string;
}

function looksLikeSetCell(cell: string): boolean {
  const s = cell.trim();
  if (!s) return false;
  if (/^\d+(?:\.\d+)?\s*(?:kg|lb|db|push\s*down|leg\s*press)?\s*[x×]\s*\d*/i.test(s)) return true;
  if (/^(?:leg\s*press|chins?)\b.*\d+(?:\.\d+)?\s*[x×]/i.test(s)) return true;
  if (/^\d+(?:\.\d+)?\s*[x×]\s*\d+/i.test(s)) return true;
  if (/^\d{1,2}(?:\s+chins?)?$/i.test(s)) return true;
  return false;
}

function detectInlineSwapHint(text: string): string | undefined {
  const low = text.toLowerCase();
  if (/leg press.*calf|leg press calf/.test(low)) return 'seated calf raise';
  if (/leg press/.test(low)) return 'leg press';
  if (/push\s*down|pushdown/.test(low)) return 'push down';
  if (/\bdb\b/.test(low)) return 'incline dumbbell curl';
  if (/chins?\b/.test(low)) return 'chin up';
  if (/machine/.test(low)) return 'seated cable rows';
  return undefined;
}

function parseSetCell(cell: string, fallbackReps: number, isBodyweightDefault: boolean): ParsedCellSet[] {
  const s = cell.trim();
  if (!s || s === '-') return [];
  if (/^(keep|up to|go for|felt good|up weight|keep weight)/i.test(s)) return [];

  const swapHint = detectInlineSwapHint(s);

  // Split drop sets inside one cell: e.g. "50 x 8, 40 x 4"
  const subMatches = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|lb|lbs)?(?:\s*(?:db|leg press calf|leg press|push\s*down))?\s*[x×]\s*(\d+)?/gi)];
  if (subMatches.length >= 2) {
    return subMatches.map((m) => ({
      weightKg: parseFloat(m[1]),
      reps: m[2] ? parseInt(m[2], 10) : fallbackReps,
      swapHint,
    }));
  }

  // Asymmetric unilateral reps: e.g. "40 x 8 right side, 6 left" or "32.5 x 12 , 10"
  const asymNamed = /(\d+(?:\.\d+)?)\s*(?:kg)?\s*[x×]\s*(\d+)\s*right[^,]*,\s*(\d+)\s*left/i.exec(s);
  if (asymNamed) {
    const right = parseInt(asymNamed[2], 10);
    const left = parseInt(asymNamed[3], 10);
    return [{
      weightKg: parseFloat(asymNamed[1]),
      reps: Math.min(right, left),
      actualRepsRight: right,
      actualRepsLeft: left,
      swapHint,
    }];
  }

  const asymComma = /^(\d+(?:\.\d+)?)\s*(?:kg)?\s*[x×]\s*(\d+)\s*,\s*(\d+)\s*$/.exec(s);
  if (asymComma) {
    const right = parseInt(asymComma[2], 10);
    const left = parseInt(asymComma[3], 10);
    return [{
      weightKg: parseFloat(asymComma[1]),
      reps: Math.min(right, left),
      actualRepsRight: right,
      actualRepsLeft: left,
      swapHint,
    }];
  }

  // Standard "weight x reps" (including "70kg x 5", "15 kg db x 8", "54 kg push down x 8", "41 x ")
  const wxr = /(\d+(?:\.\d+)?)\s*(?:kg|lb|lbs|db)?(?:\s+(?:db|push\s*down|leg\s*press(?:\s*calf)?))?\s*[x×]\s*(\d+)?/i.exec(s);
  if (wxr) {
    const w = parseFloat(wxr[1]);
    const r = wxr[2] ? parseInt(wxr[2], 10) : fallbackReps;
    if (w >= 0 && r > 0) {
      return [{ weightKg: w, reps: r, swapHint }];
    }
  }

  // Bare reps (bodyweight exercises like "6", "6 Chins", "12", "6 could have easily done more")
  if (isBodyweightDefault || /^\d{1,2}(?:\s+chins?|\s+could|\s+too|\s*$)/i.test(s)) {
    const repsOnly = /^(\d{1,2})\b/.exec(s);
    if (repsOnly) {
      return [{ weightKg: 0, reps: parseInt(repsOnly[1], 10), swapHint }];
    }
  }

  return [];
}

function parseMeasurementFooterRow(row: string[]): { weekNum: number; log: BiometricLog } | null {
  const joined = row.join(' ');
  const weekMatch = /week\s*(\d+)/i.exec(joined);
  if (!weekMatch) return null;
  const weekNum = parseInt(weekMatch[1], 10);
  const weightMatch = /(\d+(?:\.\d+)?)\s*kg/i.exec(joined);
  if (!weightMatch) return null;

  const bodyweightKg = parseFloat(weightMatch[1]);
  const numCells = row
    .slice(2)
    .map((c) => {
      const m = /^(\d+(?:\.\d+)?)/.exec(c.trim());
      return m ? parseFloat(m[1]) : undefined;
    })
    .filter((v): v is number => v !== undefined);

  const inToCm = (inches: number) => Math.round(inches * 2.54 * 10) / 10;
  let bicepLeftCm: number | undefined;
  let abdomenCm: number | undefined;
  for (const c of row.slice(2)) {
    const num = /^(\d+(?:\.\d+)?)/.exec(c.trim());
    if (!num) continue;
    const val = parseFloat(num[1]);
    if (/bicep/i.test(c) || val < 24) bicepLeftCm = inToCm(val);
    else if (/belly|waist/i.test(c) || val >= 24) abdomenCm = inToCm(val);
  }
  if (bicepLeftCm === undefined && numCells[1] && numCells[1] < 24) bicepLeftCm = inToCm(numCells[1]);
  if (abdomenCm === undefined && numCells[2] && numCells[2] >= 24) abdomenCm = inToCm(numCells[2]);

  return {
    weekNum,
    log: {
      date: '',
      bodyweightKg,
      hrvRmssd: 0,
      restingHr: 0,
      sleepHours: 0,
      steps: 0,
      activeZoneMinutes: 0,
      bicepLeftCm,
      abdomenCm,
      isManualEntry: true,
    },
  };
}

interface RawExerciseWeekLog {
  week: number;
  date?: string;
  sets: number;
  repsStr: string;
  defaultReps: number;
  durationSeconds?: number;
  tempo: string;
  restSeconds: number;
  notes: string;
  loggedSets: ParsedCellSet[];
}

interface RawExerciseBlock {
  order: string;
  name: string;
  weeks: RawExerciseWeekLog[];
}

interface RawWorkoutBlock {
  phase: number;
  slotInPhase: number;
  title: string;
  exercises: RawExerciseBlock[];
  biometrics: { weekNum: number; log: BiometricLog }[];
}

function splitDayForTitle(title: string): SavedPlanWorkout['splitDay'] {
  if (/upper/i.test(title)) return 'Upper';
  if (/lower|leg/i.test(title)) return 'Legs';
  if (/push/i.test(title)) return 'Push';
  if (/pull/i.test(title)) return 'Pull';
  return 'Upper';
}

const WEEK_DAYS: SavedPlanWorkout['dayOfWeek'][] = ['Monday', 'Wednesday', 'Friday', 'Saturday'];
// Offsets within a 7-day calendar week matching Mon, Wed, Fri, Sat cadence
const DAY_OFFSETS_IN_WEEK = [0, 2, 4, 5, 6];

export function parseProgramSpreadsheet(
  csvText: string,
  options: SpreadsheetImportOptions = {}
): ParsedProgramImport {
  const rows = parseTabularRows(csvText);
  const catalog = options.exerciseCatalog ?? SEED_EXERCISES;
  const catalogMap = new Map(catalog.map((e) => [e.id, e]));
  const addedById = new Map<string, ExerciseDefinition>();

  const blocks: RawWorkoutBlock[] = [];
  let currentPhase = 1;
  let currentWorkout: RawWorkoutBlock | null = null;
  let currentExercise: RawExerciseBlock | null = null;
  let lastSlotSeen = 0;

  for (const row of rows) {
    const first = (row[0] || '').trim();
    const second = (row[1] || '').trim();
    const nonEmpty = row.filter((c) => c.trim().length > 0);
    if (nonEmpty.length === 0) continue;

    // Footer week weight / measurement check-in rows (e.g. ",Week 1,83.9 kg,...")
    const meas = parseMeasurementFooterRow(row);
    if (meas) {
      if (currentWorkout) currentWorkout.biometrics.push(meas);
      continue;
    }

    // Section header: WORKOUT 1: LOWER BODY
    const workoutMatch = /^WORKOUT\s+(\d+)\s*:\s*(.+)$/i.exec(first);
    if (workoutMatch) {
      const slotNum = parseInt(workoutMatch[1], 10);
      if (blocks.length > 0 && slotNum <= lastSlotSeen) {
        currentPhase += 1;
      }
      lastSlotSeen = slotNum;
      currentWorkout = {
        phase: currentPhase,
        slotInPhase: slotNum,
        title: workoutMatch[2]
          .trim()
          .toLowerCase()
          .replace(/\b\w/g, (ch) => ch.toUpperCase()),
        exercises: [],
        biometrics: [],
      };
      blocks.push(currentWorkout);
      currentExercise = null;
      continue;
    }

    // Column header row: Exercise,,Date,Workout,Sets,Reps,Tempo,Rest,Notes,Set 1...
    if (/^exercise$/i.test(first)) continue;
    if (!currentWorkout) continue;

    // Exercise definition start row (has order in col 0 and exercise name in col 1)
    if (first && second) {
      currentExercise = {
        order: first,
        name: second,
        weeks: [],
      };
      currentWorkout.exercises.push(currentExercise);
    }

    if (!currentExercise) continue;

    const prevWeek = currentExercise.weeks[currentExercise.weeks.length - 1];
    const weekNumRaw = parseInt((row[3] || '').trim(), 10);
    const week = !Number.isNaN(weekNumRaw) && weekNumRaw > 0 ? weekNumRaw : (prevWeek?.week ?? 0) + 1;

    const sets = (row[4] || '').trim() ? parseSetsCount(row[4], prevWeek?.sets ?? 3) : prevWeek?.sets ?? 3;
    const parsedReps = (row[5] || '').trim()
      ? parseRepsTarget(row[5])
      : prevWeek
      ? { repsStr: prevWeek.repsStr, defaultReps: prevWeek.defaultReps, durationSeconds: prevWeek.durationSeconds }
      : { repsStr: '10', defaultReps: 10 };
    const tempo = (row[6] || '').trim() || prevWeek?.tempo || '2010';
    const restSeconds = (row[7] || '').trim() ? parseRestSeconds(row[7]) : prevWeek?.restSeconds ?? 90;

    // Col 8 is usually Notes, unless a missing comma shifted Set 1 into col 8.
    const col8 = (row[8] || '').trim();
    const col8IsSet = looksLikeSetCell(col8);
    const notes = col8IsSet ? '' : col8;
    const setColumns = col8IsSet ? row.slice(8) : row.slice(9);

    const isBw =
      /chin|pull up|pull-up|crunch|garhammer|glute ham|back extension/i.test(currentExercise.name) ||
      /chin/i.test(setColumns.join(' '));

    const loggedSets: ParsedCellSet[] = [];
    for (const cell of setColumns) {
      if (!cell || !cell.trim()) continue;
      const parsedCellSets = parseSetCell(cell, parsedReps.defaultReps, isBw);
      for (const st of parsedCellSets) {
        if (!isBw && st.weightKg === 0 && loggedSets.length > 0 && loggedSets[loggedSets.length - 1].weightKg > 0) {
          loggedSets.push({ ...st, weightKg: loggedSets[loggedSets.length - 1].weightKg });
        } else {
          loggedSets.push(st);
        }
      }
    }

    currentExercise.weeks.push({
      week,
      date: parseSheetDate(row[2] || ''),
      sets,
      repsStr: parsedReps.repsStr,
      defaultReps: parsedReps.defaultReps,
      durationSeconds: parsedReps.durationSeconds,
      tempo,
      restSeconds,
      notes,
      loggedSets,
    });
  }

  if (blocks.length === 0) {
    throw new Error('No workouts found. Make sure each workout starts with a header like "WORKOUT 1: LOWER BODY".');
  }

  const rawTitle = (options.programName || 'Phase 1 BT').trim() || 'Imported Program';
  const planId: `custom:${string}` = options.programId || `custom:${slugify(rawTitle)}`;
  const doubleDb = options.doubleTwoHandDumbbells !== false;

  const phaseNumbers = [...new Set(blocks.map((b) => b.phase))].sort((a, b) => a - b);
  const templates: SavedPlanWorkout[] = [];
  const phases: SavedPlanPhase[] = [];
  const historicalWorkouts: WorkoutSession[] = [];
  const historicalBiometrics: BiometricLog[] = [];

  const startAnchor = parseLocalDate(options.historicalStartDate || '2017-01-09');
  let globalWorkoutCounter = 0;
  let globalWeekOffset = 0;
  let totalSetsCount = 0;
  let totalVolumeKg = 0;
  let heaviestWeight = 0;
  let heaviestLabel: string | undefined;

  for (const phaseNum of phaseNumbers) {
    const phaseBlocks = blocks.filter((b) => b.phase === phaseNum);
    const weeksInPhase = Math.max(
      1,
      ...phaseBlocks.flatMap((b) => b.exercises.flatMap((e) => e.weeks.map((w) => w.week)))
    );
    const workoutsPerWeek = Math.max(1, phaseBlocks.length);
    const weekStart = globalWeekOffset + 1;
    const weekEnd = globalWeekOffset + weeksInPhase;

    const splitSummary = phaseBlocks
      .map((b) => planWorkoutLabel(b.title))
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .join(' / ');

    phases.push({
      phaseNumber: phaseNum,
      name: `Phase ${phaseNum}: ${splitSummary || 'Training Block'}`,
      shortName: `Phase ${phaseNum}`,
      planSummary: `${weeksInPhase} week${weeksInPhase === 1 ? '' : 's'}, ${workoutsPerWeek} workouts a week (${splitSummary}).`,
      weeks: [weekStart, weekEnd],
      description: `Imported ${workoutsPerWeek}-day rotation across ${weeksInPhase} weeks.`,
      intensityFocus: 'Structured progression across programmed sets, reps, and tempo.',
    });

    // Build templates week by week so every week's set/rep/duration progression is preserved
    for (let w = 1; w <= weeksInPhase; w += 1) {
      const absWeek = globalWeekOffset + w;
      phaseBlocks.forEach((block, slotIdx) => {
        globalWorkoutCounter += 1;
        const dayOffset = (absWeek - 1) * 7 + (DAY_OFFSETS_IN_WEEK[slotIdx] ?? slotIdx);
        const defaultDate = localDateOffset(dayOffset, startAnchor);
        const dayOfWeek = WEEK_DAYS[slotIdx % WEEK_DAYS.length];

        const templateExercises: SavedPlanExercise[] = [];
        const historicalExercises: ExerciseSession[] = [];
        let explicitDate: string | undefined;

        for (const rawEx of block.exercises) {
          const { def, perHandOnly } = resolveSheetExercise(rawEx.name, catalogMap, addedById);
          const weekRow = rawEx.weeks.find((r) => r.week === w) ?? rawEx.weeks[0];
          if (!weekRow) continue;
          if (weekRow.date && !explicitDate) explicitDate = weekRow.date;

          // Seed a sensible starting weight from Week 1 logged sets (or best available week) if numeric
          const seedRow = rawEx.weeks.find((r) => r.loggedSets.some((st) => st.weightKg > 0));
          const rawSeedWeight = seedRow?.loggedSets.find((st) => st.weightKg > 0)?.weightKg;
          const dbFactor = def.equipment === 'dumbbell' && doubleDb && !perHandOnly ? 2 : 1;
          const defaultWeightKg = rawSeedWeight !== undefined ? Math.round(rawSeedWeight * dbFactor * 10) / 10 : def.equipment === 'bodyweight' ? 0 : undefined;

          templateExercises.push({
            order: rawEx.order,
            name: def.name,
            exerciseId: def.id,
            pillar: def.pillar,
            equipment: def.equipment,
            sets: weekRow.sets,
            reps: weekRow.repsStr,
            tempo: weekRow.tempo,
            restSeconds: weekRow.restSeconds,
            ...(weekRow.notes ? { notes: weekRow.notes } : {}),
            ...(defaultWeightKg !== undefined ? { defaultWeightKg } : {}),
            ...(weekRow.durationSeconds ? { durationSeconds: weekRow.durationSeconds } : {}),
            ...(def.isRdl ? { isRdl: true } : {}),
            ...(def.isWeightedCalisthenic ? { isWeightedCalisthenic: true } : {}),
          });

          if (options.importHistory !== false && weekRow.loggedSets.length > 0) {
            const firstLoggedWeek = rawEx.weeks.find((r) => r.loggedSets.length > 0);
            const week1SetSwap = firstLoggedWeek?.loggedSets.find((st) => st.swapHint)?.swapHint;
            const noteSwap = detectInlineSwapHint(weekRow.notes);
            const setSwap = weekRow.loggedSets.find((st) => st.swapHint)?.swapHint;
            const effectiveSwap = noteSwap || setSwap || week1SetSwap;
            const loggedResolved = effectiveSwap
              ? resolveSheetExercise(effectiveSwap, catalogMap, addedById)
              : { def, perHandOnly };
            const loggedDef = loggedResolved.def;
            const loggedDbFactor =
              loggedDef.equipment === 'dumbbell' && doubleDb && !loggedResolved.perHandOnly ? 2 : 1;

            const workoutSets: WorkoutSet[] = weekRow.loggedSets.map((st, sIdx) => {
              const weightKg = Math.round(st.weightKg * loggedDbFactor * 10) / 10;
              totalSetsCount += 1;
              totalVolumeKg += weightKg * st.reps;
              if (weightKg > heaviestWeight) {
                heaviestWeight = weightKg;
                heaviestLabel = `${loggedDef.name} (${weightKg} kg × ${st.reps})`;
              }
              return {
                id: `${planId}-w${globalWorkoutCounter}-${rawEx.order}-s${sIdx + 1}`,
                setNumber: sIdx + 1,
                targetWeightKg: weightKg,
                actualWeightKg: weightKg,
                targetReps: st.reps,
                actualReps: st.reps,
                ...(st.actualRepsLeft !== undefined ? { actualRepsLeft: st.actualRepsLeft } : {}),
                ...(st.actualRepsRight !== undefined ? { actualRepsRight: st.actualRepsRight } : {}),
                targetRir: 2,
                actualRir: 2,
                completed: true,
              };
            });

            historicalExercises.push({
              id: `${planId}-ex-${globalWorkoutCounter}-${rawEx.order}`,
              exerciseId: loggedDef.id,
              name: loggedDef.name,
              pillar: loggedDef.pillar,
              equipment: loggedDef.equipment,
              ...(loggedDef.isRdl ? { isRdl: true } : {}),
              ...(loggedDef.isWeightedCalisthenic ? { isWeightedCalisthenic: true } : {}),
              ...(loggedDef.isIsolation ? { isIsolation: true } : {}),
              minReps: Math.min(...workoutSets.map((s) => s.actualReps ?? 8)),
              maxReps: Math.max(...workoutSets.map((s) => s.actualReps ?? 10)),
              sets: workoutSets,
              orderCode: rawEx.order,
              tempo: weekRow.tempo,
              restSeconds: weekRow.restSeconds,
              ...(weekRow.notes ? { notes: weekRow.notes } : {}),
            });
          }
        }

        templates.push({
          workoutNumber: globalWorkoutCounter,
          week: absWeek,
          dayOfWeek,
          phase: phaseNum,
          title: block.title,
          splitDay: splitDayForTitle(block.title),
          exercises: templateExercises,
        });

        if (historicalExercises.length > 0) {
          const sessionDate = options.preferHistoricalStartDate ? defaultDate : explicitDate || defaultDate;
          historicalWorkouts.push({
            id: `workout-import-${slugify(planId)}-${globalWorkoutCounter}`,
            date: sessionDate,
            name: planWorkoutLabel(block.title),
            splitDay: splitDayForTitle(block.title),
            exercises: historicalExercises,
            completed: true,
            completedAt: `${sessionDate}T18:30:00.000Z`,
            readinessState: 'Normal',
            readinessZScore: 0,
            location: 'gym',
            programWorkoutNumber: globalWorkoutCounter,
            planId,
          });
        }
      });

      // Attach any week-indexed biometric check-ins recorded at the end of this phase
      for (const block of phaseBlocks) {
        for (const bio of block.biometrics) {
          if (bio.weekNum !== w) continue;
          const bioDate = localDateOffset((absWeek - 1) * 7, startAnchor);
          historicalBiometrics.push({ ...bio.log, date: bioDate });
        }
      }
    }

    globalWeekOffset += weeksInPhase;
  }

  const primaryPerWeek = phases[0] ? blocks.filter((b) => b.phase === phases[0].phaseNumber).length : 4;
  const savedPlan: SavedTrainingPlan = {
    id: planId,
    name: rawTitle,
    subtitle: `${templates.length} workouts · Imported from spreadsheet`,
    workoutsPerWeek: Math.max(1, primaryPerWeek),
    phases,
    templates,
    createdAt: new Date().toISOString(),
    source: 'spreadsheet',
  };

  // Deduplicate biometrics by date
  const bioByDate = new Map<string, BiometricLog>();
  for (const log of historicalBiometrics) {
    bioByDate.set(log.date, { ...(bioByDate.get(log.date) || {}), ...log });
  }

  const newExercises = [...addedById.values()];
  return {
    savedPlan,
    newExercises,
    historicalWorkouts,
    historicalBiometrics: [...bioByDate.values()],
    summary: {
      programName: rawTitle,
      programId: planId,
      phasesCount: phases.length,
      templateCount: templates.length,
      weeksCount: globalWeekOffset,
      loggedWorkoutsCount: historicalWorkouts.length,
      totalSetsCount,
      totalVolumeKg: Math.round(totalVolumeKg),
      heaviestLiftLabel: heaviestLabel,
      addedExerciseCount: newExercises.length,
      biometricCount: bioByDate.size,
    },
  };
}

/** Merges a parsed spreadsheet import cleanly into existing profile, exercises, workouts, and biometrics without duplicating existing records. */
export function applySpreadsheetImportToState(
  state: {
    profile: UserProfile;
    workouts: WorkoutSession[];
    biometrics: BiometricLog[];
    exercises: ExerciseDefinition[];
  },
  parsed: ParsedProgramImport,
  opts: { activateProgram?: boolean; importHistory?: boolean; markerId?: string } = {}
): {
  profile: UserProfile;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exercises: ExerciseDefinition[];
} {
  const existingPlanList = state.profile.customPlans ?? [];
  const nextCustomPlans = [
    ...existingPlanList.filter((p) => p.id !== parsed.savedPlan.id),
    parsed.savedPlan,
  ];
  const nextMarkers = opts.markerId
    ? [...new Set([...(state.profile.importedSheetIds ?? []), opts.markerId])]
    : state.profile.importedSheetIds;

  const existingExIds = new Set(state.exercises.map((e) => e.id));
  const nextExercises = [
    ...state.exercises,
    ...parsed.newExercises.filter((e) => !existingExIds.has(e.id)),
  ];

  let nextWorkouts = state.workouts;
  let nextBiometrics = state.biometrics;
  if (opts.importHistory !== false) {
    const existingWorkoutIds = new Set(state.workouts.map((w) => w.id));
    const addedWorkouts = parsed.historicalWorkouts.filter((w) => !existingWorkoutIds.has(w.id));
    nextWorkouts = [...state.workouts, ...addedWorkouts].sort((a, b) =>
      (b.completedAt || b.date).localeCompare(a.completedAt || a.date)
    );

    const existingBioDates = new Set(state.biometrics.map((b) => b.date));
    const addedBio = parsed.historicalBiometrics.filter((b) => !existingBioDates.has(b.date));
    nextBiometrics = [...state.biometrics, ...addedBio].sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    profile: {
      ...state.profile,
      customPlans: nextCustomPlans,
      ...(nextMarkers ? { importedSheetIds: nextMarkers } : {}),
      ...(opts.activateProgram ? { programType: parsed.savedPlan.id } : {}),
    },
    workouts: nextWorkouts,
    biometrics: nextBiometrics,
    exercises: nextExercises,
  };
}

/**
 * Ensures the verified owner account (`canUseMusclePlan`) has Phase 1 BT saved as a switchable
 * program alongside the 6-week muscle plan and its 2017 workout history imported once cleanly.
 * Never touches guest or other users' accounts, and never overwrites active plans or progress.
 */
export function ensureOwnerPhase1BtSeeded(state: {
  profile: UserProfile;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exercises: ExerciseDefinition[];
}): {
  didImport: boolean;
  profile: UserProfile;
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exercises: ExerciseDefinition[];
} {
  if (!canUseMusclePlan(state.profile.email)) {
    return { didImport: false, ...state };
  }
  const hasMarker = state.profile.importedSheetIds?.includes(PHASE_1_BT_SHEET_MARKER);
  if (hasMarker) {
    return { didImport: false, ...state };
  }

  const parsed = parseProgramSpreadsheet(PHASE_1_BT_SPREADSHEET_CSV, {
    programName: 'Phase 1 BT',
    programId: OWNER_PHASE_1_BT_ID,
    exerciseCatalog: state.exercises,
    importHistory: true,
    historicalStartDate: '2017-01-09',
    preferHistoricalStartDate: true,
    doubleTwoHandDumbbells: true,
  });

  const merged = applySpreadsheetImportToState(state, parsed, {
    activateProgram: false,
    importHistory: true,
    markerId: PHASE_1_BT_SHEET_MARKER,
  });

  return { didImport: true, ...merged };
}
