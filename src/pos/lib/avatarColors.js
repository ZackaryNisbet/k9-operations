const DOG_AVATAR_COLORS = [
  ["#FF6B6B","#C0392B"],["#F39C12","#D68910"],["#2ECC71","#27AE60"],["#3498DB","#2980B9"],
  ["#9B59B6","#8E44AD"],["#1ABC9C","#16A085"],["#E74C3C","#CB4335"],["#F1C40F","#D4AC0D"],
  ["#E67E22","#CA6F1E"],["#2980B9","#1F618D"],["#8E44AD","#6C3483"],["#27AE60","#1E8449"],
];
const dogAvatarColor = (name) => {
  let h = 0;
  for (let i = 0; i < (name||"").length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return DOG_AVATAR_COLORS[Math.abs(h) % DOG_AVATAR_COLORS.length];
};

export { DOG_AVATAR_COLORS, dogAvatarColor };
