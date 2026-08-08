export interface Club {
  id: string
  name: string
  short: string
  strength: number
  wage: number
}

export interface League {
  id: string
  name: string
  tier: number
  clubIds: string[]
}

export const CLUBS: Record<string, Club> = {
  // III liga — start kariery
  'hutnik-krakow': { id: 'hutnik-krakow', name: 'Hutnik Kraków', short: 'HUT', strength: 40, wage: 700 },
  'polonia-bytom': { id: 'polonia-bytom', name: 'Polonia Bytom', short: 'PBT', strength: 42, wage: 750 },
  'resovia': { id: 'resovia', name: 'Resovia Rzeszów', short: 'RES', strength: 41, wage: 720 },
  'chojniczanka': { id: 'chojniczanka', name: 'Chojniczanka', short: 'CHO', strength: 39, wage: 680 },
  'stal-stalowa': { id: 'stal-stalowa', name: 'Stal Stalowa Wola', short: 'SSW', strength: 43, wage: 780 },
  'podbeskidzie': { id: 'podbeskidzie', name: 'Podbeskidzie', short: 'POD', strength: 44, wage: 800 },
  'gks-tichy': { id: 'gks-tichy', name: 'GKS Tychy', short: 'TYC', strength: 45, wage: 820 },
  'wieczysta': { id: 'wieczysta', name: 'Wieczysta Kraków', short: 'WIE', strength: 46, wage: 850 },

  // I liga
  'wisla-krakow': { id: 'wisla-krakow', name: 'Wisła Kraków', short: 'WIS', strength: 58, wage: 2200 },
  'slask-wroclaw': { id: 'slask-wroclaw', name: 'Śląsk Wrocław', short: 'SLW', strength: 56, wage: 2000 },
  'lks-lodz': { id: 'lks-lodz', name: 'ŁKS Łódź', short: 'LKS', strength: 54, wage: 1800 },
  'polonia-warszawa': { id: 'polonia-warszawa', name: 'Polonia Warszawa', short: 'PWA', strength: 53, wage: 1700 },
  'miedz-legnica': { id: 'miedz-legnica', name: 'Miedź Legnica', short: 'MIE', strength: 52, wage: 1600 },
  'odra-opole': { id: 'odra-opole', name: 'Odra Opole', short: 'ODR', strength: 50, wage: 1400 },
  'gornik-leczna': { id: 'gornik-leczna', name: 'Górnik Łęczna', short: 'GLE', strength: 49, wage: 1350 },
  'stal-rzeszow': { id: 'stal-rzeszow', name: 'Stal Rzeszów', short: 'STR', strength: 51, wage: 1500 },

  // Ekstraklasa 2025/26
  'lech-poznan': { id: 'lech-poznan', name: 'Lech Poznań', short: 'LPO', strength: 78, wage: 5200 },
  'rakow': { id: 'rakow', name: 'Raków Częstochowa', short: 'RAK', strength: 77, wage: 5000 },
  'legia': { id: 'legia', name: 'Legia Warszawa', short: 'LEG', strength: 76, wage: 5100 },
  'jagiellonia': { id: 'jagiellonia', name: 'Jagiellonia Białystok', short: 'JAG', strength: 74, wage: 4500 },
  'widzew': { id: 'widzew', name: 'Widzew Łódź', short: 'WID', strength: 73, wage: 4300 },
  'pogon': { id: 'pogon', name: 'Pogoń Szczecin', short: 'POG', strength: 71, wage: 4000 },
  'gornik-zabrze': { id: 'gornik-zabrze', name: 'Górnik Zabrze', short: 'GOR', strength: 72, wage: 4100 },
  'cracovia': { id: 'cracovia', name: 'Cracovia', short: 'CRA', strength: 70, wage: 3800 },
  'lechia': { id: 'lechia', name: 'Lechia Gdańsk', short: 'LGD', strength: 68, wage: 3600 },
  'piast': { id: 'piast', name: 'Piast Gliwice', short: 'PIA', strength: 66, wage: 3200 },
  'korona': { id: 'korona', name: 'Korona Kielce', short: 'KOR', strength: 65, wage: 3000 },
  'zaglebie': { id: 'zaglebie', name: 'Zagłębie Lubin', short: 'ZAG', strength: 67, wage: 3400 },
  'radomiak': { id: 'radomiak', name: 'Radomiak Radom', short: 'RAD', strength: 64, wage: 2900 },
  'motor': { id: 'motor', name: 'Motor Lublin', short: 'MOT', strength: 63, wage: 2800 },
  'gks-katowice': { id: 'gks-katowice', name: 'GKS Katowice', short: 'KAT', strength: 62, wage: 2700 },
  'wisla-plock': { id: 'wisla-plock', name: 'Wisła Płock', short: 'WPL', strength: 61, wage: 2600 },
  'arka': { id: 'arka', name: 'Arka Gdynia', short: 'ARK', strength: 60, wage: 2500 },
  'termalica': { id: 'termalica', name: 'Termalica Nieciecza', short: 'TNE', strength: 58, wage: 2300 },
}

