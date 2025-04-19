# Windsurf Chess: AI vs AI Chess Platform

## Overview
Windsurf Chess is a web-based platform where AI models from different providers play chess against each other. This application allows users to configure various AI models, watch them compete, and review game history - all through a clean, modern interface built with HTML, JavaScript, and CSS.

## Features
- **AI vs AI Chess Gameplay**: Watch AI models battle each other in real-time
- **Multiple AI Provider Support**:
  - OpenAI (GPT-4.5-preview, GPT-4.1, GPT-4o)
  - OpenAI O-series (O3-mini-high, O4-mini) - with specialized API handling
  - xAI (Grok-3-latest, Grok-3-mini-beta)
  - Google Gemini (Gemini-2.5-pro-exp-03-25, Gemini-2.5-flash-preview-04-17, Gemini-2.0-flash-exp)
- **Configurable AI Settings**: Adjust temperature, token limits, streaming responses
- **Game History**: Save and replay past games
- **Streaming Responses**: View AI "thinking" in real-time
- **Robust Error Handling**: Automatic recovery from invalid moves and API errors
- **Responsive Design**: Works on desktop and mobile devices

## Architecture
The application follows a modular architecture with a clear separation of concerns:

### Core Components

#### JavaScript Files
- **ai-models.js**: Central hub for AI provider management and API routing
- **o-models.js**: Specialized module for OpenAI's O-series models (o3/o4)
- **game.js**: Manages game state, move validation, and retry logic
- **settings.js**: Handles player configuration and persistence
- **history.js**: Manages saving and replaying past games
- **main.js**: Coordinates UI updates and component interactions

#### Core Systems
- **Chess Engine**: A JavaScript chess engine to manage game state and validate moves
- **AI Interface Layer**: A provider-agnostic abstraction for AI communication
- **Provider-Specific Adapters**: Specialized code for each AI platform's unique API
- **Unified API Router**: Detects model types and routes to appropriate handlers

## API Integration Architecture

### Multi-Provider Support Structure
The application uses a sophisticated model routing system:

1. **Primary Provider Level**: `AI_MODELS` object in `ai-models.js` defines top-level providers (OpenAI, xAI, Gemini)
2. **Model Type Detection**: `callAIModel` function examines the selected model and routes to specialized handlers if needed
3. **Model-Specific Handlers**: For models with unique API structures (like O-series)
4. **Unified Response Format**: All handlers ultimately return a standardized `{move, thinking}` object

### OpenAI Integration Types
The application handles two distinct OpenAI API architectures:

#### Standard OpenAI Chat Models (GPT-4.1, GPT-4.5, etc.)
- Uses the classic chat completions API with `messages` array
- Processes responses with standard JSON structure
- Supports streaming via SSE chunks

#### O-Series Models (O3-mini, O4-mini)
- Uses the newer "reasoning" API format with different parameters
- Handles the `reasoning: { effort: "high" }` parameter
- Processes the unique response format with fields like `status`, `incomplete_details`, `output_text`
- Manages token exhaustion during reasoning with fallback mechanisms

### Move Validation and Retry Logic
Robust error handling with progressive enhancement:

1. **Basic Move Attempt**: Basic API call and move parsing
2. **Primary Retry**: Enhanced context with all legal moves provided
3. **Progressive Enhancement**: Increasing tokens and context on subsequent retries
4. **Token Handling**: Special retry paths for token exhaustion scenarios

## Setting Up the Application

### Prerequisites
- Web server for hosting static files (local development or production)
- API keys for the AI providers you want to use:
  - OpenAI: Requires API key starting with "sk-"
  - xAI: Requires API key starting with "xai-"
  - Google Gemini: Requires standard API key

### Installation
1. Clone or download this repository
2. Deploy the files to any static web server
3. Open the application in a web browser
4. Configure your AI providers and API keys in the Settings tab

No build step is required as the application uses vanilla HTML, CSS, and JavaScript.

### Development Setup
For local development, you can use any simple HTTP server:

**Using Python:**
```
python -m http.server
```

**Using Node.js (with http-server):**
```
npx http-server
```

Then access the application at `http://localhost:8000` (or whichever port your server uses).

## Adding New AI Models and Providers

### Adding a New Model to an Existing Provider

