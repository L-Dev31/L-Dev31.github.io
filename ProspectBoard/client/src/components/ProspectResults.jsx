import React, { useState, useEffect } from 'react';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon,
  StarIcon,
  GlobeAltIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  TrashIcon,
  PlusIcon,
  TagIcon,
  CheckIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

export default function ProspectResults({ refreshTrigger = 0 }) {
  const [prospects, setProspects] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedProspects, setSelectedProspects] = useState(new Set());
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const resultsPerPage = 10;

  useEffect(() => {
    loadProspects();
    loadPlaylists();
  }, [currentPage, refreshTrigger]);

  const loadProspects = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/prospects?page=${currentPage}&limit=${resultsPerPage}`);
      if (response.ok) {
        const data = await response.json();
        setProspects(data.prospects || []);
        setTotalPages(data.pagination?.total_pages || 1);
        setTotalCount(data.pagination?.total_count || 0);
      }
    } catch (error) {
      console.error('Error loading prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlaylists = async () => {
    try {
      const response = await fetch('/api/playlists');
      if (response.ok) {
        const data = await response.json();
        setPlaylists(data);
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
  };

  const deleteProspect = async (prospectId, prospectName) => {
    setShowDeleteConfirm({ id: prospectId, name: prospectName });
  };

  const confirmDelete = async () => {
    const { id: prospectId, name: prospectName } = showDeleteConfirm;
    setShowDeleteConfirm(null);

    try {
      console.log('Deleting prospect:', prospectId);
      const response = await fetch(`/api/prospects/${prospectId}`, {
        method: 'DELETE'
      });

      console.log('Delete response:', response.status);
      
      if (response.ok) {
        console.log('Prospect deleted successfully, refreshing list...');
        // Remove from selected if it was selected
        const newSelected = new Set(selectedProspects);
        newSelected.delete(prospectId);
        setSelectedProspects(newSelected);
        
        await loadProspects(); // Refresh the list
      } else {
        const errorData = await response.json();
        console.error('Delete error:', errorData);
        alert(`Erreur lors de la suppression: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error deleting prospect:', error);
      alert('Erreur lors de la suppression: ' + error.message);
    }
  };

  const toggleProspectSelection = (prospectId) => {
    const newSelected = new Set(selectedProspects);
    if (newSelected.has(prospectId)) {
      newSelected.delete(prospectId);
    } else {
      newSelected.add(prospectId);
    }
    setSelectedProspects(newSelected);
  };

  const selectAllProspects = () => {
    const allIds = new Set(prospects.map(p => p.id));
    setSelectedProspects(allIds);
  };

  const clearSelection = () => {
    setSelectedProspects(new Set());
    setShowPlaylistSelector(false);
  };

  const hideSelectedProspects = async () => {
    if (selectedProspects.size === 0) return;

    if (!confirm(`Êtes-vous sûr de vouloir cacher ${selectedProspects.size} prospect${selectedProspects.size > 1 ? 's' : ''} ?`)) {
      return;
    }

    try {
      const promises = Array.from(selectedProspects).map(prospectId =>
        fetch(`/api/prospects/${prospectId}/hide`, { method: 'PATCH' })
      );
      
      await Promise.all(promises);
      
      setSelectedProspects(new Set());
      loadProspects(); // Refresh the list
      alert(`${selectedProspects.size} prospect${selectedProspects.size > 1 ? 's' : ''} caché${selectedProspects.size > 1 ? 's' : ''} avec succès !`);
    } catch (error) {
      console.error('Error hiding prospects:', error);
      alert('Erreur lors du masquage des prospects');
    }
  };

  const deleteSelectedProspects = async () => {
    if (selectedProspects.size === 0) return;

    if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement ${selectedProspects.size} prospect${selectedProspects.size > 1 ? 's' : ''} ? Cette action est irréversible.`)) {
      return;
    }

    try {
      const promises = Array.from(selectedProspects).map(prospectId =>
        fetch(`/api/prospects/${prospectId}`, { method: 'DELETE' })
      );
      
      await Promise.all(promises);
      
      setSelectedProspects(new Set());
      loadProspects(); // Refresh the list
    } catch (error) {
      console.error('Error deleting prospects:', error);
      alert('Erreur lors de la suppression des prospects');
    }
  };

  const addSelectedToPlaylist = async (playlistId) => {
    if (selectedProspects.size === 0) return;

    try {
      const response = await fetch(`/api/playlists/${playlistId}/prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prospect_ids: Array.from(selectedProspects) 
        })
      });

      if (response.ok) {
        setSelectedProspects(new Set());
        setShowPlaylistSelector(false);
        loadProspects(); // Refresh to show updated prospects
        alert('Prospects ajoutés à la playlist avec succès !');
      } else {
        const error = await response.json();
        alert(`Erreur: ${error.error}`);
      }
    } catch (error) {
      console.error('Error adding to playlist:', error);
      alert('Erreur lors de l\'ajout à la playlist');
    }
  };

  const renderStars = (rating) => {
    if (!rating) return <span className="text-dark-text-tertiary text-sm">Pas de note</span>;
    
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <StarIconSolid key={i} className="h-4 w-4 text-yellow-400" />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <div key={i} className="relative">
            <StarIcon className="h-4 w-4 text-gray-300" />
            <StarIconSolid className="h-4 w-4 text-yellow-400 absolute top-0 left-0" style={{ clipPath: 'inset(0 50% 0 0)' }} />
          </div>
        );
      } else {
        stars.push(
          <StarIcon key={i} className="h-4 w-4 text-gray-300" />
        );
      }
    }

    return (
      <div className="flex items-center space-x-1">
        <div className="flex">{stars}</div>
        <span className="text-sm text-dark-text-secondary">({rating})</span>
      </div>
    );
  };

  const generatePlaceholderImage = (name) => {
    const colors = [
      'from-purple-500 to-pink-500',
      'from-blue-500 to-teal-500', 
      'from-green-500 to-blue-500',
      'from-yellow-500 to-red-500',
      'from-indigo-500 to-purple-500',
      'from-pink-500 to-rose-500'
    ];
    
    const initials = name?.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2) || '?';
    const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
    
    return (
      <div className={`w-16 h-16 bg-gradient-to-br ${colors[colorIndex]} rounded-lg flex items-center justify-center text-white font-bold text-lg`}>
        {initials}
      </div>
    );
  };

  if (totalCount === 0 && !loading) {
    return (
      <div className="bg-dark-bg-secondary rounded-2xl p-8 border border-blue-500/50 text-center">
        <div className="text-dark-text-secondary mb-2">Aucun résultat trouvé</div>
        <p className="text-dark-text-tertiary text-sm">
          Les résultats de scraping apparaîtront ici après un scraping réussi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Barre sticky de sélection */}
      {selectedProspects.size > 0 && (
        <div className="sticky top-4 z-10 bg-dark-bg-secondary border border-blue-500 rounded-xl p-4 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-4">
              <span className="text-blue-500 font-semibold">
                {selectedProspects.size} prospect{selectedProspects.size > 1 ? 's' : ''} sélectionné{selectedProspects.size > 1 ? 's' : ''}
              </span>
              <div className="flex items-center space-x-2">
                {selectedProspects.size < prospects.length && (
                  <button
                    onClick={selectAllProspects}
                    className="px-3 py-1 text-sm bg-dark-bg-secondary hover:bg-dark-bg-tertiary border border-dark-border rounded-lg text-dark-text-secondary hover:text-dark-text-primary transition-colors duration-200"
                  >
                    Sélectionner tout
                  </button>
                )}
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 text-sm bg-dark-bg-secondary hover:bg-dark-bg-tertiary border border-dark-border rounded-lg text-dark-text-secondary hover:text-dark-text-primary transition-colors duration-200"
                >
                  Annuler
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowPlaylistSelector(!showPlaylistSelector)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-dark-text-primary rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Ajouter à une playlist</span>
              </button>
              
              <button
                onClick={hideSelectedProspects}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-dark-text-primary rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
              >
                <EyeSlashIcon className="h-4 w-4" />
                <span>Cacher</span>
              </button>
              
              <button
                onClick={deleteSelectedProspects}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header avec informations */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-dark-text-primary">Résultats de Scraping</h2>
          <p className="text-dark-text-secondary">
            {totalCount} prospects trouvés • Page {currentPage} sur {totalPages}
          </p>
        </div>
      </div>

      {/* Sélecteur de playlist */}
      {showPlaylistSelector && (
        <div className="bg-dark-bg-secondary rounded-xl p-4 border border-blue-500/50">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-3">Choisir une playlist</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {playlists.map(playlist => (
              <button
                key={playlist.id}
                onClick={() => addSelectedToPlaylist(playlist.id)}
                className="p-3 bg-dark-bg-primary hover:bg-dark-bg-tertiary border border-dark-border rounded-lg text-left transition-colors duration-200"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-dark-text-primary font-medium">{playlist.name}</span>
                </div>
                <p className="text-sm text-dark-text-secondary mt-1">
                  {playlist.prospect_count || 0} prospects
                </p>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowPlaylistSelector(false)}
            className="mt-3 text-sm text-dark-text-tertiary hover:text-dark-text-secondary"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Liste des prospects */}
      {!loading && prospects.length > 0 && (
        <div className="space-y-4">
          {prospects.map((prospect) => (
            <div
              key={prospect.id}
              className="bg-dark-bg-secondary rounded-xl p-6 border border-dark-border hover:border-blue-500/50 transition-all duration-200"
            >
              <div className="flex items-start space-x-4">
                {/* Checkbox de sélection */}
                <div className="pt-2">
                  <input
                    type="checkbox"
                    checked={selectedProspects.has(prospect.id)}
                    onChange={() => toggleProspectSelection(prospect.id)}
                    className="w-4 h-4 text-blue-500 bg-dark-bg-secondary border-dark-border rounded focus:ring-blue-500 focus:ring-2 accent-blue-500"
                  />
                </div>

                {/* Image/Logo */}
                <div className="flex-shrink-0">
                  {prospect.image_url ? (
                    <img
                      src={prospect.image_url}
                      alt={prospect.name}
                      className="w-16 h-16 rounded-lg object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div style={{ display: prospect.image_url ? 'none' : 'flex' }}>
                    {generatePlaceholderImage(prospect.name)}
                  </div>
                </div>

                {/* Informations principales */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Nom et catégorie */}
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-semibold text-dark-text-primary truncate">
                          {prospect.name || 'Nom non disponible'}
                        </h3>
                        {prospect.category && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-500 border border-blue-500/30">
                            <TagIcon className="h-3 w-3 mr-1" />
                            {prospect.category}
                          </span>
                        )}
                      </div>

                      {/* Étoiles */}
                      <div className="mb-3">
                        {renderStars(prospect.rating)}
                      </div>

                      {/* Informations de contact */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {prospect.address && (
                          <div className="flex items-center space-x-2 text-dark-text-secondary">
                            <MapPinIcon className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{prospect.address}</span>
                          </div>
                        )}

                        {prospect.phone && (
                          <div className="flex items-center space-x-2 text-dark-text-secondary">
                            <PhoneIcon className="h-4 w-4 flex-shrink-0" />
                            <a href={`tel:${prospect.phone}`} className="hover:text-blue-500">
                              {prospect.phone}
                            </a>
                          </div>
                        )}

                        {prospect.email && (
                          <div className="flex items-center space-x-2 text-dark-text-secondary">
                            <EnvelopeIcon className="h-4 w-4 flex-shrink-0" />
                            <a href={`mailto:${prospect.email}`} className="hover:text-blue-500 truncate">
                              {prospect.email}
                            </a>
                          </div>
                        )}

                        <div className="flex items-center space-x-2 text-dark-text-secondary">
                          <GlobeAltIcon className="h-4 w-4 flex-shrink-0" />
                          {prospect.has_website ? (
                            <a
                              href={prospect.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600"
                            >
                              Site web disponible
                            </a>
                          ) : (
                            <span className="text-dark-text-tertiary">Pas de site web</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 ml-4">
                      {prospect.google_maps_url && (
                        <a
                          href={prospect.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-dark-text-secondary hover:text-blue-500 transition-colors duration-200"
                          title="Voir sur Google Maps"
                        >
                          <MapPinIcon className="h-5 w-5" />
                        </a>
                      )}
                      
                      <button
                        onClick={() => deleteProspect(prospect.id, prospect.name)}
                        className="p-2 text-dark-text-secondary hover:text-red-400 transition-colors duration-200"
                        title="Supprimer"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
          <div className="text-sm text-dark-text-secondary">
            Affichage de {((currentPage - 1) * resultsPerPage) + 1} à {Math.min(currentPage * resultsPerPage, totalCount)} sur {totalCount} résultats
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                currentPage === 1
                  ? 'text-dark-text-tertiary cursor-not-allowed'
                  : 'text-dark-text-secondary hover:text-blue-500 hover:bg-dark-bg-primary'
              }`}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-1">
              {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                const pageNum = currentPage <= 3 ? idx + 1 : currentPage - 2 + idx;
                if (pageNum > totalPages) return null;
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      currentPage === pageNum
                        ? 'bg-blue-500 text-dark-text-primary'
                        : 'text-dark-text-secondary hover:text-blue-500 hover:bg-dark-bg-primary'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                currentPage === totalPages
                  ? 'text-dark-text-tertiary cursor-not-allowed'
                  : 'text-dark-text-secondary hover:text-blue-500 hover:bg-dark-bg-primary'
              }`}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Popup de confirmation de suppression */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-dark-bg-secondary border border-gray-600 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <TrashIcon className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-dark-text-primary mb-2">
                Confirmer la suppression
              </h3>
              <p className="text-sm text-dark-text-secondary mb-6">
                Êtes-vous sûr de vouloir supprimer{' '}
                <span className="font-semibold text-dark-text-primary">
                  {showDeleteConfirm.name}
                </span>{' '}
                ? Cette action est irréversible.
              </p>
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 bg-dark-bg-secondary hover:bg-dark-bg-tertiary border border-dark-border rounded-lg text-dark-text-secondary hover:text-dark-text-primary transition-colors duration-200"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
                >
                  <TrashIcon className="h-4 w-4" />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
