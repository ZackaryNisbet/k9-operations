import { B } from '../shared/bookingTheme';

// High-quality Unsplash images for the booking experience
export const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1920&q=85&auto=format',
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920&q=85&auto=format',
  'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=1920&q=85&auto=format',
];

export const ROOM_IMAGES = {
  'Luxury Suite': '/rooms/luxury.jpg?v=2',
  'Executive Room': '/rooms/executive.jpg?v=2',
  'Double Compartment': '/rooms/double.jpg?v=2',
  'Single Compartment': '/rooms/single.jpg?v=2',
};

export const ROOM_INFO = {
  'Luxury Suite': {
    size: "8' × 8'",
    desc: 'Our most spacious cage-free suite featuring Kuranda luxury bedding, flat-screen TV tuned to Dog TV, glass privacy doors, and a sound-resistant environment.',
    features: ['Cage-free', 'Kuranda bed', 'Flat-screen TV', 'Glass privacy doors', 'Sound-resistant', 'Best for families with multiple pets'],
    tier: 4,
  },
  'Executive Room': {
    size: "5' × 7'",
    desc: 'A generous cage-free room with Kuranda bedding, glass privacy doors, and top-of-the-line Snyder enclosures. Ideal for one or two dogs.',
    features: ['Cage-free', 'Kuranda bed', 'Glass privacy doors', 'Snyder enclosures', 'Great for 1-2 dogs'],
    tier: 3,
  },
  'Double Compartment': {
    size: 'Double-wide',
    desc: 'A comfortable compartment with comfort mat bedding, perfect for dogs up to 100 lbs or those who participate in daycare during the day.',
    features: ['Comfort mat bedding', 'Up to 100 lbs', 'Great for daycare dogs', 'Blue Buffalo meals included'],
    tier: 2,
  },
  'Single Compartment': {
    size: 'Standard',
    desc: 'A cozy compartment ideal for smaller dogs under 35 lbs or those who are comfortably crate-trained at home.',
    features: ['Comfort mat bedding', 'Up to 35 lbs', 'Perfect for crate-trained dogs', 'Blue Buffalo meals included'],
    tier: 1,
  },
};

