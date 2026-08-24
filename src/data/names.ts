/**
 * 이름 풀. 모든 구단명·선수명은 가상이며, 실존 인물이나 구단과 관계가 없습니다.
 * 도시명은 실재하는 지명을 쓰되 구단명은 접미 패턴으로 조합해 만듭니다.
 */

export type NamePoolId =
  | 'britain' | 'iberia' | 'italy' | 'germanic' | 'france' | 'lowlands'
  | 'turkey' | 'slavic' | 'greece' | 'nordic' | 'brazil' | 'hispanic'
  | 'arab' | 'maghreb' | 'japan' | 'korea' | 'usa';

export interface NamePool {
  first: string[];
  last: string[];
  cities: string[];
  /** `{}` 자리에 도시명이 들어갑니다. */
  clubPatterns: string[];
}

export const NAME_POOLS: Record<NamePoolId, NamePool> = {
  britain: {
    first: ['Alfie', 'Archie', 'Ben', 'Callum', 'Charlie', 'Connor', 'Dean', 'Declan', 'Dylan', 'Elliot', 'Ethan', 'Finlay', 'George', 'Harvey', 'Jack', 'Jamie', 'Jordan', 'Kieran', 'Lewis', 'Liam', 'Mason', 'Nathan', 'Oliver', 'Owen', 'Reece', 'Rory', 'Ryan', 'Toby'],
    last: ['Abbott', 'Ashworth', 'Bramley', 'Carver', 'Chadwick', 'Corbett', 'Doherty', 'Ellery', 'Fairbrother', 'Gallagher', 'Granger', 'Hartley', 'Holloway', 'Kendrick', 'Larkin', 'Maddox', 'Marsden', 'Nesbitt', 'Ogden', 'Palmer', 'Quigley', 'Rowntree', 'Sedgwick', 'Sowerby', 'Thorne', 'Vickers', 'Waller', 'Whitfield', 'Winterburn', 'Yates', 'Ainsley', 'Buckley', 'Copeland', 'Dalgleish'],
    cities: ['Ashford', 'Northgate', 'Riverton', 'Kingsmere', 'Selby', 'Marlow', 'Cranfield', 'Whitlow', 'Barrowdale', 'Fenwick', 'Oakvale', 'Stonegate', 'Elderbrook', 'Ravensworth', 'Dunmere', 'Hollingsworth', 'Pentland', 'Garrow'],
    clubPatterns: ['{} United', '{} City', '{} Rovers', '{} Town', '{} Athletic', '{} FC', '{} Wanderers', '{} Albion', '{} County', '{} Thistle'],
  },
  iberia: {
    first: ['Alvaro', 'Andres', 'Bruno', 'Carlos', 'Cesar', 'Dani', 'Diogo', 'Eduardo', 'Fabio', 'Gonzalo', 'Hugo', 'Iker', 'Ivan', 'Joaquin', 'Jorge', 'Luis', 'Manuel', 'Marco', 'Nuno', 'Pablo', 'Pau', 'Pedro', 'Rafael', 'Raul', 'Ruben', 'Sergio', 'Tiago', 'Vicente'],
    last: ['Aguirre', 'Almeida', 'Barbosa', 'Cabral', 'Cardoso', 'Carvalho', 'Castillo', 'Delgado', 'Esteban', 'Ferreira', 'Fonseca', 'Gallego', 'Gomes', 'Guerrero', 'Herrera', 'Iglesias', 'Lourenco', 'Machado', 'Mendes', 'Montoya', 'Navarro', 'Olivares', 'Pereira', 'Quintela', 'Ramos', 'Reguero', 'Salgado', 'Sanabria', 'Tavares', 'Ubeda', 'Valverde', 'Vilar', 'Zambrano', 'Bermejo'],
    cities: ['Valdemar', 'Alcantara', 'Rioseco', 'Montalvo', 'Puertaluz', 'Santamar', 'Cabo Verde', 'Ribalonga', 'Torreblanca', 'Estremoz', 'Vilalba', 'Serracorda', 'Aldeanova', 'Casarosa', 'Peniche', 'Guimarosa', 'Barroalta', 'Navacampo'],
    clubPatterns: ['{} CF', 'Real {}', 'Atlético {}', 'Deportivo {}', '{} FC', 'Sporting {}', 'SC {}', 'Académica {}', 'Racing {}', 'Unión {}'],
  },
  italy: {
    first: ['Alessio', 'Andrea', 'Antonio', 'Cristian', 'Dario', 'Davide', 'Emanuele', 'Enrico', 'Fabio', 'Federico', 'Filippo', 'Gabriele', 'Giacomo', 'Giulio', 'Leonardo', 'Lorenzo', 'Luca', 'Marco', 'Matteo', 'Mattia', 'Nicolo', 'Paolo', 'Riccardo', 'Samuele', 'Simone', 'Stefano', 'Tommaso', 'Vincenzo'],
    last: ['Amato', 'Barbieri', 'Bianchi', 'Caputo', 'Cattaneo', 'Corvi', 'Damico', 'Esposito', 'Fabbri', 'Ferrari', 'Gallo', 'Gentile', 'Grasso', 'Longhi', 'Lombardi', 'Marchetti', 'Mazzola', 'Montanari', 'Neri', 'Orlandi', 'Pagano', 'Parisi', 'Quaranta', 'Ricci', 'Rinaldi', 'Sartori', 'Silvestri', 'Tosi', 'Vitale', 'Zanetti', 'Bellini', 'Costa', 'Donati', 'Fontana'],
    cities: ['Montalcino', 'Valdarno', 'Castelnuovo', 'Portoverde', 'Serravalle', 'Rocchetta', 'Alboreto', 'Fiumaldo', 'Belmonte', 'Casalmare', 'Terracorta', 'Novaluce', 'Sant Aldo', 'Vallombra', 'Pratomaggio', 'Marinella', 'Colledoro', 'Ronchiglia'],
    clubPatterns: ['{} Calcio', 'AC {}', 'US {}', '{} 1908', 'Inter {}', '{} FC', 'Virtus {}', 'Pro {}', '{} 1919', 'Unione {}'],
  },
  germanic: {
    first: ['Andreas', 'Bastian', 'Benedikt', 'Christoph', 'Daniel', 'David', 'Dominik', 'Fabian', 'Felix', 'Florian', 'Jannik', 'Jonas', 'Julian', 'Kai', 'Leon', 'Lukas', 'Marcel', 'Markus', 'Matthias', 'Maximilian', 'Moritz', 'Niklas', 'Patrick', 'Philipp', 'Sebastian', 'Simon', 'Tobias', 'Tim'],
    last: ['Adler', 'Bauer', 'Baumgartner', 'Brandt', 'Dietrich', 'Ehrlich', 'Fischer', 'Freund', 'Gruber', 'Haas', 'Hofmann', 'Jung', 'Kessler', 'Kramer', 'Lindner', 'Maier', 'Meinhardt', 'Neumann', 'Oberst', 'Pfeiffer', 'Reuter', 'Riedel', 'Schneider', 'Schuster', 'Seidel', 'Steiner', 'Vogel', 'Wagner', 'Weiss', 'Ziegler', 'Baldauf', 'Eichner', 'Kolbe', 'Rothbauer'],
    cities: ['Rheinfeld', 'Altenburg', 'Königstal', 'Neustadt', 'Sonnenberg', 'Waldheim', 'Steinbach', 'Grunau', 'Wolfsheim', 'Lindental', 'Hohenbrunn', 'Eisenfurt', 'Ravensbach', 'Kirchsee', 'Bergstadt', 'Almtal', 'Traunwald', 'Innfeld'],
    clubPatterns: ['FC {}', 'SV {}', '{} 04', 'Borussia {}', '{} 1899', 'SK {}', 'TSV {}', 'Austria {}', 'VfL {}', 'Eintracht {}'],
  },
  france: {
    first: ['Alexandre', 'Antoine', 'Bastien', 'Benjamin', 'Clement', 'Corentin', 'Damien', 'Enzo', 'Florent', 'Gaetan', 'Hugo', 'Jules', 'Kevin', 'Loic', 'Lucas', 'Mathis', 'Maxime', 'Nolan', 'Olivier', 'Quentin', 'Remi', 'Romain', 'Samuel', 'Theo', 'Thibault', 'Valentin', 'Yanis', 'Yohan'],
    last: ['Aubert', 'Barbier', 'Bonnet', 'Chevalier', 'Colbert', 'Delacroix', 'Dumas', 'Fabre', 'Fournier', 'Gauthier', 'Guillard', 'Hebert', 'Jourdain', 'Laurent', 'Lemoine', 'Marchand', 'Mercier', 'Moreau', 'Nadeau', 'Olivier', 'Pelletier', 'Perrin', 'Renaud', 'Rousseau', 'Sauvage', 'Thibault', 'Vasseur', 'Vidal', 'Ancel', 'Boucher', 'Cordier', 'Duval', 'Faure', 'Girard'],
    cities: ['Valcourt', 'Beaumont', 'Saint-Clair', 'Montrouge', 'Rocheval', 'Bellerive', 'Chantonne', 'Argenteau', 'Vieuxpont', 'Clairmont', 'Fontanelle', 'Marbourg', 'Lascaux', 'Puylaurens', 'Sereine', 'Aubignac', 'Verdelune', 'Hautvent'],
    clubPatterns: ['Olympique {}', '{} FC', 'AS {}', 'RC {}', 'Stade {}', 'FC {}', '{} SC', 'US {}', 'Racing {}', 'AJ {}'],
  },
  lowlands: {
    first: ['Bas', 'Bram', 'Daan', 'Dries', 'Finn', 'Gijs', 'Hendrik', 'Jasper', 'Jelle', 'Jeroen', 'Joost', 'Koen', 'Lars', 'Lennart', 'Luuk', 'Maarten', 'Mats', 'Niels', 'Pieter', 'Ruben', 'Sander', 'Sem', 'Stijn', 'Thijs', 'Tim', 'Tom', 'Wout', 'Youri'],
    last: ['Aerts', 'Bakker', 'Beckers', 'Bosch', 'Claes', 'Dekker', 'Delvaux', 'Devries', 'Groen', 'Hendriks', 'Jansen', 'Kuipers', 'Lambrecht', 'Maes', 'Meulen', 'Nijland', 'Peeters', 'Pauwels', 'Rietveld', 'Sanders', 'Smulders', 'Timmers', 'Vandael', 'Verhoeven', 'Vermeulen', 'Visser', 'Willems', 'Zwart', 'Boonen', 'Coppens', 'Hulst', 'Onnink', 'Rademaker', 'Stevens'],
    cities: ['Veldhoven', 'Roosdaal', 'Nieuwpoort', 'Zandhoven', 'Waterloo', 'Bergenhout', 'Oosterlee', 'Meerdonk', 'Lindenhof', 'Halsteren', 'Duinkerk', 'Weststrand', 'Gravenhof', 'Rietveld', 'Steenbeek', 'Aalsterk', 'Hoogeveen', 'Zonnebeke'],
    clubPatterns: ['{} FC', 'SC {}', 'FC {}', 'AZ {}', 'KV {}', 'RSC {}', 'KAA {}', '{} United', 'VV {}', 'Sparta {}'],
  },
  turkey: {
    first: ['Ahmet', 'Arda', 'Baris', 'Berk', 'Burak', 'Cem', 'Cenk', 'Deniz', 'Emre', 'Enes', 'Ferhat', 'Furkan', 'Hakan', 'Halil', 'Ismail', 'Kaan', 'Kerem', 'Kubilay', 'Levent', 'Mert', 'Murat', 'Okan', 'Onur', 'Ozan', 'Serkan', 'Taner', 'Ugur', 'Yusuf'],
    last: ['Akgun', 'Aydin', 'Bayrak', 'Cetin', 'Coskun', 'Demir', 'Dogan', 'Erdogmus', 'Ersoy', 'Guler', 'Gunes', 'Kaplan', 'Karaca', 'Kaya', 'Kilic', 'Korkmaz', 'Ozdemir', 'Ozturk', 'Polat', 'Sahin', 'Sarikaya', 'Simsek', 'Tekin', 'Toprak', 'Ulusoy', 'Yalcin', 'Yildirim', 'Yilmaz', 'Aslan', 'Bulut', 'Cakir', 'Duman', 'Kurt', 'Sonmez'],
    cities: ['Karaburun', 'Yesilkoy', 'Altinova', 'Denizkent', 'Akcahisar', 'Gultepe', 'Sarigol', 'Bozyaka', 'Kayabasi', 'Cinarli', 'Elmadag', 'Findikli', 'Gokdere', 'Halkali', 'Ilicakoy', 'Kumburgaz', 'Narlica', 'Tasova'],
    clubPatterns: ['{} SK', '{}spor', '{} FK', '{} Birlik', 'Genclik {}', '{} Kulubu', 'Yeni {}', '{} Idman'],
  },
  slavic: {
    first: ['Andriy', 'Bohdan', 'Danylo', 'Denys', 'Dmytro', 'Ihor', 'Ivan', 'Kyrylo', 'Maksym', 'Mykola', 'Nazar', 'Oleh', 'Oleksandr', 'Ostap', 'Pavlo', 'Roman', 'Ruslan', 'Serhiy', 'Stanislav', 'Taras', 'Vadym', 'Valeriy', 'Viktor', 'Vitaliy', 'Vlad', 'Volodymyr', 'Yaroslav', 'Yuriy'],
    last: ['Bondarenko', 'Chornyi', 'Danyliuk', 'Fedorov', 'Havrylenko', 'Hrytsenko', 'Ivanchuk', 'Kalynych', 'Kovalenko', 'Kravets', 'Lysenko', 'Marchuk', 'Melnyk', 'Moroz', 'Nesterov', 'Ohiienko', 'Pavliuk', 'Petrenko', 'Poliakov', 'Rudenko', 'Savchenko', 'Shevchuk', 'Sydorenko', 'Tkachenko', 'Vasylenko', 'Yatsenko', 'Zahorui', 'Zinchenko', 'Bilyk', 'Datsyk', 'Hordiienko', 'Kushnir', 'Lytvyn', 'Prykhodko'],
    cities: ['Bilohorod', 'Chornomorsk', 'Dniprove', 'Halychyn', 'Kalynivka', 'Lisove', 'Novosilka', 'Ostroverkh', 'Pidhirya', 'Ridnyi', 'Solotvyn', 'Verkhove', 'Zarichne', 'Zolotolug', 'Yasnohir', 'Krynytsia', 'Marynivka', 'Ternovyi'],
    clubPatterns: ['FC {}', 'SC {}', 'Dynamo {}', '{} United', 'Arsenal {}', '{} FK', 'Metal {}', 'Nyva {}'],
  },
  greece: {
    first: ['Alexandros', 'Andreas', 'Christos', 'Dimitris', 'Fotis', 'Georgios', 'Giannis', 'Ilias', 'Kostas', 'Lefteris', 'Manolis', 'Marios', 'Michalis', 'Nikos', 'Panagiotis', 'Petros', 'Sotiris', 'Spyros', 'Stavros', 'Stefanos', 'Tasos', 'Thanasis', 'Theodoros', 'Vangelis', 'Vasilis', 'Yiorgos', 'Zisis', 'Antonis'],
    last: ['Alexiou', 'Andreadis', 'Chatzis', 'Dimou', 'Fotiadis', 'Galanis', 'Ioannou', 'Kalogeras', 'Karagounis', 'Katsaros', 'Kokkinos', 'Lambrou', 'Makris', 'Manolas', 'Nikolaou', 'Oikonomou', 'Panagos', 'Papadakis', 'Pappas', 'Raptis', 'Samaras', 'Sideris', 'Stavrou', 'Theodorou', 'Tsakalis', 'Vlachos', 'Xenakis', 'Zafeiris', 'Drosos', 'Konstas', 'Meletis', 'Roussos', 'Sarris', 'Vergos'],
    cities: ['Kalithea', 'Nea Petra', 'Loutraki', 'Aigalos', 'Chrysoupoli', 'Kastelli', 'Livadia', 'Megaros', 'Nafpaktia', 'Oreokastro', 'Palaiochora', 'Rodopoli', 'Serifos', 'Thermi', 'Vrachos', 'Xylokastro', 'Zografos', 'Agrilia'],
    clubPatterns: ['AO {}', 'PAS {}', '{} FC', 'Atromitos {}', 'Enosis {}', '{} AC', 'Apollon {}', 'Aris {}'],
  },
  nordic: {
    first: ['Anders', 'Asger', 'Bjorn', 'Casper', 'Christian', 'Emil', 'Erik', 'Frederik', 'Gustav', 'Henrik', 'Jakob', 'Jens', 'Jonas', 'Kasper', 'Lars', 'Lasse', 'Magnus', 'Mads', 'Mikkel', 'Nikolaj', 'Oliver', 'Rasmus', 'Simon', 'Soren', 'Thomas', 'Tobias', 'Viktor', 'William'],
    last: ['Andersen', 'Bang', 'Bech', 'Berg', 'Bruun', 'Christoffersen', 'Dahl', 'Ehlers', 'Frandsen', 'Gade', 'Halvorsen', 'Holm', 'Ibsen', 'Jessen', 'Jorgensen', 'Kjaer', 'Krogh', 'Lindgren', 'Lund', 'Madsen', 'Nielsen', 'Norgaard', 'Olesen', 'Pedersen', 'Rasmussen', 'Skov', 'Sorensen', 'Thomsen', 'Vestergaard', 'Winther', 'Ostergaard', 'Bak', 'Dalgaard', 'Riis'],
    cities: ['Havnstad', 'Norrevang', 'Solbjerg', 'Ringholm', 'Fjordby', 'Ostervig', 'Lindeskov', 'Bakkegard', 'Sandholm', 'Ellemose', 'Kirkeby', 'Vestervang', 'Bjergso', 'Kolding Nord', 'Halsager', 'Tornby', 'Egeskov', 'Marbaek'],
    clubPatterns: ['{} BK', '{} IF', 'FC {}', '{} Boldklub', '{} FF', 'AB {}', '{} United', 'IK {}'],
  },
  brazil: {
    first: ['Adriano', 'Alisson', 'Bruno', 'Caio', 'Cleiton', 'Danilo', 'Douglas', 'Eder', 'Everton', 'Fabricio', 'Felipe', 'Gabriel', 'Gustavo', 'Igor', 'Joao', 'Kaique', 'Leandro', 'Lucas', 'Marcelo', 'Matheus', 'Murilo', 'Otavio', 'Rafinha', 'Renan', 'Rodrigo', 'Thiago', 'Vinicius', 'Wesley'],
    last: ['Alves', 'Andrade', 'Aparecido', 'Barbosa', 'Batista', 'Bezerra', 'Cardoso', 'Cavalcanti', 'Correia', 'Costa', 'Damasceno', 'Dantas', 'Ferraz', 'Gomes', 'Guimaraes', 'Lacerda', 'Lima', 'Macedo', 'Marinho', 'Moraes', 'Nascimento', 'Oliveira', 'Peixoto', 'Queiroz', 'Ribeiro', 'Sampaio', 'Santana', 'Teixeira', 'Vasconcelos', 'Xavier', 'Bittencourt', 'Fagundes', 'Modesto', 'Rezende'],
    cities: ['Vila Nova', 'Serra Azul', 'Rio Claro', 'Porto Belo', 'Campo Verde', 'Ipanema Sul', 'Monte Alto', 'Praia Grande', 'Santa Luzia', 'Boa Vista', 'Palmares', 'Cabo Frio Sul', 'Itaquara', 'Jaguaribe', 'Morro Velho', 'Novo Horizonte', 'Pedra Branca', 'Tijucal'],
    clubPatterns: ['{} FC', 'Atlético {}', '{} EC', '{} SC', 'Esporte {}', 'Grêmio {}', 'Náutico {}', 'Clube {}'],
  },
  hispanic: {
    first: ['Agustin', 'Alejandro', 'Bruno', 'Cristian', 'Diego', 'Emiliano', 'Ezequiel', 'Facundo', 'Federico', 'Franco', 'Gonzalo', 'Ignacio', 'Javier', 'Joaquin', 'Julian', 'Lautaro', 'Leandro', 'Lucas', 'Marcos', 'Matias', 'Nahuel', 'Nicolas', 'Pablo', 'Ramiro', 'Rodrigo', 'Santiago', 'Tomas', 'Valentin'],
    last: ['Acosta', 'Aguirre', 'Alvarez', 'Benitez', 'Cabrera', 'Cardona', 'Castro', 'Chavez', 'Dominguez', 'Escobar', 'Figueroa', 'Gimenez', 'Guerra', 'Ibarra', 'Juarez', 'Leguizamon', 'Maldonado', 'Medina', 'Mendoza', 'Molina', 'Ojeda', 'Ortiz', 'Paredes', 'Quintero', 'Reyes', 'Rojas', 'Salcedo', 'Sosa', 'Torres', 'Ugarte', 'Vargas', 'Velazquez', 'Zapata', 'Bustos'],
    cities: ['Villanueva', 'Río Segundo', 'Puerto Alegre', 'San Isidro', 'Las Lomas', 'Cerro Verde', 'Costa Nueva', 'El Salto', 'Monteclaro', 'Nueva Aurora', 'Palma Sur', 'Quebrada', 'Santa Elena', 'Tierra Alta', 'Valle Hondo', 'Zaragoza Sur', 'Bahía Blanca Sur', 'Ciudad Norte'],
    clubPatterns: ['CA {}', 'Club {}', '{} Juniors', 'Racing {}', 'Deportivo {}', 'Independiente {}', 'Atlético {}', '{} FC', 'Unión {}'],
  },
  arab: {
    first: ['Abdullah', 'Ahmed', 'Ali', 'Amr', 'Bilal', 'Fahad', 'Faisal', 'Hamza', 'Hassan', 'Ibrahim', 'Kareem', 'Khalid', 'Mahmoud', 'Majed', 'Mohamed', 'Mostafa', 'Nasser', 'Omar', 'Rami', 'Saleh', 'Salem', 'Sami', 'Tarek', 'Waleed', 'Yasser', 'Youssef', 'Zaki', 'Ziad'],
    last: ['Abdelaziz', 'Abdelrahman', 'Al Bishri', 'Al Dosari', 'Al Ghamdi', 'Al Harbi', 'Al Mutairi', 'Al Qahtani', 'Al Shehri', 'Attia', 'Badawi', 'Darwish', 'El Sayed', 'Fathy', 'Ghanem', 'Hamdy', 'Hegazy', 'Ismail', 'Kamal', 'Khalil', 'Mansour', 'Marzouk', 'Nabil', 'Rashed', 'Saad', 'Salman', 'Shaker', 'Sobhi', 'Tawfik', 'Wahba', 'Yassin', 'Zidan', 'Adel', 'Fouad'],
    cities: ['Al Nahda', 'Bahr Salim', 'Dar Amir', 'Jebel Noor', 'Khalij', 'Madinat Sharq', 'Nakheel', 'Qasr Ain', 'Ras Hadd', 'Safwa', 'Shamal', 'Wadi Rimal', 'Zahra', 'Ain Sokhna Sur', 'Bur Nasr', 'Hilwan Gharb', 'Manshiya', 'Tanta Sharq'],
    clubPatterns: ['Al {}', '{} SC', '{} FC', 'Ittihad {}', 'Nasr {}', 'Ahli {}', '{} Club', 'Hilal {}'],
  },
  maghreb: {
    first: ['Achraf', 'Adam', 'Anas', 'Ayoub', 'Badr', 'Bilal', 'Driss', 'Hamza', 'Hicham', 'Ilyas', 'Ismail', 'Jawad', 'Karim', 'Mehdi', 'Mohcine', 'Nabil', 'Nordin', 'Otmane', 'Rachid', 'Reda', 'Said', 'Samir', 'Soufiane', 'Tarik', 'Walid', 'Yassine', 'Younes', 'Zakaria'],
    last: ['Amrani', 'Bakkali', 'Belhaj', 'Benali', 'Benjelloun', 'Bouhali', 'Chakir', 'Cherkaoui', 'Dahmani', 'El Amrani', 'El Fassi', 'El Kaddouri', 'Ennaji', 'Fettah', 'Ghazi', 'Hajji', 'Idrissi', 'Jebbour', 'Kabbaj', 'Lahlou', 'Mansouri', 'Mekki', 'Nadir', 'Ouazzani', 'Rahmouni', 'Sabri', 'Sekkat', 'Tahiri', 'Wahbi', 'Zeroual', 'Alaoui', 'Berrada', 'Hilali', 'Naciri'],
    cities: ['Ain Chock', 'Bab Doukkala', 'Dar Bouazza', 'El Menzeh', 'Fkih Ben', 'Hay Riad', 'Ighil Nord', 'Jorf Lasfar', 'Kenitra Sud', 'Laayoune Est', 'Mers Sultan', 'Ouled Teima', 'Sidi Maarouf', 'Tamesna', 'Zenata', 'Bouskoura', 'Massira', 'Nahda Sud'],
    clubPatterns: ['{} AC', '{} FC', 'AS {}', 'Ittihad {}', 'Chabab {}', 'Olympique {}', 'Union {}', 'Difaa {}'],
  },
  japan: {
    first: ['Daiki', 'Daisuke', 'Hayato', 'Hiroto', 'Kaito', 'Kazuya', 'Keisuke', 'Kenta', 'Kota', 'Ren', 'Riku', 'Ryo', 'Ryota', 'Shohei', 'Shota', 'Sota', 'Takumi', 'Taiga', 'Tatsuya', 'Tomoki', 'Toshiro', 'Yamato', 'Yuki', 'Yuma', 'Yusuke', 'Yuto', 'Haruto', 'Sora'],
    last: ['Akiyama', 'Endo', 'Fujimoto', 'Hasegawa', 'Hayashi', 'Inoue', 'Ishikawa', 'Kaneko', 'Kimura', 'Kobayashi', 'Kudo', 'Maeda', 'Matsuda', 'Miyazaki', 'Morita', 'Nakamura', 'Nishida', 'Ogawa', 'Okada', 'Sakamoto', 'Sasaki', 'Shibata', 'Sugiyama', 'Takahashi', 'Tanaka', 'Uchida', 'Watanabe', 'Yamamoto', 'Yoshida', 'Arai', 'Fukuda', 'Harada', 'Ito', 'Kondo'],
    cities: ['Aoba', 'Chitose', 'Hakuba', 'Higashino', 'Kaminato', 'Kitahara', 'Midorino', 'Minamiura', 'Nagahama', 'Nishikawa', 'Ohara', 'Sakuragi', 'Shirakawa', 'Takasu', 'Tsukimi', 'Umegaoka', 'Yamashiro', 'Yukawa'],
    clubPatterns: ['{} FC', '{} United', '{} Sparks', '{} Waves', '{} Verde', '{} Solar', 'FC {}', '{} Ardent'],
  },
  korea: {
    first: ['Chan-ho', 'Do-yoon', 'Eun-woo', 'Gun-woo', 'Ha-jun', 'Hyun-woo', 'Jae-min', 'Ji-ho', 'Ji-hoon', 'Jin-woo', 'Joon-seo', 'Ki-hun', 'Min-jae', 'Min-seok', 'Nam-il', 'Sang-hyun', 'Seo-jun', 'Seung-min', 'Si-woo', 'Sung-ho', 'Tae-yang', 'Woo-jin', 'Yeon-jun', 'Young-gwon', 'Do-hyun', 'Han-gyul', 'Jun-ho', 'Kyung-min'],
    last: ['Ahn', 'Bae', 'Baek', 'Cha', 'Choi', 'Chung', 'Do', 'Gwak', 'Han', 'Hong', 'Hwang', 'Im', 'Jang', 'Jeon', 'Jo', 'Jung', 'Kang', 'Kim', 'Ko', 'Kwon', 'Lee', 'Lim', 'Moon', 'Nam', 'Oh', 'Park', 'Ryu', 'Seo', 'Shin', 'Son', 'Song', 'Woo', 'Yang', 'Yoon'],
    cities: ['Bukcheon', 'Daeyang', 'Geumho', 'Hanam Nam', 'Haeun', 'Jinam', 'Kwangyang Buk', 'Mirae', 'Nakdong', 'Osan Seo', 'Pyeongsan', 'Saebit', 'Seorak', 'Sinpo', 'Taebaek Nam', 'Wonju Dong', 'Yeonhwa', 'Cheongsol'],
    clubPatterns: ['{} FC', '{} United', '{} Dragons', '{} Citizen', '{} Bluebirds', 'FC {}', '{} Tigers', '{} Sports'],
  },
  usa: {
    first: ['Aaron', 'Blake', 'Brandon', 'Caleb', 'Chase', 'Cole', 'Cooper', 'Dylan', 'Ethan', 'Evan', 'Garrett', 'Hunter', 'Jackson', 'Jared', 'Jesse', 'Logan', 'Mason', 'Miles', 'Nolan', 'Parker', 'Preston', 'Riley', 'Shane', 'Spencer', 'Trevor', 'Tyler', 'Wyatt', 'Zane'],
    last: ['Alderman', 'Barlow', 'Brennan', 'Callahan', 'Crawford', 'Delgado', 'Donovan', 'Ellison', 'Everhart', 'Fletcher', 'Gaines', 'Halloran', 'Hendricks', 'Ingram', 'Kessler', 'Langston', 'Mercer', 'Nash', 'Oakley', 'Prescott', 'Ramsey', 'Reyes', 'Sinclair', 'Stratton', 'Sullivan', 'Tanner', 'Vaughn', 'Whitaker', 'Winslow', 'Yorke', 'Boone', 'Duffy', 'Kirby', 'Marsh'],
    cities: ['Bayside', 'Cedar Falls', 'Clearwater', 'Eastbridge', 'Fairhaven', 'Glenwood', 'Harbor City', 'Ironwood', 'Lakeshore', 'Maple Ridge', 'Northport', 'Oakridge', 'Pine Hollow', 'Redstone', 'Silverlake', 'Summit Park', 'Westfield', 'Willow Creek'],
    clubPatterns: ['{} FC', '{} SC', 'Real {}', '{} United', 'Inter {}', '{} Athletic', 'Sporting {}', '{} City SC'],
  },
};

