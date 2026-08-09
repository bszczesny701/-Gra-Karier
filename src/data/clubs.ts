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
   * 0 = top (PL / La Liga / Serie A)
   * 1 = Ekstraklasa / Championship / Segunda
   * 2–4 = niższe ligi PL
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
  // III liga — 1★ (16 klubów)
  'hutnik-krakow': c('hutnik-krakow', 'Hutnik Kraków', 'HUT', 40, 700, 1),
  'polonia-bytom': c('polonia-bytom', 'Polonia Bytom', 'PBT', 42, 750, 1),
  'resovia': c('resovia', 'Resovia Rzeszów', 'RES', 41, 720, 1),
  'chojniczanka': c('chojniczanka', 'Chojniczanka', 'CHO', 39, 680, 1),
  'stal-stalowa': c('stal-stalowa', 'Stal Stalowa Wola', 'SSW', 43, 780, 1),
  'podbeskidzie': c('podbeskidzie', 'Podbeskidzie', 'POD', 44, 800, 1),
  'gks-tichy': c('gks-tichy', 'GKS Tychy', 'TYC', 45, 820, 1),
  'wieczysta': c('wieczysta', 'Wieczysta Kraków', 'WIE', 46, 850, 1),
  'garbarnia': c('garbarnia', 'Garbarnia Kraków', 'GAR', 38, 650, 1),
  'skra': c('skra', 'Skra Częstochowa', 'SKR', 39, 680, 1),
  'olimpia-grudziadz': c('olimpia-grudziadz', 'Olimpia Grudziądz', 'OGR', 41, 710, 1),
  'stilon': c('stilon', 'Stilon Gorzów', 'STI', 40, 690, 1),
  'rekord': c('rekord', 'Rekord Bielsko-Biała', 'REK', 42, 730, 1),
  'unia-tarnow': c('unia-tarnow', 'Unia Tarnów', 'UTA', 38, 640, 1),
  'carina': c('carina', 'Carina Gubin', 'CGU', 37, 620, 1),
  'swit': c('swit', 'Świt Szczecin', 'SWT', 40, 700, 1),

  // II liga — 1–1.5★ (18 klubów)
  'znicz': c('znicz', 'Znicz Pruszków', 'ZNI', 48, 1100, 1),
  'kalisz': c('kalisz', 'KKS Kalisz', 'KAL', 47, 1050, 1),
  'belchatow': c('belchatow', 'GKS Bełchatów', 'BEL', 49, 1150, 1.5),
  'elblag': c('elblag', 'Olimpia Elbląg', 'ELB', 45, 950, 1),
  'wisla-pulawy': c('wisla-pulawy', 'Wisła Puławy', 'WPU', 46, 1000, 1),
  'polkowice': c('polkowice', 'Górnik Polkowice', 'GPO', 44, 900, 1),
  'stomil': c('stomil', 'Stomil Olsztyn', 'STO', 47, 1020, 1),
  'ruch': c('ruch', 'Ruch Chorzów', 'RCH', 51, 1300, 1.5),
  'sosnowiec': c('sosnowiec', 'Zagłębie Sosnowiec', 'ZSO', 48, 1080, 1),
  'sandecja': c('sandecja', 'Sandecja Nowy Sącz', 'SAN', 49, 1120, 1.5),
  'hutnik-ii': c('hutnik-ii', 'Hutnik Warszawa', 'HWA', 45, 980, 1),
  'legia-ii': c('legia-ii', 'Legia II', 'LG2', 50, 1200, 1.5),
  'pogon-siedlce': c('pogon-siedlce', 'Pogoń Siedlce', 'PSI', 46, 1000, 1),
  'kks-ii': c('kks-ii', 'KKS Olimpia Zamość', 'OZA', 44, 920, 1),
  'wigry': c('wigry', 'Wigry Suwałki', 'WIG', 45, 960, 1),
  'gornik-polkowice-2': c('gornik-polkowice-2', 'Polonia Warszawa II', 'PW2', 43, 880, 1),
  'stal-rze-ii': c('stal-rze-ii', 'Stal Rzeszów II', 'SR2', 42, 850, 1),
  'radunia': c('radunia', 'Radunia Stężyca', 'RADU', 44, 900, 1),

  // I liga — 1.5–2★ (18 klubów)
  'wisla-krakow': c('wisla-krakow', 'Wisła Kraków', 'WIS', 58, 2200, 2),
  'slask-wroclaw': c('slask-wroclaw', 'Śląsk Wrocław', 'SLW', 56, 2000, 2),
  'lks-lodz': c('lks-lodz', 'ŁKS Łódź', 'LKS', 54, 1800, 1.5),
  'polonia-warszawa': c('polonia-warszawa', 'Polonia Warszawa', 'PWA', 53, 1700, 1.5),
  'miedz-legnica': c('miedz-legnica', 'Miedź Legnica', 'MIE', 52, 1600, 1.5),
  'odra-opole': c('odra-opole', 'Odra Opole', 'ODR', 50, 1400, 1.5),
  'gornik-leczna': c('gornik-leczna', 'Górnik Łęczna', 'GLE', 49, 1350, 1.5),
  'stal-rzeszow': c('stal-rzeszow', 'Stal Rzeszów', 'STR', 51, 1500, 1.5),
  'stal-mielec': c('stal-mielec', 'Stal Mielec', 'STM', 55, 1900, 2),
  'warta-poznan': c('warta-poznan', 'Warta Poznań', 'WAR', 54, 1750, 1.5),
  'chrobry': c('chrobry', 'Chrobry Głogów', 'CHG', 51, 1450, 1.5),
  'nieciecza-i': c('nieciecza-i', 'Bruk-Bet Nieciecza', 'BBN', 53, 1650, 1.5),
  'gks-tichy-i': c('gks-tichy-i', 'GKS Tychy (I)', 'TYI', 52, 1550, 1.5),
  'polonia-bytom-i': c('polonia-bytom-i', 'Polonia Bytom (I)', 'PBY', 49, 1350, 1.5),
  'resovia-i': c('resovia-i', 'Resovia (I)', 'REI', 48, 1280, 1.5),
  'podbeskidzie-i': c('podbeskidzie-i', 'Podbeskidzie (I)', 'PDI', 50, 1400, 1.5),
  'ruch-i': c('ruch-i', 'Ruch Chorzów (I)', 'RCI', 55, 1850, 2),
  'wisla-pulawy-i': c('wisla-pulawy-i', 'Wisła Puławy (I)', 'WPI', 48, 1300, 1.5),

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

  // Premier League — pełna 20 (3–5★)
  'man-city': c('man-city', 'Manchester City', 'MCI', 93, 22000, 5, 'ENG'),
  'liverpool': c('liverpool', 'Liverpool', 'LIV', 91, 20000, 5, 'ENG'),
  'arsenal': c('arsenal', 'Arsenal', 'ARS', 89, 18000, 4.5, 'ENG'),
  'chelsea': c('chelsea', 'Chelsea', 'CHE', 87, 17000, 4.5, 'ENG'),
  'man-united': c('man-united', 'Manchester United', 'MUN', 85, 16000, 4, 'ENG'),
  'tottenham': c('tottenham', 'Tottenham', 'TOT', 83, 14000, 4, 'ENG'),
  'aston-villa': c('aston-villa', 'Aston Villa', 'AVL', 82, 13000, 4, 'ENG'),
  'newcastle': c('newcastle', 'Newcastle', 'NEW', 80, 12000, 3.5, 'ENG'),
  'brighton': c('brighton', 'Brighton', 'BHA', 77, 10000, 3.5, 'ENG'),
  'west-ham': c('west-ham', 'West Ham', 'WHU', 76, 9500, 3.5, 'ENG'),
  'crystal-palace': c('crystal-palace', 'Crystal Palace', 'CRY', 74, 8500, 3, 'ENG'),
  'fulham': c('fulham', 'Fulham', 'FUL', 73, 8200, 3, 'ENG'),
  'brentford': c('brentford', 'Brentford', 'BRE', 72, 7800, 3, 'ENG'),
  'wolves': c('wolves', 'Wolverhampton', 'WOL', 71, 7500, 3, 'ENG'),
  'everton': c('everton', 'Everton', 'EVE', 70, 7200, 3, 'ENG'),
  'nottingham': c('nottingham', 'Nottingham Forest', 'NFO', 70, 7000, 3, 'ENG'),
  'bournemouth': c('bournemouth', 'Bournemouth', 'BOU', 69, 6800, 3, 'ENG'),
  'leicester': c('leicester', 'Leicester City', 'LEI', 68, 6500, 2.5, 'ENG'),
  'ipswich': c('ipswich', 'Ipswich Town', 'IPS', 66, 5800, 2.5, 'ENG'),
  'southampton': c('southampton', 'Southampton', 'SOU', 65, 5500, 2.5, 'ENG'),

  // La Liga — pełna 20 (2.5–5★)
  'real-madrid': c('real-madrid', 'Real Madrid', 'RMA', 94, 23000, 5, 'ESP'),
  'barcelona': c('barcelona', 'Barcelona', 'BAR', 92, 21000, 5, 'ESP'),
  'atletico': c('atletico', 'Atlético Madrid', 'ATM', 88, 16000, 4.5, 'ESP'),
  'athletic': c('athletic', 'Athletic Bilbao', 'ATH', 80, 10000, 3.5, 'ESP'),
  'real-sociedad': c('real-sociedad', 'Real Sociedad', 'RSO', 78, 9500, 3.5, 'ESP'),
  'villarreal': c('villarreal', 'Villarreal', 'VIL', 77, 9000, 3.5, 'ESP'),
  'real-betis': c('real-betis', 'Real Betis', 'BET', 76, 8800, 3.5, 'ESP'),
  'sevilla': c('sevilla', 'Sevilla', 'SEV', 75, 9000, 3.5, 'ESP'),
  'girona': c('girona', 'Girona', 'GIR', 74, 7500, 3, 'ESP'),
  'valencia': c('valencia', 'Valencia', 'VAL', 73, 7500, 3, 'ESP'),
  'celta': c('celta', 'Celta Vigo', 'CEL', 71, 6500, 3, 'ESP'),
  'osasuna': c('osasuna', 'Osasuna', 'OSA', 70, 6000, 3, 'ESP'),
  'mallorca': c('mallorca', 'Mallorca', 'MLL', 69, 5800, 3, 'ESP'),
  'rayo': c('rayo', 'Rayo Vallecano', 'RAY', 68, 5500, 3, 'ESP'),
  'getafe': c('getafe', 'Getafe', 'GET', 67, 5200, 2.5, 'ESP'),
  'las-palmas': c('las-palmas', 'Las Palmas', 'LPA', 66, 5000, 2.5, 'ESP'),
  'alaves': c('alaves', 'Deportivo Alavés', 'ALA', 65, 4800, 2.5, 'ESP'),
  'espanyol': c('espanyol', 'Espanyol', 'ESP', 65, 5000, 2.5, 'ESP'),
  'leganes': c('leganes', 'Leganés', 'LGN', 63, 4500, 2.5, 'ESP'),
  'valladolid': c('valladolid', 'Real Valladolid', 'VLL', 62, 4200, 2.5, 'ESP'),

  // Serie A — pełna 20 (2.5–5★)
  'inter': c('inter', 'Inter Mediolan', 'INT', 91, 19000, 5, 'ITA'),
  'milan': c('milan', 'AC Milan', 'MIL', 88, 17000, 4.5, 'ITA'),
  'juventus': c('juventus', 'Juventus', 'JUV', 87, 16500, 4.5, 'ITA'),
  'napoli': c('napoli', 'Napoli', 'NAP', 85, 14000, 4, 'ITA'),
  'atalanta': c('atalanta', 'Atalanta', 'ATA', 83, 12000, 4, 'ITA'),
  'roma': c('roma', 'AS Roma', 'ROM', 82, 11500, 4, 'ITA'),
  'lazio': c('lazio', 'Lazio', 'LAZ', 80, 10500, 3.5, 'ITA'),
  'fiorentina': c('fiorentina', 'Fiorentina', 'FIO', 78, 9000, 3.5, 'ITA'),
  'bologna': c('bologna', 'Bologna', 'BOL', 76, 8000, 3.5, 'ITA'),
  'torino': c('torino', 'Torino', 'TOR', 73, 7000, 3, 'ITA'),
  'udinese': c('udinese', 'Udinese', 'UDI', 71, 6200, 3, 'ITA'),
  'genoa': c('genoa', 'Genoa', 'GEN', 70, 6000, 3, 'ITA'),
  'monza': c('monza', 'Monza', 'MON', 69, 5800, 3, 'ITA'),
  'cagliari': c('cagliari', 'Cagliari', 'CAG', 68, 5500, 3, 'ITA'),
  'empoli': c('empoli', 'Empoli', 'EMP', 67, 5200, 2.5, 'ITA'),
  'verona': c('verona', 'Hellas Verona', 'HEL', 66, 5000, 2.5, 'ITA'),
  'lecce': c('lecce', 'Lecce', 'LEC', 65, 4800, 2.5, 'ITA'),
  'parma': c('parma', 'Parma', 'PAR', 65, 5000, 2.5, 'ITA'),
  'como': c('como', 'Como', 'COM', 64, 4700, 2.5, 'ITA'),
  'venezia': c('venezia', 'Venezia', 'VEN', 62, 4200, 2.5, 'ITA'),

  // Championship (1 liga angielska) — pełna 20
  'leeds': c('leeds', 'Leeds United', 'LEE', 78, 9000, 3, 'ENG'),
  'burnley': c('burnley', 'Burnley', 'BUR', 76, 8200, 3, 'ENG'),
  'sheffield-utd': c('sheffield-utd', 'Sheffield United', 'SHU', 74, 7800, 2.5, 'ENG'),
  'sunderland': c('sunderland', 'Sunderland', 'SUN', 73, 7500, 2.5, 'ENG'),
  'middlesbrough': c('middlesbrough', 'Middlesbrough', 'MID', 72, 7200, 2.5, 'ENG'),
  'norwich': c('norwich', 'Norwich City', 'NOR', 71, 7000, 2.5, 'ENG'),
  'west-brom': c('west-brom', 'West Bromwich', 'WBA', 71, 6900, 2.5, 'ENG'),
  'coventry': c('coventry', 'Coventry City', 'COV', 70, 6500, 2.5, 'ENG'),
  'watford': c('watford', 'Watford', 'WAT', 69, 6400, 2.5, 'ENG'),
  'hull': c('hull', 'Hull City', 'HUL', 68, 6000, 2, 'ENG'),
  'stoke': c('stoke', 'Stoke City', 'STK', 68, 5900, 2, 'ENG'),
  'bristol-city': c('bristol-city', 'Bristol City', 'BRC', 67, 5700, 2, 'ENG'),
  'preston': c('preston', 'Preston North End', 'PNE', 66, 5500, 2, 'ENG'),
  'blackburn': c('blackburn', 'Blackburn Rovers', 'BLB', 66, 5400, 2, 'ENG'),
  'qpr': c('qpr', 'Queens Park Rangers', 'QPR', 65, 5200, 2, 'ENG'),
  'millwall': c('millwall', 'Millwall', 'MLW', 65, 5100, 2, 'ENG'),
  'cardiff': c('cardiff', 'Cardiff City', 'CDF', 64, 5000, 2, 'ENG'),
  'swansea': c('swansea', 'Swansea City', 'SWA', 64, 4900, 2, 'ENG'),
  'derby': c('derby', 'Derby County', 'DER', 63, 4800, 2, 'ENG'),
  'plymouth': c('plymouth', 'Plymouth Argyle', 'PLY', 62, 4500, 2, 'ENG'),

  // Segunda División (1 liga hiszpańska) — pełna 20
  'almeria': c('almeria', 'UD Almería', 'ALM', 74, 7000, 2.5, 'ESP'),
  'granada': c('granada', 'Granada', 'GRA', 72, 6500, 2.5, 'ESP'),
  'cadiz': c('cadiz', 'Cádiz', 'CAD', 71, 6200, 2.5, 'ESP'),
  'levante': c('levante', 'Levante', 'LEV', 71, 6100, 2.5, 'ESP'),
  'oviedo': c('oviedo', 'Real Oviedo', 'OVI', 70, 5800, 2.5, 'ESP'),
  'sporting-gijon': c('sporting-gijon', 'Sporting Gijón', 'SPO', 69, 5600, 2, 'ESP'),
  'zaragoza': c('zaragoza', 'Real Zaragoza', 'ZAR', 69, 5500, 2, 'ESP'),
  'eibar': c('eibar', 'Eibar', 'EIB', 68, 5300, 2, 'ESP'),
  'racing-santander': c('racing-santander', 'Racing Santander', 'RAC', 67, 5100, 2, 'ESP'),
  'tenerife': c('tenerife', 'Tenerife', 'TEN', 66, 5000, 2, 'ESP'),
  'elche': c('elche', 'Elche', 'ELC', 66, 4900, 2, 'ESP'),
  'huesca': c('huesca', 'Huesca', 'HUE', 65, 4700, 2, 'ESP'),
  'deportivo': c('deportivo', 'Deportivo La Coruña', 'DEP', 65, 4800, 2, 'ESP'),
  'malaga': c('malaga', 'Málaga', 'MAL', 64, 4600, 2, 'ESP'),
  'mirandes': c('mirandes', 'Mirandés', 'MIR', 63, 4400, 2, 'ESP'),
  'burgos': c('burgos', 'Burgos CF', 'BGS', 63, 4300, 2, 'ESP'),
  'albacete': c('albacete', 'Albacete', 'ALB', 62, 4200, 2, 'ESP'),
  'cartagena': c('cartagena', 'FC Cartagena', 'CTG', 62, 4100, 2, 'ESP'),
  'cordoba': c('cordoba', 'Córdoba', 'COR', 61, 4000, 1.5, 'ESP'),
  'eldense': c('eldense', 'CD Eldense', 'ELD', 60, 3800, 1.5, 'ESP'),
}