1. Open `js/ai-models.js`
2. Locate the provider's section in the `AI_MODELS` object
3. Add a new entry to the `models` array with the following properties:
   ```javascript
   { 
     id: "model-id-for-api", 
     name: "Display Name", 
     maxTokens: 4096, 
     streaming: true|false 
   }
   ```
4. The model will automatically appear in the dropdown when that provider is selected

### Adding a Model with a Different API Structure (like O-series)

1. **Determine if a new handler file is needed**: If the model uses a significantly different API structure
2. **Create a specialized handler file** (e.g., `new-model-type.js`) with these functions:
   - `isXModelType(modelId)` - Detection function
   - `generateXModelRequest(boardState, moveHistory, config)` - Request formatter
   - `parseXModelResponse(response, config)` - Response parser
   - `callXModel(boardState, moveHistory, config)` - Main handler
3. **Include the file in `index.html`** before `ai-models.js`
4. **Add routing logic in `callAIModel`**:
   ```javascript
   if (provider === 'providerName' && window.NewModelType && window.NewModelType.isXModelType(config.model)) {
     return await window.NewModelType.callXModel(boardState, moveHistory, config);
   }
   ```

### Adding a Completely New Provider

1. **Add the provider to the `AI_MODELS` object** in `ai-models.js`:
   ```javascript
   newProvider: {
     displayName: "New Provider Name",
     models: [
       { id: "model-1", name: "Model 1 Name", maxTokens: 2048, streaming: true },
       // Add more models as needed
     ],
     apiEndpoint: "https://api.newprovider.com/completions",
     authMethod: "Bearer", // or "APIKey", etc.
     
     // Request formatting function
     requestFormat: function(boardState, moveHistory, config) {
       // Format request according to provider's API specs
       return {
         method: "POST",
         headers: { /* appropriate headers */ },
         body: JSON.stringify({ /* request body */ })
       };
     },
     
     // Response parsing function
     parseResponse: async function(response, config) {
       // Parse response and extract move
       // Must return { move: "e4", thinking: "full response text" }
     }
   }
   ```

2. **Update the settings UI** in `settings.js` to recognize the new provider
3. **Test with various models** to ensure compatibility

### Common Challenges When Adding New Models

1. **Different API Parameters**: Model-specific variations like `max_tokens` vs `max_completion_tokens`
2. **Response Format Differences**: Some models use different JSON structures
3. **Token Management**: Models may have different token counting methods
4. **Rate Limits**: Provider-specific rate limiting needs custom handling
5. **Streaming Implementation**: Different streaming protocols for real-time responses

## Error Handling and Debugging

### API Error Detection
The application has robust error detection mechanisms:

1. **HTTP Error Handling**: Detects 4xx/5xx errors and extracts details
2. **Authentication Errors**: Special handling for 401 authentication failures
3. **Response Format Errors**: Detects and handles malformed responses
4. **Empty Move Handling**: Detects and retries when models return empty moves

### Debugging
Extensive debug logging is available in the console, categorized by system:

- `[AI Parse]`: Move extraction from AI responses
- `[AI Call]`: API request details with FEN notation
- `[Move Validation]`: Details on move validation attempts
- `[AI Response]`: Processed responses from models
- `[Invalid Move Debug]`: Detailed diagnostics for failed moves
- `[API Route]`: Information about API routing decisions
- `[O-API Response]`: O-series model specific responses
- `[Retry Strategy]`: Information about retry attempts

## Technical Implementation Details

### AI Provider Integration Strategy
The application uses a provider/model detection approach to customize requests:

1. **Central Router**: `callAIModel` in `ai-models.js` is the entry point
2. **Model Type Detection**: Inspects the model ID to determine handling approach
3. **Specialized Handlers**: Routes to specialized code for unique model types
4. **Fallback to Standard Handlers**: Uses generic handling for standard models

### Chess Move Validation Flow
1. **AI Response Parsing**: Extract move string from AI response
2. **Move Validation**: Check against chess.js legal moves
3. **First Retry Layer**: Provide legal moves list to AI
4. **Second Retry Layer**: Increase temperature and tokens
5. **Final Retry Layer**: Maximum context and detailed board description

## License
This project is available under the MIT License. See the LICENSE file for details.

## Acknowledgments
- Chess piece designs from [Lichess](https://lichess.org/)
- Chess rules implementation using [chess.js](https://github.com/jhlywa/chess.js)
- Chessboard UI using [chessboard.js](https://chessboardjs.com/)
# chessAI