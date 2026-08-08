import type { Attributes, Position } from '../state/types'

export type EffectKey =
  | keyof Attributes
  | 'morale'
  | 'form'
  | 'reputation'
  | 'money'
  | 'staminaDrain'

export interface ChoiceEffect {
  key: EffectKey
  delta: number
}

export interface EventChoice {
  id: string
  label: string
  hint: string
  effects: ChoiceEffect[]
}

export interface CareerEvent {
  id: string
  title: string
  description: string
  weight: number
  positions?: Position[]
  minReputation?: number
  choices: EventChoice[]
}

export const CAREER_EVENTS: CareerEvent[] = [
  {
    id: 'gym',
    title: 'Trening siłowy',
    description: 'Trener każe zostać po treningu na siłownię. Nogom będzie ciężko, ale ciało mocniejsze.',
    weight: 3,
    choices: [
      {
        id: 'full',
        label: 'Zostaję do końca',
        hint: '+tempo, +kondycja, −forma',
        effects: [
          { key: 'pace', delta: 1 },
          { key: 'stamina', delta: 2 },
          { key: 'form', delta: -3 },
          { key: 'morale', delta: 1 },
        ],
      },
      {
        id: 'half',
        label: 'Robię połowę',
        hint: 'Mały wzrost, bez dużego zmęczenia',
        effects: [
          { key: 'stamina', delta: 1 },
          { key: 'form', delta: -1 },
        ],
      },
      {
        id: 'skip',
        label: 'Idę do domu',
        hint: '+forma, −morale sztabu',
        effects: [
          { key: 'form', delta: 2 },
          { key: 'morale', delta: -2 },
          { key: 'reputation', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'shooting',
    title: 'Sesja strzałów',
    description: 'Możesz zostać na boisku i powtórzyć setki uderzeń albo odpocząć przed meczem.',
    weight: 3,
    positions: ['NP', 'POM'],
    choices: [
      {
        id: 'extra',
        label: 'Zostaję na dodatkowe',
        hint: '+strzał, −kondycja',
        effects: [
          { key: 'shooting', delta: 2 },
          { key: 'stamina', delta: -1 },
          { key: 'form', delta: -2 },
        ],
      },
      {
        id: 'normal',
        label: 'Tylko trening grupowy',
        hint: 'Stabilna forma',
        effects: [{ key: 'form', delta: 1 }],
      },
      {
        id: 'rest',
        label: 'Wczesny odpoczynek',
        hint: '+forma, −strzał',
        effects: [
          { key: 'form', delta: 3 },
          { key: 'shooting', delta: -1 },
          { key: 'morale', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'passing',
    title: 'Ćwiczenia podań',
    description: 'Analityk pokazuje wideo: za dużo strat w środku pola. Czas na rondo.',
    weight: 3,
    positions: ['POM', 'ŚO'],
    choices: [
      {
        id: 'focus',
        label: 'Skupiam się na podaniach',
        hint: '+podanie',
        effects: [
          { key: 'passing', delta: 2 },
          { key: 'form', delta: -1 },
          { key: 'morale', delta: 1 },
        ],
      },
      {
        id: 'mix',
        label: 'Mieszam z dryblingiem',
        hint: '+tempo, +podanie',
        effects: [
          { key: 'passing', delta: 1 },
          { key: 'pace', delta: 1 },
          { key: 'form', delta: -2 },
        ],
      },
      {
        id: 'chat',
        label: 'Rozmawiam z kolegami',
        hint: '+morale',
        effects: [
          { key: 'morale', delta: 3 },
          { key: 'reputation', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'defending',
    title: 'Lekcja ustawiania',
    description: 'Asystent trenera chce z Tobą przejrzeć ustawienie w obronie.',
    weight: 3,
    positions: ['OB', 'ŚO'],
    choices: [
      {
        id: 'study',
        label: 'Uczę się ustawienia',
        hint: '+obrona',
        effects: [
          { key: 'defending', delta: 2 },
          { key: 'morale', delta: 1 },
        ],
      },
      {
        id: 'physical',
        label: 'Stawiam na siłę',
        hint: '+obrona, −tempo',
        effects: [
          { key: 'defending', delta: 2 },
          { key: 'pace', delta: -1 },
          { key: 'stamina', delta: 1 },
        ],
      },
      {
        id: 'skip',
        label: 'Wolę atak',
        hint: '+strzał, −obrona',
        effects: [
          { key: 'shooting', delta: 1 },
          { key: 'defending', delta: -1 },
          { key: 'morale', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'nightlife',
    title: 'Wyjście z ekipą',
    description: 'Kolega z szatni zaprasza na miasto. Mecz za trzy dni.',
    weight: 2,
    choices: [
      {
        id: 'party',
        label: 'Idę na całą noc',
        hint: '+morale, −forma, −reputacja',
        effects: [
          { key: 'morale', delta: 4 },
          { key: 'form', delta: -6 },
          { key: 'stamina', delta: -2 },
          { key: 'reputation', delta: -2 },
          { key: 'money', delta: -150 },
        ],
      },
      {
        id: 'short',
        label: 'Wpadam na godzinę',
        hint: '+morale, lekki spadek formy',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'form', delta: -2 },
          { key: 'money', delta: -50 },
        ],
      },
      {
        id: 'home',
        label: 'Zostaję w domu',
        hint: '+forma, −morale',
        effects: [
          { key: 'form', delta: 3 },
          { key: 'morale', delta: -1 },
          { key: 'reputation', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'interview',
    title: 'Wywiad lokalny',
    description: 'Dziennikarz pyta o ambicje. Twoje słowa mogą podnieść lub obniżyć napięcie w szatni.',
    weight: 2,
    choices: [
      {
        id: 'humble',
        label: 'Mówię skromnie',
        hint: '+reputacja, +morale',
        effects: [
          { key: 'reputation', delta: 2 },
          { key: 'morale', delta: 2 },
        ],
      },
      {
        id: 'ambitious',
        label: 'Obiecuję wielkie rzeczy',
        hint: '+reputacja, −morale szatni',
        effects: [
          { key: 'reputation', delta: 3 },
          { key: 'morale', delta: -2 },
        ],
      },
      {
        id: 'refuse',
        label: 'Odmawiam wywiadu',
        hint: 'Bez zmian',
        effects: [],
      },
    ],
  },
  {
    id: 'sponsor',
    title: 'Oferta sponsora',
    description: 'Lokalna firma chce, żebyś pojawił się na otwarciu sklepu.',
    weight: 2,
    minReputation: 15,
    choices: [
      {
        id: 'accept',
        label: 'Przyjmuję',
        hint: '+pieniądze, −forma',
        effects: [
          { key: 'money', delta: 400 },
          { key: 'form', delta: -2 },
          { key: 'reputation', delta: 1 },
        ],
      },
      {
        id: 'train',
        label: 'Wolę trening',
        hint: '+forma, +reputacja w klubie',
        effects: [
          { key: 'form', delta: 2 },
          { key: 'reputation', delta: 1 },
          { key: 'morale', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'injury_scare',
    title: 'Lekki uraz',
    description: 'Po treningu czujesz ciągnięcie w udzie. Fizjo proponuje plan.',
    weight: 2,
    choices: [
      {
        id: 'careful',
        label: 'Oszczędzam się',
        hint: '+forma, −tempo tymczasowo',
        effects: [
          { key: 'form', delta: 2 },
          { key: 'pace', delta: -1 },
          { key: 'stamina', delta: 1 },
        ],
      },
      {
        id: 'push',
        label: 'Gram przez ból',
        hint: 'Ryzyko: −kondycja, −forma',
        effects: [
          { key: 'form', delta: -4 },
          { key: 'stamina', delta: -2 },
          { key: 'morale', delta: 1 },
          { key: 'reputation', delta: 1 },
        ],
      },
      {
        id: 'physio',
        label: 'Pełna rehabilitacja',
        hint: '+kondycja, −pieniądze',
        effects: [
          { key: 'stamina', delta: 2 },
          { key: 'form', delta: 1 },
          { key: 'money', delta: -100 },
        ],
      },
    ],
  },
  {
    id: 'tactics',
    title: 'Spotkanie taktyczne',
    description: 'Trener omawia plan na weekend. Możesz zabrać głos albo siedzieć cicho.',
    weight: 2,
    choices: [
      {
        id: 'speak',
        label: 'Proponuję pomysł',
        hint: '+reputacja, +morale',
        effects: [
          { key: 'reputation', delta: 2 },
          { key: 'morale', delta: 2 },
          { key: 'passing', delta: 1 },
        ],
      },
      {
        id: 'listen',
        label: 'Słucham uważnie',
        hint: '+podanie',
        effects: [
          { key: 'passing', delta: 1 },
          { key: 'defending', delta: 1 },
        ],
      },
      {
        id: 'phone',
        label: 'Zeruję w telefon',
        hint: '−reputacja',
        effects: [
          { key: 'reputation', delta: -3 },
          { key: 'morale', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'family',
    title: 'Rodzina dzwoni',
    description: 'Rodzice chcą Cię zobaczyć w weekend. To koliduje z wyjazdem sparingowym.',
    weight: 1,
    choices: [
      {
        id: 'visit',
        label: 'Jadę do domu',
        hint: '+morale, −forma meczowa',
        effects: [
          { key: 'morale', delta: 4 },
          { key: 'form', delta: -2 },
          { key: 'money', delta: -80 },
        ],
      },
      {
        id: 'club',
        label: 'Zostaję z klubem',
        hint: '+reputacja, −morale',
        effects: [
          { key: 'reputation', delta: 2 },
          { key: 'morale', delta: -2 },
          { key: 'form', delta: 1 },
        ],
      },
    ],
  },
]

export function pickEvent(
  events: CareerEvent[],
  position: Position,
  reputation: number,
  rng: () => number = Math.random,
): CareerEvent {
  const eligible = events.filter((e) => {
    if (e.positions && !e.positions.includes(position)) return false
    if (e.minReputation != null && reputation < e.minReputation) return false
    return true
  })
  const pool = eligible.length ? eligible : events
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let roll = rng() * total
  for (const event of pool) {
    roll -= event.weight
    if (roll <= 0) return event
  }
  return pool[pool.length - 1]!
}
