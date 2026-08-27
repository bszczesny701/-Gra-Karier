/**
 * Oficjalne / Transfermarkt citizenship (primary) dla seedowanych nazwisk Ekstraklasy.
 * Brak w mapie → PL w makeFromSeed.
 */
export const OFFICIAL_NATIONALITY: Record<string, string> = {
  // Lech
  'Joel Pereira': 'PT',
  'Antonio Milić': 'HR',
  'Alex Douglas': 'SE',
  'Filip Dagerstål': 'SE',
  'Rúben Pereira': 'PT',
  'Ali Gholizadeh': 'IR',
  'Dino Hotić': 'BA',
  'Afonso Sousa': 'PT',
  'Patrik Wålemark': 'SE',
  'Mikael Ishak': 'SE',
  'Daniel Håkans': 'FI',
  'Bryan Fiabema': 'NO',
  'Gísli Thordarson': 'IS',
  'Kristoffer Velde': 'NO',
  'Sammy Baidoo': 'SE',
  'Ian Hoffmann': 'US',
  // Raków
  'Zoran Arsenić': 'HR',
  'Stratos Svarnas': 'GR',
  'Fran Tudor': 'HR',
  'Jean Carlos': 'BR',
  'Milan Rundić': 'RS',
  'Gustav Berggren': 'SE',
  'Ben Lederman': 'US',
  'Vladyslav Kochergin': 'UA',
  'John Yeboah': 'EC',
  'Leonardo Rocha': 'PT',
  'Ante Crnac': 'HR',
  'Erick Otieno': 'KE',
  'Srdjan Plavsic': 'RS',
  'Ivi López': 'ES',
  'Jonatan Braut Brunes': 'NO',
  // Legia
  'Vladan Kovačević': 'BA',
  'Radovan Pankov': 'RS',
  'Ryoya Morishita': 'JP',
  'Steve Kapuadi': 'CD',
  'Juergen Elitim': 'CO',
  'Luquinhas': 'BR',
  'Marc Gual': 'ES',
  'Blaž Kramer': 'SI',
  'Miguel Sousa': 'PT',
  'Maxi Oyedele': 'PL',
  'Claude Gonçalves': 'PT',
  'Rúben Vinagre': 'PT',
  'Gabryel': 'BR',
  // Jagiellonia / others common foreigners
  'Jesus Imaz': 'ES',
  'Jesús Imaz': 'ES',
  'Taras Romanczuk': 'PL',
  'Afimico Pululu': 'AO',
  'Kristoffer Hansen': 'NO',
  'Nené': 'PT',
  'Jarosław Kubicki': 'PL',
  // Termalica / Nieciecza
  'Artem Putivtsev': 'UA',
  'Morgan Fassbender': 'DE',
  'Lukas Spendlhofer': 'AT',
  'Vlastimir Jovanović': 'BA',
  'Kamil Zapolnik': 'PL',
  'Roman Gergel': 'SK',
  'Michal Hubinek': 'CZ',
  'Taras Zaviyskyi': 'UA',
  'Michal Bezpalec': 'CZ',
  'Andriy Dombrovskyi': 'UA',
  'Diego Almeida': 'PT',
  'Chino': 'BR',
}

export function nationalityForSeedName(name: string, fallback = 'PL'): string {
  return OFFICIAL_NATIONALITY[name] ?? fallback
}
