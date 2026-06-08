const BB_CHART = {
  "Blue Buffalo GI Vet-Grade (Chicken)": [
    { range: "Up to 15 lbs", min: 0, max: 15, cups: "0.5 - 1.25", low: 0.5, high: 1.25 },
    { range: "16-25 lbs", min: 16, max: 25, cups: "1.25 - 1.75", low: 1.25, high: 1.75 },
    { range: "26-40 lbs", min: 26, max: 40, cups: "1.5 - 2.75", low: 1.5, high: 2.75 },
    { range: "41-60 lbs", min: 41, max: 60, cups: "2.75 - 3.5", low: 2.75, high: 3.5 },
    { range: "61-80 lbs", min: 61, max: 80, cups: "3.5 - 4.5", low: 3.5, high: 4.5 },
    { range: "81-100 lbs", min: 81, max: 100, cups: "4.5 - 5.5", low: 4.5, high: 5.5 },
    { range: "Over 100 lbs", min: 101, max: 9999, cups: "5.25 + 0.5 per 20 lbs", low: 5.25, high: 6.5 },
  ],
  "Blue Buffalo HF Vet-Grade (Salmon)": [
    { range: "Up to 15 lbs", min: 0, max: 15, cups: "0.5 - 1.25", low: 0.5, high: 1.25 },
    { range: "16-25 lbs", min: 16, max: 25, cups: "1.25 - 1.75", low: 1.25, high: 1.75 },
    { range: "26-40 lbs", min: 26, max: 40, cups: "1.25 - 2.5", low: 1.25, high: 2.5 },
    { range: "41-60 lbs", min: 41, max: 60, cups: "2.5 - 3.5", low: 2.5, high: 3.5 },
    { range: "61-80 lbs", min: 61, max: 80, cups: "3.5 - 4.5", low: 3.5, high: 4.5 },
    { range: "81-100 lbs", min: 81, max: 100, cups: "4.5 - 5.5", low: 4.5, high: 5.5 },
    { range: "Over 100 lbs", min: 101, max: 9999, cups: "5.25 + 0.5 per 20 lbs", low: 5.25, high: 6.5 },
  ],
};
const BB_KEYS = Object.keys(BB_CHART); // ["Blue Buffalo GI Vet-Grade (Chicken)", "Blue Buffalo HF Vet-Grade (Salmon)"]

export { BB_CHART, BB_KEYS };
