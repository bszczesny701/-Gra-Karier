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
  'wisla-mala': { id: 'wisla-mala', name: 'Wisła Mała', short: 'WMA', strength: 42, wage: 800 },
  'legia-dolna': { id: 'legia-dolna', name: 'Legia Dolna', short: 'LDO', strength: 45, wage: 900 },
  'gornik-las': { id: 'gornik-las', name: 'Górnik Las', short: 'GLA', strength: 40, wage: 750 },
  'pogon-wiatr': { id: 'pogon-wiatr', name: 'Pogoń Wiatr', short: 'PWI', strength: 48, wage: 950 },
  'slask-rzeka': { id: 'slask-rzeka', name: 'Śląsk Rzeka', short: 'SRZ', strength: 44, wage: 850 },
  'lech-pole': { id: 'lech-pole', name: 'Lech Pole', short: 'LPO', strength: 46, wage: 880 },
  'cracovia-noc': { id: 'cracovia-noc', name: 'Cracovia Noc', short: 'CNO', strength: 43, wage: 820 },
  'jagiellonia-most': { id: 'jagiellonia-most', name: 'Jagiellonia Most', short: 'JMO', strength: 41, wage: 780 },

  'rakow-miasto': { id: 'rakow-miasto', name: 'Raków Miasto', short: 'RMI', strength: 58, wage: 1800 },
  'piast-brzeg': { id: 'piast-brzeg', name: 'Piast Brzeg', short: 'PBR', strength: 55, wage: 1600 },
  'zaglebie-kopalnia': { id: 'zaglebie-kopalnia', name: 'Zagłębie Kopalnia', short: 'ZKO', strength: 52, wage: 1500 },
  'korona-stolica': { id: 'korona-stolica', name: 'Korona Stolica', short: 'KST', strength: 60, wage: 2000 },
  'widzew-tor': { id: 'widzew-tor', name: 'Widzew Tor', short: 'WTO', strength: 54, wage: 1550 },
  'gks-huta': { id: 'gks-huta', name: 'GKS Huta', short: 'GHU', strength: 51, wage: 1400 },
  'stal-mosty': { id: 'stal-mosty', name: 'Stal Mosty', short: 'SMO', strength: 56, wage: 1700 },
  'ardia-park': { id: 'ardia-park', name: 'Ardia Park', short: 'APA', strength: 57, wage: 1750 },

  'fc-europa': { id: 'fc-europa', name: 'FC Europa', short: 'EUR', strength: 72, wage: 4500 },
  'nordic-united': { id: 'nordic-united', name: 'Nordic United', short: 'NOR', strength: 70, wage: 4200 },
  'river-capital': { id: 'river-capital', name: 'River Capital', short: 'RIV', strength: 74, wage: 5000 },
  'atlantic-city': { id: 'atlantic-city', name: 'Atlantic City FC', short: 'ATL', strength: 68, wage: 4000 },
  'metro-stars': { id: 'metro-stars', name: 'Metro Stars', short: 'MET', strength: 71, wage: 4300 },
  'golden-gate': { id: 'golden-gate', name: 'Golden Gate', short: 'GOL', strength: 69, wage: 4100 },
  'palace-side': { id: 'palace-side', name: 'Palace Side', short: 'PAL', strength: 73, wage: 4800 },
  'harbor-club': { id: 'harbor-club', name: 'Harbor Club', short: 'HAR', strength: 67, wage: 3900 },
}

export const LEAGUES: League[] = [
  {
    id: 'liga-3',
    name: 'III liga regionalna',
    tier: 3,
    clubIds: [
      'wisla-mala',
      'legia-dolna',
      'gornik-las',
      'pogon-wiatr',
      'slask-rzeka',
      'lech-pole',
      'cracovia-noc',
      'jagiellonia-most',
    ],
  },
  {
    id: 'liga-2',
    name: 'II liga',
    tier: 2,
    clubIds: [
      'rakow-miasto',
      'piast-brzeg',
      'zaglebie-kopalnia',
      'korona-stolica',
      'widzew-tor',
      'gks-huta',
      'stal-mosty',
      'ardia-park',
    ],
  },
  {
    id: 'liga-1',
    name: 'I liga europejska',
    tier: 1,
    clubIds: [
      'fc-europa',
      'nordic-united',
      'river-capital',
      'atlantic-city',
      'metro-stars',
      'golden-gate',
      'palace-side',
      'harbor-club',
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

export const STARTER_CLUB_ID = 'wisla-mala'
export const STARTER_LEAGUE_ID = 'liga-3'

export function getLeagueForClub(clubId: string): League {
  for (const league of LEAGUES) {
    if (league.clubIds.includes(clubId)) return league
  }
  return getLeague(STARTER_LEAGUE_ID)
}

/** Kluby dostępne na starcie kariery (III + część II ligi). */
export function starterClubOptions(): Array<{ clubId: string; label: string; minOverall: number }> {
  const liga3 = getLeague('liga-3').clubIds.map((clubId) => ({
    clubId,
    label: `${getClub(clubId).name} · III liga`,
    minOverall: 45,
  }))
  const liga2 = getLeague('liga-2').clubIds.slice(0, 4).map((clubId) => ({
    clubId,
    label: `${getClub(clubId).name} · II liga`,
    minOverall: 58,
  }))
  return [...liga3, ...liga2]
}
