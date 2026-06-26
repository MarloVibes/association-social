import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  authDomain: "association-social.firebaseapp.com",
  projectId: "association-social",
  storageBucket: "association-social.firebasestorage.app",
  messagingSenderId: "444786220612",
  appId: "1:444786220612:web:53724911dead483995e611"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper to create a player object
const p = (id, first, last, pos, jersey, team) => ({
  player_id: id, first_name: first, last_name: last,
  full_name: `${first} ${last}`, position: pos,
  jersey_number: jersey, team,
  photo_url: `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`,
});

// ─────────────────────────────────────────
// ERA: MAGIC VS BIRD (1983-84)
// 23 teams existed
// ─────────────────────────────────────────
const ERA_MAGIC_BIRD = {
  era: 'magic_bird',
  season: '1983-84',
  teams: [
    {
      id: 'atl_1984', abbreviation: 'ATL', full_name: 'Atlanta Hawks',
      city: 'Atlanta', name: 'Hawks',
      players: [
        p('h_atl_1', 'Dominique', 'Wilkins', 'SF', '21', 'ATL'),
        p('h_atl_2', 'Dan', 'Roundfield', 'PF', '32', 'ATL'),
        p('h_atl_3', 'Tree', 'Rollins', 'C', '30', 'ATL'),
        p('h_atl_4', 'Eddie', 'Johnson', 'SG', '5', 'ATL'),
        p('h_atl_5', 'Mike', 'Glenn', 'PG', '20', 'ATL'),
        p('h_atl_6', 'Johnny', 'Davis', 'G', '10', 'ATL'),
      ]
    },
    {
      id: 'bos_1984', abbreviation: 'BOS', full_name: 'Boston Celtics',
      city: 'Boston', name: 'Celtics',
      players: [
        p('h_bos_1', 'Larry', 'Bird', 'SF', '33', 'BOS'),
        p('h_bos_2', 'Kevin', 'McHale', 'PF', '32', 'BOS'),
        p('h_bos_3', 'Robert', 'Parish', 'C', '00', 'BOS'),
        p('h_bos_4', 'Dennis', 'Johnson', 'SG', '3', 'BOS'),
        p('h_bos_5', 'Danny', 'Ainge', 'PG', '44', 'BOS'),
        p('h_bos_6', 'Scott', 'Wedman', 'SF', '23', 'BOS'),
      ]
    },
    {
      id: 'njn_1984', abbreviation: 'NJN', full_name: 'New Jersey Nets',
      city: 'New Jersey', name: 'Nets',
      players: [
        p('h_njn_1', 'Buck', 'Williams', 'PF', '52', 'NJN'),
        p('h_njn_2', 'Micheal', 'Ray Richardson', 'PG', '12', 'NJN'),
        p('h_njn_3', 'Otis', 'Birdsong', 'SG', '5', 'NJN'),
        p('h_njn_4', 'Darwin', 'Cook', 'G', '21', 'NJN'),
        p('h_njn_5', 'Albert', 'King', 'SF', '55', 'NJN'),
        p('h_njn_6', 'Mike', 'Gminski', 'C', '43', 'NJN'),
      ]
    },
    {
      id: 'chi_1984', abbreviation: 'CHI', full_name: 'Chicago Bulls',
      city: 'Chicago', name: 'Bulls',
      players: [
        p('h_chi_1', 'Orlando', 'Woolridge', 'SF', '42', 'CHI'),
        p('h_chi_2', 'Quintin', 'Dailey', 'SG', '22', 'CHI'),
        p('h_chi_3', 'Dave', 'Corzine', 'C', '54', 'CHI'),
        p('h_chi_4', 'Ennis', 'Whatley', 'PG', '11', 'CHI'),
        p('h_chi_5', 'David', 'Greenwood', 'PF', '32', 'CHI'),
        p('h_chi_6', 'Rod', 'Higgins', 'F', '44', 'CHI'),
      ]
    },
    {
      id: 'cle_1984', abbreviation: 'CLE', full_name: 'Cleveland Cavaliers',
      city: 'Cleveland', name: 'Cavaliers',
      players: [
        p('h_cle_1', 'World B.', 'Free', 'SG', '21', 'CLE'),
        p('h_cle_2', 'Cliff', 'Robinson', 'PF', '35', 'CLE'),
        p('h_cle_3', 'Roy', 'Hinson', 'C', '32', 'CLE'),
        p('h_cle_4', 'John', 'Bagley', 'PG', '10', 'CLE'),
        p('h_cle_5', 'Phil', 'Hubbard', 'SF', '22', 'CLE'),
        p('h_cle_6', 'Stewart', 'Granger', 'G', '14', 'CLE'),
      ]
    },
    {
      id: 'dal_1984', abbreviation: 'DAL', full_name: 'Dallas Mavericks',
      city: 'Dallas', name: 'Mavericks',
      players: [
        p('h_dal_1', 'Mark', 'Aguirre', 'SF', '24', 'DAL'),
        p('h_dal_2', 'Rolando', 'Blackman', 'SG', '22', 'DAL'),
        p('h_dal_3', 'Jay', 'Vincent', 'PF', '44', 'DAL'),
        p('h_dal_4', 'Brad', 'Davis', 'PG', '15', 'DAL'),
        p('h_dal_5', 'Pat', 'Cummings', 'C', '33', 'DAL'),
        p('h_dal_6', 'Derek', 'Harper', 'G', '12', 'DAL'),
      ]
    },
    {
      id: 'den_1984', abbreviation: 'DEN', full_name: 'Denver Nuggets',
      city: 'Denver', name: 'Nuggets',
      players: [
        p('h_den_1', 'Kiki', 'Vandeweghe', 'SF', '55', 'DEN'),
        p('h_den_2', 'Alex', 'English', 'SF', '2', 'DEN'),
        p('h_den_3', 'Dan', 'Issel', 'C', '44', 'DEN'),
        p('h_den_4', 'Fat', 'Lever', 'PG', '12', 'DEN'),
        p('h_den_5', 'Rob', 'Williams', 'G', '10', 'DEN'),
        p('h_den_6', 'Wayne', 'Cooper', 'C', '54', 'DEN'),
      ]
    },
    {
      id: 'det_1984', abbreviation: 'DET', full_name: 'Detroit Pistons',
      city: 'Detroit', name: 'Pistons',
      players: [
        p('h_det_1', 'Isiah', 'Thomas', 'PG', '11', 'DET'),
        p('h_det_2', 'Kelly', 'Tripucka', 'SF', '34', 'DET'),
        p('h_det_3', 'Bill', 'Laimbeer', 'C', '40', 'DET'),
        p('h_det_4', 'Vinnie', 'Johnson', 'SG', '15', 'DET'),
        p('h_det_5', 'Kent', 'Benson', 'PF', '52', 'DET'),
        p('h_det_6', 'John', 'Long', 'G', '22', 'DET'),
      ]
    },
    {
      id: 'gsw_1984', abbreviation: 'GSW', full_name: 'Golden State Warriors',
      city: 'Golden State', name: 'Warriors',
      players: [
        p('h_gsw_1', 'Purvis', 'Short', 'SF', '25', 'GSW'),
        p('h_gsw_2', 'Joe', 'Barry Carroll', 'C', '34', 'GSW'),
        p('h_gsw_3', 'Mickey', 'Johnson', 'F', '22', 'GSW'),
        p('h_gsw_4', 'Sleepy', 'Floyd', 'PG', '14', 'GSW'),
        p('h_gsw_5', 'Larry', 'Smith', 'PF', '53', 'GSW'),
        p('h_gsw_6', 'Lester', 'Conner', 'G', '21', 'GSW'),
      ]
    },
    {
      id: 'hou_1984', abbreviation: 'HOU', full_name: 'Houston Rockets',
      city: 'Houston', name: 'Rockets',
      players: [
        p('h_hou_1', 'Ralph', 'Sampson', 'C', '50', 'HOU'),
        p('h_hou_2', 'Hakeem', 'Olajuwon', 'C', '34', 'HOU'),
        p('h_hou_3', 'Lewis', 'Lloyd', 'SG', '12', 'HOU'),
        p('h_hou_4', 'Robert', 'Reid', 'SF', '22', 'HOU'),
        p('h_hou_5', 'Allen', 'Leavell', 'PG', '5', 'HOU'),
        p('h_hou_6', 'Elvin', 'Hayes', 'PF', '11', 'HOU'),
      ]
    },
    {
      id: 'ind_1984', abbreviation: 'IND', full_name: 'Indiana Pacers',
      city: 'Indiana', name: 'Pacers',
      players: [
        p('h_ind_1', 'Clark', 'Kellogg', 'PF', '32', 'IND'),
        p('h_ind_2', 'Billy', 'Knight', 'SF', '24', 'IND'),
        p('h_ind_3', 'George', 'McGinnis', 'PF', '30', 'IND'),
        p('h_ind_4', 'Herb', 'Williams', 'C', '42', 'IND'),
        p('h_ind_5', 'Jerry', 'Sichting', 'PG', '21', 'IND'),
        p('h_ind_6', 'Clint', 'Richardson', 'G', '14', 'IND'),
      ]
    },
    {
      id: 'lac_1984', abbreviation: 'LAC', full_name: 'Los Angeles Clippers',
      city: 'Los Angeles', name: 'Clippers',
      players: [
        p('h_lac_1', 'Terry', 'Cummings', 'PF', '35', 'LAC'),
        p('h_lac_2', 'Norm', 'Nixon', 'PG', '10', 'LAC'),
        p('h_lac_3', 'Freeman', 'Williams', 'SG', '31', 'LAC'),
        p('h_lac_4', 'Bill', 'Walton', 'C', '5', 'LAC'),
        p('h_lac_5', 'Craig', 'Hodges', 'SG', '14', 'LAC'),
        p('h_lac_6', 'Michael', 'Brooks', 'F', '44', 'LAC'),
      ]
    },
    {
      id: 'lal_1984', abbreviation: 'LAL', full_name: 'Los Angeles Lakers',
      city: 'Los Angeles', name: 'Lakers',
      players: [
        p('h_lal_1', 'Magic', 'Johnson', 'PG', '32', 'LAL'),
        p('h_lal_2', 'Kareem', 'Abdul-Jabbar', 'C', '33', 'LAL'),
        p('h_lal_3', 'James', 'Worthy', 'SF', '42', 'LAL'),
        p('h_lal_4', 'Byron', 'Scott', 'SG', '4', 'LAL'),
        p('h_lal_5', 'Michael', 'Cooper', 'F', '21', 'LAL'),
        p('h_lal_6', 'Bob', 'McAdoo', 'PF', '11', 'LAL'),
      ]
    },
    {
      id: 'mil_1984', abbreviation: 'MIL', full_name: 'Milwaukee Bucks',
      city: 'Milwaukee', name: 'Bucks',
      players: [
        p('h_mil_1', 'Bob', 'Lanier', 'C', '16', 'MIL'),
        p('h_mil_2', 'Marques', 'Johnson', 'SF', '8', 'MIL'),
        p('h_mil_3', 'Junior', 'Bridgeman', 'SG', '2', 'MIL'),
        p('h_mil_4', 'Sidney', 'Moncrief', 'SG', '4', 'MIL'),
        p('h_mil_5', 'Brian', 'Winters', 'SG', '32', 'MIL'),
        p('h_mil_6', 'Paul', 'Pressey', 'G', '13', 'MIL'),
      ]
    },
    {
      id: 'nyk_1984', abbreviation: 'NYK', full_name: 'New York Knicks',
      city: 'New York', name: 'Knicks',
      players: [
        p('h_nyk_1', 'Bernard', 'King', 'SF', '30', 'NYK'),
        p('h_nyk_2', 'Bill', 'Cartwright', 'C', '45', 'NYK'),
        p('h_nyk_3', 'Truck', 'Robinson', 'PF', '44', 'NYK'),
        p('h_nyk_4', 'Ray', 'Williams', 'PG', '12', 'NYK'),
        p('h_nyk_5', 'Rory', 'Sparrow', 'G', '14', 'NYK'),
        p('h_nyk_6', 'Trent', 'Tucker', 'SG', '6', 'NYK'),
      ]
    },
    {
      id: 'phi_1984', abbreviation: 'PHI', full_name: 'Philadelphia 76ers',
      city: 'Philadelphia', name: '76ers',
      players: [
        p('h_phi_1', 'Julius', 'Erving', 'SF', '6', 'PHI'),
        p('h_phi_2', 'Moses', 'Malone', 'C', '2', 'PHI'),
        p('h_phi_3', 'Charles', 'Barkley', 'PF', '34', 'PHI'),
        p('h_phi_4', 'Andrew', 'Toney', 'SG', '22', 'PHI'),
        p('h_phi_5', 'Maurice', 'Cheeks', 'PG', '10', 'PHI'),
        p('h_phi_6', 'Bobby', 'Jones', 'SF', '24', 'PHI'),
      ]
    },
    {
      id: 'phx_1984', abbreviation: 'PHX', full_name: 'Phoenix Suns',
      city: 'Phoenix', name: 'Suns',
      players: [
        p('h_phx_1', 'Larry', 'Nance', 'PF', '22', 'PHX'),
        p('h_phx_2', 'Walter', 'Davis', 'SG', '6', 'PHX'),
        p('h_phx_3', 'Alvan', 'Adams', 'C', '19', 'PHX'),
        p('h_phx_4', 'Maurice', 'Lucas', 'PF', '20', 'PHX'),
        p('h_phx_5', 'James', 'Edwards', 'C', '53', 'PHX'),
        p('h_phx_6', 'Kyle', 'Macy', 'G', '23', 'PHX'),
      ]
    },
    {
      id: 'por_1984', abbreviation: 'POR', full_name: 'Portland Trail Blazers',
      city: 'Portland', name: 'Trail Blazers',
      players: [
        p('h_por_1', 'Jim', 'Paxson', 'SG', '20', 'POR'),
        p('h_por_2', 'Mychal', 'Thompson', 'C', '43', 'POR'),
        p('h_por_3', 'Clyde', 'Drexler', 'SG', '22', 'POR'),
        p('h_por_4', 'Calvin', 'Natt', 'SF', '27', 'POR'),
        p('h_por_5', 'Kenny', 'Carr', 'PF', '32', 'POR'),
        p('h_por_6', 'Darnell', 'Valentine', 'PG', '14', 'POR'),
      ]
    },
    {
      id: 'sac_1984', abbreviation: 'SAC', full_name: 'Sacramento Kings',
      city: 'Sacramento', name: 'Kings',
      players: [
        p('h_sac_1', 'Reggie', 'Theus', 'PG', '11', 'SAC'),
        p('h_sac_2', 'Eddie', 'Johnson', 'SG', '5', 'SAC'),
        p('h_sac_3', 'Otis', 'Thorpe', 'PF', '33', 'SAC'),
        p('h_sac_4', 'LaSalle', 'Thompson', 'C', '43', 'SAC'),
        p('h_sac_5', 'Mike', 'Woodson', 'G', '21', 'SAC'),
        p('h_sac_6', 'Mark', 'Olberding', 'F', '12', 'SAC'),
      ]
    },
    {
      id: 'sas_1984', abbreviation: 'SAS', full_name: 'San Antonio Spurs',
      city: 'San Antonio', name: 'Spurs',
      players: [
        p('h_sas_1', 'George', 'Gervin', 'SG', '44', 'SAS'),
        p('h_sas_2', 'Artis', 'Gilmore', 'C', '53', 'SAS'),
        p('h_sas_3', 'Mike', 'Mitchell', 'SF', '31', 'SAS'),
        p('h_sas_4', 'Johnny', 'Moore', 'PG', '00', 'SAS'),
        p('h_sas_5', 'Gene', 'Banks', 'PF', '24', 'SAS'),
        p('h_sas_6', 'Edgar', 'Jones', 'F', '55', 'SAS'),
      ]
    },
    {
      id: 'sea_1984', abbreviation: 'SEA', full_name: 'Seattle SuperSonics',
      city: 'Seattle', name: 'SuperSonics',
      players: [
        p('h_sea_1', 'Jack', 'Sikma', 'C', '43', 'SEA'),
        p('h_sea_2', 'Gus', 'Williams', 'PG', '10', 'SEA'),
        p('h_sea_3', 'Tom', 'Chambers', 'PF', '21', 'SEA'),
        p('h_sea_4', 'David', 'Thompson', 'SG', '33', 'SEA'),
        p('h_sea_5', 'Fred', 'Brown', 'G', '32', 'SEA'),
        p('h_sea_6', 'Jon', 'Sundvold', 'G', '15', 'SEA'),
      ]
    },
    {
      id: 'uta_1984', abbreviation: 'UTA', full_name: 'Utah Jazz',
      city: 'Utah', name: 'Jazz',
      players: [
        p('h_uta_1', 'Adrian', 'Dantley', 'SF', '4', 'UTA'),
        p('h_uta_2', 'Darrell', 'Griffith', 'SG', '35', 'UTA'),
        p('h_uta_3', 'Mark', 'Eaton', 'C', '53', 'UTA'),
        p('h_uta_4', 'Thurl', 'Bailey', 'PF', '41', 'UTA'),
        p('h_uta_5', 'Rickey', 'Green', 'PG', '14', 'UTA'),
        p('h_uta_6', 'Bob', 'Hansen', 'G', '22', 'UTA'),
      ]
    },
    {
      id: 'was_1984', abbreviation: 'WAS', full_name: 'Washington Bullets',
      city: 'Washington', name: 'Bullets',
      players: [
        p('h_was_1', 'Jeff', 'Ruland', 'C', '45', 'WAS'),
        p('h_was_2', 'Rick', 'Mahorn', 'PF', '44', 'WAS'),
        p('h_was_3', 'Frank', 'Johnson', 'PG', '14', 'WAS'),
        p('h_was_4', 'Ricky', 'Sobers', 'G', '12', 'WAS'),
        p('h_was_5', 'Greg', 'Ballard', 'SF', '22', 'WAS'),
        p('h_was_6', 'Don', 'Collins', 'F', '30', 'WAS'),
      ]
    },
  ]
};

