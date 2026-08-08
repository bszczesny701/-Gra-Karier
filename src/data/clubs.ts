export type ClubCountry = 'PL' | 'ENG' | 'ESP' | 'ITA'

export interface Club {
  id: string
  name: string
  short: string
  strength: number
  wage: number
  /** Prestige 1–5, kroki co 0.5 */
  stars: number
  country: ClubCountry
}

export interface League {
  id: string
  name: string
  /**
   * 0 = top 5 Europy (PL/ENG/ESP/ITA top)
   * 1 = Ekstraklasa
   * 2 = I liga … 4 = III liga
   */
  tier: number
  country: ClubCountry
  clubIds: string[]
}

/** Format: ★★★½☆ albo 3.5★ */
export function formatStars(stars: number): string {
  const s = Math.round(stars * 2) / 2
  const full = Math.floor(s)
  const half = s - full >= 0.5
  const empty = Math.max(0, 5 - full - (half ? 1 : 0))
  return `${'★'.repeat(full)}${half ? '½' : ''}${'☆'.repeat(empty)}`
}

export function starsLabel(stars: number): string {
  const s = Math.round(stars * 2) / 2
  return `${s}★`
}

function c(
  id: string,
  name: string,
  short: string,
  strength: number,
  wage: number,
  stars: number,
  country: ClubCountry = 'PL',
): Club {
  return { id, name, short, strength, wage, stars, country }
}

