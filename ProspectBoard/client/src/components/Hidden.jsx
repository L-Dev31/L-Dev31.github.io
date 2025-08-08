import { useState, useEffect } from 'react';
import { EyeSlashIcon, EyeIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function Hidden({ onHiddenChanged }) {
  const [hiddenProspects, setHiddenProspects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHiddenProspects();
  }, []);

  const loadHiddenProspects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/prospects?hidden=true');
      if (response.ok) {
        const data = await response.json();
        setHiddenProspects(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des prospects cachés:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const unhideProspect = async (prospectId) => {
    try {
      const response = await fetch(`/api/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: false })
      });

      if (response.ok) {
        loadHiddenProspects();
        onHiddenChanged?.();
      }
    } catch (error) {
      console.error('Erreur lors de la restauration du prospect:', error);
    }
  };

  const deleteProspect = async (prospectId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement ce prospect ?')) return;

    try {
      const response = await fetch(`/api/prospects/${prospectId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadHiddenProspects();
        onHiddenChanged?.();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du prospect:', error);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-dark-text-primary">Prospects Cachés</h1>
        <p className="text-dark-text-secondary mt-1">
          Gérez vos prospects mis de côté
        </p>
      </div>

      {/* Liste des prospects cachés */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-dark-hover rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-5 bg-dark-hover rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-dark-hover rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : hiddenProspects.length > 0 ? (
        <div className="space-y-4">
          {hiddenProspects.map((prospect) => (
            <div key={prospect.id} className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border hover:border-gray-500/50 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gray-600/20 rounded-full flex items-center justify-center">
                    <EyeSlashIcon className="h-6 w-6 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-dark-text-primary">
                      {prospect.business_name || 'Prospect sans nom'}
                    </h3>
                    <p className="text-dark-text-secondary">{prospect.address}</p>
                    {prospect.phone && (
                      <p className="text-dark-text-tertiary text-sm">{prospect.phone}</p>
                    )}
                    <p className="text-gray-500 text-sm mt-2">
                      Caché le {new Date(prospect.hidden_at || prospect.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  {prospect.rating && (
                    <div className="text-olo-accent">
                      ⭐ {prospect.rating}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => unhideProspect(prospect.id)}
                    className="p-2 text-dark-text-tertiary hover:text-olo-primary transition-colors rounded-lg hover:bg-dark-hover"
                    title="Restaurer ce prospect"
                  >
                    <EyeIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => deleteProspect(prospect.id)}
                    className="p-2 text-dark-text-tertiary hover:text-red-400 transition-colors rounded-lg hover:bg-dark-hover"
                    title="Supprimer définitivement"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <EyeSlashIcon className="h-16 w-16 text-dark-text-tertiary mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-dark-text-primary mb-2">Aucun prospect caché</h3>
          <p className="text-dark-text-secondary">
            Les prospects que vous masquerez apparaîtront ici
          </p>
        </div>
      )}

      {/* Actions en lot */}
      {hiddenProspects.length > 0 && (
        <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-4">Actions en lot</h3>
          <div className="flex space-x-4">
            <button className="px-4 py-2 bg-olo-primary hover:bg-olo-primary-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200">
              Restaurer Tout
            </button>
            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-dark-text-primary rounded-lg font-medium transition-colors duration-200">
              Supprimer Tout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
