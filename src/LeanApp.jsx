// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

// ─── K9 Operations Lean App ─────────────────────────────────────────────────
// Bolt-on modules for Gingr: Customer Lifecycle, Operations Hub, Photos.
// This app reads from Gingr's API using credentials stored per-location.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "./supabaseClient";

// ─── Color palette (matches POS brand) ──────────────────────────────────────
const C = {
  bg: "#F5F6F8", surface: "#FFFFFF", surfaceHover: "#EEF0F4",
  border: "#DFE2E8", borderLight: "#ECEEF2",
  text: "#1A1D23", textSec: "#5A6170", textMut: "#959BA8",
  pri: "#003462", priL: "#0A4D8A", priLt: "#E6EEF6",
  acc: "#AF8D54", accLt: "#F5EDD8", accDk: "#8B6F3C",
  suc: "#0D7A56", sucLt: "#ECFDF5", warn: "#C4720C", warnLt: "#FFFBEB",
  dan: "#C42B2B", danLt: "#FEF2F2", info: "#1A5EC4", infoLt: "#EFF6FF",
};

// ─── Icons ──────────────────────────────────────────────────────────────────
const Icons = {
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Lifecycle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  OpsHub: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>,
  Photos: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  AlertTriangle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Eye: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Link: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Menu: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  LogOut: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

// K9 Logo (same base64 as POS — sharing reference)
const K9_LOGO_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAB0CAYAAABzNJfPAAAlgElEQVR42u19e5hdVXn++6219z6XuWVymdyJIHhJ1JZSsfJrncGiImBotWd+1mIpCKFgkSJGhQJnjqCFAgIiaFCxFFCZo20RLwkUmdECUYhQSIZAAskkk7nfz21f1lpf/9jnTCbJTC4zZ8IUWM+TZ57MnLP3Wutd3+1d3/oW8GZ7s73Z3mxvtjfb66g1NyckJ5PizZmYBY0Z9EYevzWbOpNMQhDB3PHlj55lRZzsxamHWpJJiFQK5uj2IymAFtEwwd9aAAANJpVKmdf1ykgmk4KZKfnZU5b8562NfP9X/+KXAPB4sv5oLRpqbk5IZqbDleTm5oQEyivRs0ZCGtAiiEh9P7X6jtrqKEaz+SoAaGhq0UjNrBZrTiRkYzqtGxvTGiDctvbMEyor5MmOJVYKmKWWTVIrZsWiKzD6xUy28Fui/3oRSOvx3y/LqngtDHYikTZE4L3SUW+lUq3qris/+qkVS2oeUNpwPu/vWb9h6IR7W1vdYj95pvrT2JjW9fUrop8+9Q8+XRWV5wopTq6I27YUInxt8c1EBG0Y2byntebfZfP+9++7d/N9re3tbuk5/9cAOWBik0mIpibmr15++qK3LanYHI1Yc5RmEQTK3dFROOHLd6zvmCE7QpxMEqVS5o6rP3rW4pqKGyornFXGGLi+AhvWTMQHfomJBMmoY0GQwGjWbesZyl156Q0bfsrJpKBUiqezeMTRBuMbX/7o///GFR86tgRGA+oFEfEx8yLframMzPV9zczMti2j8SqzBABWtSVopsC45yerbzy2rurhWNRalS34Ku8GhhkMIkmABbAgMBEgCUwMEDM47wYm6/qqIu6sPHZxzUPfTZ5xM6VShpnB01joRwWQZDJ8T/LvP1R37OLqH8WrYqsB4C041zk11aq+dfWZl9XNqzwjUwgUCZIAm6hjIWZHlgEAEmU33oJSKXPvdavvW76w6ot+oHXBCwwBFhGJkuZgZhN1LBGN2JIIFHUsGYvYgsFMRIIAq+AFxlesVyyuveLe685OE5FINyfEVLXPUQGkAfUCAC9d6Hxqbk3EWIKjAHBe6l73pitOf++i2vhNrhdoMCQAMIiFIBjWKwBgwZZeKqPNEI2Naf2da8+8c2ld9TmjGS8wIFkEYpwXxSYWtcVozm9r7xr+u227ej/w6u6h80cy7u/jISimaFeEAcvRrBssrav8q3tSZ93T2JjWzSEos9LLohY0mHPPRbQy6nw2UCy0MfOZmT5/wUdqly+I/9BxhF3wlCGisYknIjiWOG4mDPhdV5/+yWULqy4ZzbkBCPb+aHMooZTJBVuf2NLxgTvve3qg+KffrFiBH15/4dm/mD8nfmre9XVRtQFE9kjWC5bVVf/tt6458+nGxvQ3p2LoZ1xCHk/Wy1QqZd5/TNUlc6qixxc8Bce2QUR84rHR+2prom8tuErvs0KZiZlhSbECAPpW1U3bw2IGJRJpk7zs7Dm1lbHbtDbGMMuJjR3BMKhzKHvpnfc9PXD7padHksmkaE4mnPZ2uDtfHT0v5/o5IYUITcbYOyzXU3pedfTGm644Y0UikTYldT0rAEkmIVrQYJKX1C+aV+Vc7SulLEnIFrzB7167+rKlC6rOyOT9ot3Yd0a0YQjCcgBIJNLT9rBamuolEXj5HP6HeTWxha5vDIEOGH9ROsRoztv8+Rs2PJZMJsVld6z3UqmUaUyl/ceT9dY19zzePpL10vGoTSDovVIN8pTm2spIvK7GuYYIvGrVkTkkYqZtRyqVMscumvON6sporVKG865C1LE/WV1l35zJ+2YitUkAtDYQQi4655z3VBRjlunYEWpIteo1Z50Uj0fERV6gmYgnGTsZ2xJQSv8KADegZZ/P9a2qY2ZQwVXpwNcQ2DeyJ5DMugHHo+JT11384eWNjWmdPAKiVMygqrJOTbWqO68845y6ufFEtuBpIrIDZTC/JvYeS5KlNAuaUL0QacMg8Ny3VsQWFKWNpmE7BAH87j9c8sHqqugyL1CMCaRjbDEYRt4P/mcvd7W3lYLaHR0jz4zk3KyQUo5XWxRKt66ujMYW10UTJRbiNQWkOZGQp6Za1Vc+d9oJdfPidymtDHM4AUSAr5QxHDr3E04KgYxhjjiWM7cmvgQA2qYRi5S8tGqHzrItwQAdTAUKP9BQineFMdC+9osIzMx0y/1P9RrGK7YlQuuxX/BomDkSkatDQBrMawZIyddZvfrtVScsrvpxRdSq8gIDovErnAQdSgUxm4hjIerEjwGAlSun7vo2NLVqACQE3q+0IYAnHTcRYLSBVoXcZJ9JpxsFALDhnVIQaL/InEHCDzRJ4hO//On3zqNUyhxusCjKraYa02mdqF9Z2fj+lQ/X1kTfk3d9LYiO+D1MxFIICMlvCVfZ1L0rIvCVn/lgnWXL44JAY3LZPDKJU0p3EBH2p1hCtWVMLGpVL1pS804ASCcOLy4pCyDMoJLN+KeL/2z5Jz769v9aUBOrz+YDRSTkdMgWx7KOnU7fmpqSBAAL5mKpLUWlNsz7SusErxUA2I4cetGg5yBzYmKOjVg0/jYAWHCYEj4tQBghEETgU1Ot6s6rzvrYH761bmNNVfR9mbyniKYeeFIxFgFC17ehqWFKru+qtjYCAJuseY5dJAIOuriYbSkRse0FALDlIBOpmAd4ki1OLgIroJbNeKSeTCZFA1oEpVoVUq0q+dnTlhy/tKqpJm5fCAJyBV8TkTVdsMNYhJeH+n9qO3SlCQ20qhFEIPBBd4kZxJYl4djW8pKqTO0f0xR/em6QN4YPseLN3BkBpLSt2YQGQ6mUSQHmyvP+dME7T5h/QcyWl1dXRhZkC74xhkkQyTJoQtLaQFpy4d+cfnLVA+t/N8qhzZ1S1C7GBXCH1pQM28bKQz6TRT4UYp7YR2FAKdSUDRBmUEtTvWxoatVEKQPApNCK2644413z5zp/G3HEp6srI4tcTyGTczWRkILKxQOGm0GSqPbtK6ILAYw2JUFIHRkgJbeVSAwqY8A4VAdZBNpASnlKiYcDWvfxIregFwBQUSFzfLDuEECSTNkACSPkVoUUcMvlHz6+dk7sw/GI/LhlifqqCsfyPIVMztMAiWkZ78ljERON2Na8ufElALaF+yLpI1RZKxkAXF93+74ylmUJcxClRSDh+tpUV0beedva0z74j6nUY7fffnpk8X9XKSSAxsa0Ln2ZlRGHWlSCMDJtQIquIm65/MwldfPtSy0h6qWkE6srnQgzUPACZPK+AkNSedTTZOMxjiWEEFh2KAM7WUuFO3h4prOwa+mimu5YRCzxlTKTRepFPguCiBfNr/rmpef96Qcuu2x9XxiAAHd86eyGDGVfuOqGxwayBV2ziAggmkRQGMbQ4LQBaWmql0CrmldLqeOW1nxmcNSFUga5QqDATChuzsz0BjAzIATBIjpuMgN7OI8p0uCFM969+mnbFqs9RYYO4mGGUqJMVUXkHae8ff6Tq64546a8b7bXVNqnLZ1XceXuTvMJAP9OFldiEr+NAIR0hNk9EQUzJZUVaLMrk/eV52sNghOCcJS34YlgR6y3TOcRW4qBnFdQP2bG2RQuqkO8lkTBDUxlPHJ8TWVsXaA0LBnSJEr7ywEg6ti1QogJmU8iCNdTyOXd7RNRMEcUh7QUuZfhoeDfs/lAihCMo56hQsxkDEOQOGY6sUgq1aoZoFd6hh8aHCl0O46k0o7foUDxAmUKrq+VNsb1lGcMIIXIF/8+byJcmcFSCFHwVGbHwPDLobpNTx2QVCplOJkUa7/x6OZcwX8yFrXAzPpoA8IEMsbAklgajj9lpkjDc7o5IW6658lMLqeuj9iWIKbDGg+BBEI7KUCwfV9R1qg2AJBCLJlYXbGxLQGtue2O7z/Xx8x0uFkzk+rR9Kowwh0teNcZAxKCjn7qJIOUYRCJujWJk6oPGWYfpDU2pnVzIiHXfPVn3+7qz/ymqsKxmTk4AoOmI46k0bz78sj2PU8DgGNbSw0b0H7ZjkzEUgp4SreGNrnhsB0fcagBXPq1DRu6BjPfr6mM2AD7zDOTsDaZzjCaQeDat9TFFgJAUzI5ZdW5ZWWamWFe6uj766HRQntl/PBAYWYmQcYWgkZG3WQq3ebXr1gRBfMyrRm8HzdGBFHwAmQL7sMA0Nd2+FvQB/WjE+m0YU6KHz/10sUdPZmHayojjhAAM2vGzANDAAyziUUdUTunYsl4bmpqtgSmqSlJX1u3cc8r3YOnjWT9rTWVUbvo0CkGG2ZmZoT/wv8rKQRVxSP2zq7hOy79l0d/BAANH1lWJwQtVdrswx4z2ERsKTI5/5UnHu78HTOoMZ0uz34IAQxK8YYN271zr/np2bt6MjeA2VTFHSmJiAEFZs3MMwmOcSwJAVox1Vhkf/uYSCTkVbe2bn/k6T3/r6M3+32w4aqYbcUcW9iWJEsS2ZagmGOL6oqIxcYUXtkz/E8XXf/Lz61bt8YGgHlzK99WEXMi2rDZb6/H2JaE66v7021tfhhCoDwSUgKFGcQMnH/tw1e+0j78/t6B7E8CFfiVMduKxxzp2FaYwUMw5ZYcBiAkYFn2saVYZLotnQ73ub+X3jh43rUPnf/yrqGTO3qG7xgcyb5QcP1h11eu6wUDozl3U09/9sbN2wdP/Pvrfv41TiYFNm0CAMSj1kmRiARjr7FmgKUgOZIpFDqGhu8Z77GWm1xkorG8pqcB/NXVF7/vncvm1ayOO85pUoh3WZZYFIlYAkRQptynbgi2FdLw5Wqp4i5eOkyc2wRgEwAk15w035LxmAXOXvmt/x4a47CaE5IaU7q5OUG4exNsId43wckFXRG1rd0j7gOpbzyxK5yvlJ4JQMYMfTKZFE1NAFHqRQAvArjxb04/vvrdb52/wrLsJQvr5lw/t7rijwt+MGGazVRjEdZmxVgskmotl41iFMfUgBbxwVSrSt29qX+cccavrq23WtBgihNLjY1pfe659VHLlicHSoPAAiAwgy2LxEjGLQxmstczg5qaVvIU+jS1VkqUbijS8aXff/faM75zzOI5F4zmfUVlyIws5UkNZ9yt51z10MqiFpux4wnhRIKamsDjj0wAQCKRkOl0Wt/65Q+9b0XdnI1F21nMA4aqrnCsnZ3D16657hfXTvV4gjV1kYdJodUArWCA0smEjTbojMiNlteIEGnNEER1F3/q3XO+9YMXhqabpHVohhucmoA0u2RlL6UB1MRiH6qI2cjkfU2AZZhNPGJbfYP5l17cOvjPnEwKapzahpool+gvQK9pTKe1MTxcbt83pE9Qs3jB/LrpxiLTaaXsFcvCX2ptitvMYNuSxlfK9A4Vzrs1vbGQDl1zfs0A2S+IyqCMXjABpI3R1RVRuSAePQYAVq1qO/onvxIJSQR8fe1HTqyIOicWPMVMJImgYhHL6hoofPHymzc8lSxm3kz1PWUDpEQvSykyhsunUtiwjkdtOZwtdA3nzTZm0JYtaT7q4hGeUeG5VZGLKuMOMaCJOaipiNi7e0e/d8n1P7/l8eLRvOm8puzHEXKuH278l8HsGmZVGbOtkYLb/VJ774dT335qpztn+oOeigOTSKTNjZ89bUk8an0q7/pMYFNdFXU6+3I/viD5swubmxPy1DKcMSybhKwqHhlQAWWNMaBpJKMxg8EcVMcj1mjWe+XF7f1/nvr2U5tLK7C5OSGbmxOymOo/4+orPHYHXrAgvra6MlKpDfzqiqjT3Z978G+v/s9PcjJJxQz9aUtu+SSkuNUdETprmMHENJXuMbMWQoiqmGP3DuZ+1drWcc7dD2zqWrdujX3qRXcHX7ygflljY7pjv+9QOt0o9j9p1VJaKOnS3noKTSnwkWSuJJNJcWoqpf7l0tPfWlVpX+gHBrGIFdnTm7nt76796eXhuXYCUXnc8LKrLJ/J1Zr5SPJ1mJlBpIkhK+OOzBV8tatn5IbPNP08CcA8s26N/ccX3R18N3nW1fPnxNb+23Wr7895+uf9g/kt9z7yeDcRecDhpfmkiiL1YHNClgDsa6vjRPO+R7VLrQkAEiudJYui31w0v6Kiqzc7PDDqXn7x9b/4V04mBYiYyhgTlQ2QsewO1+RBRCEjzJjwUEy4rAyHgxGOLUXEkVa+EKB/KLe+t2/kms/f1vrMunVr7Isuutv88UV3B9+/7mNfX1RbcbmnDOrmVVwSKHNJbZXjXn/BX3QbRp8xpk8zD7HBMEgMK6UHifWQr3hYSAwalsP9+dHBHdv18D0/fTJzQNAWknbU0tQg+9rquDGdNsriSd3kmtMWCYH6XZ1D//Fie++Xrl/3220lKmUmGO6yPYsZaLropNhxxyx78piF1X+QyXtQmsHMhkKvnQgkpCTYUkBKAc9XyBf8rkCZXwyNePd+7qYNvwGAX9x+euSMy9Z7Xzi3ftEfvaP2e/PmxM/IFnzFhiWINIGFEEJYUkAKghCEcUcUwRyyotowjDYIlIHS2mWmEQb3Km3aGbRdBbzV02Zz+2B+6w13PjYwfkCPJ0PaJJVKmbXnn7Lkpnue7CzxWuUoEjDTgIxlmifPeX/dscfP/adIxDpbSrEi6kgQEYwB/EAj0HrAGGzzff+prBs8tmlr3xP3PvQ/wwBQUk8A8K2rzvzLBbXR2ysrnOXZgq8I+6anMoOJQhegGNTzgYNjKoYzQgiCFAQpBKQMAWQGXE/BC9SANmaLUtwyWtCP/sNXu34LbArGA8DJpGgqEpMz5UDQDD2TAeBPli2Lffzjbzkh4tiLjNFRkiIXGO7Zuquv83vptn3ylTY3J5x3NaZ9APja5//8bcfMr0nVVNifBDE8X+ty5H+Fu50MhBUAuKkyAUBaUpBjCQgpUHADeIHZGgTmJ90Dufu/8PVHtoYGvt5KpVo1ZnBzbsZcxl/cfnrkzH/c4E22d/XMujV2r7tLnHnZeq/0iRvXnnnC0jn2JdGIvLAq7lRkC74xDBI087lHzGACl+yajNiSHFtgJBt4vtLN3b3uTVfc+ssXSp7XTElJ2QeaTCYc9PXOTd3V2n04n197/ilVJyyfVx+LynMiljy7pjISzbsBtDZ6RrMiD4NlBsgIIqsiaiFXUN5IwbvjB607mx599PncTNkRKt8Awsz0L605reZdKyqelVKsHx71HxrJu9tGBkZHUBkx2jOxeCxWuaA6tjwWpXc7Fp1iS3lKRdxZ6lgSeS8EIswVnh2V5TjExgghZGXcweCI+8KOnpFzr/z6Y8+WDinNakDWnn9K1Xvfvmjn/NrY3Gw+QMELAgayIS2FqCBE4lFbFg/PhEZeaVOs2TJrgJhIpTFYV0Qdq+AFufauzN98/uYND5UbFFHOpQQA+cHAUcbQaD5QgVLacSw7FrFrYxF7bjxixSO2JQNlTLYQqGze14HSJgSC5GwFAwiz8QWRlXd9bUlRcezS6n+/7Qun/+WpRSpn9gFSbI6d4+KDLQYJrZkDZThQhpUOU1QAiGLlHYkybPMeXWBIBkobQUTHLK764U1XfOh9pRy22QVIcW1bVXMCQQjC/xModPf3/sP//aqjRCQCpU3EkZHlCyofTF5WPyexciWXo6Jq2VdnZ2cvaS4d8WK8XhsRybwXqHlzYiuOmVt9C6VSJp1OiFkDSGlpvDLsBjDsvxGK7woiK5MP9Lzq6Pm3X3X6n5RDdZVdQjZu7HAJyBXrsvHrHRRjDKKOhbmxyFdCYnglzxZAiiQu2ABZQQTi1z8gRdVlKuLOaV9f+5E/olTKTEdKyiwhTaUcpWGiN07FcMMwlXGLaqsinwEOv2rDjAPS0hSWIfK16hN0IPv6upUSsPACg4gtP3buufXRYqA4e4pgGs1doDdSTX0SvtImHrWWn1QXfS8ANCem5nHNCCBEcjeY8UZqzDCxqIXKuF0/HbVVXpVV/OkrtVtpAwK/YcSkmMUIadHJwNQLd5YVkLbi0a1C3m/3/LBm2BtGQgikFMOW4h0ApkzNl3XCVhaP/naPuB2urwpSFjdY3xiIkDIGJGjJVWv+rK6oxug1BSRVLAxz0z1P9ho2nZYUIHpjGBMikNaGbcuqWFQbqwOAxsYjN+zlVilcvDtKMVO7FAJ4o0hIcfy2JRARmAtMrWR92XV8S7EkaqD4JSHoDROLlNajlAQ/CAGZygHVGTO6gfK28hvM9QURCyJYEUSn+oiyp5KW3L28573kBxp0dO8o2X/FGuyT7hNmgHPJUQ0XtUDpDPG0X1f8odmaNYBs2RKynVrJHa4baMu2pGHmo7YxxeHNOARIx7ZEWOg4zGQ0xoANg4QoZjqGp7M8X0MzF+t/Tb+fLKaupssOSKlg2G83dXUuPr2qPyrFwkCpYg7ETGEQJmsLghWN2FIKgWzeQybr7gqUfiFfcNuI5KssMJjPuFxVFSWlscCSWBmLOCc7jvyjOVUxq+ApqOmkH5V2TRlq1gBSnB8iouzZHz5hlyVpYRBgRq6LZLAhBju2lBHbskZzLoZG8xtdV/1sOOM++vivX9z8s01d+UM954bPfuDdCxdW/V1lNLKmqiJSmSuE94JMkUKBp7SeTYCUSnHrQOmdQtB7x6VsllU1RRxLWpIwmvE7B0fzP+wf9n/4hVse2bSfHy5amlpEC8KzIlu29NL4E1hEhC/f+esXAFxx4+dO+/byxVW3za2JnpEvKG3A8kj6TUxk2MCRYZ3FVVOgT2YEkNK5C838ykzsizDYVEQdOZp3t41m/Vt/v33kR9/6QVh1oXSkoJi1zqVqqkApBTStb/7S6hOXzLP/Opsz69ek/qMVgC7mFm8DcOZ3mj5207L5FV8o+EoxH8EcEZPWQE7rQrgyZ4mEtBR/aqN2GmMOVXW/mCN7eLwXM5t41BYDI4Wf/OrnL553z5MvZYC9RweIyABQ40u7jrNwAAB3yOu25zlrl9VF1zbf+InnBke9G97VmH6wuXiI59Smh9d+55qP8vLFc9bmCoE63HliBmlmECKZKeIxMy5pSVR9V+8MlMFkBQ6ZGbYlhWNb4vBiFjYRx6KRrNf+nUeePeeeJ1/KrFtzkg2ATk21qkMlQKdSMMxJcfXdG7oKvvdTATaxqPzDFYsrf/SvX1n93cbGNDWgwTyzbo194XW//GJ3f/bhyphtHU41PQaYiEhpY4xW2ZDbO/L99RkBJF1cGgVjujxfAzThe0zUsTCcKbw4PFrYEnEsHIqIZJBxLEnZXPDt1tZ2d926k+yL7t4U4AjyjYq7muT5ugVEwgu0n/eUWraw6jP/dv3ZP6GWlNhUtD1be7rPGxl1uyOOdegajcUKqlqz2zNcyAJAU1NqdgDS3BwW7BruHRgIgqAg6EDWlwETi1jIuf59/aP5a6OOBRyiHLggyEzeM8P5zM8AUGdnWUfszdwVbhFwLmf+O18IQEQ2A9ZI1vWXLKhcfc8HP3bXRRfdHfzyG7+1b7jz6YGekdwVUpA4VMIGEbMgAoMzO18ZHi0SjrNDZZU68vyW3iHDNBSeVuIDTjcpzZBMu0xgOrxAQRxkCAw2ji3J9YMdP2ppfQkAT+WMRrpY3e2ZHt1W8FSPbYmwPj/IGcl6wZL5lReuu/rMT55x2XqvOZlwLv3nR37QP5x/Kh5zJA6iuhihhLAxI+nWtvy+sftrz2UxAfjZpq48gwfERMdbCcLzFXIevzrqux25QsAgyMkKoBHI2FJCKX5u0yYE00hwZuakuP/+R3OBUs/blgQVvTAGy0BrM6cycnvyMx+ei1WhxA5l/SalNXAQl5EYLARgGAMADB/BRWBHhVw0xQ4RqE+IfXO0mMGCSORdP+jLBLt2bt4zqLUZtiRhsr14HiMt9bPjXespeYHF7BjNeGY8Ix1WtDamtiZa95YVkcsbG9N63bo19mU3rH90aMT9fSxiicmkJMwgJ2ile4G9VV1nDSAlGl4p070/DU/EbEsBpbljwzO/6r23td012uyRQkya7SjAFCgNX+nnxpOY03HLla+eLVX1Ga9uTTi/CwDA6fQkAM65wbepVOd9EiMSHmzlruksmBlnYpXRXRMZBGkJaGW2bdqEAACUNjulFBNmOzKDSQiZzXt6IFt4eTyJObUW1kHM5by2bME3JITYV/0waWVeBAB/SUQDwMvdQz8ZzhSGLCmsg3mDRGLPdOZrxgExhjv3jzG4uG+g2Gwe+5zmV2mS5DoiZksKaIPux/6nffd4EnM6BOhTz/a0B4HpsyRRqbIqgUlpRqCwCwBqa4dMc3NC3vq9jYOeZ34ZjUzsDYbF9w185e8ZL4WzSGWFzQ9Mlzb7XqNSujkgMHsB8QLv1UmDQwZLSdDGvNra2u4WDeZ0dr+YmSnd2pY1MO2WFGOGHSDh+QpZz+0oxVTFYv406no/UerA2z1LpHsQGPiadgOHX3z/qFAn4zvk6aBbKb0/+LLgBfBdvWVsZUi5Q4/lctEBEiWFgNJm6zj7NL1jyUUC1BjeJiWdzOEdICwlkecpz8373WMxFQEpgDs7Blvn18RGKqJOTaDM+NvemEiIghdwJhd0AntLjcwaCSl1yBjd5/umVPOEmcGWFOS6KrNtR++O0uczebW74ClggjsPqfjFIFAvlk2CS1dYuMG2cf4fLCmg2fQ//+yO/pKRp2Lyxg33PT2gfLMxYstxHFzYNykISpvRzuFMz1Sj9BkFpNShrBsMKmPyoljGAmC2LAHNZucd6ef6Sxf3DoxwZ6B0VgoxUS6XCAKNoGhoy3Gdd0mlFrxgu9JcmngjBcEYdKU3dhRKxyvGe42uUo8RYV9vi0KVCkLPnfc9PTTVKH1GASl1qG3TriFjeFiWrhAkMlIQmLEV425jfuS5kUFt0GcJGtvuHkfaiYIb6NGMfnX6Hta+KpUsZ2dYfxeCiVgIAaPDW3FKV6wCewvqF1w8kXcVCJDjg0JLCBiNPUBIYGK2FMHcV/UD6Y0dBTbcL2hvjEFECAI1ZtCTyaTYtGlTYIzec4DrywxbEgLNPc/2vjRtD2t/lZor+F2urxQRCeKwzpdm7Nw/lkgUKZftz/dvzrlBv22JMc+MiZgEoLTeMT7wnHVurzGhOtJG9QlBQFhPhJTScH29uaQ6SlJCQLvY725ZAoxlSShjtqbTHYUyeFj7uL6b+9r72fCQLF5dxOGdCDsnsGPMyaS4Y/3vRg1zm22N98zCHinN26fbrxkFpLRSlOIeQWPRrMy7ivO+eXl8kBa6vthJB4oZh7S23jRel5dDggHggQe2Zwxzf0gSELQ2cH1/10S2qvRurcyzch/KhUlpAy/wt00nBjkqgSEAGHBnWHgjDPCUMgO7ukd2lVZqaQBaB6/q/TKUS5RJwTVPlsugjyFSlDalTI8QAhAg19PwlNp1MFvlev5zWo/vJwnX1/BVaOOABjOrAZFSdhWthwkjbrPzjgd+N1ryYsZiFsW7/GBvzMIMFkLIbC7wegdGfx9OUvlq9o6teOZuEfpTMlAmPzLgFisZpSbaS8FIxt1a8BQASA4XGfm+yuzpKnRM9L1ZERiOF13X1d3amCI4BF+rULTDu5lUycAOj2a7FtbG2R7b0mW2bYuy+WBr6u4ndhcr1pW9TpUg0R32TZDrBf0P/Lp3IJTefW1Vc1goEwWNnb6vc9GYXaGV1lKSNMwdt9z/VH/xe7NTQkor3/Xd7kBpCBFG4axp60QxS6GQ6zWMTNEtZhAZSxKCQD8BgIu31ZS9BUb3sgGscIOpa/v27d74GGR/Vz51V2ufYe60JIEBY0mBQOtXAZjpFqKZUUDG6AONHs/XAAuplEHeVy+Pl6DSQJ989bkhZtMfpnkyl4i+fKB+PV1jeVAa3nCvYRPuiRt0jKNWDuTAQrujtTG7ZUgSm2I9ya3Tod2Pkg0JdWl/3+igUiYnJcmCF8D1g1f2I+CYk0nR2gqltemWUozZj0zO8wdHsr+brrGcUIJL2TGe1690CIgX6J3jqZXJ7I6vzM5ifjCzMVA6ZBGmu2hm1IaUdPCvXukZXrly6ZBtyYps3st39uU6ASBRJO6AvTtsBtQhQhpDO5aU2Zz/8jXf/E17aD/KXOewmB2jDQ8qZeDYgFF6x2H6aDtD6RbC9RSy+WDrdFjeo+VlMRGwcWNHgUj025YAGN0bnhnt25/vGct2DMxuCoNDY1sEo/VvAZiZsB8llTqSzY34gWZtDFyl2g+20lvGRFrvMdoAYLvgqXz/6OCrY4tsNschDz4YGjltdK9jCRhwZ1tbmz+R0QQAw6a9VHhKG6Dg6ydmWqW6eXfUsAn8wKBQCHmsydRjSc25nun0lYZtSdLMu75296aeMPbFrJaQsZWvAr1HSjJ+oHeNc3kPWHmaRPGMO9nZvMejGa8YoTeU3d1tagonb2igkBUg1/dVYSCTPSh9XkoCdH3d4/mKHUsiCPTLAMyDZSj1d9RON2lDvfGoLQBMUj42nPBMNre74CrYtpB+oDuf7np5W7kIxckY6Zde8LIMxLUx6uZ7nx44GH1eOvqdyWWHtOaClASl9fPl8LCOCiAl2jpfCFo6ekZfKbj6sfG/31999Ax5XYEymagjESizOZ3uKEyHzj6UjWMGtba3uwPDhbUDw/m1AILJ1Ol4qerYkRk1xmSNYR1o9Xy53HJrpgEp3cd02c2PrAfwDiA8XbT/PU0lj+znG4f733Pc/B5LynigioRiUxm2bCeXEgaAS//lkdv2/o74UFL1VEdb9lR+KwyzzI/4L+yV8tbZDcjepQgigioV7J8s6KJUymc+rr8iZh/v++VbeYdqpQj7MEpicHEM/kgmuGBkdKjuC99sfYkBojKUHz9qgBRBoIN5IaVYxA3MD3Z0DOrejPlN+JfWGb/L/Uhqk5TG8Nkb1z889ju82V7z1pxIyGSy3nrdDzSZTArmpOA34ML7X/7TP8SjhND3AAAAAElFTkSuQmCC";

// ─── Navigation Config ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "lifecycle", label: "Customer Lifecycle", icon: "Lifecycle" },
  { id: "ops-hub", label: "Operations Hub", icon: "OpsHub" },
  { id: "photos", label: "Photos", icon: "Photos" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

// ─── Font Faces ─────────────────────────────────────────────────────────────
const fontFaces = `
@font-face { font-family: 'GT Eesti'; src: url('/fonts/GT-Eesti-Text-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'GT Eesti'; src: url('/fonts/GT-Eesti-Text-Medium.woff2') format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: 'GT Eesti'; src: url('/fonts/GT-Eesti-Text-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'Canela'; src: url('/fonts/Canela-Medium.woff2') format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
`;

// ─── Settings Page (Gingr API Credentials) ──────────────────────────────────
function SettingsPage() {
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | "testing" | "success" | "error"
  const [testMessage, setTestMessage] = useState("");
  const { profile } = useAuth();

  // Load saved credentials on mount
  useEffect(() => {
    if (!profile?.location_id) return;
    supabase.from("k9_gingr_credentials")
      .select("*")
      .eq("location_id", profile.location_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSubdomain(data.gingr_subdomain || "");
          setApiKey(data.gingr_api_key || "");
          setLocationId(data.gingr_location_id || "");
        }
      });
  }, [profile?.location_id]);

  const handleSave = async () => {
    if (!profile?.location_id) return;
    setSaving(true);
    setSaved(false);
    const payload = {
      location_id: profile.location_id,
      gingr_subdomain: subdomain.trim(),
      gingr_api_key: apiKey.trim(),
      gingr_location_id: locationId.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("k9_gingr_credentials").upsert(payload, { onConflict: "location_id" });
    setSaving(false);
    if (!error) setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    if (!subdomain || !apiKey) { setTestStatus("error"); setTestMessage("Enter subdomain and API key first."); return; }
    setTestStatus("testing");
    setTestMessage("");
    try {
      const url = `https://${subdomain.trim()}.gingrapp.com/api/v1/get_locations?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success || json.data) {
        setTestStatus("success");
        const locs = json.data || [];
        setTestMessage(`Connected! ${locs.length} location${locs.length !== 1 ? "s" : ""} found.`);
      } else {
        setTestStatus("error");
        setTestMessage(json.error || "Connection failed. Check your credentials.");
      }
    } catch (e) {
      setTestStatus("error");
      setTestMessage("Could not reach Gingr. Check your subdomain.");
    }
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10,
    fontSize: 15, color: C.text, background: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
    transition: "border-color 0.15s",
  };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>Gingr Integration</h2>
      <p style={{ margin: "0 0 28px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Connect your Gingr account to pull customer, reservation, and operational data into K9 Operations.
        Your API key is stored securely per location.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={labelStyle}>Gingr Subdomain</label>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <span style={{ padding: "12px 10px 12px 14px", background: C.bg, border: `1.5px solid ${C.border}`, borderRight: "none", borderRadius: "10px 0 0 10px", fontSize: 14, color: C.textMut, whiteSpace: "nowrap" }}>https://</span>
            <input value={subdomain} onChange={e => setSubdomain(e.target.value)} placeholder="your-facility"
              style={{ ...inputStyle, borderRadius: 0, borderLeft: "none", borderRight: "none" }} />
            <span style={{ padding: "12px 14px 12px 10px", background: C.bg, border: `1.5px solid ${C.border}`, borderLeft: "none", borderRadius: "0 10px 10px 0", fontSize: 14, color: C.textMut, whiteSpace: "nowrap" }}>.gingrapp.com</span>
          </div>
        </div>

        <div>
          <label style={labelStyle}>API Key</label>
          <div style={{ position: "relative" }}>
            <input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="Your Gingr API key"
              style={{ ...inputStyle, paddingRight: 44 }} />
            <button onClick={() => setShowKey(!showKey)} type="button"
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: 4 }}>
              {showKey ? <Icons.EyeOff /> : <Icons.Eye />}
            </button>
          </div>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>
            Find this in your Gingr admin panel under Settings → API Keys.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Gingr Location ID <span style={{ fontWeight: 400, color: C.textMut }}>(optional)</span></label>
          <input value={locationId} onChange={e => setLocationId(e.target.value)} placeholder="e.g. 1"
            style={inputStyle} />
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>
            Only needed if your Gingr account has multiple locations. Leave blank for single-location setups.
          </div>
        </div>
      </div>

      {/* Test / Status */}
      {testStatus && (
        <div style={{
          marginTop: 20, padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 8,
          background: testStatus === "success" ? C.sucLt : testStatus === "error" ? C.danLt : C.infoLt,
          color: testStatus === "success" ? C.suc : testStatus === "error" ? C.dan : C.info,
        }}>
          {testStatus === "testing" && "Testing connection..."}
          {testStatus === "success" && <><Icons.Check /> {testMessage}</>}
          {testStatus === "error" && <><Icons.AlertTriangle /> {testMessage}</>}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button onClick={handleTest} disabled={!subdomain || !apiKey}
          style={{
            padding: "12px 24px", borderRadius: 10, border: `1.5px solid ${C.pri}`, background: "transparent",
            color: C.pri, fontSize: 14, fontWeight: 600, cursor: (!subdomain || !apiKey) ? "default" : "pointer",
            fontFamily: "inherit", opacity: (!subdomain || !apiKey) ? 0.4 : 1, transition: "all 0.15s",
            display: "flex", alignItems: "center", gap: 6,
          }}>
          <Icons.Link /> Test Connection
        </button>
        <button onClick={handleSave} disabled={saving || !subdomain || !apiKey}
          style={{
            padding: "12px 24px", borderRadius: 10, border: "none",
            background: (saving || !subdomain || !apiKey) ? C.textMut : C.pri,
            color: "#fff", fontSize: 14, fontWeight: 600, cursor: (saving || !subdomain || !apiKey) ? "default" : "pointer",
            fontFamily: "inherit", transition: "all 0.15s",
          }}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save Credentials"}
        </button>
      </div>
    </div>
  );
}

// ─── Placeholder Pages ──────────────────────────────────────────────────────
function LifecyclePage() {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>Customer Lifecycle</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Track customer journeys from evaluation to active to at-risk. Powered by Gingr data.
      </p>
      <div style={{ padding: "60px 0", textAlign: "center", color: C.textMut, fontSize: 14 }}>
        <Icons.Lifecycle />
        <div style={{ marginTop: 12 }}>Connect your Gingr account in Settings to get started.</div>
      </div>
    </div>
  );
}

function OpsHubPage() {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>Operations Hub</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Daily checklists, room cleaning, opening/closing procedures, and EOD reports.
      </p>
      <div style={{ padding: "60px 0", textAlign: "center", color: C.textMut, fontSize: 14 }}>
        <Icons.OpsHub />
        <div style={{ marginTop: 12 }}>Operations Hub is coming soon.</div>
      </div>
    </div>
  );
}

function PhotosPage() {
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>Photos</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Upload, tag, and pair photos with dogs. Auto-generate report cards and year-in-review content.
      </p>
      <div style={{ padding: "60px 0", textAlign: "center", color: C.textMut, fontSize: 14 }}>
        <Icons.Photos />
        <div style={{ marginTop: 12 }}>Photo management is coming soon.</div>
      </div>
    </div>
  );
}

// ─── Lean App Shell ─────────────────────────────────────────────────────────
export default function LeanApp() {
  const { user, profile, signOut } = useAuth();
  const [activePage, setActivePage] = useState("lifecycle");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Collapse sidebar on mobile by default
  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [isMobile]);

  const sidebarWidth = sidebarOpen ? 240 : 0;

  const renderPage = () => {
    switch (activePage) {
      case "lifecycle": return <LifecyclePage />;
      case "ops-hub": return <OpsHubPage />;
      case "photos": return <PhotosPage />;
      case "settings": return <SettingsPage />;
      default: return <LifecyclePage />;
    }
  };

  return (
    <div style={{ fontFamily: "'GT Eesti', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: C.bg, minHeight: "100vh", display: "flex" }}>
      <style>{fontFaces}</style>

      {/* Sidebar */}
      {sidebarOpen && (
        <div style={{
          width: sidebarWidth, minHeight: "100vh", background: C.pri, color: "#fff",
          display: "flex", flexDirection: "column", position: isMobile ? "fixed" : "relative",
          zIndex: isMobile ? 999 : 1, boxShadow: isMobile ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
          transition: "width 0.2s",
        }}>
          {/* Logo area */}
          <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <img src={K9_LOGO_PNG} alt="K9" style={{ width: 32, height: "auto", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Canela', Georgia, serif", lineHeight: 1.2 }}>K9 Operations</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Lean</div>
            </div>
          </div>

          {/* Nav items */}
          <div style={{ flex: 1, padding: "8px 8px" }}>
            {NAV_ITEMS.map(item => {
              const Icon = Icons[item.icon];
              const isActive = activePage === item.id;
              return (
                <button key={item.id} onClick={() => { setActivePage(item.id); if (isMobile) setSidebarOpen(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 10, border: "none", background: isActive ? "rgba(175,141,84,0.2)" : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.65)", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 14, fontWeight: isActive ? 600 : 400, transition: "all 0.15s", marginBottom: 2,
                    textAlign: "left",
                  }}>
                  <Icon /> {item.label}
                </button>
              );
            })}
          </div>

          {/* User / Sign out */}
          <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email}
            </div>
            <button onClick={signOut}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                borderRadius: 8, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
                cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500, transition: "all 0.15s",
              }}>
              <Icons.LogOut /> Sign Out
            </button>
          </div>

          <div style={{ padding: "8px 16px 12px", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            &copy; 2026 K9 Operations LLC
          </div>
        </div>
      )}

      {/* Overlay for mobile sidebar */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }} />
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Top bar */}
        <div style={{
          height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 24px",
          background: C.surface, borderBottom: `1px solid ${C.borderLight}`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} type="button"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.textSec, padding: 4 }}>
            <Icons.Menu />
          </button>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
            {NAV_ITEMS.find(n => n.id === activePage)?.label || "K9 Operations"}
          </div>
          <div style={{ flex: 1 }} />
          <a href="/pos" style={{ fontSize: 12, color: C.textMut, textDecoration: "none", fontWeight: 500, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.borderLight}`, transition: "all 0.15s" }}>
            Open POS →
          </a>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, padding: "32px 24px", maxWidth: 960 }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
