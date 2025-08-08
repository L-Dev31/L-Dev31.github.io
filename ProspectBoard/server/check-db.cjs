const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.all('SELECT id, name, status FROM prospects ORDER BY id', [], (err, rows) => {
  if (err) console.error(err);
  else {
    console.log('Prospects in database:');
    rows.forEach(row => console.log(`ID: ${row.id}, Name: ${row.name}, Status: ${row.status}`));
  }
  db.close();
});
