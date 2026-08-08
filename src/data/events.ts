import type { Attributes, Position } from '../state/types'

export type EffectKey =
  | keyof Attributes
  | 'morale'
  | 'reputation'
  | 'money'
  | 'staminaDrain'
  /** Obniża ryzyko kontuzji w nadchodzącym sezonie (wartość dodatnia = bezpieczniej) */
  | 'injuryCare'
  /** Wpływ na rywalizację o skład w tym sezonie (ujemne = łatwiej grać) */
  | 'rivalPressure'

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
  speaker: string
  speakerRole: string
  /** Wiadomości od rozmówcy (bąbelki) */
  messages: string[]
  weight: number
  positions?: Position[]
  minReputation?: number
  choices: EventChoice[]
}

export const CAREER_EVENTS: CareerEvent[] = [
  {
    id: 'gym',
    title: 'Siłownia',
    speaker: 'Trener Kondycji',
    speakerRole: 'Sztab',
    messages: [
      'Zostajesz na siłownię czy spadasz do domu?',
      'Jak dasz radę do końca, tempo i kondycja pójdą w górę.',
    ],
    weight: 3,
    choices: [
      {
        id: 'full',
        label: 'Zostaję do końca 💪',
        hint: '+tempo, +kondycja, −morale',
        effects: [
          { key: 'pace', delta: 1 },
          { key: 'stamina', delta: 2 },
          { key: 'morale', delta: -2 },
        ],
      },
      {
        id: 'half',
        label: 'Zrobię połowę i lecę',
        hint: '+kondycja',
        effects: [{ key: 'stamina', delta: 1 }],
      },
      {
        id: 'skip',
        label: 'Dziś odpuszczam',
        hint: '+morale, −reputacja',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'reputation', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'shooting',
    title: 'Strzały',
    speaker: 'Trener bramkarzy',
    speakerRole: 'Sztab',
    messages: [
      'Możemy zostać na dodatkowe uderzenia.',
      'Albo oszczędzasz nogi przed weekendem — decyzja Twoja.',
    ],
    weight: 3,
    positions: ['NP', 'POM'],
    choices: [
      {
        id: 'extra',
        label: 'Zostaję, strzelam serię',
        hint: '+strzał, −kondycja',
        effects: [
          { key: 'shooting', delta: 2 },
          { key: 'stamina', delta: -2 },
        ],
      },
      {
        id: 'normal',
        label: 'Wystarczy grupowy trening',
        hint: '+kondycja',
        effects: [{ key: 'stamina', delta: 1 }],
      },
      {
        id: 'rest',
        label: 'Idę wcześniej odpocząć',
        hint: '+kondycja, −strzał',
        effects: [
          { key: 'stamina', delta: 2 },
          { key: 'shooting', delta: -1 },
          { key: 'morale', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'passing',
    title: 'Rondo',
    speaker: 'Analityk',
    speakerRole: 'Sztab',
    messages: [
      'Na wideo widać zbyt dużo strat w środku.',
      'Robimy rondo, czy wolisz pogadać z chłopakami?',
    ],
    weight: 3,
    positions: ['POM', 'ŚO'],
    choices: [
      {
        id: 'focus',
        label: 'Skupiam się na podaniach',
        hint: '+podanie',
        effects: [
          { key: 'passing', delta: 2 },
          { key: 'stamina', delta: -1 },
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
          { key: 'stamina', delta: -2 },
        ],
      },
      {
        id: 'chat',
        label: 'Wolę pogadać z ekipą',
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
    title: 'Ustawienie',
    speaker: 'Asystent',
    speakerRole: 'Sztab',
    messages: [
      'Chcę z Tobą przejrzeć ustawienie w obronie.',
      'Albo robimy siłę, albo lecisz w atak — co wybierasz?',
    ],
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
        label: 'Stawiam na siłę w starciach',
        hint: '+obrona, −tempo',
        effects: [
          { key: 'defending', delta: 2 },
          { key: 'pace', delta: -1 },
          { key: 'stamina', delta: 1 },
        ],
      },
      {
        id: 'skip',
        label: 'Wolę strefę ataku',
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
    title: 'Miasto',
    speaker: 'Kuba',
    speakerRole: 'Kolega z szatni',
    messages: [
      'Ej, lecimy na miasto po treningu 🍺',
      'Mecz za 3 dni, ale raz się żyje. Wpadasz?',
    ],
    weight: 2,
    choices: [
      {
        id: 'party',
        label: 'Idę na całą noc',
        hint: '+morale, −kondycja, −reputacja',
        effects: [
          { key: 'morale', delta: 4 },
          { key: 'stamina', delta: -4 },
          { key: 'reputation', delta: -2 },
          { key: 'money', delta: -150 },
        ],
      },
      {
        id: 'short',
        label: 'Wpadnę na godzinę',
        hint: '+morale, −kondycja',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'stamina', delta: -2 },
          { key: 'money', delta: -50 },
        ],
      },
      {
        id: 'home',
        label: 'Zostaję w domu',
        hint: '+kondycja, −morale, −ryzyko urazu',
        effects: [
          { key: 'stamina', delta: 3 },
          { key: 'morale', delta: -1 },
          { key: 'reputation', delta: 1 },
          { key: 'injuryCare', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'interview',
    title: 'Wywiad',
    speaker: 'Dziennikarz',
    speakerRole: 'Media',
    messages: [
      'Szybkie pytanie na mikrofon.',
      'Jakie masz ambicje w tym sezonie? Skromnie czy ostro?',
    ],
    weight: 2,
    choices: [
      {
        id: 'humble',
        label: 'Mówię skromnie, o pracy',
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
        label: 'Bez komentarza, sorry',
        hint: 'Bez zmian',
        effects: [],
      },
    ],
  },
  {
    id: 'sponsor',
    title: 'Sponsor',
    speaker: 'Agent',
    speakerRole: 'Twój agent',
    messages: [
      'Lokalna firma płaci za otwarcie sklepu.',
      'Łatwe pieniądze, ale tracisz popołudnie treningowe.',
    ],
    weight: 2,
    minReputation: 12,
    choices: [
      {
        id: 'accept',
        label: 'Biorę kasę',
        hint: '+pieniądze, −kondycja',
        effects: [
          { key: 'money', delta: 400 },
          { key: 'stamina', delta: -2 },
          { key: 'reputation', delta: 1 },
        ],
      },
      {
        id: 'train',
        label: 'Wolę trening',
        hint: '+kondycja, +reputacja',
        effects: [
          { key: 'stamina', delta: 2 },
          { key: 'reputation', delta: 1 },
          { key: 'morale', delta: 1 },
        ],
      },
      {
        id: 'negotiate',
        label: 'Negocjuję wyższą stawkę',
        hint: '+pieniądze, −reputacja',
        effects: [
          { key: 'money', delta: 550 },
          { key: 'reputation', delta: -1 },
          { key: 'stamina', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'injury_scare',
    title: 'Fizjo',
    speaker: 'Fizjo',
    speakerRole: 'Medyczny',
    messages: [
      'Czujesz to ciągnięcie w udzie?',
      'Mogę zestawić plan — albo grasz przez ból. Nie polecam.',
    ],
    weight: 2,
    choices: [
      {
        id: 'careful',
        label: 'Oszczędzam się',
        hint: '+kondycja, −tempo, −ryzyko urazu',
        effects: [
          { key: 'stamina', delta: 2 },
          { key: 'pace', delta: -1 },
          { key: 'injuryCare', delta: 2 },
        ],
      },
      {
        id: 'push',
        label: 'Gram przez ból',
        hint: '−kondycja, +reputacja, +ryzyko urazu',
        effects: [
          { key: 'stamina', delta: -4 },
          { key: 'morale', delta: 1 },
          { key: 'reputation', delta: 1 },
          { key: 'injuryCare', delta: -1 },
        ],
      },
      {
        id: 'physio',
        label: 'Pełna rehabilitacja',
        hint: '+kondycja, −pieniądze, −ryzyko urazu',
        effects: [
          { key: 'stamina', delta: 3 },
          { key: 'money', delta: -100 },
          { key: 'injuryCare', delta: 3 },
        ],
      },
    ],
  },
  {
    id: 'tactics',
    title: 'Taktyka',
    speaker: 'Trener',
    speakerRole: 'Pierwszy trener',
    messages: [
      'Omówimy plan na weekend.',
      'Masz pomysł? Albo słuchasz. Telefon schowaj.',
    ],
    weight: 2,
    choices: [
      {
        id: 'speak',
        label: 'Proponuję swój wariant',
        hint: '+reputacja, +podanie',
        effects: [
          { key: 'reputation', delta: 2 },
          { key: 'morale', delta: 2 },
          { key: 'passing', delta: 1 },
        ],
      },
      {
        id: 'listen',
        label: 'Słucham uważnie',
        hint: '+podanie, +obrona',
        effects: [
          { key: 'passing', delta: 1 },
          { key: 'defending', delta: 1 },
        ],
      },
      {
        id: 'phone',
        label: 'Zeruję w telefon…',
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
    title: 'Rodzina',
    speaker: 'Mama',
    speakerRole: 'Rodzina',
    messages: [
      'Synku, przyjedź w weekend, tęsknimy.',
      'Wiem, że masz sparing… ale naprawdę chcielibyśmy Cię zobaczyć.',
    ],
    weight: 2,
    choices: [
      {
        id: 'visit',
        label: 'Jadę do domu',
        hint: '+morale, −kondycja',
        effects: [
          { key: 'morale', delta: 4 },
          { key: 'stamina', delta: -2 },
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
          { key: 'stamina', delta: 1 },
        ],
      },
      {
        id: 'call',
        label: 'Zadzwonię dłużej wieczorem',
        hint: '+morale',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'reputation', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'captain',
    title: 'Kapitan',
    speaker: 'Kapitan',
    speakerRole: 'Szatnia',
    messages: [
      'Młodzi patrzą na Ciebie.',
      'Chcesz poprowadzić rozgrzewkę, czy wolisz siedzieć cicho?',
    ],
    weight: 2,
    minReputation: 18,
    choices: [
      {
        id: 'lead',
        label: 'Biorę rozgrzewkę',
        hint: '+reputacja, +morale',
        effects: [
          { key: 'reputation', delta: 3 },
          { key: 'morale', delta: 2 },
        ],
      },
      {
        id: 'support',
        label: 'Wspieram z boku',
        hint: '+morale',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'reputation', delta: 1 },
        ],
      },
      {
        id: 'avoid',
        label: 'Nie czuję się na siłach',
        hint: '−reputacja',
        effects: [{ key: 'reputation', delta: -2 }],
      },
    ],
  },
  {
    id: 'rival_chat',
    title: 'DM od rywala',
    speaker: 'Rywal',
    speakerRole: 'Przeciwnik',
    messages: [
      'W weekend Cię zjem 😂',
      'Albo boisz się odpisać?',
    ],
    weight: 2,
    choices: [
      {
        id: 'fire',
        label: 'Odpisuję ogniem',
        hint: '+morale, −reputacja',
        effects: [
          { key: 'morale', delta: 3 },
          { key: 'reputation', delta: -2 },
        ],
      },
      {
        id: 'class',
        label: 'Odpisuję z klasą',
        hint: '+reputacja',
        effects: [
          { key: 'reputation', delta: 2 },
          { key: 'morale', delta: 1 },
        ],
      },
      {
        id: 'ignore',
        label: 'Zostawiam na przeczytane',
        hint: '+kondycja (spokój)',
        effects: [
          { key: 'stamina', delta: 1 },
          { key: 'morale', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'diet',
    title: 'Kuchnia',
    speaker: 'Dietetyk',
    speakerRole: 'Sztab',
    messages: [
      'Menu na tydzień: albo rygor, albo luz.',
      'Co jesz — to grasz. Wybierasz?',
    ],
    weight: 2,
    choices: [
      {
        id: 'strict',
        label: 'Trzymam dietę 1:1',
        hint: '+kondycja, −morale, −ryzyko urazu',
        effects: [
          { key: 'stamina', delta: 2 },
          { key: 'pace', delta: 1 },
          { key: 'morale', delta: -2 },
          { key: 'injuryCare', delta: 2 },
        ],
      },
      {
        id: 'balance',
        label: 'Jedzenie + mały luz',
        hint: '+kondycja, +morale',
        effects: [
          { key: 'stamina', delta: 1 },
          { key: 'morale', delta: 1 },
          { key: 'injuryCare', delta: 1 },
        ],
      },
      {
        id: 'cheat',
        label: 'Cheat day z pizzą',
        hint: '+morale, −kondycja',
        effects: [
          { key: 'morale', delta: 3 },
          { key: 'stamina', delta: -2 },
          { key: 'money', delta: -40 },
        ],
      },
    ],
  },
  {
    id: 'agent_call',
    title: 'Telefon',
    speaker: 'Agent',
    speakerRole: 'Twój agent',
    messages: [
      'Słuchaj, kręcą się plotki o zainteresowaniu z wyższej ligi.',
      'Mogę naciskać, albo siedzisz cicho i robisz robotę. Co robimy?',
    ],
    weight: 2,
    minReputation: 20,
    choices: [
      {
        id: 'push',
        label: 'Naciskaj, chcę transfer',
        hint: '+reputacja, −morale klubu',
        effects: [
          { key: 'reputation', delta: 3 },
          { key: 'morale', delta: -2 },
        ],
      },
      {
        id: 'focus',
        label: 'Najpierw wyniki tu',
        hint: '+morale, +reputacja',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'reputation', delta: 1 },
          { key: 'stamina', delta: 1 },
        ],
      },
      {
        id: 'money',
        label: 'Pytaj o podwyżkę tu',
        hint: '+pieniądze',
        effects: [
          { key: 'money', delta: 300 },
          { key: 'reputation', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'fan',
    title: 'Fan',
    speaker: 'Kibic',
    speakerRole: 'Przy bramie',
    messages: [
      'Mistrzu, dasz autograf i fotę?',
      'Dzieciak czeka z koszulką, nie zawiedź go.',
    ],
    weight: 2,
    choices: [
      {
        id: 'yes',
        label: 'Zostaję, robię fotę',
        hint: '+reputacja, +morale',
        effects: [
          { key: 'reputation', delta: 2 },
          { key: 'morale', delta: 2 },
        ],
      },
      {
        id: 'quick',
        label: 'Szybki autograf i lecę',
        hint: '+reputacja',
        effects: [{ key: 'reputation', delta: 1 }],
      },
      {
        id: 'no',
        label: 'Przepraszam, spieszę się',
        hint: '−reputacja',
        effects: [
          { key: 'reputation', delta: -2 },
          { key: 'morale', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'gaming',
    title: 'Pokój',
    speaker: 'Bartek',
    speakerRole: 'Współlokator',
    messages: [
      'Nocny ranked? Albo idziesz spać jak profesjonalista.',
      'Ja i tak gram do 3:00 😅',
    ],
    weight: 2,
    choices: [
      {
        id: 'game',
        label: 'Gram do późna',
        hint: '+morale, −kondycja',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'stamina', delta: -3 },
        ],
      },
      {
        id: 'one',
        label: 'Jedna gra i śpię',
        hint: '+morale',
        effects: [
          { key: 'morale', delta: 1 },
          { key: 'stamina', delta: -1 },
        ],
      },
      {
        id: 'sleep',
        label: 'Idę spać o 22',
        hint: '+kondycja, −ryzyko urazu',
        effects: [
          { key: 'stamina', delta: 2 },
          { key: 'reputation', delta: 1 },
          { key: 'injuryCare', delta: 2 },
        ],
      },
    ],
  },
  {
    id: 'agent_higher_league',
    title: 'Agent: wyższa liga',
    speaker: 'Twój agent',
    speakerRole: 'Twój agent',
    messages: [
      'Słuchaj — mam sygnał z wyższej ligi.',
      'Mogę naciskać na transfer już teraz, albo zostajemy lojalni i budujemy wartość tutaj.',
    ],
    weight: 2,
    minReputation: 14,
    choices: [
      {
        id: 'push',
        label: 'Naciskaj na transfer',
        hint: '+reputacja, −morale (trener)',
        effects: [
          { key: 'reputation', delta: 3 },
          { key: 'morale', delta: -4 },
        ],
      },
      {
        id: 'loyal',
        label: 'Zostaję lojalny',
        hint: '+morale, lekka −reputacja',
        effects: [
          { key: 'morale', delta: 4 },
          { key: 'reputation', delta: -1 },
        ],
      },
      {
        id: 'wait',
        label: 'Poczekajmy do zimy',
        hint: '+reputacja',
        effects: [{ key: 'reputation', delta: 1 }],
      },
    ],
  },
  {
    id: 'coach_rival_fight',
    title: 'Walka o skład',
    speaker: 'Trener',
    speakerRole: 'Sztab',
    messages: [
      'Rywal na Twojej pozycji nie odpuszcza.',
      'Albo wchodzisz w tryb walki o „11”, albo akceptujesz rotację.',
    ],
    weight: 3,
    choices: [
      {
        id: 'fight',
        label: 'Walczę o miejsce',
        hint: 'łatwiej grać vs rywal, −kondycja',
        effects: [
          { key: 'rivalPressure', delta: -2 },
          { key: 'stamina', delta: -1 },
          { key: 'morale', delta: 2 },
        ],
      },
      {
        id: 'bench',
        label: 'Akceptuję ławkę',
        hint: '+morale, trudniej o minuty',
        effects: [
          { key: 'rivalPressure', delta: 1 },
          { key: 'morale', delta: 3 },
        ],
      },
      {
        id: 'extra',
        label: 'Zostaję po treningu',
        hint: '+podanie, walka o skład',
        effects: [
          { key: 'passing', delta: 1 },
          { key: 'rivalPressure', delta: -1 },
          { key: 'morale', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'captain_loyalty',
    title: 'Kapitan o lojalności',
    speaker: 'Kapitan',
    speakerRole: 'Szatnia',
    messages: [
      'Krążą plotki o ofertach.',
      'Drużyna potrzebuje Cię tu. Zostajesz z nami na poważnie?',
    ],
    weight: 2,
    minReputation: 16,
    choices: [
      {
        id: 'stay_loyal',
        label: 'Zostaję — to mój klub',
        hint: '+morale, +reputacja',
        effects: [
          { key: 'morale', delta: 5 },
          { key: 'reputation', delta: 2 },
        ],
      },
      {
        id: 'honest',
        label: 'Jeśli przyjdzie dobra oferta…',
        hint: '−morale szatni, +reputacja',
        effects: [
          { key: 'morale', delta: -3 },
          { key: 'reputation', delta: 2 },
        ],
      },
      {
        id: 'focus',
        label: 'Skupiam się na boisku',
        hint: '+kondycja',
        effects: [{ key: 'stamina', delta: 1 }],
      },
    ],
  },
  {
    id: 'agent_loan_idea',
    title: 'Agent: wypożyczenie',
    speaker: 'Twój agent',
    speakerRole: 'Twój agent',
    messages: [
      'Jak minuty będą słabe, rozważymy wypożyczenie.',
      'Niższa liga, więcej gry, wracasz mocniejszy. Co myślisz?',
    ],
    weight: 2,
    minReputation: 10,
    choices: [
      {
        id: 'open',
        label: 'Jestem otwarty',
        hint: '+reputacja (agent pracuje)',
        effects: [{ key: 'reputation', delta: 2 }],
      },
      {
        id: 'refuse_loan',
        label: 'Nie — walczę tutaj',
        hint: '+morale, walka o skład',
        effects: [
          { key: 'morale', delta: 3 },
          { key: 'rivalPressure', delta: -1 },
        ],
      },
      {
        id: 'money_first',
        label: 'Tylko jak pensja urośnie',
        hint: '+pieniądze (zaliczka agenta), −reputacja',
        effects: [
          { key: 'money', delta: 800 },
          { key: 'reputation', delta: -2 },
        ],
      },
    ],
  },
  {
    id: 'night_vs_rival',
    title: 'Noc czy rywal',
    speaker: 'Kolega z drużyny',
    speakerRole: 'Szatnia',
    messages: [
      'Ekipa idzie na miasto. Rywal na Twojej pozycji pewnie śpi przed treningiem.',
      'Co robisz?',
    ],
    weight: 2,
    choices: [
      {
        id: 'party',
        label: 'Lecę z ekipą',
        hint: '+morale, −kondycja, rywal mocniejszy',
        effects: [
          { key: 'morale', delta: 4 },
          { key: 'stamina', delta: -2 },
          { key: 'rivalPressure', delta: 1 },
        ],
      },
      {
        id: 'train',
        label: 'Trening pod rywala',
        hint: 'łatwiej o minuty, −morale',
        effects: [
          { key: 'rivalPressure', delta: -2 },
          { key: 'morale', delta: -2 },
          { key: 'stamina', delta: 1 },
        ],
      },
      {
        id: 'early',
        label: 'Wczesny sen',
        hint: '+kondycja, −ryzyko urazu',
        effects: [
          { key: 'stamina', delta: 2 },
          { key: 'injuryCare', delta: 1 },
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
