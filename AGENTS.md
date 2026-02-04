# CLAUDE.md

This file provides guidance to AI when working with code in this repository.

## Project Overview

This is a Progressive Web App (PWA) called "Mangos" that helps users track their expenses by interpreting natural language input through AI and saving the data to Google Sheets.

## Architecture

The application follows a modular JavaScript structure with ES6 modules:

- `src/js/app.js` - Main application controller managing UI interactions and workflow
- `src/js/config.js` - Configuration manager using localStorage
- `src/js/auth.js` - Google OAuth2 authentication for Google Sheets API access
- `src/js/sheets.js` - Google Sheets API integration for reading/writing expense data
- `src/js/gemini.js` - Google Gemini API integration for natural language processing
- `src/js/openrouter.js` - Alternative AI provider integration (if present)
- `src/js/voice.js` - Voice recording and speech recognition functionality
- `src/js/utils.js` - Utility functions for UI elements like toasts and spinners
- `src/js/pull-to-refresh.js` - Pull-to-refresh functionality
- `index.html` - Main HTML structure with bento-style UI
- `src/styles.css` - Neo-minimalist styling with CSS variables
- `sw.js` - Service worker for PWA functionality
- `manifest.json` - PWA manifest configuration

## Common Development Tasks

### Running the Application

The application is a client-side PWA that runs directly in the browser:

1. Serve the project directory with any static file server
2. Open `index.html` in a browser
3. Configure settings through the UI (Google Sheet URL, API keys)

### Building and Testing

There is no build process - this is a pure client-side JavaScript application. Testing is done manually through browser developer tools.

### Authentication Flow

1. User authenticates with Google OAuth2
2. Access token is stored in localStorage
3. Token is used to access Google Sheets API
4. Automatic token refresh when nearing expiration

### Data Flow

1. User inputs expense via voice or text
2. AI (Gemini/OpenRouter) processes natural language into structured data
3. Data is displayed for user confirmation/editing
4. Confirmed data is saved to Google Sheets in predefined sections

### Expense Processing Logic

The app intelligently places expenses in a Google Sheet with this structure:
- Rows 20-54 are scanned for available slots
- Primary placement: Columns G-I ("FIJOS" section)
- Fallback placement: Columns K-L ("GASTOS EXTRA" section)

## Key Dependencies

- Google Identity Services for authentication
- Google Sheets API v4 for data storage
- Google Gemini API for natural language processing
- Browser-native SpeechRecognition API for voice input
- Lucide Icons for UI icons

## Configuration

Settings are managed through the UI and stored in localStorage:
- Google Sheet ID and sheet name
- AI provider selection (Gemini or OpenRouter)
- API keys for selected AI provider

## Styling Approach

The UI uses a "neo-minimalist bento" aesthetic with:
- CSS variables for consistent theming
- Smooth animations and transitions
- Glass-morphism effects
- Responsive design for mobile devices
- Custom loading states and micro-interactions