export const CLUBS: Record<string, Club> = {
  // Skala europejska: 5★ = Real/City, top PL ≈ 2.5★ (nie 4★)
  // III liga — 1★
  'hutnik-krakow': c('hutnik-krakow', 'Hutnik Kraków', 'HUT', 40, 700, 1),
  'polonia-bytom': c('polonia-bytom', 'Polonia Bytom', 'PBT', 42, 750, 1),
  'resovia': c('resovia', 'Resovia Rzeszów', 'RES', 41, 720, 1),
  'chojniczanka': c('chojniczanka', 'Chojniczanka', 'CHO', 39, 680, 1),
  'stal-stalowa': c('stal-stalowa', 'Stal Stalowa Wola', 'SSW', 43, 780, 1),
  'podbeskidzie': c('podbeskidzie', 'Podbeskidzie', 'POD', 44, 800, 1),
  'gks-tichy': c('gks-tichy', 'GKS Tychy', 'TYC', 45, 820, 1),
  'wieczysta': c('wieczysta', 'Wieczysta Kraków', 'WIE', 46, 850, 1),

  // II liga — 1–1.5★
  'znicz': c('znicz', 'Znicz Pruszków', 'ZNI', 48, 1100, 1),
  'kalisz': c('kalisz', 'KKS Kalisz', 'KAL', 47, 1050, 1),
  'belchatow': c('belchatow', 'GKS Bełchatów', 'BEL', 49, 1150, 1.5),
  'elblag': c('elblag', 'Olimpia Elbląg', 'ELB', 45, 950, 1),
  'wisla-pulawy': c('wisla-pulawy', 'Wisła Puławy', 'WPU', 46, 1000, 1),
  'polkowice': c('polkowice', 'Górnik Polkowice', 'GPO', 44, 900, 1),
  'stomil': c('stomil', 'Stomil Olsztyn', 'STO', 47, 1020, 1),
  'ruch': c('ruch', 'Ruch Chorzów', 'RCH', 51, 1300, 1.5),

  // I liga — 1.5–2★
  'wisla-krakow': c('wisla-krakow', 'Wisła Kraków', 'WIS', 58, 2200, 2),
  'slask-wroclaw': c('slask-wroclaw', 'Śląsk Wrocław', 'SLW', 56, 2000, 2),
  'lks-lodz': c('lks-lodz', 'ŁKS Łódź', 'LKS', 54, 1800, 1.5),
  'polonia-warszawa': c('polonia-warszawa', 'Polonia Warszawa', 'PWA', 53, 1700, 1.5),
  'miedz-legnica': c('miedz-legnica', 'Miedź Legnica', 'MIE', 52, 1600, 1.5),
  'odra-opole': c('odra-opole', 'Odra Opole', 'ODR', 50, 1400, 1.5),
  'gornik-leczna': c('gornik-leczna', 'Górnik Łęczna', 'GLE', 49, 1350, 1.5),
  'stal-rzeszow': c('stal-rzeszow', 'Stal Rzeszów', 'STR', 51, 1500, 1.5),

  // Ekstraklasa — max ~2.5★ (daleko od Realu 5★)
  'lech-poznan': c('lech-poznan', 'Lech Poznań', 'LPO', 78, 5200, 2.5),
  'rakow': c('rakow', 'Raków Częstochowa', 'RAK', 77, 5000, 2.5),
  'legia': c('legia', 'Legia Warszawa', 'LEG', 76, 5100, 2.5),
  'jagiellonia': c('jagiellonia', 'Jagiellonia Białystok', 'JAG', 74, 4500, 2.5),
  'widzew': c('widzew', 'Widzew Łódź', 'WID', 73, 4300, 2),
  'pogon': c('pogon', 'Pogoń Szczecin', 'POG', 71, 4000, 2),
  'gornik-zabrze': c('gornik-zabrze', 'Górnik Zabrze', 'GOR', 72, 4100, 2),
  'cracovia': c('cracovia', 'Cracovia', 'CRA', 70, 3800, 2),
  'lechia': c('lechia', 'Lechia Gdańsk', 'LGD', 68, 3600, 2),
  'piast': c('piast', 'Piast Gliwice', 'PIA', 66, 3200, 2),
  'korona': c('korona', 'Korona Kielce', 'KOR', 65, 3000, 2),
  'zaglebie': c('zaglebie', 'Zagłębie Lubin', 'ZAG', 67, 3400, 2),
  'radomiak': c('radomiak', 'Radomiak Radom', 'RAD', 64, 2900, 2),
  'motor': c('motor', 'Motor Lublin', 'MOT', 63, 2800, 1.5),
  'gks-katowice': c('gks-katowice', 'GKS Katowice', 'KAT', 62, 2700, 1.5),
  'wisla-plock': c('wisla-plock', 'Wisła Płock', 'WPL', 61, 2600, 1.5),
  'arka': c('arka', 'Arka Gdynia', 'ARK', 60, 2500, 1.5),
  'termalica': c('termalica', 'Termalica Nieciecza', 'TNE', 58, 2300, 1.5),

  // Premier League — 3.5–5★
  'man-city': c('man-city', 'Manchester City', 'MCI', 93, 22000, 5, 'ENG'),
  'liverpool': c('liverpool', 'Liverpool', 'LIV', 91, 20000, 5, 'ENG'),
  'arsenal': c('arsenal', 'Arsenal', 'ARS', 89, 18000, 4.5, 'ENG'),
  'chelsea': c('chelsea', 'Chelsea', 'CHE', 87, 17000, 4.5, 'ENG'),
  'man-united': c('man-united', 'Manchester United', 'MUN', 85, 16000, 4, 'ENG'),
  'tottenham': c('tottenham', 'Tottenham', 'TOT', 83, 14000, 4, 'ENG'),
  'newcastle': c('newcastle', 'Newcastle', 'NEW', 80, 12000, 3.5, 'ENG'),
  'brighton': c('brighton', 'Brighton', 'BHA', 77, 10000, 3.5, 'ENG'),

  // La Liga — 3–5★
  'real-madrid': c('real-madrid', 'Real Madrid', 'RMA', 94, 23000, 5, 'ESP'),
  'barcelona': c('barcelona', 'Barcelona', 'BAR', 92, 21000, 5, 'ESP'),
  'atletico': c('atletico', 'Atlético Madrid', 'ATM', 88, 16000, 4.5, 'ESP'),
  'sevilla': c('sevilla', 'Sevilla', 'SEV', 81, 11000, 4, 'ESP'),
  'real-sociedad': c('real-sociedad', 'Real Sociedad', 'RSO', 78, 9500, 3.5, 'ESP'),
  'villarreal': c('villarreal', 'Villarreal', 'VIL', 77, 9000, 3.5, 'ESP'),
  'athletic': c('athletic', 'Athletic Bilbao', 'ATH', 76, 8500, 3.5, 'ESP'),
  'valencia': c('valencia', 'Valencia', 'VAL', 73, 7500, 3, 'ESP'),

  // Serie A — 3–5★
  'inter': c('inter', 'Inter Mediolan', 'INT', 91, 19000, 5, 'ITA'),
  'milan': c('milan', 'AC Milan', 'MIL', 88, 17000, 4.5, 'ITA'),
  'juventus': c('juventus', 'Juventus', 'JUV', 87, 16500, 4.5, 'ITA'),
  'napoli': c('napoli', 'Napoli', 'NAP', 85, 14000, 4, 'ITA'),
  'roma': c('roma', 'AS Roma', 'ROM', 83, 12000, 4, 'ITA'),
  'lazio': c('lazio', 'Lazio', 'LAZ', 80, 10500, 3.5, 'ITA'),
  'atalanta': c('atalanta', 'Atalanta', 'ATA', 81, 11000, 3.5, 'ITA'),
  'fiorentina': c('fiorentina', 'Fiorentina', 'FIO', 75, 8000, 3, 'ITA'),
}

