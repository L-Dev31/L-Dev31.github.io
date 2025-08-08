const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

console.log('Creating database tables...');

db.serialize(() => {
  // Create prospects table
  db.run(`CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    google_maps_url TEXT,
    image_url TEXT,
    rating REAL,
    reviews_count INTEGER,
    category TEXT,
    status TEXT DEFAULT 'active',
    has_website INTEGER DEFAULT 0,
    city TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, function(err) {
    if (err) console.error('Error creating prospects table:', err);
    else console.log('✅ Prospects table created');
  });

  // Create playlists table
  db.run(`CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, function(err) {
    if (err) console.error('Error creating playlists table:', err);
    else console.log('✅ Playlists table created');
  });

  // Create prospect_playlists junction table
  db.run(`CREATE TABLE IF NOT EXISTS prospect_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    prospect_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, prospect_id)
  )`, function(err) {
    if (err) console.error('Error creating prospect_playlists table:', err);
    else console.log('✅ Prospect_playlists table created');
  });

  // Add test data
  const testProspects = [
    { 
      name: 'Restaurant Le Gourmet', 
      address: '123 Rue de la Paix, 75001 Paris', 
      phone: '01 23 45 67 89', 
      website: 'https://legourmet.fr', 
      google_maps_url: 'https://www.google.com/maps/place/Restaurant+Le+Gourmet/@48.8566,2.3522,15z',
      category: 'Restaurant',
      has_website: 1,
      city: 'Paris'
    },
    { 
      name: 'Café Central', 
      address: '45 Boulevard Saint-Germain, 75005 Paris', 
      phone: '01 34 56 78 90', 
      website: 'https://cafecentral.fr', 
      google_maps_url: 'https://www.google.com/maps/place/Café+Central/@48.8543,2.3445,15z',
      category: 'Café',
      has_website: 1,
      city: 'Paris'
    },
    { 
      name: 'Boulangerie Moderne', 
      address: '67 Avenue des Champs-Élysées, 75008 Paris', 
      phone: '01 45 67 89 01', 
      website: '', 
      google_maps_url: 'https://www.google.com/maps/place/Boulangerie+Moderne/@48.8738,2.2950,15z',
      category: 'Boulangerie',
      has_website: 0,
      city: 'Paris'
    },
    { 
      name: 'Salon de Coiffure Élégance', 
      address: '12 Rue de Rivoli, 75004 Paris', 
      phone: '01 56 78 90 12', 
      website: 'https://elegance-coiffure.fr', 
      google_maps_url: 'https://www.google.com/maps/place/Élégance/@48.8566,2.3488,15z',
      category: 'Coiffure',
      has_website: 1,
      city: 'Paris'
    }
  ];

  testProspects.forEach((prospect, index) => {
    setTimeout(() => {
      db.run(
        `INSERT INTO prospects (name, address, phone, website, google_maps_url, category, has_website, city) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [prospect.name, prospect.address, prospect.phone, prospect.website, prospect.google_maps_url, prospect.category, prospect.has_website, prospect.city],
        function(err) {
          if (err) console.error('Error inserting prospect:', err);
          else console.log(`✅ Added: ${prospect.name} (ID: ${this.lastID})`);
        }
      );
    }, (index + 1) * 100);
  });
});

setTimeout(() => {
  db.close();
  console.log('\n🎯 Database initialization complete!');
}, 2000);