// ─────────────────────────────────────────
// ERA: JORDAN (1991-92)
// 27 teams
// ─────────────────────────────────────────
const ERA_JORDAN = {
  era: 'jordan',
  season: '1991-92',
  teams: [
    { id: 'atl_1992', abbreviation: 'ATL', full_name: 'Atlanta Hawks', city: 'Atlanta', name: 'Hawks',
      players: [
        p('j_atl_1', 'Dominique', 'Wilkins', 'SF', '21', 'ATL'),
        p('j_atl_2', 'Kevin', 'Willis', 'PF', '42', 'ATL'),
        p('j_atl_3', 'Moses', 'Malone', 'C', '2', 'ATL'),
        p('j_atl_4', 'Doc', 'Rivers', 'PG', '25', 'ATL'),
        p('j_atl_5', 'Mookie', 'Blaylock', 'G', '10', 'ATL'),
        p('j_atl_6', 'Stacey', 'Augmon', 'SF', '3', 'ATL'),
      ]
    },
    { id: 'bos_1992', abbreviation: 'BOS', full_name: 'Boston Celtics', city: 'Boston', name: 'Celtics',
      players: [
        p('j_bos_1', 'Larry', 'Bird', 'SF', '33', 'BOS'),
        p('j_bos_2', 'Kevin', 'McHale', 'PF', '32', 'BOS'),
        p('j_bos_3', 'Robert', 'Parish', 'C', '00', 'BOS'),
        p('j_bos_4', 'Reggie', 'Lewis', 'SG', '35', 'BOS'),
        p('j_bos_5', 'Dee', 'Brown', 'PG', '7', 'BOS'),
        p('j_bos_6', 'Kevin', 'Gamble', 'G', '34', 'BOS'),
      ]
    },
    { id: 'cha_1992', abbreviation: 'CHA', full_name: 'Charlotte Hornets', city: 'Charlotte', name: 'Hornets',
      players: [
        p('j_cha_1', 'Larry', 'Johnson', 'PF', '2', 'CHA'),
        p('j_cha_2', 'Alonzo', 'Mourning', 'C', '33', 'CHA'),
        p('j_cha_3', 'Rex', 'Chapman', 'SG', '3', 'CHA'),
        p('j_cha_4', 'Muggsy', 'Bogues', 'PG', '14', 'CHA'),
        p('j_cha_5', 'Kenny', 'Gattison', 'F', '54', 'CHA'),
        p('j_cha_6', 'Dell', 'Curry', 'G', '30', 'CHA'),
      ]
    },
    { id: 'chi_1992', abbreviation: 'CHI', full_name: 'Chicago Bulls', city: 'Chicago', name: 'Bulls',
      players: [
        p('j_chi_1', 'Michael', 'Jordan', 'SG', '23', 'CHI'),
        p('j_chi_2', 'Scottie', 'Pippen', 'SF', '33', 'CHI'),
        p('j_chi_3', 'Horace', 'Grant', 'PF', '54', 'CHI'),
        p('j_chi_4', 'Bill', 'Cartwright', 'C', '24', 'CHI'),
        p('j_chi_5', 'John', 'Paxson', 'PG', '5', 'CHI'),
        p('j_chi_6', 'B.J.', 'Armstrong', 'G', '10', 'CHI'),
      ]
    },
    { id: 'cle_1992', abbreviation: 'CLE', full_name: 'Cleveland Cavaliers', city: 'Cleveland', name: 'Cavaliers',
      players: [
        p('j_cle_1', 'Brad', 'Daugherty', 'C', '43', 'CLE'),
        p('j_cle_2', 'Larry', 'Nance', 'PF', '22', 'CLE'),
        p('j_cle_3', 'Mark', 'Price', 'PG', '25', 'CLE'),
        p('j_cle_4', 'Craig', 'Ehlo', 'SG', '23', 'CLE'),
        p('j_cle_5', 'John', 'Battle', 'G', '21', 'CLE'),
        p('j_cle_6', 'Hot Rod', 'Williams', 'F', '55', 'CLE'),
      ]
    },
    { id: 'dal_1992', abbreviation: 'DAL', full_name: 'Dallas Mavericks', city: 'Dallas', name: 'Mavericks',
      players: [
        p('j_dal_1', 'Derek', 'Harper', 'PG', '12', 'DAL'),
        p('j_dal_2', 'Rolando', 'Blackman', 'SG', '22', 'DAL'),
        p('j_dal_3', 'Roy', 'Tarpley', 'PF', '42', 'DAL'),
        p('j_dal_4', 'Fat', 'Lever', 'G', '12', 'DAL'),
        p('j_dal_5', 'Rodney', 'McCray', 'SF', '20', 'DAL'),
        p('j_dal_6', 'Brad', 'Davis', 'G', '15', 'DAL'),
      ]
    },
    { id: 'den_1992', abbreviation: 'DEN', full_name: 'Denver Nuggets', city: 'Denver', name: 'Nuggets',
      players: [
        p('j_den_1', 'Dikembe', 'Mutombo', 'C', '55', 'DEN'),
        p('j_den_2', 'Reggie', 'Williams', 'SF', '31', 'DEN'),
        p('j_den_3', 'Chris', 'Jackson', 'PG', '7', 'DEN'),
        p('j_den_4', 'Blair', 'Rasmussen', 'C', '44', 'DEN'),
        p('j_den_5', 'Mark', 'Macon', 'G', '21', 'DEN'),
        p('j_den_6', 'Todd', 'Lichti', 'G', '22', 'DEN'),
      ]
    },
    { id: 'det_1992', abbreviation: 'DET', full_name: 'Detroit Pistons', city: 'Detroit', name: 'Pistons',
      players: [
        p('j_det_1', 'Isiah', 'Thomas', 'PG', '11', 'DET'),
        p('j_det_2', 'Joe', 'Dumars', 'SG', '4', 'DET'),
        p('j_det_3', 'Dennis', 'Rodman', 'PF', '10', 'DET'),
        p('j_det_4', 'Bill', 'Laimbeer', 'C', '40', 'DET'),
        p('j_det_5', 'Mark', 'Aguirre', 'SF', '24', 'DET'),
        p('j_det_6', 'Vinnie', 'Johnson', 'G', '15', 'DET'),
      ]
    },
    { id: 'gsw_1992', abbreviation: 'GSW', full_name: 'Golden State Warriors', city: 'Golden State', name: 'Warriors',
      players: [
        p('j_gsw_1', 'Tim', 'Hardaway', 'PG', '10', 'GSW'),
        p('j_gsw_2', 'Chris', 'Mullin', 'SF', '17', 'GSW'),
        p('j_gsw_3', 'Mitch', 'Richmond', 'SG', '23', 'GSW'),
        p('j_gsw_4', 'Billy', 'Owens', 'PF', '21', 'GSW'),
        p('j_gsw_5', 'Tyrone', 'Hill', 'C', '52', 'GSW'),
        p('j_gsw_6', 'Sarunas', 'Marciulionis', 'G', '13', 'GSW'),
      ]
    },
    { id: 'hou_1992', abbreviation: 'HOU', full_name: 'Houston Rockets', city: 'Houston', name: 'Rockets',
      players: [
        p('j_hou_1', 'Hakeem', 'Olajuwon', 'C', '34', 'HOU'),
        p('j_hou_2', 'Otis', 'Thorpe', 'PF', '33', 'HOU'),
        p('j_hou_3', 'Vernon', 'Maxwell', 'SG', '1', 'HOU'),
        p('j_hou_4', 'Kenny', 'Smith', 'PG', '30', 'HOU'),
        p('j_hou_5', 'Buck', 'Johnson', 'SF', '12', 'HOU'),
        p('j_hou_6', 'Matt', 'Bullard', 'F', '50', 'HOU'),
      ]
    },
    { id: 'ind_1992', abbreviation: 'IND', full_name: 'Indiana Pacers', city: 'Indiana', name: 'Pacers',
      players: [
        p('j_ind_1', 'Reggie', 'Miller', 'SG', '31', 'IND'),
        p('j_ind_2', 'Detlef', 'Schrempf', 'PF', '11', 'IND'),
        p('j_ind_3', 'Rik', 'Smits', 'C', '45', 'IND'),
        p('j_ind_4', 'Chuck', 'Person', 'SF', '45', 'IND'),
        p('j_ind_5', 'Micheal', 'Williams', 'PG', '10', 'IND'),
        p('j_ind_6', 'Dale', 'Davis', 'F', '34', 'IND'),
      ]
    },
    { id: 'lac_1992', abbreviation: 'LAC', full_name: 'Los Angeles Clippers', city: 'Los Angeles', name: 'Clippers',
      players: [
        p('j_lac_1', 'Danny', 'Manning', 'SF', '25', 'LAC'),
        p('j_lac_2', 'Ron', 'Harper', 'SG', '12', 'LAC'),
        p('j_lac_3', 'Charles', 'Smith', 'PF', '52', 'LAC'),
        p('j_lac_4', 'Gary', 'Grant', 'PG', '20', 'LAC'),
        p('j_lac_5', 'Benoit', 'Benjamin', 'C', '41', 'LAC'),
        p('j_lac_6', 'Ken', 'Norman', 'F', '25', 'LAC'),
      ]
    },
    { id: 'lal_1992', abbreviation: 'LAL', full_name: 'Los Angeles Lakers', city: 'Los Angeles', name: 'Lakers',
      players: [
        p('j_lal_1', 'Magic', 'Johnson', 'PG', '32', 'LAL'),
        p('j_lal_2', 'James', 'Worthy', 'SF', '42', 'LAL'),
        p('j_lal_3', 'Vlade', 'Divac', 'C', '12', 'LAL'),
        p('j_lal_4', 'Byron', 'Scott', 'SG', '4', 'LAL'),
        p('j_lal_5', 'Sam', 'Perkins', 'PF', '14', 'LAL'),
        p('j_lal_6', 'A.C.', 'Green', 'F', '45', 'LAL'),
      ]
    },
    { id: 'mia_1992', abbreviation: 'MIA', full_name: 'Miami Heat', city: 'Miami', name: 'Heat',
      players: [
        p('j_mia_1', 'Glen', 'Rice', 'SF', '41', 'MIA'),
        p('j_mia_2', 'Rony', 'Seikaly', 'C', '4', 'MIA'),
        p('j_mia_3', 'Steve', 'Smith', 'SG', '8', 'MIA'),
        p('j_mia_4', 'Kevin', 'Edwards', 'G', '3', 'MIA'),
        p('j_mia_5', 'Sherman', 'Douglas', 'PG', '10', 'MIA'),
        p('j_mia_6', 'Grant', 'Long', 'F', '42', 'MIA'),
      ]
    },
    { id: 'mil_1992', abbreviation: 'MIL', full_name: 'Milwaukee Bucks', city: 'Milwaukee', name: 'Bucks',
      players: [
        p('j_mil_1', 'Dale', 'Ellis', 'SG', '3', 'MIL'),
        p('j_mil_2', 'Jay', 'Humphries', 'PG', '14', 'MIL'),
        p('j_mil_3', 'Moses', 'Malone', 'C', '2', 'MIL'),
        p('j_mil_4', 'Fred', 'Roberts', 'SF', '43', 'MIL'),
        p('j_mil_5', 'Brad', 'Lohaus', 'F', '32', 'MIL'),
        p('j_mil_6', 'Frank', 'Brickowski', 'F', '21', 'MIL'),
      ]
    },
    { id: 'min_1992', abbreviation: 'MIN', full_name: 'Minnesota Timberwolves', city: 'Minnesota', name: 'Timberwolves',
      players: [
        p('j_min_1', 'Tony', 'Campbell', 'SF', '42', 'MIN'),
        p('j_min_2', 'Tyrone', 'Corbin', 'F', '22', 'MIN'),
        p('j_min_3', 'Felton', 'Spencer', 'C', '55', 'MIN'),
        p('j_min_4', 'Pooh', 'Richardson', 'PG', '11', 'MIN'),
        p('j_min_5', 'Gerald', 'Glass', 'G', '24', 'MIN'),
        p('j_min_6', 'Tod', 'Murphy', 'F', '32', 'MIN'),
      ]
    },
    { id: 'njn_1992', abbreviation: 'NJN', full_name: 'New Jersey Nets', city: 'New Jersey', name: 'Nets',
      players: [
        p('j_njn_1', 'Drazen', 'Petrovic', 'SG', '3', 'NJN'),
        p('j_njn_2', 'Derrick', 'Coleman', 'PF', '44', 'NJN'),
        p('j_njn_3', 'Chris', 'Morris', 'SF', '25', 'NJN'),
        p('j_njn_4', 'Kenny', 'Anderson', 'PG', '12', 'NJN'),
        p('j_njn_5', 'Sam', 'Bowie', 'C', '10', 'NJN'),
        p('j_njn_6', 'Terry', 'Mills', 'F', '35', 'NJN'),
      ]
    },
    { id: 'nyk_1992', abbreviation: 'NYK', full_name: 'New York Knicks', city: 'New York', name: 'Knicks',
      players: [
        p('j_nyk_1', 'Patrick', 'Ewing', 'C', '33', 'NYK'),
        p('j_nyk_2', 'Charles', 'Oakley', 'PF', '34', 'NYK'),
        p('j_nyk_3', 'Xavier', 'McDaniel', 'SF', '2', 'NYK'),
        p('j_nyk_4', 'John', 'Starks', 'SG', '3', 'NYK'),
        p('j_nyk_5', 'Mark', 'Jackson', 'PG', '13', 'NYK'),
        p('j_nyk_6', 'Anthony', 'Mason', 'F', '14', 'NYK'),
      ]
    },
    { id: 'orl_1992', abbreviation: 'ORL', full_name: 'Orlando Magic', city: 'Orlando', name: 'Magic',
      players: [
        p('j_orl_1', 'Shaquille', "O'Neal", 'C', '32', 'ORL'),
        p('j_orl_2', 'Nick', 'Anderson', 'SG', '25', 'ORL'),
        p('j_orl_3', 'Dennis', 'Scott', 'SF', '3', 'ORL'),
        p('j_orl_4', 'Scott', 'Skiles', 'PG', '4', 'ORL'),
        p('j_orl_5', 'Terry', 'Catledge', 'F', '21', 'ORL'),
        p('j_orl_6', 'Jerry', 'Reynolds', 'G', '5', 'ORL'),
      ]
    },
    { id: 'phi_1992', abbreviation: 'PHI', full_name: 'Philadelphia 76ers', city: 'Philadelphia', name: '76ers',
      players: [
        p('j_phi_1', 'Charles', 'Barkley', 'PF', '34', 'PHI'),
        p('j_phi_2', 'Hersey', 'Hawkins', 'SG', '33', 'PHI'),
        p('j_phi_3', 'Johnny', 'Dawkins', 'PG', '12', 'PHI'),
        p('j_phi_4', 'Ron', 'Anderson', 'SF', '10', 'PHI'),
        p('j_phi_5', 'Armon', 'Gilliam', 'PF', '35', 'PHI'),
        p('j_phi_6', 'Jeff', 'Ruland', 'C', '45', 'PHI'),
      ]
    },
    { id: 'phx_1992', abbreviation: 'PHX', full_name: 'Phoenix Suns', city: 'Phoenix', name: 'Suns',
      players: [
        p('j_phx_1', 'Charles', 'Barkley', 'PF', '34', 'PHX'),
        p('j_phx_2', 'Kevin', 'Johnson', 'PG', '7', 'PHX'),
        p('j_phx_3', 'Dan', 'Majerle', 'SG', '9', 'PHX'),
        p('j_phx_4', 'Tom', 'Chambers', 'SF', '10', 'PHX'),
        p('j_phx_5', 'Mark', 'West', 'C', '41', 'PHX'),
        p('j_phx_6', 'Cedric', 'Ceballos', 'F', '23', 'PHX'),
      ]
    },
    { id: 'por_1992', abbreviation: 'POR', full_name: 'Portland Trail Blazers', city: 'Portland', name: 'Trail Blazers',
      players: [
        p('j_por_1', 'Clyde', 'Drexler', 'SG', '22', 'POR'),
        p('j_por_2', 'Terry', 'Porter', 'PG', '30', 'POR'),
        p('j_por_3', 'Buck', 'Williams', 'PF', '52', 'POR'),
        p('j_por_4', 'Kevin', 'Duckworth', 'C', '42', 'POR'),
        p('j_por_5', 'Jerome', 'Kersey', 'SF', '25', 'POR'),
        p('j_por_6', 'Clifford', 'Robinson', 'F', '3', 'POR'),
      ]
    },
    { id: 'sac_1992', abbreviation: 'SAC', full_name: 'Sacramento Kings', city: 'Sacramento', name: 'Kings',
      players: [
        p('j_sac_1', 'Wayman', 'Tisdale', 'PF', '42', 'SAC'),
        p('j_sac_2', 'Mitch', 'Richmond', 'SG', '2', 'SAC'),
        p('j_sac_3', 'Lionel', 'Simmons', 'SF', '44', 'SAC'),
        p('j_sac_4', 'Spud', 'Webb', 'PG', '4', 'SAC'),
        p('j_sac_5', 'Antoine', 'Carr', 'C', '35', 'SAC'),
        p('j_sac_6', 'Randy', 'Brown', 'G', '3', 'SAC'),
      ]
    },
    { id: 'sas_1992', abbreviation: 'SAS', full_name: 'San Antonio Spurs', city: 'San Antonio', name: 'Spurs',
      players: [
        p('j_sas_1', 'David', 'Robinson', 'C', '50', 'SAS'),
        p('j_sas_2', 'Terry', 'Cummings', 'PF', '35', 'SAS'),
        p('j_sas_3', 'Sean', 'Elliott', 'SF', '32', 'SAS'),
        p('j_sas_4', 'Rod', 'Strickland', 'PG', '10', 'SAS'),
        p('j_sas_5', 'Willie', 'Anderson', 'G', '25', 'SAS'),
        p('j_sas_6', 'Antoine', 'Carr', 'C', '35', 'SAS'),
      ]
    },
    { id: 'sea_1992', abbreviation: 'SEA', full_name: 'Seattle SuperSonics', city: 'Seattle', name: 'SuperSonics',
      players: [
        p('j_sea_1', 'Shawn', 'Kemp', 'PF', '40', 'SEA'),
        p('j_sea_2', 'Gary', 'Payton', 'PG', '20', 'SEA'),
        p('j_sea_3', 'Ricky', 'Pierce', 'SG', '21', 'SEA'),
        p('j_sea_4', 'Eddie', 'Johnson', 'SF', '5', 'SEA'),
        p('j_sea_5', 'Benoit', 'Benjamin', 'C', '41', 'SEA'),
        p('j_sea_6', 'Nate', 'McMillan', 'G', '10', 'SEA'),
      ]
    },
    { id: 'uta_1992', abbreviation: 'UTA', full_name: 'Utah Jazz', city: 'Utah', name: 'Jazz',
      players: [
        p('j_uta_1', 'Karl', 'Malone', 'PF', '32', 'UTA'),
        p('j_uta_2', 'John', 'Stockton', 'PG', '12', 'UTA'),
        p('j_uta_3', 'Jeff', 'Malone', 'SG', '21', 'UTA'),
        p('j_uta_4', 'Mark', 'Eaton', 'C', '53', 'UTA'),
        p('j_uta_5', 'Thurl', 'Bailey', 'PF', '41', 'UTA'),
        p('j_uta_6', 'Blue', 'Edwards', 'G', '2', 'UTA'),
      ]
    },
    { id: 'was_1992', abbreviation: 'WAS', full_name: 'Washington Bullets', city: 'Washington', name: 'Bullets',
      players: [
        p('j_was_1', 'Bernard', 'King', 'SF', '30', 'WAS'),
        p('j_was_2', 'Pervis', 'Ellison', 'C', '32', 'WAS'),
        p('j_was_3', 'Harvey', 'Grant', 'PF', '34', 'WAS'),
        p('j_was_4', 'Ledell', 'Eackles', 'SG', '21', 'WAS'),
        p('j_was_5', 'Michael', 'Adams', 'PG', '11', 'WAS'),
        p('j_was_6', 'Larry', 'Stewart', 'F', '15', 'WAS'),
      ]
    },
  ]
};

