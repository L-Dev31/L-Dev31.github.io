import { useState, useEffect } from 'react';
import { 
  QueueListIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  UsersIcon,
  FolderIcon
} from '@heroicons/react/24/outline';

export default function Playlists({ onPlaylistsChanged }) {
  const [playlists, setPlaylists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/playlists');
      if (response.ok) {
        const data = await response.json();
        setPlaylists(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des playlists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;

    try {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName.trim() })
      });

      if (response.ok) {
        setNewPlaylistName('');
        setShowCreateForm(false);
        loadPlaylists();
        onPlaylistsChanged?.();
      }
    } catch (error) {
      console.error('Erreur lors de la création de la playlist:', error);
    }
  };

  const deletePlaylist = async (playlistId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette playlist ?')) return;

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadPlaylists();
        onPlaylistsChanged?.();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de la playlist:', error);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dark-text-primary">Playlists</h1>
          <p className="text-dark-text-secondary mt-1">
            Organisez vos prospects par catégories ou campagnes
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-olo-primary hover:bg-olo-primary-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Nouvelle Playlist</span>
        </button>
      </div>

      {/* Formulaire de création */}
      {showCreateForm && (
        <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-olo-primary/50">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-4">Créer une nouvelle playlist</h3>
          <div className="flex space-x-3">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Nom de la playlist..."
              className="flex-1 px-4 py-3 bg-dark-bg-secondary border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-tertiary focus:border-olo-primary focus:ring-1 focus:ring-olo-primary transition-colors"
              onKeyPress={(e) => e.key === 'Enter' && createPlaylist()}
            />
            <button
              onClick={createPlaylist}
              className="px-6 py-3 bg-olo-primary hover:bg-olo-primary-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200"
            >
              Créer
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewPlaylistName('');
              }}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-dark-text-primary rounded-lg font-medium transition-colors duration-200"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste des playlists */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
                <div className="h-6 bg-dark-hover rounded w-3/4 mb-4"></div>
                <div className="h-4 bg-dark-hover rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-dark-hover rounded w-1/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : playlists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border hover:border-olo-primary/50 transition-all duration-300 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-olo-accent/20 rounded-lg">
                    <FolderIcon className="h-6 w-6 text-olo-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-dark-text-primary group-hover:text-olo-primary transition-colors">
                      {playlist.name}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button className="p-2 text-dark-text-tertiary hover:text-olo-primary transition-colors rounded-lg hover:bg-dark-hover">
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => deletePlaylist(playlist.id)}
                    className="p-2 text-dark-text-tertiary hover:text-red-400 transition-colors rounded-lg hover:bg-dark-hover"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-dark-text-tertiary">Prospects:</span>
                  <span className="text-olo-primary font-semibold flex items-center">
                    <UsersIcon className="h-4 w-4 mr-1" />
                    {playlist.prospect_count || 0}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-dark-text-tertiary">Créée le:</span>
                  <span className="text-dark-text-secondary">
                    {new Date(playlist.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                {playlist.description && (
                  <p className="text-dark-text-tertiary text-sm mt-3">
                    {playlist.description}
                  </p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-dark-border">
                <button className="w-full py-2 text-olo-primary hover:bg-olo-primary hover:text-dark-text-primary rounded-lg font-medium transition-all duration-200 text-sm">
                  Gérer les Prospects
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <QueueListIcon className="h-16 w-16 text-dark-text-tertiary mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-dark-text-primary mb-2">Aucune playlist</h3>
          <p className="text-dark-text-secondary mb-6">
            Créez votre première playlist pour organiser vos prospects
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-3 bg-olo-primary hover:bg-olo-primary-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200"
          >
            Créer ma première playlist
          </button>
        </div>
      )}
    </div>
  );
}
