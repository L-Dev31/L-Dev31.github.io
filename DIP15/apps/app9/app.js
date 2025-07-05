// Weather App
if (typeof WeatherApp === 'undefined') {
    class WeatherApp {
        constructor() {
            this.windowId = null;
            this.weatherData = null;
            this.currentLocation = 'Paris';
        }

        static getInstance() {
            if (!WeatherApp.instance) {
                WeatherApp.instance = new WeatherApp();
            }
            return WeatherApp.instance;
        }

        async launch() {
            try {
                console.log('🌤️ Launching Weather app...');
                
                const window = window.windowManager.createWindow({
                    id: `weather-${Date.now()}`,
                    title: 'Weather',
                    x: 200,
                    y: 150,
                    icon: 'images/app9.png',
                    appId: 'app9',
                    content: this.getWeatherContent(),
                    footerText: 'Live Weather Information',
                    className: 'weather-app-window'
                });

                this.windowId = window.id;
                this.setupWeatherElements();
                await this.loadWeatherData();
                
                console.log('✅ Weather app launched successfully');
                return window;
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
                            <i class="fas fa-eye"></i>
                            <span>Visibility</span>
                            <span id="visibility">-- km</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-wind"></i>
                            <span>Wind</span>
                            <span id="windSpeed">-- km/h</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-tachometer-alt"></i>
                            <span>Pressure</span>
                            <span id="pressure">-- hPa</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-thermometer-half"></i>
                            <span>UV Index</span>
                            <span id="uvIndex">--</span>
                        </div>
                    </div>

                    <div class="weather-footer">
                        <button class="refresh-btn" id="refreshBtn">
                            <i class="fas fa-sync-alt"></i>
                            Refresh
                        </button>
                        <span class="last-updated" id="lastUpdated">Last updated: --</span>
                    </div>
                </div>
            `;
        }

        setupWeatherElements() {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.loadWeatherData());
            }
        }

        async loadWeatherData() {
            try {
                // Simulate weather data (in a real app, you'd use a weather API)
                const weatherConditions = [
                    { 
                        condition: 'sunny', 
                        icon: 'fas fa-sun', 
                        description: 'Sunny', 
                        bg: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
                        temp: 24,
                        feelsLike: 27,
                        humidity: 45,
                        visibility: 15,
                        wind: 12,
                        pressure: 1013,
                        uvIndex: 6
                    },
                    { 
                        condition: 'cloudy', 
                        icon: 'fas fa-cloud', 
                        description: 'Cloudy', 
                        bg: 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)',
                        temp: 18,
                        feelsLike: 19,
                        humidity: 65,
                        visibility: 10,
                        wind: 8,
                        pressure: 1008,
                        uvIndex: 3
                    },
                    { 
                        condition: 'rainy', 
                        icon: 'fas fa-cloud-rain', 
                        description: 'Light Rain', 
                        bg: 'linear-gradient(135deg, #81ecec 0%, #00b894 100%)',
                        temp: 15,
                        feelsLike: 13,
                        humidity: 85,
                        visibility: 8,
                        wind: 15,
                        pressure: 1005,
                        uvIndex: 1
                    },
                    { 
                        condition: 'stormy', 
                        icon: 'fas fa-bolt', 
                        description: 'Thunderstorm', 
                        bg: 'linear-gradient(135deg, #2d3436 0%, #000000 100%)',
                        temp: 22,
                        feelsLike: 20,
                        humidity: 90,
                        visibility: 5,
                        wind: 25,
                        pressure: 998,
                        uvIndex: 0
                    },
                    { 
                        condition: 'snowy', 
                        icon: 'fas fa-snowflake', 
                        description: 'Snow', 
                        bg: 'linear-gradient(135deg, #ddd6fe 0%, #a78bfa 100%)',
                        temp: -2,
                        feelsLike: -5,
                        humidity: 75,
                        visibility: 6,
                        wind: 10,
                        pressure: 1020,
                        uvIndex: 2
                    }
                ];

                // Simulate API call delay
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Get random weather condition
                const weather = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
                
                this.updateWeatherDisplay(weather);
                
            } catch (error) {
                console.error('Failed to load weather data:', error);
                this.showError();
            }
        }

        updateWeatherDisplay(weather) {
            const container = document.getElementById('weatherContainer');
            if (!container) return;

            // Update background
            container.style.background = weather.bg;

            // Update city info
            document.getElementById('cityName').textContent = this.currentLocation;
            document.getElementById('countryName').textContent = 'France';

            // Update main weather icon
            const mainIcon = document.getElementById('mainWeatherIcon');
            mainIcon.className = weather.icon;

            // Update temperature
            document.getElementById('temperature').textContent = `${weather.temp}°`;
            document.getElementById('feelsLike').textContent = `Feels like ${weather.feelsLike}°`;

            // Update weather condition
            document.getElementById('weatherCondition').textContent = weather.description;
            document.getElementById('humidity').textContent = `Humidity: ${weather.humidity}%`;

            // Update details
            document.getElementById('visibility').textContent = `${weather.visibility} km`;
            document.getElementById('windSpeed').textContent = `${weather.wind} km/h`;
            document.getElementById('pressure').textContent = `${weather.pressure} hPa`;
            document.getElementById('uvIndex').textContent = weather.uvIndex;

            // Update last updated time
            const now = new Date();
            document.getElementById('lastUpdated').textContent = 
                `Last updated: ${now.toLocaleTimeString()}`;
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

    // Make WeatherApp globally available
    window.WeatherApp = WeatherApp;
}
