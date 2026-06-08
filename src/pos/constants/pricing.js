// ─── Default Pricing ─────────────────────────────────────────────────────────
const DEF_PRICING = {
  // Boarding per night by room type
  boardingRates: {
    "Luxury Suite": 95,
    "Executive Room": 75,
    "Double Compartment": 65,
    "Single Compartment": 55,
  },
  // Daycare per day
  daycareRates: { fullDay: 45, halfDay: 30 },
  // Evaluation & Tour
  dayboardingRate: 49,
  evaluationFee: 25,
  tourFee: 0,
  medicationAdminFee: 5, // per dose per day
  specialFeedingFee: 8, // per day (resort-provided food)
  // Food type per-serving pricing
  foodTypePricing: {
    "Food From Home - Bagged": 3,
    "Food From Home - Unbagged": 5,
    "Blue Buffalo GI Vet-Grade (Chicken)": 0,
    "Blue Buffalo HF Vet-Grade (Salmon)": 0,
  },
  // Medication per-serving pricing
  medPricing: {
    "Bagged": 3,
    "Unbagged": 5,
  },
  // All add-ons (per stay) — includes bathing, food handling, meds, extras
  addOns: {
    "Standard Bath": 30,
    "Hypo Bath": 30,
    "Medicated Bath": 30,
    "Whitening Bath": 30,
    "Fresh N' Clean Bath": 30,
    "Evian Spring Water": 4,
    "Upgraded Dog Bed": 12,
    "Extra Personal Playtime": 15,
    "Gourmet Doggie Ice Cream": 4,
  },
  // Surcharges
  privatePlaySurcharge: 10, // $/night for Private Play dogs
  // Discount rules
  multiDogDiscount: 20, // % off 2nd dog same room same owner
  // Payment rules
  paymentRules: {
    boarding: { depositPercent: 50, depositRefundable: false, payAt: "booking" },
    daycare: { depositPercent: 0, depositRefundable: false, payAt: "checkout" },
    evaluation: { depositPercent: 100, depositRefundable: false, payAt: "booking" },
    tour: { depositPercent: 0, depositRefundable: false, payAt: "free" },
  },
  // Half-day threshold (hours)
  halfDayThreshold: 5,
};

export { DEF_PRICING };
