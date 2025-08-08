import React, { useState, useRef } from 'react';
import { MagnifyingGlassIcon, MapPinIcon, PlayIcon, StopIcon, Cog6ToothIcon, HashtagIcon } from '@heroicons/react/24/outline';
import ProspectResults from './ProspectResults';

export default function Scraping({ onProspectsAdded }) {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [maxResults, setMaxResults] = useState(20);
  const [radius, setRadius] = useState(10);
  const [isScrapingActive, setIsScrapingActive] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const eventSourceRef = useRef(null);

  const startScraping = async () => {
    if (!keyword.trim() || !city.trim()) {
      alert('Please enter both keyword and city');
      return;
    }

    setIsScrapingActive(true);
    setScrapingProgress(0);
    setCurrentStep('Starting...');

    try {
      const response = await fetch('/api/scraping/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          city: city.trim(),
          maxResults: maxResults,
          radius: radius
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start scraping');
      }

      const result = await response.json();
      console.log('Scraping started:', result);
      
      // Start real-time progress monitoring
      const sessionId = result.sessionId;
      startProgressMonitoring(sessionId);
      
    } catch (error) {
      console.error('Scraping error:', error);
      alert('Scraping error: ' + error.message);
      setIsScrapingActive(false);
      setScrapingProgress(0);
      setCurrentStep('');
    }
  };

  const startProgressMonitoring = (sessionId) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Create new EventSource for real-time updates
    const eventSource = new EventSource(`/api/scraping/sessions/${sessionId}/progress`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const sessionData = JSON.parse(event.data);
        
        if (sessionData.error) {
          console.error('Session error:', sessionData.error);
          setCurrentStep('Error occurred');
          setIsScrapingActive(false);
          return;
        }

        setScrapingProgress(sessionData.progress_percentage || 0);
        setCurrentStep(sessionData.current_step || 'In progress...');

        // Handle completion
        if (sessionData.status === 'completed') {
          setScrapingProgress(100);
          setCurrentStep(`Completed! Found ${sessionData.new_prospects} new prospects`);
          setIsScrapingActive(false);
          setRefreshTrigger(prev => prev + 1); // Trigger refresh of results
          if (onProspectsAdded) {
            onProspectsAdded();
          }
          eventSource.close();
        } else if (sessionData.status === 'failed') {
          setCurrentStep(`Failed: ${sessionData.error_message || 'Unknown error'}`);
          setIsScrapingActive(false);
          eventSource.close();
        }
      } catch (err) {
        console.error('Error parsing progress data:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      setCurrentStep('Connection error');
      setIsScrapingActive(false);
      eventSource.close();
    };
  };

  const stopScraping = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsScrapingActive(false);
    setScrapingProgress(0);
    setCurrentStep('Stopped');
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dark-text-primary">Web Scraping</h1>
          <p className="text-dark-text-secondary mt-1">
            Extract business prospects from Google Maps searches
          </p>
        </div>
      </div>

      {/* Formulaire de scraping */}
      <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-olo-primary/50">
        <h3 className="text-lg font-semibold text-dark-text-primary mb-4">Configure Scraping Parameters</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              <MagnifyingGlassIcon className="h-4 w-4 inline mr-1" />
              Search Keyword
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full px-4 py-3 bg-dark-bg-primary border border-dark-border rounded-xl text-dark-text-primary placeholder-dark-text-tertiary focus:outline-none focus:border-olo-primary transition-colors duration-200"
              placeholder="e.g., restaurant, dentist, plumber"
              disabled={isScrapingActive}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              <MapPinIcon className="h-4 w-4 inline mr-1" />
              City/Location
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-4 py-3 bg-dark-bg-primary border border-dark-border rounded-xl text-dark-text-primary placeholder-dark-text-tertiary focus:outline-none focus:border-olo-primary transition-colors duration-200"
              placeholder="e.g., Paris, New York, London"
              disabled={isScrapingActive}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              <HashtagIcon className="h-4 w-4 inline mr-1" />
              Max Results
            </label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(Math.max(1, Math.min(100, parseInt(e.target.value) || 20)))}
              className="w-full px-4 py-3 bg-dark-bg-primary border border-dark-border rounded-xl text-dark-text-primary placeholder-dark-text-tertiary focus:outline-none focus:border-olo-primary transition-colors duration-200"
              placeholder="20"
              min="1"
              max="100"
              disabled={isScrapingActive}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text-secondary mb-2">
              <Cog6ToothIcon className="h-4 w-4 inline mr-1" />
              Radius (km)
            </label>
            <input
              type="number"
              value={radius}
              onChange={(e) => setRadius(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
              className="w-full px-4 py-3 bg-dark-bg-primary border border-dark-border rounded-xl text-dark-text-primary placeholder-dark-text-tertiary focus:outline-none focus:border-olo-primary transition-colors duration-200"
              placeholder="10"
              min="1"
              max="50"
              disabled={isScrapingActive}
            />
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-3">
            <button
              onClick={startScraping}
              disabled={isScrapingActive || !keyword.trim() || !city.trim()}
              className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2 ${
                isScrapingActive || !keyword.trim() || !city.trim()
                  ? 'bg-dark-bg-tertiary text-dark-text-tertiary cursor-not-allowed'
                  : 'bg-olo-primary hover:bg-olo-primary-600 text-dark-text-primary'
              }`}
            >
              <PlayIcon className="h-4 w-4" />
              <span>{isScrapingActive ? 'Scraping...' : 'Start Scraping'}</span>
            </button>

            {isScrapingActive && (
              <button
                onClick={stopScraping}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
              >
                <StopIcon className="h-4 w-4" />
                <span>Stop</span>
              </button>
            )}
          </div>

          {isScrapingActive && (
            <div className="text-sm text-olo-primary font-medium">
              Progress: {scrapingProgress}%
            </div>
          )}
        </div>

        {isScrapingActive && (
          <div className="mb-4">
            <div className="w-full bg-dark-bg-tertiary rounded-full h-2">
              <div
                className="bg-gradient-to-r from-olo-primary to-cyan-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${scrapingProgress}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-dark-text-secondary">
              {currentStep}
            </div>
          </div>
        )}
      </div>

      {/* Résultats de scraping */}
      <ProspectResults refreshTrigger={refreshTrigger} />
    </div>
  );
}
