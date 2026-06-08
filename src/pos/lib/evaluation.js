import { getSimulatedNow } from "./format";

// ─── Evaluation Form Schema & Helpers ────────────────────────────────────────
const EVAL_SECTIONS = [
  { id:"dog-background", name:"Dog Background", maxScore:18, questions:[
    { id:"age", label:"Age", background:"Dogs with prior off-leash play experience vs dogs with no prior experience", type:"age-toggle" },
    { id:"social-experience", label:"Social Experience", background:"Type of prior social experience with other dogs", type:"radio", options:[
      { value:"green", label:"Dog daycare (ops known)", description:"Dog daycare – operations known to owner" },
      { value:"yellow", label:"Dog daycare (ops unknown) / dog park", description:"Dog daycare – ops unknown, dog park" },
      { value:"red", label:"Few dogs / on leash only / none / expelled", description:"Few dogs, on leash only, none, or expelled from daycare" },
    ]},
    { id:"play-style", label:"Play Style", background:"Description of typical play style as known to owners", type:"radio", options:[
      { value:"green", label:"Easygoing", description:"Easygoing play style" },
      { value:"yellow", label:"Likes to wrestle / roughhouse / vocal", description:"Likes to wrestle/roughhouse, vocal during play" },
      { value:"red", label:"Rough play / non-responsive / stalks / humper", description:"Rough play, non-responsive to dog cues, doesn't self-regulate, insistent and stalks, humper" },
    ]},
    { id:"bite-history", label:"Bite History", background:"Dog's bite history or reaction when pushed", type:"radio", options:[
      { value:"green", label:"No bites or aggressive responses", description:"No bites or aggressive responses seen" },
      { value:"yellow", label:"Growls/snaps, maybe a bite at vet", description:"Growls/snaps, maybe a bite in history at vet or in presence of stranger" },
      { value:"red", label:"High-level history, multiple incidents", description:"High level history with dogs or people, multiple incidents" },
    ]},
    { id:"obedience", label:"Obedience", background:"Obedience classes and level of training at home", type:"radio", options:[
      { value:"green", label:"Multiple classes, consistent use at home", description:"Multiple classes attended and consistent use at home (e.g. owners adamant about telling dog not to jump)" },
      { value:"yellow", label:"Puppy class, some follow-up", description:"Puppy class attended; some follow up at home" },
      { value:"red", label:"No classes, low consistency", description:"No classes known, low or no consistency of use in home" },
    ]},
    { id:"why-daycare", label:"Why Daycare", background:"Reason this client wants dog to attend daycare", type:"radio", options:[
      { value:"green", label:"Play with dogs / exercise / stay active", description:"To play with other dogs, additional exercise to what is already received at home, keep them active during the day" },
      { value:"yellow", label:"Suggested by another / separation anxiety", description:"Suggested by another, separation anxiety known, only source of exercise" },
      { value:"red", label:"Socialization (adult dog)", description:"Socialization (if dog is adult)" },
    ]},
  ]},
  { id:"temperament-handling", name:"Temperament & Handling", maxScore:9, stopForDayboarding:true, questions:[
    { id:"handling-unleash", label:"Handling: Unleash Safely", background:"Can you unleash the dog safely?", type:"binary", options:[
      { value:"green", label:"Yes", description:"Can safely unleash the dog" },
      { value:"red", label:"No", description:"Cannot safely unleash the dog" },
    ]},
    { id:"handling-room", label:"Handling: Exit & Re-enter Room", background:"Can you exit and reenter the room safely?", type:"binary", options:[
      { value:"green", label:"Yes", description:"Can safely exit and re-enter the room" },
      { value:"red", label:"No", description:"Cannot safely exit and re-enter the room" },
    ]},
    { id:"handling-leash", label:"Handling: Leash & Playtime Outside", background:"Can you leash the dog and perform a playtime outside safely?", type:"binary", options:[
      { value:"green", label:"Yes", description:"Can safely leash and perform playtime outside" },
      { value:"red", label:"No", description:"Cannot safely leash the dog for playtime outside" },
    ]},
  ]},
  { id:"human-interactions", name:"Human Interactions", maxScore:9, questions:[
    { id:"meeting-people", label:"Meeting", background:"Responses to new people (in lobby)", type:"radio", options:[
      { value:"green", label:"Initiates interaction, stays 2+ seconds", description:"Initiates interaction and stays for longer than 2 seconds" },
      { value:"yellow", label:"Tolerates, some stress signals", description:"Tolerates interaction, displays some stress signals" },
      { value:"red", label:"Avoids greeting, warning signals", description:"Avoids greeting, shows warning signals or aggression" },
    ]},
    { id:"handling-touch", label:"Handling", background:"Responses to touch and handling", type:"radio", options:[
      { value:"green", label:"Very accepting", description:"Very accepting of touch and handling" },
      { value:"yellow", label:"Tolerates, shy, stress signs", description:"Tolerates, but shy and shows signs of stress" },
      { value:"red", label:"Warning signs (growls, teeth, whale eye)", description:"Displays warning signs: growls, shows teeth, lowers head, whale eye" },
    ]},
    { id:"obedience-cues", label:"Obedience", background:"Responses to cues", type:"radio", options:[
      { value:"green", label:"Attentive and responsive", description:"Attentive and responsive to cues" },
      { value:"yellow", label:"Some positive responses, easily distracted", description:"Some positive responses but easily distracted" },
      { value:"red", label:"Ignores most cues, avoids eye contact", description:"Ignores most or all cues, avoids eye contact" },
    ]},
  ]},
  { id:"dog-greetings", name:"Dog Greetings", maxScore:12, questions:[
    { id:"calm-adults", label:"Calm Low-Key Adult Dogs", background:"Reaction to meeting balanced/confident experienced dogs", type:"radio", options:[
      { value:"green", label:"Polite", description:"Polite greeting behavior" },
      { value:"yellow", label:"Some rude behaviors tolerated", description:"Some rude behaviors tolerated (licking face, chewing, jumping on them)" },
      { value:"red", label:"Rude behaviors corrected / avoids", description:"Rude behaviors corrected – avoids greeting dog" },
    ]},
    { id:"other-dogs", label:"Other Dogs (5+)", background:"Reaction to meeting wide number of dogs (5+)", type:"radio", options:[
      { value:"green", label:"Polite", description:"Polite greeting behavior with multiple dogs" },
      { value:"yellow", label:"Some rude behaviors tolerated", description:"Some rude behaviors tolerated (licking face, chewing, jumping on them)" },
      { value:"red", label:"Rude behaviors corrected / avoids", description:"Rude behaviors corrected – avoids greeting dog" },
    ]},
    { id:"small-group", label:"Small Group (Less than 10 dogs)", background:"Reaction in small group", type:"radio", options:[
      { value:"green", label:"Enjoys interaction, plays, confident", description:"Enjoys interaction, plays, confidence shown" },
      { value:"yellow", label:"Tolerates, some stress shown", description:"Tolerates interactions, some stress shown (runs away, sniffing objects instead of interacting)" },
      { value:"red", label:"Avoids, stress/warning signals", description:"Avoids interactions, stress and warning signals shown – hiding, trying to get out, extreme panting, snapping or growling" },
    ]},
    { id:"large-group", label:"Large Group (More than 10 dogs)", background:"Reaction to being in a larger group – 10 being pass/fail threshold", type:"radio", options:[
      { value:"green", label:"Enjoys interaction, plays, confident", description:"Enjoys interaction, plays, confidence shown" },
      { value:"yellow", label:"Tolerates, some stress shown", description:"Tolerates interactions, some stress shown (runs away, sniffing objects instead of interacting)" },
      { value:"red", label:"Avoids, stress/warning signals", description:"Avoids interactions, stress and warning signals shown – hiding, trying to get out, extreme panting, snapping or growling" },
    ]},
  ]},
  { id:"playgroup-behavior", name:"Playgroup Behavior", maxScore:15, questions:[
    { id:"play-style-group", label:"Play", background:"Play style observed during evaluation", type:"radio", options:[
      { value:"green", label:"Appropriate, easily corrected", description:"Appropriate for the most part, easily corrected/responsive" },
      { value:"yellow", label:"Frequent inappropriate, little interest", description:"Frequent inappropriate behaviors, shows little interest in playing" },
      { value:"red", label:"Consistently inappropriate, needs interference", description:"Consistently inappropriate, requires interference from staff" },
    ]},
    { id:"stress-signals", label:"Stress", background:"Number of stress signals in a specific time (length of evaluation)", type:"radio", options:[
      { value:"green", label:"None / very few", description:"None or very few stress signals observed" },
      { value:"yellow", label:"Moderate and short spurts", description:"Moderate stress signals in short spurts" },
      { value:"red", label:"Consistent for extended periods", description:"Consistent stress signals for extended periods of time" },
    ]},
    { id:"body-posture", label:"Body Posture", background:"Overall dog body language displayed", type:"radio", options:[
      { value:"green", label:"Relaxed and playful", description:"Relaxed and playful most of the time" },
      { value:"yellow", label:"Alert, anxious, or submissive", description:"Alert, anxious, confident, or submissive postures displayed, urination when approached" },
      { value:"red", label:"Aroused, fearful, aggressive", description:"Aroused, fearful, aggressive posture" },
    ]},
    { id:"energy-level", label:"Energy Level", background:"Average energy level displayed during evaluation", type:"radio", options:[
      { value:"green", label:"Low to moderate, self-regulation", description:"Low to moderate, play and rest cycles noticed, self-regulation" },
      { value:"yellow", label:"Moderate to high, heightened at events", description:"Moderate to high, heightened at arrival or key arousal events" },
      { value:"red", label:"High most of the time, no rest", description:"High most of the time, no rest, 'annoying' to other dogs trying to rest" },
    ]},
    { id:"other-behaviors", label:"Other Behaviors", background:"Instances observing inappropriate off-leash behaviors", type:"radio", options:[
      { value:"green", label:"Minimal or rare", description:"Minimal or rare (e.g. poop eater)" },
      { value:"yellow", label:"Some instances, responds to redirection", description:"Some instances, responds well with redirection, other dogs tolerate behaviors" },
      { value:"red", label:"Frequent, bully behavior, aggression", description:"Frequent, multiple redirections needed in short period, bully behavior, aggression displayed and/or overly fearful or stressed" },
    ]},
  ]},
];