// ─────────────────────────────────────────
// ERA: KOBE (2002-03)
// 29 teams
// ─────────────────────────────────────────
const ERA_KOBE = {
  era: 'kobe',
  season: '2002-03',
  teams: [
    { id: 'atl_2003', abbreviation: 'ATL', full_name: 'Atlanta Hawks', city: 'Atlanta', name: 'Hawks',
      players: [
        p('k_atl_1', 'Shareef', 'Abdur-Rahim', 'PF', '3', 'ATL'),
        p('k_atl_2', 'Jason', 'Terry', 'PG', '31', 'ATL'),
        p('k_atl_3', 'Glenn', 'Robinson', 'SF', '13', 'ATL'),
        p('k_atl_4', 'Theo', 'Ratliff', 'C', '42', 'ATL'),
        p('k_atl_5', 'Jacque', 'Vaughn', 'G', '10', 'ATL'),
        p('k_atl_6', 'Dan', 'Dickau', 'G', '20', 'ATL'),
      ]
    },
    { id: 'bos_2003', abbreviation: 'BOS', full_name: 'Boston Celtics', city: 'Boston', name: 'Celtics',
      players: [
        p('k_bos_1', 'Paul', 'Pierce', 'SF', '34', 'BOS'),
        p('k_bos_2', 'Antoine', 'Walker', 'PF', '8', 'BOS'),
        p('k_bos_3', 'Tony', 'Battie', 'C', '35', 'BOS'),
        p('k_bos_4', 'Kenny', 'Anderson', 'PG', '12', 'BOS'),
        p('k_bos_5', 'Eric', 'Williams', 'SF', '33', 'BOS'),
        p('k_bos_6', 'Tony', 'Delk', 'G', '00', 'BOS'),
      ]
    },
    { id: 'cha_2003', abbreviation: 'CHA', full_name: 'Charlotte Hornets', city: 'Charlotte', name: 'Hornets',
      players: [
        p('k_cha_1', 'Baron', 'Davis', 'PG', '5', 'CHA'),
        p('k_cha_2', 'Jamal', 'Mashburn', 'SF', '32', 'CHA'),
        p('k_cha_3', 'P.J.', 'Brown', 'PF', '54', 'CHA'),
        p('k_cha_4', 'Elden', 'Campbell', 'C', '41', 'CHA'),
        p('k_cha_5', 'David', 'Wesley', 'G', '11', 'CHA'),
        p('k_cha_6', 'Lee', 'Nailon', 'F', '40', 'CHA'),
      ]
    },
    { id: 'chi_2003', abbreviation: 'CHI', full_name: 'Chicago Bulls', city: 'Chicago', name: 'Bulls',
      players: [
        p('k_chi_1', 'Dwyane', 'Wade', 'SG', '3', 'CHI'),
        p('k_chi_2', 'Jalen', 'Rose', 'SF', '5', 'CHI'),
        p('k_chi_3', 'Jay', 'Williams', 'PG', '2', 'CHI'),
        p('k_chi_4', 'Eddy', 'Curry', 'C', '31', 'CHI'),
        p('k_chi_5', 'Tyson', 'Chandler', 'PF', '3', 'CHI'),
        p('k_chi_6', 'Fred', 'Hoiberg', 'G', '15', 'CHI'),
      ]
    },
    { id: 'cle_2003', abbreviation: 'CLE', full_name: 'Cleveland Cavaliers', city: 'Cleveland', name: 'Cavaliers',
      players: [
        p('k_cle_1', 'LeBron', 'James', 'SF', '23', 'CLE'),
        p('k_cle_2', 'Ricky', 'Davis', 'SG', '1', 'CLE'),
        p('k_cle_3', 'Carlos', 'Boozer', 'PF', '5', 'CLE'),
        p('k_cle_4', 'Zydrunas', 'Ilgauskas', 'C', '11', 'CLE'),
        p('k_cle_5', 'Jeff', 'McInnis', 'PG', '20', 'CLE'),
        p('k_cle_6', 'Darius', 'Miles', 'SF', '21', 'CLE'),
      ]
    },
    { id: 'dal_2003', abbreviation: 'DAL', full_name: 'Dallas Mavericks', city: 'Dallas', name: 'Mavericks',
      players: [
        p('k_dal_1', 'Dirk', 'Nowitzki', 'PF', '41', 'DAL'),
        p('k_dal_2', 'Steve', 'Nash', 'PG', '13', 'DAL'),
        p('k_dal_3', 'Michael', 'Finley', 'SG', '4', 'DAL'),
        p('k_dal_4', 'Shawn', 'Bradley', 'C', '44', 'DAL'),
        p('k_dal_5', 'Nick', 'Van Exel', 'G', '3', 'DAL'),
        p('k_dal_6', 'Eduardo', 'Najera', 'F', '14', 'DAL'),
      ]
    },
    { id: 'den_2003', abbreviation: 'DEN', full_name: 'Denver Nuggets', city: 'Denver', name: 'Nuggets',
      players: [
        p('k_den_1', 'Carmelo', 'Anthony', 'SF', '15', 'DEN'),
        p('k_den_2', 'Marcus', 'Camby', 'C', '23', 'DEN'),
        p('k_den_3', 'Nene', 'Hilario', 'PF', '31', 'DEN'),
        p('k_den_4', 'Andre', 'Miller', 'PG', '24', 'DEN'),
        p('k_den_5', 'Voshon', 'Lenard', 'SG', '5', 'DEN'),
        p('k_den_6', 'Chris', 'Andersen', 'F', '11', 'DEN'),
      ]
    },
    { id: 'det_2003', abbreviation: 'DET', full_name: 'Detroit Pistons', city: 'Detroit', name: 'Pistons',
      players: [
        p('k_det_1', 'Chauncey', 'Billups', 'PG', '1', 'DET'),
        p('k_det_2', 'Richard', 'Hamilton', 'SG', '32', 'DET'),
        p('k_det_3', 'Ben', 'Wallace', 'C', '3', 'DET'),
        p('k_det_4', 'Rasheed', 'Wallace', 'PF', '30', 'DET'),
        p('k_det_5', 'Tayshaun', 'Prince', 'SF', '22', 'DET'),
        p('k_det_6', 'Lindsey', 'Hunter', 'G', '10', 'DET'),
      ]
    },
    { id: 'gsw_2003', abbreviation: 'GSW', full_name: 'Golden State Warriors', city: 'Golden State', name: 'Warriors',
      players: [
        p('k_gsw_1', 'Jason', 'Richardson', 'SG', '23', 'GSW'),
        p('k_gsw_2', 'Antawn', 'Jamison', 'PF', '33', 'GSW'),
        p('k_gsw_3', 'Gilbert', 'Arenas', 'PG', '0', 'GSW'),
        p('k_gsw_4', 'Erick', 'Dampier', 'C', '25', 'GSW'),
        p('k_gsw_5', 'Mike', 'Dunleavy', 'SF', '34', 'GSW'),
        p('k_gsw_6', 'Nick', 'Van Exel', 'G', '3', 'GSW'),
      ]
    },
    { id: 'hou_2003', abbreviation: 'HOU', full_name: 'Houston Rockets', city: 'Houston', name: 'Rockets',
      players: [
        p('k_hou_1', 'Yao', 'Ming', 'C', '11', 'HOU'),
        p('k_hou_2', 'Steve', 'Francis', 'PG', '3', 'HOU'),
        p('k_hou_3', 'Cuttino', 'Mobley', 'SG', '15', 'HOU'),
        p('k_hou_4', 'Kelvin', 'Cato', 'C', '36', 'HOU'),
        p('k_hou_5', 'Moochie', 'Norris', 'G', '11', 'HOU'),
        p('k_hou_6', 'Maurice', 'Taylor', 'F', '4', 'HOU'),
      ]
    },
    { id: 'ind_2003', abbreviation: 'IND', full_name: 'Indiana Pacers', city: 'Indiana', name: 'Pacers',
      players: [
        p('k_ind_1', 'Reggie', 'Miller', 'SG', '31', 'IND'),
        p('k_ind_2', 'Jermaine', "O'Neal", 'PF', '7', 'IND'),
        p('k_ind_3', 'Ron', 'Artest', 'SF', '23', 'IND'),
        p('k_ind_4', 'Brad', 'Miller', 'C', '52', 'IND'),
        p('k_ind_5', 'Jamaal', 'Tinsley', 'PG', '11', 'IND'),
        p('k_ind_6', 'Al', 'Harrington', 'F', '3', 'IND'),
      ]
    },
    { id: 'lac_2003', abbreviation: 'LAC', full_name: 'Los Angeles Clippers', city: 'Los Angeles', name: 'Clippers',
      players: [
        p('k_lac_1', 'Elton', 'Brand', 'PF', '42', 'LAC'),
        p('k_lac_2', 'Lamar', 'Odom', 'SF', '7', 'LAC'),
        p('k_lac_3', 'Andre', 'Miller', 'PG', '24', 'LAC'),
        p('k_lac_4', 'Quentin', 'Richardson', 'SG', '15', 'LAC'),
        p('k_lac_5', 'Chris', 'Kaman', 'C', '35', 'LAC'),
        p('k_lac_6', 'Marko', 'Jaric', 'G', '8', 'LAC'),
      ]
    },
    { id: 'lal_2003', abbreviation: 'LAL', full_name: 'Los Angeles Lakers', city: 'Los Angeles', name: 'Lakers',
      players: [
        p('k_lal_1', 'Kobe', 'Bryant', 'SG', '8', 'LAL'),
        p('k_lal_2', 'Shaquille', "O'Neal", 'C', '34', 'LAL'),
        p('k_lal_3', 'Karl', 'Malone', 'PF', '11', 'LAL'),
        p('k_lal_4', 'Gary', 'Payton', 'PG', '20', 'LAL'),
        p('k_lal_5', 'Derek', 'Fisher', 'G', '2', 'LAL'),
        p('k_lal_6', 'Rick', 'Fox', 'SF', '17', 'LAL'),
      ]
    },
    { id: 'mem_2003', abbreviation: 'MEM', full_name: 'Memphis Grizzlies', city: 'Memphis', name: 'Grizzlies',
      players: [
        p('k_mem_1', 'Pau', 'Gasol', 'PF', '16', 'MEM'),
        p('k_mem_2', 'Shane', 'Battier', 'SF', '31', 'MEM'),
        p('k_mem_3', 'Jason', 'Williams', 'PG', '2', 'MEM'),
        p('k_mem_4', 'Mike', 'Miller', 'SG', '13', 'MEM'),
        p('k_mem_5', 'Lorenzen', 'Wright', 'C', '42', 'MEM'),
        p('k_mem_6', 'James', 'Posey', 'F', '4', 'MEM'),
      ]
    },
    { id: 'mia_2003', abbreviation: 'MIA', full_name: 'Miami Heat', city: 'Miami', name: 'Heat',
      players: [
        p('k_mia_1', 'Dwyane', 'Wade', 'SG', '3', 'MIA'),
        p('k_mia_2', 'Shaquille', "O'Neal", 'C', '32', 'MIA'),
        p('k_mia_3', 'Lamar', 'Odom', 'SF', '7', 'MIA'),
        p('k_mia_4', 'Damon', 'Jones', 'PG', '11', 'MIA'),
        p('k_mia_5', 'Udonis', 'Haslem', 'PF', '40', 'MIA'),
        p('k_mia_6', 'Rasual', 'Butler', 'G', '6', 'MIA'),
      ]
    },
    { id: 'mil_2003', abbreviation: 'MIL', full_name: 'Milwaukee Bucks', city: 'Milwaukee', name: 'Bucks',
      players: [
        p('k_mil_1', 'Ray', 'Allen', 'SG', '34', 'MIL'),
        p('k_mil_2', 'Glenn', 'Robinson', 'SF', '13', 'MIL'),
        p('k_mil_3', 'Sam', 'Cassell', 'PG', '10', 'MIL'),
        p('k_mil_4', 'Toni', 'Kukoc', 'F', '7', 'MIL'),
        p('k_mil_5', 'Joel', 'Przybilla', 'C', '12', 'MIL'),
        p('k_mil_6', 'Desmond', 'Mason', 'G', '21', 'MIL'),
      ]
    },
    { id: 'min_2003', abbreviation: 'MIN', full_name: 'Minnesota Timberwolves', city: 'Minnesota', name: 'Timberwolves',
      players: [
        p('k_min_1', 'Kevin', 'Garnett', 'PF', '21', 'MIN'),
        p('k_min_2', 'Wally', 'Szczerbiak', 'SF', '10', 'MIN'),
        p('k_min_3', 'Sam', 'Cassell', 'PG', '10', 'MIN'),
        p('k_min_4', 'Latrell', 'Sprewell', 'SG', '8', 'MIN'),
        p('k_min_5', 'Ervin', 'Johnson', 'C', '50', 'MIN'),
        p('k_min_6', 'Troy', 'Hudson', 'G', '4', 'MIN'),
      ]
    },
    { id: 'njn_2003', abbreviation: 'NJN', full_name: 'New Jersey Nets', city: 'New Jersey', name: 'Nets',
      players: [
        p('k_njn_1', 'Jason', 'Kidd', 'PG', '5', 'NJN'),
        p('k_njn_2', 'Vince', 'Carter', 'SG', '15', 'NJN'),
        p('k_njn_3', 'Richard', 'Jefferson', 'SF', '24', 'NJN'),
        p('k_njn_4', 'Kenyon', 'Martin', 'PF', '6', 'NJN'),
        p('k_njn_5', 'Jason', 'Collins', 'C', '34', 'NJN'),
        p('k_njn_6', 'Kerry', 'Kittles', 'G', '23', 'NJN'),
      ]
    },
    { id: 'nok_2003', abbreviation: 'NOK', full_name: 'New Orleans Hornets', city: 'New Orleans', name: 'Hornets',
      players: [
        p('k_nok_1', 'Baron', 'Davis', 'PG', '5', 'NOK'),
        p('k_nok_2', 'Jamal', 'Mashburn', 'SF', '32', 'NOK'),
        p('k_nok_3', 'P.J.', 'Brown', 'PF', '54', 'NOK'),
        p('k_nok_4', 'David', 'Wesley', 'G', '11', 'NOK'),
        p('k_nok_5', 'Jamaal', 'Magloire', 'C', '21', 'NOK'),
        p('k_nok_6', 'George', 'Lynch', 'F', '34', 'NOK'),
      ]
    },
    { id: 'nyk_2003', abbreviation: 'NYK', full_name: 'New York Knicks', city: 'New York', name: 'Knicks',
      players: [
        p('k_nyk_1', 'Stephon', 'Marbury', 'PG', '3', 'NYK'),
        p('k_nyk_2', 'Latrell', 'Sprewell', 'SG', '8', 'NYK'),
        p('k_nyk_3', 'Allan', 'Houston', 'SG', '20', 'NYK'),
        p('k_nyk_4', 'Kurt', 'Thomas', 'PF', '34', 'NYK'),
        p('k_nyk_5', 'Dikembe', 'Mutombo', 'C', '55', 'NYK'),
        p('k_nyk_6', 'Antonio', 'McDyess', 'F', '25', 'NYK'),
      ]
    },
    { id: 'orl_2003', abbreviation: 'ORL', full_name: 'Orlando Magic', city: 'Orlando', name: 'Magic',
      players: [
        p('k_orl_1', 'Tracy', 'McGrady', 'SG', '1', 'ORL'),
        p('k_orl_2', 'Grant', 'Hill', 'SF', '33', 'ORL'),
        p('k_orl_3', 'Pat', 'Garrity', 'F', '44', 'ORL'),
        p('k_orl_4', 'Darrell', 'Armstrong', 'PG', '10', 'ORL'),
        p('k_orl_5', 'Andrew', 'DeClercq', 'C', '55', 'ORL'),
        p('k_orl_6', 'Gordan', 'Giricek', 'G', '5', 'ORL'),
      ]
    },
    { id: 'phi_2003', abbreviation: 'PHI', full_name: 'Philadelphia 76ers', city: 'Philadelphia', name: '76ers',
      players: [
        p('k_phi_1', 'Allen', 'Iverson', 'PG', '3', 'PHI'),
        p('k_phi_2', 'Eric', 'Snow', 'PG', '12', 'PHI'),
        p('k_phi_3', 'Keith', 'Van Horn', 'PF', '22', 'PHI'),
        p('k_phi_4', 'Derrick', 'Coleman', 'F', '44', 'PHI'),
        p('k_phi_5', 'Theo', 'Ratliff', 'C', '42', 'PHI'),
        p('k_phi_6', 'Aaron', 'McKie', 'G', '8', 'PHI'),
      ]
    },
    { id: 'phx_2003', abbreviation: 'PHX', full_name: 'Phoenix Suns', city: 'Phoenix', name: 'Suns',
      players: [
        p('k_phx_1', 'Steve', 'Nash', 'PG', '13', 'PHX'),
        p('k_phx_2', 'Amare', 'Stoudemire', 'PF', '32', 'PHX'),
        p('k_phx_3', 'Shawn', 'Marion', 'SF', '31', 'PHX'),
        p('k_phx_4', 'Joe', 'Johnson', 'SG', '2', 'PHX'),
        p('k_phx_5', 'Leandro', 'Barbosa', 'G', '10', 'PHX'),
        p('k_phx_6', 'Quentin', 'Richardson', 'F', '15', 'PHX'),
      ]
    },
    { id: 'por_2003', abbreviation: 'POR', full_name: 'Portland Trail Blazers', city: 'Portland', name: 'Trail Blazers',
      players: [
        p('k_por_1', 'Rasheed', 'Wallace', 'PF', '30', 'POR'),
        p('k_por_2', 'Damon', 'Stoudamire', 'PG', '3', 'POR'),
        p('k_por_3', 'Zach', 'Randolph', 'F', '50', 'POR'),
        p('k_por_4', 'Derek', 'Anderson', 'SG', '21', 'POR'),
        p('k_por_5', 'Theo', 'Ratliff', 'C', '42', 'POR'),
        p('k_por_6', 'Scottie', 'Pippen', 'SF', '33', 'POR'),
      ]
    },
    { id: 'sac_2003', abbreviation: 'SAC', full_name: 'Sacramento Kings', city: 'Sacramento', name: 'Kings',
      players: [
        p('k_sac_1', 'Chris', 'Webber', 'PF', '4', 'SAC'),
        p('k_sac_2', 'Mike', 'Bibby', 'PG', '10', 'SAC'),
        p('k_sac_3', 'Vlade', 'Divac', 'C', '12', 'SAC'),
        p('k_sac_4', 'Peja', 'Stojakovic', 'SF', '16', 'SAC'),
        p('k_sac_5', 'Doug', 'Christie', 'SG', '13', 'SAC'),
        p('k_sac_6', 'Bobby', 'Jackson', 'G', '24', 'SAC'),
      ]
    },
    { id: 'sas_2003', abbreviation: 'SAS', full_name: 'San Antonio Spurs', city: 'San Antonio', name: 'Spurs',
      players: [
        p('k_sas_1', 'Tim', 'Duncan', 'PF', '21', 'SAS'),
        p('k_sas_2', 'Tony', 'Parker', 'PG', '9', 'SAS'),
        p('k_sas_3', 'Manu', 'Ginobili', 'SG', '20', 'SAS'),
        p('k_sas_4', 'David', 'Robinson', 'C', '50', 'SAS'),
        p('k_sas_5', 'Stephen', 'Jackson', 'SF', '3', 'SAS'),
        p('k_sas_6', 'Bruce', 'Bowen', 'F', '12', 'SAS'),
      ]
    },
    { id: 'sea_2003', abbreviation: 'SEA', full_name: 'Seattle SuperSonics', city: 'Seattle', name: 'SuperSonics',
      players: [
        p('k_sea_1', 'Ray', 'Allen', 'SG', '34', 'SEA'),
        p('k_sea_2', 'Rashard', 'Lewis', 'SF', '7', 'SEA'),
        p('k_sea_3', 'Desmond', 'Mason', 'G', '21', 'SEA'),
        p('k_sea_4', 'Brent', 'Barry', 'G', '12', 'SEA'),
        p('k_sea_5', 'Jerome', 'James', 'C', '55', 'SEA'),
        p('k_sea_6', 'Vladimir', 'Radmanovic', 'F', '10', 'SEA'),
      ]
    },
    { id: 'tor_2003', abbreviation: 'TOR', full_name: 'Toronto Raptors', city: 'Toronto', name: 'Raptors',
      players: [
        p('k_tor_1', 'Vince', 'Carter', 'SG', '15', 'TOR'),
        p('k_tor_2', 'Morris', 'Peterson', 'SF', '24', 'TOR'),
        p('k_tor_3', 'Alvin', 'Williams', 'PG', '7', 'TOR'),
        p('k_tor_4', 'Antonio', 'Davis', 'C', '33', 'TOR'),
        p('k_tor_5', 'Chris', 'Bosh', 'PF', '4', 'TOR'),
        p('k_tor_6', 'Lamond', 'Murray', 'F', '21', 'TOR'),
      ]
    },
    { id: 'uta_2003', abbreviation: 'UTA', full_name: 'Utah Jazz', city: 'Utah', name: 'Jazz',
      players: [
        p('k_uta_1', 'Karl', 'Malone', 'PF', '32', 'UTA'),
        p('k_uta_2', 'John', 'Stockton', 'PG', '12', 'UTA'),
        p('k_uta_3', 'Andrei', 'Kirilenko', 'SF', '47', 'UTA'),
        p('k_uta_4', 'Matt', 'Harpring', 'F', '14', 'UTA'),
        p('k_uta_5', 'Mehmet', 'Okur', 'C', '13', 'UTA'),
        p('k_uta_6', 'DeShawn', 'Stevenson', 'G', '2', 'UTA'),
      ]
    },
    { id: 'was_2003', abbreviation: 'WAS', full_name: 'Washington Wizards', city: 'Washington', name: 'Wizards',
      players: [
        p('k_was_1', 'Michael', 'Jordan', 'SG', '23', 'WAS'),
        p('k_was_2', 'Jerry', 'Stackhouse', 'SG', '42', 'WAS'),
        p('k_was_3', 'Kwame', 'Brown', 'PF', '15', 'WAS'),
        p('k_was_4', 'Larry', 'Hughes', 'G', '5', 'WAS'),
        p('k_was_5', 'Brendan', 'Haywood', 'C', '33', 'WAS'),
        p('k_was_6', 'Tyronn', 'Lue', 'G', '10', 'WAS'),
      ]
    },
  ]
};