/** tier 0 = top; 1 = 2. poziom (Ekstraklasa / Championship / Segunda); 2–4 = niższe PL */
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
      'aston-villa',
      'newcastle',
      'brighton',
      'west-ham',
      'crystal-palace',
      'fulham',
      'brentford',
      'wolves',
      'everton',
      'nottingham',
      'bournemouth',
      'leicester',
      'ipswich',
      'southampton',
    ],
  },
  {
    id: 'championship',
    name: 'Championship',
    tier: 1,
    country: 'ENG',
    clubIds: [
      'leeds',
      'burnley',
      'sheffield-utd',
      'sunderland',
      'middlesbrough',
      'norwich',
      'west-brom',
      'coventry',
      'watford',
      'hull',
      'stoke',
      'bristol-city',
      'preston',
      'blackburn',
      'qpr',
      'millwall',
      'cardiff',
      'swansea',
      'derby',
      'plymouth',
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
      'athletic',
      'real-sociedad',
      'villarreal',
      'real-betis',
      'sevilla',
      'girona',
      'valencia',
      'celta',
      'osasuna',
      'mallorca',
      'rayo',
      'getafe',
      'las-palmas',
      'alaves',
      'espanyol',
      'leganes',
      'valladolid',
    ],
  },
  {
    id: 'segunda',
    name: 'Segunda División',
    tier: 1,
    country: 'ESP',
    clubIds: [
      'almeria',
      'granada',
      'cadiz',
      'levante',
      'oviedo',
      'sporting-gijon',
      'zaragoza',
      'eibar',
      'racing-santander',
      'tenerife',
      'elche',
      'huesca',
      'deportivo',
      'malaga',
      'mirandes',
      'burgos',
      'albacete',
      'cartagena',
      'cordoba',
      'eldense',
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
      'atalanta',
      'roma',
      'lazio',
      'fiorentina',
      'bologna',
      'torino',
      'udinese',
      'genoa',
      'monza',
      'cagliari',
      'empoli',
      'verona',
      'lecce',
      'parma',
      'como',
      'venezia',
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
      'stal-mielec',
      'warta-poznan',
      'chrobry',
      'nieciecza-i',
      'gks-tichy-i',
      'polonia-bytom-i',
      'resovia-i',
      'podbeskidzie-i',
      'ruch-i',
      'wisla-pulawy-i',
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
      'sosnowiec',
      'sandecja',
      'hutnik-ii',
      'legia-ii',
      'pogon-siedlce',
      'kks-ii',
      'wigry',
      'gornik-polkowice-2',
      'stal-rze-ii',
      'radunia',
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
      'garbarnia',
      'skra',
      'olimpia-grudziadz',
      'stilon',
      'rekord',
      'unia-tarnow',
      'carina',
      'swit',
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
