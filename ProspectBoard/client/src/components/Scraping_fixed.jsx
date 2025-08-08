import { useState } from 'react';
import { MagnifyingGlassIcon, MapPinIcon, ClockIcon } from '@heroicons/react/24/outline';

export default function Scraping({ onProspectsAdded }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');
  const [isScrapingActive, setIsScrapingActive] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState(0);
  const [scrapedProspects, setScrapedProspects] = useState([]);

  const startScraping = async () => {
    if (!searchQuery.trim() || !location.trim()) {
      alert('Please fill in all fields');
      return;
    }

    setIsScrapingActive(true);
    setScrapingProgress(0);
    setScrapedProspects([]);

    try {
      const response = await fetch('/api/scraping/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: searchQuery,
          city: location,
          maxResults: 50
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Scraping failed');
      }

      const result = await response.json();
      console.log('Scraping started:', result);
      
      // Start polling for session status
      const sessionId = result.sessionId;
      pollScrapingStatus(sessionId);
      
    } catch (error) {
      console.error('Scraping error:', error);
      alert('Scraping error: ' + error.message);
      setIsScrapingActive(false);
    }
  };

  const pollScrapingStatus = async (sessionId) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/scraping/sessions/${sessionId}`);
        const session = await response.json();
        
        if (session.status === 'completed') {
          setIsScrapingActive(false);
          setScrapingProgress(100);
          alert(`Scraping completed! Found ${session.prospects_found || 0} prospects.`);
          onProspectsAdded?.();
          return;
        } else if (session.status === 'error') {
          setIsScrapingActive(false);
          alert('Scraping failed: ' + (session.error_message || 'Unknown error'));
          return;
        }
        
        // Continue polling if still running
        if (session.status === 'running') {
          setScrapingProgress(25); // Show some progress
          setTimeout(checkStatus, 2000); // Check every 2 seconds
        }
      } catch (error) {
        console.error('Error checking scraping status:', error);
        setIsScrapingActive(false);
      }
    };
    
    checkStatus();
  };

  const stopScraping = () => {
    setIsScrapingActive(false);
    setScrapingProgress(0);
  };

  return (
    <div className="p-6 bg-black text-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-cyan-400">Web Scraping</h1>
          <p className="text-gray-400">Extract business prospects from Google Maps</p>
        </div>

        {/* Scraping Form */}
        <div className="bg-gray-900 rounded-lg p-6 mb-6 border border-gray-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search Query
              </label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  placeholder="e.g., restaurant, dentist, plumber"
                  disabled={isScrapingActive}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Location
              </label>
              <div className="relative">
                <MapPinIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  placeholder="e.g., Paris, New York, London"
                  disabled={isScrapingActive}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex gap-4">
              <button
                onClick={startScraping}
                disabled={isScrapingActive || !searchQuery.trim() || !location.trim()}
                className={`px-6 py-3 rounded-lg font-medium ${
                  isScrapingActive || !searchQuery.trim() || !location.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-cyan-600 text-white hover:bg-cyan-700'
                } transition-colors`}
              >
                {isScrapingActive ? 'Scraping...' : 'Start Scraping'}
              </button>

              {isScrapingActive && (
                <button
                  onClick={stopScraping}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  Stop Scraping
                </button>
              )}
            </div>

            {isScrapingActive && (
              <div className="flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-cyan-400" />
                <span className="text-sm text-gray-300">
                  Progress: {scrapingProgress}%
                </span>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {isScrapingActive && (
            <div className="mt-4">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${scrapingProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {scrapedProspects.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400">
              Scraped Prospects ({scrapedProspects.length})
            </h2>
            <div className="space-y-4">
              {scrapedProspects.map((prospect, index) => (
                <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-white">{prospect.name}</h3>
                      <p className="text-sm text-gray-400">{prospect.category}</p>
                      <p className="text-sm text-gray-400">{prospect.address}</p>
                    </div>
                    <div className="text-right">
                      {prospect.rating && (
                        <div className="text-yellow-400">
                          ⭐ {prospect.rating}
                        </div>
                      )}
                      {prospect.phone && (
                        <div className="text-sm text-gray-300">{prospect.phone}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
