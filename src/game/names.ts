/** All clubs and players are fictional. */

export interface TeamSeed {
  name: string;
  shortName: string;
  color: string;
  accent: string;
  /** 40-90. Drives squad quality, budget and board expectations. */
  reputation: number;
}

export const TEAM_SEEDS: TeamSeed[] = [
  { name: 'Northgate United', shortName: 'NGU', color: '#d92d3c', accent: '#ffffff', reputation: 86 },
  { name: 'Ashford City', shortName: 'ASH', color: '#1e63d0', accent: '#8fc0ff', reputation: 84 },
  { name: 'Riverton FC', shortName: 'RIV', color: '#0f9d58', accent: '#ffffff', reputation: 80 },
  { name: 'Kingsmere Rovers', shortName: 'KMR', color: '#6b3fa0', accent: '#f0d24a', reputation: 77 },
  { name: 'Port Halden', shortName: 'PHL', color: '#e07a1f', accent: '#1a1a1a', reputation: 73 },
  { name: 'Marlow Athletic', shortName: 'MAR', color: '#0e7c86', accent: '#ffffff', reputation: 70 },
  { name: 'Cranfield Wanderers', shortName: 'CRW', color: '#b8912e', accent: '#2b2b2b', reputation: 66 },
  { name: 'Selby Town', shortName: 'SEL', color: '#c0392b', accent: '#f5c518', reputation: 63 },
  { name: 'Downside Albion', shortName: 'DSA', color: '#2f4f8f', accent: '#e8e8e8', reputation: 60 },
  { name: 'Ravensworth', shortName: 'RVW', color: '#3c3c46', accent: '#9fd356', reputation: 57 },
  { name: 'Elderbrook FC', shortName: 'ELD', color: '#8e2f5e', accent: '#ffd9ec', reputation: 54 },
  { name: 'Whitlow Park', shortName: 'WHP', color: '#146b3a', accent: '#f2f2f2', reputation: 51 },
  { name: 'Barrowdale', shortName: 'BRD', color: '#7a5230', accent: '#ffd08a', reputation: 48 },
  { name: 'Fenwick County', shortName: 'FEN', color: '#1f5f99', accent: '#ffcf40', reputation: 46 },
  { name: 'Oakvale Rangers', shortName: 'OAK', color: '#4c6b22', accent: '#e6f2c2', reputation: 44 },
  { name: 'Stonegate Rovers', shortName: 'STG', color: '#555f6e', accent: '#ff8c42', reputation: 42 },
];

const FIRST_NAMES = [
  'Adam', 'Aiden', 'Alvaro', 'Andre', 'Anton', 'Arne', 'Bastien', 'Ben', 'Bruno', 'Callum',
  'Casper', 'Cesar', 'Dane', 'Dario', 'Declan', 'Dennis', 'Diego', 'Eddie', 'Elias', 'Emil',
  'Enzo', 'Ethan', 'Fabio', 'Felix', 'Finn', 'Florian', 'Gabriel', 'Gustav', 'Hakim', 'Harvey',
  'Henrik', 'Hugo', 'Idris', 'Ivan', 'Jamal', 'Jasper', 'Joel', 'Jonas', 'Julian', 'Kai',
  'Karim', 'Kelvin', 'Lars', 'Leo', 'Lucas', 'Luka', 'Malik', 'Marco', 'Mateo', 'Mattis',
  'Milan', 'Nathan', 'Nico', 'Noah', 'Olivier', 'Omar', 'Oscar', 'Pau', 'Pedro', 'Quinn',
  'Rafa', 'Reece', 'Remi', 'Rory', 'Ruben', 'Samir', 'Sasha', 'Sebastian', 'Simon', 'Stefan',
  'Teo', 'Thiago', 'Tobias', 'Tom', 'Tristan', 'Viktor', 'Vince', 'Yannick', 'Youssef', 'Zeno',
];

const LAST_NAMES = [
  'Abrahams', 'Almeida', 'Andersen', 'Bakker', 'Baptiste', 'Bergman', 'Bianchi', 'Boateng',
  'Brandt', 'Cardoso', 'Carver', 'Castille', 'Chowdhury', 'Colbert', 'Corvi', 'Dahl',
  'Delacroix', 'Doherty', 'Eriksen', 'Fabbri', 'Falk', 'Ferreira', 'Fischer', 'Gallagher',
  'Gomes', 'Granger', 'Haas', 'Halvorsen', 'Hartley', 'Herrera', 'Holm', 'Ibarra',
  'Jansen', 'Jelic', 'Kaczmarek', 'Keane', 'Kimura', 'Kovac', 'Laurent', 'Lindgren',
  'Machado', 'Maes', 'Marchetti', 'Mbaye', 'Meier', 'Molnar', 'Moreau', 'Nakamura',
  'Nilsen', 'Nowak', 'Okafor', 'Olsen', 'Ortiz', 'Palmer', 'Pereira', 'Petrov',
  'Quintero', 'Rasmussen', 'Reyes', 'Ricci', 'Rojas', 'Salomon', 'Sandberg', 'Schneider',
  'Sorensen', 'Steiner', 'Sylla', 'Tavares', 'Thorne', 'Toure', 'Vargas', 'Verhoeven',
  'Vidal', 'Vogel', 'Waller', 'Weiss', 'Whitfield', 'Yilmaz', 'Zanetti', 'Ziegler',
];

const NATIONS = [
  'ENG', 'ESP', 'FRA', 'GER', 'ITA', 'NED', 'POR', 'BRA', 'ARG', 'BEL',
  'DEN', 'SWE', 'NOR', 'CRO', 'SRB', 'POL', 'JPN', 'KOR', 'SEN', 'MAR',
];

export function randomName(pick: <T>(items: readonly T[]) => T): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

export function randomNation(pick: <T>(items: readonly T[]) => T): string {
  return pick(NATIONS);
}
