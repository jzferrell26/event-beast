// Organizer-supplied public copy, not an inferred internal run of show.
// Sources: Sonia Le, "agenda" (2026-09-30 06:02:05Z), corrected
// "RE: Lunch (Oct. 7)" (06:24:40Z), "Lunch (Oct. 8)" (06:26:03Z).
// A missing end stays unconfirmed; the importer uses a private scheduling
// boundary only to satisfy the existing session schema, never as display copy.
const s = (time, title, extra = {}) => ({ time, title, room: '', type: 'Session', description: '', speakers: [], ...extra });
const meal7 = '12:30–1pm Rory Vaden book signing at Impact Arena. VIP lunch buffet and bonus session in Marsalis Hall A (downstairs). Cuantico breakout with boxed lunches in Cumberland K (downstairs). General Admission seating in Marsalis Hall B (downstairs). Non-hosted food trucks outside the hotel. See Lunch for room capacities and menus.';
const meal8 = 'VIP lunch buffet and bonus session in Marsalis Hall A (downstairs). Boxed-lunch breakouts: Angelica Ventrice in Cumberland J, Neel Dhingra in Cumberland K, and Angie Noack & Rachel Lambert with Braincode Centers in Cumberland L (downstairs). General Admission seating in Marsalis Hall B. Non-hosted food trucks outside the hotel. See Lunch for availability and menus.';
const morning7 = 'Meet Don & Gino at the gym for a workout.\nMeet Ken Perry at the balloon arch for a leisurely walk.\nMeet Thomas Meister at the hotel lobby fountain for a run.\nMeet Angelica Ventrice at the Skyline Tower entrance for meditation & breathwork.\nMeet Sasha Stair for a casual yoga session downstairs in Marsalis Hall A.';
const morning8 = 'Meet Don & Gino at the gym for a workout.\nMeet Brady Thomas at the balloon arch for a leisurely walk.\nMeet Thomas Meister at the hotel lobby fountain for a run.\nMeet Angelica Ventrice at the Skyline Tower entrance for meditation & breathwork.';
export const program = [
 { date: '2026-10-06', label: 'Kickoff Day', rows: [
  s('13:00', 'Registration & Impact Arena open', { room: 'Impact Arena' }),
  s('16:00', 'Ballroom doors open', { previousTitle: 'Doors open', room: 'Ballroom' }),
  s('16:30', 'Kickoff session begins', { previousTitle: 'Opening remarks' }),
  s('16:50', 'Eric Post', { previousTitle: 'AI and HALO', speakers: ['Eric Post'] }),
  s('17:10', 'The Value of Community & Taking Action When Others Aren’t', { previousTitle: 'The power of community', speakers: ['Garin Heslop'], type: 'Keynote' }),
  s('17:40', 'Breakthrough', { previousTitle: 'Brian Biro keynote', speakers: ['Brian Biro'], type: 'Keynote' }),
  s('19:00', '“Paint the Town Red” Kickoff Party', { end: '20:30', previousTitle: 'Opening night networking party', room: 'Impact Arena', type: 'Networking', description: 'Wear red!' }),
 ] },
 { date: '2026-10-07', label: 'Day 2', rows: [
  s('06:30', 'Morning activities', { type: 'Networking', description: morning7 }),
  s('07:30', 'Registration and breakfast open', { room: 'Impact Arena' }),
  s('08:00', 'Ballroom doors open', { previousTitle: 'Doors open', room: 'Ballroom' }),
  s('08:30', 'Day 2 kickoff'),
  s('08:40', 'Simon Thomsen', { previousTitle: 'Simon Thomsen', speakers: ['Simon Thomsen'] }),
  s('09:00', 'Person of Interest', { previousTitle: 'Coach Michael Burt keynote', speakers: ['Michael Burt'], type: 'Keynote' }),
  s('10:00', 'Leadership Panel', { previousTitle: 'Leadership panel', type: 'Panel', speakers: ['Sasha Stair','Allison Johnston','Candice McNaught','Lyra Waggoner','Rose Marie David'], description: 'Moderator: Sasha Stair. Panelists: Allison Johnston, Candice McNaught, Lyra Waggoner, Rose Marie David.' }),
  s('10:50', 'Break', { previousTitle: 'Morning break', end: '11:05', type: 'Break' }),
  s('11:05', 'How to Get Out of the Commodity Trap', { previousTitle: 'Craig Davis', type: 'Keynote', speakers: ['Craig Davis'] }),
  s('11:30', 'Rory Vaden', { previousTitle: 'Rory Vaden keynote', type: 'Keynote', speakers: ['Rory Vaden'] }),
  s('12:30', 'Lunch', { previousTitle: 'Lunch', end: '14:00', type: 'Break', description: meal7 }),
  s('14:00', 'Fun raffle', { previousTitle: 'Afternoon welcome and balloon giveaway', room: 'Ballroom', description: 'Back in the ballroom—don’t be late!' }),
  s('14:05', 'Top Producer Panel', { previousTitle: 'Top producer panel', type: 'Panel', speakers: ['Dave Savage','Brady Thomas','Nicki Montelongo'], description: 'Moderator: Dave Savage. Panelists: Brady Thomas & Nicki Montelongo.' }),
  s('15:00', 'How to Keep Your Momentum Going Year-Round', { previousTitle: 'Mastermind and membership session', description: 'Momentum Builders' }),
  s('15:30', 'Extended break', { previousTitle: 'Afternoon break', end: '16:00', type: 'Break', room: 'Impact Arena', description: 'Pet some puppies in the Impact Arena!' }),
  s('16:00', 'Deborah Byrd', { previousTitle: 'Deborah Byrd', type: 'Keynote', speakers: ['Deborah Byrd'] }),
  s('16:20', 'AI Panel', { previousTitle: 'Panel with Gino Fronti', type: 'Panel', speakers: ['Gino Fronti','Anita Padilla-Fitzgerald','Eric Post'], description: 'Moderator: Gino Fronti. Panelists: Anita Padilla, Eric Post, Steven Petrov.' }),
  s('16:55', 'Adversity is the Assignment', { previousTitle: 'Chris Welton keynote', type: 'Keynote', speakers: ['Chris Welton'] }),
  s('17:30', 'Day 2 concludes · Chris Welton book signing', { room: 'Impact Arena', description: 'Chris Welton book signing at Impact Arena.', speakers: ['Chris Welton'] }),
 ] },
 { date: '2026-10-08', label: 'Day 3', rows: [
  s('06:30', 'Morning activities', { type: 'Networking', description: morning8 }),
  s('07:30', 'Registration and breakfast open', { room: 'Impact Arena' }),
  s('08:00', 'Ballroom doors open', { previousTitle: 'Doors open', room: 'Ballroom' }),
  s('08:30', 'Day 3 kickoff'),
  s('08:40', 'Angelica Ventrice', { previousTitle: 'The Identity Trap', speakers: ['Angelica Ventrice'] }),
  s('09:00', 'The Champion’s Code', { previousTitle: 'Ross Bernstein keynote', type: 'Keynote', speakers: ['Ross Bernstein'] }),
  s('09:45', 'AI Myths vs Execution', { previousTitle: 'Abdel Khawatmi', type: 'Keynote', speakers: ['Abdel Khawatmi'] }),
  s('10:05', 'Angie Noack & Rachel Lambert', { previousTitle: 'Built for Breakthrough: The Neurology of the 1%', type: 'Keynote', speakers: ['Angie Noack','Rachel Lambert'] }),
  s('11:00', 'Break', { previousTitle: 'Morning break', end: '11:15', type: 'Break' }),
  s('11:15', 'Neel Dhingra', { previousTitle: 'Neel Dhingra', type: 'Keynote', speakers: ['Neel Dhingra'] }),
  s('12:10', 'How to Keep Your Momentum Going Year-Round', { previousTitle: 'Membership session', description: 'Momentum Builders' }),
  s('12:30', 'Lunch', { previousTitle: 'Lunch', end: '14:00', type: 'Break', description: meal8 }),
  s('14:00', 'Fun raffle', { room: 'Ballroom', description: 'Back in the ballroom—don’t be late!' }),
  s('14:05', 'Money being left on the table: AI Follow up systems', { previousTitle: 'Money being left on the table: AI follow-up systems', type: 'Panel', speakers: ['Gino Fronti','Jay Jones'], description: 'Moderator: Gino Fronti. Panelists: Dan Catinella & Jay Jones.' }),
  s('14:40', 'Break', { previousTitle: 'Afternoon break', type: 'Break' }),
  s('15:00', 'Cabo prize giveaway', { description: 'Must be present to win!' }),
  s('15:05', 'The Big Reveal', { previousTitle: 'The Trap: "It Has To Be Me"', type: 'Panel', speakers: ['Thomas Meister','Alex Varela','Jason Jacobs','Neena Vlamis'], description: 'Moderator: Thomas Meister. Panelists: Alex Varela, Jason Jacobs, Neena Vlamis.' }),
  s('15:50', 'Dustin Owen', { previousTitle: 'Session to be confirmed', speakers: ['Dustin Owen'] }),
  s('16:10', 'Josh Pitts', { previousTitle: 'Josh Pitts', speakers: ['Josh Pitts'] }),
  s('16:30', 'Ken Perry & Bill Hart', { previousTitle: 'Ken Perry and Coach Bill Hart', speakers: ['Ken Perry','Bill Hart'] }),
  s('17:00', 'Closing'),
  s('17:15', 'Sessions conclude'),
  s('17:30', 'Closing party & cornhole tournament', { previousTitle: 'Closing party', end: '20:00', room: 'Skyline Terrace', type: 'Networking', description: 'Follow the signs!' }),
 ] },
];