export const ROOM_ORDER = ['Single Compartment', 'Double Compartment', 'Executive Room', 'Luxury Suite'];
export const BATH_OPTIONS = ['Standard Bath', 'Hypo Bath', 'Medicated Bath', 'Whitening Bath'];

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL STYLES (injected once)
// ═══════════════════════════════════════════════════════════════════════════
export const GLOBAL_CSS = `
@font-face{font-family:'Canela';src:url('/fonts/Canela-Bold-Web.woff2') format('woff2'),url('/fonts/Canela-Bold-Web.woff') format('woff');font-weight:700;font-style:normal;font-display:swap}
@font-face{font-family:'Canela';src:url('/fonts/Canela-BoldItalic-Web.woff2') format('woff2'),url('/fonts/Canela-BoldItalic-Web.woff') format('woff');font-weight:700;font-style:italic;font-display:swap}
@font-face{font-family:'GT Eesti';src:url('/fonts/GT-Eesti-Text-Light.otf') format('opentype');font-weight:300;font-style:normal;font-display:swap}
@font-face{font-family:'GT Eesti';src:url('/fonts/GT-Eesti-Text-Medium.otf') format('opentype');font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:'GT Eesti';src:url('/fonts/GT-Eesti-Text-Bold.otf') format('opentype');font-weight:700;font-style:normal;font-display:swap}
@font-face{font-family:'GT Eesti Display';src:url('/fonts/GT-Eesti-Display-Medium.otf') format('opentype');font-weight:500;font-style:normal;font-display:swap}

*{margin:0;padding:0;box-sizing:border-box}
html,body{overflow-x:hidden;scroll-behavior:smooth}
body{font-family:'GT Eesti',system-ui,-apple-system,sans-serif;background:${B.bg};color:${B.text};-webkit-font-smoothing:antialiased}

/* Page transition container */
.bk-page-container{position:relative;width:100%;min-height:100vh;overflow:hidden}
.bk-page{position:absolute;top:0;left:0;width:100%;min-height:100vh;will-change:transform,opacity}

/* Slide transitions */
.bk-slide-enter-right{animation:slideInRight .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-exit-left{animation:slideOutLeft .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-enter-left{animation:slideInLeft .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-exit-right{animation:slideOutRight .65s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-enter-up{animation:slideInUp .7s cubic-bezier(.16,1,.3,1) forwards}
.bk-slide-exit-down{animation:slideOutDown .7s cubic-bezier(.16,1,.3,1) forwards}

@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOutLeft{from{transform:translateX(0);opacity:1}to{transform:translateX(-100%);opacity:0}}
@keyframes slideInLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOutRight{from{transform:translateX(0);opacity:1}to{transform:translateX(-100%);opacity:0}}
@keyframes slideInUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes slideOutDown{from{transform:translateY(0);opacity:1}to{transform:translateY(-100%);opacity:0}}

/* Fade in animations */
.bk-fade-in{animation:bkFadeIn .8s ease forwards}
.bk-fade-up{animation:bkFadeUp .8s cubic-bezier(.16,1,.3,1) forwards;opacity:0}
.bk-fade-up-d1{animation-delay:.1s}
.bk-fade-up-d2{animation-delay:.2s}
.bk-fade-up-d3{animation-delay:.3s}
.bk-fade-up-d4{animation-delay:.4s}
.bk-fade-up-d5{animation-delay:.5s}
.bk-fade-up-d6{animation-delay:.6s}

@keyframes bkFadeIn{from{opacity:0}to{opacity:1}}
@keyframes bkFadeUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}

/* Scale in for cards */
.bk-scale-in{animation:bkScaleIn .6s cubic-bezier(.16,1,.3,1) forwards;opacity:0}
@keyframes bkScaleIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}

/* Smooth question transitions */
.bk-question-enter{animation:questionEnter .5s cubic-bezier(.16,1,.3,1) forwards}
.bk-question-exit{animation:questionExit .3s ease forwards}
@keyframes questionEnter{from{opacity:0;transform:translateY(30px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes questionExit{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-20px)}}

/* Parallax hero */
.bk-hero{position:relative;height:100vh;overflow:hidden;display:flex;align-items:center;justify-content:center}
.bk-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;transition:opacity 1.5s ease;pointer-events:none}
.bk-hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,52,98,.45) 0%,rgba(0,52,98,.85) 100%);pointer-events:none}

/* Scroll reveal */
.bk-reveal{opacity:0;transform:translateY(50px);transition:all .9s cubic-bezier(.16,1,.3,1)}.bk-reveal.visible{opacity:1;transform:none}

/* Gold underline accent */
.bk-gold-line{width:60px;height:3px;background:${B.gold};margin:0 auto;border-radius:2px}

/* Button styles */
.bk-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:600;font-family:'GT Eesti',sans-serif;cursor:pointer;transition:all .3s cubic-bezier(.16,1,.3,1);border:none;text-decoration:none;letter-spacing:.02em}
.bk-btn:active{transform:scale(.97)}
.bk-btn-primary{background:${B.gold};color:#fff}.bk-btn-primary:hover{background:${B.goldLight};transform:translateY(-2px);box-shadow:0 8px 30px rgba(175,141,84,.35)}
.bk-btn-navy{background:${B.navy};color:#fff}.bk-btn-navy:hover{background:${B.navyLight};transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,52,98,.35)}
.bk-btn-outline{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.6)}.bk-btn-outline:hover{border-color:#fff;background:rgba(255,255,255,.1);transform:translateY(-2px)}
.bk-btn-ghost{background:rgba(255,255,255,.1);color:#fff;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.2)}.bk-btn-ghost:hover{background:rgba(255,255,255,.2);transform:translateY(-2px)}
.bk-btn-gold-outline{background:transparent;color:${B.gold};border:2px solid ${B.gold}}.bk-btn-gold-outline:hover{background:${B.goldPale};transform:translateY(-2px)}

/* Room card */
.bk-room-card{background:#fff;border-radius:20px;overflow:hidden;transition:all .4s cubic-bezier(.16,1,.3,1);cursor:pointer;border:2px solid transparent;position:relative}
.bk-room-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(0,0,0,.12)}
.bk-room-card.selected{border-color:${B.gold};box-shadow:0 0 0 3px ${B.gold}30}
.bk-room-card.disabled{opacity:.45;pointer-events:none;filter:grayscale(.3)}
.bk-room-card .bk-rec-badge{position:absolute;top:16px;right:16px;background:${B.gold};color:#fff;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;z-index:2;box-shadow:0 4px 15px rgba(175,141,84,.4)}

/* Floating input */
.bk-input{width:100%;padding:14px 18px;border:2px solid ${B.border};border-radius:12px;font-size:16px;font-family:'GT Eesti',sans-serif;color:${B.text};background:#fff;outline:none;transition:border .2s,box-shadow .2s}
.bk-input:focus{border-color:${B.navy};box-shadow:0 0 0 3px ${B.navy}15}
.bk-input::placeholder{color:${B.textMut}}
.bk-label{display:block;font-size:13px;font-weight:600;color:${B.textSec};margin-bottom:6px;letter-spacing:.03em}

/* Hero image carousel indicator */
.bk-hero-dots{display:flex;gap:8px;position:absolute;bottom:32px;left:50%;transform:translateX(-50%);z-index:5}
.bk-hero-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.4);transition:all .3s}.bk-hero-dot.active{background:#fff;transform:scale(1.2)}

/* CTA card on hero */
.bk-cta-card{background:rgba(0,30,60,.82);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:28px 32px;cursor:pointer;transition:all .4s cubic-bezier(.16,1,.3,1);text-align:left;min-width:280px}
.bk-cta-card:hover{background:rgba(0,36,72,.92);transform:translateY(-4px);border-color:rgba(255,255,255,.4);box-shadow:0 20px 60px rgba(0,0,0,.3)}

/* Scrollbar */
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${B.border};border-radius:3px}::-webkit-scrollbar-thumb:hover{background:${B.textMut}}

/* Selection chip */
.bk-chip{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:14px;border:2px solid ${B.border};background:#fff;font-size:16px;font-weight:600;font-family:'GT Eesti',sans-serif;color:${B.text};cursor:pointer;transition:all .25s cubic-bezier(.16,1,.3,1)}
.bk-chip:hover{border-color:${B.gold};background:${B.goldPale};transform:translateY(-2px)}
.bk-chip.selected{border-color:${B.gold};background:${B.goldPale};color:${B.navy};box-shadow:0 4px 15px ${B.gold}25}

/* Feature badge */
.bk-feature{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;background:${B.bg};font-size:12px;color:${B.textSec};font-weight:500}

/* Progress dots */
.bk-progress{display:flex;align-items:center;gap:4px}.bk-progress-dot{width:8px;height:8px;border-radius:50%;background:${B.border};transition:all .3s}.bk-progress-dot.active{background:${B.gold};width:24px;border-radius:4px}.bk-progress-dot.done{background:${B.gold}}

/* Add-on card */
.bk-addon-card{background:#fff;border:2px solid ${B.border};border-radius:16px;padding:20px;transition:all .3s;cursor:pointer}
.bk-addon-card:hover{border-color:${B.gold};transform:translateY(-2px)}.bk-addon-card.added{border-color:${B.suc};background:${B.suc}08}

@media(max-width:768px){
  .bk-btn{padding:14px 28px;font-size:15px}
  .bk-cta-card{min-width:auto;padding:20px 24px}
  .bk-input{font-size:16px !important}
  .bk-page [style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr !important}
  .bk-page [style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
}
@media(max-width:480px){
  .bk-btn{padding:12px 20px;font-size:14px;width:100%}
  .bk-cta-card{padding:16px 18px}
  .bk-addon-card{padding:14px}
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// BREED SEARCH DROPDOWN (matches internal app's BreedSearch)
// ═══════════════════════════════════════════════════════════════════════════
export const DEF_BREEDS = [
  "Unknown / Not Sure","Mixed Breed","Affenpinscher","Afghan Hound","Airedale Terrier","Akita","Alaskan Malamute",
  "American Bulldog","American Cocker Spaniel","American Eskimo Dog","American Pit Bull Terrier",
  "American Staffordshire Terrier","Australian Cattle Dog","Australian Shepherd","Australian Terrier",
  "Basenji","Basset Hound","Beagle","Bearded Collie","Belgian Malinois","Bernedoodle",
  "Bernese Mountain Dog","Bichon Frise","Bloodhound","Border Collie","Border Terrier","Boston Terrier",
  "Boxer","Brittany","Brussels Griffon","Bull Terrier","Bulldog","Bullmastiff",
  "Cairn Terrier","Cane Corso","Cardigan Welsh Corgi","Cavalier King Charles Spaniel",
  "Chesapeake Bay Retriever","Chihuahua","Chinese Crested","Chinese Shar-Pei","Chow Chow",
  "Cockapoo","Cocker Spaniel","Collie","Coton de Tulear","Dachshund","Dalmatian",
  "Doberman Pinscher","Dogo Argentino","Dogue de Bordeaux","Dutch Shepherd",
  "English Bulldog","English Cocker Spaniel","English Setter","English Springer Spaniel",
  "Finnish Spitz","Flat-Coated Retriever","Fox Terrier","French Bulldog",
  "German Pinscher","German Shepherd","German Shorthaired Pointer","Giant Schnauzer",
  "Golden Retriever","Goldendoodle","Gordon Setter","Great Dane","Great Pyrenees","Greyhound",
  "Havanese","Ibizan Hound","Icelandic Sheepdog","Irish Setter","Irish Terrier",
  "Irish Water Spaniel","Irish Wolfhound","Italian Greyhound","Jack Ashford Terrier",
  "Japanese Chin","Keeshond","Kerry Blue Terrier","Labradoodle","Labrador Retriever",
  "Leonberger","Lhasa Apso","Maltese","Maltipoo","Mastiff",
  "Miniature Australian Shepherd","Miniature Pinscher","Miniature Poodle","Miniature Schnauzer",
  "Morkie","Newfoundland","Norfolk Terrier","Norwegian Elkhound","Norwich Terrier",
  "Nova Scotia Duck Tolling Retriever","Old English Sheepdog","Papillon","Peekapoo",
  "Pekingese","Pembroke Welsh Corgi","Pointer","Pomeranian","Pomsky","Poodle",
  "Portuguese Water Dog","Pug","Puggle","Rat Terrier","Rhodesian Ridgeback","Rottweiler",
  "Saint Bernard","Saluki","Samoyed","Schnoodle","Ellisonish Terrier","Shetland Sheepdog",
  "Shiba Inu","Shih Tzu","Shih-Poo","Siberian Husky","Silky Terrier",
  "Soft Coated Wheaten Terrier","Staffordshire Bull Terrier","Standard Poodle","Standard Schnauzer",
  "Tibetan Mastiff","Tibetan Spaniel","Tibetan Terrier","Toy Fox Terrier","Toy Poodle",
  "Vizsla","Weimaraner","Welsh Springer Spaniel","Welsh Terrier","West Highland White Terrier",
  "Whippet","Wire Fox Terrier","Xoloitzcuintli","Yorkipoo","Yorkshire Terrier","Other"
];