const EVAL_SCORE_PTS = { green:3, yellow:2, red:1 };
const getEvalAgeBucket = (dob) => {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00"), now = getSimulatedNow(); // Time Travel aware
  const ageMonths = (now - b) / (30.44 * 24 * 60 * 60 * 1000);
  if (ageMonths < 5) return "under5m";
  if (ageMonths < 6) return "5to6m";
  if (ageMonths < 36) return "6m3y";
  if (ageMonths < 84) return "3to7y";
  return "8plus";
};
const scoreEvalAge = (dob, hasExperience) => {
  const b = getEvalAgeBucket(dob);
  if (!b) return null;
  if (hasExperience) {
    if (b === "under5m" || b === "5to6m" || b === "6m3y") return "green";
    if (b === "3to7y") return "yellow";
    return "red";
  }
  if (b === "under5m") return "green";
  if (b === "5to6m" || b === "6m3y") return "yellow";
  return "red";
};
const calcEvalSectionPts = (answers, questions) => questions.reduce((s, q) => s + (EVAL_SCORE_PTS[answers[q.id]] || 0), 0);
const getEvalVisibleSections = (evalType) => evalType === "dayboarding" ? EVAL_SECTIONS.slice(0, 2) : EVAL_SECTIONS;
const getEvalVisibleQuestions = (evalType) => getEvalVisibleSections(evalType).flatMap(s => s.questions);
const getEvalMaxScore = (evalType) => getEvalVisibleSections(evalType).reduce((s, sec) => s + sec.maxScore, 0);
const getEvalTotalScore = (answers, evalType) => getEvalVisibleSections(evalType).reduce((s, sec) => s + calcEvalSectionPts(answers, sec.questions), 0);
const getEvalResult = (totalScore, evalType, answers) => {
  if (evalType === "dayboarding") {
    const allHandlingGreen = ["handling-unleash","handling-room","handling-leash"].every(id => answers[id] === "green");
    return allHandlingGreen ? "green" : "red";
  }
  return totalScore >= 40 ? "green" : "red";
};
const hasCompletedEval = (data, res) => (data.evaluations || []).some(e => e.reservationId === res.id && e.locked);

export { EVAL_SECTIONS, EVAL_SCORE_PTS, getEvalAgeBucket, scoreEvalAge, calcEvalSectionPts, getEvalVisibleSections, getEvalVisibleQuestions, getEvalMaxScore, getEvalTotalScore, getEvalResult, hasCompletedEval };
