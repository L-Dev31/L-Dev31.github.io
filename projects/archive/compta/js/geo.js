export function locateCity() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation non disponible sur cet appareil.'));
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const r = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${longitude}&lat=${latitude}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const props = (await r.json()).features?.[0]?.properties;
          if (!props) throw new Error('Aucune ville trouvée à cet endroit.');
          resolve({ postalCode: props.postcode || '', city: props.city || props.name || '' });
        } catch (e) { reject(e); }
      },
      () => reject(new Error('Localisation refusée ou indisponible.')),
      { timeout: 10000, maximumAge: 300000 }
    );
  });
}
