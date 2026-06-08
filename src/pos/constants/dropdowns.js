// ─── Configurable Dropdown Defaults ─────────────────────────────────────────
const DEF_BREED_OPTIONS = [
  "Unknown / Not Sure","Mixed Breed","Affenpinscher","Afghan Hound","Airedale Terrier","Akita","Alaskan Malamute",
  "American Bulldog","American Cocker Spaniel","American Eskimo Dog","American Foxhound","American Pit Bull Terrier",
  "American Staffordshire Terrier","American Water Spaniel","Anatolian Shepherd","Australian Cattle Dog",
  "Australian Shepherd","Australian Terrier","Basenji","Basset Hound","Beagle","Bearded Collie",
  "Bedlington Terrier","Belgian Malinois","Belgian Sheepdog","Belgian Tervuren","Bernedoodle",
  "Bernese Mountain Dog","Bichon Frise","Black and Tan Coonhound","Black Russian Terrier","Bloodhound",
  "Bluetick Coonhound","Border Collie","Border Terrier","Borzoi","Boston Terrier","Bouvier des Flandres",
  "Boxer","Boykin Spaniel","Briard","Brittany","Brussels Griffon","Bull Terrier","Bulldog","Bullmastiff",
  "Cairn Terrier","Canaan Dog","Cane Corso","Cardigan Welsh Corgi","Cavalier King Charles Spaniel",
  "Chesapeake Bay Retriever","Chihuahua","Chinese Crested","Chinese Shar-Pei","Chow Chow",
  "Clumber Spaniel","Cockapoo","Cocker Spaniel","Collie","Coonhound","Coton de Tulear",
  "Curly-Coated Retriever","Dachshund","Dalmatian","Dandie Dinmont Terrier","Doberman Pinscher",
  "Dogo Argentino","Dogue de Bordeaux","Dutch Shepherd","English Bulldog","English Cocker Spaniel",
  "English Foxhound","English Setter","English Springer Spaniel","English Toy Spaniel",
  "Entlebucher Mountain Dog","Field Spaniel","Finnish Lapphund","Finnish Spitz","Flat-Coated Retriever",
  "Fox Terrier","French Bulldog","German Pinscher","German Shepherd","German Shorthaired Pointer",
  "German Wirehaired Pointer","Giant Schnauzer","Glen of Imaal Terrier","Golden Retriever","Goldendoodle",
  "Gordon Setter","Great Dane","Great Pyrenees","Greater Swiss Mountain Dog","Greyhound","Harrier",
  "Havanese","Hovawart","Ibizan Hound","Icelandic Sheepdog","Irish Red and White Setter","Irish Setter",
  "Irish Terrier","Irish Water Spaniel","Irish Wolfhound","Italian Greyhound","Jack Russell Terrier",
  "Japanese Chin","Japanese Spitz","Keeshond","Kerry Blue Terrier","Komondor","Kuvasz","Labradoodle",
  "Labrador Retriever","Lagotto Romagnolo","Lakeland Terrier","Leonberger","Lhasa Apso","Maltese",
  "Maltipoo","Manchester Terrier","Mastiff","Miniature Australian Shepherd","Miniature Bull Terrier",
  "Miniature Pinscher","Miniature Poodle","Miniature Schnauzer","Morkie","Neapolitan Mastiff",
  "Newfoundland","Norfolk Terrier","Norwegian Buhund","Norwegian Elkhound","Norwegian Lundehund",
  "Norwich Terrier","Nova Scotia Duck Tolling Retriever","Old English Sheepdog","Otterhound","Papillon",
  "Parson Russell Terrier","Peekapoo","Pekingese","Pembroke Welsh Corgi","Pharaoh Hound","Plott Hound",
  "Pointer","Polish Lowland Sheepdog","Pomeranian","Pomsky","Poodle","Portuguese Water Dog","Pug",
  "Puggle","Puli","Pumi","Rat Terrier","Redbone Coonhound","Rhodesian Ridgeback","Rottweiler",
  "Russell Terrier","Saint Bernard","Saluki","Samoyed","Schipperke","Schnoodle","Scottish Deerhound",
  "Scottish Terrier","Sealyham Terrier","Shetland Sheepdog","Shiba Inu","Shih Tzu","Shih-Poo",
  "Siberian Husky","Silky Terrier","Skye Terrier","Sloughi","Smooth Fox Terrier",
  "Soft Coated Wheaten Terrier","Spanish Water Dog","Spinone Italiano","Staffordshire Bull Terrier",
  "Standard Poodle","Standard Schnauzer","Sussex Spaniel","Swedish Vallhund","Tibetan Mastiff",
  "Tibetan Spaniel","Tibetan Terrier","Toy Fox Terrier","Toy Poodle","Treeing Walker Coonhound",
  "Vizsla","Weimaraner","Welsh Springer Spaniel","Welsh Terrier","West Highland White Terrier",
  "Whippet","Wire Fox Terrier","Wirehaired Pointing Griffon","Xoloitzcuintli","Yorkipoo",
  "Yorkshire Terrier","Other"
];