/** tier 0 = top Europa; 1–4 = Polska */
export const LEAGUES: League[] = [
  {
    id: 'premier-league',
    name: 'Premier League',
    tier: 0,
    country: 'ENG',
    clubIds: [
      'man-city',
      'liverpool',
      'arsenal',
      'chelsea',
      'man-united',
      'tottenham',
      'newcastle',
      'brighton',
    ],
  },
  {
    id: 'la-liga',
    name: 'La Liga',
    tier: 0,
    country: 'ESP',
    clubIds: [
      'real-madrid',
      'barcelona',
      'atletico',
      'sevilla',
      'real-sociedad',
      'villarreal',
      'athletic',
      'valencia',
    ],
  },
  {
    id: 'serie-a',
    name: 'Serie A',
    tier: 0,
    country: 'ITA',
    clubIds: [
      'inter',
      'milan',
      'juventus',
      'napoli',
      'roma',
      'lazio',
      'atalanta',
      'fiorentina',
    ],
  },
  {
    id: 'liga-1',
    name: 'Ekstraklasa',
    tier: 1,
    country: 'PL',
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
  {
    id: 'liga-2',
    name: 'I liga',
    tier: 2,
    country: 'PL',
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
    id: 'liga-ii',
    name: 'II liga',
    tier: 3,
    country: 'PL',
    clubIds: [
      'znicz',
      'kalisz',
      'belchatow',
      'elblag',
      'wisla-pulawy',
      'polkowice',
      'stomil',
      'ruch',
    ],
  },
  {
    id: 'liga-3',
    name: 'III liga',
    tier: 4,
    country: 'PL',
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

export function getEffectiveStrength(
  clubId: string,
  mods: Record<string, number> = {},
): number {
  return getClub(clubId).strength + (mods[clubId] ?? 0)
}

/** Awans/spadek tylko w obrębie kraju. */
export function leagueByTier(
  tier: number,
  country: ClubCountry = 'PL',
): League | undefined {
  return LEAGUES.find((l) => l.tier === tier && l.country === country)
}

export function foreignTopLeagues(): League[] {
  return LEAGUES.filter((l) => l.tier === 0)
}

export const STARTER_CLUB_ID = 'hutnik-krakow'
export const STARTER_LEAGUE_ID = 'liga-3'

export function getLeagueForClub(clubId: string): League {
  for (const league of LEAGUES) {
    if (league.clubIds.includes(clubId)) return league
  }
  return getLeague(STARTER_LEAGUE_ID)
}

export function starterClubOptions(): Array<{ clubId: string; label: string; minOverall: number }> {
  const iii = getLeague('liga-3').clubIds.map((clubId) => ({
    clubId,
    label: `${getClub(clubId).name} · III liga`,
    minOverall: 45,
  }))
  const ii = getLeague('liga-ii').clubIds.map((clubId) => ({
    clubId,
    label: `${getClub(clubId).name} · II liga`,
    minOverall: 48,
  }))
  return [...iii, ...ii]
}

/** Losowe oferty startowe z II i III ligi (zawsze mix). */
export function pickStartingClubIds(count = 4): string[] {
  const iii = [...getLeague('liga-3').clubIds]
  const ii = [...getLeague('liga-ii').clubIds]
  const shuffle = (arr: string[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    return arr
  }
  shuffle(iii)
  shuffle(ii)
  const picked: string[] = []
  if (count >= 2) {
    picked.push(iii[0]!, ii[0]!)
  }
  const rest = shuffle([...iii.slice(1), ...ii.slice(1)])
  for (const id of rest) {
    if (picked.length >= count) break
    picked.push(id)
  }
  return picked.slice(0, Math.min(count, picked.length))
}

export function ovrForHigherLeague(tier: number): number {
  if (tier <= 0) return 72
  if (tier === 1) return 66
  if (tier === 2) return 58
  if (tier === 3) return 52
  return 48
}