// ─────────────────────────────────────────
// ERA: LEBRON (2010-11)
// 30 teams
// ─────────────────────────────────────────
const ERA_LEBRON = {
  era: 'lebron',
  season: '2010-11',
  teams: [
    { id: 'atl_2011', abbreviation: 'ATL', full_name: 'Atlanta Hawks', city: 'Atlanta', name: 'Hawks',
      players: [
        p('l_atl_1', 'Joe', 'Johnson', 'SG', '2', 'ATL'),
        p('l_atl_2', 'Josh', 'Smith', 'PF', '5', 'ATL'),
        p('l_atl_3', 'Al', 'Horford', 'C', '15', 'ATL'),
        p('l_atl_4', 'Mike', 'Bibby', 'PG', '10', 'ATL'),
        p('l_atl_5', 'Marvin', 'Williams', 'SF', '24', 'ATL'),
        p('l_atl_6', 'Jamal', 'Crawford', 'G', '11', 'ATL'),
      ]
    },
    { id: 'bos_2011', abbreviation: 'BOS', full_name: 'Boston Celtics', city: 'Boston', name: 'Celtics',
      players: [
        p('l_bos_1', 'Paul', 'Pierce', 'SF', '34', 'BOS'),
        p('l_bos_2', 'Kevin', 'Garnett', 'PF', '5', 'BOS'),
        p('l_bos_3', 'Ray', 'Allen', 'SG', '20', 'BOS'),
        p('l_bos_4', 'Rajon', 'Rondo', 'PG', '9', 'BOS'),
        p('l_bos_5', 'Nenad', 'Krstic', 'C', '4', 'BOS'),
        p('l_bos_6', 'Glen', 'Davis', 'F', '11', 'BOS'),
      ]
    },
    { id: 'cha_2011', abbreviation: 'CHA', full_name: 'Charlotte Bobcats', city: 'Charlotte', name: 'Bobcats',
      players: [
        p('l_cha_1', 'Stephen', 'Jackson', 'SF', '1', 'CHA'),
        p('l_cha_2', 'Gerald', 'Wallace', 'SF', '3', 'CHA'),
        p('l_cha_3', 'Boris', 'Diaw', 'PF', '32', 'CHA'),
        p('l_cha_4', 'D.J.', 'Augustin', 'PG', '14', 'CHA'),
        p('l_cha_5', 'Nazr', 'Mohammed', 'C', '13', 'CHA'),
        p('l_cha_6', 'Tyrus', 'Thomas', 'F', '12', 'CHA'),
      ]
    },
    { id: 'chi_2011', abbreviation: 'CHI', full_name: 'Chicago Bulls', city: 'Chicago', name: 'Bulls',
      players: [
        p('l_chi_1', 'Derrick', 'Rose', 'PG', '1', 'CHI'),
        p('l_chi_2', 'Luol', 'Deng', 'SF', '9', 'CHI'),
        p('l_chi_3', 'Carlos', 'Boozer', 'PF', '5', 'CHI'),
        p('l_chi_4', 'Joakim', 'Noah', 'C', '13', 'CHI'),
        p('l_chi_5', 'Richard', 'Hamilton', 'SG', '32', 'CHI'),
        p('l_chi_6', 'Kyle', 'Korver', 'G', '26', 'CHI'),
      ]
    },
    { id: 'cle_2011', abbreviation: 'CLE', full_name: 'Cleveland Cavaliers', city: 'Cleveland', name: 'Cavaliers',
      players: [
        p('l_cle_1', 'Mo', 'Williams', 'PG', '25', 'CLE'),
        p('l_cle_2', 'Antawn', 'Jamison', 'PF', '4', 'CLE'),
        p('l_cle_3', 'Anderson', 'Varejao', 'C', '17', 'CLE'),
        p('l_cle_4', 'Anthony', 'Parker', 'SG', '18', 'CLE'),
        p('l_cle_5', 'Ramon', 'Sessions', 'G', '7', 'CLE'),
        p('l_cle_6', 'J.J.', 'Hickson', 'F', '21', 'CLE'),
      ]
    },
    { id: 'dal_2011', abbreviation: 'DAL', full_name: 'Dallas Mavericks', city: 'Dallas', name: 'Mavericks',
      players: [
        p('l_dal_1', 'Dirk', 'Nowitzki', 'PF', '41', 'DAL'),
        p('l_dal_2', 'Jason', 'Terry', 'SG', '31', 'DAL'),
        p('l_dal_3', 'Jason', 'Kidd', 'PG', '5', 'DAL'),
        p('l_dal_4', 'Shawn', 'Marion', 'SF', '0', 'DAL'),
        p('l_dal_5', 'Tyson', 'Chandler', 'C', '6', 'DAL'),
        p('l_dal_6', 'DeShawn', 'Stevenson', 'G', '92', 'DAL'),
      ]
    },
    { id: 'den_2011', abbreviation: 'DEN', full_name: 'Denver Nuggets', city: 'Denver', name: 'Nuggets',
      players: [
        p('l_den_1', 'Ty', 'Lawson', 'PG', '3', 'DEN'),
        p('l_den_2', 'Wilson', 'Chandler', 'SF', '21', 'DEN'),
        p('l_den_3', 'Kenyon', 'Martin', 'PF', '4', 'DEN'),
        p('l_den_4', 'Nene', 'Hilario', 'C', '31', 'DEN'),
        p('l_den_5', 'Danilo', 'Gallinari', 'SF', '8', 'DEN'),
        p('l_den_6', 'Arron', 'Afflalo', 'G', '6', 'DEN'),
      ]
    },
    { id: 'det_2011', abbreviation: 'DET', full_name: 'Detroit Pistons', city: 'Detroit', name: 'Pistons',
      players: [
        p('l_det_1', 'Ben', 'Gordon', 'SG', '7', 'DET'),
        p('l_det_2', 'Tayshaun', 'Prince', 'SF', '22', 'DET'),
        p('l_det_3', 'Ben', 'Wallace', 'C', '6', 'DET'),
        p('l_det_4', 'Rodney', 'Stuckey', 'PG', '3', 'DET'),
        p('l_det_5', 'Greg', 'Monroe', 'PF', '10', 'DET'),
        p('l_det_6', 'Tracy', 'McGrady', 'G', '1', 'DET'),
      ]
    },
    { id: 'gsw_2011', abbreviation: 'GSW', full_name: 'Golden State Warriors', city: 'Golden State', name: 'Warriors',
      players: [
        p('l_gsw_1', 'Monta', 'Ellis', 'SG', '8', 'GSW'),
        p('l_gsw_2', 'Stephen', 'Curry', 'PG', '30', 'GSW'),
        p('l_gsw_3', 'David', 'Lee', 'PF', '10', 'GSW'),
        p('l_gsw_4', 'Andris', 'Biedrins', 'C', '15', 'GSW'),
        p('l_gsw_5', 'Dorell', 'Wright', 'SF', '1', 'GSW'),
        p('l_gsw_6', 'Reggie', 'Williams', 'G', '55', 'GSW'),
      ]
    },
    { id: 'hou_2011', abbreviation: 'HOU', full_name: 'Houston Rockets', city: 'Houston', name: 'Rockets',
      players: [
        p('l_hou_1', 'Kevin', 'Martin', 'SG', '23', 'HOU'),
        p('l_hou_2', 'Luis', 'Scola', 'PF', '4', 'HOU'),
        p('l_hou_3', 'Kyle', 'Lowry', 'PG', '7', 'HOU'),
        p('l_hou_4', 'Samuel', 'Dalembert', 'C', '10', 'HOU'),
        p('l_hou_5', 'Chase', 'Budinger', 'SF', '10', 'HOU'),
        p('l_hou_6', 'Goran', 'Dragic', 'G', '6', 'HOU'),
      ]
    },
    { id: 'ind_2011', abbreviation: 'IND', full_name: 'Indiana Pacers', city: 'Indiana', name: 'Pacers',
      players: [
        p('l_ind_1', 'Danny', 'Granger', 'SF', '33', 'IND'),
        p('l_ind_2', 'Paul', 'George', 'SF', '24', 'IND'),
        p('l_ind_3', 'Roy', 'Hibbert', 'C', '55', 'IND'),
        p('l_ind_4', 'Darren', 'Collison', 'PG', '2', 'IND'),
        p('l_ind_5', 'David', 'West', 'PF', '21', 'IND'),
        p('l_ind_6', 'Tyler', 'Hansbrough', 'F', '50', 'IND'),
      ]
    },
    { id: 'lac_2011', abbreviation: 'LAC', full_name: 'Los Angeles Clippers', city: 'Los Angeles', name: 'Clippers',
      players: [
        p('l_lac_1', 'Blake', 'Griffin', 'PF', '32', 'LAC'),
        p('l_lac_2', 'Eric', 'Gordon', 'SG', '10', 'LAC'),
        p('l_lac_3', 'DeAndre', 'Jordan', 'C', '6', 'LAC'),
        p('l_lac_4', 'Baron', 'Davis', 'PG', '85', 'LAC'),
        p('l_lac_5', 'Randy', 'Foye', 'G', '4', 'LAC'),
        p('l_lac_6', 'Ryan', 'Gomes', 'F', '14', 'LAC'),
      ]
    },
    { id: 'lal_2011', abbreviation: 'LAL', full_name: 'Los Angeles Lakers', city: 'Los Angeles', name: 'Lakers',
      players: [
        p('l_lal_1', 'Kobe', 'Bryant', 'SG', '24', 'LAL'),
        p('l_lal_2', 'Pau', 'Gasol', 'PF', '16', 'LAL'),
        p('l_lal_3', 'Andrew', 'Bynum', 'C', '17', 'LAL'),
        p('l_lal_4', 'Lamar', 'Odom', 'SF', '7', 'LAL'),
        p('l_lal_5', 'Derek', 'Fisher', 'PG', '2', 'LAL'),
        p('l_lal_6', 'Ron', 'Artest', 'F', '15', 'LAL'),
      ]
    },
    { id: 'mem_2011', abbreviation: 'MEM', full_name: 'Memphis Grizzlies', city: 'Memphis', name: 'Grizzlies',
      players: [
        p('l_mem_1', 'Zach', 'Randolph', 'PF', '50', 'MEM'),
        p('l_mem_2', 'Marc', 'Gasol', 'C', '33', 'MEM'),
        p('l_mem_3', 'Mike', 'Conley', 'PG', '11', 'MEM'),
        p('l_mem_4', 'Rudy', 'Gay', 'SF', '22', 'MEM'),
        p('l_mem_5', 'O.J.', 'Mayo', 'SG', '32', 'MEM'),
        p('l_mem_6', 'Tony', 'Allen', 'G', '9', 'MEM'),
      ]
    },
    { id: 'mia_2011', abbreviation: 'MIA', full_name: 'Miami Heat', city: 'Miami', name: 'Heat',
      players: [
        p('l_mia_1', 'LeBron', 'James', 'SF', '6', 'MIA'),
        p('l_mia_2', 'Dwyane', 'Wade', 'SG', '3', 'MIA'),
        p('l_mia_3', 'Chris', 'Bosh', 'PF', '1', 'MIA'),
        p('l_mia_4', 'Mario', 'Chalmers', 'PG', '15', 'MIA'),
        p('l_mia_5', 'Udonis', 'Haslem', 'C', '40', 'MIA'),
        p('l_mia_6', 'Mike', 'Miller', 'F', '13', 'MIA'),
      ]
    },
    { id: 'mil_2011', abbreviation: 'MIL', full_name: 'Milwaukee Bucks', city: 'Milwaukee', name: 'Bucks',
      players: [
        p('l_mil_1', 'Andrew', 'Bogut', 'C', '6', 'MIL'),
        p('l_mil_2', 'Brandon', 'Jennings', 'PG', '3', 'MIL'),
        p('l_mil_3', 'John', 'Salmons', 'SG', '12', 'MIL'),
        p('l_mil_4', 'Corey', 'Maggette', 'SF', '50', 'MIL'),
        p('l_mil_5', 'Drew', 'Gooden', 'PF', '4', 'MIL'),
        p('l_mil_6', 'Carlos', 'Delfino', 'F', '10', 'MIL'),
      ]
    },
    { id: 'min_2011', abbreviation: 'MIN', full_name: 'Minnesota Timberwolves', city: 'Minnesota', name: 'Timberwolves',
      players: [
        p('l_min_1', 'Kevin', 'Love', 'PF', '42', 'MIN'),
        p('l_min_2', 'Michael', 'Beasley', 'SF', '0', 'MIN'),
        p('l_min_3', 'Luke', 'Ridnour', 'PG', '13', 'MIN'),
        p('l_min_4', 'Darko', 'Milicic', 'C', '31', 'MIN'),
        p('l_min_5', 'Wayne', 'Ellington', 'G', '2', 'MIN'),
        p('l_min_6', 'Nikola', 'Pekovic', 'C', '14', 'MIN'),
      ]
    },
    { id: 'nok_2011', abbreviation: 'NOH', full_name: 'New Orleans Hornets', city: 'New Orleans', name: 'Hornets',
      players: [
        p('l_nok_1', 'Chris', 'Paul', 'PG', '3', 'NOH'),
        p('l_nok_2', 'Jarrett', 'Jack', 'PG', '2', 'NOH'),
        p('l_nok_3', 'Emeka', 'Okafor', 'C', '50', 'NOH'),
        p('l_nok_4', 'Marco', 'Belinelli', 'SG', '0', 'NOH'),
        p('l_nok_5', 'Trevor', 'Ariza', 'SF', '1', 'NOH'),
        p('l_nok_6', 'Willie', 'Green', 'G', '14', 'NOH'),
      ]
    },
    { id: 'njn_2011', abbreviation: 'NJN', full_name: 'New Jersey Nets', city: 'New Jersey', name: 'Nets',
      players: [
        p('l_njn_1', 'Brook', 'Lopez', 'C', '11', 'NJN'),
        p('l_njn_2', 'Travis', 'Outlaw', 'SF', '25', 'NJN'),
        p('l_njn_3', 'Deron', 'Williams', 'PG', '8', 'NJN'),
        p('l_njn_4', 'Kris', 'Humphries', 'PF', '43', 'NJN'),
        p('l_njn_5', 'Anthony', 'Morrow', 'SG', '21', 'NJN'),
        p('l_njn_6', 'Jordan', 'Farmar', 'G', '6', 'NJN'),
      ]
    },
    { id: 'nyk_2011', abbreviation: 'NYK', full_name: 'New York Knicks', city: 'New York', name: 'Knicks',
      players: [
        p('l_nyk_1', 'Amare', 'Stoudemire', 'PF', '1', 'NYK'),
        p('l_nyk_2', 'Carmelo', 'Anthony', 'SF', '7', 'NYK'),
        p('l_nyk_3', 'Chauncey', 'Billups', 'PG', '1', 'NYK'),
        p('l_nyk_4', 'Landry', 'Fields', 'SG', '2', 'NYK'),
        p('l_nyk_5', 'Toney', 'Douglas', 'G', '23', 'NYK'),
        p('l_nyk_6', 'Ronny', 'Turiaf', 'C', '14', 'NYK'),
      ]
    },
    { id: 'okc_2011', abbreviation: 'OKC', full_name: 'Oklahoma City Thunder', city: 'Oklahoma City', name: 'Thunder',
      players: [
        p('l_okc_1', 'Kevin', 'Durant', 'SF', '35', 'OKC'),
        p('l_okc_2', 'Russell', 'Westbrook', 'PG', '0', 'OKC'),
        p('l_okc_3', 'James', 'Harden', 'SG', '13', 'OKC'),
        p('l_okc_4', 'Serge', 'Ibaka', 'PF', '9', 'OKC'),
        p('l_okc_5', 'Kendrick', 'Perkins', 'C', '5', 'OKC'),
        p('l_okc_6', 'Nick', 'Collison', 'F', '4', 'OKC'),
      ]
    },
    { id: 'orl_2011', abbreviation: 'ORL', full_name: 'Orlando Magic', city: 'Orlando', name: 'Magic',
      players: [
        p('l_orl_1', 'Dwight', 'Howard', 'C', '12', 'ORL'),
        p('l_orl_2', 'Jameer', 'Nelson', 'PG', '14', 'ORL'),
        p('l_orl_3', 'Hedo', 'Turkoglu', 'SF', '15', 'ORL'),
        p('l_orl_4', 'Gilbert', 'Arenas', 'SG', '1', 'ORL'),
        p('l_orl_5', 'Ryan', 'Anderson', 'PF', '33', 'ORL'),
        p('l_orl_6', 'Jason', 'Richardson', 'G', '23', 'ORL'),
      ]
    },
    { id: 'phi_2011', abbreviation: 'PHI', full_name: 'Philadelphia 76ers', city: 'Philadelphia', name: '76ers',
      players: [
        p('l_phi_1', 'Andre', 'Iguodala', 'SF', '9', 'PHI'),
        p('l_phi_2', 'Elton', 'Brand', 'PF', '42', 'PHI'),
        p('l_phi_3', 'Jrue', 'Holiday', 'PG', '11', 'PHI'),
        p('l_phi_4', 'Thaddeus', 'Young', 'SF', '21', 'PHI'),
        p('l_phi_5', 'Spencer', 'Hawes', 'C', '00', 'PHI'),
        p('l_phi_6', 'Lou', 'Williams', 'G', '23', 'PHI'),
      ]
    },
    { id: 'phx_2011', abbreviation: 'PHX', full_name: 'Phoenix Suns', city: 'Phoenix', name: 'Suns',
      players: [
        p('l_phx_1', 'Steve', 'Nash', 'PG', '13', 'PHX'),
        p('l_phx_2', 'Grant', 'Hill', 'SF', '33', 'PHX'),
        p('l_phx_3', 'Channing', 'Frye', 'PF', '8', 'PHX'),
        p('l_phx_4', 'Jared', 'Dudley', 'SF', '3', 'PHX'),
        p('l_phx_5', 'Robin', 'Lopez', 'C', '15', 'PHX'),
        p('l_phx_6', 'Vince', 'Carter', 'G', '15', 'PHX'),
      ]
    },
    { id: 'por_2011', abbreviation: 'POR', full_name: 'Portland Trail Blazers', city: 'Portland', name: 'Trail Blazers',
      players: [
        p('l_por_1', 'LaMarcus', 'Aldridge', 'PF', '12', 'POR'),
        p('l_por_2', 'Brandon', 'Roy', 'SG', '7', 'POR'),
        p('l_por_3', 'Andre', 'Miller', 'PG', '24', 'POR'),
        p('l_por_4', 'Marcus', 'Camby', 'C', '23', 'POR'),
        p('l_por_5', 'Nicolas', 'Batum', 'SF', '88', 'POR'),
        p('l_por_6', 'Rudy', 'Fernandez', 'G', '5', 'POR'),
      ]
    },
    { id: 'sac_2011', abbreviation: 'SAC', full_name: 'Sacramento Kings', city: 'Sacramento', name: 'Kings',
      players: [
        p('l_sac_1', 'Tyreke', 'Evans', 'SG', '13', 'SAC'),
        p('l_sac_2', 'DeMarcus', 'Cousins', 'C', '15', 'SAC'),
        p('l_sac_3', 'Carl', 'Landry', 'PF', '7', 'SAC'),
        p('l_sac_4', 'Beno', 'Udrih', 'PG', '19', 'SAC'),
        p('l_sac_5', 'Marcus', 'Thornton', 'SG', '23', 'SAC'),
        p('l_sac_6', 'Omri', 'Casspi', 'F', '18', 'SAC'),
      ]
    },
    { id: 'sas_2011', abbreviation: 'SAS', full_name: 'San Antonio Spurs', city: 'San Antonio', name: 'Spurs',
      players: [
        p('l_sas_1', 'Tim', 'Duncan', 'PF', '21', 'SAS'),
        p('l_sas_2', 'Tony', 'Parker', 'PG', '9', 'SAS'),
        p('l_sas_3', 'Manu', 'Ginobili', 'SG', '20', 'SAS'),
        p('l_sas_4', 'Richard', 'Jefferson', 'SF', '24', 'SAS'),
        p('l_sas_5', 'DeJuan', 'Blair', 'C', '45', 'SAS'),
        p('l_sas_6', 'Gary', 'Neal', 'G', '14', 'SAS'),
      ]
    },
    { id: 'tor_2011', abbreviation: 'TOR', full_name: 'Toronto Raptors', city: 'Toronto', name: 'Raptors',
      players: [
        p('l_tor_1', 'Andrea', 'Bargnani', 'C', '7', 'TOR'),
        p('l_tor_2', 'Jose', 'Calderon', 'PG', '8', 'TOR'),
        p('l_tor_3', 'DeMar', 'DeRozan', 'SG', '10', 'TOR'),
        p('l_tor_4', 'Amir', 'Johnson', 'PF', '5', 'TOR'),
        p('l_tor_5', 'Sonny', 'Weems', 'SF', '21', 'TOR'),
        p('l_tor_6', 'Leandro', 'Barbosa', 'G', '10', 'TOR'),
      ]
    },
    { id: 'uta_2011', abbreviation: 'UTA', full_name: 'Utah Jazz', city: 'Utah', name: 'Jazz',
      players: [
        p('l_uta_1', 'Devin', 'Harris', 'PG', '5', 'UTA'),
        p('l_uta_2', 'Andrei', 'Kirilenko', 'SF', '47', 'UTA'),
        p('l_uta_3', 'Paul', 'Millsap', 'F', '24', 'UTA'),
        p('l_uta_4', 'Al', 'Jefferson', 'C', '25', 'UTA'),
        p('l_uta_5', 'Gordon', 'Hayward', 'SF', '20', 'UTA'),
        p('l_uta_6', 'Raja', 'Bell', 'G', '19', 'UTA'),
      ]
    },
    { id: 'was_2011', abbreviation: 'WAS', full_name: 'Washington Wizards', city: 'Washington', name: 'Wizards',
      players: [
        p('l_was_1', 'John', 'Wall', 'PG', '2', 'WAS'),
        p('l_was_2', 'Andray', 'Blatche', 'PF', '0', 'WAS'),
        p('l_was_3', 'Nick', 'Young', 'SG', '1', 'WAS'),
        p('l_was_4', 'Josh', 'Howard', 'SF', '5', 'WAS'),
        p('l_was_5', 'JaVale', 'McGee', 'C', '34', 'WAS'),
        p('l_was_6', 'Kirk', 'Hinrich', 'G', '12', 'WAS'),
      ]
    },
  ]
};

