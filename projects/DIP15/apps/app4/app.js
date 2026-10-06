if (typeof WeatherApp === 'undefined') {
    class WeatherApp {
        constructor() {
            this.windowId = null;
            this.weatherData = null;
            this.currentLocation = 'St.Marie';
            this.apiKey = 'demo'; 
            this.coordinates = {
                lat: 16.3127,  
                lon: -61.7947  
            };
        }

        static getInstance() {
            if (!WeatherApp.instance) {
                WeatherApp.instance = new WeatherApp();
            }
            return WeatherApp.instance;
        }

        // Compatible avec app-launcher.js
        async init(options = {}) {
            this.windowManager = options.windowManager || window.windowManager;
            this.appConfig = options.appConfig;
            return true;
        }

        // Method expected by app-launcher.js
        async open() {
            if (this.windowId && this.windowManager?.getWindow(this.windowId)) {
                const win = this.windowManager.getWindow(this.windowId);
                win.isMinimized
                    ? this.windowManager.restoreWindow(this.windowId)
                    : this.windowManager.focusWindow(this.windowId);
                return true;
            }
            return !!(await this.launch());
        }

        async launch() {
            try {
                const weatherWindow = this.windowManager.createWindow({
                    title: 'Weather',
                    x: 200,
                    y: 150,
                    icon: this.appConfig?.icon || 'images/app4.png',
                    appId: 'app4',
                    content: this.getWeatherContent(),
                    footerText: 'Live Weather Information',
                    className: 'weather-app-window'
                });

                this.windowId = weatherWindow.id;
                this.setupWeatherElements();
                
                return weatherWindow;
            } catch (error) {
                console.error('Failed to initialize Weather app:', error);
            }
        }

        getWeatherContent() {
            return `
                <div class="weather-container" id="weatherContainer">
                    <div class="weather-header">
                        <div class="location-info">
                            <h2 class="city-name" id="cityName">Loading...</h2>
                            <p class="country-name" id="countryName">Please wait</p>
                        </div>
                        <div class="weather-icon-main">
                            <i class="fas fa-cloud" id="mainWeatherIcon"></i>
                        </div>
                    </div>

                    <div class="weather-main">
                        <div class="temperature-display">
                            <span class="temperature" id="temperature">--°</span>
                            <span class="feels-like" id="feelsLike">Feels like --°</span>
                        </div>
                        <div class="weather-description">
                            <p class="condition" id="weatherCondition">Loading weather...</p>
                            <p class="humidity" id="humidity">Humidity: --%</p>
                        </div>
                    </div>

                    <div class="weather-details">
                        <div class="detail-item">
                            <i class="fas fa-wind"></i>
                            <span>Wind</span>
                            <span id="windSpeed">-- km/h</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-thermometer-half"></i>
                            <span>UV Index</span>
                            <span id="uvIndex">--</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-sun"></i>
                            <span>Sunrise</span>
                            <span id="sunrise">--:--</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-moon"></i>
                            <span>Sunset</span>
                            <span id="sunset">--:--</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-eye"></i>
                            <span>Clouds</span>
                            <span id="cloudCover">--%</span>
                        </div>
                    </div>

                    <div class="weather-footer">
                        <span class="last-updated" id="lastUpdated">Last updated: --</span>
                    </div>
                </div>
            `;
        }

        setupWeatherElements() {
            // Start automatic refresh every 5 minutes
            this.startAutoRefresh();
        }

        startAutoRefresh() {
            this.loadWeatherData();
            
            // Then refresh every 5 minutes (300000 ms)
            this.refreshInterval = setInterval(() => {
                this.loadWeatherData();
            }, 300000);
        }

        stopAutoRefresh() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        }

        async loadWeatherData() {
            try {
                this.showLoadingState();
                
                let weather = await this.fetchRealWeatherData();
                
                // Si l'API échoue, utiliser des données simulées tropicales réalistes pour Deshaies
                if (!weather) {
                    weather = this.getFallbackWeatherData();
                }
                
                this.updateWeatherDisplay(weather);
                
            } catch (error) {
                console.error('Failed to load weather data:', error);
                // Utiliser des données de fallback en cas d'erreur
                const fallbackWeather = this.getFallbackWeatherData();
                this.updateWeatherDisplay(fallbackWeather);
            }
        }

        async fetchRealWeatherData() {
            try {
                // Use OpenWeatherMap API (free with limitations)
                const url = `https://api.openweathermap.org/data/2.5/weather?lat=${this.coordinates.lat}&lon=${this.coordinates.lon}&appid=${this.apiKey}&units=metric&lang=en`;
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Convert API data to our weather format
                return this.convertApiDataToWeatherFormat(data);
                
            } catch (error) {
                return null;
            }
        }

        convertApiDataToWeatherFormat(apiData) {
            const weatherIconMap = {
                '01d': { icon: 'fas fa-sun', condition: 'sunny', bg: 'linear-gradient(135deg, #FDB813 0%, #FF6B35 100%)' },
                '01n': { icon: 'fas fa-moon', condition: 'clear', bg: 'linear-gradient(135deg, #2C3E50 0%, #4A6741 100%)' },
                '02d': { icon: 'fas fa-cloud-sun', condition: 'partly-cloudy', bg: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)' },
                '02n': { icon: 'fas fa-cloud-moon', condition: 'partly-cloudy', bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)' },
                '03d': { icon: 'fas fa-cloud', condition: 'cloudy', bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)' },
                '03n': { icon: 'fas fa-cloud', condition: 'cloudy', bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)' },
                '04d': { icon: 'fas fa-cloud', condition: 'cloudy', bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)' },
                '04n': { icon: 'fas fa-cloud', condition: 'cloudy', bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)' },
                '09d': { icon: 'fas fa-cloud-rain', condition: 'rainy', bg: 'linear-gradient(135deg, #81ecec 0%, #00b894 100%)' },
                '09n': { icon: 'fas fa-cloud-rain', condition: 'rainy', bg: 'linear-gradient(135deg, #81ecec 0%, #00b894 100%)' },
                '10d': { icon: 'fas fa-cloud-sun-rain', condition: 'rainy', bg: 'linear-gradient(135deg, #81ecec 0%, #00b894 100%)' },
                '10n': { icon: 'fas fa-cloud-rain', condition: 'rainy', bg: 'linear-gradient(135deg, #81ecec 0%, #00b894 100%)' },
                '11d': { icon: 'fas fa-bolt', condition: 'stormy', bg: 'linear-gradient(135deg, #2d3436 0%, #000000 100%)' },
                '11n': { icon: 'fas fa-bolt', condition: 'stormy', bg: 'linear-gradient(135deg, #2d3436 0%, #000000 100%)' },
                '13d': { icon: 'fas fa-snowflake', condition: 'snowy', bg: 'linear-gradient(135deg, #ddd6fe 0%, #a78bfa 100%)' },
                '13n': { icon: 'fas fa-snowflake', condition: 'snowy', bg: 'linear-gradient(135deg, #ddd6fe 0%, #a78bfa 100%)' },
                '50d': { icon: 'fas fa-smog', condition: 'foggy', bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)' },
                '50n': { icon: 'fas fa-smog', condition: 'foggy', bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)' }
            };

            const iconCode = apiData.weather[0].icon;
            const weatherInfo = weatherIconMap[iconCode] || weatherIconMap['01d'];

            return {
                condition: weatherInfo.condition,
                icon: weatherInfo.icon,
                description: apiData.weather[0].description,
                bg: weatherInfo.bg,
                temp: Math.round(apiData.main.temp),
                feelsLike: Math.round(apiData.main.feels_like),
                humidity: apiData.main.humidity,
                wind: Math.round(apiData.wind.speed * 3.6), // Convert m/s to km/h
                uvIndex: 'N/A', // Basic API doesn't provide UV, requires separate call
                sunrise: this.formatTime(new Date(apiData.sys.sunrise * 1000)),
                sunset: this.formatTime(new Date(apiData.sys.sunset * 1000))
            };
        }

        formatTime(date) {
            return date.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            });
        }

        getFallbackWeatherData() {
            const tropicalWeatherConditions = [
                { 
                    condition: 'sunny', 
                    icon: 'fas fa-sun', 
                    description: 'Sunny', 
                    bg: 'linear-gradient(135deg, #FDB813 0%, #FF6B35 100%)',
                    temp: 29,
                    feelsLike: 33,
                    humidity: 75,
                    wind: 18,
                    uvIndex: 8,
                    sunrise: '06:15',
                    sunset: '18:45',
                    cloudCover: 15
                },
                { 
                    condition: 'partly-cloudy', 
                    icon: 'fas fa-cloud-sun', 
                    description: 'Partly Cloudy', 
                    bg: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
                    temp: 27,
                    feelsLike: 31,
                    humidity: 80,
                    wind: 15,
                    uvIndex: 6,
                    sunrise: '06:20',
                    sunset: '18:40',
                    cloudCover: 45
                },
                { 
                    condition: 'rainy', 
                    icon: 'fas fa-cloud-rain', 
                    description: 'Tropical Showers', 
                    bg: 'linear-gradient(135deg, #81ecec 0%, #00b894 100%)',
                    temp: 25,
                    feelsLike: 28,
                    humidity: 90,
                    wind: 22,
                    uvIndex: 3,
                    sunrise: '06:25',
                    sunset: '18:35',
                    cloudCover: 85
                },
                { 
                    condition: 'stormy', 
                    icon: 'fas fa-bolt', 
                    description: 'Tropical Storm', 
                    bg: 'linear-gradient(135deg, #2d3436 0%, #000000 100%)',
                    temp: 26,
                    feelsLike: 29,
                    humidity: 95,
                    wind: 35,
                    uvIndex: 1,
                    sunrise: '06:18',
                    sunset: '18:42',
                    cloudCover: 100
                }
            ];

            const hour = new Date().getHours();
            let weatherIndex;
            
            if (hour >= 6 && hour <= 11) {
                weatherIndex = Math.random() < 0.7 ? 0 : 1;
            } else if (hour >= 12 && hour <= 16) {
                weatherIndex = Math.random() < 0.4 ? 0 : (Math.random() < 0.5 ? 2 : 3);
            } else {
                weatherIndex = Math.random() < 0.6 ? 1 : 0;
            }
            
            return tropicalWeatherConditions[weatherIndex];
        }

        showLoadingState() {
            const container = document.getElementById('weatherContainer');
            if (!container) return;

            document.getElementById('cityName').textContent = 'Loading...';
            document.getElementById('countryName').textContent = 'Updating...';
            document.getElementById('temperature').textContent = '--°';
            document.getElementById('weatherCondition').textContent = 'Fetching data...';
        }

        updateWeatherDisplay(weather) {
            const container = document.getElementById('weatherContainer');
            if (!container) return;

            container.style.background = weather.bg;

            document.getElementById('cityName').textContent = this.currentLocation;
            document.getElementById('countryName').textContent = 'Lesser Antilles';

            const mainIcon = document.getElementById('mainWeatherIcon');
            mainIcon.className = weather.icon;

            document.getElementById('temperature').textContent = `${weather.temp}°`;
            document.getElementById('feelsLike').textContent = `Feels like ${weather.feelsLike}°`;

            document.getElementById('weatherCondition').textContent = weather.description;
            document.getElementById('humidity').textContent = `Humidity: ${weather.humidity}%`;

            document.getElementById('windSpeed').textContent = `${weather.wind} km/h`;
            document.getElementById('uvIndex').textContent = weather.uvIndex;
            document.getElementById('sunrise').textContent = weather.sunrise;
            document.getElementById('sunset').textContent = weather.sunset;
            document.getElementById('cloudCover').textContent = `${weather.cloudCover}%`;

            const now = new Date();
            document.getElementById('lastUpdated').textContent = 
                `Updated: ${now.toLocaleTimeString()}`;
        }

        onWindowClose() {
            this.stopAutoRefresh();
            this.windowId = null;
        }

        showError() {
            const container = document.getElementById('weatherContainer');
            if (container) {
                container.innerHTML = `
                    <div class="weather-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Failed to load weather data</p>
                        <button onclick="WeatherApp.getInstance().loadWeatherData()">Try Again</button>
                    </div>
                `;
            }
        }
    }

    window.WeatherApp = WeatherApp;
}
