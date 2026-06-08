const agrSigned = (client, agrId) => {
  const v = client.agreements && client.agreements[agrId];
  if (!v) return null;
  // Support both old boolean format and new { signed, date } format
  if (v === true) return { signed: true, date: null };
  if (v && v.signed) return v;
  return null;
};

export { agrSigned };
