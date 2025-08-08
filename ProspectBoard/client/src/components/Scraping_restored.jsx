import React, { useState } from 'react';

export default function Scraping({ onProspectsAdded }) {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [isScrapingActive, setIsScrapingActive] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState(0);

  const startScraping = async () => {
    if (!keyword.trim() || !city.trim()) {
      alert('Please enter both keyword and city');
      return;
    }

    setIsScrapingActive(true);
    setScrapingProgress(0);

    try {
      const response = await fetch('/api/scraping/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          city: city.trim(),
          maxResults: 50
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start scraping');
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
        if (!response.ok) throw new Error('Failed to check status');
        
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
          setScrapingProgress(prev => Math.min(prev + 10, 90)); // Simulate progress
          setTimeout(checkStatus, 3000); // Check every 3 seconds
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
          <h1 className="text-3xl font-bold mb-2">🔍 Web Scraping</h1>
          <p className="text-gray-400">
            Extract business prospects from Google Maps searches
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-cyan-500/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search Keyword
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                placeholder="e.g., restaurant, dentist, plumber"
                disabled={isScrapingActive}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                City/Location
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                placeholder="e.g., Paris, New York, London"
                disabled={isScrapingActive}
              />
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-4">
              <button
                onClick={startScraping}
                disabled={isScrapingActive || !keyword.trim() || !city.trim()}
                className={`px-6 py-3 rounded-lg font-medium ${
                  isScrapingActive || !keyword.trim() || !city.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-cyan-600 text-white hover:bg-cyan-700'
                } transition-colors`}
              >
                {isScrapingActive ? '🔄 Scraping...' : '🚀 Start Scraping'}
              </button>

              {isScrapingActive && (
                <button
                  onClick={stopScraping}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  ⏹️ Stop
                </button>
              )}
            </div>

            {isScrapingActive && (
              <div className="text-sm text-cyan-400">
                Progress: {scrapingProgress}%
              </div>
            )}
          </div>

          {isScrapingActive && (
            <div className="mb-4">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${scrapingProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="text-sm text-gray-400">
            <p>💡 <strong>Tips:</strong></p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Use specific keywords like "restaurant italien" or "coiffeur homme"</li>
              <li>Specify cities clearly: "Paris", "Lyon", "Marseille"</li>
              <li>Scraping will run in background and notify when complete</li>
            </ul>
          </div>
        </div>

        {isScrapingActive && (
          <div className="mt-6 bg-gray-900 rounded-lg p-4 border border-cyan-500/20">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500"></div>
              <span className="text-cyan-400">Scraping in progress...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
