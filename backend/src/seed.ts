import bcrypt from 'bcryptjs';
import { getDb } from './db/client.js';
import { createRepos } from './db/repos/index.js';

async function seed(): Promise<void> {
  const db = getDb();
  const repos = createRepos(db);

  const existingAdmin = await repos.users.findByEmail('admin@venuescout.it');
  if (existingAdmin) {
    console.log('Seed already applied (admin user exists), skipping.');
    process.exit(0);
  }

  const admin = await repos.users.create({
    email: 'admin@venuescout.it',
    name: 'Amministratore',
    passwordHash: await bcrypt.hash('venuescout-admin', 10),
    role: 'admin',
  });
  console.log(`admin user: ${admin.email} (password: venuescout-admin — change it!)`);

  const hotel = await repos.locations.create({
    name: 'Grand Hotel Aurelia',
    slug: 'grand-hotel-aurelia',
    summary: 'Hotel 5 stelle sul lungomare con spazi congressuali e terrazza panoramica.',
    addressLine: 'Lungomare Regina Margherita 12',
    city: 'Roma',
    province: 'RM',
    postalCode: '00121',
    country: 'IT',
    geom: { lon: 12.4534, lat: 41.9109 },
    visitStatus: 'visitata',
    logistics: {
      auto: 'Accesso diretto dal lungomare',
      pullman: 'Area sosta bus a 200 m',
      ztl: { present: false },
      private_parking: { spots: 80 },
      notes: 'Carico/scarico dal retro, ingresso fornitori dedicato',
    },
    technical: { max_kw: 120, generators: true, cooking: 'induzione', heavy_vehicle_access: true },
    accessibilityRating: 5,
    smartTags: ['conferenze', 'gala_dinner', 'wedding'],
    impressions: 'Struttura elegante, staff molto disponibile, ideale per eventi corporate di alto livello.',
  });

  const hotelSpace = await repos.locations.createSpace({
    locationId: hotel.id,
    kind: 'interno',
    name: 'Sala Imperiale',
    areaSqm: '420',
    heightM: '6.5',
    covered: 'coperto',
    sort: 0,
  });
  await repos.locations.setCapacities(hotelSpace.id, [
    { configuration: 'platea', capacity: 350 },
    { configuration: 'tavoli_tondi', capacity: 220 },
    { configuration: 'in_piedi', capacity: 450 },
  ]);

  const restaurant = await repos.locations.create({
    name: 'Ristorante La Veranda',
    slug: 'ristorante-la-veranda',
    parentLocationId: hotel.id,
    summary: 'Ristorante interno al Grand Hotel Aurelia con veranda vista mare.',
    visitStatus: 'visitata',
    smartTags: ['lunch', 'gala_dinner'],
  });
  const verandaSpace = await repos.locations.createSpace({
    locationId: restaurant.id,
    kind: 'esterno',
    name: 'Veranda vista mare',
    areaSqm: '180',
    covered: 'copribile',
    sort: 0,
  });
  await repos.locations.setCapacities(verandaSpace.id, [
    { configuration: 'tavoli_tondi', capacity: 90 },
    { configuration: 'cocktail', capacity: 140 },
  ]);

  const project = await repos.projects.create({
    name: 'Convention ACME 2026',
    clientName: 'ACME S.p.A.',
    status: 'attivo',
    notes: 'Convention annuale con cena di gala.',
  });

  const conference = await repos.projects.createEvent({
    projectId: project.id,
    name: 'Sessione plenaria',
    eventType: 'conferenza',
    dateStart: '2026-10-15',
    dateEnd: '2026-10-15',
    pax: 300,
    brief: 'Plenaria per 300 persone con regia audio/video completa.',
    sort: 0,
  });
  const gala = await repos.projects.createEvent({
    projectId: project.id,
    name: 'Cena di gala',
    eventType: 'gala_dinner',
    dateStart: '2026-10-15',
    pax: 200,
    brief: 'Cena di gala elegante, preferibilmente vista mare.',
    sort: 1,
  });

  await repos.projects.addEventLocation({
    eventId: conference.id,
    locationId: hotel.id,
    status: 'proposta',
    notes: 'Sala Imperiale perfetta per la plenaria.',
  });
  await repos.projects.addEventLocation({
    eventId: gala.id,
    locationId: restaurant.id,
    status: 'preselezionata',
    notes: 'Veranda da verificare per ottobre (copertura).',
  });

  console.log('Seed complete: 1 admin, 2 locations (nested), 1 project, 2 events, 2 shortlist entries.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