// ─────────────────────────────────────────
// ERA: STEPH (2016-17)
// 30 teams
// ─────────────────────────────────────────
const ERA_STEPH = {
  era: 'steph',
  season: '2016-17',
  teams: [
    { id: 'atl_2017', abbreviation: 'ATL', full_name: 'Atlanta Hawks', city: 'Atlanta', name: 'Hawks',
      players: [
        p('s_atl_1', 'Paul', 'Millsap', 'PF', '4', 'ATL'),
        p('s_atl_2', 'Dennis', 'Schroder', 'PG', '17', 'ATL'),
        p('s_atl_3', 'Kent', 'Bazemore', 'SF', '24', 'ATL'),
        p('s_atl_4', 'Dwight', 'Howard', 'C', '8', 'ATL'),
        p('s_atl_5', 'Tim', 'Hardaway Jr', 'SG', '10', 'ATL'),
        p('s_atl_6', 'Malcolm', 'Delaney', 'G', '7', 'ATL'),
      ]
    },
    { id: 'bos_2017', abbreviation: 'BOS', full_name: 'Boston Celtics', city: 'Boston', name: 'Celtics',
      players: [
        p('s_bos_1', 'Isaiah', 'Thomas', 'PG', '4', 'BOS'),
        p('s_bos_2', 'Avery', 'Bradley', 'SG', '0', 'BOS'),
        p('s_bos_3', 'Jae', 'Crowder', 'SF', '99', 'BOS'),
        p('s_bos_4', 'Al', 'Horford', 'C', '42', 'BOS'),
        p('s_bos_5', 'Jaylen', 'Brown', 'SF', '7', 'BOS'),
        p('s_bos_6', 'Marcus', 'Smart', 'G', '36', 'BOS'),
      ]
    },
    { id: 'bkn_2017', abbreviation: 'BKN', full_name: 'Brooklyn Nets', city: 'Brooklyn', name: 'Nets',
      players: [
        p('s_bkn_1', 'Brook', 'Lopez', 'C', '11', 'BKN'),
        p('s_bkn_2', 'Jeremy', 'Lin', 'PG', '7', 'BKN'),
        p('s_bkn_3', 'Bojan', 'Bogdanovic', 'SF', '44', 'BKN'),
        p('s_bkn_4', 'Joe', 'Harris', 'SG', '12', 'BKN'),
        p('s_bkn_5', 'Trevor', 'Booker', 'PF', '35', 'BKN'),
        p('s_bkn_6', 'Randy', 'Foye', 'G', '4', 'BKN'),
      ]
    },
    { id: 'cha_2017', abbreviation: 'CHA', full_name: 'Charlotte Hornets', city: 'Charlotte', name: 'Hornets',
      players: [
        p('s_cha_1', 'Kemba', 'Walker', 'PG', '15', 'CHA'),
        p('s_cha_2', 'Nicolas', 'Batum', 'SF', '5', 'CHA'),
        p('s_cha_3', 'Marvin', 'Williams', 'PF', '2', 'CHA'),
        p('s_cha_4', 'Frank', 'Kaminsky', 'C', '44', 'CHA'),
        p('s_cha_5', 'Michael', 'Kidd-Gilchrist', 'SF', '14', 'CHA'),
        p('s_cha_6', 'Marco', 'Belinelli', 'G', '0', 'CHA'),
      ]
    },
    { id: 'chi_2017', abbreviation: 'CHI', full_name: 'Chicago Bulls', city: 'Chicago', name: 'Bulls',
      players: [
        p('s_chi_1', 'Jimmy', 'Butler', 'SF', '21', 'CHI'),
        p('s_chi_2', 'Dwyane', 'Wade', 'SG', '3', 'CHI'),
        p('s_chi_3', 'Rajon', 'Rondo', 'PG', '9', 'CHI'),
        p('s_chi_4', 'Robin', 'Lopez', 'C', '42', 'CHI'),
        p('s_chi_5', 'Nikola', 'Mirotic', 'PF', '44', 'CHI'),
        p('s_chi_6', 'Isaiah', 'Canaan', 'G', '0', 'CHI'),
      ]
    },
    { id: 'cle_2017', abbreviation: 'CLE', full_name: 'Cleveland Cavaliers', city: 'Cleveland', name: 'Cavaliers',
      players: [
        p('s_cle_1', 'LeBron', 'James', 'SF', '23', 'CLE'),
        p('s_cle_2', 'Kyrie', 'Irving', 'PG', '2', 'CLE'),
        p('s_cle_3', 'Kevin', 'Love', 'PF', '0', 'CLE'),
        p('s_cle_4', 'Tristan', 'Thompson', 'C', '13', 'CLE'),
        p('s_cle_5', 'J.R.', 'Smith', 'SG', '5', 'CLE'),
        p('s_cle_6', 'Kyle', 'Korver', 'G', '26', 'CLE'),
      ]
    },
    { id: 'dal_2017', abbreviation: 'DAL', full_name: 'Dallas Mavericks', city: 'Dallas', name: 'Mavericks',
      players: [
        p('s_dal_1', 'Dirk', 'Nowitzki', 'PF', '41', 'DAL'),
        p('s_dal_2', 'Harrison', 'Barnes', 'SF', '40', 'DAL'),
        p('s_dal_3', 'Deron', 'Williams', 'PG', '8', 'DAL'),
        p('s_dal_4', 'Seth', 'Curry', 'SG', '30', 'DAL'),
        p('s_dal_5', 'Andrew', 'Bogut', 'C', '6', 'DAL'),
        p('s_dal_6', 'J.J.', 'Barea', 'G', '5', 'DAL'),
      ]
    },
    { id: 'den_2017', abbreviation: 'DEN', full_name: 'Denver Nuggets', city: 'Denver', name: 'Nuggets',
      players: [
        p('s_den_1', 'Nikola', 'Jokic', 'C', '15', 'DEN'),
        p('s_den_2', 'Gary', 'Harris', 'SG', '14', 'DEN'),
        p('s_den_3', 'Wilson', 'Chandler', 'SF', '21', 'DEN'),
        p('s_den_4', 'Danilo', 'Gallinari', 'PF', '8', 'DEN'),
        p('s_den_5', 'Jamal', 'Murray', 'PG', '27', 'DEN'),
        p('s_den_6', 'Emmanuel', 'Mudiay', 'G', '0', 'DEN'),
      ]
    },
    { id: 'det_2017', abbreviation: 'DET', full_name: 'Detroit Pistons', city: 'Detroit', name: 'Pistons',
      players: [
        p('s_det_1', 'Andre', 'Drummond', 'C', '0', 'DET'),
        p('s_det_2', 'Reggie', 'Jackson', 'PG', '1', 'DET'),
        p('s_det_3', 'Marcus', 'Morris', 'PF', '13', 'DET'),
        p('s_det_4', 'Tobias', 'Harris', 'SF', '12', 'DET'),
        p('s_det_5', 'Kentavious', 'Caldwell-Pope', 'SG', '5', 'DET'),
        p('s_det_6', 'Ish', 'Smith', 'G', '14', 'DET'),
      ]
    },
    { id: 'gsw_2017', abbreviation: 'GSW', full_name: 'Golden State Warriors', city: 'Golden State', name: 'Warriors',
      players: [
        p('s_gsw_1', 'Stephen', 'Curry', 'PG', '30', 'GSW'),
        p('s_gsw_2', 'Kevin', 'Durant', 'SF', '35', 'GSW'),
        p('s_gsw_3', 'Klay', 'Thompson', 'SG', '11', 'GSW'),
        p('s_gsw_4', 'Draymond', 'Green', 'PF', '23', 'GSW'),
        p('s_gsw_5', 'Zaza', 'Pachulia', 'C', '27', 'GSW'),
        p('s_gsw_6', 'Andre', 'Iguodala', 'F', '9', 'GSW'),
      ]
    },
    { id: 'hou_2017', abbreviation: 'HOU', full_name: 'Houston Rockets', city: 'Houston', name: 'Rockets',
      players: [
        p('s_hou_1', 'James', 'Harden', 'PG', '13', 'HOU'),
        p('s_hou_2', 'Eric', 'Gordon', 'SG', '10', 'HOU'),
        p('s_hou_3', 'Ryan', 'Anderson', 'PF', '3', 'HOU'),
        p('s_hou_4', 'Clint', 'Capela', 'C', '15', 'HOU'),
        p('s_hou_5', 'Trevor', 'Ariza', 'SF', '1', 'HOU'),
        p('s_hou_6', 'Lou', 'Williams', 'G', '12', 'HOU'),
      ]
    },
    { id: 'ind_2017', abbreviation: 'IND', full_name: 'Indiana Pacers', city: 'Indiana', name: 'Pacers',
      players: [
        p('s_ind_1', 'Paul', 'George', 'SF', '13', 'IND'),
        p('s_ind_2', 'Myles', 'Turner', 'C', '33', 'IND'),
        p('s_ind_3', 'Jeff', 'Teague', 'PG', '44', 'IND'),
        p('s_ind_4', 'Thaddeus', 'Young', 'PF', '21', 'IND'),
        p('s_ind_5', 'Glenn', 'Robinson III', 'SF', '40', 'IND'),
        p('s_ind_6', 'Al', 'Jefferson', 'C', '25', 'IND'),
      ]
    },
    { id: 'lac_2017', abbreviation: 'LAC', full_name: 'Los Angeles Clippers', city: 'Los Angeles', name: 'Clippers',
      players: [
        p('s_lac_1', 'Chris', 'Paul', 'PG', '3', 'LAC'),
        p('s_lac_2', 'Blake', 'Griffin', 'PF', '32', 'LAC'),
        p('s_lac_3', 'DeAndre', 'Jordan', 'C', '6', 'LAC'),
        p('s_lac_4', 'J.J.', 'Redick', 'SG', '4', 'LAC'),
        p('s_lac_5', 'Luc', 'Mbah a Moute', 'SF', '12', 'LAC'),
        p('s_lac_6', 'Raymond', 'Felton', 'G', '0', 'LAC'),
      ]
    },
    { id: 'lal_2017', abbreviation: 'LAL', full_name: 'Los Angeles Lakers', city: 'Los Angeles', name: 'Lakers',
      players: [
        p('s_lal_1', 'Jordan', 'Clarkson', 'SG', '6', 'LAL'),
        p('s_lal_2', 'Julius', 'Randle', 'PF', '30', 'LAL'),
        p('s_lal_3', 'Brandon', 'Ingram', 'SF', '14', 'LAL'),
        p('s_lal_4', 'D Angelo', 'Russell', 'PG', '1', 'LAL'),
        p('s_lal_5', 'Timofey', 'Mozgov', 'C', '20', 'LAL'),
        p('s_lal_6', 'Nick', 'Young', 'G', '0', 'LAL'),
      ]
    },
    { id: 'mem_2017', abbreviation: 'MEM', full_name: 'Memphis Grizzlies', city: 'Memphis', name: 'Grizzlies',
      players: [
        p('s_mem_1', 'Marc', 'Gasol', 'C', '33', 'MEM'),
        p('s_mem_2', 'Mike', 'Conley', 'PG', '11', 'MEM'),
        p('s_mem_3', 'Zach', 'Randolph', 'PF', '50', 'MEM'),
        p('s_mem_4', 'Tony', 'Allen', 'SG', '9', 'MEM'),
        p('s_mem_5', 'James', 'Ennis', 'SF', '11', 'MEM'),
        p('s_mem_6', 'Vince', 'Carter', 'G', '15', 'MEM'),
      ]
    },
    { id: 'mia_2017', abbreviation: 'MIA', full_name: 'Miami Heat', city: 'Miami', name: 'Heat',
      players: [
        p('s_mia_1', 'Hassan', 'Whiteside', 'C', '21', 'MIA'),
        p('s_mia_2', 'Goran', 'Dragic', 'PG', '7', 'MIA'),
        p('s_mia_3', 'Dion', 'Waiters', 'SG', '11', 'MIA'),
        p('s_mia_4', 'James', 'Johnson', 'SF', '16', 'MIA'),
        p('s_mia_5', 'Josh', 'Richardson', 'G', '0', 'MIA'),
        p('s_mia_6', 'Luke', 'Babbitt', 'F', '5', 'MIA'),
      ]
    },
    { id: 'mil_2017', abbreviation: 'MIL', full_name: 'Milwaukee Bucks', city: 'Milwaukee', name: 'Bucks',
      players: [
        p('s_mil_1', 'Giannis', 'Antetokounmpo', 'SF', '34', 'MIL'),
        p('s_mil_2', 'Khris', 'Middleton', 'SG', '22', 'MIL'),
        p('s_mil_3', 'Greg', 'Monroe', 'C', '15', 'MIL'),
        p('s_mil_4', 'Malcolm', 'Brogdon', 'PG', '13', 'MIL'),
        p('s_mil_5', 'Tony', 'Snell', 'SF', '21', 'MIL'),
        p('s_mil_6', 'Mirza', 'Teletovic', 'F', '35', 'MIL'),
      ]
    },
    { id: 'min_2017', abbreviation: 'MIN', full_name: 'Minnesota Timberwolves', city: 'Minnesota', name: 'Timberwolves',
      players: [
        p('s_min_1', 'Karl-Anthony', 'Towns', 'C', '32', 'MIN'),
        p('s_min_2', 'Andrew', 'Wiggins', 'SF', '22', 'MIN'),
        p('s_min_3', 'Zach', 'LaVine', 'SG', '8', 'MIN'),
        p('s_min_4', 'Ricky', 'Rubio', 'PG', '9', 'MIN'),
        p('s_min_5', 'Gorgui', 'Dieng', 'PF', '5', 'MIN'),
        p('s_min_6', 'Brandon', 'Rush', 'G', '4', 'MIN'),
      ]
    },
    { id: 'nok_2017', abbreviation: 'NOP', full_name: 'New Orleans Pelicans', city: 'New Orleans', name: 'Pelicans',
      players: [
        p('s_nop_1', 'Anthony', 'Davis', 'PF', '23', 'NOP'),
        p('s_nop_2', 'Jrue', 'Holiday', 'PG', '11', 'NOP'),
        p('s_nop_3', 'DeMarcus', 'Cousins', 'C', '0', 'NOP'),
        p('s_nop_4', 'Solomon', 'Hill', 'SF', '44', 'NOP'),
        p('s_nop_5', 'E\'Twaun', 'Moore', 'SG', '55', 'NOP'),
        p('s_nop_6', 'Jordan', 'Crawford', 'G', '15', 'NOP'),
      ]
    },
    { id: 'nyk_2017', abbreviation: 'NYK', full_name: 'New York Knicks', city: 'New York', name: 'Knicks',
      players: [
        p('s_nyk_1', 'Carmelo', 'Anthony', 'SF', '7', 'NYK'),
        p('s_nyk_2', 'Kristaps', 'Porzingis', 'PF', '6', 'NYK'),
        p('s_nyk_3', 'Derrick', 'Rose', 'PG', '25', 'NYK'),
        p('s_nyk_4', 'Joakim', 'Noah', 'C', '13', 'NYK'),
        p('s_nyk_5', 'Courtney', 'Lee', 'SG', '5', 'NYK'),
        p('s_nyk_6', 'Lance', 'Thomas', 'F', '42', 'NYK'),
      ]
    },
    { id: 'okc_2017', abbreviation: 'OKC', full_name: 'Oklahoma City Thunder', city: 'Oklahoma City', name: 'Thunder',
      players: [
        p('s_okc_1', 'Russell', 'Westbrook', 'PG', '0', 'OKC'),
        p('s_okc_2', 'Victor', 'Oladipo', 'SG', '4', 'OKC'),
        p('s_okc_3', 'Steven', 'Adams', 'C', '12', 'OKC'),
        p('s_okc_4', 'Enes', 'Kanter', 'C', '11', 'OKC'),
        p('s_okc_5', 'Jerami', 'Grant', 'PF', '9', 'OKC'),
        p('s_okc_6', 'Andre', 'Roberson', 'G', '21', 'OKC'),
      ]
    },
    { id: 'orl_2017', abbreviation: 'ORL', full_name: 'Orlando Magic', city: 'Orlando', name: 'Magic',
      players: [
        p('s_orl_1', 'Nikola', 'Vucevic', 'C', '9', 'ORL'),
        p('s_orl_2', 'Elfrid', 'Payton', 'PG', '4', 'ORL'),
        p('s_orl_3', 'Aaron', 'Gordon', 'PF', '00', 'ORL'),
        p('s_orl_4', 'Evan', 'Fournier', 'SG', '10', 'ORL'),
        p('s_orl_5', 'Terrence', 'Ross', 'SF', '31', 'ORL'),
        p('s_orl_6', 'D.J.', 'Augustin', 'G', '14', 'ORL'),
      ]
    },
    { id: 'phi_2017', abbreviation: 'PHI', full_name: 'Philadelphia 76ers', city: 'Philadelphia', name: '76ers',
      players: [
        p('s_phi_1', 'Joel', 'Embiid', 'C', '21', 'PHI'),
        p('s_phi_2', 'Ben', 'Simmons', 'PG', '25', 'PHI'),
        p('s_phi_3', 'Dario', 'Saric', 'PF', '9', 'PHI'),
        p('s_phi_4', 'Robert', 'Covington', 'SF', '33', 'PHI'),
        p('s_phi_5', 'T.J.', 'McConnell', 'G', '12', 'PHI'),
        p('s_phi_6', 'Jerryd', 'Bayless', 'G', '18', 'PHI'),
      ]
    },
    { id: 'phx_2017', abbreviation: 'PHX', full_name: 'Phoenix Suns', city: 'Phoenix', name: 'Suns',
      players: [
        p('s_phx_1', 'Devin', 'Booker', 'SG', '1', 'PHX'),
        p('s_phx_2', 'Eric', 'Bledsoe', 'PG', '2', 'PHX'),
        p('s_phx_3', 'Marquese', 'Chriss', 'PF', '0', 'PHX'),
        p('s_phx_4', 'Alex', 'Len', 'C', '21', 'PHX'),
        p('s_phx_5', 'T.J.', 'Warren', 'SF', '12', 'PHX'),
        p('s_phx_6', 'Brandon', 'Knight', 'G', '11', 'PHX'),
      ]
    },
    { id: 'por_2017', abbreviation: 'POR', full_name: 'Portland Trail Blazers', city: 'Portland', name: 'Trail Blazers',
      players: [
        p('s_por_1', 'Damian', 'Lillard', 'PG', '0', 'POR'),
        p('s_por_2', 'CJ', 'McCollum', 'SG', '3', 'POR'),
        p('s_por_3', 'Al-Farouq', 'Aminu', 'SF', '8', 'POR'),
        p('s_por_4', 'Mason', 'Plumlee', 'C', '24', 'POR'),
        p('s_por_5', 'Evan', 'Turner', 'G', '1', 'POR'),
        p('s_por_6', 'Meyers', 'Leonard', 'F', '11', 'POR'),
      ]
    },
    { id: 'sac_2017', abbreviation: 'SAC', full_name: 'Sacramento Kings', city: 'Sacramento', name: 'Kings',
      players: [
        p('s_sac_1', 'Buddy', 'Hield', 'SG', '24', 'SAC'),
        p('s_sac_2', 'Rudy', 'Gay', 'SF', '8', 'SAC'),
        p('s_sac_3', 'Darren', 'Collison', 'PG', '7', 'SAC'),
        p('s_sac_4', 'Ty', 'Lawson', 'G', '3', 'SAC'),
        p('s_sac_5', 'Georgios', 'Papagiannis', 'C', '13', 'SAC'),
        p('s_sac_6', 'Matt', 'Barnes', 'F', '22', 'SAC'),
      ]
    },
    { id: 'sas_2017', abbreviation: 'SAS', full_name: 'San Antonio Spurs', city: 'San Antonio', name: 'Spurs',
      players: [
        p('s_sas_1', 'Kawhi', 'Leonard', 'SF', '2', 'SAS'),
        p('s_sas_2', 'LaMarcus', 'Aldridge', 'PF', '12', 'SAS'),
        p('s_sas_3', 'Tony', 'Parker', 'PG', '9', 'SAS'),
        p('s_sas_4', 'Manu', 'Ginobili', 'SG', '20', 'SAS'),
        p('s_sas_5', 'Pau', 'Gasol', 'C', '16', 'SAS'),
        p('s_sas_6', 'Patty', 'Mills', 'G', '8', 'SAS'),
      ]
    },
    { id: 'tor_2017', abbreviation: 'TOR', full_name: 'Toronto Raptors', city: 'Toronto', name: 'Raptors',
      players: [
        p('s_tor_1', 'DeMar', 'DeRozan', 'SG', '10', 'TOR'),
        p('s_tor_2', 'Kyle', 'Lowry', 'PG', '7', 'TOR'),
        p('s_tor_3', 'Jonas', 'Valanciunas', 'C', '17', 'TOR'),
        p('s_tor_4', 'Serge', 'Ibaka', 'PF', '9', 'TOR'),
        p('s_tor_5', 'Norman', 'Powell', 'SG', '24', 'TOR'),
        p('s_tor_6', 'Patrick', 'Patterson', 'F', '54', 'TOR'),
      ]
    },
    { id: 'uta_2017', abbreviation: 'UTA', full_name: 'Utah Jazz', city: 'Utah', name: 'Jazz',
      players: [
        p('s_uta_1', 'Gordon', 'Hayward', 'SF', '20', 'UTA'),
        p('s_uta_2', 'Rudy', 'Gobert', 'C', '27', 'UTA'),
        p('s_uta_3', 'George', 'Hill', 'PG', '3', 'UTA'),
        p('s_uta_4', 'Derrick', 'Favors', 'PF', '15', 'UTA'),
        p('s_uta_5', 'Joe', 'Ingles', 'SF', '2', 'UTA'),
        p('s_uta_6', 'Rodney', 'Hood', 'G', '5', 'UTA'),
      ]
    },
    { id: 'was_2017', abbreviation: 'WAS', full_name: 'Washington Wizards', city: 'Washington', name: 'Wizards',
      players: [
        p('s_was_1', 'John', 'Wall', 'PG', '2', 'WAS'),
        p('s_was_2', 'Bradley', 'Beal', 'SG', '3', 'WAS'),
        p('s_was_3', 'Otto', 'Porter Jr', 'SF', '22', 'WAS'),
        p('s_was_4', 'Markieff', 'Morris', 'PF', '5', 'WAS'),
        p('s_was_5', 'Marcin', 'Gortat', 'C', '13', 'WAS'),
        p('s_was_6', 'Jason', 'Smith', 'F', '14', 'WAS'),
      ]
    },
  ]
};

// ─────────────────────────────────────────
// SEED ALL ERAS
// ─────────────────────────────────────────
async function seedEra(eraData) {
  console.log(`\nSeeding ${eraData.era} (${eraData.season})...`);
  for (const team of eraData.teams) {
    await setDoc(doc(db, 'era_rosters', eraData.era, 'teams', team.id), {
      id: team.id,
      abbreviation: team.abbreviation,
      full_name: team.full_name,
      city: team.city,
      name: team.name,
      era: eraData.era,
      season: eraData.season,
      players: team.players,
    });
    process.stdout.write('.');
  }
  console.log(` Done! ${eraData.teams.length} teams`);
}

async function main() {
  await seedEra(ERA_MAGIC_BIRD);
  await seedEra(ERA_JORDAN);
  await seedEra(ERA_KOBE);
  await seedEra(ERA_LEBRON);
  await seedEra(ERA_STEPH);
  console.log('\n🏆 All era rosters seeded!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