const DEF_FEEDING_TIME_OPTIONS = ["AM (6:00 am)","Noon (12:00 pm)","PM (6:00 pm)"];
const DEF_FEEDING_UNIT_OPTIONS = ["Cup","1/2 Cup","1/4 Cup","Scoop","Tablespoon","Can","Piece"];
const DEF_FOOD_TYPE_OPTIONS = ["Food From Home - Bagged","Food From Home - Unbagged","Blue Buffalo GI Vet-Grade (Chicken)","Blue Buffalo HF Vet-Grade (Salmon)"];
const DEF_FOOD_SOURCE_OPTIONS = ["From Home","Resort Provided","Prescription"];
const DEF_FEEDING_INSTRUCTION_OPTIONS = ["Regular","Slow Feeder","Hand Fed","Elevated Bowl","Separate from Others","Monitor to Feed"];
const DEF_MEDICATION_UNIT_OPTIONS = ["Tablet","Capsule","mL","Pump","Drop","Scoop"];
const DEF_MEDICATION_TIME_OPTIONS = ["AM (6:00 am)","Noon (12:00 pm)","PM (6:00 pm)"];
const DEF_MEDICATION_NAME_OPTIONS = ["Acepromazine","Amoxicillin","Apoquel","Benadryl","Carprofen","Cephalexin","Cerenia","Clavamox","Clindamycin","Cosequin","Cytopoint","Dasuquin","Denamarin","Deramaxx","Doxycycline","Enrofloxacin","Famotidine","Fish Oil","Fluconazole","Fluoxetine","Gabapentin","Galliprant","Glucosamine","Heartgard","Heart Medication","Hydroxyzine","Joint Supplement","Ketoconazole","Librela","Meloxicam","Metoclopramide","Metronidazole","Omeprazole","Ondansetron","Pepcid","Phenobarbital","Potassium Bromide","Prednisolone","Prednisone","Probiotic","Rimadyl","Sentinel","Simparica Trio","Sucralfate","Thyroid Medication","Tramadol","Trazodone","Vetmedin","Welactin","Zonisamide"];
const DEF_MEDICATION_INSTRUCTION_OPTIONS = ["Give with food","Give on empty stomach","Monitor for lethargy","Crush and mix with food","Do not mix with other meds"];
const DEF_BATH_TYPE_OPTIONS = ["Standard","Hypo","Medicated","Whitening"];

export { DEF_BREED_OPTIONS, DEF_FEEDING_TIME_OPTIONS, DEF_FEEDING_UNIT_OPTIONS, DEF_FOOD_TYPE_OPTIONS, DEF_FOOD_SOURCE_OPTIONS, DEF_FEEDING_INSTRUCTION_OPTIONS, DEF_MEDICATION_UNIT_OPTIONS, DEF_MEDICATION_TIME_OPTIONS, DEF_MEDICATION_NAME_OPTIONS, DEF_MEDICATION_INSTRUCTION_OPTIONS, DEF_BATH_TYPE_OPTIONS };
