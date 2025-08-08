import { useState, useEffect } from 'react';
import { CogIcon, EnvelopeIcon, CircleStackIcon, BellIcon } from '@heroicons/react/24/outline';

export default function Settings() {
  const [emailSettings, setEmailSettings] = useState({
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPass: '',
    fromName: '',
    fromEmail: ''
  });

  const [scrapingSettings, setScrapingSettings] = useState({
    maxResults: 50,
    delayBetweenRequests: 2000,
    headless: true,
    autoSave: true
  });

  const [notifications, setNotifications] = useState({
    emailCampaigns: true,
    scrapingComplete: true,
    errors: true
  });

  const [isLoading, setIsLoading] = useState(false);

  const saveEmailSettings = async () => {
    setIsLoading(true);
    try {
      // Simuler la sauvegarde des paramètres email
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('Paramètres email sauvegardés avec succès !');
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const saveScrapingSettings = async () => {
    setIsLoading(true);
    try {
      // Simuler la sauvegarde des paramètres de scraping
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('Paramètres de scraping sauvegardés avec succès !');
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const testEmailConnection = async () => {
    setIsLoading(true);
    try {
      // Simuler le test de connexion email
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert('Connexion email testée avec succès !');
    } catch (error) {
      alert('Erreur de connexion email');
    } finally {
      setIsLoading(false);
    }
  };

  const exportData = async () => {
    setIsLoading(true);
    try {
      // Simuler l'export des données
      await new Promise(resolve => setTimeout(resolve, 1500));
      alert('Données exportées avec succès !');
    } catch (error) {
      alert('Erreur lors de l\'export');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-dark-text-primary">Paramètres</h1>
        <p className="text-dark-text-secondary mt-1">
          Configurez ProspectBoard selon vos besoins
        </p>
      </div>

      {/* Paramètres Email */}
      <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-olo-primary/20 rounded-lg">
            <EnvelopeIcon className="h-6 w-6 text-olo-primary" />
          </div>
          <h2 className="text-xl font-semibold text-dark-text-primary">Configuration Email</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Serveur SMTP
            </label>
            <input
              type="text"
              value={emailSettings.smtpHost}
              onChange={(e) => setEmailSettings({...emailSettings, smtpHost: e.target.value})}
              placeholder="smtp.gmail.com"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-tertiary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Port SMTP
            </label>
            <input
              type="number"
              value={emailSettings.smtpPort}
              onChange={(e) => setEmailSettings({...emailSettings, smtpPort: e.target.value})}
              placeholder="587"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-tertiary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Nom d'utilisateur
            </label>
            <input
              type="email"
              value={emailSettings.smtpUser}
              onChange={(e) => setEmailSettings({...emailSettings, smtpUser: e.target.value})}
              placeholder="votre@email.com"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-tertiary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={emailSettings.smtpPass}
              onChange={(e) => setEmailSettings({...emailSettings, smtpPass: e.target.value})}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-tertiary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Nom de l'expéditeur
            </label>
            <input
              type="text"
              value={emailSettings.fromName}
              onChange={(e) => setEmailSettings({...emailSettings, fromName: e.target.value})}
              placeholder="Votre Nom"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-tertiary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Email de l'expéditeur
            </label>
            <input
              type="email"
              value={emailSettings.fromEmail}
              onChange={(e) => setEmailSettings({...emailSettings, fromEmail: e.target.value})}
              placeholder="contact@votre-entreprise.com"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-tertiary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>
        </div>

        <div className="flex space-x-4 mt-6">
          <button
            onClick={saveEmailSettings}
            disabled={isLoading}
            className="px-6 py-3 bg-olo-primary hover:bg-olo-primary-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200 disabled:opacity-50"
          >
            {isLoading ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
          <button
            onClick={testEmailConnection}
            disabled={isLoading}
            className="px-6 py-3 bg-olo-secondary hover:bg-olo-secondary-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200 disabled:opacity-50"
          >
            {isLoading ? 'Test...' : 'Tester la connexion'}
          </button>
        </div>
      </div>

      {/* Paramètres de Scraping */}
      <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-olo-accent/20 rounded-lg">
            <CogIcon className="h-6 w-6 text-olo-accent" />
          </div>
          <h2 className="text-xl font-semibold text-dark-text-primary">Paramètres de Scraping</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Nombre maximum de résultats
            </label>
            <input
              type="number"
              value={scrapingSettings.maxResults}
              onChange={(e) => setScrapingSettings({...scrapingSettings, maxResults: parseInt(e.target.value)})}
              min="1"
              max="100"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-primary mb-2">
              Délai entre les requêtes (ms)
            </label>
            <input
              type="number"
              value={scrapingSettings.delayBetweenRequests}
              onChange={(e) => setScrapingSettings({...scrapingSettings, delayBetweenRequests: parseInt(e.target.value)})}
              min="1000"
              max="10000"
              step="500"
              className="w-full px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
            />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-dark-text-primary font-medium">Mode invisible (headless)</h4>
              <p className="text-dark-text-tertiary text-sm">Scraper sans ouvrir de fenêtre de navigateur</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scrapingSettings.headless}
                onChange={(e) => setScrapingSettings({...scrapingSettings, headless: e.target.checked})}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-dark-bg-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olo-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-dark-text-primary font-medium">Sauvegarde automatique</h4>
              <p className="text-dark-text-tertiary text-sm">Sauvegarder automatiquement les prospects trouvés</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scrapingSettings.autoSave}
                onChange={(e) => setScrapingSettings({...scrapingSettings, autoSave: e.target.checked})}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-dark-bg-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olo-primary"></div>
            </label>
          </div>
        </div>

        <button
          onClick={saveScrapingSettings}
          disabled={isLoading}
          className="mt-6 px-6 py-3 bg-olo-accent hover:bg-olo-accent/80 text-olo-secondary rounded-lg font-medium transition-colors duration-200 disabled:opacity-50"
        >
          {isLoading ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
        </button>
      </div>

      {/* Notifications */}
      <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-olo-secondary/20 rounded-lg">
            <BellIcon className="h-6 w-6 text-olo-secondary" />
          </div>
          <h2 className="text-xl font-semibold text-dark-text-primary">Notifications</h2>
        </div>

        <div className="space-y-4">
          {Object.entries(notifications).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <h4 className="text-dark-text-primary font-medium">
                  {key === 'emailCampaigns' && 'Campagnes email'}
                  {key === 'scrapingComplete' && 'Scraping terminé'}
                  {key === 'errors' && 'Erreurs système'}
                </h4>
                <p className="text-dark-text-tertiary text-sm">
                  {key === 'emailCampaigns' && 'Notifications pour les campagnes email'}
                  {key === 'scrapingComplete' && 'Notifications quand le scraping est terminé'}
                  {key === 'errors' && 'Notifications en cas d\'erreur'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setNotifications({...notifications, [key]: e.target.checked})}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-dark-bg-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olo-primary"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Gestion des données */}
      <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-dark-bg-secondary0/20 rounded-lg">
            <CircleStackIcon className="h-6 w-6 text-gray-500" />
          </div>
          <h2 className="text-xl font-semibold text-dark-text-primary">Gestion des Données</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-dark-bg-secondary rounded-lg border border-dark-border">
            <div>
              <h4 className="text-dark-text-primary font-medium">Exporter toutes les données</h4>
              <p className="text-dark-text-tertiary text-sm">Télécharger un fichier CSV avec tous vos prospects</p>
            </div>
            <button
              onClick={exportData}
              disabled={isLoading}
              className="px-4 py-2 bg-olo-primary hover:bg-olo-primary-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200 disabled:opacity-50"
            >
              {isLoading ? 'Export...' : 'Exporter'}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-red-950/20 rounded-lg border border-red-800">
            <div>
              <h4 className="text-red-400 font-medium">Réinitialiser toutes les données</h4>
              <p className="text-red-300/70 text-sm">⚠️ Attention: Cette action est irréversible</p>
            </div>
            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-dark-text-primary rounded-lg font-medium transition-colors duration-200">
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Version et informations */}
      <div className="bg-gradient-to-br from-olo-primary/10 to-olo-accent/10 rounded-2xl p-6 border border-olo-primary/20">
        <h3 className="text-lg font-semibold text-dark-text-primary mb-3">ProspectBoard Personal Edition</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-dark-text-tertiary">Version:</span>
            <span className="text-olo-primary font-semibold ml-2">2.0.0</span>
          </div>
          <div>
            <span className="text-dark-text-tertiary">Dernière mise à jour:</span>
            <span className="text-dark-text-secondary ml-2">Aujourd'hui</span>
          </div>
          <div>
            <span className="text-dark-text-tertiary">Thème:</span>
            <span className="text-olo-accent font-semibold ml-2">OLO Dark</span>
          </div>
          <div>
            <span className="text-dark-text-tertiary">Mode:</span>
            <span className="text-olo-secondary font-semibold ml-2">Personnel</span>
          </div>
        </div>
      </div>
    </div>
  );
}
