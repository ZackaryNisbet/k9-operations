import { gid, todayStr } from "../lib/format";
import { DEF_CLIENT_FIELDS, DEF_DOG_FIELDS } from "../constants/fields";
import { DEF_AGREEMENTS, DEF_DOG_TAGS } from "../constants/forms";
import { DEF_REQUIRED_VACCINES } from "../constants/vaccines";
import { DEF_EOD_TEMPLATE, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE } from "../constants/operations";
import { DEF_PRICING } from "../constants/pricing";
import { DEF_BREED_OPTIONS, DEF_FEEDING_TIME_OPTIONS, DEF_FEEDING_UNIT_OPTIONS, DEF_FOOD_TYPE_OPTIONS, DEF_FEEDING_INSTRUCTION_OPTIONS, DEF_MEDICATION_UNIT_OPTIONS, DEF_MEDICATION_TIME_OPTIONS, DEF_MEDICATION_NAME_OPTIONS, DEF_MEDICATION_INSTRUCTION_OPTIONS, DEF_BATH_TYPE_OPTIONS } from "../constants/dropdowns";
import { DEFAULT_ROLES } from "../constants/permissions";

function generateDemoData() {
  const today = todayStr();
  const addD = (base, n) => { const d = new Date(base + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
  const FN=["Sarah","James","Emily","Michael","Jessica","David","Jennifer","Robert","Ashley","Christopher","Amanda","Matthew","Stephanie","Andrew","Nicole","Joshua","Samantha","Daniel","Lauren","William","Megan","Ryan","Rachel","Kevin","Brittany","Justin","Elizabeth","Brandon","Heather","Tyler","Melissa","Jacob","Katherine","Nathan","Amber","Jonathan","Rebecca","Aaron","Christine","Joseph","Maria","Thomas","Angela","Brian","Tiffany","Eric","Lisa","Patrick","Michelle","Sean","Courtney","Gregory","Laura","Jeffrey","Danielle","Mark","Kimberly","Adam","Allison","Jeremy","Kelly","Steven","Hannah","Timothy","Victoria","Scott","Anna","Benjamin","Christina","Peter","Olivia","Zachary","Alex","John","Kim","Derek","Sophie","Marcus","Natalie","Travis","Emma","Kyle","Sophia","Carlos","Isabella","Tony","Grace","Luis","Ava","Henry","Diana","Paul","Chloe","Russell","Lily","Albert","Zoe","Richard","Mia","Charles","Audrey","George","Ella","Frank","Maya","Luke","Nora","Phillip","Riley","Ethan","Aria","Noah","Ellie","Owen","Hazel","Jake","Violet","Cole","Quinn","Chase","Stella","Blake","Claire","Dylan","Jasmine","Ian","Ruby","Simon","Ivy","Grant","Autumn","Dean","Skylar","Reed","Brooke","Clark","June","Maxwell","Faith","Leo","Hope","Axel","Jade","Hugo","Iris","Felix","Fiona","Oscar","Lydia","Miles","Clara","Adrian"];
  const LN=["Mitchell","Chen","Rodriguez","Thompson","Williams","Johnson","Brown","Davis","Miller","Wilson","Anderson","Taylor","Thomas","Moore","Jackson","Martin","Lee","White","Harris","Clark","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Green","Baker","Adams","Nelson","Hill","Ramirez","Campbell","Roberts","Carter","Phillips","Evans","Turner","Torres","Parker","Collins","Edwards","Stewart","Flores","Morris","Nguyen","Murphy","Rivera","Cook","Rogers","Morgan","Peterson","Cooper","Reed","Bailey","Bell","Gomez","Kelly","Howard","Ward","Cox","Diaz","Richardson","Wood","Watson","Brooks","Bennett","Gray","James","Reyes","Cruz","Hughes","Price","Myers","Long","Foster","Sanders","Ross","Morales","Powell","Sullivan","Russell","Ortiz","Jenkins","Gutierrez","Perry","Butler","Barnes","Fisher","Henderson","Coleman","Simmons","Patterson","Jordan","Reynolds","Hamilton","Graham","Kim","Gonzalez","Alexander","Ramos","Wallace","Griffin","West","Cole","Hayes","Chavez","Gibson","Bryant","Ellis","Stevens","Murray","Ford","Marshall","Owens","Mcdonald","Harrison","Ruiz","Kennedy","Wells","Alvarez","Woods","Mendoza","Castillo","Olson","Webb","Washington","Tucker","Freeman","Burns","Henry","Crawford","Boyd","Mason","Moreno","Hunt","Hicks","Palmer","Wagner","Lynch","Dixon","Shaw","Harvey","Hudson","Dunn"];
  const DN=["Baxter","Luna","Cooper","Bella","Max","Charlie","Buddy","Daisy","Rocky","Sadie","Bear","Molly","Duke","Lucy","Tucker","Maggie","Zeus","Zoey","Jack","Chloe","Toby","Penny","Murphy","Rosie","Oscar","Ruby","Bentley","Lola","Leo","Sophie","Harley","Gracie","Finn","Millie","Milo","Nala","Jasper","Stella","Ollie","Roxy","Bruno","Willow","Winston","Zoe","Louie","Coco","Dexter","Lily","Henry","Hazel","Thor","Ellie","Shadow","Winnie","Sam","Piper","Bailey","Olive","Gus","Beau","Belle","Scout","Layla","Teddy","Annie","Rex","Dixie","Blue","Pearl","Hank","Pepper","Atlas","Sasha","Diesel","Honey","Ace","Ginger","Bandit","Emma","Tank","Lulu","Archie","Riley","Maverick","Izzy","Cash","Lexi","Odin","Ivy","Ranger","Gigi","Apollo","Maya","Simba","Holly","Koda","Phoebe","Jax","Callie","Moose","Mia","Biscuit","Clementine","Waffles","Maple","Nugget","Theo","Oakley","Frida","Basil","Sage","Truffle","Pickles","Barkley","Chester","Rufus","Otis","Sparky","Prince","King","Cody","Sandy","Trixie","Misty","Lady","Princess","Angel","Shelby","Dakota","Sierra","Cassie","Sable","Abby","Peaches","Cookie","Chai","Felix","Boomer","Athena","Josie","Ziggy"];
  const BR=["Golden Retriever","Labrador Retriever","French Bulldog","Poodle","German Shepherd","Bulldog","Beagle","Rottweiler","Dachshund","Pembroke Welsh Corgi","Australian Shepherd","Yorkshire Terrier","Boxer","Cavalier King Charles Spaniel","Doberman Pinscher","Miniature Schnauzer","Shih Tzu","Boston Terrier","Bernese Mountain Dog","Pomeranian","Havanese","Shetland Sheepdog","Brittany","Cocker Spaniel","Miniature Poodle","Siberian Husky","Great Dane","Maltese","Chihuahua","Vizsla","Bichon Frise","Border Collie","Weimaraner","Goldendoodle","Labradoodle","Cockapoo","Bernedoodle","Maltipoo","Mixed Breed","Standard Poodle","Cane Corso","Akita","Samoyed","Shiba Inu","Jack Russell Terrier","West Highland White Terrier","Irish Setter","Rhodesian Ridgeback","Newfoundland","Basset Hound","Great Pyrenees","Belgian Malinois","Whippet","Italian Greyhound","Bull Terrier"];
  const COL=["Black","Brown","Golden","White","Cream","Brindle","Red","Tan","Black and Tan","Tri-color","Merle","Sable","Fawn","Gray","White/Cream","Black and White","Chocolate","Apricot","Silver","Spotted"];
  const STR=["Elm St","Oak Ave","Maple Dr","Pine Ln","Cedar Ct","Birch Way","Walnut Blvd","Cherry Rd","Willow Pl","Ash St","Spruce Ave","Hickory Dr","Poplar Ln","Chestnut Ct","Magnolia Way","Sycamore Blvd","Juniper Rd","Linden St","Cypress Ave","Ridge Rd","Valley Dr","Lake Shore Blvd","Park Ave","Main St","Church Rd","School Ln","Mill Rd","Forest Ave","River Rd","Hill St","Meadow Ln","Brook Dr","Creek Way","Sunset Blvd","Highland Ave"];
  const CTY=["Deerfield, IL","Highland Park, IL","Northbrook, IL","Lake Forest, IL","Libertyville, IL","Vernon Hills, IL","Buffalo Grove, IL","Lincolnshire, IL","Glenview, IL","Wilmette, IL","Winnetka, IL","Glencoe, IL","Bannockburn, IL","Mundelein, IL","Riverwoods, IL"];
  const VET=["Dr. Patel","Dr. Kim","Dr. Johnson","Dr. Smith","Dr. Lee","Dr. Garcia","Banfield Pet Hospital","VCA Animal Hospital","North Shore Animal Hospital","Lake County Veterinary","Deerfield Veterinary","Northbrook Animal Clinic","Village Animal Clinic","Companion Animal Hospital"];
  const TMP=["Friendly, loves other dogs","High energy, loves fetch","Gentle, calm demeanor","Shy at first, warms up quickly","Playful, very social","Well-trained, obedient","Anxious during storms","Selective with other dogs","Very friendly, loves people","Calm and relaxed","Energetic, needs lots of exercise","Good with all dogs","Timid, needs gentle handling","Confident and outgoing","Loves water","Good off-leash","Food motivated","Loves belly rubs","Prefers smaller play groups","Independent but affectionate"];
  const SMBREED=new Set(["French Bulldog","Yorkshire Terrier","Shih Tzu","Pomeranian","Havanese","Maltese","Chihuahua","Bichon Frise","Maltipoo","Cockapoo","Jack Russell Terrier","Cavalier King Charles Spaniel","Miniature Schnauzer","Miniature Poodle","West Highland White Terrier","Italian Greyhound","Dachshund","Boston Terrier","Whippet"]);
  const LGBREED=new Set(["Golden Retriever","Labrador Retriever","German Shepherd","Rottweiler","Bernese Mountain Dog","Great Dane","Siberian Husky","Goldendoodle","Labradoodle","Bernedoodle","Standard Poodle","Cane Corso","Akita","Samoyed","Newfoundland","Great Pyrenees","Rhodesian Ridgeback","Belgian Malinois","Irish Setter"]);

  // Seeded random for consistency within a day
  let _s = 42;
  const srand = () => { _s = (_s * 16807 + 0) % 2147483647; return (_s - 1) / 2147483646; };
  const ri = (a, b) => Math.floor(srand() * (b - a + 1)) + a;
  const rp = (arr) => arr[Math.floor(srand() * arr.length)];

  const clients = [];
  const usedPh = new Set();
  for (let i = 1; i <= 150; i++) {
    let ph; do { ph = "847555" + String(ri(1000,9999)); } while(usedPh.has(ph));
    usedPh.add(ph);
    const fn = rp(FN), ln = rp(LN);
    clients.push({
      id: "c"+i,
      fields: {
        phone: ph, first_name: fn, last_name: ln,
        email: fn.toLowerCase()+"."+ln.toLowerCase()+"@email.com",
        street: ri(1,999)+" "+rp(STR),
        city: rp(CTY).split(", ")[0],
        state: rp(CTY).split(", ")[1] || "IL",
        zip: "600" + String(ri(10,99)),
        emergency_contact: rp(FN)+" "+rp(LN),
        emergency_phone: "847555"+String(ri(1000,9999)),
        notes: srand()>0.7 ? rp(["Prefers text communication","Travels frequently, regular boarder","Also has cat at home","First-time pet owner","Referred by friend","VIP client","Works from home","Prefers morning drop-off","Wants daily photo updates",""]) : ""
      },
      createdAt: addD(today, -ri(1,365)),
      agreements: srand() > 0.15 ? { agr1: { signed: true, date: addD(today, -ri(1, 180)) } } : {}
    });
  }

  const dogs = [];
  let di = 1;
  const ownedNames = {};
  for (const cl of clients) {
    const nd = srand()<0.5 ? 1 : srand()<0.7 ? 2 : 3;
    for (let j = 0; j < nd; j++) {
      let nm; do { nm = rp(DN); } while(ownedNames[cl.id]?.includes(nm));
      if (!ownedNames[cl.id]) ownedNames[cl.id]=[];
      ownedNames[cl.id].push(nm);
      const breed = rp(BR);
      const w = SMBREED.has(breed) ? ri(8,30) : LGBREED.has(breed) ? ri(55,110) : ri(25,70);
      const sex = srand()>0.5 ? "Male" : "Female";
      const fixed = sex==="Male" ? (srand()>0.2?"Neutered":"Intact") : (srand()>0.2?"Spayed":"Intact");
      const by=ri(2018,2025),bm=ri(1,12),bd=ri(1,28);
      const dob = by+"-"+String(bm).padStart(2,"0")+"-"+String(bd).padStart(2,"0");
      const vc = srand()>0.2;
      const rabies = vc ? addD(today,ri(30,365)) : addD(today,ri(-180,-1));
      const bord = vc ? addD(today,ri(30,240)) : addD(today,ri(-120,-1));
      const dhpp = vc ? addD(today,ri(30,365)) : addD(today,ri(-180,-1));
      const flu = srand()>0.3 ? (vc ? addD(today,ri(30,300)) : addD(today,ri(-90,-1))) : "";
      // Assign EXACTLY ONE classification tag per dog.
      // ~20% are new dogs (tag_eval only, no prior stays or eval forms).
      // ~80% are classified dogs with exactly one of: tag_lp, tag_sp, tag_pp.
      // Classified dogs MUST have a prior eval form + prior reservation.
      const isNewDog = srand() > 0.80; // ~20% are brand new / awaiting eval
      let tags;
      if (isNewDog) {
        tags = ["tag_eval"];
      } else {
        const isPrivatePlay = srand() > 0.85; // ~15% of classified dogs are private play
        if (isPrivatePlay) {
          tags = ["tag_pp"];
        } else if (w < 35) {
          tags = ["tag_sp"]; // Small Playgroup
        } else {
          tags = ["tag_lp"]; // Large Playgroup
        }
      }
      const meds = [];
      if (srand()>0.8) meds.push({
        id: gid(),
        times: srand() > 0.5 ? ["AM (6:00 am)","PM (6:00 pm)"] : [rp(["AM (6:00 am)","Noon (12:00 pm)","PM (6:00 pm)","With Meals"])],
        amount:"1", unit: rp(["Tablet","Capsule","mL","Pump"]),
        name: rp(["Glucosamine","Apoquel","Trazodone","Thyroid Medication","Heart Medication","Joint Supplement","Fish Oil","Probiotic"]),
        instruction: rp(["Give with food","Give on empty stomach","Monitor for lethargy","Crush and mix with food",""]),
        notes: rp(["Daily medication","As needed","","",""])
      });
      dogs.push({
        id:"d"+di, clientId:cl.id,
        fields:{
          name:nm, breed, weight:String(w), dob, sex, spayed_neutered:fixed,
          color:rp(COL), bath_type:rp(["Standard","Standard","Standard","Hypo","Medicated","Whitening"]),
          temperament:rp(TMP),
          rabies_exp:rabies, bordetella_exp:bord, dhpp_exp:dhpp, canine_flu_exp:flu,
          feedingSchedules:[{
            times: srand()>0.3 ? ["AM (6:00 am)","PM (6:00 pm)"] : ["AM (6:00 am)","Noon (12:00 pm)","PM (6:00 pm)"],
            amount: w<35 ? rp(["1","0.5","0.75"]) : rp(["2","2.5","3","1.5"]),
            unit:"Cup",
            foodType: rp(["Food From Home - Bagged","Food From Home - Unbagged","Blue Buffalo GI Vet-Grade (Chicken)","Blue Buffalo HF Vet-Grade (Salmon)"]),
            instruction: rp(["Regular","Regular","Regular","Slow Feeder","Elevated Bowl","Separate from Others"]),
            notes: srand()>0.85 ? rp(["Eats too fast","Picky eater","No chicken","Grain-free only",""]) : ""
          }],
          medicationSchedules: meds
        },
        tags
      });
      di++;
    }
  }

  // Separate eval-only dogs (new, no prior stays) from classified dogs
  const evalOnlyDogIds = new Set(dogs.filter(d => d.tags.length === 1 && d.tags[0] === "tag_eval").map(d => d.id));
  const classifiedDogs = dogs.filter(d => !evalOnlyDogIds.has(d.id));

  const reservations = [];
  let rIdx = 1;
  const occ = {};
  const isFree = (rm, ci, co) => { let d=ci; while(d<co){ if(occ[d]?.has(rm)) return false; d=addD(d,1); } return true; };
  const markRm = (rm, ci, co) => { let d=ci; while(d<co){ if(!occ[d]) occ[d]=new Set(); occ[d].add(rm); d=addD(d,1); } };

  const ROOMS = {
    "Luxury Suite":["101","102","103","104","105","106"],
    "Executive Room":["201","202","203","204","205","206","207","208","209","210","211","212","213","214","215"],
    "Double Compartment":["DC1","DC2","DC3","DC4","DC5","DC6","DC7","DC8","DC9"],
    "Single Compartment":["SC1","SC2","SC3","SC4","SC5","SC6","SC7","SC8","SC9","SC10","SC11","SC12","SC13","SC14","SC15","SC16","SC17","SC18"],
  };
  const allRms = [];
  for (const [t,rs] of Object.entries(ROOMS)) for (const r of rs) allRms.push({type:t,room:r});
  for (let i=allRms.length-1;i>0;i--){ const j=Math.floor(srand()*(i+1));[allRms[i],allRms[j]]=[allRms[j],allRms[i]]; }

  const usedDogs = new Set();
  let occToday = 0;

  // Active boarding (~50% of 48 = 24 rooms) — any dog (eval dogs can be on their first stay)
  for (const {type,room} of allRms) {
    if (occToday >= 24) break;
    const avail = dogs.filter(d => !usedDogs.has(d.id));
    if (!avail.length) break;
    const dog = rp(avail);
    usedDogs.add(dog.id);
    const da = ri(1,5), dh = ri(1,5);
    const ci = addD(today,-da), co = addD(today,dh);
    if (!isFree(room,ci,co)) continue;
    markRm(room,ci,co);
    reservations.push({
      id:"r"+(rIdx++), clientId:dog.clientId, dogId:dog.id, type:"boarding",
      roomType:type, room, checkIn:ci, checkOut:co,
      checkInTime:rp(["07:00","08:00","09:00","10:00"]),
      checkOutTime:rp(["10:00","11:00","12:00","14:00"]),
      status:"checked-in",
      notes:rp(["","","","Bring own bed","Extra play time","Needs quiet room","Daily photos requested","Regular boarder",""])
    });
    occToday++;
  }

  // Upcoming boarding (next 1-14 days) — any dog (eval dogs can have upcoming stays)
  for (let i=0;i<30;i++){
    const avail=dogs.filter(d=>!usedDogs.has(d.id));
    if(!avail.length) break;
    const dog=rp(avail);
    const sd=ri(1,14),sl=ri(1,7);
    const ci=addD(today,sd),co=addD(today,sd+sl);
    const rt=rp(Object.keys(ROOMS)),rm=rp(ROOMS[rt]);
    if(!isFree(rm,ci,co)) continue;
    markRm(rm,ci,co); usedDogs.add(dog.id);
    reservations.push({
      id:"r"+(rIdx++), clientId:dog.clientId, dogId:dog.id, type:"boarding",
      roomType:rt, room:rm, checkIn:ci, checkOut:co,
      checkInTime:rp(["07:00","08:00","09:00","10:00"]),
      checkOutTime:rp(["10:00","11:00","12:00","14:00"]),
      status:"upcoming", notes:rp(["","","","First stay","Regular client","Bring own food",""])
    });
  }

  // Past boarding (checked out last 60 days) — only classified dogs
  for (let i=0;i<60;i++){
    const avail=classifiedDogs.filter(d=>!usedDogs.has(d.id));
    if(!avail.length) break;
    const dog=rp(avail);
    const ed=ri(1,60),sl=ri(1,7);
    const co=addD(today,-ed),ci=addD(co,-sl);
    const rt=rp(Object.keys(ROOMS)),rm=rp(ROOMS[rt]);
    if(!isFree(rm,ci,co)) continue;
    markRm(rm,ci,co); usedDogs.add(dog.id);
    reservations.push({
      id:"r"+(rIdx++), clientId:dog.clientId, dogId:dog.id, type:"boarding",
      roomType:rt, room:rm, checkIn:ci, checkOut:co,
      checkInTime:rp(["07:00","08:00","09:00","10:00"]),
      checkOutTime:rp(["10:00","11:00","12:00"]),
      status:"checked-out", notes:""
    });
  }

  // Today's daycare (~18 dogs) — only classified dogs (eval dogs can't do daycare without being evaluated)
  const dcDogs = classifiedDogs.filter(d => !usedDogs.has(d.id)).slice(0,18);
  for (const dog of dcDogs) {
    usedDogs.add(dog.id);
    const sm = parseInt(dog.fields.weight)<35;
    const full = srand()>0.3;
    reservations.push({
      id:"r"+(rIdx++), clientId:dog.clientId, dogId:dog.id, type:"daycare",
      daycareSize:sm?"small":"large", checkIn:today, checkOut:today,
      checkInTime:rp(["06:30","07:00","07:30","08:00","08:30","09:00"]),
      checkOutTime:full?rp(["17:00","17:30","18:00"]):rp(["12:00","12:30","13:00"]),
      status:srand()>0.3?"checked-in":"upcoming",
      notes:""
    });
  }

  // Past daycare (last 30 days) — only classified dogs
  for (let i=0;i<60;i++){
    const dog=rp(classifiedDogs);
    const da=ri(1,30);
    const dt=addD(today,-da);
    const sm=parseInt(dog.fields.weight)<35;
    reservations.push({
      id:"r"+(rIdx++), clientId:dog.clientId, dogId:dog.id, type:"daycare",
      daycareSize:sm?"small":"large", checkIn:dt, checkOut:dt,
      checkInTime:rp(["06:30","07:00","07:30","08:00"]),
      checkOutTime:rp(["17:00","17:30","18:00"]),
      status:"checked-out", notes:""
    });
  }

  // Tours — eval-only dogs get tours (they're new, may be touring)
  const evalOnlyArr = dogs.filter(d => evalOnlyDogIds.has(d.id));
  for (let i=0;i<5;i++){
    const dog = evalOnlyArr.length > 0 ? rp(evalOnlyArr) : rp(dogs);
    const dt = i<2 ? today : addD(today,ri(1,7));
    reservations.push({
      id:"r"+(rIdx++), clientId:dog.clientId, dogId:dog.id, type:"tour",
      checkIn:dt, checkOut:dt,
      checkInTime:rp(["10:00","11:00","14:00","15:00"]),
      checkOutTime:rp(["10:30","11:30","14:30","15:30"]),
      status:"upcoming",
      notes:""
    });
  }
  // Upcoming evaluations — only eval-only dogs (they haven't been evaluated yet)
  for (let i=0;i<5;i++){
    const dog = evalOnlyArr.length > 0 ? rp(evalOnlyArr) : rp(dogs);
    const dt = i<2 ? today : addD(today,ri(1,5));
    reservations.push({
      id:"r"+(rIdx++), clientId:dog.clientId, dogId:dog.id, type:"evaluation",
      evalResult:"pending",
      checkIn:dt, checkOut:dt,
      checkInTime:rp(["09:00","10:00","11:00"]),
      checkOutTime:rp(["10:00","11:00","12:00"]),
      status:"upcoming",
      notes:""
    });
  }

  // Generate evaluation records ONLY for classified dogs (lp/sp/pp) — NOT eval-only dogs.
  // Classified dogs MUST have a prior eval + at least one prior reservation to support their classification.
  const evalRecords = [];
  const dogsWithReservations = new Set(reservations.map(r => r.dogId));

  classifiedDogs.forEach(dog => {
    const hasPP = (dog.tags || []).includes("tag_pp");
    const hasLP = (dog.tags || []).includes("tag_lp");
    const hasSP = (dog.tags || []).includes("tag_sp");
    const evalDate = addD(today, -ri(30, 180)); // eval happened well in the past

    // If this classified dog has NO reservation yet, create a past one so their profile shows history
    if (!dogsWithReservations.has(dog.id)) {
      const pastDate = addD(evalDate, ri(1, 14)); // a stay shortly after their eval
      const pastEnd = addD(pastDate, ri(1, 4));
      const sm = parseInt(dog.fields.weight) < 35;
      if (srand() > 0.5) {
        // Past boarding stay
        const rt = rp(Object.keys(ROOMS)), rm = rp(ROOMS[rt]);
        reservations.push({
          id: "r" + (rIdx++), clientId: dog.clientId, dogId: dog.id, type: "boarding",
          roomType: rt, room: rm, checkIn: pastDate, checkOut: pastEnd,
          checkInTime: rp(["07:00","08:00","09:00"]),
          checkOutTime: rp(["10:00","11:00","12:00"]),
          status: "checked-out", notes: ""
        });
      } else {
        // Past daycare visit
        reservations.push({
          id: "r" + (rIdx++), clientId: dog.clientId, dogId: dog.id, type: "daycare",
          daycareSize: sm ? "small" : "large", checkIn: pastDate, checkOut: pastDate,
          checkInTime: rp(["06:30","07:00","07:30","08:00"]),
          checkOutTime: rp(["17:00","17:30","18:00"]),
          status: "checked-out", notes: ""
        });
      }
    }

    // Create the eval reservation that this eval form is tied to
    const evalResId = "r" + (rIdx++);
    reservations.push({
      id: evalResId, clientId: dog.clientId, dogId: dog.id, type: "evaluation",
      evalResult: hasPP ? "passed_private" : "passed_group",
      checkIn: evalDate, checkOut: evalDate,
      checkInTime: rp(["09:00","10:00","11:00"]),
      checkOutTime: rp(["10:00","11:00","12:00"]),
      status: "checked-out", notes: ""
    });

    const result = hasPP ? "yellow" : "green"; // yellow = private play, green = passed group
    evalRecords.push({
      id: "eval_" + dog.id,
      dogId: dog.id,
      clientId: dog.clientId,
      reservationId: evalResId,
      date: evalDate,
      evaluatorName: rp(["Sarah M.","Mike T.","Jessica R.","Carlos G.","Amanda K."]),
      evalType: "initial",
      hasExperience: !hasPP,
      answers: {},
      subtotals: {},
      totalScore: hasPP ? ri(12, 18) : ri(22, 30),
      maxScore: 30,
      result,
      notes: hasPP ? "Dog reactive with other dogs; private play recommended" : (hasLP ? "Great with large playgroup; confident and social" : "Great with small playgroup; gentle and social"),
      locked: true,
      createdAt: new Date(evalDate + "T12:00:00").toISOString(),
    });
  });

  // EOD Entries (60 days of history — 2 months)
  const eodEntries = [];
  const SECS=["sales","csr_checklist","alerts","team_notes","leads","tours","meds","birthdays","ice_cream","extra_play","baths","day_boarders","evaluations","small_daycare_notes","large_daycare_notes","boarding_notes","social_media","picture_requests","building_supplies","other"];

  for (let off = -60; off <= -1; off++) {
    const dt = addD(today, off);
    const dayDogs = [];
    reservations.forEach(r => {
      if (r.checkIn <= dt && r.checkOut >= dt) {
        const dg = dogs.find(d => d.id === r.dogId);
        if (dg && !dayDogs.find(dd => dd.id === dg.id)) dayDogs.push(dg);
      }
    });

    const pickDog = () => { const d = dayDogs.length > 0 ? rp(dayDogs) : rp(dogs); const c = clients.find(cl => cl.id === d.clientId); return {d,c}; };

    const genSec = (sid) => {
      switch(sid) {
        case "sales": return "Today's Goal: $"+ri(800,2500)+"\nWTD: $"+ri(3000,15000)+"\nMTD: $"+ri(8000,45000)+"\nYTD: $"+ri(30000,200000);
        case "csr_checklist": return ["Turn on Luxury TV's","Turn on music","Create Private Play log","Vacuum and Cherry front lobby before 7:00 am","Unlock latches on front door","Check incoming Tours","Do body checks on dogs leaving today and fill out form"].map(x=>"["+(srand()>0.2?"x":" ")+"] "+x).join("\n");
        case "alerts": return rp(["- Goal for Each CSR to book at least 1 Eval/Tour","- Reminder: Valentine's Day packages available\n- Push puppy love photo package","- New pricing effective next week\n- All staff meeting Thursday","- Weekend fully booked for boarding\n- Waitlist available"]);
        case "team_notes": { const {d,c}=pickDog(); return "@"+d.fields.name+" "+c.fields.last_name+" had a great day in playgroup\n"+rp(["Great teamwork today everyone!","Remember to check water bowls every hour","Updated cleaning schedule posted","Reminder: staff photos needed for website"]); }
        case "leads": { const lines=[]; for(let i=0;i<ri(1,3);i++) lines.push("- "+rp(FN)+" "+rp(LN)+" - "+rp(["called about boarding","interested in daycare","website inquiry","referral from client"])); return lines.join("\n"); }
        case "tours": { const n=ri(0,3); if(!n) return "No tours today"; const lines=[]; for(let i=0;i<n;i++) lines.push("- "+rp(FN)+" "+rp(LN)+" - "+rp(["booked boarding","scheduled evaluation","interested in daycare packages","signed up!"])); return lines.join("\n"); }
        case "meds": { const md=dayDogs.filter(d=>d.fields.medicationSchedules.length>0); if(!md.length) return "Boarding:\nAM:\n- None\nPM:\n- None"; const lines=["Boarding:","AM:"]; md.forEach(d=>{ const c=clients.find(cl=>cl.id===d.clientId); d.fields.medicationSchedules.forEach(m=>lines.push("- @"+d.fields.name+" "+c.fields.last_name+" - "+m.amount+" "+m.unit+" "+m.name)); }); lines.push("PM:","- None"); return lines.join("\n"); }
        case "birthdays": { const mo=parseInt(dt.split("-")[1]),dy=parseInt(dt.split("-")[2]); const bd=dogs.filter(d=>{if(!d.fields.dob)return false; const m=parseInt(d.fields.dob.split("-")[1]),dd=parseInt(d.fields.dob.split("-")[2]); return m===mo&&Math.abs(dd-dy)<=2;}); if(!bd.length) return "No birthdays today"; return bd.slice(0,3).map(d=>{const c=clients.find(cl=>cl.id===d.clientId);return "- @"+d.fields.name+" "+c.fields.last_name+" turns "+(2026-parseInt(d.fields.dob.split("-")[0]))+"!";}).join("\n"); }
        case "ice_cream": { if(srand()>0.5) return "None today"; const lines=[]; for(let i=0;i<ri(1,3);i++){const {d,c}=pickDog();lines.push("- @"+d.fields.name+" "+c.fields.last_name);} return lines.join("\n"); }
        case "extra_play": { if(srand()>0.6) return "None today"; const lines=[]; for(let i=0;i<ri(1,3);i++){const {d,c}=pickDog();lines.push("- @"+d.fields.name+" "+c.fields.last_name+" - "+rp(["30 min private play","1 hour play session","Extra yard time"]));} return lines.join("\n"); }
        case "baths": { const n=ri(0,4); if(!n) return ""; const lines=[]; for(let i=0;i<n;i++){const {d,c}=pickDog();lines.push("["+(srand()>0.3?"x":" ")+"] @"+d.fields.name+" "+c.fields.last_name+" - "+rp(["Standard","Hypo","Medicated","Whitening"])+" bath");} return lines.join("\n"); }
        case "day_boarders": { if(srand()>0.5) return "None today"; const lines=[]; for(let i=0;i<ri(1,3);i++){const {d,c}=pickDog();lines.push("- @"+d.fields.name+" "+c.fields.last_name+" - "+rp(["Day board, pickup by 6pm","Day board + bath","Private play only"]));} return lines.join("\n"); }
        case "evaluations": { if(srand()>0.6) return "Name, L/S daycare, Room # - Pass/fail\n- None today"; const lines=["Name, L/S daycare, Room # - Pass/fail"]; for(let i=0;i<ri(1,2);i++){const {d,c}=pickDog();const sm=parseInt(d.fields.weight)<35;lines.push("- @"+d.fields.name+" "+c.fields.last_name+", "+(sm?"S":"L")+" daycare - "+rp(["Passed, parents contacted","Private play recommended","Pending evaluation"]));} return lines.join("\n"); }
        case "small_daycare_notes":
        case "large_daycare_notes": { if(srand()>0.5) return "(Dogs name, last initial, date/time and details of incident)\n- Nothing to report"; const lines=["(Dogs name, last initial, date/time and details of incident)"]; for(let i=0;i<ri(1,3);i++){const {d,c}=pickDog();lines.push("- @"+d.fields.name+" "+c.fields.last_name+" "+ri(8,16)+":"+rp(["00","15","30","45"])+" - "+rp(["played well in group","needed a break from play","was a bit mouthy, redirected","had loose stool","napped most of the afternoon","was very energetic today","did great with new dogs"]));} return lines.join("\n"); }
        case "boarding_notes": { if(srand()>0.4) return "All boarders doing well"; const lines=[]; for(let i=0;i<ri(1,3);i++){const {d,c}=pickDog();lines.push("- @"+d.fields.name+" "+c.fields.last_name+" - "+rp(["eating well, happy in room","seemed anxious at first, settled in","loved playtime","refused dinner, will monitor","checkout tomorrow, bath scheduled","sleeping soundly"]));} return lines.join("\n"); }
        case "social_media": return ["["+(srand()>0.3?"x":" ")+"] Instagram Stories","["+(srand()>0.4?"x":" ")+"] Instagram Post"].join("\n");
        case "picture_requests": { if(srand()>0.5) return ""; const lines=[]; for(let i=0;i<ri(1,3);i++){const {d,c}=pickDog();lines.push("["+(srand()>0.4?"x":" ")+"] @"+d.fields.name+" "+c.fields.last_name+" - "+rp(["owner requested photo","send to owner","daily update photo"]));} return lines.join("\n"); }
        case "building_supplies": return rp(["All good","- Need more paper towels\n- Bleach running low","- Light out in hallway B","Everything stocked"]);
        case "other": return rp(["","Quiet day overall","Busy morning, slower afternoon","Full house! Great energy today",""]);
        default: return "";
      }
    };

    const sections = SECS.map(sid => ({id:sid, content:genSec(sid)}));

    // Extract mentions from @ references in content
    // Build a lookup of all known "DogName LastName" strings for fast matching
    const knownNames = dogs.map(dg => {
      const cl = clients.find(c => c.id === dg.clientId);
      return { name: (dg.fields.name + " " + (cl ? cl.fields.last_name : "")).trim(), dog: dg, client: cl };
    });
    const mentions = [];
    let mIdx = 1;
    sections.forEach(sec => {
      knownNames.forEach(({ name, dog: dg, client: cl }) => {
        if (sec.content.includes("@" + name)) {
          mentions.push({
            id: "em" + dt.replace(/-/g,"") + "_" + (mIdx++),
            entityType: "dog",
            entityId: dg.id,
            entityName: name,
            sectionId: sec.id,
            createdAt: dt + "T" + String(ri(7,18)).padStart(2,"0") + ":" + String(ri(0,59)).padStart(2,"0") + ":00"
          });
        }
      });
    });

    const locked = off < -1;
    const history = [{ ts: dt+"T07:00:00", action: "Created from template" }];
    if (locked) history.push({ ts: dt+"T18:30:00", action: "Locked by Manager" });
    if (srand()>0.6) history.push({ ts: dt+"T"+String(ri(10,16)).padStart(2,"0")+":"+String(ri(0,59)).padStart(2,"0")+":00", action: "Edited by Staff" });

    eodEntries.push({ type:"eod", date:dt, locked, sections, mentions, history });
  }

  // Generate daily ops entries for last 3 days
  const dailyOps = [];
  for (let d = -3; d < 0; d++) {
    const dd = new Date(today); dd.setDate(dd.getDate() + d); const ddt = dd.toISOString().slice(0,10);
    const dayOfWk = dd.getDay();
    ["opening","closing"].forEach(type => {
      const tmpl = type === "opening" ? DEF_OPENING_TEMPLATE : DEF_CLOSING_TEMPLATE;
      const its = {}; tmpl.forEach(t => { its[t.id] = { checked: srand() > 0.15, initials: ["ZN","JD","KM"][Math.floor(srand()*3)] }; });
      dailyOps.push({ id:`ops_${type}_${ddt}`, type, date:ddt, locked:true, items:its, completedBy:["Zack","Jackie","Kim"][Math.floor(srand()*3)] });
    });
    ["fe","be"].forEach(type => {
      const tmpl = type === "fe" ? DEF_FE_TEMPLATE : DEF_BE_TEMPLATE;
      const todayTmpl = tmpl.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayOfWk);
      const its = {}; todayTmpl.forEach(t => { its[t.id] = { checked: srand() > 0.2, initials: ["ZN","JD","KM"][Math.floor(srand()*3)] }; });
      dailyOps.push({ id:`ops_${type}_${ddt}`, type, date:ddt, locked:true, items:its, completedBy:["Zack","Jackie","Kim"][Math.floor(srand()*3)] });
    });
  }

  // Generate demo messages
  function generateDemoMessages(cls, dgs, ress) {
    const msgs = [];
    const now = new Date();
    const phrases = ["Hi! I wanted to confirm our reservation for next week.","Can we add an extra night to our booking?","What time should we arrive for check-in?","Thank you so much! The dogs loved it!","Do you have availability this weekend?","Can you send me an updated invoice?"];
    const outPhrases = ["Of course! We'd be happy to help with that.","Your reservation has been confirmed. See you soon!","Check-in is between 7-10 AM. Looking forward to seeing you!","We're so glad to hear that! We loved having them.","Let me check availability and get back to you shortly.","Invoice has been sent to your email. Let us know if you have questions!"];
    const recent = cls.slice(0, 8);
    recent.forEach((c, ci) => {
      const numMsgs = 2 + Math.floor(srand() * 4);
      for (let i = 0; i < numMsgs; i++) {
        const isInbound = i % 2 === 0;
        const minsAgo = Math.floor(srand() * 10080) + (ci * 1440);
        const ts = new Date(now.getTime() - minsAgo * 60000);
        msgs.push({ id: gid(), clientId: c.id, direction: isInbound ? "inbound" : "outbound", channel: "sms", body: isInbound ? phrases[Math.floor(srand() * phrases.length)] : outPhrases[Math.floor(srand() * outPhrases.length)], timestamp: ts.toISOString(), status: isInbound ? "received" : "sent", twilioSid: null, templateId: null, readAt: (isInbound && srand() > 0.3) ? ts.toISOString() : null });
      }
    });
    return msgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Generate demo payments
  function generateDemoPayments(cls, ress) {
    const pmts = []; const staff = ["Zack", "Jackie", "Kim"];
    ress.forEach(r => {
      if (srand() > 0.4) {
        const client = cls.find(c => c.id === r.clientId);
        if (!client) return;
        const checkIn = new Date(r.checkIn);
        if (srand() > 0.3) {
          const depDate = new Date(checkIn.getTime() - 86400000 * Math.floor(srand() * 7 + 1));
          const depAmt = Math.round((r.totalPrice || 150) * 0.5 * 100) / 100;
          pmts.push({ id: gid(), reservationId: r.id, clientId: r.clientId, amount: depAmt, type: "deposit", method: srand() > 0.3 ? "card" : "cash", cardLast4: srand() > 0.3 ? String(1000 + Math.floor(srand() * 9000)) : null, status: "completed", note: "Deposit for reservation", timestamp: depDate.toISOString(), stripePaymentIntentId: null, stripeRefundId: null, processedBy: staff[Math.floor(srand() * staff.length)] });
          if (srand() > 0.4) {
            const balAmt = Math.round(((r.totalPrice || 150) - depAmt) * 100) / 100;
            const tip = srand() > 0.6 ? Math.round(srand() * 20 * 100) / 100 : 0;
            pmts.push({ id: gid(), reservationId: r.id, clientId: r.clientId, amount: balAmt + tip, type: "payment", method: srand() > 0.5 ? "card" : "cash", cardLast4: srand() > 0.5 ? String(1000 + Math.floor(srand() * 9000)) : null, status: "completed", note: tip > 0 ? `Balance + $${tip.toFixed(2)} tip` : "Balance payment", timestamp: checkIn.toISOString(), stripePaymentIntentId: null, stripeRefundId: null, processedBy: staff[Math.floor(srand() * staff.length)] });
          }
        } else {
          const tip = srand() > 0.5 ? Math.round(srand() * 25 * 100) / 100 : 0;
          pmts.push({ id: gid(), reservationId: r.id, clientId: r.clientId, amount: (r.totalPrice || 150) + tip, type: "payment", method: srand() > 0.4 ? "card" : (srand() > 0.5 ? "cash" : "check"), cardLast4: srand() > 0.4 ? String(1000 + Math.floor(srand() * 9000)) : null, status: "completed", note: tip > 0 ? `Full payment + $${tip.toFixed(2)} tip` : "Full payment", timestamp: checkIn.toISOString(), stripePaymentIntentId: null, stripeRefundId: null, processedBy: staff[Math.floor(srand() * staff.length)] });
        }
      }
    });
    return pmts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  return {
    clients, dogs, reservations,
    clientFields: DEF_CLIENT_FIELDS,
    dogFields: DEF_DOG_FIELDS,
    agreements: DEF_AGREEMENTS,
    dogTags: DEF_DOG_TAGS,
    requiredVaccines: DEF_REQUIRED_VACCINES,
    facilitySettings: { largeDogDaycareSF: 3600, smallDogDaycareSF: 2400 },
    hotkeySettings: { enabled: false, showHints: false },
    rooms: ROOMS,
    crmEntries: [],
    evaluations: evalRecords,
    eodEntries,
    eodTemplate: DEF_EOD_TEMPLATE,
    dailyOps,
    pricing: { ...DEF_PRICING },
    breedOptions: DEF_BREED_OPTIONS,
    feedingTimeOptions: DEF_FEEDING_TIME_OPTIONS,
    feedingUnitOptions: DEF_FEEDING_UNIT_OPTIONS,
    foodTypeOptions: DEF_FOOD_TYPE_OPTIONS,
    feedingInstructionOptions: DEF_FEEDING_INSTRUCTION_OPTIONS,
    medicationUnitOptions: DEF_MEDICATION_UNIT_OPTIONS,
    medicationTimeOptions: DEF_MEDICATION_TIME_OPTIONS,
    medicationNameOptions: DEF_MEDICATION_NAME_OPTIONS,
    medicationInstructionOptions: DEF_MEDICATION_INSTRUCTION_OPTIONS,
    bathTypeOptions: DEF_BATH_TYPE_OPTIONS,
    messages: generateDemoMessages(clients, dogs, reservations),
    messageTemplates: [
      { id: gid(), name: "Booking Confirmation", body: "Hi {clientName}! Your reservation for {dogName} has been confirmed. Check-in: {checkInDate}, Check-out: {checkOutDate}. Room: {roomType}. Total: ${totalPrice}. See you soon!", active: true },
      { id: gid(), name: "Check-in Reminder", body: "Hi {clientName}! Just a reminder that {dogName} is scheduled for check-in tomorrow ({checkInDate}). Please arrive between 7-10 AM. Don't forget vaccination records!", active: true },
      { id: gid(), name: "Ready for Pickup", body: "Hi {clientName}! {dogName} is all ready for pickup! We had a great time with them. You can pick up anytime before 6 PM today.", active: true },
      { id: gid(), name: "Thank You", body: "Thank you for choosing K9 Operations, {clientName}! We loved having {dogName} stay with us. We'd appreciate a review if you have a moment. See you next time!", active: true },
    ],
    packages: [
      { id: "pkg_1", name: "10-Night Luxury Suite", description: "Save on boarding stays", serviceCategory: "Boarding", serviceName: "Luxury Suite", quantity: 10, pricingMode: "discount-pct", discountPct: 15, packagePrice: 807.50, retailValue: 950.00, unitPrice: 95, savings: 142.50, savingsPerUnit: 14.25, expirationType: "relative", expirationDays: 365, availableOnline: true },
      { id: "pkg_2", name: "20-Day Daycare Pass", description: "Full day daycare bundle", serviceCategory: "Daycare", serviceName: "Full Day Daycare", quantity: 20, pricingMode: "discount-pct", discountPct: 20, packagePrice: 720, retailValue: 900, unitPrice: 45, savings: 180, savingsPerUnit: 9, expirationType: "relative", expirationDays: 180, availableOnline: true },
      { id: "pkg_3", name: "5-Night Executive Stay", description: "Executive room package", serviceCategory: "Boarding", serviceName: "Executive Room", quantity: 5, pricingMode: "discount-dollar", discountDollar: 50, packagePrice: 325, retailValue: 375, unitPrice: 75, savings: 50, savingsPerUnit: 10, expirationType: "relative", expirationDays: 120, availableOnline: false },
    ],
    packageSales: (() => {
      const sales = [];
      if (clients.length >= 3) {
        sales.push({ id: gid(), packageId: "pkg_1", clientId: clients[0].id, quantity: 10, used: 3, purchaseDate: new Date(Date.now() - 45 * 86400000).toISOString().slice(0,10), packageName: "10-Night Luxury Suite" });
        sales.push({ id: gid(), packageId: "pkg_2", clientId: clients[0].id, quantity: 20, used: 8, purchaseDate: new Date(Date.now() - 60 * 86400000).toISOString().slice(0,10), packageName: "20-Day Daycare Pass" });
        sales.push({ id: gid(), packageId: "pkg_2", clientId: clients[1].id, quantity: 20, used: 12, purchaseDate: new Date(Date.now() - 90 * 86400000).toISOString().slice(0,10), packageName: "20-Day Daycare Pass" });
        sales.push({ id: gid(), packageId: "pkg_3", clientId: clients[2].id, quantity: 5, used: 1, purchaseDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10), packageName: "5-Night Executive Stay" });
        if (clients.length >= 5) {
          sales.push({ id: gid(), packageId: "pkg_1", clientId: clients[4].id, quantity: 10, used: 7, purchaseDate: new Date(Date.now() - 120 * 86400000).toISOString().slice(0,10), packageName: "10-Night Luxury Suite" });
        }
      }
      return sales;
    })(),
    payments: generateDemoPayments(clients, reservations),
    pendingInvites: [],
    roles: DEFAULT_ROLES,
    attendanceRoster: (() => {
      const demoStaff = [
        { name: "Sarah Mitchell", title: "General Manager", phone: "555-100-0001", email: "sarah.mitchell@k9demo.com", startDate: "2024-03-15" },
        { name: "James Park", title: "Assistant Manager", phone: "555-100-0002", email: "james.park@k9demo.com", startDate: "2024-06-01" },
        { name: "Emily Rodriguez", title: "Supervisor", phone: "555-100-0003", email: "emily.rodriguez@k9demo.com", startDate: "2024-08-20" },
        { name: "Tyler Brooks", title: "Supervisor", phone: "555-100-0004", email: "tyler.brooks@k9demo.com", startDate: "2024-09-10" },
        { name: "Megan Foster", title: "Customer Service Representative", phone: "555-100-0005", email: "megan.foster@k9demo.com", startDate: "2024-11-01" },
        { name: "David Kim", title: "Customer Service Representative", phone: "555-100-0006", email: "david.kim@k9demo.com", startDate: "2025-01-15" },
        { name: "Ashley Nguyen", title: "Pet Care Technician", phone: "555-100-0007", email: "ashley.nguyen@k9demo.com", startDate: "2025-02-01" },
        { name: "Brandon Torres", title: "Pet Care Technician", phone: "555-100-0008", email: "brandon.torres@k9demo.com", startDate: "2025-03-10" },
        { name: "Jessica Wang", title: "Pet Care Technician", phone: "555-100-0009", email: "jessica.wang@k9demo.com", startDate: "2025-04-22" },
        { name: "Chris Martinez", title: "Pet Care Technician", phone: "555-100-0010", email: "chris.martinez@k9demo.com", startDate: "2025-06-15" },
        { name: "Lauren Hughes", title: "Pet Care Technician", phone: "555-100-0011", email: "lauren.hughes@k9demo.com", startDate: "2025-08-01" },
        { name: "Ryan Cooper", title: "Pet Care Technician", phone: "555-100-0012", email: "ryan.cooper@k9demo.com", startDate: "2025-10-05", endDate: "2026-01-20" },
      ];
      return demoStaff.map((s, i) => ({ id: "ar_demo_" + (i + 1), ...s }));
    })(),
    attendanceEntries: (() => {
      const demoEntries = [
        { name: "Brandon Torres", type: "Late Call Out (<2 hrs)", date: "2026-02-16", coverage: "No", notes: "Notified at 9:45 AM for a 10 AM shift. Car trouble.", loggedBy: "SM" },
        { name: "James Park", type: "Early Release", date: "2026-02-18", coverage: "No", notes: "Family emergency. Left at 8:45 AM from a double shift.", loggedBy: "SM" },
        { name: "Megan Foster", type: "Late Call Out (<2 hrs)", date: "2026-02-18", coverage: "No", notes: "Called at 6:50 AM for 7 AM shift.", loggedBy: "SM" },
        { name: "Jessica Wang", type: "Late Call Out (<2 hrs)", date: "2026-02-19", coverage: "No", notes: "Woke up sick, called 30 min before shift.", loggedBy: "JP" },
        { name: "Lauren Hughes", type: "Call Out (2+ hrs)", date: "2026-02-23", coverage: "No", notes: "Doctor appointment, notified day before.", loggedBy: "JP" },
        { name: "Ashley Nguyen", type: "Tardy", date: "2026-02-20", coverage: "No", notes: "Arrived 12 minutes late. Traffic.", loggedBy: "ER" },
        { name: "Chris Martinez", type: "No Call / No Show", date: "2026-02-14", coverage: "No", notes: "Did not report and did not contact anyone.", loggedBy: "SM" },
        { name: "Chris Martinez", type: "Tardy", date: "2026-02-21", coverage: "No", notes: "8 minutes late.", loggedBy: "TB" },
        { name: "Tyler Brooks", type: "Call Out (2+ hrs)", date: "2026-02-10", coverage: "Yes", notes: "Sick, found coverage from Emily.", loggedBy: "SM" },
        { name: "David Kim", type: "Tardy", date: "2026-02-12", coverage: "No", notes: "Arrived 6 minutes late.", loggedBy: "JP" },
      ];
      return demoEntries.map((e, i) => ({ id: "ae_demo_" + (i + 1), ...e, createdAt: new Date(e.date + "T12:00:00").toISOString() }));
    })(),
  };
}

const DEMO = generateDemoData();

// Structural defaults for new locations — everything EXCEPT demo data (clients/dogs/reservations)
const NEW_LOCATION_DEFAULTS = {
  clients: [], dogs: [], reservations: [], messages: [], teamMembers: [],
  packages: [], packageSales: [], crmEntries: [], eodEntries: [], dailyOps: [],
  evaluations: [], onlineBookings: [], payments: [], auditLog: [], closedDates: [],
  pendingInvites: [], attendanceRoster: [], attendanceEntries: [], attendanceAuditLog: [],
  clientFields: DEF_CLIENT_FIELDS, dogFields: DEF_DOG_FIELDS,
  agreements: DEF_AGREEMENTS, dogTags: DEF_DOG_TAGS,
  requiredVaccines: DEF_REQUIRED_VACCINES,
  facilitySettings: { largeDogDaycareSF: 3600, smallDogDaycareSF: 2400 },
  hotkeySettings: { enabled: false, showHints: false },
  rooms: { "Luxury Suite":["101","102","103","104","105","106"], "Executive Room":["201","202","203","204","205","206","207","208","209","210","211","212","213","214","215"], "Double Compartment":["DC1","DC2","DC3","DC4","DC5","DC6","DC7","DC8","DC9"], "Single Compartment":["SC1","SC2","SC3","SC4","SC5","SC6","SC7","SC8","SC9","SC10","SC11","SC12","SC13","SC14","SC15","SC16","SC17","SC18"] },
  pricing: { ...DEF_PRICING },
  eodTemplate: DEF_EOD_TEMPLATE,
  breedOptions: DEF_BREED_OPTIONS,
  feedingTimeOptions: DEF_FEEDING_TIME_OPTIONS,
  feedingUnitOptions: DEF_FEEDING_UNIT_OPTIONS,
  foodTypeOptions: DEF_FOOD_TYPE_OPTIONS,
  feedingInstructionOptions: DEF_FEEDING_INSTRUCTION_OPTIONS,
  medicationUnitOptions: DEF_MEDICATION_UNIT_OPTIONS,
  medicationTimeOptions: DEF_MEDICATION_TIME_OPTIONS,
  medicationNameOptions: DEF_MEDICATION_NAME_OPTIONS,
  medicationInstructionOptions: DEF_MEDICATION_INSTRUCTION_OPTIONS,
  bathTypeOptions: DEF_BATH_TYPE_OPTIONS,
  messageTemplates: [
    { id: "mt1", name: "Booking Confirmation", body: "Hi {clientName}! Your reservation for {dogName} has been confirmed. Check-in: {checkInDate}, Check-out: {checkOutDate}. Room: {roomType}. Total: ${totalPrice}. See you soon!", active: true },
    { id: "mt2", name: "Check-in Reminder", body: "Hi {clientName}! Just a reminder that {dogName} is scheduled for check-in tomorrow ({checkInDate}). Please arrive between 7-10 AM. Don't forget vaccination records!", active: true },
    { id: "mt3", name: "Ready for Pickup", body: "Hi {clientName}! {dogName} is all ready for pickup! We had a great time with them. You can pick up anytime before 6 PM today.", active: true },
    { id: "mt4", name: "Thank You", body: "Thank you for choosing K9 Operations, {clientName}! We loved having {dogName} stay with us. We'd appreciate a review if you have a moment. See you next time!", active: true },
  ],
  roles: DEFAULT_ROLES,
  openingTemplate: DEF_OPENING_TEMPLATE,
  feTemplate: DEF_FE_TEMPLATE,
  beTemplate: DEF_BE_TEMPLATE,
  closingTemplate: DEF_CLOSING_TEMPLATE,
  runCardConfig: {},
  runCardTemplates: [],
  automations: { enabled: false, dailyCap: 50, tiers: [], reminderLog: [] },
  resortInfo: {},
  _initialized: true,
};

export { generateDemoData, DEMO, NEW_LOCATION_DEFAULTS };
