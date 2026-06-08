// ─── Default Field Configs ──────────────────────────────────────────────────
const DEF_CLIENT_FIELDS = [
  { id:"phone",name:"Phone Number",type:"tel",requiredFor:["create"],isKey:true,locked:true,order:0 },
  { id:"first_name",name:"First Name",type:"text",requiredFor:["tour"],locked:false,order:1 },
  { id:"last_name",name:"Last Name",type:"text",requiredFor:["tour"],locked:false,order:2 },
  { id:"email",name:"Email",type:"email",requiredFor:["eval"],locked:false,order:3 },
  { id:"street",name:"Street Address",type:"text",requiredFor:[],locked:false,order:4 },
  { id:"city",name:"City",type:"text",requiredFor:[],locked:false,order:5 },
  { id:"state",name:"State",type:"text",requiredFor:[],locked:false,order:6 },
  { id:"zip",name:"Zip Code",type:"text",requiredFor:[],locked:false,order:7 },
  { id:"emergency_contact",name:"Emergency Contact",type:"text",requiredFor:[],locked:false,order:8 },
  { id:"emergency_phone",name:"Emergency Phone",type:"tel",requiredFor:[],locked:false,order:9 },
  { id:"notes",name:"Notes",type:"textarea",requiredFor:[],locked:false,order:10 },
  { id:"referral_source",name:"Referral Source",type:"select",requiredFor:[],locked:false,order:11,options:["Friend/Family","Google","Social Media","Website","Walk-In","Vet Referral","Other"] },
];

const DEF_DOG_FIELDS = [
  { id:"name",name:"Dog Name",type:"text",requiredFor:["tour"],locked:true,order:0 },
  { id:"breed",name:"Breed",type:"text",requiredFor:["eval"],locked:true,order:1 },
  { id:"weight",name:"Weight (lbs)",type:"number",requiredFor:["reservation"],locked:false,order:2 },
  { id:"dob",name:"Date of Birth",type:"date",requiredFor:[],locked:false,order:3 },
  { id:"sex",name:"Sex",type:"select",options:["Male","Female"],requiredFor:["reservation"],locked:true,order:4 },
  { id:"spayed_neutered",name:"Spayed/Neutered",type:"select",options:["Neutered","Spayed","Intact"],requiredFor:["reservation"],locked:true,order:5 },
  { id:"color",name:"Color/Markings",type:"text",requiredFor:[],locked:false,order:6 },
  { id:"bath_type",name:"Preferred Bath Type",type:"select",options:["Standard","Hypo","Medicated","Whitening"],requiredFor:[],locked:true,order:7 },
  { id:"temperament",name:"Temperament Notes",type:"textarea",requiredFor:[],locked:false,order:8 },
  { id:"rabies_exp",name:"Rabies Expiration",type:"date",requiredFor:["reservation"],locked:false,order:9 },
  { id:"bordetella_exp",name:"Bordetella Expiration",type:"date",requiredFor:["reservation"],locked:false,order:10 },
  { id:"dhpp_exp",name:"DHPP Expiration",type:"date",requiredFor:["reservation"],locked:false,order:11 },
  { id:"canine_flu_exp",name:"Canine Influenza Exp.",type:"date",requiredFor:["reservation"],locked:false,order:12 },
];

export { DEF_CLIENT_FIELDS, DEF_DOG_FIELDS };