/**
 * 이름 생성기. 같은 리그 안에서 동명이인이 자주 나오면 몰입이 깨지므로
 * 사용한 이름을 기억해 두고 최대 여덟 번까지 다시 뽑습니다.
 */
export class NameFactory {
  private used = new Set<string>();

  constructor(private readonly pickFn: <T>(items: readonly T[]) => T) {}

  player(pool: NamePoolId): string {
    const { first, last } = NAME_POOLS[pool];
    for (let attempt = 0; attempt < 8; attempt++) {
      const name = `${this.pickFn(first)} ${this.pickFn(last)}`;
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
    // 풀이 마르면 중간 이니셜을 붙여 강제로 구분합니다.
    const base = `${this.pickFn(first)} ${this.pickFn(last)}`;
    const initial = this.pickFn(first)[0];
    const name = `${base.split(' ')[0]} ${initial}. ${base.split(' ')[1]}`;
    this.used.add(name);
    return name;
  }

  club(pool: NamePoolId): string {
    const { cities, clubPatterns } = NAME_POOLS[pool];
    for (let attempt = 0; attempt < 24; attempt++) {
      const name = this.pickFn(clubPatterns).replace('{}', this.pickFn(cities));
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
    const name = `${this.pickFn(cities)} ${this.used.size}`;
    this.used.add(name);
    return name;
  }
}

/** 구단 약칭 — 라틴 문자 기준 앞 세 글자. */
export function shortenClubName(name: string): string {
  const words = name.replace(/[^A-Za-zÀ-ɏ ]/g, '').split(' ').filter(Boolean);
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
  if (words.length === 2) {
    const [a, b] = words;
    return (a.slice(0, 2) + b[0]).toUpperCase();
  }
  return (words[0] ?? name).slice(0, 3).toUpperCase();
}