export const LEAGUES: League[] = [
  {
    id: 'liga-3',
    name: 'III liga',
    tier: 3,
    clubIds: [
      'hutnik-krakow',
      'polonia-bytom',
      'resovia',
      'chojniczanka',
      'stal-stalowa',
      'podbeskidzie',
      'gks-tichy',
      'wieczysta',
    ],
  },
  {
    id: 'liga-2',
    name: 'I liga',
    tier: 2,
    clubIds: [
      'wisla-krakow',
      'slask-wroclaw',
      'lks-lodz',
      'polonia-warszawa',
      'miedz-legnica',
      'odra-opole',
      'gornik-leczna',
      'stal-rzeszow',
    ],
  },
  {
    id: 'liga-1',
    name: 'Ekstraklasa',
    tier: 1,
    clubIds: [
      'lech-poznan',
      'rakow',
      'legia',
      'jagiellonia',
      'widzew',
      'pogon',
      'gornik-zabrze',
      'cracovia',
      'lechia',
      'piast',
      'korona',
      'zaglebie',
      'radomiak',
      'motor',
      'gks-katowice',
      'wisla-plock',
      'arka',
      'termalica',
    ],
  },
]

export function getLeague(id: string): League {
  const league = LEAGUES.find((l) => l.id === id)
  if (!league) throw new Error(`Nieznana liga: ${id}`)
  return league
}

export function getClub(id: string): Club {
  const club = CLUBS[id]
  if (!club) throw new Error(`Nieznany klub: ${id}`)
  return club
}

export function leagueByTier(tier: number): League | undefined {
  return LEAGUES.find((l) => l.tier === tier)
}

export const STARTER_CLUB_ID = 'hutnik-krakow'
export const STARTER_LEAGUE_ID = 'liga-3'

export function getLeagueForClub(clubId: string): League {
  for (const league of LEAGUES) {
    if (league.clubIds.includes(clubId)) return league
  }
  return getLeague(STARTER_LEAGUE_ID)
}

/** Kluby dostępne na starcie kariery. */
export function starterClubOptions(): Array<{ clubId: string; label: string; minOverall: number }> {
  const liga3 = getLeague('liga-3').clubIds.map((clubId) => ({
    clubId,
    label: `${getClub(clubId).name} · III liga`,
    minOverall: 45,
  }))
  const liga2 = getLeague('liga-2').clubIds.slice(0, 5).map((clubId) => ({
    clubId,
    label: `${getClub(clubId).name} · I liga`,
    minOverall: 56,
  }))
  const ekstra = ['termalica', 'arka', 'wisla-plock', 'gks-katowice'].map((clubId) => ({
    clubId,
    label: `${getClub(clubId).name} · Ekstraklasa`,
    minOverall: 64,
  }))
  return [...liga3, ...liga2, ...ekstra]
}