const lunch = (date, category, title, location, description, extra = {}) => ({ date, category, title, location, hours: '12:30 PM – 2:00 PM', description, dietary_info: '', menu_url: '', ...extra });
const trucks = date => [
 lunch(date,'Food Truck','Not Just Q.','Right outside the hotel','Traditional BBQ meats & sides. Custom menu: Brisket, Pulled Pork, Chicken, Sausage. Available as a BBQ sandwich, meat plate or tacos. Sides: smoked BBQ pit beans, cheesy corn, potato salad, coleslaw, kettle chips.'),
 lunch(date,'Food Truck','Waffleolicious','Right outside the hotel','Sweet & savory waffles, fries & chicken tenders. Full menu.',{ menu_url:'https://www.waffleoliciousdfw.com/' }),
 lunch(date,'Food Truck','Street Bites','Right outside the hotel','Sliders, tacos, cheesesteak, sides and dessert. Full menu.',{ menu_url:'https://streetbitestx.com/' }),
];
export const lunches = [
 lunch('2026-10-07','VIP','VIP lunch buffet & Leadership Panel','Marsalis Hall A (downstairs)','Optional lunch buffet & bonus session. Moderator: Dave Savage. Panelists: Andrew Moon, Haley Parker, Jeremy Forcier.'),
 lunch('2026-10-07','Breakout','Cuantico breakout','Cumberland K (downstairs)','Boxed lunch available, first come, first served. Only 50 lunches / 60 seats.'),
 lunch('2026-10-07','Seating','General Admission lunch seating','Marsalis Hall B (downstairs)','Seating is available in Marsalis Hall B.'),
 ...trucks('2026-10-07'),
 lunch('2026-10-07','Food Truck','Cousins Maine Lobster','Right outside the hotel','Lobster rolls; lobster grilled cheese, quesadilla, tacos and tots; soups, chips and dessert. Full menu. Pre-order by downloading the provider’s app.',{ menu_url:'https://www.cousinsmainelobster.com/locations/dallas-fort-worth-tx' }),
 lunch('2026-10-08','VIP','VIP lunch buffet & Wealth Building Panel','Marsalis Hall A (downstairs)','Optional lunch buffet & bonus session. Moderator: Jim McMahan. Panelists: Sam Mistretta, Robert Clark, and one panelist to be confirmed.'),
 lunch('2026-10-08','Breakout','Angelica Ventrice breakout','Cumberland J (downstairs)','Boxed lunch available, first come, first served. Only 30 lunches / 40 seats.'),
 lunch('2026-10-08','Breakout','Neel Dhingra breakout','Cumberland K (downstairs)','Boxed lunch available, first come, first served. Only 70 lunches / 70 seats.'),
 lunch('2026-10-08','Breakout','Braincode Centers breakout','Cumberland L (downstairs)','With Angie Noack & Rachel Lambert. Boxed lunch available, first come, first served. Only 50 lunches / 60 seats.'),
 lunch('2026-10-08','Seating','General Admission lunch seating','Marsalis Hall B (downstairs)','Seating is available in Marsalis Hall B.'),
 ...trucks('2026-10-08'),
 lunch('2026-10-08','Food Truck','The Bop Bop','Right outside the hotel','Korean BBQ. Custom menu: Bop rice bowls with beef, chicken, pork, combo or vegan options. Appetizers: mandu (chicken, pork or veggie) and egg rolls (pork or veggie).'),
];
